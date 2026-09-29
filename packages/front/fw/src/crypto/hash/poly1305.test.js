// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { poly1305 } from './poly1305.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _poly = poly1305.factory();

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('poly1305 (RFC 8439)', () => {

    test('module metadata', () => {
        expect(poly1305.name).toBe('poly1305');
        expect(poly1305.dependencies).toEqual([]);
    });

    // ========================================================================
    // RFC 8439 §2.5.2 - Standalone Poly1305 test vector
    // ========================================================================

    test('§2.5.2 example', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = new TextEncoder().encode('Cryptographic Forum Research Group');
        expect(toHex(_poly.mac(key, msg))).toBe('a8061dc1305136c6c22b8baf0c0127a9');
    });

    // ========================================================================
    // RFC 8439 §A.3 - Poly1305 test vectors (11 cases, all KAT byte-exact)
    // ========================================================================

    test('§A.3 #1 all-zero key, 64-zero msg → tag=0', () => {
        const key = new Uint8Array(32);
        const msg = new Uint8Array(64);
        expect(toHex(_poly.mac(key, msg))).toBe('00000000000000000000000000000000');
    });

    test('§A.3 #2 r=0, s set, msg "Any submission..." → tag = s', () => {
        const key = fromHex('0000000000000000000000000000000036e5f6b5c5e06070f0efca96227a863e');
        const msg = new TextEncoder().encode(
            "Any submission to the IETF intended by the Contributor for publication " +
            "as all or part of an IETF Internet-Draft or RFC and any statement made " +
            "within the context of an IETF activity is considered an \"IETF Contribution\". " +
            "Such statements include oral statements in IETF sessions, as well as written " +
            "and electronic communications made at any time or place, which are addressed to"
        );
        expect(toHex(_poly.mac(key, msg))).toBe('36e5f6b5c5e06070f0efca96227a863e');
    });

    test('§A.3 #3 r set, s=0, same msg', () => {
        const key = fromHex('36e5f6b5c5e06070f0efca96227a863e00000000000000000000000000000000');
        const msg = new TextEncoder().encode(
            "Any submission to the IETF intended by the Contributor for publication " +
            "as all or part of an IETF Internet-Draft or RFC and any statement made " +
            "within the context of an IETF activity is considered an \"IETF Contribution\". " +
            "Such statements include oral statements in IETF sessions, as well as written " +
            "and electronic communications made at any time or place, which are addressed to"
        );
        expect(toHex(_poly.mac(key, msg))).toBe('f3477e7cd95417af89a6b8794c310cf0');
    });

    test('§A.3 #4 long msg "\'Twas brillig..."', () => {
        const key = fromHex('1c9240a5eb55d38af333888604f6b5f0473917c1402b80099dca5cbc207075c0');
        const msg = new TextEncoder().encode(
            "'Twas brillig, and the slithy toves\n" +
            "Did gyre and gimble in the wabe:\n" +
            "All mimsy were the borogoves,\n" +
            "And the mome raths outgrabe."
        );
        expect(toHex(_poly.mac(key, msg))).toBe('4541669a7eaaee61e708dc7cbcc5eb62');
    });

    test('§A.3 #5 carry test: msg=ff..ff (16 bytes)', () => {
        const key = fromHex('0200000000000000000000000000000000000000000000000000000000000000');
        const msg = fromHex('ffffffffffffffffffffffffffffffff');
        expect(toHex(_poly.mac(key, msg))).toBe('03000000000000000000000000000000');
    });

    test('§A.3 #6 carry test: 2nd carry', () => {
        const key = fromHex('02000000000000000000000000000000ffffffffffffffffffffffffffffffff');
        const msg = fromHex('02000000000000000000000000000000');
        expect(toHex(_poly.mac(key, msg))).toBe('03000000000000000000000000000000');
    });

    test('§A.3 #7 carry test: rolling carry across 48 bytes', () => {
        const key = fromHex('01000000000000000000000000000000' + '00000000000000000000000000000000');
        const msg = fromHex(
            'ffffffffffffffffffffffffffffffff' +
            'f0ffffffffffffffffffffffffffffff' +
            '11000000000000000000000000000000'
        );
        expect(toHex(_poly.mac(key, msg))).toBe('05000000000000000000000000000000');
    });

    test('§A.3 #8 carry test: alternating bits', () => {
        const key = fromHex('01000000000000000000000000000000' + '00000000000000000000000000000000');
        const msg = fromHex(
            'ffffffffffffffffffffffffffffffff' +
            'fbfefefefefefefefefefefefefefefe' +
            '01010101010101010101010101010101'
        );
        expect(toHex(_poly.mac(key, msg))).toBe('00000000000000000000000000000000');
    });

    test('§A.3 #9 r set, msg=fdff..ff (16 bytes)', () => {
        const key = fromHex('02000000000000000000000000000000' + '00000000000000000000000000000000');
        const msg = fromHex('fdffffffffffffffffffffffffffffff');
        expect(toHex(_poly.mac(key, msg))).toBe('faffffffffffffffffffffffffffffff');
    });

    test('§A.3 #10 carry-out clamping: msg crosses 2^130 boundary', () => {
        const key = fromHex(
            '0100000000000000040000000000000000000000000000000000000000000000'
        );
        const msg = fromHex(
            'e33594d7505e43b900000000000000003394d7505e4379cd01000000000000000000000000000000000000000000000001000000000000000000000000000000'
        );
        expect(toHex(_poly.mac(key, msg))).toBe('14000000000000005500000000000000');
    });

    test('§A.3 #11 carry-out clamping bis', () => {
        const key = fromHex(
            '0100000000000000040000000000000000000000000000000000000000000000'
        );
        const msg = fromHex(
            'e33594d7505e43b900000000000000003394d7505e4379cd010000000000000000000000000000000000000000000000'
        );
        expect(toHex(_poly.mac(key, msg))).toBe('13000000000000000000000000000000');
    });

    // ========================================================================
    // verify (constant-time tag comparison)
    // ========================================================================

    test('verify accepts correct tag', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = new TextEncoder().encode('Cryptographic Forum Research Group');
        const tag = _poly.mac(key, msg);
        expect(_poly.verify(key, msg, tag)).toBe(true);
    });

    test('verify rejects tampered tag (every byte position)', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = new TextEncoder().encode('Cryptographic Forum Research Group');
        const tag = _poly.mac(key, msg);
        for (let i = 0; i < 16; i++) {
            const bad = new Uint8Array(tag);
            bad[i] ^= 0x01;
            expect(_poly.verify(key, msg, bad)).toBe(false);
        }
    });

    test('verify rejects tampered message', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = new TextEncoder().encode('Cryptographic Forum Research Group');
        const tag = _poly.mac(key, msg);
        const tampered = new TextEncoder().encode('cryptographic Forum Research Group');
        expect(_poly.verify(key, msg, tag)).toBe(true);
        expect(_poly.verify(key, tampered, tag)).toBe(false);
    });

    test('verify rejects tag of wrong length', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = new TextEncoder().encode('Cryptographic Forum Research Group');
        expect(_poly.verify(key, msg, new Uint8Array(15))).toBe(false);
        expect(_poly.verify(key, msg, new Uint8Array(17))).toBe(false);
    });

    // ========================================================================
    // Edge cases - empty message, key length, padding boundaries
    // ========================================================================

    test('empty message produces tag = s (clamped low half of key)', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const tag = _poly.mac(key, new Uint8Array(0));
        // accumulator starts at 0; no msg → final = (0 * r + 0) mod p = 0; +s = s.
        expect(toHex(tag)).toBe('0103808afb0db2fd4abff6af4149f51b');
    });

    test('1-byte message (sub-block padding)', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const tag = _poly.mac(key, new Uint8Array([0x42]));
        // smoke test: deterministic, 16 bytes
        expect(tag.length).toBe(16);
        expect(_poly.verify(key, new Uint8Array([0x42]), tag)).toBe(true);
    });

    test('exactly 16-byte boundary (1 block, no padding)', () => {
        const key = fromHex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b');
        const msg = new Uint8Array(16); for (let i = 0; i < 16; i++) msg[i] = i;
        const tag = _poly.mac(key, msg);
        expect(tag.length).toBe(16);
        expect(_poly.verify(key, msg, tag)).toBe(true);
    });

    test('rejects non-32-byte key', () => {
        expect(_poly.mac(new Uint8Array(31), new Uint8Array(0))).toBe(false);
        expect(_poly.mac(new Uint8Array(33), new Uint8Array(0))).toBe(false);
    });
});
