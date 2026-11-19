// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — durable guard for `graphic/BATCH_21` task 06
 * ("doc-samples-dispositions", BL-200).
 *
 * The audit that motivated this file found `docs/**\/*.md` code samples
 * importing `'@awacloud/fw/core/runtime.js'` — a form fw's `exports` map did
 * NOT declare then (it exposed only the extension-less `"./core/runtime"`
 * key; fw has since declared the `.js` twin of every core subpath). A sample that merely RESOLVES is
 * not evidence it is correct or loadable: Bun's resolver is measurably
 * laxer than the declared map for this package (BATCH_16 `graphic.tween`
 * easing finding; BATCH_18 exports-map finding — see
 * `tests/exports-map.integration.test.js`'s own header), so this guard
 * parses the manifests itself rather than trusting `import.meta.resolve`
 * alone, and additionally proves the root barrel LOADS under real Node
 * (resolvability is not loadability).
 *
 * Three legs:
 *   (a) every `@awacloud/graphic-anim` specifier in a fenced ```js block
 *       under `docs/**\/*.md` matches a DECLARED key of the live
 *       `package.json` `exports` (exact keys + the `./build/*`,
 *       `./standalone/*` patterns);
 *   (b) every `@awacloud/fw*` specifier matches a DECLARED key of
 *       `packages/front/fw/package.json` `exports` (same matcher);
 *   (c) the graphic-anim root barrel loads in one real
 *       `node --input-type=module -e "await import('@awacloud/graphic-anim')"`
 *       subprocess, run from the package directory (workspace `node_modules`
 *       symlinks only resolve from there — confirmed by hand before writing
 *       this test: the same import from the repo root throws
 *       `ERR_MODULE_NOT_FOUND` for the bare package name, unrelated to the
 *       exports-map question this file gates).
 *
 * Relative specifiers are skipped except the perf harness's repo-internal
 * `./src/perf/harness.js` form (`docs/api/perf.md`), which is pinned to its
 * one corrected shape.
 *
 * fw has since declared the `.js` twin of every core subpath, and the
 * package's docs samples write the `.js` spelling everywhere
 * (`tests/fw-specifiers.integration.test.js` holds the one-spelling rule);
 * the earlier `docs/hypertree.md` known-residue exception is gone.
 *
 * **Falsification (manual, transcript in the task 06 report).** The
 * happy-path assertions below were proven non-vacuous by temporarily editing
 * a real docs page (`docs/api/math/scalar.md`) to carry an unsanctioned
 * `@awacloud/graphic-anim/not-a-real-subpath` specifier, re-running this
 * file (`bun test tests/docs-samples-resolution.integration.test.js`) and
 * observing a red failure naming that exact specifier, then restoring the
 * page byte-identically (`git diff` clean) and re-running to green. See the
 * report for the captured before/after output.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const DOCS_DIR = join(PKG, 'docs');
const FW_PKG_DIR = join(PKG, '..', '..', 'fw');

const graphicAnimPkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const fwPkg = JSON.parse(readFileSync(join(FW_PKG_DIR, 'package.json'), 'utf8'));

/**
 * The perf harness's one sanctioned relative specifier
 * (`docs/api/perf.md`, package-root-relative, repo-internal only).
 */
const PINNED_RELATIVE = './src/perf/harness.js';

// ── Corpus walk + extraction ─────────────────────────────────────────────

/**
 * @param {string} dir
 * @returns {string[]} Every `.md` file under `dir`, recursively.
 */
function walkMarkdown(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walkMarkdown(p));
        else if (entry.endsWith('.md')) out.push(p);
    }
    return out;
}

/**
 * @param {string} text Full file text.
 * @returns {string[]} The contents of every fenced ```js block.
 */
function extractJsFences(text) {
    const fences = [];
    const re = /```js\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(text))) fences.push(m[1]);
    return fences;
}

/**
 * @param {string} code One fenced block's source.
 * @returns {string[]} Every static `from '…'` and dynamic `import('…')`
 *   string specifier in the block.
 */
function extractSpecifiers(code) {
    const specs = [];
    const reFrom = /from\s+['"]([^'"]+)['"]/g;
    const reImport = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = reFrom.exec(code))) specs.push(m[1]);
    while ((m = reImport.exec(code))) specs.push(m[1]);
    return specs;
}

/**
 * Every `(docPath, specifier)` pair found across the corpus, `docPath`
 * relative to `docs/` with forward slashes.
 *
 * @returns {{ file: string, specifier: string }[]}
 */
function collectDocSpecifiers() {
    const out = [];
    for (const abs of walkMarkdown(DOCS_DIR)) {
        const file = relative(DOCS_DIR, abs).replace(/\\/g, '/');
        const text = readFileSync(abs, 'utf8');
        for (const fence of extractJsFences(text)) {
            for (const specifier of extractSpecifiers(fence)) {
                out.push({ file, specifier });
            }
        }
    }
    return out;
}

// ── Exports-map matching (Node's PACKAGE_EXPORTS_RESOLVE, applied to the
//    DECLARED map — never `import.meta.resolve` alone; see file header) ────

/**
 * @param {object} exportsMap
 * @param {string} subpath `"."` or `"./…"`.
 * @returns {string|object|null}
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

/** `@scope/pkg/x/y` → `./x/y`; the bare package name → `.`. */
function toSubpath(specifier, pkgName) {
    const rest = specifier.slice(pkgName.length);
    return rest === '' ? '.' : `.${rest}`;
}

/**
 * Classify one `(file, specifier)` pair against the two declared maps.
 *
 * @returns {'ok'|'violation'|'skip'} `'skip'` for a relative
 *   specifier that is neither the pinned harness form nor a violation of it.
 */
function classify({ file, specifier }) {
    if (specifier.startsWith('@awacloud/graphic-anim')) {
        const subpath = toSubpath(specifier, '@awacloud/graphic-anim');
        return matchExports(graphicAnimPkg.exports, subpath) !== null ? 'ok' : 'violation';
    }
    if (specifier.startsWith('@awacloud/fw')) {
        const subpath = toSubpath(specifier, '@awacloud/fw');
        return matchExports(fwPkg.exports, subpath) !== null ? 'ok' : 'violation';
    }
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
        if (file === 'api/perf.md') {
            return specifier === PINNED_RELATIVE ? 'ok' : 'violation';
        }
        return 'skip';
    }
    // Anything else (e.g. a bare specifier from an unrelated package) is
    // outside this guard's declared scope — never silently accepted.
    return 'skip';
}

// ── (a) + (b): the real corpus, classified ───────────────────────────────

describe('doc samples — every import specifier resolves against a DECLARED exports key', () => {
    const all = collectDocSpecifiers();

    test('the corpus is non-empty (scanner is not vacuous)', () => {
        expect(all.length).toBeGreaterThan(20);
    });

    for (const pair of all) {
        const verdict = classify(pair);
        test(`${pair.file}: '${pair.specifier}' is sanctioned`, () => {
            expect(['ok', 'skip']).toContain(verdict);
        });
    }

    test('the matcher is not vacuous: an unsanctioned graphic-anim subpath is rejected', () => {
        expect(classify({ file: 'zzz.md', specifier: '@awacloud/graphic-anim/not-a-real-subpath' }))
            .toBe('violation');
    });

    test('the matcher is not vacuous: an unsanctioned fw subpath is rejected', () => {
        // `./src/*` is not an fw export, whatever twins fw declares.
        expect(classify({ file: 'zzz.md', specifier: '@awacloud/fw/src/core/runtime.js' }))
            .toBe('violation');
    });
});

// ── (c): real Node load of the root barrel ───────────────────────────────

/** Is a `node` binary usable here? */
const NODE_OK = (() => {
    const r = spawnSync('node', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
})();

// Never skipped: without a `node` binary this leg FAILS rather than going quiet.
describe('doc samples — the root barrel LOADS under real Node (resolvability is not loadability)', () => {
    test("node --input-type=module -e \"await import('@awacloud/graphic-anim')\" succeeds", () => {
        if (!NODE_OK) throw new Error('node is not on PATH: this leg cannot run');
        const res = spawnSync(
            'node',
            ['--input-type=module', '-e', "await import('@awacloud/graphic-anim'); console.log('LOAD_OK')"],
            { cwd: PKG, encoding: 'utf8' },
        );
        expect(res.stdout).toContain('LOAD_OK');
        expect(res.status).toBe(0);
    });
});

// ── Declaration hygiene: the two package.json files this test reads exist ─

describe('doc samples — the two manifests this guard parses are the live ones', () => {
    test('graphic-anim package.json exists and has an exports map', () => {
        expect(existsSync(join(PKG, 'package.json'))).toBe(true);
        expect(typeof graphicAnimPkg.exports).toBe('object');
    });

    test('fw package.json exists and has an exports map', () => {
        expect(existsSync(join(FW_PKG_DIR, 'package.json'))).toBe(true);
        expect(fwPkg.name).toBe('@awacloud/fw');
        expect(typeof fwPkg.exports).toBe('object');
    });
});
