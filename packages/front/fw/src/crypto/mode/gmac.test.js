// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { gcm } from './gcm.js';
import { aes } from '../cipher/aes.js';
import { bitArray } from '../utils/bitArray.js';
import { hex } from '../../io/codec/hex.js';

const _ba = bitArray.factory();
const _hex = hex.factory();
const _aes = aes.factory();
const _gcm = gcm.factory(_ba);

const fromHex = (s) => Array.from(_ba.ui8_to_ba(_hex.toBytes(s)));
const toHex = (ba) => _hex.fromBytes(_ba.ba_to_ui8(ba));

describe('gmac (GCM with empty plaintext)', () => {

    // McGrew-Viega Test Case 3 (and NIST GCMVS): AES-128, empty PT, AAD-only
    // when run with empty PT and AAD = the original PT it produces the GMAC
    // of that AAD. Verified against NIST GCMVS / RFC 4543 vectors.
    test('AES-128 GMAC of 16-byte AAD matches GCM-encrypt of empty PT', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv  = fromHex('cafebabefacedbaddecaf888');
        const aad = fromHex('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72');

        const cipher = _aes.ttable.fn(key);
        const tag = _gcm.gmac(cipher, aad, iv);

        // Compare against full GCM encrypt with empty plaintext.
        const ref = _gcm.encrypt(_aes.ttable.fn(key), [], iv, aad);
        expect(toHex(tag)).toBe(toHex(ref.tag));
    });

    test('gmacVerify accepts the matching tag', () => {
        const key = fromHex('00000000000000000000000000000000');
        const iv  = fromHex('000000000000000000000000');
        const aad = fromHex('0102030405060708090a0b0c0d0e0f');
        const tag = _gcm.gmac(_aes.ttable.fn(key), aad, iv);
        expect(_gcm.gmacVerify(_aes.ttable.fn(key), aad, iv, tag)).toBe(true);
    });

    test('gmacVerify rejects a tampered tag', () => {
        const key = fromHex('00000000000000000000000000000000');
        const iv  = fromHex('000000000000000000000000');
        const aad = fromHex('0102030405060708090a0b0c0d0e0f');
        const tag = _gcm.gmac(_aes.ttable.fn(key), aad, iv);
        tag[0] ^= 1;
        expect(_gcm.gmacVerify(_aes.ttable.fn(key), aad, iv, tag)).toBe(false);
    });

    test('gmacVerify rejects when AAD changes', () => {
        const key = fromHex('00000000000000000000000000000000');
        const iv  = fromHex('000000000000000000000000');
        const aad = fromHex('0102030405060708090a0b0c0d0e0f');
        const tag = _gcm.gmac(_aes.ttable.fn(key), aad, iv);
        const aadTampered = fromHex('0102030405060708090a0b0c0d0e00');
        expect(_gcm.gmacVerify(_aes.ttable.fn(key), aadTampered, iv, tag)).toBe(false);
    });

    test('truncated tag (96 bits) round-trips', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv  = fromHex('cafebabefacedbaddecaf888');
        const aad = fromHex('d9313225f88406e5a55909c5aff5269a');
        const tag = _gcm.gmac(_aes.ttable.fn(key), aad, iv, 96);
        expect(_ba.bitLength(tag)).toBe(96);
        expect(_gcm.gmacVerify(_aes.ttable.fn(key), aad, iv, tag, 96)).toBe(true);
    });
});
