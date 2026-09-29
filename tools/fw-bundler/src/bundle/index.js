#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/index.js
/**
 * @fileoverview Build orchestrator — autonomous-mode fw bundles. Ported
 * logic-verbatim from `packages/front/fw/tools/build/bundler/index.js`; the
 * only adaptation is the path-resolution seam — every fw-relative default now
 * derives from `PKG_ROOT = --pkg ?? cwd` instead of the tool's own location.
 * fw's build scripts run at the fw package root, so the cwd default keeps fw
 * green.
 *
 * Pipeline (single pass) :
 *   1. Load `fw.config.json` and scan `src/` (one source-tree walk).
 *   2. Validate the deps invariant + modules.js consistency.
 *   3. (non-dev) Mirror `src/` to `dist/_tmp/_src/` with dev_only blocks
 *      stripped — bundles use the mirror so production artefacts never embed
 *      dev-only code.
 *   4. Build the sanity bundle (unless `--no-sanity`).
 *   5. Copy declared binary assets (`brotli_dict.bin`, …).
 *   6. For every selected preset × variant : generate an entry file from
 *      scratch and pipe it through `Bun.build`.
 *   7. For every side-bundle × variant : same pattern.
 *
 * Inputs : `<PKG_ROOT>/fw.config.json` + CLI flags. No regex surgery on
 * `src/main.js` — the entry is generated from scratch by `entry-gen.js`.
 */

import {
    existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, renameSync,
    copyFileSync, statSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';

import { loadConfig, injectFullPreset } from './lib/config.js';
import { validateAll } from './lib/validate-deps.js';
import { generatePresetEntry, generateSideBundleEntry } from './lib/entry-gen.js';
import { stripDevDir } from './lib/strip-dev.js';
import { buildOne, buildClassical, setBackend, setPkgRoot, activeBackendName } from './lib/bundler.js';
import { renderBanner, loadBannerFile, applyBanner } from './lib/banner.js';
import { scanAll } from '../modlib/scan-modules.js';
import { printHelp, wantsHelp, isMainModule } from '../modlib/cli-help.js';

// ─── Path-resolution seam ───
// These derive from `PKG_ROOT = --pkg ?? cwd`, assigned by `resolvePkgPaths`
// at the start of `runBundle`. Declared as module-level bindings so the
// (logic-verbatim) helper functions below reference them by the same names as
// the fw original.
let PKG_ROOT, SRC_DIR, DIST_DIR, OUT_DIR, TMP_DIR, SANITIZED_SRC_DIR, MODULES_SRC, SANITY_DIR;

// Rendered legal-comment banner for this run (`--banner-file` / `opts.banner`),
// or null. Set by `runBundle`; null keeps every emitted byte unchanged.
let BANNER = null;

/**
 * Post-minify banner step: when a banner was requested, write it at byte 0 of
 * `file` and return the FINAL bytes' measurements; otherwise return `res`
 * untouched (no read, no write — omitted = byte-identical).
 * @param {string} file
 * @param {{ bytes: number, hashSha256: string, gzBytes: number }} res
 */
function finalize(file, res) {
    if (BANNER === null) return res;
    return { ...res, ...applyBanner(file, BANNER, activeBackendName()) };
}

function resolvePkgPaths(pkgRoot) {
    PKG_ROOT = pkgRoot;
    SRC_DIR = resolve(PKG_ROOT, 'src');
    DIST_DIR = resolve(PKG_ROOT, 'dist');
    OUT_DIR = resolve(DIST_DIR, 'build');
    TMP_DIR = resolve(DIST_DIR, '_tmp');
    SANITIZED_SRC_DIR = resolve(TMP_DIR, '_src');
    MODULES_SRC = resolve(SRC_DIR, 'core/modules.js');
    SANITY_DIR = resolve(SRC_DIR, 'sanity');
}

const BINARY_ASSETS = [
    'io/compress/brotli_dict.bin',
];

// ─── CLI ───
const HELP_USAGE = 'bun cli.ts fw-bundler bundle [target] [flags]';
const HELP_FLAGS = [
    ['[target]', 'Preset name, side-bundle name, or "all" (default). Use "presets" / "side-bundles" to filter by kind.'],
    ['--dev', 'Build dev variant — keep dev_only blocks, ENV.DEV=true.'],
    ['--no-log', 'Disable runtime log (ENV.LOG=false).'],
    ['--no-sanity', 'Skip the sanity bundle.'],
    ['--sanity-only', 'Build only sanity.min.js.'],
    ['--no-sanity-log', 'Patch sanity LOG_ATTEMPTS=false in the bundle.'],
    ['--config <path>', 'Override the path to fw.config.json.'],
    ['--classic', 'Force-emit the classic variant for every built target (union with config variants).'],
    ['--endpoint <name>', 'Global property name for the classic variant (overrides config; default "fw").'],
    ['--backend <name>', 'Build backend: "bun" (default under bun), "esbuild" or "rollup" (Node-capable). Auto-selected when omitted.'],
    ['--pkg <dir>', 'Package root to build (default: cwd). Resolves src/, dist/, fw.config.json under it.'],
    ['--banner-file <path>', 'Opt-in: plain-text file whose lines are written as ONE legal comment (/*! ... */) at byte 0 of every emitted JS bundle, AFTER minification (no minifier setting can strip it). Deterministic; *.meta.json sizes/hashes cover the final bytes. Omitted = output unchanged.'],
    ['--help, -h', 'Show this help.'],
];
const HELP_EXAMPLES = [
    'bun cli.ts fw-bundler bundle',
    'bun cli.ts fw-bundler bundle site',
    'bun cli.ts fw-bundler bundle presets --dev',
    'bun cli.ts fw-bundler bundle crypto-basic --pkg packages/front/fw',
    'bun cli.ts fw-bundler bundle --pkg packages/front/fw --banner-file tmp/licence-banner.txt',
];

export function parseArgs(argv) {
    const opts = {
        target: 'all',
        dev: false, log: true,
        sanity: true, sanityOnly: false, sanityLog: true,
        configPath: null,
        endpoint: null,
        classic: false,
        backend: null,
        pkg: null,
        bannerFile: null,
        // Programmatic-only twin of --banner-file: the banner TEXT itself.
        banner: null,
    };
    let positionalSeen = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dev') opts.dev = true;
        else if (a === '--no-log') opts.log = false;
        else if (a === '--no-sanity') opts.sanity = false;
        else if (a === '--sanity-only') opts.sanityOnly = true;
        else if (a === '--no-sanity-log') opts.sanityLog = false;
        else if (a === '--config') opts.configPath = argv[++i];
        else if (a === '--endpoint') opts.endpoint = argv[++i];
        else if (a === '--classic') opts.classic = true;
        else if (a === '--backend') opts.backend = argv[++i];
        else if (a === '--pkg') opts.pkg = argv[++i];
        else if (a === '--banner-file') {
            const v = argv[++i];
            if (v === undefined || v === '' || v.startsWith('--')) throw new Error('--banner-file requires a <path>');
            opts.bannerFile = v;
        }
        else if (a === '--help' || a === '-h') { opts._help = true; return opts; }
        else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}. Run with --help.`);
        else {
            if (positionalSeen) throw new Error(`Unexpected positional argument: ${a}`);
            opts.target = a;
            positionalSeen = true;
        }
    }
    if (opts.endpoint !== null && !/^[A-Za-z_$][\w$]*$/.test(opts.endpoint)) {
        throw new Error(`--endpoint must be a valid JS identifier (got ${JSON.stringify(opts.endpoint)})`);
    }
    if (opts.backend !== null && !['bun', 'esbuild', 'rollup'].includes(opts.backend)) {
        throw new Error(`--backend must be "bun", "esbuild" or "rollup" (got ${JSON.stringify(opts.backend)})`);
    }
    return opts;
}

// ─── Helpers ───
function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ensureCleanDirs() {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    mkdirSync(TMP_DIR, { recursive: true });
}

function cleanupTmp() {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
}

function renameOutput(srcPath, finalName) {
    const dst = join(dirname(srcPath), finalName);
    if (srcPath !== dst) {
        if (existsSync(dst)) rmSync(dst, { force: true });
        renameSync(srcPath, dst);
        const map = `${srcPath}.map`;
        if (existsSync(map)) {
            const dstMap = `${dst}.map`;
            if (existsSync(dstMap)) rmSync(dstMap, { force: true });
            renameSync(map, dstMap);
        }
    }
    return dst;
}

/**
 * Emit the trio (min.js, .js, meta.json) for a single entry.
 * `kind` is `'preset'` or `'pack'` → controls the file basename prefix.
 *
 * DETERMINISM (BL-697 / BL-698, D35(b)) — the emitted artifacts carry NO
 * build stamp:
 *   - the meta has no `builtAt` field (no consumer ever read it; omission is
 *     the fix, mirroring the graphic `generate-bundles.mjs` precedent), and
 *   - `sourcemap: 'none'` is passed explicitly so Bun stops appending its
 *     path-derived `//# debugId=` trailer to the emitted bytes. The trailer is
 *     the ONLY link between a bundle and its `.map` (Bun emits no
 *     `sourceMappingURL` comment), so stripping it post-build would leave
 *     unusable orphan maps — disabling the option is the honest mechanism, and
 *     it is the same one applied at the `standalone` minify site.
 * Residual, deliberately unfixed under D35(b): Bun's minifier allocates
 * identifiers path-dependently, so two builds from DIFFERENT directories can
 * still differ inside `*.min.js`. Reproducibility is PATH-SCOPED.
 */
async function emitBundle({ entry, kind, name, variant, metaExtra }) {
    const suffix = variant === 'pure' ? '.pure' : '';
    const baseName = kind === 'preset' ? name : `pack.${name}`;

    const minBuilt = await buildOne({ entry, outdir: OUT_DIR, minify: true, sourcemap: 'none' });
    const minFinal = renameOutput(minBuilt.outFile, `fw.${baseName}${suffix}.min.js`);
    // Banner (opt-in) goes on AFTER minification; the meta below is computed
    // on the final bytes.
    const minRes = finalize(minFinal, minBuilt);

    const devBuilt = await buildOne({ entry, outdir: OUT_DIR, minify: false, sourcemap: 'none' });
    const devFinal = renameOutput(devBuilt.outFile, `fw.${baseName}${suffix}.js`);
    const devRes = finalize(devFinal, devBuilt);

    const meta = {
        ...metaExtra,
        kind, name, variant,
        bytes: {
            min: minRes.bytes, minGz: minRes.gzBytes,
            dev: devRes.bytes, devGz: devRes.gzBytes,
        },
        hashSha256: { min: minRes.hashSha256, dev: devRes.hashSha256 },
    };
    writeFileSync(
        resolve(OUT_DIR, `fw.${baseName}${suffix}.meta.json`),
        JSON.stringify(meta, null, 2),
        'utf8',
    );

    return { minRes, devRes, minFinal, devFinal };
}

// ─── Preset build ───
async function buildPreset(preset, catalog, srcRoot, opts, variant) {
    const tmp = resolve(TMP_DIR, `preset.${preset.name}.${variant}`);
    const entry = resolve(tmp, 'entry.js');
    const endpoint = opts.endpoint || preset.endpoint || 'fw';

    generatePresetEntry({
        moduleList: preset.modules,
        catalog,
        srcRoot,
        outFile: entry,
        env: { DEV: opts.dev, LOG: opts.log },
        variant,
        endpoint,
    });

    const { minRes } = await emitBundle({
        entry,
        kind: 'preset',
        name: preset.name,
        variant,
        metaExtra: {
            description: preset.description,
            modules: preset.modules,
            env: { DEV: opts.dev, LOG: opts.log },
            endpoint: variant === 'classic' ? endpoint : undefined,
        },
    });

    return {
        target: `preset:${preset.name} (${variant})`,
        moduleCount: preset.modules.length,
        minBytes: minRes.bytes,
        minGz: minRes.gzBytes,
    };
}

// ─── Side-bundle build ───
async function buildSideBundle(sideBundle, catalog, srcRoot, opts, variant) {
    if (sideBundle.modules.length === 0) return null;

    const tmp = resolve(TMP_DIR, `pack.${sideBundle.name}.${variant}`);
    const entry = resolve(tmp, 'entry.js');
    const endpoint = opts.endpoint || sideBundle.endpoint || 'fw';

    generateSideBundleEntry({
        name: sideBundle.name,
        moduleList: sideBundle.modules,
        catalog,
        srcRoot,
        outFile: entry,
        variant,
        endpoint,
    });

    const { minRes } = await emitBundle({
        entry,
        kind: 'pack',
        name: sideBundle.name,
        variant,
        metaExtra: {
            description: sideBundle.description,
            modules: sideBundle.modules,
            endpoint: variant === 'classic' ? endpoint : undefined,
        },
    });

    return {
        target: `pack:${sideBundle.name} (${variant})`,
        moduleCount: sideBundle.modules.length,
        minBytes: minRes.bytes,
        minGz: minRes.gzBytes,
    };
}

// ─── Sanity ───
// R1b recipe (ai/plans/fw-sanity/spikes/w0-module-mode/FINDINGS.md, "frozen
// outputs" §2): src/sanity/<tier>.js stays the single committed ESM source
// per tier (exports apply<Tier>()) — nothing is ever written under src/, only
// into dist/_tmp/ (a patched nolog copy) and dist/build/ (the emitted
// classic artifacts). The generated entry imports the export and calls it,
// so the classic <script> artifact self-applies on load with no import/
// export of its own (a bare exporting ESM entry would leak `export{...}`
// into the "classic" bundle while the build still reports success).
const SANITY_TIERS = ['base', 'community'];

// Anchored to a whole line + match-count-asserted: a non-anchored whole-file
// String.replace can silently rewrite the FIRST textual occurrence anywhere —
// including a comment or doc string that only MENTIONS the declaration — and
// still report success (FINDINGS §c.2 measured trap).
const LOG_ATTEMPTS_DECL = /^const\s+LOG_ATTEMPTS\s*=\s*true\s*;$/m;

function applyFnName(tier) {
    return `apply${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

/**
 * Build one sanity tier's classic-`<script>` artifact.
 * @param {string} tier          'base' | 'community'
 * @param {{logAttempts: boolean}} opts
 * @returns {Promise<{ outputs: string[], outFile: string, bytes: number, hashSha256: string, gzBytes: number }>}
 */
async function buildSanityTier(tier, { logAttempts }) {
    const srcPath = resolve(SANITY_DIR, `${tier}.js`);
    const src = readFileSync(srcPath, 'utf8');

    let implPath = srcPath;
    if (logAttempts === false) {
        const matches = src.match(new RegExp(LOG_ATTEMPTS_DECL.source, 'gm')) || [];
        if (matches.length !== 1) {
            throw new Error(
                `[sanity] expected exactly one \`const LOG_ATTEMPTS = true;\` declaration ` +
                `in ${tier}.js, found ${matches.length}`
            );
        }
        const patched = src.replace(LOG_ATTEMPTS_DECL, 'const LOG_ATTEMPTS = false;');
        implPath = resolve(TMP_DIR, `${tier}.patched.js`);
        mkdirSync(dirname(implPath), { recursive: true });
        writeFileSync(implPath, patched);
    }

    const fnName = applyFnName(tier);
    const entry = resolve(TMP_DIR, `entry-${tier}.js`);
    mkdirSync(dirname(entry), { recursive: true });
    const implSpecifier = implPath.replace(/\\/g, '/');
    writeFileSync(
        entry,
        `import { ${fnName} } from ${JSON.stringify(implSpecifier)};\n${fnName}();\n`
    );

    const built = await buildClassical({
        entry,
        outdir: OUT_DIR,
        outFileName: `sanity-${tier}-classic.min.js`,
        minify: true,
    });
    return finalize(built.outFile, built);
}

async function buildSanity({ logAttempts = true } = {}) {
    const perTier = {};
    for (const tier of SANITY_TIERS) {
        perTier[tier] = await buildSanityTier(tier, { logAttempts });
    }

    // dist/build/sanity.min.js keeps existing as the ALIAS of the base
    // artifact (byte-identical copy) — the ~13 existing
    // <script src=".../sanity.min.js"> pages keep working unchanged.
    const base = perTier.base;
    const aliasPath = resolve(OUT_DIR, 'sanity.min.js');
    copyFileSync(base.outFile, aliasPath);

    return {
        target: logAttempts ? 'sanity' : 'sanity (no-log)',
        moduleCount: 0,
        minBytes: base.bytes,
        minGz: base.gzBytes,
        minFile: aliasPath,
    };
}

// ─── Binary assets ───
function copyAssets() {
    const out = [];
    for (const rel of BINARY_ASSETS) {
        const src = resolve(SRC_DIR, rel);
        const dst = resolve(OUT_DIR, rel);
        if (!existsSync(src)) throw new Error(`[assets] declared binary asset not found: ${rel}`);
        mkdirSync(dirname(dst), { recursive: true });
        const srcStat = statSync(src);
        let copied = true;
        if (existsSync(dst)) {
            const dstStat = statSync(dst);
            if (dstStat.size === srcStat.size && dstStat.mtimeMs === srcStat.mtimeMs) copied = false;
        }
        if (copied) copyFileSync(src, dst);
        out.push({ asset: rel, bytes: srcStat.size, copied });
    }
    return out;
}

/**
 * Effective variant list for a target this run. `--classic` unions `'classic'`
 * into the config-declared variants (forces classic emission without editing
 * config.json), preserving order and dedup.
 *
 * @param {string[]} variants  Config-declared variants for the entry.
 * @param {{ classic: boolean }} opts
 * @returns {string[]}
 */
function effectiveVariants(variants, opts) {
    if (!opts.classic) return variants;
    return [...new Set([...variants, 'classic'])];
}

// ─── Target resolution ───
function resolveTargets(target, config) {
    const presetNames = Object.keys(config.presets);
    const sideNames = Object.keys(config.sideBundles);

    if (target === 'all') {
        return {
            presets: presetNames.map((n) => config.presets[n]),
            sideBundles: sideNames.map((n) => config.sideBundles[n]),
        };
    }
    if (target === 'presets') {
        return { presets: presetNames.map((n) => config.presets[n]), sideBundles: [] };
    }
    if (target === 'side-bundles') {
        return { presets: [], sideBundles: sideNames.map((n) => config.sideBundles[n]) };
    }
    if (config.presets[target]) {
        return { presets: [config.presets[target]], sideBundles: [] };
    }
    if (config.sideBundles[target]) {
        return { presets: [], sideBundles: [config.sideBundles[target]] };
    }
    throw new Error(
        `Unknown target "${target}". Available presets: ${presetNames.join(', ')}. ` +
        `Side-bundles: ${sideNames.join(', ')}. Special: all, presets, side-bundles.`
    );
}

// ─── Main (programmatic entry) ───
/**
 * Run a bundle build. Programmatic entry point of the `bundle` subcommand.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @returns {Promise<Array<object>>} per-target result rows.
 */
export async function runBundle(opts) {
    const pkgRoot = opts.pkg ? resolve(opts.pkg) : process.cwd();
    resolvePkgPaths(pkgRoot);

    // Opt-in banner, resolved BEFORE any output is written so a bad banner
    // fails the run without touching dist/.
    if (opts.banner != null && opts.bannerFile != null) {
        throw new Error('pass either opts.banner or opts.bannerFile (--banner-file), not both');
    }
    BANNER = null;
    if (opts.banner != null) BANNER = renderBanner(opts.banner);
    else if (opts.bannerFile != null) BANNER = loadBannerFile(resolve(opts.bannerFile));
    if (BANNER !== null) console.log(`[banner] legal comment (${BANNER.length} B) at byte 0 of every JS bundle`);

    setBackend(opts.backend);
    setPkgRoot(pkgRoot);
    console.log(`[build] backend: ${activeBackendName()}`);
    const configPath = opts.configPath || resolve(PKG_ROOT, 'fw.config.json');
    const config = loadConfig(SRC_DIR, configPath);

    // Source-tree invariants — abort early on inconsistency.
    const depsReport = validateAll(SRC_DIR, MODULES_SRC);
    console.log(
        `[validate] OK — ${depsReport.checked} module(s) ` +
        `(${depsReport.withDeps} with deps, ${depsReport.depFree} dependency-free)`
    );

    // Re-scan AFTER validation succeeded so subsequent passes share the same catalog.
    const { byName: catalog } = scanAll(SRC_DIR);

    // Synthesise the `full` preset from the catalog (every module under src/).
    // Kept out of config.json on purpose — it stays auto-synced with the tree.
    injectFullPreset(config, catalog);

    ensureCleanDirs();
    const results = [];

    try {
        // Mirror src/ with dev_only blocks stripped (production builds only).
        const srcRoot = opts.dev ? SRC_DIR : SANITIZED_SRC_DIR;
        if (!opts.dev) {
            const t0 = Date.now();
            const { filesProcessed, blocksRemoved } = stripDevDir({
                srcDir: SRC_DIR, dstDir: SANITIZED_SRC_DIR,
            });
            console.log(
                `[strip-dev] sanitised ${filesProcessed} file(s), removed ${blocksRemoved} block(s) in ${Date.now() - t0}ms`
            );
        }

        // Re-scan against the (possibly sanitised) tree so file paths point at the right place.
        const liveCatalog = opts.dev ? catalog : scanAll(SANITIZED_SRC_DIR).byName;

        if (opts.sanity) {
            results.push(await buildSanity({ logAttempts: opts.sanityLog }));
        }
        if (opts.sanityOnly) return results;

        const assetReport = copyAssets();
        for (const a of assetReport) {
            console.log(`[assets] ${a.copied ? 'copied' : 'up-to-date'} ${a.asset} (${fmtBytes(a.bytes)})`);
        }

        const { presets, sideBundles } = resolveTargets(opts.target, config);

        for (const preset of presets) {
            for (const variant of effectiveVariants(preset.variants, opts)) {
                results.push(await buildPreset(preset, liveCatalog, srcRoot, opts, variant));
            }
        }

        for (const sb of sideBundles) {
            for (const variant of effectiveVariants(sb.variants, opts)) {
                const r = await buildSideBundle(sb, liveCatalog, srcRoot, opts, variant);
                if (r) results.push(r);
            }
        }
    } finally {
        cleanupTmp();
    }

    return results;
}

// ─── Summary ───
function printSummary(results) {
    console.log('');
    console.log('─── Build summary ───');
    const headers = ['target', 'modules', 'min size', 'gz size'];
    const rows = results.map((r) => [
        r.target,
        String(r.moduleCount),
        fmtBytes(r.minBytes),
        fmtBytes(r.minGz),
    ]);
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const pad = (s, w) => s + ' '.repeat(w - s.length);
    console.log(headers.map((h, i) => pad(h, widths[i])).join('  '));
    console.log(widths.map((w) => '─'.repeat(w)).join('  '));
    for (const r of rows) console.log(r.map((c, i) => pad(c, widths[i])).join('  '));
    console.log('');
}

// ─── CLI entry ───
/**
 * Run the `bundle` subcommand CLI. Returns the process exit code.
 * @param {string[]} argv  Args after the `bundle` token.
 * @returns {Promise<number>}
 */
export async function runCli(argv) {
    if (wantsHelp(argv)) {
        printHelp(HELP_USAGE, HELP_FLAGS, HELP_EXAMPLES);
        return 0;
    }
    let opts;
    try { opts = parseArgs(argv); }
    catch (err) { console.error('[build] ' + err.message); return 1; }

    try {
        const results = await runBundle(opts);
        printSummary(results);
        console.log(`Done. Output: ${OUT_DIR}`);
        return 0;
    } catch (err) {
        cleanupTmp();
        console.error('[build] FAILED:', err.message);
        if (err.stack) console.error(err.stack);
        return 1;
    }
}

if (isMainModule(import.meta.url)) {
    runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
