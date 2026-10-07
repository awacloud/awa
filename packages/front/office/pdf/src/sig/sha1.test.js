// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSha1 } from './sha1.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
import { hex } from '@awacloud/fw/io/codec/hex.js';

const _ba   = bitArray.factory();
const _utf8 = utf8.factory();
const _hex  = hex.factory();
const _sha  = pdfSha1.factory(_ba, _utf8);

const toHex = (ba) => _hex.fromBytes(_ba.ba_to_ui8(ba));

describe('pdfSha1 module', () => {

    test('module metadata', () => {
        expect(pdfSha1.name).toBe('pdfSha1');
        expect(pdfSha1.dependencies).toEqual(['bitArray', 'utf8']);
    });

    describe('hash (one-shot) - FIPS 180-4 known answers', () => {
        test('empty string -> da39a3ee...', () => {
            expect(toHex(_sha.hash('')))
                .toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
        });

        test('"abc" -> a9993e36... (FIPS-180 App. A vector 1)', () => {
            expect(toHex(_sha.hash('abc')))
                .toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
        });

        test('FIPS-180 App. A vector 2 (448-bit boundary)', () => {
            const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
            expect(toHex(_sha.hash(msg)))
                .toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
        });

        test('FIPS-180 App. A vector 3 (1,000,000 x "a")', () => {
            const msg = 'a'.repeat(1_000_000);
            expect(toHex(_sha.hash(msg)))
                .toBe('34aa973cd4c4daa4f61eeb2bdbad27316534016f');
        });
    });

    describe('streaming (update / finalize)', () => {
        test('chunked update matches one-shot hash', () => {
            const oneShot = toHex(_sha.hash('abcdefghijklmnop'));
            const h = new _sha.fn();
            h.update('abcd');
            h.update('efgh');
            h.update('ijkl');
            h.update('mnop');
            expect(toHex(h.finalize())).toBe(oneShot);
        });

        test('clone via constructor preserves state', () => {
            const a = new _sha.fn();
            a.update('abc');
            const b = new _sha.fn(a);
            expect(toHex(a.finalize())).toBe(toHex(b.finalize()));
        });

        test('reset returns instance to empty state', () => {
            const h = new _sha.fn();
            h.update('garbage');
            h.finalize();
            h.reset();
            h.update('abc');
            expect(toHex(h.finalize()))
                .toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
        });
    });
});
