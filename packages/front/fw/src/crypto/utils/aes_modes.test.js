// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { aes_modes } from './aes_modes.js';
import { aes } from '../cipher/aes.js';
import { cbc } from '../mode/cbc.js';
import { ctr } from '../mode/ctr.js';
import { gcm } from '../mode/gcm.js';
import { kw } from '../mode/kw.js';
import { pad } from './pad.js';
import { bitArray } from './bitArray.js';
import { hex } from '../../io/codec/hex.js';

const _ba = bitArray.factory();
const _hex = hex.factory();
const _aes = aes.factory();
const _cbc = cbc.factory(_ba);
const _ctr = ctr.factory(_ba);
const _gcm = gcm.factory(_ba);
const _kw = kw.factory(_ba);
const _pad = pad.factory();
const M = aes_modes.factory(_ba, _aes, _cbc, _ctr, _gcm, _kw, _pad);

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('aes_modes wrapper', () => {

    test('module metadata', () => {
        expect(aes_modes.name).toBe('aes_modes');
        expect(aes_modes.dependencies).toEqual(['bitArray', 'aes', 'cbc', 'ctr', 'gcm', 'kw', 'pad']);
    });

    describe('CBC with PKCS#7 padding', () => {
        const key = fromHex('06a9214036b8a15b512e03d534120006');
        const iv = fromHex('3dafba429d9eb430b422da802c9fac41');

        test('round-trip arbitrary length', () => {
            const pt = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
            const ct = M.cbc.encrypt(key, iv, pt);
            const back = M.cbc.decrypt(key, iv, ct);
            expect(toHex(back)).toBe(toHex(pt));
        });

        test('raw mode requires block-aligned input', () => {
            const pt = fromHex('00112233445566778899aabbccddeeff');
            const ct = M.cbc.raw.encrypt(key, iv, pt);
            const back = M.cbc.raw.decrypt(key, iv, ct);
            expect(toHex(back)).toBe(toHex(pt));
        });
    });

    describe('CTR', () => {
        test('round-trip', () => {
            const key = fromHex('2b7e151628aed2a6abf7158809cf4f3c');
            const iv = fromHex('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff');
            const pt = new Uint8Array(50).map((_, i) => i);
            const ct = M.ctr.encrypt(key, iv, pt);
            expect(toHex(M.ctr.decrypt(key, iv, ct))).toBe(toHex(pt));
        });
    });

    describe('GCM', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex('cafebabefacedbaddecaf888');

        test('AEAD round-trip', () => {
            const pt = new TextEncoder().encode('hello aes-gcm');
            const aad = new TextEncoder().encode('header');
            const { ct, tag } = M.gcm.encrypt(key, iv, pt, aad);
            const back = M.gcm.decrypt(key, iv, ct, tag, aad);
            expect(new TextDecoder().decode(back)).toBe('hello aes-gcm');
        });

        test('seal/open canonical layout', () => {
            const pt = new TextEncoder().encode('payload');
            const sealed = M.gcm.seal(key, iv, pt);
            expect(sealed.length).toBe(12 + pt.length + 16);
            const opened = M.gcm.open(key, sealed);
            expect(new TextDecoder().decode(opened)).toBe('payload');
        });

        test('open rejects tampered ct', () => {
            const sealed = M.gcm.seal(key, iv, new Uint8Array([1,2,3,4]));
            sealed[15] ^= 1;
            expect(M.gcm.open(key, sealed)).toBe(false);
        });
    });

    describe('KW', () => {
        const kek = fromHex('000102030405060708090A0B0C0D0E0F');

        test('wrap/unwrap round-trip', () => {
            const key = fromHex('00112233445566778899AABBCCDDEEFF');
            const wrapped = M.kw.wrap(kek, key);
            expect(toHex(M.kw.unwrap(kek, wrapped))).toBe(toHex(key));
        });

        test('KWP handles odd-length keys', () => {
            const key = fromHex('466f7250617369');
            const kek2 = fromHex('5840df6e29b02af1ab493b705bf16ea1ae8338f4dcc176a8');
            const wrapped = M.kw.wrapPad(kek2, key);
            expect(toHex(M.kw.unwrapPad(kek2, wrapped))).toBe(toHex(key));
        });
    });
});
