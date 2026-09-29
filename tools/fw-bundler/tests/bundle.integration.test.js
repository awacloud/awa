// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/bundle.integration.test.js
//
// Golden / equivalence coverage for the `bundle` subcommand.
//
// Two legs:
//   1. Golden byte-compare vs the committed goldens (fw extracted from git
//      history at the MANIFEST's captureSha — proven byte-identical to the
//      fw original's output on that input before the originals were removed;
//      see __fixtures__/golden/README.md): for presets minimal / core / site
//      (backend bun) the copy must emit dist/build/*.min.js RAW-byte-identical
//      to the goldens, and *.meta.json identical modulo the dev-derived
//      sizes/hashes normalized below.
//   2. Full-pipeline build + byte-idempotence against a fw-shaped fixture the
//      copy CAN build (strip-dev → sanity → assets → entry-gen → Bun.build →
//      meta), exercising the actual Bun.build path deterministically.
//   3. Cross-path determinism (D35(b)): the same fixture built from two
//      DIFFERENT absolute directories.
//
// STAMP-FREE OUTPUT (BL-697 / BL-698, D35(b)): the tool no longer emits a
// meta `builtAt` field, a `// Built:` banner, or Bun's path-derived
// `//# debugId=` trailer, so the normalizers that used to EXCUSE those three
// tokens are gone — replaced by the absence assertions below. A normalizer
// that survives its subject silently excuses a resurrected stamp.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { existsSync, rmSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseArgs, runBundle } from '../src/bundle/index.js';
import { extractFwAt, readManifest, readGolden } from './golden-fw.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const COPY_BUNDLE = join(ROOT, 'tools', 'fw-bundler', 'src', 'bundle', 'index.js');
const FIX = join(import.meta.dir, '__fixtures__', 'mini-fw');
const FIX_OUT = join(FIX, 'dist', 'build');
// Gitignored scratch root (shared with golden-fw.js's frozen-fw extraction).
const XPATH_TMP = join(import.meta.dir, 'tmp', 'xpath-determinism');

function cleanFixtureDist() {
    rmSync(join(FIX, 'dist'), { recursive: true, force: true });
}

// Symmetric normalization (identical in capture-goldens.mjs): the DEV bundle
// embeds one `// <path>` comment per module, resolved relative to the build
// PROCESS's cwd — so its size and hash depend on where the build was launched
// from. The min.js golden itself carries the byte-identity, so only the
// dev-derived numbers are neutralized. No timestamp is normalized any more:
// the emitted meta carries none (BL-697).
function normMeta(json) {
    return json
        .replace(/"(min|minGz|dev|devGz)":\s*\d+/g, '"$1":"<n>"')
        .replace(/"(min|dev)":\s*"[0-9a-f]{64}"/g, '"$1":"<sha256>"');
}

// Build one preset with the ported copy against the frozen fw extraction,
// cwd = repo root. Returns the emitted bytes from the extraction's dist/build.
function buildCopy(fwDir, preset) {
    const r = Bun.spawnSync(['bun', COPY_BUNDLE, preset, '--no-sanity', '--pkg', fwDir], {
        cwd: ROOT, stdout: 'pipe', stderr: 'pipe',
    });
    return { proc: r, ...snapshot(fwDir, preset) };
}

function snapshot(fwDir, preset) {
    const min = join(fwDir, 'dist', 'build', `fw.${preset}.pure.min.js`);
    const meta = join(fwDir, 'dist', 'build', `fw.${preset}.pure.meta.json`);
    return {
        min: existsSync(min) ? readFileSync(min) : null,
        meta: existsSync(meta) ? readFileSync(meta, 'utf8') : null,
    };
}

async function importFresh(file) {
    return import(pathToFileURL(file).href + `?t=${Date.now()}_${Math.random()}`);
}

beforeEach(cleanFixtureDist);
afterAll(cleanFixtureDist);

describe('parseArgs (frozen bundle flag surface)', () => {
    test('defaults + target', () => {
        const o = parseArgs([]);
        expect(o.target).toBe('all');
        expect(o.dev).toBe(false);
        expect(o.sanity).toBe(true);
        expect(o.pkg).toBeNull();
    });

    test('--pkg is parsed (path-resolution seam)', () => {
        expect(parseArgs(['--pkg', 'packages/front/fw']).pkg).toBe('packages/front/fw');
        expect(parseArgs(['site', '--pkg', '/abs/pkg']).target).toBe('site');
    });

    test('rejects unknown flags and bad backend', () => {
        expect(() => parseArgs(['--nope'])).toThrow(/Unknown flag/);
        expect(() => parseArgs(['--backend', 'webpack'])).toThrow(/--backend/);
    });
});

describe('golden byte-compare vs the committed goldens (frozen fw@captureSha, backend bun)', () => {
    const FROZEN = extractFwAt(readManifest().captureSha);

    for (const preset of ['minimal', 'core', 'site']) {
        test(`\`${preset}\` min.js + meta.json match the committed goldens`, () => {
            const copy = buildCopy(FROZEN, preset);
            expect(copy.proc.exitCode).toBe(0);
            expect(copy.min).not.toBeNull();
            expect(copy.meta).not.toBeNull();

            // Stamp absence (BL-697 / BL-698) — asserted BEFORE the golden
            // compare so a resurrected stamp names itself instead of showing
            // up as an opaque byte diff.
            const minText = copy.min.toString('latin1');
            expect(minText).not.toContain('//# debugId=');
            expect(minText).not.toContain('// Built:');
            expect('builtAt' in JSON.parse(copy.meta)).toBe(false);

            // min.js: RAW bytes, no normalizer at all.
            expect(minText).toBe(readGolden(`fw.${preset}.pure.min.js`).toString('latin1'));

            // meta.json: identical modulo the dev-derived sizes/hashes.
            expect(normMeta(copy.meta)).toBe(readGolden(`fw.${preset}.pure.meta.json`).toString('utf8'));
        }, 60_000);
    }
});

describe('full-pipeline build + byte-idempotence (fw-shaped fixture)', () => {
    test('builds the `core` preset end-to-end and the pure bundle re-imports', async () => {
        const opts = parseArgs(['core', '--pkg', FIX]);
        const results = await runBundle(opts);
        expect(results.some((r) => r.target.startsWith('preset:core'))).toBe(true);

        for (const f of ['fw.core.pure.min.js', 'fw.core.pure.js', 'fw.core.pure.meta.json', 'sanity.min.js']) {
            expect(existsSync(join(FIX_OUT, f))).toBe(true);
        }
        // Declared binary asset was copied.
        expect(existsSync(join(FIX_OUT, 'io', 'compress', 'brotli_dict.bin'))).toBe(true);

        const mod = await importFresh(join(FIX_OUT, 'fw.core.pure.js'));
        expect(Object.keys(mod.default).sort()).toEqual(['ENV', 'createWorker', 'domReady', 'log', 'runtime']);
    });

    test('minimal (0-module) preset builds and re-imports', async () => {
        await runBundle(parseArgs(['minimal', '--no-sanity', '--pkg', FIX]));
        expect(existsSync(join(FIX_OUT, 'fw.minimal.pure.min.js'))).toBe(true);
        const mod = await importFresh(join(FIX_OUT, 'fw.minimal.pure.js'));
        expect(typeof mod.default).toBe('object');
    });

    // Same build path, two consecutive runs → RAW bytes, no normalizer at all
    // (BL-697/BL-698: nothing build-instance-dependent is emitted any more).
    test('running the copy twice yields raw-byte-identical min, pure and meta output', async () => {
        const NAMES = ['fw.core.pure.min.js', 'fw.core.pure.js', 'fw.core.pure.meta.json'];
        const snap = () => NAMES.map((n) => readFileSync(join(FIX_OUT, n)));

        await runBundle(parseArgs(['core', '--no-sanity', '--pkg', FIX]));
        const first = snap();

        await runBundle(parseArgs(['core', '--no-sanity', '--pkg', FIX]));
        const second = snap();

        for (let i = 0; i < NAMES.length; i++) {
            expect([NAMES[i], Buffer.compare(first[i], second[i])]).toEqual([NAMES[i], 0]);
        }
        // Non-vacuity: the outputs are non-empty and carry no stamp token.
        expect(first[0].byteLength).toBeGreaterThan(100);
        expect(first[0].toString('latin1')).not.toContain('//# debugId=');
        expect(first[1].toString('latin1')).not.toContain('//# debugId=');
        expect('builtAt' in JSON.parse(first[2].toString('utf8'))).toBe(false);
    });

    test('side-bundle target emits a pack bundle', async () => {
        await runBundle(parseArgs(['extra', '--no-sanity', '--pkg', FIX]));
        expect(existsSync(join(FIX_OUT, 'fw.pack.extra.pure.min.js'))).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-path determinism (D35(b)) — what "reproducible" does and does NOT mean
// ─────────────────────────────────────────────────────────────────────────────
//
// Reproducibility is PATH-SCOPED. Two classes of location dependence survive
// BL-697/BL-698 and are pinned here rather than hidden behind a normalizer:
//
//   (a) the NON-MINIFIED bundle embeds one `// <path>` comment per module,
//       resolved by Bun relative to the build PROCESS's cwd — so it is stable
//       when the relative layout is stable (leg 1) and diverges when the same
//       tree is addressed through a longer `--pkg` path (leg 2). The meta
//       inherits that divergence through its dev bytes/hashes.
//   (b) the MINIFIER allocates identifiers path-dependently — the D35(b)
//       RESIDUAL, deliberately unfixed (BL-698's third cause). It was measured
//       at fw scale (BATCH_54/09: 32 of 629 blobs differed when the build
//       directory path changed) and does NOT manifest on this 2-module
//       fixture, which is too small to produce the colliding identifier
//       frequencies that make the allocation path-sensitive. Leg 2 therefore
//       asserts the STRONGER property that actually holds here (raw min
//       equality) — a weaker "the min diff is confined to identifiers"
//       assertion would pass vacuously against an empty diff.
describe('cross-path determinism (PATH-SCOPED; minifier identifier allocation is the unfixed D35(b) residual)', () => {
    function seedFixture(dir) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        cpSync(FIX, dir, { recursive: true });
        rmSync(join(dir, 'dist'), { recursive: true, force: true });
        return dir;
    }

    /** Build the seeded fixture at `dir`; `cwd` is the build process's cwd. */
    function buildAt(dir, { cwd, usePkg }) {
        const argv = usePkg ? ['core', '--no-sanity', '--pkg', dir] : ['core', '--no-sanity'];
        const r = Bun.spawnSync(['bun', COPY_BUNDLE, ...argv], { cwd, stdout: 'pipe', stderr: 'pipe' });
        if (r.exitCode !== 0) {
            throw new Error(`bundle failed in ${dir} (exit ${r.exitCode}):\n${r.stderr.toString()}`);
        }
        const out = join(dir, 'dist', 'build');
        return {
            min: readFileSync(join(out, 'fw.core.pure.min.js')),
            pure: readFileSync(join(out, 'fw.core.pure.js')),
            meta: readFileSync(join(out, 'fw.core.pure.meta.json'), 'utf8'),
        };
    }

    // Neutralizes class (a) only: the build-root prefix of the embedded
    // source-path comments. Everything else in the bundle must still match.
    const stripBuildRoot = (buf) =>
        buf.toString('latin1').replace(/^\/\/ \S*dist\/_tmp\//gm, '// <build-root>/');

    const DIR_A = join(XPATH_TMP, 'a');
    const DIR_B = join(XPATH_TMP, 'bbbbbbbbbbbbbbbbbbbbbbbb', 'nested', 'deeper');

    afterAll(() => rmSync(XPATH_TMP, { recursive: true, force: true }));

    test('two different absolute roots, each built from its own cwd → min, pure and meta are RAW-byte identical', () => {
        const a = buildAt(seedFixture(DIR_A), { cwd: DIR_A, usePkg: false });
        const b = buildAt(seedFixture(DIR_B), { cwd: DIR_B, usePkg: false });

        expect(a.min.equals(b.min)).toBe(true);
        expect(a.pure.equals(b.pure)).toBe(true);
        expect(a.meta).toBe(b.meta);

        // Non-vacuity: the two roots really are different absolute paths and
        // the compared artifacts are real bundles, not empty files.
        expect(DIR_A).not.toBe(DIR_B);
        expect(a.min.byteLength).toBeGreaterThan(100);
        expect(a.pure.byteLength).toBeGreaterThan(100);
    }, 60_000);

    test('same cwd, two --pkg roots of different depth → min RAW-identical; pure/meta diverge ONLY in the embedded source-path comments', () => {
        const a = buildAt(seedFixture(DIR_A), { cwd: ROOT, usePkg: true });
        const b = buildAt(seedFixture(DIR_B), { cwd: ROOT, usePkg: true });

        // The minified bundle is unaffected at this fixture's scale — the
        // identifier-allocation residual needs an fw-sized module set.
        expect(a.min.equals(b.min)).toBe(true);
        expect(a.min.toString('latin1')).not.toContain('//# debugId=');

        // The non-minified bundle DOES diverge, and the divergence is entirely
        // the build-root prefix of the embedded `// <path>` comments.
        expect(a.pure.equals(b.pure)).toBe(false);
        expect(stripBuildRoot(a.pure)).toBe(stripBuildRoot(b.pure));

        // The meta inherits it through the dev bytes/hashes — and through
        // nothing else (no timestamp: BL-697).
        expect(a.meta).not.toBe(b.meta);
        expect(normMeta(a.meta)).toBe(normMeta(b.meta));
        expect('builtAt' in JSON.parse(a.meta)).toBe(false);
    }, 60_000);
});
