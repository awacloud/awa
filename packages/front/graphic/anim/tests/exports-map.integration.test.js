// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the package's `exports` surface
 * (`graphic/BATCH_16` task 03, "exports hygiene").
 *
 * Before this task the kernel surface was published as ONE wildcard,
 * `"./kernels/*": "./src/*"` (`graphic/BATCH_15` task 03), which reached every
 * nested file under `src/` — including co-located `*.test.js` files, the perf
 * harness and the DOM-bound module sources. That was flagged at the time as a
 * surface-width decision for the owner. Task 03 narrows it to an explicit
 * allowlist of the EIGHT documented pure kernels (`docs/CONTRACT.md` "Kernel
 * export surface"), removes the dead `./modules` alias, and adds `types` +
 * a `files` allowlist.
 *
 * **Why this file does not simply call the runtime resolver for the negative
 * case.** Measured on this Bun (`Bun.resolveSync` / `import.meta.resolveSync`,
 * absolute importer path): Bun honours the removal of an exact key
 * (`@awacloud/graphic-anim/modules` throws) but still resolves
 * `@awacloud/graphic-anim/kernels/<anything-that-exists-under-src>` even though
 * no `exports` key matches it — a permissive fallback, not the ESM contract.
 * Node is authoritative and agrees with the narrowing: the same specifier
 * throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. So the negative gate here is measured
 * two ways that cannot both go vacuous:
 *
 *   1. against the DECLARED `exports` map, applying Node's own subpath-matching
 *      rules (exact key, then longest `*` pattern) — always runs;
 *   2. against a real `node --input-type=module` subprocess doing
 *      `import.meta.resolve()` — itself falsification-checked by requiring
 *      the allowlisted twin of every rejected specifier to resolve in the
 *      SAME subprocess.
 *
 * The positive gate uses the real runtime resolver (`import.meta.resolveSync`
 * with an ABSOLUTE importer path) so an allowlist entry that points at a
 * missing file cannot pass. A further leg LOADS (`import()`) every entry point
 * of the live map in real Node — resolution is not loadability — and is
 * falsified on a throwaway package whose export resolves but throws at load.
 * The Node legs never skip: without a `node` binary they fail.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG  = join(HERE, '..');

/** Absolute importer path — a bare relative one resolves against the CWD. */
const IMPORTER = join(HERE, 'exports-map.integration.test.js');

const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

/** The eight documented pure kernels — the whole sanctioned `./kernels/` set. */
const ALLOWED_KERNELS = [
    'pageflip/fold.js',
    'pageflip/compose.js',
    'hypertree/layout.js',
    'hypertree/measure.js',
    'svg3d/vec3.js',
    'svg3d/mesh.js',
    'svg3d/project.js',
    'svg3d/apply.js',
];

/**
 * Specifiers that MUST NOT be exported: co-located tests, the perf harness,
 * non-kernel sources reachable through the retired wildcard, the DOM-bound
 * module entries, and the removed `./modules` alias.
 */
const REJECTED = [
    '@awacloud/graphic-anim/kernels/pageflip/fold.test.js',
    '@awacloud/graphic-anim/kernels/hypertree/layout.test.js',
    '@awacloud/graphic-anim/kernels/svg3d/mesh.test.js',
    '@awacloud/graphic-anim/kernels/perf/harness.js',
    '@awacloud/graphic-anim/kernels/math/scalar.js',
    '@awacloud/graphic-anim/kernels/svg/apply.js',
    '@awacloud/graphic-anim/kernels/scene/scene.js',
    '@awacloud/graphic-anim/kernels/main.js',
    '@awacloud/graphic-anim/kernels/aggregator.js',
    '@awacloud/graphic-anim/modules',
];

/**
 * Apply Node's `PACKAGE_EXPORTS_RESOLVE` subpath matching to the DECLARED map:
 * an exact key wins, otherwise the `*` pattern with the longest static prefix.
 *
 * @param {object} exportsMap The package's `exports` object.
 * @param {string} subpath `"."` or `"./…"`.
 * @returns {string|object|null} The matched target, or `null` when the subpath
 *   is not exported at all.
 */
function matchExports(exportsMap, subpath) {
    if (Object.prototype.hasOwnProperty.call(exportsMap, subpath)) {
        return exportsMap[subpath];
    }
    let best = null;
    let bestPrefixLen = -1;
    for (const key of Object.keys(exportsMap)) {
        const star = key.indexOf('*');
        if (star === -1) continue;
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (subpath.length < prefix.length + suffix.length) continue;
        if (!subpath.startsWith(prefix)) continue;
        if (suffix && !subpath.endsWith(suffix)) continue;
        if (prefix.length > bestPrefixLen) {
            bestPrefixLen = prefix.length;
            best = exportsMap[key];
        }
    }
    return best;
}

/** `@awacloud/graphic-anim/x/y` → `./x/y`; the bare name → `.`. */
function toSubpath(specifier) {
    const rest = specifier.slice('@awacloud/graphic-anim'.length);
    return rest === '' ? '.' : `.${rest}`;
}

/** Is a `node` binary usable here? */
const NODE_OK = (() => {
    const r = spawnSync('node', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
})();

/**
 * Run a script in ONE real Node ESM subprocess and parse its last stdout line.
 *
 * @param {string} script
 * @param {string} cwd Directory the bare specifiers resolve from.
 * @returns {Record<string, string>}
 */
function nodeRun(script, cwd) {
    const res = spawnSync('node', ['--input-type=module', '-e', script], { cwd, encoding: 'utf8' });
    expect(res.status).toBe(0);
    return JSON.parse(res.stdout.trim().split('\n').pop());
}

/**
 * Resolve a list of specifiers in ONE real Node ESM subprocess.
 *
 * @param {string[]} specifiers
 * @param {string} [cwd=PKG]
 * @returns {Record<string, string>} specifier → `'OK'` or the thrown error code.
 */
function nodeResolveAll(specifiers, cwd = PKG) {
    return nodeRun(`
        const out = {};
        for (const s of ${JSON.stringify(specifiers)}) {
            try { import.meta.resolve(s); out[s] = 'OK'; }
            catch (e) { out[s] = e.code || 'THROW'; }
        }
        console.log(JSON.stringify(out));
    `, cwd);
}

/**
 * LOAD (`import()`, not merely resolve) a list of specifiers in ONE real Node
 * ESM subprocess. A `.json` entry loads with `with { type: 'json' }`.
 *
 * @param {string[]} specifiers
 * @param {string} [cwd=PKG]
 * @returns {Record<string, string>} specifier → `'OK'` or the thrown error code
 *   (`'THROW'` when the error carries none, e.g. a module throwing at load).
 */
function nodeImportAll(specifiers, cwd = PKG) {
    return nodeRun(`
        const out = {};
        for (const s of ${JSON.stringify(specifiers)}) {
            try {
                if (s.endsWith('.json')) await import(s, { with: { type: 'json' } });
                else await import(s);
                out[s] = 'OK';
            } catch (e) { out[s] = e.code || 'THROW'; }
        }
        console.log(JSON.stringify(out));
    `, cwd);
}

/**
 * Every entry point of the live `exports` map: each exact key, and each file
 * a `*` pattern exposes in the directory its target names. Derived from
 * `package.json` and the `dist/` listing at test time, never hard-coded.
 *
 * @returns {string[]} Bare specifiers.
 */
function liveEntryPoints() {
    const out = [];
    for (const key of Object.keys(pkg.exports)) {
        if (!key.includes('*')) {
            out.push(`@awacloud/graphic-anim${key === '.' ? '' : key.slice(1)}`);
            continue;
        }
        const target = pkg.exports[key].default;
        const dir = join(PKG, target.slice(2, target.indexOf('*')));
        // A `.d.ts` is a type entry, not a runtime one (`tests/dist-types`).
        for (const file of readdirSync(dir).filter((f) => !f.endsWith('.d.ts'))) {
            out.push(`@awacloud/graphic-anim${key.slice(1).replace('*', file)}`);
        }
    }
    return out;
}

// ── 1. Positive: every sanctioned subpath resolves through the real resolver ──

describe('exports map — sanctioned subpaths resolve', () => {
    for (const kernel of ALLOWED_KERNELS) {
        test(`./kernels/${kernel} resolves to its own source file`, () => {
            const resolved = import.meta.resolveSync(
                `@awacloud/graphic-anim/kernels/${kernel}`, IMPORTER,
            );
            expect(resolved.replace(/\\/g, '/')).toContain(`/src/${kernel}`);
            expect(existsSync(join(PKG, 'src', kernel))).toBe(true);
        });
    }

    test('the root, both dist surfaces and package.json resolve', () => {
        const root = import.meta.resolveSync('@awacloud/graphic-anim', IMPORTER);
        expect(root.replace(/\\/g, '/')).toContain('/src/main.js');
        expect(
            import.meta.resolveSync('@awacloud/graphic-anim/build/index.js', IMPORTER)
                .replace(/\\/g, '/'),
        ).toContain('/dist/build/index.js');
        expect(
            import.meta.resolveSync(
                '@awacloud/graphic-anim/standalone/graphic-pageflip-bundled.js', IMPORTER,
            ).replace(/\\/g, '/'),
        ).toContain('/dist/standalone/graphic-pageflip-bundled.js');
        expect(
            import.meta.resolveSync('@awacloud/graphic-anim/package.json', IMPORTER)
                .replace(/\\/g, '/'),
        ).toContain('/package.json');
    });
});

// ── 2. Negative, gate (a): the DECLARED map matches nothing forbidden ─────────

describe('exports map — the declaration itself rejects the forbidden subpaths', () => {
    for (const specifier of REJECTED) {
        test(`${specifier} matches NO exports key`, () => {
            expect(matchExports(pkg.exports, toSubpath(specifier))).toBe(null);
        });
    }

    test('the matcher is not vacuous: every allowlisted kernel DOES match', () => {
        for (const kernel of ALLOWED_KERNELS) {
            expect(matchExports(pkg.exports, `./kernels/${kernel}`)).not.toBe(null);
        }
        expect(matchExports(pkg.exports, '.')).not.toBe(null);
        expect(matchExports(pkg.exports, './build/index.js')).not.toBe(null);
    });

    test('the matcher is not vacuous: the RETIRED wildcard would have matched them', () => {
        // The pre-task map, verbatim. Every specifier rejected above resolved
        // through it — that is exactly what this task removes.
        const retired = { '.': './src/main.js', './modules': './src/main.js', './kernels/*': './src/*' };
        for (const specifier of REJECTED) {
            expect(matchExports(retired, toSubpath(specifier))).not.toBe(null);
        }
    });
});

// ── 3. Negative, gate (b): real Node ESM resolution ──────────────────────────

// The Node legs never skip: without a `node` binary they FAIL, so a machine
// that cannot run them cannot report this file green.
describe('exports map — real Node resolution agrees', () => {
    test('a node binary is available (the Node legs never skip)', () => {
        if (!NODE_OK) throw new Error('node is not on PATH: the real-Node legs of this gate cannot run');
    });

    test('forbidden specifiers throw ERR_PACKAGE_PATH_NOT_EXPORTED while their allowlisted twins resolve', () => {
        const allowed = ALLOWED_KERNELS.map((k) => `@awacloud/graphic-anim/kernels/${k}`);
        const results = nodeResolveAll([...allowed, ...REJECTED]);

        // Falsification guard: if the whole probe were broken, these would fail too.
        for (const spec of allowed) expect(results[spec]).toBe('OK');
        for (const spec of REJECTED) expect(results[spec]).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });
});

// ── 3b. Loadability: every entry point LOADS under real Node ────────────────
//
// Resolution is not loadability: a specifier can resolve and its module still
// throw at load (a bad transitive import, an unexported dependency subpath).
// This leg `import()`s every entry point of the live map in real Node.

describe('exports map — every entry point LOADS under real Node', () => {
    const entries = liveEntryPoints();

    test('the entry-point list is the live map: exact keys plus every pattern file', () => {
        const exact = Object.keys(pkg.exports).filter((k) => !k.includes('*')).length;
        const patternFiles = Object.keys(pkg.exports).filter((k) => k.includes('*'))
            .reduce((n, k) => {
                const t = pkg.exports[k].default;
                return n + readdirSync(join(PKG, t.slice(2, t.indexOf('*')))).filter((f) => !f.endsWith('.d.ts')).length;
            }, 0);
        expect(patternFiles).toBeGreaterThan(0);
        expect(entries.length).toBe(exact + patternFiles);
        expect(new Set(entries).size).toBe(entries.length);
    });

    test('every entry point loads (import(), not resolve)', () => {
        if (!NODE_OK) throw new Error('node is not on PATH');
        const results = nodeImportAll(entries);
        const failed = Object.entries(results).filter(([, v]) => v !== 'OK').map(([s, v]) => `${s} ${v}`);
        expect(failed).toEqual([]);
        expect(Object.keys(results).length).toBe(entries.length);
    });

    test('FALSIFICATION — an entry that resolves but throws at load is reported failed', () => {
        if (!NODE_OK) throw new Error('node is not on PATH');
        const root = mkdtempSync(join(tmpdir(), 'graphic-anim-load-'));
        try {
            const dir = join(root, 'node_modules', '@fixture', 'broken');
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, 'package.json'), JSON.stringify({
                name: '@fixture/broken', type: 'module',
                exports: { './ok.js': './ok.js', './throws.js': './throws.js' },
            }));
            writeFileSync(join(dir, 'ok.js'), 'export const ok = 1;\n');
            writeFileSync(join(dir, 'throws.js'), "throw new Error('fails at load');\n");
            const specs = ['@fixture/broken/ok.js', '@fixture/broken/throws.js'];
            // Resolution alone cannot tell them apart …
            expect(nodeResolveAll(specs, root)).toEqual({ '@fixture/broken/ok.js': 'OK', '@fixture/broken/throws.js': 'OK' });
            // … loading does.
            expect(nodeImportAll(specs, root)).toEqual({ '@fixture/broken/ok.js': 'OK', '@fixture/broken/throws.js': 'THROW' });
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

// ── 4. Declaration hygiene: files / types / no dead alias ───────────────────

describe('package.json hygiene', () => {
    test('the dead ./modules alias is gone', () => {
        expect('./modules' in pkg.exports).toBe(false);
    });

    test('the ./kernels/* wildcard is gone; only the eight kernels are listed', () => {
        expect('./kernels/*' in pkg.exports).toBe(false);
        const kernelKeys = Object.keys(pkg.exports).filter((k) => k.startsWith('./kernels/'));
        expect(kernelKeys.sort()).toEqual(ALLOWED_KERNELS.map((k) => `./kernels/${k}`).sort());
    });

    test('every kernel target exists, is under src/ and is not a test file', () => {
        for (const key of Object.keys(pkg.exports).filter((k) => k.startsWith('./kernels/'))) {
            const target = pkg.exports[key].default;
            expect(target.startsWith('./src/')).toBe(true);
            expect(target.endsWith('.test.js')).toBe(false);
            expect(existsSync(join(PKG, target))).toBe(true);
        }
    });

    test('every kernel key declares its sibling .d.ts as a FIRST types condition', () => {
        for (const key of Object.keys(pkg.exports).filter((k) => k.startsWith('./kernels/'))) {
            const entry = pkg.exports[key];
            expect(Object.keys(entry)[0]).toBe('types');
            expect(entry.types).toBe(entry.default.replace(/\.js$/, '.d.ts'));
            expect(existsSync(join(PKG, entry.types))).toBe(true);
        }
    });

    test('types points at the committed hand-authored declaration file', () => {
        expect(pkg.types).toBe('types/main.d.ts');
        expect(existsSync(join(PKG, pkg.types))).toBe(true);
        expect(pkg.exports['.'].types).toBe('./types/main.d.ts');
        // `types` must come FIRST in the condition object — resolvers take the
        // first matching key and `default` would otherwise shadow it.
        expect(Object.keys(pkg.exports['.'])[0]).toBe('types');
    });

    test('the files allowlist ships src/dist/types/docs/demos and excludes tests', () => {
        expect(Array.isArray(pkg.files)).toBe(true);
        expect(pkg.files).toContain('src/**/*.js');
        expect(pkg.files).toContain('!src/**/*.test.js');
        expect(pkg.files).toContain('types/**/*.d.ts');
        expect(pkg.files).toContain('dist/build/**');
        expect(pkg.files).toContain('dist/standalone/**');
        // The package-local serve surface (D3, graphic/BATCH_20 task 04): a
        // standalone install must carry the demos + playground trees so
        // `bun run serve` (`dev-portal serve`) has something to serve. These
        // are asserted PRESENT, not merely tolerated — dropping either would
        // silently break the standalone portal.
        expect(pkg.files).toContain('demos');
        expect(pkg.files).toContain('playground');
        // Never the repo-only trees.
        for (const entry of pkg.files) {
            expect(entry.startsWith('tests')).toBe(false);
            expect(entry.startsWith('spikes')).toBe(false);
        }
    });
});
