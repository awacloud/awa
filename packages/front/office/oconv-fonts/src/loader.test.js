// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The explicit async byte path (office/BATCH_37 task 03, gate G-OF1).
 *
 * Bun leg of the loader proof: `fetch()` of `file:` URLs relative to
 * `src/loader.js`, plus the `file:` file-system fallback driven through a
 * stubbed `fetch`. The Node.js leg runs in a real node subprocess
 * (`tests/oconv-fonts-node.integration.test.js`); the browser leg (the
 * loader's import-map reachability, BL-1098 class) was measured in a
 * browser and is quoted in the office/BATCH_37/03 report.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { loadDefaultFaces, registerDefaultFaces } from './loader.js';

const VENDOR = new URL('../vendor/', import.meta.url);
const PROVENANCE = JSON.parse(readFileSync(new URL('PROVENANCE.json', VENDOR), 'utf8'));
const RECORDS = PROVENANCE.trees.find((t) => t.id === 'liberation').files;

/** Frozen mapping (W0 FINDINGS § 4): Sans for the four text classes, Mono for code. */
const MAPPING = {
    regular: 'LiberationSans-Regular.ttf',
    bold: 'LiberationSans-Bold.ttf',
    italic: 'LiberationSans-Italic.ttf',
    boldItalic: 'LiberationSans-BoldItalic.ttf',
    mono: 'LiberationMono-Regular.ttf'
};

/** An http(s) base: the fetch path alone decides (no file-system fallback). */
const HTTP_BASE = 'https://faces.invalid/liberation/';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = (file) => RECORDS.find((r) => r.path === `liberation/${file}`);
const fileBytes = (file) => new Uint8Array(readFileSync(new URL(`liberation/${file}`, VENDOR)));

describe('loadDefaultFaces', () => {
    test('returns a frozen map of exactly the five mapped keys', async () => {
        const faces = await loadDefaultFaces();
        expect(Object.isFrozen(faces)).toBe(true);
        expect(Object.keys(faces)).toEqual(Object.keys(MAPPING));
    });

    test('each value is a Uint8Array whose sha256 and length equal PROVENANCE.json for the mapped file', async () => {
        const faces = await loadDefaultFaces();
        for (const [key, file] of Object.entries(MAPPING)) {
            const rec = record(file);
            expect(rec).toBeDefined();
            expect(faces[key]).toBeInstanceOf(Uint8Array);
            expect(faces[key].byteLength).toBe(rec.bytes);
            expect(sha256(faces[key])).toBe(rec.sha256);
        }
    });

    test('opts.baseUrl redirects the fetch (string without trailing slash accepted)', async () => {
        const href = new URL('liberation', VENDOR).href; // no trailing "/"
        const faces = await loadDefaultFaces({ baseUrl: href });
        expect(sha256(faces.mono)).toBe(record(MAPPING.mono).sha256);
    });

    test('a baseUrl with no face files rejects with oconv-fonts: cannot load (Bun file: 200-then-ENOENT trap)', async () => {
        const missing = new URL('does-not-exist/', VENDOR);
        await expect(loadDefaultFaces({ baseUrl: missing })).rejects.toThrow('oconv-fonts: cannot load');
    });

    test('a non-2xx response rejects and names the status', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = async () => new Response('nope', { status: 404 });
        try {
            await expect(loadDefaultFaces({ baseUrl: HTTP_BASE })).rejects.toThrow(/oconv-fonts: cannot load .*status 404/);
        } finally {
            globalThis.fetch = original;
        }
    });

    test('an empty 200 body rejects', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = async () => new Response(new Uint8Array(0), { status: 200 });
        try {
            await expect(loadDefaultFaces({ baseUrl: HTTP_BASE })).rejects.toThrow(/oconv-fonts: cannot load .*status 200/);
        } finally {
            globalThis.fetch = original;
        }
    });

    test('a rejected fetch of an http(s) URL rejects with its reason and cause', async () => {
        const original = globalThis.fetch;
        const reason = new TypeError('fetch failed');
        globalThis.fetch = async () => { throw reason; };
        try {
            const err = await loadDefaultFaces({ baseUrl: HTTP_BASE }).catch((e) => e);
            expect(err.message).toBe(`oconv-fonts: cannot load ${HTTP_BASE}LiberationSans-Regular.ttf (fetch failed)`);
            expect(err.cause).toBe(reason);
        } finally {
            globalThis.fetch = original;
        }
    });

    test('file: URLs whose fetch rejects (Node.js) are read from the file system, byte-equal to the vendored files', async () => {
        const original = globalThis.fetch;
        let calls = 0;
        globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
        try {
            const faces = await loadDefaultFaces();
            expect(calls).toBe(5);
            for (const [key, file] of Object.entries(MAPPING)) {
                expect(sha256(faces[key])).toBe(record(file).sha256);
            }
        } finally {
            globalThis.fetch = original;
        }
    });

    test('file: URLs answered non-2xx or empty by fetch are read from the file system', async () => {
        const original = globalThis.fetch;
        let n = 0;
        globalThis.fetch = async () => (n++ % 2 ? new Response('nope', { status: 404 }) : new Response(new Uint8Array(0)));
        try {
            const faces = await loadDefaultFaces();
            expect(faces.mono).toEqual(fileBytes(MAPPING.mono));
        } finally {
            globalThis.fetch = original;
        }
    });

    test('a file: fallback that cannot read the file rejects with the same error shape and its cause', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
        try {
            const err = await loadDefaultFaces({ baseUrl: new URL('does-not-exist/', VENDOR) }).catch((e) => e);
            expect(err.message.startsWith('oconv-fonts: cannot load file:')).toBe(true);
            expect(err.cause).toBeDefined();
            expect(err.cause.code).toBe('ENOENT');
        } finally {
            globalThis.fetch = original;
        }
    });

    test('a file: fallback that reads an empty file rejects', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'oconv-fonts-empty-'));
        try {
            for (const file of Object.values(MAPPING)) writeFileSync(join(dir, file), new Uint8Array(0));
            await expect(loadDefaultFaces({ baseUrl: pathToFileURL(dir + '/') }))
                .rejects.toThrow(/oconv-fonts: cannot load file:.*\(empty file\)/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test('the map survives structuredClone with every length (worker envelope payload)', async () => {
        const faces = await loadDefaultFaces();
        const clone = structuredClone(faces);
        for (const key of Object.keys(MAPPING)) {
            expect(clone[key]).toBeInstanceOf(Uint8Array);
            expect(clone[key].byteLength).toBe(faces[key].byteLength);
        }
    });
});

describe('registerDefaultFaces', () => {
    test('before registration the name is absent on a bare runtime and a resolve throws', () => {
        const runtime = new ModuleRuntime();
        expect(runtime.has('oconvDefaultFaces')).toBe(false);
        expect(() => runtime.resolve('oconvDefaultFaces')).toThrow('Module not found: oconvDefaultFaces');
    });

    test('registers oconvDefaultFaces on a real fw runtime; resolve(...).defaultFaces() is byte-equal to the files', async () => {
        const runtime = new ModuleRuntime();
        const returned = await registerDefaultFaces(runtime);
        expect(returned).toBe(runtime);
        expect(runtime.has('oconvDefaultFaces')).toBe(true);
        expect(runtime.has('oconvDefaultFaces', '1.0.0')).toBe(true);

        const api = runtime.resolve('oconvDefaultFaces');
        expect(api.family).toBe('Liberation');
        expect(api.release).toBe('2.1.5');
        const faces = api.defaultFaces();
        expect(faces.regular).toEqual(fileBytes(MAPPING.regular));
        expect(faces.mono).toEqual(fileBytes(MAPPING.mono));
        for (const [key, file] of Object.entries(MAPPING)) {
            expect(sha256(faces[key])).toBe(record(file).sha256);
        }
    });

    test('a failed load registers nothing', async () => {
        const runtime = new ModuleRuntime();
        await expect(registerDefaultFaces(runtime, { baseUrl: new URL('does-not-exist/', VENDOR) }))
            .rejects.toThrow('oconv-fonts: cannot load');
        expect(runtime.has('oconvDefaultFaces')).toBe(false);
    });
});

/**
 * BL-1268 pin: what a SECOND `registerDefaultFaces(runtime)` call does to
 * `resolve('oconvDefaultFaces')`, on the current `@awacloud/fw` runtime
 * (`register()` re-points the same-name/same-version `latestDef`, but a
 * resolve already cached in `runtime.instances` is untouched — see
 * `packages/front/fw/src/core/runtime.js` `register`/`resolve`/`invalidate`
 * JSDoc). Each `registerDefaultFaces` call re-fetches the five faces, so
 * `.defaultFaces().regular` is a FRESH `Uint8Array` per call — identity
 * (`toBe`) distinguishes which registration a given resolve actually used.
 *
 * `resolve(spec, { isolation: true })` calls the CURRENT `latestDef`'s
 * factory without touching `runtime.instances` (fw JSDoc: "never cache,
 * always fresh") — it is used here only to PEEK at which descriptor is
 * currently latest, without creating the cached instance a real resolve
 * would. It is not itself "a resolve" for BL-1268's purposes.
 */
describe('registerDefaultFaces — a second call (BL-1268)', () => {
    test('two registrations, no resolve in between: resolve returns the SECOND map', async () => {
        const runtime = new ModuleRuntime();
        await registerDefaultFaces(runtime);
        const afterFirst = runtime.resolve('oconvDefaultFaces', { isolation: true }).defaultFaces().regular;
        await registerDefaultFaces(runtime);
        const afterSecond = runtime.resolve('oconvDefaultFaces', { isolation: true }).defaultFaces().regular;
        expect(afterSecond).not.toBe(afterFirst); // sanity: each registration really loaded fresh bytes

        const resolved = runtime.resolve('oconvDefaultFaces').defaultFaces().regular; // the first REAL resolve
        expect(resolved).toBe(afterSecond);
        expect(resolved).not.toBe(afterFirst);
    });

    test('register -> resolve -> register again -> resolve: still the FIRST map (instance cache wins)', async () => {
        const runtime = new ModuleRuntime();
        await registerDefaultFaces(runtime);
        const firstResolved = runtime.resolve('oconvDefaultFaces').defaultFaces().regular;

        await registerDefaultFaces(runtime);
        const secondDescriptorPeek = runtime.resolve('oconvDefaultFaces', { isolation: true }).defaultFaces().regular;
        expect(secondDescriptorPeek).not.toBe(firstResolved); // sanity: the 2nd registration loaded fresh bytes

        const secondResolved = runtime.resolve('oconvDefaultFaces').defaultFaces().regular;
        expect(secondResolved).toBe(firstResolved); // cached instance from the FIRST resolve, untouched by register()
        expect(secondResolved).not.toBe(secondDescriptorPeek);
    });

    test('runtime.invalidate("oconvDefaultFaces") after a second registration makes resolve return the SECOND map', async () => {
        const runtime = new ModuleRuntime();
        await registerDefaultFaces(runtime);
        const firstResolved = runtime.resolve('oconvDefaultFaces').defaultFaces().regular;

        await registerDefaultFaces(runtime);
        const secondDescriptorPeek = runtime.resolve('oconvDefaultFaces', { isolation: true }).defaultFaces().regular;

        const { invalidated } = runtime.invalidate('oconvDefaultFaces');
        expect(invalidated.length).toBeGreaterThan(0);

        const afterInvalidate = runtime.resolve('oconvDefaultFaces').defaultFaces().regular;
        expect(afterInvalidate).toBe(secondDescriptorPeek);
        expect(afterInvalidate).not.toBe(firstResolved);
    });

    test('runtime.has("oconvDefaultFaces") is true after each registration, and register() returns the runtime (chainable)', async () => {
        const runtime = new ModuleRuntime();
        expect(runtime.has('oconvDefaultFaces')).toBe(false);

        const r1 = await registerDefaultFaces(runtime);
        expect(runtime.has('oconvDefaultFaces')).toBe(true);
        expect(r1).toBe(runtime);

        const r2 = await registerDefaultFaces(runtime);
        expect(runtime.has('oconvDefaultFaces')).toBe(true);
        expect(r2).toBe(runtime);
    });
});
