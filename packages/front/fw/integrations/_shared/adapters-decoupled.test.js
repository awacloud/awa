// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_shared/adapters-decoupled.test.js
/**
 * @fileoverview Decoupling gate for the 6 shipped bundler-adapter entry
 * points (Vite, esbuild, Rollup, Webpack, Bun, Turbopack): each must import
 * and construct with default options without throwing, and NONE of
 * `packages/front/fw/integrations/**` may hold a code import of a
 * removal-list path (`tools/build/`, `tools/types/`, `scan-modules`) —
 * those live only in test-side dev imports (see `_shared/resolver-parity.
 * test.js`), never in shipped `integrations/**` code.
 *
 * This is the equivalence coverage fw/BATCH_17 task 02 never had for the
 * integrations surface: once green, BATCH_17 task 03 (originals removal)
 * re-runs its straggler grep UNCHANGED and it must come back clean.
 */

import { describe, it, expect, afterAll } from 'bun:test';
import { readdirSync, statSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const INTEGRATIONS_ROOT = resolve(HERE, '..'); // _shared/ -> integrations/
const SELF_FILE = fileURLToPath(import.meta.url);

// ── (a) 6/6 adapters import + construct with default options, no throw ─────

describe('adapter entry points — import + construct with default options (6/6)', () => {
    it('vite: default export constructs a Vite plugin object', async () => {
        const { default: fwVite } = await import('../vite/index.js');
        expect(() => {
            const plugin = fwVite();
            expect(plugin.name).toBe('@awacloud/fw');
            expect(typeof plugin.resolveId).toBe('function');
            expect(typeof plugin.load).toBe('function');
        }).not.toThrow();
    });

    it('esbuild: default export constructs an esbuild plugin object', async () => {
        const { default: fwEsbuild } = await import('../esbuild/index.js');
        expect(() => {
            const plugin = fwEsbuild();
            expect(plugin.name).toBe('@awacloud/fw');
            expect(typeof plugin.setup).toBe('function');
        }).not.toThrow();
    });

    it('rollup: default export constructs a Rollup plugin object', async () => {
        const { default: fwRollup } = await import('../rollup/index.js');
        expect(() => {
            const plugin = fwRollup();
            expect(plugin.name).toBe('@awacloud/fw');
            expect(typeof plugin.resolveId).toBe('function');
            expect(typeof plugin.load).toBe('function');
        }).not.toThrow();
    });

    it('webpack: FwWebpackPlugin constructs (side-effect-free — apply() is not called)', async () => {
        const { FwWebpackPlugin } = await import('../webpack/index.js');
        expect(() => {
            const plugin = new FwWebpackPlugin();
            expect(typeof plugin.apply).toBe('function');
        }).not.toThrow();
    });

    it('bun: default export constructs a Bun plugin object', async () => {
        const { default: fwBun } = await import('../bun/index.js');
        expect(() => {
            const plugin = fwBun();
            expect(plugin.name).toBe('@awacloud/fw');
            expect(typeof plugin.setup).toBe('function');
        }).not.toThrow();
    });

    it('turbopack: fwTurbopack constructs (materializes into an isolated temp dir, not the repo tree)', async () => {
        // Unlike the other 5, construction here is NOT side-effect-free — it
        // rm/mkdir/writes the virtual modules to disk up-front (documented
        // behaviour, see turbopack/index.js). Redirect `outDir` to a disposable
        // temp directory so this gate never touches the repo working tree.
        const { fwTurbopack } = await import('../turbopack/index.js');
        const tmp = mkdtempSync(join(tmpdir(), 'fw-turbopack-gate-'));
        turbopackTmpDirs.push(tmp);
        expect(() => {
            const { resolveAlias, outDir } = fwTurbopack({ outDir: tmp });
            expect(outDir).toBe(tmp);
            expect(resolveAlias['virtual:@awacloud/fw/preset']).toBeDefined();
        }).not.toThrow();
    });
});

/** @type {string[]} */
const turbopackTmpDirs = [];
afterAll(() => {
    while (turbopackTmpDirs.length) {
        try { rmSync(turbopackTmpDirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

// ── (b) grep-gate: no code import of removal-list paths under integrations/ ─

const REMOVAL_LIST = ['tools/build/', 'tools/types/', 'scan-modules'];
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.d.ts']);
// Lines that are actual module-resolution statements — the only place a
// removal-list path would constitute a real code dependency. Deliberately
// narrow (vs. grepping the whole file) so JSDoc prose describing the
// relationship to `tools/build/**` (e.g. esbuild/backend.js, bun/index.js)
// never false-positives this gate.
const IMPORT_LINE_RE = /(^|\s)(import\s|import\()|(?:^|[^.\w])require\(/;

/**
 * Recursively list every file under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
function listFilesRecursive(dir) {
    /** @type {string[]} */
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            if (entry === 'node_modules' || entry === '.tmp') continue;
            out.push(...listFilesRecursive(full));
        } else {
            out.push(full);
        }
    }
    return out;
}

/**
 * Extract only the import/require statement lines of a source file (skips
 * comments, prose, string-literal assertions — the things a naive whole-file
 * grep would false-positive on).
 * @param {string} content
 * @returns {string[]}
 */
function importLines(content) {
    return content.split('\n').filter((line) => IMPORT_LINE_RE.test(line));
}

describe('grep-gate — no integrations/** code import of a removal-list path', () => {
    const integrationsRoot = INTEGRATIONS_ROOT; // packages/front/fw/integrations/
    const allFiles = listFilesRecursive(integrationsRoot)
        .filter((f) => CODE_EXTENSIONS.has(f.slice(f.lastIndexOf('.'))))
        // Exclude README.md prose (not a code file anyway — CODE_EXTENSIONS
        // already excludes .md) and this test's own file (its string literals
        // name the removal-list paths in comments/constants, not in an actual
        // import/require statement — excluded defensively regardless).
        .filter((f) => f !== SELF_FILE);

    it('scanned at least the 6 adapter entry points + core.js + config-resolve.js', () => {
        const relFiles = allFiles.map((f) => relative(integrationsRoot, f).replace(/\\/g, '/'));
        for (const expected of [
            'vite/index.js', 'esbuild/index.js', 'rollup/index.js',
            'webpack/index.js', 'bun/index.js', 'turbopack/index.js',
            '_shared/core.js', '_shared/config-resolve.js',
        ]) {
            expect(relFiles).toContain(expected);
        }
    });

    it('no import/require line references tools/build/, tools/types/ or scan-modules', () => {
        /** @type {{ file: string, line: string }[]} */
        const offenders = [];
        for (const file of allFiles) {
            const content = readFileSync(file, 'utf8');
            for (const line of importLines(content)) {
                if (REMOVAL_LIST.some((needle) => line.includes(needle))) {
                    offenders.push({ file: relative(integrationsRoot, file), line: line.trim() });
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('sanity check: the import-line matcher itself catches a synthetic offending import', () => {
        // Guards against IMPORT_LINE_RE silently matching nothing (a gate that
        // can never fail is not a gate).
        const synthetic = "import { scanAll } from '../../modlib/tools/build/scan-modules.js';";
        expect(importLines(synthetic)).toHaveLength(1);
        expect(REMOVAL_LIST.some((needle) => synthetic.includes(needle))).toBe(true);
    });
});
