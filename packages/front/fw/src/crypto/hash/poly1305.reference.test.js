// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Differential test: the fast `poly1305.js` (13-bit limbs) against its
// logical reference `poly1305.reference.js` (the BigInt parent of 6ffb948ef).
// Every random input is drawn once, before the two compared calls; tags are
// compared as bytes.

import { describe, test, expect } from 'bun:test';
import { poly1305 } from './poly1305.js';
import { createPoly1305Reference } from './poly1305.reference.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _fast = poly1305.factory();
const _ref = createPoly1305Reference();

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);
const utf8 = (s) => new TextEncoder().encode(s);

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
const _rng = xorshift32(0x35A00017);

function randomBytes(n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = _rng() & 0xff;
    return out;
}

function filled(n, byte) {
    return new Uint8Array(n).fill(byte);
}

/** Run `fn` with `console.warn` silenced, restored in `finally`. */
function quiet(fn) {
    const warn = console.warn;
    console.warn = () => {};
    try { return fn(); } finally { console.warn = warn; }
}

/** Assert both sides give a 16-byte tag and the same bytes. */
function expectSameTag(key, msg) {
    const ref = _ref.mac(key, msg);
    const fast = _fast.mac(key, msg);
    expect(ref).toBeInstanceOf(Uint8Array);
    expect(ref.length).toBe(16);
    expect(toHex(fast)).toBe(toHex(ref));
}

const IETF_CONTRIBUTION =
    "Any submission to the IETF intended by the Contributor for publication " +
    "as all or part of an IETF Internet-Draft or RFC and any statement made " +
    "within the context of an IETF activity is considered an \"IETF Contribution\". " +
    "Such statements include oral statements in IETF sessions, as well as written " +
    "and electronic communications made at any time or place, which are addressed to";

// The RFC 8439 vectors `poly1305.test.js` carries: §2.5.2 and §A.3 #1..#11.
const RFC_VECTORS = [
    { name: '§2.5.2', key: '85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b',
        msg: utf8('Cryptographic Forum Research Group'), tag: 'a8061dc1305136c6c22b8baf0c0127a9' },
    { name: '§A.3 #1', key: '0'.repeat(64),
        msg: new Uint8Array(64), tag: '00000000000000000000000000000000' },
    { name: '§A.3 #2', key: '0000000000000000000000000000000036e5f6b5c5e06070f0efca96227a863e',
        msg: utf8(IETF_CONTRIBUTION), tag: '36e5f6b5c5e06070f0efca96227a863e' },
    { name: '§A.3 #3', key: '36e5f6b5c5e06070f0efca96227a863e00000000000000000000000000000000',
        msg: utf8(IETF_CONTRIBUTION), tag: 'f3477e7cd95417af89a6b8794c310cf0' },
    { name: '§A.3 #4', key: '1c9240a5eb55d38af333888604f6b5f0473917c1402b80099dca5cbc207075c0',
        msg: utf8(
            "'Twas brillig, and the slithy toves\n" +
            "Did gyre and gimble in the wabe:\n" +
            "All mimsy were the borogoves,\n" +
            "And the mome raths outgrabe."
        ), tag: '4541669a7eaaee61e708dc7cbcc5eb62' },
    { name: '§A.3 #5', key: '0200000000000000000000000000000000000000000000000000000000000000',
        msg: fromHex('ffffffffffffffffffffffffffffffff'), tag: '03000000000000000000000000000000' },
    { name: '§A.3 #6', key: '02000000000000000000000000000000ffffffffffffffffffffffffffffffff',
        msg: fromHex('02000000000000000000000000000000'), tag: '03000000000000000000000000000000' },
    { name: '§A.3 #7', key: '01000000000000000000000000000000' + '00000000000000000000000000000000',
        msg: fromHex(
            'ffffffffffffffffffffffffffffffff' +
            'f0ffffffffffffffffffffffffffffff' +
            '11000000000000000000000000000000'
        ), tag: '05000000000000000000000000000000' },
    { name: '§A.3 #8', key: '01000000000000000000000000000000' + '00000000000000000000000000000000',
        msg: fromHex(
            'ffffffffffffffffffffffffffffffff' +
            'fbfefefefefefefefefefefefefefefe' +
            '01010101010101010101010101010101'
        ), tag: '00000000000000000000000000000000' },
    { name: '§A.3 #9', key: '02000000000000000000000000000000' + '00000000000000000000000000000000',
        msg: fromHex('fdffffffffffffffffffffffffffffff'), tag: 'faffffffffffffffffffffffffffffff' },
    { name: '§A.3 #10', key: '0100000000000000040000000000000000000000000000000000000000000000',
        msg: fromHex(
            'e33594d7505e43b900000000000000003394d7505e4379cd01000000000000000000000000000000000000000000000001000000000000000000000000000000'
        ), tag: '14000000000000005500000000000000' },
    { name: '§A.3 #11', key: '0100000000000000040000000000000000000000000000000000000000000000',
        msg: fromHex(
            'e33594d7505e43b900000000000000003394d7505e4379cd010000000000000000000000000000000000000000000000'
        ), tag: '13000000000000000000000000000000' },
];

describe('poly1305 reference vs fast', () => {

    test('RFC 8439 §2.5.2 through the reference', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = utf8('Cryptographic Forum Research Group');
        expect(toHex(_ref.mac(key, msg))).toBe('a8061dc1305136c6c22b8baf0c0127a9');
    });

    test('the 12 RFC 8439 vectors of poly1305.test.js, through both sides', () => {
        expect(RFC_VECTORS.length).toBe(12);
        for (const v of RFC_VECTORS) {
            const key = fromHex(v.key);
            expect(toHex(_ref.mac(key, v.msg))).toBe(v.tag);
            expect(toHex(_fast.mac(key, v.msg))).toBe(v.tag);
        }
    });

    test('2000 random (key, message), lengths 0..300', () => {
        for (let i = 0; i < 2000; i++) {
            const key = randomBytes(32);
            const msg = randomBytes(_rng() % 301);
            expectSameTag(key, msg);
        }
    });

    test('lengths 1000, 4095, 4096, 4097, 65549', () => {
        for (const n of [1000, 4095, 4096, 4097, 65549]) {
            const key = randomBytes(32);
            const msg = randomBytes(n);
            expectSameTag(key, msg);
        }
    });

    test('edge keys (r all 0xff, r zero, s all 0xff) x 0xff messages of 15..48 bytes', () => {
        const rand = randomBytes(64);
        const keys = [
            new Uint8Array([...filled(16, 0xff), ...rand.subarray(0, 16)]),   // r all 0xff (largest after clamping)
            new Uint8Array([...filled(16, 0x00), ...rand.subarray(16, 32)]),  // r all zero
            new Uint8Array([...rand.subarray(32, 48), ...filled(16, 0xff)]),  // s all 0xff
            new Uint8Array([...filled(16, 0xff), ...filled(16, 0xff)]),       // r and s all 0xff
        ];
        const lengths = [15, 16, 17, 31, 32, 33, 48];
        let cases = 0;
        for (const key of keys) {
            for (const n of lengths) {
                expectSameTag(key, filled(n, 0xff));
                cases++;
            }
        }
        expect(cases).toBe(28);
    });

    test('verify: right tag, one flipped bit, 15-byte tag — on both sides', () => {
        const key = randomBytes(32);
        const msg = randomBytes(77);
        const bit = _rng() % 128;
        const tag = _ref.mac(key, msg);
        expect(toHex(_fast.mac(key, msg))).toBe(toHex(tag));
        const flipped = new Uint8Array(tag);
        flipped[bit >>> 3] ^= 1 << (bit & 7);
        const short = tag.subarray(0, 15);
        for (const side of [_ref, _fast]) {
            expect(side.verify(key, msg, tag)).toBe(true);
            expect(side.verify(key, msg, flipped)).toBe(false);
            expect(side.verify(key, msg, short)).toBe(false);
        }
    });

    test('error parity: 31-byte key', () => {
        const key = randomBytes(31);
        const msg = randomBytes(40);
        const ref = quiet(() => _ref.mac(key, msg));
        const fast = quiet(() => _fast.mac(key, msg));
        expect(ref).toBe(false);
        expect(fast).toBe(ref);
    });
});
