// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Integration test — the default faces load under Node.js
 * (BL-2102, office/LIGHT_10 task 01).
 *
 * `bun test` runs the loader under Bun, whose `fetch` accepts a `file:` URL;
 * Node's `fetch` does not, so the package-relative faces only load there
 * through the loader's file-system fallback. The authoritative legs therefore
 * run in a real `node --input-type=module` subprocess (precedent:
 * `oconv/tests/worker-export.integration.test.js`), from the PACKAGE
 * directory, importing `src/main.js` by its file URL. When `node` is absent
 * the Node legs are skipped with the reason printed, never silently passed.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const MAIN_URL = pathToFileURL(join(PKG, 'src', 'main.js')).href;
/** A directory that exists but holds none of the five face files. */
const NO_FACES_URL = pathToFileURL(join(PKG, 'vendor')).href + '/';

/** Frozen face-map key → vendored file name (Sans x4 + Mono). */
const MAPPING = {
    regular: 'LiberationSans-Regular.ttf',
    bold: 'LiberationSans-Bold.ttf',
    italic: 'LiberationSans-Italic.ttf',
    boldItalic: 'LiberationSans-BoldItalic.ttf',
    mono: 'LiberationMono-Regular.ttf'
};

const NODE_OK = (() => {
    try {
        return Bun.spawnSync(['node', '--version']).exitCode === 0;
    } catch {
        return false;
    }
})();
if (!NODE_OK) {
    console.log('[oconv-fonts-node] `node` not found on PATH — Node loading legs skipped');
}

/**
 * Run the three probes in ONE Node ESM subprocess; each probe reports either
 * its observations or the error message it raised.
 *
 * @returns {{a: object, b: object, c: object}}
 */
function runNodeProbes() {
    const script = `
        const mod = await import(${JSON.stringify(MAIN_URL)});
        const out = {};
        try {
            const faces = await mod.loadDefaultFaces();
            out.a = {
                frozen: Object.isFrozen(faces),
                keys: Object.keys(faces),
                sizes: Object.fromEntries(Object.entries(faces).map(
                    ([k, v]) => [k, v instanceof Uint8Array ? v.byteLength : -1]))
            };
        } catch (e) { out.a = { error: String(e && e.message) }; }
        try {
            await mod.loadDefaultFaces({ baseUrl: ${JSON.stringify(NO_FACES_URL)} });
            out.b = { resolved: true };
        } catch (e) { out.b = { error: String(e && e.message), hasCause: e.cause !== undefined }; }
        try {
            let registered = null;
            const stub = { register(d) { registered = d; return this; } };
            const returned = await mod.registerDefaultFaces(stub);
            out.c = { name: registered && registered.name, chained: returned === stub };
        } catch (e) { out.c = { error: String(e && e.message) }; }
        console.log(JSON.stringify(out));
    `;
    const res = Bun.spawnSync(['node', '--input-type=module', '-e', script], {
        cwd: PKG,
        env: { ...process.env, TZ: 'Etc/UTC' }
    });
    if (res.exitCode !== 0) {
        throw new Error(`node subprocess exited ${res.exitCode}: ${res.stderr.toString()}`);
    }
    return JSON.parse(res.stdout.toString().trim().split('\n').pop());
}

/** @type {{a: object, b: object, c: object}|null} */
let probes = null;
const nodeProbes = () => (probes ??= runNodeProbes());

describe('oconv-fonts under Node.js', () => {
    test.skipIf(!NODE_OK)('loadDefaultFaces() resolves to the frozen five-key map, each face the size of its vendored file', () => {
        const { a } = nodeProbes();
        expect(a.error).toBeUndefined();
        expect(a.frozen).toBe(true);
        expect(a.keys).toEqual(Object.keys(MAPPING));
        for (const [key, file] of Object.entries(MAPPING)) {
            const size = statSync(join(PKG, 'vendor', 'liberation', file)).size;
            expect(size).toBeGreaterThan(0);
            expect(a.sizes[key]).toBe(size);
        }
    });

    test.skipIf(!NODE_OK)('a baseUrl directory without the faces rejects with oconv-fonts: cannot load file:', () => {
        const { b } = nodeProbes();
        expect(b.resolved).toBeUndefined();
        expect(b.error.startsWith('oconv-fonts: cannot load file:')).toBe(true);
        expect(b.hasCause).toBe(true);
    });

    test.skipIf(!NODE_OK)('registerDefaultFaces registers the oconvDefaultFaces descriptor on a stub runtime', () => {
        const { c } = nodeProbes();
        expect(c.error).toBeUndefined();
        expect(c.name).toBe('oconvDefaultFaces');
        expect(c.chained).toBe(true);
    });
});
