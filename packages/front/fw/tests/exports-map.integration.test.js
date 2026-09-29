// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — the fw `exports` map's dotted `./core/*.js`
 * twins (`fw/BATCH_28` task 06, BL-323 / BL-360).
 *
 * `package.json` published 5 exact extensionless `./core/*` keys
 * (`./core/runtime`, `./core/worker-helper`, `./core/readyState`,
 * `./core/logger`, `./core/modules`) but no dotted twin, so
 * `@awacloud/fw/core/runtime.js` threw `ERR_PACKAGE_PATH_NOT_EXPORTED` while
 * `@awacloud/fw/core/runtime` resolved — the exact resolver failure mode
 * recorded in `ai/memory/types/fw.md` (2026-08-10, fw/playwright entry) for
 * `playwright`'s own restricted `exports` map. This task adds the 5 dotted
 * keys, each pointing at the SAME source file as its extensionless sibling.
 *
 * Out of scope (plan "Out" section): a `./core/*.js` wildcard. That would
 * expose every file under `src/core/` — including the co-located
 * `*.test.js` files and `worker-confinement.poc.test.js` — through the
 * resolver, beyond the curated 5. The negative control below proves no such
 * wildcard crept in, using `./core/logger.test.js`: a file that genuinely
 * exists on disk under `src/core/` (so "does not resolve" is not vacuously
 * true for a missing path) but sits outside the 5 curated modules.
 *
 * Follows the two-gate pattern of the sibling
 * `packages/front/graphic/anim/tests/exports-map.integration.test.js`:
 * (1) apply Node's own `PACKAGE_EXPORTS_RESOLVE` subpath-matching rules to
 * the DECLARED map (always runs), and (2) a real `node --input-type=module`
 * subprocess doing `import.meta.resolve()` (runs when `node` is on PATH),
 * falsification-checked by requiring the allowlisted twin of every rejected
 * specifier to resolve in the SAME subprocess.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG  = join(HERE, '..');

const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

/** The 5 curated core modules — extensionless key → dotted `.js` twin. */
const CORE_MODULES = [
    'runtime',
    'worker-helper',
    'readyState',
    'logger',
    'modules',
];

/**
 * Apply Node's `PACKAGE_EXPORTS_RESOLVE` subpath matching to the DECLARED
 * map: an exact key wins, otherwise the `*` pattern with the longest static
 * prefix.
 *
 * @param {object} exportsMap The package's `exports` object.
 * @param {string} subpath `"."` or `"./…"`.
 * @returns {string|object|null} The matched target, or `null` when the
 *   subpath is not exported at all.
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

/** Is a `node` binary usable here? */
const NODE_OK = (() => {
    const r = spawnSync('node', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
})();

/**
 * Resolve a list of specifiers in a real Node ESM subprocess. Memoised as an
 * accumulating cache keyed by specifier — two consumers passing the SAME
 * specifier list (the common case in this file) share one subprocess
 * invocation; a consumer asking for specifiers not seen before triggers
 * exactly one additional spawn for the missing ones only.
 *
 * @param {string[]} specifiers
 * @returns {Record<string, string>} specifier → `'OK'` or the thrown error code.
 */
const _nodeResultsCache = {};
function nodeResolveAll(specifiers) {
    const missing = specifiers.filter((s) => !(s in _nodeResultsCache));
    if (missing.length === 0) return _nodeResultsCache;
    const script = `
        const out = {};
        for (const s of ${JSON.stringify(missing)}) {
            try { import.meta.resolve(s); out[s] = 'OK'; }
            catch (e) { out[s] = e.code || 'THROW'; }
        }
        console.log(JSON.stringify(out));
    `;
    const res = spawnSync('node', ['--input-type=module', '-e', script], {
        cwd: PKG,
        encoding: 'utf8',
    });
    if (res.status !== 0) {
        throw new Error(`node subprocess exited ${res.status}: ${res.stderr}`);
    }
    Object.assign(_nodeResultsCache, JSON.parse(res.stdout.trim().split('\n').pop()));
    return _nodeResultsCache;
}

/** All specifiers this file needs resolved, in ONE shared subprocess call. */
const DOTTED_SPECIFIERS = CORE_MODULES.map((mod) => `@awacloud/fw/core/${mod}.js`);
const EXTENSIONLESS_SPECIFIERS = CORE_MODULES.map((mod) => `@awacloud/fw/core/${mod}`);
const REJECTED_SPECIFIERS = ['@awacloud/fw/core/logger.test.js'];

// ── 1. Positive: both spellings resolve, all 5 modules ──────────────────────
//
// Two independent gates per module, per spelling — the plan's "5×2 resolution
// assertions":
//   (a) the DECLARED map, via Node's own PACKAGE_EXPORTS_RESOLVE matching
//       rules (`matchExports`, always runs) — this is the gate that is RED
//       before the fix: the dotted key is simply absent from the declared
//       map.
//   (b) a real Node ESM subprocess (`import.meta.resolve`, when `node` is on
//       PATH) — the runtime-authoritative check.
// Gate (a) alone is load-bearing: measured on this Bun, `import.meta.resolveSync`
// falls back PERMISSIVELY for a specifier that matches no `exports` key at
// all (same phenomenon documented in the sibling
// `packages/front/graphic/anim/tests/exports-map.integration.test.js`), so it
// is used here only as a supplementary same-target confirmation, never as the
// sole evidence a spelling resolves.

describe('exports map — dotted ./core/*.js twins resolve identically to the extensionless keys', () => {
    for (const mod of CORE_MODULES) {
        test(`./core/${mod} and ./core/${mod}.js both match the declared map, to the same target`, () => {
            const extensionless = matchExports(pkg.exports, `./core/${mod}`);
            const dotted = matchExports(pkg.exports, `./core/${mod}.js`);
            expect(extensionless).not.toBe(null);
            expect(dotted).not.toBe(null);
            expect(dotted.default).toBe(extensionless.default);
            expect(existsSync(join(PKG, 'src', 'core', `${mod}.js`))).toBe(true);
        });
    }

    test.if(NODE_OK)('both spellings resolve OK in a real Node ESM subprocess, all 5 modules', () => {
        const results = nodeResolveAll([
            ...DOTTED_SPECIFIERS, ...EXTENSIONLESS_SPECIFIERS, ...REJECTED_SPECIFIERS,
        ]);
        for (const spec of DOTTED_SPECIFIERS) expect(results[spec]).toBe('OK');
        for (const spec of EXTENSIONLESS_SPECIFIERS) expect(results[spec]).toBe('OK');
    });
});

// ── 2. Negative, gate (a): the DECLARED map matches nothing forbidden ───────

describe('exports map — the declaration itself does not wildcard-expose non-curated core files', () => {
    test('./core/logger.test.js (a real file, not one of the 5 curated modules) matches NO exports key', () => {
        expect(existsSync(join(PKG, 'src', 'core', 'logger.test.js'))).toBe(true);
        expect(matchExports(pkg.exports, './core/logger.test.js')).toBe(null);
    });

    test('the matcher is not vacuous: every curated module DOES match, both spellings', () => {
        for (const mod of CORE_MODULES) {
            expect(matchExports(pkg.exports, `./core/${mod}`)).not.toBe(null);
            expect(matchExports(pkg.exports, `./core/${mod}.js`)).not.toBe(null);
        }
    });

    test('no ./core/*.js (or ./core/*) wildcard key exists', () => {
        expect('./core/*.js' in pkg.exports).toBe(false);
        expect('./core/*' in pkg.exports).toBe(false);
    });
});

// ── 3. Negative, gate (b): real Node ESM resolution ──────────────────────────

describe.if(NODE_OK)('exports map — real Node resolution agrees', () => {
    test('the dotted twins resolve OK while a non-curated core file throws ERR_PACKAGE_PATH_NOT_EXPORTED', () => {
        const results = nodeResolveAll([
            ...DOTTED_SPECIFIERS, ...EXTENSIONLESS_SPECIFIERS, ...REJECTED_SPECIFIERS,
        ]);

        for (const spec of DOTTED_SPECIFIERS) expect(results[spec]).toBe('OK');
        for (const spec of EXTENSIONLESS_SPECIFIERS) expect(results[spec]).toBe('OK');
        // Falsification guard: if the whole probe were broken (e.g. a stray
        // wildcard), this would spuriously read 'OK' too.
        for (const spec of REJECTED_SPECIFIERS) expect(results[spec]).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });
});

// ── 4. Declaration hygiene ───────────────────────────────────────────────────

describe('package.json hygiene', () => {
    test('each dotted twin targets the exact same file as its extensionless sibling', () => {
        for (const mod of CORE_MODULES) {
            const extensionless = pkg.exports[`./core/${mod}`];
            const dotted = pkg.exports[`./core/${mod}.js`];
            expect(dotted).toBeDefined();
            expect(dotted.default).toBe(extensionless.default);
            expect(dotted.types).toBe(extensionless.types);
        }
    });

    test('there are exactly 5 dotted ./core/*.js keys', () => {
        const dottedKeys = Object.keys(pkg.exports).filter(
            (k) => k.startsWith('./core/') && k.endsWith('.js'),
        );
        expect(dottedKeys.sort()).toEqual(
            CORE_MODULES.map((mod) => `./core/${mod}.js`).sort(),
        );
    });
});

// ── 5. Crypto KAT fixtures are private subpaths (BL-946) ────────────────────
//
// `matchExports` (§ above) returns the resolved TARGET, so a match against a
// `null`-target key and "no key matches at all" both read as `null` — the
// matcher's return shape cannot distinguish them. Per the plan, that is
// acceptable ONLY because the tests below separately assert (in "the two
// null-target patterns exist verbatim…") that the null keys are actually
// present in the declared map, so "resolves to null" is never a vacuous
// pass here.

const FIXTURES = [
    'composite-kat-regen',
    'composite-mldsa65-ecdsaP256',
    'composite-mldsa65-ed25519',
    'xwing-ietf-kat',
];

/** The two null-target subpath patterns this task adds (both spellings). */
const FIXTURE_NULL_KEYS = [
    './crypto/pkc/__fixtures__/*.js',
    './crypto/pkc/__fixtures__/*',
];

const FIXTURE_EXTENSIONLESS_SPECIFIERS = FIXTURES.map(
    (f) => `@awacloud/fw/crypto/pkc/__fixtures__/${f}`,
);
const FIXTURE_DOTTED_SPECIFIERS = FIXTURES.map(
    (f) => `@awacloud/fw/crypto/pkc/__fixtures__/${f}.js`,
);
const FIXTURE_POSITIVE_CONTROL_SPECIFIERS = [
    '@awacloud/fw/crypto/pkc/hybridKem',
    '@awacloud/fw/crypto/pkc/hybridKem.js',
];

describe('exports map — crypto KAT fixtures are private subpaths (BL-946)', () => {
    test('the two null-target patterns exist verbatim in the declared map (non-vacuous premise)', () => {
        for (const key of FIXTURE_NULL_KEYS) {
            expect(Object.prototype.hasOwnProperty.call(pkg.exports, key)).toBe(true);
            expect(pkg.exports[key]).toBe(null);
        }
    });

    for (const fixture of FIXTURES) {
        test(`./crypto/pkc/__fixtures__/${fixture} and its .js twin resolve to a null target in the declared map`, () => {
            expect(matchExports(pkg.exports, `./crypto/pkc/__fixtures__/${fixture}`)).toBe(null);
            expect(matchExports(pkg.exports, `./crypto/pkc/__fixtures__/${fixture}.js`)).toBe(null);
        });
    }

    test('positive control: hybridKem still matches the ./crypto/* wildcard, both spellings', () => {
        const extensionless = matchExports(pkg.exports, './crypto/pkc/hybridKem');
        const dotted = matchExports(pkg.exports, './crypto/pkc/hybridKem.js');
        expect(extensionless).not.toBe(null);
        expect(dotted).not.toBe(null);
        expect(existsSync(join(PKG, 'src', 'crypto', 'pkc', 'hybridKem.js'))).toBe(true);
    });

    test.if(NODE_OK)('real Node resolution: fixtures throw ERR_PACKAGE_PATH_NOT_EXPORTED, hybridKem resolves', () => {
        const results = nodeResolveAll([
            ...FIXTURE_EXTENSIONLESS_SPECIFIERS,
            ...FIXTURE_DOTTED_SPECIFIERS,
            ...FIXTURE_POSITIVE_CONTROL_SPECIFIERS,
        ]);
        for (const spec of [...FIXTURE_EXTENSIONLESS_SPECIFIERS, ...FIXTURE_DOTTED_SPECIFIERS]) {
            expect(results[spec]).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
        }
        for (const spec of FIXTURE_POSITIVE_CONTROL_SPECIFIERS) {
            expect(results[spec]).toBe('OK');
        }
    });

    test('package.json hygiene: both `files` negations for the fixtures are present', () => {
        expect(pkg.files).toContain('!src/**/__fixtures__/**');
        expect(pkg.files).toContain('!dist/types/**/__fixtures__/**');
    });
});
