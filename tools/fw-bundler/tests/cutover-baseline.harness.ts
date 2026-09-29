#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/cutover-baseline.harness.ts
/**
 * @fileoverview Cut-over baseline harness — capture / compare of fw's ORIGINAL
 * build-tool outputs, so the fw-tools cut-over (P2 · fw-tools-migration W1) can
 * be proven byte/semantic-equivalent before and after fw's scripts are rewired.
 *
 * WHY IT EXISTS
 *   fw currently runs its OWN in-tree tools (`bun tools/build/bundler/`,
 *   `bun tools/build/standalone/`, `bun tools/types/codegen/`,
 *   `bun tools/types/audit/`). W1 rewires the fw *package scripts* to invoke the
 *   mutualized `@awacloud/tool-fw-*` copies instead — WITHOUT changing the script
 *   NAMES. This harness invokes fw via those stable script names
 *   (`bun run <script>` from `packages/front/fw`), NEVER via hardcoded tool
 *   paths. That indirection is exactly what makes it replayable across the
 *   rewrite: the same `capture` command run before and after W1 exercises the
 *   originals then the rewired tools.
 *
 * FROZEN COMPARISON SEMANTICS — the § pointer
 *   The equivalence criteria are FROZEN by
 *     ai/plans/fw-tools-mutualization/spikes/w0-inventory/FINDINGS.md  §4
 *     (lines 253–288, "Safety-duplication + golden-compare METHOD").
 *   Per §4 "Equivalence criterion (per tool)":
 *     • bundle     (`build/bundler`)   → BYTE-identical `dist/build/*.min.js`
 *                                        + `*.meta.json`.
 *     • standalone (`build/standalone`)→ BYTE-identical emitted ESM for a fixed
 *                                        module set.
 *     • registry   (`types/codegen`)   → BYTE-identical `registry.generated.d.ts`.
 *     • audit      (`types/audit`)     → SEMANTIC: identical LOSSY/INFER/TYPED
 *                                        bucket membership (order-insensitive).
 *   §4's escape clause ("if any timestamp leaks, normalized before compare") is
 *   now satisfied by ABSENCE: after BL-697/BL-698 no timestamp leaks — no meta
 *   `builtAt`, no `// Built:` banner, no Bun `//# debugId=` trailer — so the
 *   two stamp normalizations were REMOVED rather than kept as excuses. The only
 *   capture-time transform left is a byte-image canonicalization of the meta
 *   JSON (2-space indent), symmetric on both sides.
 *
 * W1 REPLAY PROTOCOL (single sitting — W0 does NOT freeze bytes across waves)
 *   1. From the ORIGINALS (fw on its in-tree tools):
 *        bun tools/fw-bundler/tests/cutover-baseline.harness.ts capture \
 *          --out tmp/cutover-baseline/original --scripts original
 *   2. Apply W1's fw-script rewrite (scripts now call `bun cli.ts fw-bundler …`).
 *   3. From the REWIRED scripts, re-capture in the SAME sitting:
 *        … capture --out tmp/cutover-baseline/rewired --scripts rewired
 *   4. Compare:
 *        … compare tmp/cutover-baseline/original tmp/cutover-baseline/rewired
 *      All-PASS (exit 0) is the cut-over gate. Bytes are NOT carried across
 *      waves — fw's tree evolves, so the two captures MUST be taken in one
 *      sitting against the same source state.
 *
 * W0 PROOF RUN (byte-idempotence)
 *   Capture twice against the current originals into two dirs, then compare:
 *   must be all-PASS. This catches unnormalized non-determinism NOW rather than
 *   during W1.
 *
 * CONTRACT (ai/conventions/tool.md exit codes)
 *   exit 0 = every criterion PASS · exit 1 = any FAIL · exit 2 = usage error.
 *
 * HARD CONSTRAINT: this harness NEVER edits fw source or manifest. It only runs
 * fw scripts. `types:registry` rewrites a tracked file; the harness git-restores
 * it so the working tree is left clean.
 */

import {
    existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync,
} from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const HARNESS_VERSION = 1;

const HERE = import.meta.dir; // tools/fw-bundler/tests
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const FW_ROOT = join(REPO_ROOT, 'packages', 'front', 'fw');
const DEFAULT_CAPTURE_BASE = join(REPO_ROOT, 'tmp', 'cutover-baseline');

// The three preset builds captured for the `bundle` criterion (§4). Fixed set
// per the plan; the script NAMES are read back from fw's package.json so a
// missing script surfaces instead of silently capturing nothing.
const BUNDLE_SCRIPTS = ['prebuild:minimal', 'prebuild:core', 'prebuild:site'];

// BL-697 / BL-698 (D35(b)): the bundler's emitted artifacts carry NO build
// stamp any more — no meta `builtAt`, no `// Built:` banner, no Bun
// `//# debugId=` trailer. The §4 clause "if any timestamp leaks, normalized
// before compare" is therefore satisfied by ABSENCE, not by neutralization:
// both stamp normalizations are gone, so a resurrected stamp now FAILS the
// compare instead of being silently excused. Recorded in every capture
// manifest so an old capture is distinguishable from a new one.
const META_BUILT_AT_NORMALIZATION = 'none — BL-697: emitted meta carries no builtAt';
const STANDALONE_BUILT_NORMALIZATION = 'none — BL-697: emitted ESM carries no `// Built:` banner';

const CRITERIA = /** @type {const} */ (['bundle', 'standalone', 'registry', 'audit']);

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested via the sibling .test.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** SHA-256 hex of a buffer/string. */
export function sha256(data: Uint8Array | string): string {
    return createHash('sha256').update(data).digest('hex');
}

/**
 * Canonicalize a bundler `*.meta.json` text to a stable byte image (2-space
 * indent, trailing newline) so two captures compare on CONTENT, not on
 * incidental formatting.
 *
 * It NO LONGER neutralizes a `builtAt` timestamp: the bundler stopped emitting
 * one (BL-697), so a `builtAt` appearing in a capture is a REGRESSION and must
 * make the compare FAIL. Two metas differing only in `builtAt` consequently no
 * longer normalize equal — pinned in the sibling `.test.ts`.
 */
export function normalizeMeta(text: string): string {
    return JSON.stringify(JSON.parse(text), null, 2) + '\n';
}

/**
 * Parse `types/audit` stdout into normalized, order-insensitive buckets.
 *
 * The audit tool prints per-module rows for LOSSY / INLINE / INFER, plus a
 * summary count line per bucket (TYPED members are NOT printed — only counted).
 * We therefore capture the parseable name SETS (sorted) plus every bucket COUNT
 * (so a TYPED-set change is still caught by its count). §4 compares by bucket
 * membership, order-insensitive — so the sets are sorted here and set-compared
 * at compare time (never byte-compared).
 */
export function parseAudit(stdout: string): {
    counts: Record<string, number>;
    sets: Record<string, string[]>;
} {
    const lines = stdout.split(/\r?\n/);
    const counts: Record<string, number> = {};
    const sets: Record<string, string[]> = { lossy: [], inline: [], infer: [] };

    const totalM = stdout.match(/audit\s+—\s+(\d+)\s+modules/);
    if (totalM) counts.total = Number(totalM[1]);

    const bucketOf = (kw: string) => kw.toLowerCase();

    let section: string | null = null;
    for (const raw of lines) {
        // Summary count lines, e.g. "  LOSSY  (wide @returns)  : 0  ← …"
        const cm = raw.match(/^\s*(TYPED|INLINE|INFER|LOSSY)\b[^:]*:\s*(\d+)/);
        if (cm) {
            counts[bucketOf(cm[1])] = Number(cm[2]);
            continue;
        }
        // Section header, e.g. "── LOSSY — fix these …"
        const hm = raw.match(/^──\s*(LOSSY|INLINE|INFER)\b/);
        if (hm) { section = bucketOf(hm[1]); continue; }
        if (section) {
            if (raw.trim() === '') { section = null; continue; }
            // Table row: "  <name>  deps: N  …". First token is the module name.
            const name = raw.trim().split(/\s+/)[0];
            if (name) sets[section].push(name);
        }
    }
    for (const k of Object.keys(sets)) sets[k] = [...sets[k]].sort();
    return { counts, sets };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest / capture-dir shape
// ─────────────────────────────────────────────────────────────────────────────

interface FileRec { name: string; sha256: string }
interface Manifest {
    harness: 'cutover-baseline';
    version: number;
    capturedAt: string;            // informational only — never compared
    scripts: 'original' | 'rewired';
    fwPkgRoot: string;
    normalization: { metaBuiltAt: string; standaloneBuilt: string };
    artifacts: {
        bundle: { scripts: string[]; files: FileRec[] };
        standalone: { modules: string[]; files: FileRec[] };
        registry: { files: FileRec[] };
        audit: { sha256: string; counts: Record<string, number>; sets: Record<string, string[]> };
    };
}

export function readManifest(dir: string): Manifest {
    const p = join(dir, 'manifest.json');
    if (!existsSync(p)) throw new Error(`no manifest.json in ${dir}`);
    return JSON.parse(readFileSync(p, 'utf8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Script running (fw package scripts only — never hardcoded tool paths)
// ─────────────────────────────────────────────────────────────────────────────

function runFwScript(script: string): { stdout: string; stderr: string; code: number } {
    const proc = Bun.spawnSync(['bun', 'run', script], {
        cwd: FW_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env },
    });
    return {
        stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
        stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
        code: proc.exitCode ?? -1,
    };
}

/** git-restore a single tracked file that a capture step regenerated. */
function gitRestore(relPathFromFw: string): void {
    Bun.spawnSync(['git', 'restore', '--', relPathFromFw], {
        cwd: FW_ROOT, stdout: 'pipe', stderr: 'pipe',
    });
}

/**
 * Read the module set the `build:standalone` script currently targets, straight
 * from fw's package.json (the plan mandates: "read the set … do not hardcode").
 * Today the script is a bare `bun tools/build/standalone/` with NO positional
 * module → the set is empty and the standalone leg captures nothing. When W1's
 * rewrite gives the script positional module names, they are picked up here.
 */
function standaloneModulesFromPkg(pkg: any): string[] {
    const script: string = pkg.scripts?.['build:standalone'] ?? '';
    const toks = script.trim().split(/\s+/);
    // Anchor module extraction on the `standalone` tool-path / CLI-subcommand
    // token, so positionals are read identically for BOTH invocation forms:
    //   • original in-tree : `bun tools/build/standalone/ <mods…>`
    //   • rewired CLI       : `bun ../../../cli.ts fw-bundler standalone <mods…>`
    // Everything up to and INCLUDING that token is the invocation prefix
    // (runner / cli entry / tool selector / subcommand), never a module. The
    // previous "skip first 2 tokens" heuristic assumed the 2-token
    // `bun <toolpath>` prefix and mis-read the 4-token CLI prefix's `fw-bundler`
    // selector as a module. Behaviour-preserving for the original form (bare →
    // []); fixes the rewired bare form (was ["fw-bundler"] → now []). Capture-
    // time input derivation only — the frozen §4 compare semantics are untouched.
    let start = -1;
    for (let i = toks.length - 1; i >= 0; i--) {
        if (/standalone\/?$/.test(toks[i])) { start = i + 1; break; }
    }
    const mods: string[] = [];
    if (start < 0) return mods;
    for (let i = start; i < toks.length; i++) {
        const t = toks[i];
        if (t.startsWith('--')) {
            // --out / --endpoint / --pkg consume a following value; booleans don't.
            if (t === '--out' || t === '--endpoint' || t === '--pkg') i++;
            continue;
        }
        if (t.includes('/')) continue;       // stray path token, never a module
        mods.push(t);
    }
    return mods;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture
// ─────────────────────────────────────────────────────────────────────────────

function collect(dir: string, predicate: (f: string) => boolean): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(predicate).sort();
}

function writeArtifact(outDir: string, sub: string, name: string, bytes: string): FileRec {
    const d = join(outDir, sub);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, name), bytes, 'utf8');
    return { name, sha256: sha256(bytes) };
}

export function capture(opts: { out: string; scripts: 'original' | 'rewired' }): {
    outDir: string; manifest: Manifest; log: string[];
} {
    const { out: outDir, scripts } = opts;
    const log: string[] = [];
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const pkg = JSON.parse(readFileSync(join(FW_ROOT, 'package.json'), 'utf8'));

    // ── bundle: run the three preset builds, then snapshot dist/build ──
    for (const s of BUNDLE_SCRIPTS) {
        if (!pkg.scripts?.[s]) throw new Error(`fw package.json is missing script "${s}"`);
        const r = runFwScript(s);
        if (r.code !== 0) {
            throw new Error(`fw script "${s}" failed (exit ${r.code}):\n${r.stderr || r.stdout}`);
        }
        log.push(`bundle: ran ${s} (exit 0)`);
    }
    const buildDir = join(FW_ROOT, 'dist', 'build');
    const bundleFiles: FileRec[] = [];
    for (const f of collect(buildDir, (n) => n.endsWith('.min.js'))) {
        bundleFiles.push(writeArtifact(outDir, 'bundle', f, readFileSync(join(buildDir, f), 'utf8')));
    }
    for (const f of collect(buildDir, (n) => n.endsWith('.meta.json'))) {
        const norm = normalizeMeta(readFileSync(join(buildDir, f), 'utf8'));
        bundleFiles.push(writeArtifact(outDir, 'bundle', f, norm));
    }
    log.push(`bundle: captured ${bundleFiles.length} artifact(s) (min.js + normalized meta.json)`);

    // ── standalone: only if the fw script targets a module set ──
    const standaloneModules = standaloneModulesFromPkg(pkg);
    const standaloneFiles: FileRec[] = [];
    if (standaloneModules.length > 0) {
        const r = runFwScript('build:standalone');
        if (r.code !== 0) {
            throw new Error(`fw script "build:standalone" failed (exit ${r.code}):\n${r.stderr || r.stdout}`);
        }
        const saDir = join(FW_ROOT, 'dist', 'standalone');
        for (const f of collect(saDir, (n) => n.endsWith('.js'))) {
            // Captured RAW — the emitted ESM carries no banner to neutralize
            // (BL-697), so any byte difference is a real divergence.
            standaloneFiles.push(writeArtifact(outDir, 'standalone', f, readFileSync(join(saDir, f), 'utf8')));
        }
        log.push(`standalone: captured ${standaloneFiles.length} ESM artifact(s) for [${standaloneModules.join(', ')}]`);
    } else {
        log.push('standalone: fw script targets NO module set (bare `bun tools/build/standalone/`) — 0 artifacts');
    }

    // ── registry: run types:registry, snapshot the file, git-restore it ──
    const rReg = runFwScript('types:registry');
    if (rReg.code !== 0) {
        throw new Error(`fw script "types:registry" failed (exit ${rReg.code}):\n${rReg.stderr || rReg.stdout}`);
    }
    const registryRel = join('types', 'registry.generated.d.ts');
    const registryAbs = join(FW_ROOT, registryRel);
    const registryFiles: FileRec[] = [];
    if (existsSync(registryAbs)) {
        registryFiles.push(writeArtifact(
            outDir, 'registry', 'registry.generated.d.ts',
            readFileSync(registryAbs, 'utf8'),
        ));
    }
    gitRestore('types/registry.generated.d.ts'); // leave the tree clean
    log.push(`registry: captured ${registryFiles.length} artifact(s), tree restored`);

    // ── audit: run types:audit, parse stdout into normalized buckets ──
    const rAud = runFwScript('types:audit');
    if (rAud.code !== 0) {
        throw new Error(`fw script "types:audit" failed (exit ${rAud.code}):\n${rAud.stderr || rAud.stdout}`);
    }
    const audit = parseAudit(rAud.stdout);
    const auditJson = JSON.stringify(audit, null, 2) + '\n';
    mkdirSync(join(outDir, 'audit'), { recursive: true });
    writeFileSync(join(outDir, 'audit', 'audit.normalized.json'), auditJson, 'utf8');
    log.push(`audit: total=${audit.counts.total} lossy=${audit.counts.lossy} inline=${audit.counts.inline} infer=${audit.counts.infer} typed=${audit.counts.typed}`);

    const manifest: Manifest = {
        harness: 'cutover-baseline',
        version: HARNESS_VERSION,
        capturedAt: new Date().toISOString(),
        scripts,
        fwPkgRoot: 'packages/front/fw',
        normalization: {
            metaBuiltAt: META_BUILT_AT_NORMALIZATION,
            standaloneBuilt: STANDALONE_BUILT_NORMALIZATION,
        },
        artifacts: {
            bundle: { scripts: BUNDLE_SCRIPTS, files: bundleFiles },
            standalone: { modules: standaloneModules, files: standaloneFiles },
            registry: { files: registryFiles },
            audit: { sha256: sha256(auditJson), counts: audit.counts, sets: audit.sets },
        },
    };
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return { outDir, manifest, log };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare (§4 semantics)
// ─────────────────────────────────────────────────────────────────────────────

interface CriterionResult { name: string; pass: boolean; detail: string }

function sameSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    for (const x of b) if (!sa.has(x)) return false;
    return true;
}

/** Byte-compare a named artifact list across two capture dirs. */
function compareBytes(
    dirA: string, dirB: string, sub: string, filesA: FileRec[], filesB: FileRec[],
): { pass: boolean; detail: string } {
    const namesA = filesA.map((f) => f.name);
    const namesB = filesB.map((f) => f.name);
    const onlyA = namesA.filter((n) => !namesB.includes(n));
    const onlyB = namesB.filter((n) => !namesA.includes(n));
    if (onlyA.length || onlyB.length) {
        const parts: string[] = [];
        if (onlyA.length) parts.push(`missing in B: ${onlyA.join(', ')}`);
        if (onlyB.length) parts.push(`missing in A: ${onlyB.join(', ')}`);
        return { pass: false, detail: parts.join('; ') };
    }
    const diffs: string[] = [];
    const missing: string[] = [];
    for (const name of namesA) {
        const pa = join(dirA, sub, name);
        const pb = join(dirB, sub, name);
        if (!existsSync(pa) || !existsSync(pb)) {
            missing.push(name);
            continue;
        }
        const ba = readFileSync(pa);
        const bb = readFileSync(pb);
        if (!ba.equals(bb)) diffs.push(name);
    }
    if (missing.length) return { pass: false, detail: `missing artifact file(s) on disk: ${missing.join(', ')}` };
    if (diffs.length) return { pass: false, detail: `byte-diff: ${diffs.join(', ')}` };
    return { pass: true, detail: `${namesA.length} artifact(s) byte-identical` };
}

export function compareCaptures(dirA: string, dirB: string): {
    overall: boolean; criteria: CriterionResult[];
} {
    const ma = readManifest(dirA);
    const mb = readManifest(dirB);
    const criteria: CriterionResult[] = [];

    // bundle
    {
        const r = compareBytes(dirA, dirB, 'bundle', ma.artifacts.bundle.files, mb.artifacts.bundle.files);
        criteria.push({ name: 'bundle', ...r });
    }
    // standalone
    {
        const sa = ma.artifacts.standalone;
        const sb = mb.artifacts.standalone;
        if (!sameSet(sa.modules, sb.modules)) {
            criteria.push({ name: 'standalone', pass: false, detail: `module set differs: [${sa.modules.join(', ')}] vs [${sb.modules.join(', ')}]` });
        } else if (sa.files.length === 0 && sb.files.length === 0) {
            criteria.push({ name: 'standalone', pass: true, detail: '0 artifacts (fw script targets no module set)' });
        } else {
            const r = compareBytes(dirA, dirB, 'standalone', sa.files, sb.files);
            criteria.push({ name: 'standalone', ...r });
        }
    }
    // registry
    {
        const r = compareBytes(dirA, dirB, 'registry', ma.artifacts.registry.files, mb.artifacts.registry.files);
        criteria.push({ name: 'registry', ...r });
    }
    // audit — semantic, order-insensitive set + count equality (never byte)
    {
        const aa = ma.artifacts.audit;
        const ab = mb.artifacts.audit;
        const countKeys = new Set([...Object.keys(aa.counts), ...Object.keys(ab.counts)]);
        const countDiffs: string[] = [];
        for (const k of countKeys) if (aa.counts[k] !== ab.counts[k]) countDiffs.push(`${k}(${aa.counts[k]}≠${ab.counts[k]})`);
        const setKeys = new Set([...Object.keys(aa.sets), ...Object.keys(ab.sets)]);
        const setDiffs: string[] = [];
        for (const k of setKeys) if (!sameSet(aa.sets[k] ?? [], ab.sets[k] ?? [])) setDiffs.push(k);
        if (countDiffs.length || setDiffs.length) {
            const parts: string[] = [];
            if (countDiffs.length) parts.push(`counts: ${countDiffs.join(', ')}`);
            if (setDiffs.length) parts.push(`membership: ${setDiffs.join(', ')}`);
            criteria.push({ name: 'audit', pass: false, detail: parts.join('; ') });
        } else {
            criteria.push({ name: 'audit', pass: true, detail: `sets+counts equal (total ${aa.counts.total})` });
        }
    }

    return { overall: criteria.every((c) => c.pass), criteria };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const USAGE =
    'Usage:\n' +
    '  bun tools/fw-bundler/tests/cutover-baseline.harness.ts capture [--out <dir>] [--scripts <original|rewired>]\n' +
    '  bun tools/fw-bundler/tests/cutover-baseline.harness.ts compare <dirA> <dirB>\n' +
    '\n' +
    'Exit: 0 all criteria PASS · 1 any FAIL · 2 usage error.';

function printTable(criteria: CriterionResult[], overall: boolean): void {
    const w = Math.max(9, ...criteria.map((c) => c.name.length));
    const pad = (s: string) => s + ' '.repeat(w - s.length);
    console.log('');
    console.log(`${pad('criterion')}  result  detail`);
    console.log(`${'─'.repeat(w)}  ──────  ${'─'.repeat(40)}`);
    for (const c of criteria) console.log(`${pad(c.name)}  ${c.pass ? 'PASS' : 'FAIL'}    ${c.detail}`);
    console.log(`${'─'.repeat(w)}  ──────`);
    console.log(`${pad('OVERALL')}  ${overall ? 'PASS' : 'FAIL'}`);
    console.log('');
}

function main(argv: string[]): number {
    if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return 0; }
    const sub = argv[0];

    if (sub === 'capture') {
        let out: string | null = null;
        let scripts: 'original' | 'rewired' = 'original';
        for (let i = 1; i < argv.length; i++) {
            const a = argv[i];
            if (a === '--out') out = argv[++i] ?? null;
            else if (a === '--scripts') {
                const v = argv[++i];
                if (v !== 'original' && v !== 'rewired') { console.error(`[cutover] --scripts must be original|rewired (got ${v})`); return 2; }
                scripts = v;
            } else { console.error(`[cutover] unknown capture arg: ${a}`); return 2; }
        }
        const outDir = out ? resolve(REPO_ROOT, out) : join(DEFAULT_CAPTURE_BASE, scripts);
        const res = capture({ out: outDir, scripts });
        for (const l of res.log) console.log(`[cutover] ${l}`);
        console.log(`[cutover] capture written to ${res.outDir} (scripts=${scripts})`);
        return 0;
    }

    if (sub === 'compare') {
        const positionals = argv.slice(1).filter((a) => !a.startsWith('--'));
        if (positionals.length !== 2) { console.error('[cutover] compare needs exactly two capture dirs'); console.error(USAGE); return 2; }
        const [a, b] = positionals.map((p) => resolve(REPO_ROOT, p));
        if (!existsSync(a)) { console.error(`[cutover] no such capture dir: ${a}`); return 2; }
        if (!existsSync(b)) { console.error(`[cutover] no such capture dir: ${b}`); return 2; }
        let result;
        try { result = compareCaptures(a, b); }
        catch (err: any) { console.error(`[cutover] compare error: ${err.message}`); return 2; }
        console.log(`[cutover] compare  A=${basename(a)}  B=${basename(b)}`);
        printTable(result.criteria, result.overall);
        return result.overall ? 0 : 1;
    }

    console.error(`[cutover] unknown subcommand: ${sub ?? '(none)'}`);
    console.error(USAGE);
    return 2;
}

if (import.meta.main) {
    process.exit(main(process.argv.slice(2)));
}
