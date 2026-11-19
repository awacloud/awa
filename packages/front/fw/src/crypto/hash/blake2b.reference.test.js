// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the fast `blake2b` (generated inline mixing on int32
// locals) against its logical reference (the rolled G function and SIGMA
// round loop of `c71ad9989^`). Every random input is drawn once, before the
// two compared calls; outputs are compared as bytes.

import { describe, test, expect, spyOn } from 'bun:test';
import { blake2b } from './blake2b.js';
import { createBlake2bReference } from './blake2b.reference.js';

const fast = blake2b.factory();
const ref = createBlake2bReference();

/**
 * Lower-case hex of a byte array (or the string `'false'`).
 * @param {Uint8Array|false} bytes
 * @returns {string}
 */
const toHex = (bytes) => (bytes === false
    ? 'false'
    : Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));

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

const rnd = xorshift32(0x35A00010);
const below = (n) => rnd() % n;
const randomBytes = (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = rnd() & 0xff;
    return out;
};

/**
 * Absorb `chunks` into a fresh context of `impl` and digest it.
 * @param {any} impl  A `blake2b.factory()`-shaped API.
 * @param {Uint8Array[]} chunks
 * @param {number} outLen
 * @param {Uint8Array} [key]
 * @param {Uint8Array} [salt]
 * @param {Uint8Array} [person]
 * @returns {Uint8Array|false}
 */
function streamed(impl, chunks, outLen, key, salt, person) {
    const c = impl.create(outLen, key, salt, person);
    for (const chunk of chunks) expect(c.update(chunk)).toBe(true);
    return c.digest();
}

/**
 * Cut `msg` at 3 random points into 4 chunks (empty chunks possible; every
 * fourth call forces two equal cuts so an empty middle chunk always occurs).
 * @param {Uint8Array} msg
 * @param {number} c  The case index.
 * @returns {Uint8Array[]}
 */
function cut3(msg, c) {
    const a = below(msg.length + 1);
    const b = c % 4 === 0 ? a : below(msg.length + 1);
    const d = below(msg.length + 1);
    const cuts = [a, b, d].sort((x, y) => x - y);
    const bounds = [0, ...cuts, msg.length];
    const chunks = [];
    for (let i = 0; i < 4; i++) chunks.push(msg.slice(bounds[i], bounds[i + 1]));
    return chunks;
}

describe('blake2b.reference — RFC 7693 Appendix A through the reference', () => {
    test('BLAKE2b-512("abc")', () => {
        expect(toHex(ref.hash(new Uint8Array([0x61, 0x62, 0x63])))).toBe(
            'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1'
            + '7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
    });

    test('BLAKE2b-512("")', () => {
        expect(toHex(ref.hash(new Uint8Array(0)))).toBe(
            '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419'
            + 'd25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce');
    });
});

describe('blake2b.reference — differential against the fast module', () => {
    test('one-shot on random bytes of lengths 0..300 and large edges, output lengths 1/20/32/48/64', () => {
        const lengths = [];
        for (let n = 0; n <= 300; n++) lengths.push(n);
        lengths.push(1000, 4095, 4096, 4097, 65549);
        let cases = 0;
        for (const n of lengths) {
            const data = randomBytes(n);
            for (const outLen of [1, 20, 32, 48, 64]) {
                const r = ref.hash(data, outLen);
                const f = fast.hash(data, outLen);
                expect(r.length).toBe(outLen);
                expect(toHex(f)).toBe(toHex(r));
                cases++;
            }
        }
        expect(lengths.length).toBe(306);
        expect(cases).toBe(1530);
    });

    test('keyed: key lengths 1, 32, 64 on 50 random messages each', () => {
        let cases = 0;
        for (const keyLen of [1, 32, 64]) {
            for (let c = 0; c < 50; c++) {
                const key = randomBytes(keyLen);
                const msg = randomBytes(below(600));
                const r = ref.hash(msg, 64, key);
                const f = fast.hash(msg, 64, key);
                expect(r).not.toBe(false);
                expect(toHex(f)).toBe(toHex(r));
                cases++;
            }
        }
        expect(cases).toBe(150);
    });

    test('streaming: 100 random messages cut at 3 points, unkeyed and keyed, equal to the one-shot', () => {
        let cases = 0;
        let emptyChunks = 0;
        for (let c = 0; c < 100; c++) {
            const msg = randomBytes(below(2001));
            const chunks = cut3(msg, c);
            const key = randomBytes(1 + below(64));
            const outLen = 1 + below(64);
            emptyChunks += chunks.filter((ch) => ch.length === 0).length;
            for (const k of [undefined, key]) {
                const oneShot = toHex(ref.hash(msg, outLen, k));
                const r = toHex(streamed(ref, chunks, outLen, k));
                const f = toHex(streamed(fast, chunks, outLen, k));
                expect(r).toBe(oneShot);
                expect(f).toBe(oneShot);
                expect(toHex(fast.hash(msg, outLen, k))).toBe(oneShot);
                cases++;
            }
        }
        expect(cases).toBe(200);
        expect(emptyChunks).toBeGreaterThanOrEqual(25);
    });

    test('streaming with a random 16-byte salt and personalisation: 30 cases', () => {
        for (let c = 0; c < 30; c++) {
            const msg = randomBytes(below(2001));
            const chunks = cut3(msg, c);
            const salt = randomBytes(16);
            const person = randomBytes(16);
            const key = c % 2 === 0 ? undefined : randomBytes(1 + below(64));
            const outLen = 1 + below(64);
            const r = streamed(ref, chunks, outLen, key, salt, person);
            const f = streamed(fast, chunks, outLen, key, salt, person);
            expect(r).not.toBe(false);
            expect(toHex(f)).toBe(toHex(r));
            // The salt and personalisation reach the state.
            expect(toHex(r)).not.toBe(toHex(ref.hash(msg, outLen, key)));
        }
    });

    test('block boundaries: lengths 127, 128, 129, 255, 256, 257, unkeyed, keyed and streamed at 128', () => {
        let cases = 0;
        for (const n of [127, 128, 129, 255, 256, 257]) {
            const msg = randomBytes(n);
            const key = randomBytes(32);
            const chunks = [msg.slice(0, Math.min(128, n)), msg.slice(Math.min(128, n))];
            for (const k of [undefined, key]) {
                const r = toHex(ref.hash(msg, 64, k));
                expect(toHex(fast.hash(msg, 64, k))).toBe(r);
                expect(toHex(streamed(ref, chunks, 64, k))).toBe(r);
                expect(toHex(streamed(fast, chunks, 64, k))).toBe(r);
                cases++;
            }
        }
        expect(cases).toBe(12);
    });

    test('error parity: same value and same warnings on both sides', () => {
        const msg = randomBytes(40);
        const key65 = randomBytes(65);
        const salt15 = randomBytes(15);
        const person15 = randomBytes(15);
        const tail = randomBytes(10);
        const calls = [
            ['outLen 0', (impl) => impl.hash(msg, 0)],
            ['outLen 65', (impl) => impl.hash(msg, 65)],
            ['create outLen 0', (impl) => impl.create(0)],
            ['create outLen 65', (impl) => impl.create(65)],
            ['key of 65 bytes', (impl) => impl.hash(msg, 64, key65)],
            ['salt of 15 bytes', (impl) => impl.create(64, undefined, salt15)],
            ['person of 15 bytes', (impl) => impl.create(64, undefined, undefined, person15)],
            ['update after digest', (impl) => {
                const c = impl.create(32);
                c.update(msg);
                const d = c.digest();
                return [toHex(d), c.update(tail)];
            }],
            ['second digest', (impl) => {
                const c = impl.create(32);
                c.update(msg);
                const d = c.digest();
                return [toHex(d), c.digest()];
            }]
        ];
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            for (const [label, call] of calls) {
                warn.mockClear();
                const r = call(ref);
                const refWarns = warn.mock.calls.map((w) => w.join(' '));
                warn.mockClear();
                const f = call(fast);
                const fastWarns = warn.mock.calls.map((w) => w.join(' '));
                expect([label, f]).toEqual([label, r]);
                expect([label, fastWarns]).toEqual([label, refWarns]);
                expect(refWarns.length).toBe(1);
            }
        } finally {
            warn.mockRestore();
        }
    });
});
