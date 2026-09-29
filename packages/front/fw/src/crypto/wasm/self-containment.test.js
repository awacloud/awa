// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';

/**
 * @fileoverview Runtime self-containment gate for `fw/src/crypto/wasm/**`
 * (W0 FINDINGS F7 + Decision D3 §3.1,
 * `ai/plans/wasm-crypto/spikes/w0-decoupling/FINDINGS.md`).
 *
 * `fw/package.json` declares the sibling crypto-build package as a
 * devDependency so `deps_graph`/tooling sees the build/dev-only edge that
 * already exists informally: the `.wasm` binaries colocated under
 * `crypto/wasm/` are copied FROM that package's `dist/` by
 * `wasm-crypto copy` (see `runtime.js`'s file overview). A declared devDep
 * is exactly what would make an ACCIDENTAL runtime import of the package
 * resolve silently — this test is the gate that keeps that from happening:
 * `crypto/wasm/runtime.js` must keep loading the committed local `.wasm`
 * bytes only, never reach into the sibling package at runtime.
 *
 * This file scans every `.js` file under `fw/src/` for:
 *   - a static or dynamic import, or a `require()`, of the sibling crypto
 *     package (bare specifier or any subpath), or
 *   - a relative import whose resolved path escapes into the sibling
 *     package's directory (name segment `fw-wasm-crypto`).
 *
 * The detector is two layers, tested independently below before the real
 * scan runs: `extractSpecifiers` (regex-based import/require specifier
 * extraction — deliberately simple, this is a lint-style gate, not a full
 * parser) and `specifierViolatesContainment` (the forbidden-specifier
 * rule). Keeping the layers separate lets the unit tests below prove each
 * one on synthetic input without embedding a literal forbidden import
 * pattern in this file's own source (which the real scan below also reads).
 */

const SRC_ROOT = resolve(import.meta.dir, '..', '..');
const SIBLING_PKG_SEGMENT = 'fw-wasm-crypto';
const SIBLING_PKG_BARE = '@awacloud/' + SIBLING_PKG_SEGMENT;

/**
 * Absolute paths of every `.js` file under `dir`, recursively.
 * @param {string} dir
 * @returns {string[]}
 */
function listJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules') {
            continue;
        }
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            out.push(...listJsFiles(full));
        } else if (entry.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Extract every static/dynamic import + `require()` specifier in `source`.
 * Regex-based on purpose (this is a lint-style gate over a known, JS+JSDoc,
 * ESM-only tree — not a general JS parser).
 * @param {string} source
 * @returns {string[]}
 */
function extractSpecifiers(source) {
    const re = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
    const specifiers = [];
    let m;
    while ((m = re.exec(source)) !== null) {
        specifiers.push(m[1]);
    }
    return specifiers;
}

/**
 * Whether `specifier`, imported from a file in `fromDir`, reaches the
 * sibling crypto-build package — bare/subpath specifier, or a relative
 * path that resolves into a directory named `fw-wasm-crypto`.
 * @param {string} fromDir
 * @param {string} specifier
 * @returns {boolean}
 */
function specifierViolatesContainment(fromDir, specifier) {
    if (specifier === SIBLING_PKG_BARE || specifier.startsWith(SIBLING_PKG_BARE + '/')) {
        return true;
    }
    if (specifier.startsWith('.')) {
        const resolved = resolve(fromDir, specifier);
        return resolved.split(sep).includes(SIBLING_PKG_SEGMENT);
    }
    return false;
}

/**
 * Every forbidden specifier imported by the file at `absPath` with content
 * `source`.
 * @param {string} absPath
 * @param {string} source
 * @returns {string[]}
 */
function findViolations(absPath, source) {
    const dir = dirname(absPath);
    return extractSpecifiers(source).filter((spec) => specifierViolatesContainment(dir, spec));
}

// ── detector unit tests (synthetic input — proves the gate is not vacuous) ──

describe('extractSpecifiers', () => {
    test('finds a named static import specifier', () => {
        const src = "import { x } from '@awacloud/example';\n";
        expect(extractSpecifiers(src)).toEqual(['@awacloud/example']);
    });

    test('finds a side-effect static import specifier', () => {
        const src = "import '@awacloud/example';\n";
        expect(extractSpecifiers(src)).toEqual(['@awacloud/example']);
    });

    test('finds a dynamic import specifier', () => {
        const src = "const m = await import('@awacloud/example');\n";
        expect(extractSpecifiers(src)).toEqual(['@awacloud/example']);
    });

    test('finds a require() specifier', () => {
        const src = "const m = require('@awacloud/example');\n";
        expect(extractSpecifiers(src)).toEqual(['@awacloud/example']);
    });

    test('does not match a bare assignment or JSDoc prose mention', () => {
        const src = [
            "const NAME = '@awacloud/example';",
            ' * Loaded `@awacloud/example` for illustration.',
        ].join('\n');
        expect(extractSpecifiers(src)).toEqual([]);
    });

    test('finds every specifier in a mixed file, in order', () => {
        const src = [
            "import a from '@awacloud/one';",
            "import '@awacloud/two';",
            "const c = require('@awacloud/three');",
        ].join('\n');
        expect(extractSpecifiers(src)).toEqual(['@awacloud/one', '@awacloud/two', '@awacloud/three']);
    });
});

describe('specifierViolatesContainment', () => {
    const HERE = join(SRC_ROOT, 'crypto', 'wasm');
    const FORBIDDEN_BARE = SIBLING_PKG_BARE;
    const FORBIDDEN_SUBPATH = SIBLING_PKG_BARE + '/dist/sha3.scalar.wasm.js';
    const FORBIDDEN_RELATIVE = '../../../' + SIBLING_PKG_SEGMENT + '/dist/sha3.scalar.wasm.js';

    test('flags the bare package specifier', () => {
        expect(specifierViolatesContainment(HERE, FORBIDDEN_BARE)).toBe(true);
    });

    test('flags a subpath specifier', () => {
        expect(specifierViolatesContainment(HERE, FORBIDDEN_SUBPATH)).toBe(true);
    });

    test('flags a relative path that resolves into the sibling package', () => {
        expect(specifierViolatesContainment(HERE, FORBIDDEN_RELATIVE)).toBe(true);
    });

    test('does not flag an unrelated bare specifier', () => {
        expect(specifierViolatesContainment(HERE, '@awacloud/sd-common')).toBe(false);
    });

    test('does not flag a normal in-tree relative import', () => {
        expect(specifierViolatesContainment(HERE, './runtime.js')).toBe(false);
    });

    test('does not flag a relative import escaping to an unrelated sibling', () => {
        expect(specifierViolatesContainment(HERE, '../../../sd-common/src/index.js')).toBe(false);
    });
});

// ── the real gate ────────────────────────────────────────────────────────────

describe('fw runtime self-containment (F7 / D3 §3.1)', () => {
    test('every file under fw/src/ was scanned (sanity floor)', () => {
        expect(listJsFiles(SRC_ROOT).length).toBeGreaterThan(100);
    });

    test('no file under fw/src/ imports the sibling crypto-build package', () => {
        const offenders = [];
        for (const file of listJsFiles(SRC_ROOT)) {
            const source = readFileSync(file, 'utf8');
            const violations = findViolations(file, source);
            if (violations.length > 0) {
                offenders.push(file + ': ' + violations.join(', '));
            }
        }
        expect(offenders).toEqual([]);
    });
});
