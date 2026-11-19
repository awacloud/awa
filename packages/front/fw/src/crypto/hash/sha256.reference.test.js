// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the fast `sha256` (unrolled int32 compression, byte
// fast path in `update`) against its logical reference (the rolled 64-round
// loop of `9e89e3d06^`). Every random input is drawn once, before the two
// compared calls.

import { describe, test, expect } from 'bun:test';
import { sha256 } from './sha256.js';
import { sha224 } from './sha224.js';
import { createSha256Reference } from './sha256.reference.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';
import { internalOf } from '../../core/internal.js';

const ba = bitArray.factory();
const u8 = utf8.factory();
const hx = hex.factory();
const fast = sha256.factory(ba, u8);
const fast224 = sha224.factory(fast);
const ref = createSha256Reference(ba, u8);

const toHex = (words) => hx.fromBytes(ba.ba_to_ui8(words));

/**
 * One xorshift32 stream, literal seed, shared by the whole file.
 * @param {number} seed
 * @returns {() => number} Unsigned 32-bit values.
 */
function xorshift32(seed) {
    let s = seed >>> 0;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s;
    };
}

const rnd = xorshift32(0x35A00009);
const below = (n) => rnd() % n;
const randomBytes = (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = rnd() & 0xff;
    return out;
};
const randomAscii = (n) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(0x20 + below(0x5f));
    return s;
};

describe('sha256.reference — FIPS 180-4 through the reference', () => {
    test('SHA-256("abc")', () => {
        expect(toHex(ref.hash('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    test('SHA-256("")', () => {
        expect(toHex(ref.hash(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
});

describe('sha256.reference — differential against the fast module', () => {
    test('one-shot hash on random bytes of lengths 0..300 and the block edges', () => {
        const lengths = [];
        for (let n = 0; n <= 300; n++) lengths.push(n);
        lengths.push(1000, 4095, 4096, 4097, 65549, 1048576);
        for (const n of lengths) {
            const data = randomBytes(n);
            const r = toHex(ref.hash(data));
            const f = toHex(fast.hash(data));
            expect(f).toBe(r);
        }
        expect(lengths.length).toBe(307);
    });

    test('input forms: string, Uint8Array and bitArray of the same content', () => {
        for (let c = 0; c < 20; c++) {
            const s = randomAscii(below(200));
            const bytes = u8.toBytes(s);
            const words = ba.ui8_to_ba(bytes);
            const expected = toHex(ref.hash(s));
            expect(toHex(ref.hash(bytes))).toBe(expected);
            expect(toHex(ref.hash(words))).toBe(expected);
            expect(toHex(fast.hash(s))).toBe(expected);
            expect(toHex(fast.hash(bytes))).toBe(expected);
            expect(toHex(fast.hash(words))).toBe(expected);
        }
    });

    test('streaming in 4 chunks alternating Uint8Array and bitArray, and a mid-stream clone', () => {
        for (let c = 0; c < 100; c++) {
            const msg = randomBytes(below(2001));
            const cuts = [below(msg.length + 1), below(msg.length + 1), below(msg.length + 1)].sort((x, y) => x - y);
            const bounds = [0, ...cuts, msg.length];
            const chunks = [];
            for (let i = 0; i < 4; i++) {
                const part = msg.slice(bounds[i], bounds[i + 1]);
                chunks.push(i % 2 === 0 ? part : ba.ui8_to_ba(part));
            }
            const oneShot = toHex(ref.hash(msg));
            for (const impl of [ref, fast]) {
                const h = new impl.fn();
                h.update(chunks[0]).update(chunks[1]);
                const clone = new impl.fn(h);
                h.update(chunks[2]).update(chunks[3]);
                clone.update(chunks[2]).update(chunks[3]);
                expect(toHex(h.finalize())).toBe(oneShot);
                expect(toHex(clone.finalize())).toBe(oneShot);
            }
            expect(toHex(fast.hash(msg))).toBe(oneShot);
        }
    });

    test('makeSha with the SHA-224 IV and 7 output words equals the fast sha224', () => {
        const iv224 = [
            0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
            0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4
        ];
        const ref224 = ref.makeSha(iv224, 7);
        for (let c = 0; c < 100; c++) {
            const msg = randomBytes(below(600));
            const r = ref224.hash(msg);
            const f = fast224.hash(msg);
            expect(r.length).toBe(7);
            expect(toHex(f)).toBe(toHex(r));
        }
    });

    test('compress: 1000 random (state, block) pairs, on copies', () => {
        const fastCompress = internalOf(fast).compress;
        expect(typeof fastCompress).toBe('function');
        for (let c = 0; c < 1000; c++) {
            const h = [];
            for (let i = 0; i < 8; i++) h.push(rnd() | 0);
            const w = [];
            for (let i = 0; i < 16; i++) w.push(rnd() | 0);
            const hr = h.slice(), wr = w.slice();
            const hf = h.slice(), wf = w.slice();
            ref.compress(hr, wr);
            fastCompress(hf, wf);
            expect(hf).toEqual(hr);
            expect(wf).toEqual(w);
        }
    });
});
