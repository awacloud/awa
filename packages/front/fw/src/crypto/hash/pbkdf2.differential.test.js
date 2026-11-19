// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test of `pbkdf2.js` against itself: the default path (no
// `Prff`: every iteration after the first is two SHA-256 compressions on
// the HMAC inner and outer states) against the general RFC 8018 §5.2 loop
// the same module runs when a PRF is passed explicitly (`Prff = H` disables
// the two-compression path). No reference file: owner amendment OP-B35-1116.
// Every random input is drawn once, before the two compared calls.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { pbkdf2 } from './pbkdf2.js';
import { hmac } from './hmac.js';
import { sha256 } from './sha256.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';
import { internalOf } from '../../core/internal.js';

const ba = bitArray.factory();
const u8 = utf8.factory();
const hx = hex.factory();
const H = hmac.factory(ba, u8, sha256.factory(ba, u8));
const fast = pbkdf2.factory(ba, u8, H);

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

const rnd = xorshift32(0x35A00019);
const below = (n) => rnd() % n;
const randomBits = (nBytes) => {
    const out = new Uint8Array(nBytes);
    for (let i = 0; i < nBytes; i++) out[i] = rnd() & 0xff;
    return ba.ui8_to_ba(out);
};
const randomAscii = (n) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(0x20 + below(0x5f));
    return s;
};
const LENGTHS = [8, 128, 256, 384, 512, 520];

// The WEAK-count warning fires on every count below 100 000.
const savedWarn = console.warn;
beforeAll(() => { console.warn = () => {}; });
afterAll(() => {
    console.warn = savedWarn;
    expect(console.warn).toBe(savedWarn);
});

/**
 * Both paths on the same inputs: the default (two compressions) and the
 * general loop (`Prff = H`).
 */
const both = (password, salt, count, length) => [
    fast(password, salt, count, length),
    fast(password, salt, count, length, H)
];

describe('pbkdf2 differential — the default path is the two-compression one', () => {
    test('the fast-path preconditions hold for the default PRF', () => {
        const prf = new H.fn(ba.ui8_to_ba(u8.toBytes('password')));
        expect(prf._baseHash[0]._h.length).toBe(8);
        expect(prf._baseHash[1]._h.length).toBe(8);
        expect(typeof internalOf(prf._hash).compress).toBe('function');
        expect(prf._hash.fn.prototype.blockSize).toBe(512);
    });
});

describe('pbkdf2 differential — PBKDF2-HMAC-SHA-256 known answers on both paths', () => {
    const KAT = [
        [1, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
        [2, 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'],
        [4096, 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a']
    ];
    for (const [count, expected] of KAT) {
        test(`"password" / "salt", count ${count}, 256 bits`, () => {
            const [d, g] = both('password', 'salt', count, 256);
            expect(toHex(d)).toBe(expected);
            expect(toHex(g)).toBe(expected);
        });
    }
});

describe('pbkdf2 differential — default path == general loop', () => {
    test('200 random cases (password and salt 0..80 bytes, count 1..50)', () => {
        for (let c = 0; c < 200; c++) {
            const password = randomBits(below(81));
            const salt = randomBits(below(81));
            const count = 1 + below(50);
            const length = LENGTHS[below(LENGTHS.length)];
            const [d, g] = both(password, salt, count, length);
            expect(d).not.toBe(false);
            expect(d).toEqual(g);
        }
    });

    test('password longer than 64 bytes (the HMAC key is hashed), 20 cases', () => {
        for (let c = 0; c < 20; c++) {
            const password = randomBits(65 + below(136));
            const salt = randomBits(below(81));
            const count = 1 + below(50);
            const length = LENGTHS[below(LENGTHS.length)];
            const [d, g] = both(password, salt, count, length);
            expect(d).not.toBe(false);
            expect(d).toEqual(g);
        }
    });

    test('string password and salt, 20 cases', () => {
        for (let c = 0; c < 20; c++) {
            const password = randomAscii(below(81));
            const salt = randomAscii(below(81));
            const count = 1 + below(50);
            const length = LENGTHS[below(LENGTHS.length)];
            const [d, g] = both(password, salt, count, length);
            expect(d).not.toBe(false);
            expect(d).toEqual(g);
        }
    });

    test('count 1000, 5 cases', () => {
        for (let c = 0; c < 5; c++) {
            const password = randomBits(below(81));
            const salt = randomBits(below(81));
            const length = LENGTHS[below(LENGTHS.length)];
            const [d, g] = both(password, salt, 1000, length);
            expect(d).not.toBe(false);
            expect(d).toEqual(g);
        }
    });
});

describe('pbkdf2 differential — error and edge parity', () => {
    test('count 0, NaN and -1, length -1 return false on both paths', () => {
        expect(both('password', 'salt', 0, 256)).toEqual([false, false]);
        expect(both('password', 'salt', NaN, 256)).toEqual([false, false]);
        expect(both('password', 'salt', -1, 256)).toEqual([false, false]);
        expect(both('password', 'salt', 2, -1)).toEqual([false, false]);
    });

    test('length 0 returns [] on both paths', () => {
        expect(both('password', 'salt', 2, 0)).toEqual([[], []]);
    });
});
