// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Static browser-realm gate — `@awacloud/md`'s `src/` must stay
 * browser-safe: no Node API, no `@awacloud/*` specifier that 404s under a
 * prefix-only import map (BL-1098 class), and a single, named entry point
 * into the runtime-bootstrap machinery.
 *
 * Walks `src/**\/*.js`, excluding `*.test.js` and `_test-runtime.js` (the
 * latter is itself a Node-side test helper that legitimately imports
 * `@awacloud/fw/core/runtime.js` under `bun:test` — the same walker shape as
 * `tests/errors-doc-snapshot.test.js`).
 *
 * Enumeration command (re-run to reproduce the file list this test scans):
 *
 * ```sh
 * find packages/front/office/md/src -name '*.js' \
 *   ! -name '*.test.js' ! -name '_test-runtime.js'
 * ```
 *
 * Four assertions per file:
 *   1. no `/\bnode:/` (a Node builtin specifier, matched only inside a
 *      quoted string — `node:` as an object-literal key, e.g. `{ node: cur }`
 *      in the AST walkers, is not a specifier and must not trip this rule);
 *   2. no `/\bprocess\./`;
 *   3. no `/\bBun\./`;
 *   4. no `/\brequire\(/`.
 * Plus a package-wide rule: every `@awacloud/<pkg>/<path>['"]` specifier ends
 * in `.js` before its closing quote (the extension-less form 404s under a
 * browser import map that has no `exports`-map awareness — BL-1098).
 *
 * `bootstrap.js` is the ONLY file in `src/` that instantiates anything
 * (`ai/batches/types/office/BATCH_46/03-bootstrap.md`), so it is the only
 * file allowed to import BOTH `@awacloud/fw/core/runtime.js` (the
 * `ModuleRuntime` class) and `./main.js` (the manifest it registers).
 * `src/main.js` is listed alongside it in the plan's own wording; today
 * `main.js` imports neither, so the check is a whitelist ({main.js,
 * bootstrap.js}), not a requirement that both do.
 *
 * Non-vacuity: a second `test` runs the checker function on an in-memory
 * string built by concatenation (so this file's OWN source, which mentions
 * these tokens in prose above, never matches itself) and asserts every rule
 * fires on a deliberately unsafe needle.
 *
 * **Deviation from the plan's literal specifier regex.** The plan gives
 * `/@awacloud\/[a-z-]+\/[^'"]+['"]/` for the ".js-suffixed" rule. Measured
 * against this very package's `src/`, that pattern is not anchored to an
 * opening quote, so its `[^'"]+` run starts at the bare `@awacloud/` text
 * inside a JSDoc backtick-quoted path (backticks are not `'`/`"`) and does
 * not stop until the NEXT real quote character anywhere later in the file —
 * in practice the first string literal several lines down — producing a
 * multi-hundred-character "specifier" and a false failure on files that
 * import nothing but .js-suffixed specifiers (`common.js`,
 * `ast/manipulation.js` measured). {@link AWACLOUD_SPECIFIER_RE} below
 * requires the SAME quote character on both ends
 * (`(['"])@awacloud\/…\1`), which only matches an actual import/export
 * specifier and reproduces the plan's intent without the false positive.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../src');

const EXCLUDED_NAMES = new Set(['_test-runtime.js']);

const NODE_SPECIFIER_RE = /['"]node:/;
const PROCESS_RE = /\bprocess\./;
const BUN_RE = /\bBun\./;
const REQUIRE_RE = /\brequire\(/;
// Anchored to a matching quote on BOTH ends (see the file header's
// "Deviation" note) — the plan's un-anchored `[^'"]+['"]` over-consumes
// across a JSDoc backtick-quoted path into the next real quote in the file.
const AWACLOUD_SPECIFIER_RE = /(['"])(@awacloud\/[a-z0-9-]+\/[^'"]+)\1/g;

/**
 * Walk `dir` for `*.js` files, excluding `*.test.js` and the names in
 * {@link EXCLUDED_NAMES}.
 *
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]} Absolute paths.
 */
function collectSrcFiles(dir, out) {
    out = out || [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSrcFiles(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.js')
            && !entry.name.endsWith('.test.js') && !EXCLUDED_NAMES.has(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Check one file's text for every browser-realm violation.
 *
 * @param {string} text
 * @returns {string[]} Human-readable violation messages, empty when clean.
 */
function checkBrowserRealm(text) {
    const violations = [];
    if (NODE_SPECIFIER_RE.test(text)) violations.push('imports a node: specifier');
    if (PROCESS_RE.test(text)) violations.push('references the process global');
    if (BUN_RE.test(text)) violations.push('references the Bun global');
    if (REQUIRE_RE.test(text)) violations.push('calls require(...)');
    let m;
    AWACLOUD_SPECIFIER_RE.lastIndex = 0;
    while ((m = AWACLOUD_SPECIFIER_RE.exec(text)) !== null) {
        const specifier = m[2];
        if (!specifier.endsWith('.js')) {
            violations.push(`@awacloud/* specifier is not .js-suffixed: ${specifier}`);
        }
    }
    return violations;
}

describe('browser-realm static gate (src/**/*.js)', () => {
    const files = collectSrcFiles(SRC_DIR);

    test('at least one file was scanned (walker non-vacuity)', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    test('no src/ file imports node:, process, Bun or require(...); every @awacloud/* specifier is .js-suffixed', () => {
        const offenders = [];
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            const violations = checkBrowserRealm(text);
            if (violations.length > 0) {
                offenders.push({ file: relative(SRC_DIR, file), violations });
            }
        }
        expect(offenders).toEqual([]);
    });

    test('src/main.js and src/bootstrap.js are the only files importing @awacloud/fw/core/runtime.js or ./main.js', () => {
        const RUNTIME_IMPORT_RE = /['"]@awacloud\/fw\/core\/runtime\.js['"]/;
        const MAIN_IMPORT_RE = /from\s+['"]\.\.?\/main\.js['"]/;
        const ALLOWED = new Set(['main.js', 'bootstrap.js']);
        const offenders = [];
        for (const file of files) {
            const rel = relative(SRC_DIR, file);
            const base = rel.split(/[/\\]/).pop();
            if (ALLOWED.has(base)) continue;
            const text = readFileSync(file, 'utf8');
            if (RUNTIME_IMPORT_RE.test(text)) offenders.push(`${rel}: imports @awacloud/fw/core/runtime.js`);
            if (MAIN_IMPORT_RE.test(text)) offenders.push(`${rel}: imports ./main.js`);
        }
        expect(offenders).toEqual([]);
    });

    test('non-vacuity: the checker reports every rule on a deliberately unsafe needle', () => {
        // Built by concatenation so this file's own source (the prose above,
        // and this very test) never matches the rules it is testing.
        const needle = [
            'import x from ' + "'" + 'node:' + "fs'" + ';',
            (function () { return 'process' + '.' + 'exit(1);'; })(),
            (function () { return 'Bun' + '.' + 'file(x);'; })(),
            'const y = ' + 'require' + '(' + "'x'" + ')' + ';',
            "import { z } from '" + '@awacloud/' + 'md/extra/emoji' + "';", // NOT .js-suffixed
        ].join('\n');

        const violations = checkBrowserRealm(needle);
        expect(violations).toContain('imports a node: specifier');
        expect(violations).toContain('references the process global');
        expect(violations).toContain('references the Bun global');
        expect(violations).toContain('calls require(...)');
        expect(violations.some((v) => v.startsWith('@awacloud/* specifier is not .js-suffixed'))).toBe(true);
    });
});
