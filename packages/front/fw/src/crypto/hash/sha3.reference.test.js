// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the fast `sha3` (Keccak-f[1600] unrolled on int32
// locals, absorption four bytes per word) against its logical reference (the
// rolled permutation and the byte-by-byte sponge of `abf082855^`). Every
// random input is drawn once, before the two compared calls.

import { describe, test, expect } from 'bun:test';
import { sha3 } from './sha3.js';
import { createSha3Reference } from './sha3.reference.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';

const ba = bitArray.factory();
const u8 = utf8.factory();
const hx = hex.factory();
const fast = sha3.factory(ba, u8);
const ref = createSha3Reference(ba, u8);

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

const rnd = xorshift32(0x35A00008);
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

/**
 * Run `fn` with `console.warn` silenced, restored in `finally`.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function quiet(fn) {
    const warn = console.warn;
    console.warn = () => {};
    try { return fn(); } finally { console.warn = warn; }
}

const FIXED = ['sha3_224', 'sha3_256', 'sha3_384', 'sha3_512'];
const XOFS = ['shake128', 'shake256'];
const SHAKE_BITS = [8, 256, 1344, 1352, 4096];
const RATES = [72, 104, 136, 144, 168];
const STREAMING = ['sha3_224_hash', 'sha3_256_hash', 'sha3_384_hash', 'sha3_512_hash'];

describe('sha3.reference — FIPS 202 through the reference', () => {
    test('SHA3-256("")', () => {
        expect(toHex(ref.sha3_256(''))).toBe('a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
    });

    test('SHA3-256("abc")', () => {
        expect(toHex(ref.sha3_256('abc'))).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
    });

    test('SHAKE128("", 256 bits)', () => {
        expect(toHex(ref.shake128('', 256))).toBe('7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26');
    });
});

describe('sha3.reference — differential against the fast module', () => {
    test('the six one-shot functions on lengths 0..300, the rate edges and the large sizes', () => {
        const lengths = [];
        for (let n = 0; n <= 300; n++) lengths.push(n);
        for (const r of RATES) lengths.push(r - 1, r, r + 1, 2 * r);
        lengths.push(1000, 4095, 4096, 4097, 65549);
        let compared = 0;
        for (const n of lengths) {
            const data = randomBytes(n);
            for (const name of FIXED) {
                const r = toHex(ref[name](data));
                const f = toHex(fast[name](data));
                expect(f).toBe(r);
                compared++;
            }
            for (const name of XOFS) {
                for (const bits of SHAKE_BITS) {
                    const r = toHex(ref[name](data, bits));
                    const f = toHex(fast[name](data, bits));
                    expect(r.length).toBe(bits / 4);
                    expect(f).toBe(r);
                    compared++;
                }
            }
        }
        expect(lengths.length).toBe(326);
        expect(compared).toBe(326 * 14);
    });

    test('input forms: string, Uint8Array and bitArray of the same content', () => {
        for (let c = 0; c < 20; c++) {
            const s = randomAscii(below(400));
            const bytes = u8.toBytes(s);
            const words = ba.ui8_to_ba(bytes);
            for (const name of [...FIXED, ...XOFS]) {
                const call = (impl, data) => toHex(name.startsWith('shake') ? impl[name](data, 256) : impl[name](data));
                const expected = call(ref, s);
                for (const impl of [ref, fast]) {
                    expect(call(impl, s)).toBe(expected);
                    expect(call(impl, bytes)).toBe(expected);
                    expect(call(impl, words)).toBe(expected);
                }
            }
        }
    });

    test('streaming: 50 messages per sha3_*_hash cut at 3 random points', () => {
        for (const name of STREAMING) {
            for (let c = 0; c < 50; c++) {
                const msg = randomBytes(below(1001));
                const cuts = [below(msg.length + 1), below(msg.length + 1), below(msg.length + 1)].sort((x, y) => x - y);
                const bounds = [0, ...cuts, msg.length];
                const chunks = [];
                for (let i = 0; i < 4; i++) chunks.push(msg.slice(bounds[i], bounds[i + 1]));
                const oneShot = toHex(ref[name].hash(msg));
                for (const impl of [ref, fast]) {
                    const h = new impl[name].fn();
                    for (const chunk of chunks) h.update(chunk);
                    expect(toHex(h.finalize())).toBe(oneShot);
                }
                expect(toHex(fast[name].hash(msg))).toBe(oneShot);
            }
        }
    });

    test('error parity: SHAKE length 0 and 7, a second finalize()', () => {
        const data = randomBytes(below(300));
        const r0 = ref.shake128(data, 0);
        const f0 = fast.shake128(data, 0);
        expect(Array.isArray(r0)).toBe(true);
        expect(toHex(f0)).toBe(toHex(r0));

        const r7 = quiet(() => ref.shake128(data, 7));
        const f7 = quiet(() => fast.shake128(data, 7));
        expect(r7).toBe(false);
        expect(f7).toBe(r7);

        for (const name of STREAMING) {
            const results = [ref, fast].map((impl) => {
                const h = new impl[name].fn();
                h.update(data);
                const first = toHex(h.finalize());
                const second = quiet(() => h.finalize());
                return { first, second };
            });
            expect(results[0].second).toBe(false);
            expect(results[1]).toEqual(results[0]);
        }
    });
});
