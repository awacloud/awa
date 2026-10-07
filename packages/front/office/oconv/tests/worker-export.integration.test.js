// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Integration test — the `./src/worker.js` exports key
 * (BL-1278, publication-maturity-oconv W2 task 01).
 *
 * The Worker entry is exported under a key that MIRRORS its file path, so the
 * specifier `@awacloud/oconv/src/worker.js` reaches the same file under Node's
 * `exports` resolution AND under a prefix-only browser import map
 * (`@awacloud/oconv/` → package root) — one specifier, both regimes.
 *
 * Bun alone cannot prove an exports-key fix (it resolves leniently), so the
 * authoritative legs run in a real `node --input-type=module` subprocess.
 * That subprocess runs from the PACKAGE directory: the repo root carries no
 * `node_modules/@awacloud/oconv` link, so Node reaches the package through
 * its self-reference (nearest `package.json` name + `exports`), which applies
 * exactly the rules a published-tarball consumer gets. When `node` is absent
 * the Node legs are skipped with the reason printed, never silently passed.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');

const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

const WORKER_SPECIFIER = '@awacloud/oconv/src/worker.js';
const NOT_EXPORTED_SPECIFIER = '@awacloud/oconv/src/oconv.js';

const NODE_OK = (() => {
    try {
        return Bun.spawnSync(['node', '--version']).exitCode === 0;
    } catch {
        return false;
    }
})();
if (!NODE_OK) {
    console.log('[worker-export] `node` not found on PATH — Node resolution legs skipped');
}

/**
 * Resolve specifiers in one real Node ESM subprocess.
 *
 * @param {string[]} specifiers
 * @returns {Record<string, string>} specifier → resolved URL or error code.
 */
function nodeResolveAll(specifiers) {
    const script = `
        const out = {};
        for (const s of ${JSON.stringify(specifiers)}) {
            try { out[s] = import.meta.resolve(s); }
            catch (e) { out[s] = e.code || 'THROW'; }
        }
        console.log(JSON.stringify(out));
    `;
    const res = Bun.spawnSync(['node', '--input-type=module', '-e', script], {
        cwd: PKG,
        env: { ...process.env, TZ: 'Etc/UTC' },
    });
    if (res.exitCode !== 0) {
        throw new Error(`node subprocess exited ${res.exitCode}: ${res.stderr.toString()}`);
    }
    return JSON.parse(res.stdout.toString().trim().split('\n').pop());
}

describe('exports map — the worker entry is exported under its own path', () => {
    test('manifest declares "./src/worker.js" → "./src/worker.js"', () => {
        expect(pkg.exports['./src/worker.js']).toBe('./src/worker.js');
        expect(pkg.exports['.']).toBe('./src/main.js');
    });

    test('Bun resolves @awacloud/oconv/src/worker.js to the worker file', () => {
        const resolved = import.meta.resolve(WORKER_SPECIFIER).replaceAll('\\', '/');
        expect(resolved.endsWith('oconv/src/worker.js')).toBe(true);
    });

    test.skipIf(!NODE_OK)('Node resolves @awacloud/oconv/src/worker.js to the worker file', () => {
        const results = nodeResolveAll([WORKER_SPECIFIER]);
        expect(results[WORKER_SPECIFIER].endsWith('oconv/src/worker.js')).toBe(true);
    });

    test.skipIf(!NODE_OK)('negative control: Node refuses @awacloud/oconv/src/oconv.js (the key is specific, not a wildcard)', () => {
        const results = nodeResolveAll([WORKER_SPECIFIER, NOT_EXPORTED_SPECIFIER]);
        // Falsification guard: the same subprocess resolves the exported key.
        expect(results[WORKER_SPECIFIER].endsWith('oconv/src/worker.js')).toBe(true);
        expect(results[NOT_EXPORTED_SPECIFIER]).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });
});
