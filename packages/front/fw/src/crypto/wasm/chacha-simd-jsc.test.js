// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// A pinned engine defect, not an fw behaviour. `chacha20poly1305.simd.wasm`
// computes a wrong Poly1305 tag once JavaScriptCore has called `aead_seal` on
// one `WebAssembly.Module` about six times; the ciphertext stays right, and
// the scalar build, V8 (node, Chromium) and a fresh module per call are
// correct. This is why `wasmRuntime` compiles a fresh module on every `load`
// instead of memoising it. Raw WebAssembly, no fw in the loop.
//
// The JSC leg asserts the divergence on purpose: when the engine (or the C
// source) is fixed it fails, which is the signal to revisit the compile memo.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dir;
const KEY = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);
const NONCE = new Uint8Array(12).map((_, i) => (i * 3 + 7) & 0xff);
const PT = new Uint8Array(48).map((_, i) => (i * 17 + 2) & 0xff);
const AAD = new Uint8Array(8).map((_, i) => (i * 13 + 1) & 0xff);
// The tag of the parity vector, as the pure-JS tier, V8 and the scalar build compute it.
const TAG = '388762a4eace486d962a66f5f38e21aa';
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const isJSC = typeof Bun !== 'undefined';

/** The distinct tags `calls` seals on ONE module produce, in order of appearance. */
async function tagsOnOneModule(variant, calls) {
    const mod = await WebAssembly.compile(readFileSync(join(HERE, `chacha20poly1305.${variant}.wasm`)));
    const tags = [];
    for (let i = 0; i < calls; i++) {
        const { exports: ex } = await WebAssembly.instantiate(mod, {});
        const put = (b) => { const p = ex.alloc(b.length); new Uint8Array(ex.memory.buffer, p, b.length).set(b); return p; };
        const k = put(KEY), n = put(NONCE), p = put(PT), a = put(AAD), o = put(new Uint8Array(64));
        ex.aead_seal(k, n, p, 48, a, 8, o);
        const t = hex(new Uint8Array(ex.memory.buffer, o + 48, 16));
        if (!tags.includes(t)) tags.push(t);
    }
    return tags;
}

describe('chacha20poly1305 SIMD on one module (D28)', () => {
    test('the scalar build is stable', async () => {
        expect(await tagsOnOneModule('scalar', 60)).toEqual([TAG]);
    });

    test.if(isJSC)('JSC: the SIMD build diverges after a few calls (pinned engine defect)', async () => {
        const tags = await tagsOnOneModule('simd', 60);
        expect(tags[0]).toBe(TAG);
        expect(tags.length).toBeGreaterThan(1);
    });

    test.if(!isJSC)('V8: the SIMD build is stable', async () => {
        expect(await tagsOnOneModule('simd', 600)).toEqual([TAG]);
    });
});
