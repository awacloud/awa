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

// Canonical AES-GCM test vectors from McGrew & Viega's specification
// (Annex B of "The Galois/Counter Mode of Operation (GCM)", 2004),
// reproduced verbatim in NIST GCMVS and referenced by RFC 5288 §A,
// RFC 4106 §8 and RFC 5647.

describe('gcm module', () => {

    test('module metadata', () => {
        expect(gcm.name).toBe('gcm');
        expect(gcm.dependencies).toEqual(['bitArray']);
    });

    describe('AES-128-GCM, McGrew-Viega test case 1 (empty P/A, 96-bit IV)', () => {
        const key = fromHex('00000000000000000000000000000000');
        const iv = fromHex('000000000000000000000000');
        const expectedTag = '58e2fccefa7e3061367f1d57a4e7455a';

        test('encrypt produces empty ct and the expected 128-bit tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, [], iv);
            expect(ct).toEqual([]);
            expect(toHex(tag)).toBe(expectedTag);
        });

        test('decrypt accepts the matching tag and returns empty plaintext', () => {
            const cipher = _aes.ttable.fn(key, false);
            const out = _gcm.decrypt(cipher, [], iv, [], fromHex(expectedTag));
            expect(out).toEqual([]);
        });
    });

    describe('AES-128-GCM, test case 2 (single zero block)', () => {
        const key = fromHex('00000000000000000000000000000000');
        const iv = fromHex('000000000000000000000000');
        const plain = fromHex('00000000000000000000000000000000');
        const expectedCt = '0388dace60b6a392f328c2b971b2fe78';
        const expectedTag = 'ab6e47d42cec13bdf53a67b21257bddf';

        test('encrypt matches expected ct and tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });

        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const pt = _gcm.decrypt(cipher, fromHex(expectedCt), iv, [], fromHex(expectedTag));
            expect(toHex(pt)).toBe(toHex(plain));
        });
    });

    describe('AES-128-GCM, test case 3 (64-byte plaintext, no AAD, 96-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex('cafebabefacedbaddecaf888');
        const plain = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b391aafd255'
        );
        const expectedCt =
            '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e0' +
            '35c17e2329aca12e21d514b25466931c7d8f6a5aac84aa05' +
            '1ba30b396a0aac973d58e091473f5985';
        const expectedTag = '4d5c2af327cd64a62cf35abd2ba6fab4';

        test('encrypt matches expected ct and tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });

        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const pt = _gcm.decrypt(cipher, fromHex(expectedCt), iv, [], fromHex(expectedTag));
            expect(toHex(pt)).toBe(toHex(plain));
        });
    });

    describe('AES-128-GCM, test case 4 (60-byte plaintext, 20-byte AAD, 96-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex('cafebabefacedbaddecaf888');
        const adata = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const plain = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt =
            '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e0' +
            '35c17e2329aca12e21d514b25466931c7d8f6a5aac84aa05' +
            '1ba30b396a0aac973d58e091';
        const expectedTag = '5bc94fbc3221a5db94fae95ae7121a47';

        test('encrypt with AAD matches expected ct and tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, adata);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });

        test('decrypt with AAD round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const pt = _gcm.decrypt(cipher, fromHex(expectedCt), iv, adata, fromHex(expectedTag));
            expect(toHex(pt)).toBe(toHex(plain));
        });
    });

    describe('AES-128-GCM, test case 5 (60-byte P, 20-byte A, 64-bit IV — GHASH path)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex('cafebabefacedbad'); // 8 bytes
        const adata = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const plain = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt =
            '61353b4c2806934a777ff51fa22a4755699b2a714fcdc6f8' +
            '3766e5f97b6c742373806900e49f24b22b097544d4896b42' +
            '4989b5e1ebac0f07c23f4598';
        const expectedTag = '3612d2e79e3b0785561be14aaca2fccb';

        test('encrypt (non-96-bit IV uses GHASH-derived J0)', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, adata);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });

        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const pt = _gcm.decrypt(cipher, fromHex(expectedCt), iv, adata, fromHex(expectedTag));
            expect(toHex(pt)).toBe(toHex(plain));
        });
    });

    describe('AES-128-GCM, test case 6 (60-byte P, 20-byte A, 480-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex(
            '9313225df88406e555909c5aff5269aa6a7a9538534f7da1e4c303d2a318a728' +
            'c3c0c95156809539fcf0e2429a6b525416aedbf5a0de6a57a637b39b'
        );
        const adata = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const plain = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt =
            '8ce24998625615b603a033aca13fb894be9112a5c3a211a8' +
            'ba262a3cca7e2ca701e4a9a4fba43c90ccdcb281d48c7c6f' +
            'd62875d2aca417034c34aee5';
        const expectedTag = '619cc5aefffe0bfa462af43c1699d050';

        test('encrypt with long IV', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, adata);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('AES-256-GCM, test case 13 (empty)', () => {
        const key = fromHex('0000000000000000000000000000000000000000000000000000000000000000');
        const iv = fromHex('000000000000000000000000');
        const expectedTag = '530f8afbc74536b9a963b4f1c4cb738b';

        test('empty P/A produces expected tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, [], iv);
            expect(ct).toEqual([]);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('AES-256-GCM, test case 14 (single zero block)', () => {
        const key = fromHex('0000000000000000000000000000000000000000000000000000000000000000');
        const iv = fromHex('000000000000000000000000');
        const plain = fromHex('00000000000000000000000000000000');
        const expectedCt = 'cea7403d4d606b6e074ec5d3baf39d18';
        const expectedTag = 'd0d1c8a799996bf0265b98b5d48ab919';

        test('matches expected ct and tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });

        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const pt = _gcm.decrypt(cipher, fromHex(expectedCt), iv, [], fromHex(expectedTag));
            expect(toHex(pt)).toBe(toHex(plain));
        });
    });

    // ────────────────────────────────────────────────────────────────────
    // McGrew-Viega test cases 7-12 (AES-192) - iteration D1 of the upgrade plan.
    // Reference values cross-checked against Node `createCipheriv('aes-192-gcm')`
    // (= OpenSSL libcrypto). ACVP-AES-GCM-1.0 only covers AES-128; McGrew-Viega
    // is the canonical source for 192/256 (referenced by RFC 5288 §A,
    // RFC 4106 §8, RFC 5647). Iteration H4 of the plan will add ACVP-AES-GCM-2.0
    // if published, but as of today McGrew-Viega fully covers 192/256.
    // ────────────────────────────────────────────────────────────────────

    describe('AES-192-GCM, test case 7 (empty P/A, all-zero key/IV)', () => {
        test('empty P/A produces expected tag', () => {
            const cipher = _aes.ttable.fn(fromHex('00'.repeat(24)), false);
            const { ct, tag } = _gcm.encrypt(cipher, [], fromHex('00'.repeat(12)));
            expect(ct).toEqual([]);
            expect(toHex(tag)).toBe('cd33b28ac773f74ba00ed1f312572435');
        });
    });

    describe('AES-192-GCM, test case 8 (single zero block)', () => {
        const key = fromHex('00'.repeat(24));
        const iv = fromHex('00'.repeat(12));
        const expectedCt = '98e7247c07f0fe411c267e4384b0f600';
        const expectedTag = '2ff58d80033927ab8ef4d4587514f0fb';
        test('matches expected ct and tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, fromHex('00'.repeat(16)), iv);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const pt = _gcm.decrypt(cipher, fromHex(expectedCt), iv, [], fromHex(expectedTag));
            expect(toHex(pt)).toBe('00'.repeat(16));
        });
    });

    describe('AES-192-GCM, test case 9 (64-byte plaintext, no AAD, 96-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c');
        const iv  = fromHex('cafebabefacedbaddecaf888');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b391aafd255'
        );
        const expectedCt = '3980ca0b3c00e841eb06fac4872a2757859e1ceaa6efd984628593b40ca1e19c7d773d00c144c525ac619d18c84a3f4718e2448b2fe324d9ccda2710acade256';
        const expectedTag = '9924a7c8587336bfb118024db8674a14';

        test('encrypt matches expected', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const out = _gcm.decrypt(cipher, fromHex(expectedCt), iv, [], fromHex(expectedTag));
            expect(toHex(out)).toBe(toHex(pt));
        });
    });

    describe('AES-192-GCM, test case 10 (60-byte P, 20-byte A, 96-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c');
        const iv  = fromHex('cafebabefacedbaddecaf888');
        const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt = '3980ca0b3c00e841eb06fac4872a2757859e1ceaa6efd984628593b40ca1e19c7d773d00c144c525ac619d18c84a3f4718e2448b2fe324d9ccda2710';
        const expectedTag = '2519498e80f1478f37ba55bd6d27618c';

        test('encrypt with AAD', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv, aad);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('AES-192-GCM, test case 11 (60-byte P, 20-byte A, 64-bit IV - GHASH path)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c');
        const iv  = fromHex('cafebabefacedbad');
        const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt = '0f10f599ae14a154ed24b36e25324db8c566632ef2bbb34f8347280fc4507057fddc29df9a471f75c66541d4d4dad1c9e93a19a58e8b473fa0f062f7';
        const expectedTag = '65dcc57fcf623a24094fcca40d3533f8';

        test('encrypt non-96-bit IV uses GHASH-derived J0', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv, aad);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('AES-192-GCM, test case 12 (60-byte P, 20-byte A, 480-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c');
        const iv = fromHex(
            '9313225df88406e555909c5aff5269aa6a7a9538534f7da1e4c303d2a318a728' +
            'c3c0c95156809539fcf0e2429a6b525416aedbf5a0de6a57a637b39b'
        );
        const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt = 'd27e88681ce3243c4830165a8fdcf9ff1de9a1d8e6b447ef6ef7b79828666e4581e79012af34ddd9e2f037589b292db3e67c036745fa22e7e9b7373b';
        const expectedTag = 'dcf566ff291c25bbb8568fc3d376a6d9';

        test('encrypt with long IV', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv, aad);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    // ────────────────────────────────────────────────────────────────────
    // McGrew-Viega test cases 15-18 (AES-256 extended) - iteration D1.
    // ────────────────────────────────────────────────────────────────────

    describe('AES-256-GCM, test case 15 (64-byte plaintext, no AAD, 96-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
        const iv  = fromHex('cafebabefacedbaddecaf888');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b391aafd255'
        );
        const expectedCt = '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad';
        const expectedTag = 'b094dac5d93471bdec1a502270e3cc6c';

        test('encrypt matches expected', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
        test('decrypt round-trip', () => {
            const cipher = _aes.ttable.fn(key, false);
            const out = _gcm.decrypt(cipher, fromHex(expectedCt), iv, [], fromHex(expectedTag));
            expect(toHex(out)).toBe(toHex(pt));
        });
    });

    describe('AES-256-GCM, test case 16 (60-byte P, 20-byte A, 96-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
        const iv  = fromHex('cafebabefacedbaddecaf888');
        const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt = '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662';
        const expectedTag = '76fc6ece0f4e1768cddf8853bb2d551b';

        test('encrypt with AAD', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv, aad);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('AES-256-GCM, test case 17 (60-byte P, 20-byte A, 64-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
        const iv  = fromHex('cafebabefacedbad');
        const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt = 'c3762df1ca787d32ae47c13bf19844cbaf1ae14d0b976afac52ff7d79bba9de0feb582d33934a4f0954cc2363bc73f7862ac430e64abe499f47c9b1f';
        const expectedTag = '3a337dbf46a792c45e454913fe2ea8f2';

        test('encrypt non-96-bit IV uses GHASH-derived J0', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv, aad);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('AES-256-GCM, test case 18 (60-byte P, 20-byte A, 480-bit IV)', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
        const iv = fromHex(
            '9313225df88406e555909c5aff5269aa6a7a9538534f7da1e4c303d2a318a728' +
            'c3c0c95156809539fcf0e2429a6b525416aedbf5a0de6a57a637b39b'
        );
        const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const pt  = fromHex(
            'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da' +
            '2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525' +
            'b16aedf5aa0de657ba637b39'
        );
        const expectedCt = '5a8def2f0c9e53f1f75d7853659e2a20eeb2b22aafde6419a058ab4f6f746bf40fc0c3b780f244452da3ebf1c5d82cdea2418997200ef82e44ae7e3f';
        const expectedTag = 'a44a8266ee1c8eb0c8b5d4cf5ae9f19a';

        test('encrypt with long IV', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, pt, iv, aad);
            expect(toHex(ct)).toBe(expectedCt);
            expect(toHex(tag)).toBe(expectedTag);
        });
    });

    describe('authentication failure handling', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex('cafebabefacedbaddecaf888');
        const adata = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
        const plain = fromHex('d9313225f88406e5a55909c5aff5269a');

        test('decrypt rejects tampered ciphertext', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, adata);
            const tampered = ct.slice();
            tampered[0] = (tampered[0] ^ 0x01) | 0;
            expect(_gcm.decrypt(cipher, tampered, iv, adata, tag)).toBe(false);
        });

        test('decrypt rejects tampered AAD', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, adata);
            const tamperedA = adata.slice();
            tamperedA[0] = (tamperedA[0] ^ 0x01) | 0;
            expect(_gcm.decrypt(cipher, ct, iv, tamperedA, tag)).toBe(false);
        });

        test('decrypt rejects tampered tag', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, adata);
            const tamperedT = tag.slice();
            tamperedT[0] = (tamperedT[0] ^ 0x01) | 0;
            expect(_gcm.decrypt(cipher, ct, iv, adata, tamperedT)).toBe(false);
        });
    });

    describe('truncated tags', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');
        const iv = fromHex('cafebabefacedbaddecaf888');
        const plain = fromHex('00112233445566778899aabbccddeeff');

        test('96-bit tag (TLS-style) round-trips', () => {
            const cipher = _aes.ttable.fn(key, false);
            const { ct, tag } = _gcm.encrypt(cipher, plain, iv, [], 96);
            expect(_ba.bitLength(tag)).toBe(96);
            const pt = _gcm.decrypt(cipher, ct, iv, [], tag, 96);
            expect(toHex(pt)).toBe(toHex(plain));
        });

        test('rejects tag length below 32 bits', () => {
            const cipher = _aes.ttable.fn(key, false);
            expect(_gcm.encrypt(cipher, plain, iv, [], 16)).toBe(false);
        });

        test('rejects tag length above 128 bits', () => {
            const cipher = _aes.ttable.fn(key, false);
            expect(_gcm.encrypt(cipher, plain, iv, [], 192)).toBe(false);
        });
    });

    describe('input validation', () => {
        const key = fromHex('feffe9928665731c6d6a8f9467308308');

        test('rejects empty IV', () => {
            const cipher = _aes.ttable.fn(key, false);
            expect(_gcm.encrypt(cipher, [], [])).toBe(false);
        });
    });

    describe('nonceTracker — duplicate detection', () => {
        const key = fromHex('00000000000000000000000000000000');
        const iv1 = fromHex('000000000000000000000001');
        const iv2 = fromHex('000000000000000000000002');
        const pt  = fromHex('11223344');

        test('accepts fresh nonce, rejects reused nonce', () => {
            const cipher = _aes.ttable.fn(key, false);
            const t = _gcm.nonceTracker(cipher);
            const a = t.encrypt(pt, iv1);
            expect(a).not.toBe(false);
            const b = t.encrypt(pt, iv2);
            expect(b).not.toBe(false);
            expect(t.encrypt(pt, iv1)).toBe(false);
            expect(t.seenNonces.size).toBe(2);
        });
    });
});


// ============================================================================
// ACVP-AES-GCM-1.0 + ACVP-AES-GMAC-1.0 (NIST CAVP vectors)
// ----------------------------------------------------------------------------
// Source: references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/
// Coverage:
//   - GCM : 4 testGroups (encrypt + decrypt) x AES-128, ivLen {96, 120},
//     payloadLen {0, 120}, aadLen {0, 120}, tagLen {32, 128} -- ALL 60
//     AFT integrated.
//   - GMAC : 4 testGroups (encrypt + decrypt) x AES-128, ivLen {96, 120},
//     aadLen {0, 120}, tagLen {32, 128} -- ALL 60 AFT integrated.
//   - decrypt groups include negative cases (testPassed=false) -- the test
//     asserts decrypt() returns false in those cases.
//   - ivLen=120 exercises the GHASH-derived J0 path (not the 96-bit fast
//     path).
// ============================================================================

const haxToBitsBA = (hexStr, bitLen) => {
    if (bitLen === 0) return [];
    const bytes = _hex.toBytes(hexStr);
    const ba = _ba.ui8_to_ba(bytes);
    return _ba.clamp(ba, bitLen);
};

const GCM_AFT_ENC = [
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 1, key: '4B2CBE2158F5D6A28CC798DF4F99F777', iv: '3851BAF79831605B75086E79', aad: '4607F76F4FDA85DAFDC8CE085E0CE5', pt: '', ct: '', tag: '9E557D92647C1510D4101EBEED0C52DD' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 2, key: '32E106F67A99F89788D168BEB6596400', iv: '491F4B2DF6D0288DB54716B6', aad: '65FC70A3CC2E0F14B3C56216881F8C', pt: '', ct: '', tag: '6A7BBCDB4834109B6AA067B5358D94F3' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 3, key: '15BF034EE6DC3DA6296EE138B90FC0CE', iv: 'DE8CB48EE0F1CB57F4E9FFB5', aad: 'EDDE20197C7DED0B293B061F349840', pt: '', ct: '', tag: '72445E31C5DF05DFA2CCBA54AE385DFD' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 4, key: 'A1BAF46B4B1E8C169EA89892697C1CB4', iv: 'B857C80F75CC7336114DEF84', aad: '6A4687585852AE3438D97CC703EE17', pt: '', ct: '', tag: '4F8508CB9C385C72935DEFD397BEB317' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 5, key: '0E5EB84C7E64825C7569712DFEB2F156', iv: 'F88AD682C50FD2EFBF5DFFA2', aad: '2BC528CEB661427363C3D7C41A474B', pt: '', ct: '', tag: '374A8920101702D1CCDE488A3ED7BD74' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 6, key: 'BF5C3A9C65D72512F752A09C9B5ABA59', iv: '0B8AE56978B462A5C0F8486C', aad: '9D43A96F28E0753DEF6E6E07FD8442', pt: '', ct: '', tag: '350DB3900067E56F16C77C835DAC544C' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 7, key: '28DCCD63B305BB169BB7E85FE55591DF', iv: '407F6C53CCF5DDA6F868B22C', aad: '8F8EDFA6E95B755976955ED3483CD2', pt: '', ct: '', tag: 'F150351CD6C3D09ED6F65CCDD9016329' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 8, key: '3AD410F60CF85C923F2D9CE336E6A185', iv: 'FE37880DC4531AD581C4E24D', aad: '900865D0DB20458368F9A191775A58', pt: '', ct: '', tag: '7F6917FC8C4437E897DED97F56BAF97E' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 9, key: '1D650E5AD0B45A2A519DE40203C271CF', iv: '3FE45FF564B983251816574D', aad: 'BF4D54FB100225DB37D80AA5883B92', pt: '', ct: '', tag: '7C0487B32951712B1C8B5A383D1D2C7D' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 10, key: '7B7473CA6E44320019A0DD324B77B5AD', iv: '0F25C4D8969D268C89CF89DC', aad: 'EE74A91456154EA7DF2702E8069099', pt: '', ct: '', tag: '3EB7851F7C2C22FE454487DC6F3DF568' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 11, key: '368EF87F3BA49549334D756F7127C264', iv: 'BE20E127CBEEB126BA5705A8', aad: '0EE044D4503197D12D2773BAD595DD', pt: '', ct: '', tag: 'D4FAB95E8D69AEA9FBD8F5828D3BD431' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 12, key: 'AC8B6AF21571F41B413DD940CC0CE10E', iv: 'F0EABB2B51EDA331A8F69401', aad: 'CAB5E1F3A6E9F334A1E3A0A480E430', pt: '', ct: '', tag: '142EC77E700EA07AFEDCA19968237921' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 13, key: '95F171B040EDEC74200716786A4C9883', iv: '8A099FB344B8D82105CDE359', aad: '81FEBC3A769A3EC54CC2B2AF464EB5', pt: '', ct: '', tag: '25A704866524EDF070813B81D076BC0A' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 14, key: 'D933FFCCCF7F179277F2B409F089F497', iv: '2B8E42BF97178EF7A6E4F745', aad: '37E2149B37A2199F6DEF54B283A4C8', pt: '', ct: '', tag: '17FFF7D09A61124C5D7B41EC93A030CF' },
    { tg: 1, kl: 128, iv_l: 96, pl: 0, al: 120, tl: 128, tc: 15, key: '29214E6ABF1A50CBC3EA399138ED22FA', iv: 'F451A8FD6B66E538E72E655B', aad: 'AB966DC5A64F1FA1588ACC1CF4062C', pt: '', ct: '', tag: '935A4D11F33268110BB7EC6ED1DA7440' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 16, key: '49BFA3BF9492DC7BCC93EDAFC725C730', iv: 'B40811BE58D20804E60926EE571491', aad: '', pt: 'F2DC083B4CA1C54BF5228A5BB67129', ct: 'E8F5854061720508EA3FBCCEB78F4F', tag: '8AD3515A' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 17, key: 'CCE6B60016AF6168282A838414E718BD', iv: '7DC783AA9F5423FC5C928EA9E5F61E', aad: '', pt: 'E0968828C7C37AB7ACA219537E991E', ct: 'FFFDB44464A139F960BB98537970BD', tag: '9BD5F0F7' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 18, key: 'FBB436FDCBF71FC62B582119AD256F75', iv: 'E3C00C2489D9CE98BAE7F33793078F', aad: '', pt: 'D4285F5F84E4B4EB138BFB6DAD0796', ct: '90B8D17EB21BD8ED313DA9973989DB', tag: '8D1425DF' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 19, key: '83B5769FBCCA57C8EABFB3568E548E4A', iv: '9925011CE54144147A584995A24576', aad: '', pt: '5CD3B38D4DB9B8B09B790C66CE8158', ct: '11A3ED9BFD11351E09CB6AAC45BDE8', tag: 'A1FB7E42' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 20, key: 'DF1305E84D077C873D3CFF191620B978', iv: 'A37D98B4C387D63C5983A5B1EA9EF2', aad: '', pt: '096A6DC30BF56A5306B315D658F197', ct: '79E7CDF357DD1EBA204B4ADB602CC6', tag: '84A73DCB' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 21, key: '68BF0C097FF5DFF2FD5CC597F6E8E83B', iv: '32ABE4898534D01CAAC3E32639A17A', aad: '', pt: '82BB145721376A80F72334FD398740', ct: '65C1EC148D1204B368B015E9937DA6', tag: '180E6316' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 22, key: '8E4941CBEB5588A6A067152A71E6577C', iv: 'F348CC1FD9573067EA281FECA62996', aad: '', pt: 'ECE183D08EF7FB6DF4C722EB5AA622', ct: 'A9D52A315FFD4B15AE4499445A351D', tag: '21F598FD' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 23, key: '7FFA6404484C0DBBCDC977BB308C1EA8', iv: '3FCD8B83B6214E3851D4D42B1B6140', aad: '', pt: '7892E43F26DF600C20909C09F0822F', ct: '76F0E979F0F095AD53FB9E068D1535', tag: '935C7EC3' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 24, key: 'B8100B497AF6376EE8C947C4642CFD9F', iv: '96FC73A80A2194A1D00E06989C10F3', aad: '', pt: '0F16C52DB7931B8287E1DF9A943B23', ct: 'BCFA40B2C94ADCDD4A81E03F590C10', tag: 'FCFBD7E4' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 25, key: '1EA98CD9979D467F22D1B741BE5B1AB8', iv: 'F2ECBCCD4F8371AAEBC68449C41F82', aad: '', pt: 'E2A9B389D37D573B020DAC641750B0', ct: 'E4F989FF434B5943A3CEAD25D3562D', tag: '0B52C688' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 26, key: 'D33F6325CC3D789E95DBB5A7CEAB74ED', iv: '7C5A4152A3028C01F86D9AB1AC4718', aad: '', pt: 'A33E1E4789E4E6FE77DCBD139CE544', ct: '0691A79E2EFF3943692D902255EA5B', tag: '82AAD7AA' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 27, key: 'A3CE14494014F2123E1048D7360339FC', iv: '52B2FC48BBC003F38F63BE4FBDA2E8', aad: '', pt: 'BD420E0697985A8AB580C1E63BFE7A', ct: '31C5DB0169DBD2059F5283957A54B2', tag: 'A46C048F' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 28, key: 'C2C9D1B28256CD553272DAC97668F391', iv: '480D6FDB90A3ECE5E4DEB3C34D1819', aad: '', pt: '889C014C50636CAC2F549987751931', ct: 'B9470DF62A2C73718F5BFC25E576CD', tag: '7DBC316D' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 29, key: '96492589820FB2D5D8B43437A1A3DA7C', iv: 'BFCB059753AF84D207C5C4E28547C2', aad: '', pt: 'D142BA1FE7BEB5C4693EF6C9ECBD74', ct: '415E1E2D2C3E5F232AC155DBE0244F', tag: '1F62119F' },
    { tg: 2, kl: 128, iv_l: 120, pl: 120, al: 0, tl: 32, tc: 30, key: 'A095950D507EF3185CE9A36D8E59EF8C', iv: 'D7E7C6E29BB3F74E1F95B994CDC299', aad: '', pt: '743EFCA9A9F18BD62D203817E0BA32', ct: '508009D6C919B187F49E66D8352AA5', tag: 'A350A525' }
];

const GCM_AFT_DEC = [
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 31, key: '5A074F4193A394042148393F36978218', iv: 'F386BC91CF56892786F040C9', aad: '', ct: '', tag: '11F81B02AF3CC35AE0908D459C4FDB16', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 32, key: '85369A3731D4BB1014042A8F8E3ED26B', iv: 'FC0BBCF647E3941D58F4EAB7', aad: '', ct: '', tag: '238514DE053AF269F1E9FF01F09ADB29', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 33, key: '886293D80F8E625971AE9436F8F4D50E', iv: '22CD533018836F78FC884872', aad: '', ct: '', tag: 'D4B42FAEDDB5E9523921C1C29144A449', pt: '', pass: false },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 34, key: 'B707DFAA3D1D1431A1A465FAFD84499E', iv: '572B25ED8D3DA6256B7D0DD9', aad: '', ct: '', tag: '949B14AD10240EA12FFA1A572348926D', pt: '', pass: false },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 35, key: 'F5AD2F6AAC799C36FAE0148EC0FAB942', iv: '917A9649EF33109EA369FF33', aad: '', ct: '', tag: 'A9990EDBD767EAA95AD08D8E6F2D416D', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 36, key: '93BE072F291ED274D4543A9409EDD59D', iv: '863136FD089D4C6099E165E9', aad: '', ct: '', tag: '31967BFE5519A51BC9C2E11A4B3053A5', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 37, key: '5700C616B01028C783BC708D3F40EC8E', iv: 'C651C0588AEC7896A68E4625', aad: '', ct: '', tag: '4D981D02DB5541ED5251FAEFBDA81E78', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 38, key: '29750F1D972DDF770532E4E9A94F0D15', iv: '4CB12EF15D60EE6A515FAEAE', aad: '', ct: '', tag: '263031F6EAC135A07E9109A41B5F22C7', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 39, key: '2A2ECF038BCB2224D3C30E956C0017F9', iv: '28B4DA12E0BD080DE98F5483', aad: '', ct: '', tag: '871144F7A10D748FD228A1738110BCA0', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 40, key: '3AFC10C47CCFF7488EC9F7DD79D3D083', iv: '5AF0E0F591C4F852BE3C26AF', aad: '', ct: '', tag: '6A5D417EC8496EE6931B07D92AAFC4E0', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 41, key: '1B484FFC35B465B5F7FA70ACA0DFAAD3', iv: 'E153CCD4A366C8DDE65F66A8', aad: '', ct: '', tag: 'CA57E66F17D5C2A32C8DB5DE05E8C1D2', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 42, key: '72E11886377574C794EF66333902697C', iv: '2DCD93A36C5C2C6F8090B86D', aad: '', ct: '', tag: 'CF0AA3934E6CCDD96A4FE6337ADD591F', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 43, key: 'BD40239D84E136A94C3764DE3B280C79', iv: '00304884FD5A89DD86626A9A', aad: '', ct: '', tag: '0DCCB56FABB501586C6EA714D6DB2F80', pt: '', pass: false },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 44, key: '5019E5F6A9D52E47721FF45C181CE0CB', iv: '29B395DB6A763583A06373A0', aad: '', ct: '', tag: 'C0FEEE44370A0D6F400F56D88FFB513C', pt: '', pass: true },
    { tg: 3, kl: 128, iv_l: 96, pl: 0, al: 0, tl: 128, tc: 45, key: '20C6656A450F4DC3259E79CDEE4246C0', iv: '430A62E72C1D0D0506E9559E', aad: '', ct: '', tag: '9220ADAA2D67FB593E9504BCF200008D', pt: '', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 46, key: 'D297F6EED6E9AD37AD24DC955ED2B2F2', iv: 'FB5C735021B804184A34B400EF071F', aad: 'BF353A6859EA4866ACEA44553B541B', ct: '1FD917C7F42C857953833AE109CCAD', tag: 'C4C59661', pt: 'A840015C977767637E951EE79F060F', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 47, key: '48D874772D824369AD4AC47365918E5F', iv: 'E843F74D4A95F3014C1F166B0BEE9E', aad: 'FE69C4E206237E82B52F5BDCAE538D', ct: '2DB8805797A009B2CF9A958FE6F37F', tag: '5666134E', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 48, key: '444C151AD2C1123D41D1FFB570718901', iv: '8960C65C8CEA012C570004EBCCC949', aad: 'FF4351706BDBA70470AEAFEE8E49F2', ct: '3E588F1D198A501CDD74ED339F3E9C', tag: '93778CAA', pt: '1E8BAAFB94BC02C2DED10563ADADAC', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 49, key: '6DDAAD684250D27C89AE060728C63634', iv: 'BBB75BF772EBA53F5455FB22EF8ED4', aad: '99F5DA5EC3B306C48DA975806BA241', ct: 'E218ED5F944E592556695A1C02EF7F', tag: '1B4B04BA', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 50, key: 'C73DB26996B8A3A6EF46DB04280E5C13', iv: 'F9F365725EACED0C4F66C2405CF641', aad: '6132B7C87CC039258A867E574FDED5', ct: '861E2108AB1CB69FAA78F6F8E5EB79', tag: '2E46F03F', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 51, key: '203DA2D08A2D91097E281CC3DB0B773D', iv: 'E8B33EC88A542A321163B65CA17175', aad: '03B068DD45707938979D92E42DB86C', ct: 'B1AE17F609EF207A14E498E6D03A2A', tag: 'E3D2AA8A', pt: '66E86325525AD3869F8EDDFAE6C399', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 52, key: 'FC8E4EC7AD9C6068C4BBABD456D90F53', iv: '6135CF0E7C69AA5F731D70D88C66DF', aad: 'A0719D7F564611CF950D5B3D290A32', ct: '63BD11EA9DB1C7CE6A15B5895517B5', tag: 'DFF18A3F', pt: '6AB8A0F49FF748909C4E0EFEE81A02', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 53, key: '32C4304E7E43A344AFD0231D7FC02088', iv: '32BBAEB29773832B648605C6A75E97', aad: 'BAE11F39EFACD49C84F5825F4FC9D3', ct: 'BCA45440497FF33C963306FF53F6F4', tag: '031FD083', pt: 'C7A47964FBE072DCF53925C27E9F7C', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 54, key: '10CB5B15A7A073E853A0B382CDB1DA39', iv: '522FDB97481409A6E4CE80B42944E3', aad: '6AB405BB7BCCDC3D67888E1F168D8A', ct: 'BCD00CBFC01B54B50EC74D2B6E432E', tag: 'D4DF6942', pt: 'D4BADC5ABA68BDF33F125578A4CF6D', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 55, key: '0607B9970AD0F6BAAA2EE60F51F54120', iv: 'CE5B4AAA025B65E1B525620B1C3196', aad: '2FE4E92D4344F0D874ED5A932794FB', ct: '4CE613A353A3D9C8E3E1786FE049E1', tag: 'C7421B07', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 56, key: 'C91ED25F204F41D2157E49BE10E98BC6', iv: 'CF22D5915C49EFE1754D787B43CE40', aad: '39576CADC4368AF61EC451EF058A5D', ct: 'C410209DE23E6750D88A28B49CC5D8', tag: '5F23E115', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 57, key: 'A88670EB2838DE83AABEA3D2C0A9553F', iv: 'E6C52C0A7D2CAB33D70432A6852782', aad: '987BFDB6EB252B31EFBF870610E6C9', ct: 'C317394E3B6BA844B802B6D0C50674', tag: '55BD533F', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 58, key: 'BAB7F1AD26879A5C1FA05AFB9BCD2E56', iv: '0025EDCB9EEB86C903C7DB0F47E533', aad: '61CCF80AE4C763501561C207F6A150', ct: '1CFBC3184517DEF8C6DA9B54D424F5', tag: '06062B98', pt: '', pass: false },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 59, key: '3D8B12B8D94E468159F693E9FE6ADA42', iv: '6D71058BDA490ACBE3F9DF5B6F6FB6', aad: 'A3ECE66B9194C2D355D4C6560C05F8', ct: '0271C0AF38C6A66953D232920ECC98', tag: '8895E921', pt: '6FF8BD7DB426A515757D3A2DECEA8A', pass: true },
    { tg: 4, kl: 128, iv_l: 120, pl: 120, al: 120, tl: 32, tc: 60, key: 'FB3EF497873C10478D6CE8197D97C8DA', iv: '502704A4439F199CE8681865EC9039', aad: 'BA04B5A3E7166D4D96B68E247469BC', ct: '2CFC58C0F2D46D1B5A48B768AF2E00', tag: '62C2944C', pt: 'F55B25B6FC79DD718F4240C6EB7482', pass: true }
];

const GMAC_AFT_ENC = [
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 1, key: '8FA89CE32BAFD241E64FED4EC3622043', iv: '06A1D52255A40CBED2A86FFF4B1435', aad: '04857D11758185BC30BEFFD1562144', tag: 'B6FD5B21FE257AFB531B0C35B0A45FA2' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 2, key: 'AA7B47F3B19FA9D8A36F92C9CFD48AE7', iv: 'C659DE9F96DBBC63A9BE322443718A', aad: 'DE63CE99EC0F4DA7449FABF8F04BB9', tag: '4631BD30333095B73E10F65CE70F9A6B' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 3, key: 'D0FCEE1271E029D68B0DD40CA685A0D2', iv: '254514F6C9460ACF4F0366E6E27FC4', aad: '2ECACE1ABFABF24C3819F509DEFFDB', tag: '90BA69602AA4C65A7B4FCECC74DEDC32' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 4, key: 'F894C56FDB05E6E3F892FBC2661169B7', iv: '96F8B49A9B491B0311AF52EEFE0A5E', aad: '5F359BE1C413D2B26B28859FC70D0A', tag: 'DCD1B460B0E92AEC26834E1A654489AA' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 5, key: '6C1223FC62015728761F8C776703F376', iv: '27F326CC30A6F4F8FF56433F8CAABE', aad: '06AA3BF322FCCBD0BE1F29AFC8B1FC', tag: '9A2563E18C64EAAC0AB52C16B60BBD44' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 6, key: '69140D05638880F25E838E6E8E29883E', iv: 'CF12DE4F1D4797EBC1C23A7F48EB0E', aad: '1A621FE30054FBA27EF960DACB8864', tag: '8DCE028473C00B0767672318F69FBC11' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 7, key: '34B528636454ECB78A4D1A80CC3EE1D6', iv: '6EC6D3476357A955325D05A04802DD', aad: 'DA0CED21AFC45AC1142255CA6E6376', tag: '50189C8EC5CA7869BF2B15EAB8CEF87F' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 8, key: 'B72965DC373551732FF249AED30163AB', iv: 'B57AD14EB73BF7A57FB8EACBA10F6A', aad: '5D892870C4A885E93FB08898E64FCC', tag: 'D7936984A7F9B61E7B21996919578651' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 9, key: 'CF1848BC12A5E8885544C00E1F0DBF77', iv: 'C9021B6A7847E2EDBED2EB2D1AFF11', aad: '9CA3BD213FD7F2299B524745842971', tag: 'FA809760D62BECB08A6533298A944EBE' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 10, key: 'B779A78E33483FCACB5E3DC3624EC407', iv: '73BE8BD9B87B776ED6E4CC63C904C2', aad: '5D2B1E7864305236E66595D7A79F91', tag: '5133FCA8CD3D3AB0BD22DA989778165C' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 11, key: '09E23427FDF259FE0B6BD387FE84904F', iv: '90FA48B35ADF7050470F72135BB68B', aad: 'C9B1B69CB38881FE0F91745E43308F', tag: '0A9FB37D58AE16986813275CE8EDBF5A' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 12, key: 'F23AAB37E72832CCAFD117A420EDD4DC', iv: '35B023D3F05818BC9B9F721A86719B', aad: '7314E4548FE447BA861BD8139F8F56', tag: 'C8D18B2FCDA6E86D773917CDF71858D9' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 13, key: '858548EADFEE23FC4DED97F0D0085681', iv: '6B673376CEDC51E4CFE693B7CB0C40', aad: '85A6B4AA51A3DBCDBAD161FA1A42B7', tag: '195A1230A96A67315EC55F380E5CA796' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 14, key: '5F50CE64FF4287A9DFE0CC3D1B3C4213', iv: 'F7A9A02CE86FFC14362D11B93CADDA', aad: 'B85292CDEA34B2E66B5D8761632D9F', tag: 'A336B525D5E725CD966ECD1108A072CF' },
    { tg: 1, kl: 128, iv_l: 120, al: 120, tl: 128, tc: 15, key: 'F2C14D64EBE79273040C825283910B45', iv: 'FAAFA6132871FFBDAA1F593E9A3D6A', aad: 'CF38BAA75A1B2BE9C7A1D073A39E99', tag: '2F86DF4D271E6F6CB1CD1EC439CF9516' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 16, key: 'E3F49ACE9713B2EC43B5AA9D0E0CF119', iv: 'CE5AD159921FCB89FB95BF7A', aad: '', tag: 'DDF76017' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 17, key: '535BD1730BF3201F1518FB44548A4956', iv: 'C1D9FF4DE97333B1052F354F', aad: '', tag: 'D1D8B284' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 18, key: 'E6A1FB2281DCA0788DE25630E5787434', iv: '236A8675180DFF0DF90A838B', aad: '', tag: 'A8090835' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 19, key: 'E16FF2B9F7AE0CAE30DA0EF1C3A871EE', iv: '35AEEEDCD4BAB0F00C74DC2B', aad: '', tag: 'DC769209' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 20, key: '05B72822E9AE78D84F204F8E0EA097A2', iv: 'ED41C911605EF500DE7DF1B7', aad: '', tag: '167E2519' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 21, key: 'D55ED789100D22E91946A5A7B74BE235', iv: '7A1C43E73803E6216F7DEBA0', aad: '', tag: 'B5ED74B9' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 22, key: 'FD264B0830383D40B8CD24A300EAD612', iv: '3EB615D661989857D1FC1B8C', aad: '', tag: 'D6FBDB6F' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 23, key: '9F8C07C932DB646786B601BF3EDAEBB7', iv: '7C04B9B022CB4CF27B2A4D9E', aad: '', tag: '5DE58816' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 24, key: 'B3E3CE1F270BE6DE85490649ED7FCED3', iv: '89C76F02C86D00D2A390FF3F', aad: '', tag: '9B1AD8D5' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 25, key: '3A6782EF0B1DD4A41114DC0480E8A63A', iv: 'FEBCC5CA894793E7869C64A3', aad: '', tag: 'F9347256' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 26, key: 'D8AD1BF5039303AD9ACE9302009C4A5E', iv: 'B234C43A6981EF7EFD9D83F4', aad: '', tag: '4B73E64D' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 27, key: '9ABFF355850E1504AD80104A8449B3E5', iv: '3DDFBAF44E6B31F92FC6A410', aad: '', tag: '24851653' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 28, key: 'DA47C63D1F00A4B81F4CC7F7DC04F684', iv: '28D5767CD10237E9331F8539', aad: '', tag: '25974248' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 29, key: '76C9147E24869AC974536C24ABCDEEFC', iv: 'F03E85B3234DD09D37B7951A', aad: '', tag: 'FA7C5FBC' },
    { tg: 2, kl: 128, iv_l: 96, al: 0, tl: 32, tc: 30, key: '170BC69BB551CE777DEC19273F51B831', iv: 'F0328CB607E5337205049077', aad: '', tag: '41630D83' }
];

const GMAC_AFT_DEC = [
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 31, key: '6E4C93B80129142512F0592F85EF77FF', iv: 'F92F0F5D5682EB21E4FC21D20843CD', aad: '4C6EAF38E66887544E71AF10C3297C', tag: '84828D2D', pass: false },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 32, key: 'A0CC0A24020A3F6681C3454A01B1AC56', iv: '5F33F44CB26F9D9B05FDAA625D3246', aad: '1D7AF973C502F7D5FFF30CC824F181', tag: '8A626ADF', pass: false },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 33, key: '995E8BEC69D3E8447C09DD7C88A1DF39', iv: '9A291EE130403E6F03801F8A7B87BA', aad: 'BADDF73AB766487AB5259D0670AEB3', tag: '2A64AEA0', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 34, key: '2D98A9B7A34D9A51DAB439B3E48B1521', iv: '96FA7DC55704D0A9CA8C0A6ACBA011', aad: '1AB13605468FCDEDF1974083073855', tag: '4A27323B', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 35, key: '1089E0328D7692DA6315A6587D731849', iv: 'D36080210B8AE55F665D46ACC04100', aad: '378C64FA9BDE6570A77E6915A991E1', tag: '6AB58BF5', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 36, key: 'A49272DC5BE3F2E48F2F492768A2241E', iv: '4825221C262B06A0CDF6E7699CF85D', aad: '54A4A502C09D6C5269AB931C991C57', tag: '55CFF0C4', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 37, key: 'B3BD44BD95EDCAB0B832ADEAA1EB3EDD', iv: 'A14C54DEC132169E235DE9B60C363F', aad: '4256C0053F61D9D839127541E06137', tag: 'DEF06852', pass: false },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 38, key: 'F3B22DC1F521D8A718D64B7B844A115B', iv: '6719EF085C45819A9D0168A056CF27', aad: '6B44B147ED74C7498668027CC2D459', tag: 'ED4448B4', pass: false },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 39, key: 'A5D81384B78F22179333172BABC0A82A', iv: 'A02F1397C94CB998031B4A7C40B9C3', aad: 'D3208FE78D9459627E0E460BED5A87', tag: '4E21B80C', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 40, key: '3E61C88157D5CA6B08C3510325C050BD', iv: '8F5983B2C73CDD298418E1C572B736', aad: '30F42B6F96C53DD84C907248AB4A76', tag: '9AB8BF21', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 41, key: '519513551F37C5A7CBB5CF49453C56DB', iv: 'FD4039ADDA2E6F30F8BFA398F139A6', aad: '5EB9F15EEB73539F683C8273320DC5', tag: '2C9E855E', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 42, key: 'F37AF3804E0194A89024CEA78A4773A2', iv: 'DC7151C306253272A836AA79135A65', aad: 'E8FC19DC26C64B1D88CAF6DB9E898E', tag: 'CB02E842', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 43, key: '128EB99E0167DB6F4BDE03AA8D8AEB82', iv: '5AAA8D383435BB50FC2C4E73E95DFE', aad: '553E93750F94CC803032821C76C72C', tag: 'CA824FE0', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 44, key: '83A7B4A31B0DC28C329AAA8CCF29ED9E', iv: 'C533C86F0685F0A9A073C19442E3D5', aad: '8175324C7B814B77C3DAC0FB1B5E3E', tag: 'CDE0C429', pass: true },
    { tg: 3, kl: 128, iv_l: 120, al: 120, tl: 32, tc: 45, key: '0028F06EEB689533A5C60496ABF75FD5', iv: 'C50BB213D7D4B5D6862E26033D22E3', aad: 'E17C1F1537FBE1DC61658AEE064B12', tag: '45EBCB36', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 46, key: '347026F63EC77C409CFAFC2A99D21369', iv: '4C488F70B33239DA24B0DF7F', aad: '', tag: 'D61806586FAD3E6C64F120BD86D15B9D', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 47, key: '809B4EDEF227A40FCBD9ABFFB786B572', iv: 'E7E75745979208965D0781E8', aad: '', tag: '7A4C292E5D023CD0B9C0EA6A3A57115B', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 48, key: 'D114F4CEA596B385C7F4B7C95D13A192', iv: '6A6F56BB61642D1E7805E471', aad: '', tag: '49944D67A6FA54DEF2DB5DAFBA7F559F', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 49, key: '841189C64897CCA598228A61A6E86583', iv: '0034DFEAADEE7FD50D5F3B11', aad: '', tag: 'F8A6A21327EC2DB39A4C43A0AC3458A8', pass: false },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 50, key: 'B7EB1AC41212697D51C5F33AFD068EB7', iv: '3C645D8BB4CBB1FA37FDAD85', aad: '', tag: 'B0E986D3A7653079F902D7100E6D57C2', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 51, key: 'F959E084D361260FE598D09B81003717', iv: '6F53A251F1DAC14D4D98C35D', aad: '', tag: 'B5DBFB5E0F2D170A3C424BEC2E4972FB', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 52, key: 'A372F9B1BFB1D0E5D042FBE69B894AD3', iv: 'A709ACF05263ABCCF016F872', aad: '', tag: 'B2D354963FF324824A5A3D16203FB65F', pass: false },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 53, key: '5CEEE1AE13E14A94FA1AB1706353ED13', iv: 'DBFEB31F965726AF6AF80457', aad: '', tag: 'B5F5EE0D1EA425962AD8438BB5F89387', pass: false },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 54, key: '21C7718D29CEEE3502B0735AAA40264F', iv: '55EBB97A2C8E86A08BAFB1FF', aad: '', tag: '2497F63BC23617E4C7A54DF734F66DA8', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 55, key: '5582BB3B7604C52395F05E11B4B31104', iv: '0D5DE9C445269B6373FC4D22', aad: '', tag: '3FDA889E674A394B80CDE5B448DDC2E5', pass: false },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 56, key: '5B73D02ABEBC6E9ECA283C2B6F346E27', iv: '6010D1C4A635F31157A66FE5', aad: '', tag: '751807E003DAFE550954103CB0EB4E11', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 57, key: '5E28AD3C4A32DBB90BC2CC07B51AD4AD', iv: '23330D0573C1857CBB1F4D1B', aad: '', tag: '89C5061EA225CBBD10EDD9FAD6C61448', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 58, key: '692AA407DE7F4C2BF1A0815794FE47C9', iv: '12F76C11A9E7B988BCCFFC58', aad: '', tag: '7ECCF1C74BB5E13B105C12A4DF4E6ED7', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 59, key: '7A84A756F160B2AC199B43C2A45F2784', iv: 'D2E6AE02CDAB80CF174C367C', aad: '', tag: '1D046098FB3EAFCB9BEC49E072260A3F', pass: true },
    { tg: 4, kl: 128, iv_l: 96, al: 0, tl: 128, tc: 60, key: 'BDA5CE75D239EE5606EC2673C694A639', iv: 'DF1CDDCDE00B9D283A3B81C5', aad: '', tag: 'FAF7AC5EB6302674732AEB0B8BFD37A4', pass: true }
];

describe('gcm - ACVP-AES-GCM-1.0', () => {

    describe('AFT encrypt (30 vectors -- all 60 byte-exact)', () => {
        test.each(GCM_AFT_ENC)('tgId=$tg tcId=$tc (AES-$kl, ivLen=$iv_l, ptLen=$pl, aadLen=$al, tagLen=$tl)', (v) => {
            const cipher = _aes.ttable.fn(fromHex(v.key), false);
            const pt = haxToBitsBA(v.pt, v.pl);
            const iv = haxToBitsBA(v.iv, v.iv_l);
            const aad = haxToBitsBA(v.aad, v.al);
            const r = _gcm.encrypt(cipher, pt, iv, aad, v.tl);
            expect(r).not.toBe(false);
            expect(toHex(_ba.clamp(r.ct, v.pl))).toBe(v.ct.toLowerCase());
            expect(toHex(_ba.clamp(r.tag, v.tl))).toBe(v.tag.toLowerCase());
        });
    });

    describe('AFT decrypt (30 vectors -- includes pass+fail labels)', () => {
        test.each(GCM_AFT_DEC)('tgId=$tg tcId=$tc (AES-$kl, ivLen=$iv_l, ctLen=$pl, aadLen=$al, tagLen=$tl, pass=$pass)', (v) => {
            const cipher = _aes.ttable.fn(fromHex(v.key), false);
            const ct = haxToBitsBA(v.ct, v.pl);
            const iv = haxToBitsBA(v.iv, v.iv_l);
            const aad = haxToBitsBA(v.aad, v.al);
            const tag = _ba.clamp(fromHex(v.tag), v.tl);
            const result = _gcm.decrypt(cipher, ct, iv, aad, tag, v.tl);
            if (v.pass) {
                expect(result).not.toBe(false);
                expect(toHex(_ba.clamp(result, v.pl))).toBe(v.pt.toLowerCase());
            } else {
                expect(result).toBe(false);
            }
        });
    });

});

describe('gmac - ACVP-AES-GMAC-1.0', () => {

    describe('AFT encrypt (30 vectors -- all 30 byte-exact)', () => {
        test.each(GMAC_AFT_ENC)('tgId=$tg tcId=$tc (AES-$kl, ivLen=$iv_l, aadLen=$al, tagLen=$tl)', (v) => {
            const cipher = _aes.ttable.fn(fromHex(v.key), false);
            const iv = haxToBitsBA(v.iv, v.iv_l);
            const aad = haxToBitsBA(v.aad, v.al);
            const tag = _gcm.gmac(cipher, aad, iv, v.tl);
            expect(tag).not.toBe(false);
            expect(toHex(_ba.clamp(tag, v.tl))).toBe(v.tag.toLowerCase());
        });
    });

    describe('AFT decrypt (30 vectors -- includes pass+fail labels)', () => {
        test.each(GMAC_AFT_DEC)('tgId=$tg tcId=$tc (AES-$kl, ivLen=$iv_l, aadLen=$al, tagLen=$tl, pass=$pass)', (v) => {
            const cipher = _aes.ttable.fn(fromHex(v.key), false);
            const iv = haxToBitsBA(v.iv, v.iv_l);
            const aad = haxToBitsBA(v.aad, v.al);
            const tag = _ba.clamp(fromHex(v.tag), v.tl);
            const result = _gcm.gmacVerify(cipher, aad, iv, tag, v.tl);
            expect(result).toBe(v.pass);
        });
    });

});
