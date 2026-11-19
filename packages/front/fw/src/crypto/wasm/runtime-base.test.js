// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The asset base of the WASM tier: `load(name, exports, { baseUrl })` and
// `configure({ baseUrl })` fetch the binaries from a directory the caller
// names (an absolute URL), where they default to this module's own
// directory (`import.meta.url`) — the seam a factory-inlining build, a CDN or
// a Worker needs. Every load still fetches and compiles afresh (D28). A file://
// base on a temporary copy of the binaries stands in for any other origin.

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wasmRuntime } from './runtime.js';
import { wasmSha2 } from './sha2.js';

const HERE = import.meta.dir;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const hex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');

let dir;
let base;
const realFetch = globalThis.fetch;
/** @type {string[]} */
let fetched = [];

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'fw-wasm-base-'));
    copyFileSync(join(HERE, 'sha2.scalar.wasm'), join(dir, 'sha2.scalar.wasm'));
    base = pathToFileURL(dir).href + '/';
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
afterEach(() => { globalThis.fetch = realFetch; fetched = []; });

/** Count the URLs the runtime fetches. */
function spyFetch() {
    globalThis.fetch = (url, init) => { fetched.push(String(url)); return realFetch(url, init); };
}

/** @returns {Promise<string>} SHA-256("abc") through a loaded handle */
async function digestAbc(rt, h) {
    const inBuf = rt.withBytes(h, new TextEncoder().encode('abc'));
    const outPtr = h.alloc(32);
    rt.run(h, 'sha2', [256, inBuf.ptr, inBuf.len, outPtr]);
    const d = hex(rt.readBytes(h, outPtr, 32));
    inBuf.free();
    h.free(outPtr);
    return d;
}

const quiet = async (fn) => {
    const e = console.error; console.error = () => {};
    try { return await fn(); } finally { console.error = e; }
};

describe('wasmRuntime — asset base', () => {
    test('load({ baseUrl }) fetches from that directory', async () => {
        spyFetch();
        const rt = wasmRuntime.factory();
        const h = await rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: base });
        expect(h).not.toBe(false);
        expect(fetched).toEqual([base + 'sha2.scalar.wasm']);
        expect(await digestAbc(rt, h)).toBe(SHA256_ABC);
    });

    test('a base without its trailing slash names the same directory', async () => {
        spyFetch();
        const rt = wasmRuntime.factory();
        expect(await rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: base.slice(0, -1) })).not.toBe(false);
        expect(fetched).toEqual([base + 'sha2.scalar.wasm']);
    });

    test('a base where the binary is absent resolves false (no-throw)', async () => {
        const rt = wasmRuntime.factory();
        const empty = pathToFileURL(join(dir, 'nowhere')).href + '/';
        expect(await quiet(() => rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: empty }))).toBe(false);
    });

    test('a relative base resolves false: the base must be absolute', async () => {
        const rt = wasmRuntime.factory();
        expect(await quiet(() => rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: 'assets/wasm/' }))).toBe(false);
    });

    test('configure({ baseUrl }) sets the default every later load uses — the wrappers included', async () => {
        spyFetch();
        const rt = wasmRuntime.factory();
        rt.configure({ baseUrl: base });
        const sha2 = wasmSha2.factory(rt);
        expect(hex(await sha2.sha256(new TextEncoder().encode('abc')))).toBe(SHA256_ABC);
        expect(fetched).toEqual([base + 'sha2.scalar.wasm']);
    });

    test('configure({ baseUrl: null }) restores the default; a per-call baseUrl wins over it', async () => {
        spyFetch();
        const rt = wasmRuntime.factory();
        rt.configure({ baseUrl: pathToFileURL(join(dir, 'nowhere')).href + '/' });
        expect(await rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: base })).not.toBe(false);
        rt.configure({ baseUrl: null });
        expect(await rt.load('sha2', ['sha2'], { variant: 'scalar' })).not.toBe(false);
        expect(fetched).toEqual([base + 'sha2.scalar.wasm', pathToFileURL(join(HERE, 'sha2.scalar.wasm')).href]);
    });

    test('configure refuses a base that is not an absolute URL', () => {
        const rt = wasmRuntime.factory();
        expect(() => rt.configure({ baseUrl: 'assets/wasm/' })).toThrow(TypeError);
        expect(() => rt.configure({ baseUrl: 42 })).toThrow(TypeError);
    });

    test('the default stays this module\'s own directory', async () => {
        spyFetch();
        const rt = wasmRuntime.factory();
        expect(await rt.load('sha2', ['sha2'], { variant: 'scalar' })).not.toBe(false);
        expect(fetched).toEqual([pathToFileURL(join(HERE, 'sha2.scalar.wasm')).href]);
    });
});

describe('wasmRuntime — the default fetch keeps its scannable shape', () => {
    // Static asset scanners (site-kit's dist module graph) stage the binaries
    // by finding exactly one `new URL(<'./' + m + '.' + v + '.wasm'>, import.meta.url)`.
    test('runtime.js holds exactly one import.meta.url site, in that shape', () => {
        const src = readFileSync(join(HERE, 'runtime.js'), 'utf8');
        expect((src.match(/,\s*import\.meta\.url\s*\)/g) || []).length).toBe(1);
        expect(src.replace(/\s+/g, ' ')).toContain("new URL('./' + wasmModule + '.' + variant + '.wasm', import.meta.url)");
    });
});

describe('wasmRuntime — no compile memo (D28)', () => {
    test('every load fetches afresh', async () => {
        spyFetch();
        const rt = wasmRuntime.factory();
        const x = await rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: base });
        const y = await rt.load('sha2', ['sha2'], { variant: 'scalar', baseUrl: base });
        expect(fetched.length).toBe(2);
        expect(x.instance).not.toBe(y.instance);
    });
});

describe('wasmRuntime — the base under lockdown', () => {
    test('configure({ baseUrl }) works in a locked realm (the gate admits a URL, never bytes)', () => {
        const probe = `
import { wasmRuntime } from ${JSON.stringify(join(HERE, 'runtime.js'))};
import { lockdown } from ${JSON.stringify(resolve(HERE, '..', '..', 'sanity', 'lockdown.js'))};
const out = process.stdout; const write = out.write.bind(out); write('');   // bound before the freeze
lockdown();
const rt = wasmRuntime.factory();
rt.configure({ baseUrl: ${JSON.stringify(base)} });
const h = await rt.load('sha2', ['sha2'], { variant: 'scalar' });
write(JSON.stringify({ ok: h !== false }));
`;
        const proc = Bun.spawnSync(['bun', '-e', probe], { stdout: 'pipe', stderr: 'pipe' });
        expect(JSON.parse(proc.stdout.toString())).toEqual({ ok: true });
    });
});
