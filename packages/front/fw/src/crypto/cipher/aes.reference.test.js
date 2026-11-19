// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test of the logical AES reference (aes.reference.js, the
// constant-time round AES of 240fc703a^) against the fast module (aes.js,
// bitsliced default + T-table path): FIPS-197 Appendix C, the S-box and its
// inverse on every value, the cipher on random keys and blocks of every size,
// error parity, and the generated bit-plane GF(2^8) code of tools/crypto-gen.js
// against the loop form and a scalar multiply.

import { describe, test, expect } from 'bun:test';
import { aes } from './aes.js';
import { createAesReference } from './aes.reference.js';
import { INTERNAL } from '../../core/internal.js';
import { generate } from '../../../tools/crypto-gen.js';

const A = aes.factory();
const I = A[INTERNAL];
const R = createAesReference();

/** The one deterministic xorshift32 of this file. */
const next = (() => {
    let x = 0x35A00005;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; };
})();

const words = (n) => Array.from({ length: n }, next);
const hex = (ws) => ws.map((w) => (w >>> 0).toString(16).padStart(8, '0')).join('');
const fromHex = (h) => Array.from({ length: h.length / 8 }, (_, i) => parseInt(h.slice(8 * i, 8 * i + 8), 16) | 0);
const u32 = (r) => (r === false ? false : Array.from(r, (w) => w >>> 0));

/** Scalar GF(2^8) multiply, shift-and-xor modulo x^8 + x^4 + x^3 + x + 1 (0x11b). */
function gfMul(a, b) {
    let r = 0;
    for (let i = 0; i < 8; i++) {
        if ((b >> i) & 1) r ^= a;
        a <<= 1;
        if (a & 0x100) a ^= 0x11b;
    }
    return r;
}

/** 16 bytes (lane l = byte l) → 8 bit-planes. */
function toPlanes(bytes) {
    const p = new Int32Array(8);
    for (let l = 0; l < 16; l++) for (let k = 0; k < 8; k++) p[k] |= ((bytes[l] >>> k) & 1) << l;
    return p;
}

/** 8 bit-planes → 16 bytes. */
function fromPlanes(p) {
    const out = new Uint8Array(16);
    for (let l = 0; l < 16; l++) { let v = 0; for (let k = 0; k < 8; k++) v |= ((p[k] >>> l) & 1) << k; out[l] = v; }
    return out;
}

/** Run fn with console.warn silenced, restored in finally. */
function quiet(fn) {
    const warn = console.warn;
    console.warn = () => {};
    try { return fn(); } finally { console.warn = warn; }
}

describe('aes reference: FIPS-197 Appendix C', () => {
    const PT = '00112233445566778899aabbccddeeff';
    const cases = [
        ['C.1 AES-128', '000102030405060708090a0b0c0d0e0f', '69c4e0d86a7b0430d8cdb78070b4c55a'],
        ['C.2 AES-192', '000102030405060708090a0b0c0d0e0f1011121314151617', 'dda97ca4864cdfe06eaf70a0ec0d7191'],
        ['C.3 AES-256', '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', '8ea2b7ca516745bfeafc49904b496089'],
    ];
    for (const [name, key, ct] of cases) {
        test(`${name}: encrypts to the vector and decrypts back`, () => {
            const c = R.fn(fromHex(key));
            const out = c.encrypt(fromHex(PT));
            expect(hex(out)).toBe(ct);
            expect(hex(c.decrypt(out))).toBe(PT);
        });
    }
});

describe('aes reference: S-box', () => {
    const all = Uint8Array.from({ length: 256 }, (_, v) => v);

    test('subBytes equals the table and the bitsliced S-box on all 256 values', () => {
        const ref = R.subBytes(all);
        expect(ref).toBeInstanceOf(Uint8Array);
        const bad = [];
        for (let base = 0; base < 256; base += 16) {
            const bs = I.bsSub(all.subarray(base, base + 16));
            for (let l = 0; l < 16; l++) {
                const v = base + l;
                if (ref[v] !== I.sbox[v] || ref[v] !== bs[l]) bad.push(v);
            }
        }
        expect(bad).toEqual([]);
    });

    test('invSubBytes equals the inverse table and the bitsliced inverse on all 256 values', () => {
        const ref = R.invSubBytes(all);
        expect(ref).toBeInstanceOf(Uint8Array);
        const bad = [];
        for (let base = 0; base < 256; base += 16) {
            const bs = I.bsInvSub(all.subarray(base, base + 16));
            for (let l = 0; l < 16; l++) {
                const v = base + l;
                if (ref[v] !== I.sboxInv[v] || ref[v] !== bs[l]) bad.push(v);
            }
        }
        expect(bad).toEqual([]);
    });
});

describe('aes reference: cipher against the fast module', () => {
    for (const n of [4, 6, 8]) {
        test(`500 random (key, block), ${32 * n}-bit key: encrypt and decrypt equal aes.fn and aes.ttable.fn`, () => {
            const bad = [];
            for (let t = 0; t < 500; t++) {
                const key = words(n);
                const block = words(4);
                const r = R.fn(key), rt = R.ttable.fn(key), f = A.fn(key), ft = A.ttable.fn(key);
                const enc = [r, rt, f, ft].map((c) => hex(u32(c.encrypt(block))));
                const dec = [r, rt, f, ft].map((c) => hex(u32(c.decrypt(block))));
                if (new Set(enc).size !== 1 || new Set(dec).size !== 1) bad.push(t);
                if (hex(u32(r.decrypt(fromHex(enc[0])))) !== hex(u32(block))) bad.push(`rt${t}`);
            }
            expect(bad).toEqual([]);
        });
    }

    test('full = false: no decrypt key on either', () => {
        const key = words(4);
        for (const c of [R.fn(key, false), R.ttable.fn(key, false), A.fn(key, false), A.ttable.fn(key, false)]) {
            expect(typeof c.encrypt).toBe('function');
            expect('decrypt' in c).toBe(false);
        }
    });
});

describe('aes reference: error parity', () => {
    test('a key of 5 words is refused by both', () => {
        const key = words(5);
        quiet(() => {
            expect(R.fn(key)).toBe(false);
            expect(A.fn(key)).toBe(false);
            expect(R.ttable.fn(key)).toBe(false);
            expect(A.ttable.fn(key)).toBe(false);
        });
    });

    test('a block of 3 words is refused by both', () => {
        const key = words(4);
        const block = words(3);
        const r = R.fn(key), f = A.fn(key);
        quiet(() => {
            expect(r.encrypt(block)).toBe(false);
            expect(f.encrypt(block)).toBe(false);
            expect(r.decrypt(block)).toBe(false);
            expect(f.decrypt(block)).toBe(false);
        });
    });
});

describe('aes reference: the generated bit-plane GF(2^8) code', () => {
    // The generator's text is the committed fast code (tools/crypto-gen.js --check).
    const G = new Function(generate('aes-gf') + '\nreturn { _bsMul, _bsSq };')();

    test('exhaustive: _bsMul equals gfMulPlanes equals the scalar multiply on all 256 x 256 pairs', () => {
        const bad = [];
        const ga = new Int32Array(8), gr = new Int32Array(8);
        for (let n = 0; n < 65536; n += 16) {
            const as = new Uint8Array(16), bs = new Uint8Array(16);
            for (let l = 0; l < 16; l++) { as[l] = (n + l) >>> 8; bs[l] = (n + l) & 0xff; }
            const pa = toPlanes(as), pb = toPlanes(bs);
            G._bsMul(pa, pb, ga);
            R.gfMulPlanes(pa, pb, gr);
            if (Array.from(ga).join() !== Array.from(gr).join()) bad.push(['planes', n]);
            const out = fromPlanes(ga);
            for (let l = 0; l < 16; l++) if (out[l] !== gfMul(as[l], bs[l])) bad.push([as[l], bs[l]]);
        }
        expect(bad).toEqual([]);
    });

    test('_bsSq equals gfSqPlanes on all 256 values in every lane', () => {
        const bad = [];
        const ga = new Int32Array(8), gr = new Int32Array(8);
        for (let rot = 0; rot < 16; rot++) {
            for (let base = 0; base < 256; base += 16) {
                const bytes = new Uint8Array(16);
                for (let l = 0; l < 16; l++) bytes[(l + rot) & 15] = base + l;
                const p = toPlanes(bytes);
                G._bsSq(p, ga);
                R.gfSqPlanes(p, gr);
                if (Array.from(ga).join() !== Array.from(gr).join()) bad.push(['planes', rot, base]);
                const out = fromPlanes(ga);
                for (let l = 0; l < 16; l++) if (out[l] !== gfMul(bytes[l], bytes[l])) bad.push([rot, bytes[l]]);
            }
        }
        expect(bad).toEqual([]);
    });

    test('aliasing: out === a (and out === b) gives the same planes', () => {
        const a = Int32Array.from({ length: 8 }, () => next() & 0xffff);
        const b = Int32Array.from({ length: 8 }, () => next() & 0xffff);
        const want = new Int32Array(8), wantSq = new Int32Array(8);
        R.gfMulPlanes(a, b, want);
        R.gfSqPlanes(a, wantSq);
        const got = (fn) => { const x = Int32Array.from(a), y = Int32Array.from(b); return Array.from(fn(x, y)); };
        expect(got((x, y) => { G._bsMul(x, y, x); return x; })).toEqual(Array.from(want));
        expect(got((x, y) => { G._bsMul(x, y, y); return y; })).toEqual(Array.from(want));
        expect(got((x, y) => { R.gfMulPlanes(x, y, x); return x; })).toEqual(Array.from(want));
        expect(got((x, y) => { R.gfMulPlanes(x, y, y); return y; })).toEqual(Array.from(want));
        expect(got((x) => { G._bsSq(x, x); return x; })).toEqual(Array.from(wantSq));
        expect(got((x) => { R.gfSqPlanes(x, x); return x; })).toEqual(Array.from(wantSq));
        const sep = new Int32Array(8);
        G._bsMul(a, b, sep);
        expect(Array.from(sep)).toEqual(Array.from(want));
    });
});
