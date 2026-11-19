// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the fast `chacha20.js` against its logical reference
// `chacha20.reference.js` (the parent of 6ffb948ef). Every random input is
// drawn once, before the two compared calls; outputs are compared as bytes.

import { describe, test, expect } from 'bun:test';
import { chacha20 } from './chacha20.js';
import { createChacha20Reference } from './chacha20.reference.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _fast = chacha20.factory();
const _ref = createChacha20Reference();

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

/** xorshift32 (Marsaglia), one stream for the whole file. */
function xorshift32(seed) {
    let s = seed >>> 0;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s;
    };
}
const _rng = xorshift32(0x35A00007);

function randomBytes(n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = _rng() & 0xff;
    return out;
}

/** Run `fn` with `console.warn` silenced, restored in `finally`. */
function quiet(fn) {
    const warn = console.warn;
    console.warn = () => {};
    try { return fn(); } finally { console.warn = warn; }
}

describe('chacha20 reference vs fast', () => {

    test('RFC 8439 §2.4.2 through the reference', () => {
        const key = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
        const nonce = fromHex('000000000000004a00000000');
        const plaintext = new TextEncoder().encode(
            "Ladies and Gentlemen of the class of '99: " +
            "If I could offer you only one tip for the future, sunscreen would be it."
        );
        expect(plaintext.length).toBe(114);
        const ct = _ref.xor(key, nonce, plaintext, 1);
        expect(toHex(ct)).toBe(
            '6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0bf91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d807ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab77937365af90bbf74a35be6b40b8eedf2785e42874d'
        );
    });

    test('keystream blocks at counters 0, 1, 2, 42, 0xfffffffe, 0xffffffff', () => {
        const key = randomBytes(32);
        const nonce = randomBytes(12);
        const zero = new Uint8Array(64);
        const counters = [0, 1, 2, 42, 0xfffffffe, 0xffffffff];
        for (const counter of counters) {
            const ref = _ref.xor(key, nonce, zero, counter);
            const fast = _fast.xor(key, nonce, zero, counter);
            expect(ref).toBeInstanceOf(Uint8Array);
            expect(toHex(fast)).toBe(toHex(ref));
        }
    });

    test('lengths 0..300, 1000, 4095, 4096, 4097, 65549 with a random counter below 2^31', () => {
        const lengths = [];
        for (let n = 0; n <= 300; n++) lengths.push(n);
        lengths.push(1000, 4095, 4096, 4097, 65549);
        expect(lengths.length).toBe(306);
        for (const n of lengths) {
            const key = randomBytes(32);
            const nonce = randomBytes(12);
            const data = randomBytes(n);
            const counter = _rng() >>> 1;
            const ref = _ref.xor(key, nonce, data, counter);
            const fast = _fast.xor(key, nonce, data, counter);
            expect(ref).toBeInstanceOf(Uint8Array);
            expect(fast.length).toBe(n);
            expect(toHex(fast)).toBe(toHex(ref));
        }
    });

    test('counter guard parity', () => {
        const key = randomBytes(32);
        const nonce = randomBytes(12);
        const cases = [
            { counter: 0xffffffff, data: randomBytes(65) },
            { counter: 0xffffff00, data: randomBytes(256 * 64 + 1) },
        ];
        for (const { counter, data } of cases) {
            const ref = quiet(() => _ref.xor(key, nonce, data, counter));
            const fast = quiet(() => _fast.xor(key, nonce, data, counter));
            expect(ref).toBe(false);
            expect(fast).toBe(ref);
        }
    });

    test('error parity: 31-byte key, 11-byte nonce', () => {
        const key = randomBytes(32);
        const nonce = randomBytes(12);
        const data = randomBytes(64);
        const shortKey = key.subarray(0, 31);
        const shortNonce = nonce.subarray(0, 11);
        const cases = [
            [shortKey, nonce],
            [key, shortNonce],
        ];
        for (const [k, n] of cases) {
            const ref = quiet(() => _ref.xor(k, n, data, 0));
            const fast = quiet(() => _fast.xor(k, n, data, 0));
            expect(ref).toBe(false);
            expect(fast).toBe(ref);
        }
    });
});
