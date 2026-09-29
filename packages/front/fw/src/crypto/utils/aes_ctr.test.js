// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { aes_ctr } from './aes_ctr.js';
import { aes } from '../cipher/aes.js';
import { ctr } from '../mode/ctr.js';
import { pad } from './pad.js';
import { bitArray } from './bitArray.js';

const _ba = bitArray.factory();
const _aes = aes.factory();
const _ctr = ctr.factory(_ba);
const _pad = pad.factory();
const _kit = aes_ctr.factory(_ba, _aes, _ctr, _pad);

describe('aes_ctr module', () => {

    test('module metadata', () => {
        expect(aes_ctr.name).toBe('aes_ctr');
        expect(aes_ctr.dependencies).toEqual(['bitArray', 'aes', 'ctr', 'pad']);
    });

    const key = new Uint8Array(16); // 128-bit zero key for tests
    for (let i = 0; i < 16; i++) key[i] = i;
    const iv = new Uint8Array(16);
    for (let i = 0; i < 16; i++) iv[i] = 0xF0 | (i & 0x0F);

    describe('pad / strip round-trip', () => {
        test('encrypt(pad) → decrypt(strip) recovers plaintext (multi-block)', () => {
            const plain = new Uint8Array(50);
            for (let i = 0; i < 50; i++) plain[i] = i;

            const enc = _kit.ui8(key, iv);
            const ct = enc.pad(plain);
            // length must be a multiple of 16 (PKCS#7)
            expect(ct.length % 16).toBe(0);

            const dec = _kit.ui8(key, iv);
            const pt = dec.strip(ct);
            expect(Array.from(pt)).toEqual(Array.from(plain));
        });
    });

    describe('raw (no padding)', () => {
        test('raw is symmetric: raw(raw(x)) === x for block-aligned input', () => {
            const plain = new Uint8Array(32);
            for (let i = 0; i < 32; i++) plain[i] = (i * 7) & 0xFF;

            const a = _kit.ui8(key, iv);
            const ct = a.raw(plain);
            const b = _kit.ui8(key, iv);
            const pt = b.raw(ct);
            expect(Array.from(pt)).toEqual(Array.from(plain));
        });
    });

    describe('iv update', () => {
        test('update(iv) lets the same instance encrypt with a new counter', () => {
            const data = new Uint8Array(16).fill(0xAA);
            const iv2 = new Uint8Array(16).fill(0x55);

            const enc = _kit.ui8(key, iv);
            const ct1 = enc.raw(data);
            enc.update(iv2);
            const ct2 = enc.raw(data);
            expect(Array.from(ct1)).not.toEqual(Array.from(ct2));
        });
    });
});
