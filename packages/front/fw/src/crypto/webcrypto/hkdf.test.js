// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for webcryptoHkdf — WebCrypto-backed HKDF deriveBits/deriveKey.
 *
 * Covers: module metadata, factory API shape, RFC 5869 Test Case 1 vectors,
 * zero-length-salt case, parity vs pure-JS hkdf, deriveKey usable CryptoKey,
 * and invalid-input rejection.
 */

import { describe, test, expect, mock } from 'bun:test';
import { webcryptoHkdf } from './hkdf.js';
import { hkdf } from '../hash/hkdf.js';
import { hmac } from '../hash/hmac.js';
import { sha256 } from '../hash/sha256.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a hex string to Uint8Array */
function fromHex(hexStr) {
    const bytes = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** Convert Uint8Array to lowercase hex string */
function toHex(u8) {
    return Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const _hkdf = webcryptoHkdf.factory();

// Pure-JS hkdf for parity comparison
const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _hexCodec = hex.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _hmacInst = hmac.factory(_ba, _utf8, _sha256);
const _hkdfPure = hkdf.factory(_ba, _utf8, _hmacInst);

// Helpers for pure-JS conversions
function ui8ToBa(u8) { return _ba.ui8_to_ba(u8); }
function baToHex(ba) { return _hexCodec.fromBytes(_ba.ba_to_ui8(ba)); }

// ---------------------------------------------------------------------------
// RFC 5869 Test Vectors
// ---------------------------------------------------------------------------

/**
 * RFC 5869 Appendix A.1 — Test Case 1: Basic case, SHA-256.
 * IKM, salt, info, L = 42 bytes (336 bits), expected OKM.
 */
const TC1 = {
    ikm:  fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
    salt: fromHex('000102030405060708090a0b0c'),
    info: fromHex('f0f1f2f3f4f5f6f7f8f9'),
    L: 42,
    expectedOkm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
};

/**
 * RFC 5869 Appendix A.3 — Test Case 3: zero-length salt and info, SHA-256.
 * IKM only — salt = empty (HMAC key = zeroed block per RFC 5869 §2.2).
 */
const TC3 = {
    ikm:  fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
    salt: new Uint8Array(0),
    info: new Uint8Array(0),
    L: 42,
    expectedOkm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webcryptoHkdf module', () => {

    // -- Metadata -----------------------------------------------------------

    describe('metadata', () => {
        test('name is webcryptoHkdf', () => {
            expect(webcryptoHkdf.name).toBe('webcryptoHkdf');
        });

        test('version is 1.0.0', () => {
            expect(webcryptoHkdf.version).toBe('1.0.0');
        });

        test('type is fw.crypto.webcrypto', () => {
            expect(webcryptoHkdf.type).toBe('fw.crypto.webcrypto');
        });

        test('dependencies is empty array', () => {
            expect(webcryptoHkdf.dependencies).toEqual([]);
        });

        test('factory is a function', () => {
            expect(typeof webcryptoHkdf.factory).toBe('function');
        });
    });

    // -- API shape ----------------------------------------------------------

    describe('factory API shape', () => {
        test('isAvailable is a function', () => {
            expect(typeof _hkdf.isAvailable).toBe('function');
        });

        test('deriveBits is a function', () => {
            expect(typeof _hkdf.deriveBits).toBe('function');
        });

        test('deriveKey is a function', () => {
            expect(typeof _hkdf.deriveKey).toBe('function');
        });

        test('isAvailable returns a boolean', () => {
            expect(typeof _hkdf.isAvailable()).toBe('boolean');
        });

        test('isAvailable returns true (crypto.subtle present in Bun)', () => {
            expect(_hkdf.isAvailable()).toBe(true);
        });
    });

    // -- RFC 5869 Test Case 1 -----------------------------------------------

    describe('RFC 5869 Test Case 1 (SHA-256, basic)', () => {
        test('deriveBits matches expected OKM', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, TC1.L * 8, 'SHA-256');
            expect(result).not.toBe(false);
            expect(toHex(/** @type {Uint8Array} */(result))).toBe(TC1.expectedOkm);
        });

        test('deriveBits returns Uint8Array of correct byte length', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, TC1.L * 8);
            expect(result).not.toBe(false);
            expect(/** @type {Uint8Array} */(result).byteLength).toBe(TC1.L);
        });

        test('default hash (SHA-256) matches explicit SHA-256', async () => {
            const explicit = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, TC1.L * 8, 'SHA-256');
            const defaultH = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, TC1.L * 8);
            expect(explicit).not.toBe(false);
            expect(defaultH).not.toBe(false);
            expect(toHex(/** @type {Uint8Array} */(explicit))).toBe(toHex(/** @type {Uint8Array} */(defaultH)));
        });
    });

    // -- Zero-length salt case ----------------------------------------------

    describe('RFC 5869 Test Case 3 (zero-length salt and info)', () => {
        test('deriveBits with empty salt returns correct OKM', async () => {
            const result = await _hkdf.deriveBits(TC3.ikm, TC3.salt, TC3.info, TC3.L * 8, 'SHA-256');
            expect(result).not.toBe(false);
            expect(toHex(/** @type {Uint8Array} */(result))).toBe(TC3.expectedOkm);
        });

        test('deriveBits with empty info (Uint8Array) works', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, new Uint8Array(0), TC1.L * 8);
            // Should succeed and return a Uint8Array (not the TC1 OKM since info differs)
            expect(result).not.toBe(false);
            expect(/** @type {Uint8Array} */(result)).toBeInstanceOf(Uint8Array);
        });
    });

    // -- Parity vs pure-JS hkdf --------------------------------------------

    describe('parity with pure-JS hkdf', () => {
        test('RFC 5869 TC1 OKM matches pure-JS hkdf.derive', async () => {
            // Pure-JS hkdf uses bitArray format
            const saltBa = Array.from(ui8ToBa(TC1.salt));
            const ikmBa  = Array.from(ui8ToBa(TC1.ikm));
            const infoBa = Array.from(ui8ToBa(TC1.info));

            const pureResult = _hkdfPure.derive(saltBa, ikmBa, infoBa, TC1.L * 8);
            const webcryptoResult = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, TC1.L * 8, 'SHA-256');

            expect(webcryptoResult).not.toBe(false);
            expect(baToHex(pureResult)).toBe(toHex(/** @type {Uint8Array} */(webcryptoResult)));
        });
    });

    // -- deriveKey ----------------------------------------------------------

    describe('deriveKey', () => {
        test('returns a CryptoKey for AES-GCM-256', async () => {
            const derivedKeyAlg = { name: 'AES-GCM', length: 256 };
            const usages = ['encrypt', 'decrypt'];
            const result = await _hkdf.deriveKey(
                TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, usages
            );
            expect(result).not.toBe(false);
            expect(result).toBeInstanceOf(CryptoKey);
        });

        test('CryptoKey has correct algorithm type', async () => {
            const derivedKeyAlg = { name: 'AES-GCM', length: 256 };
            const usages = ['encrypt', 'decrypt'];
            const key = await _hkdf.deriveKey(
                TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, usages, 'SHA-256'
            );
            expect(key).not.toBe(false);
            const cryptoKey = /** @type {CryptoKey} */(key);
            expect(cryptoKey.type).toBe('secret');
            expect(cryptoKey.algorithm.name).toBe('AES-GCM');
        });

        test('non-extractable by default (extractable=false)', async () => {
            const derivedKeyAlg = { name: 'AES-GCM', length: 128 };
            const usages = ['encrypt', 'decrypt'];
            const key = await _hkdf.deriveKey(
                TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, usages
            );
            expect(key).not.toBe(false);
            expect(/** @type {CryptoKey} */(key).extractable).toBe(false);
        });

        test('extractable=true when requested', async () => {
            const derivedKeyAlg = { name: 'AES-GCM', length: 128 };
            const usages = ['encrypt', 'decrypt'];
            const key = await _hkdf.deriveKey(
                TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, usages, 'SHA-256', true
            );
            expect(key).not.toBe(false);
            expect(/** @type {CryptoKey} */(key).extractable).toBe(true);
        });

        test('deriveKey with HMAC key produces usable sign key', async () => {
            const derivedKeyAlg = { name: 'HMAC', hash: 'SHA-256' };
            const usages = ['sign', 'verify'];
            const key = await _hkdf.deriveKey(
                TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, usages, 'SHA-256'
            );
            expect(key).not.toBe(false);
            const cryptoKey = /** @type {CryptoKey} */(key);
            expect(cryptoKey.type).toBe('secret');
            expect(cryptoKey.algorithm.name).toBe('HMAC');
            // Verify the key is actually usable for signing
            const data = new TextEncoder().encode('test message');
            const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
            expect(sig).toBeInstanceOf(ArrayBuffer);
            expect(sig.byteLength).toBe(32); // SHA-256 HMAC = 32 bytes
        });
    });

    // -- Invalid-input cases -----------------------------------------------

    describe('invalid inputs', () => {
        test('lengthBits = 0 → false', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, 0);
            expect(result).toBe(false);
        });

        test('lengthBits negative → false', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, -8);
            expect(result).toBe(false);
        });

        test('lengthBits not multiple of 8 → false', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, 100);
            expect(result).toBe(false);
        });

        test('lengthBits non-numeric → false', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, /** @type {any} */('256'));
            expect(result).toBe(false);
        });

        test('unsupported hash name → false', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, 256, /** @type {any} */('SHA-3-256'));
            expect(result).toBe(false);
        });

        test('SHA-224 unsupported → false', async () => {
            const result = await _hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, 256, /** @type {any} */('SHA-224'));
            expect(result).toBe(false);
        });

        test('deriveKey with unsupported hash → false', async () => {
            const derivedKeyAlg = { name: 'AES-GCM', length: 256 };
            const result = await _hkdf.deriveKey(
                TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, ['encrypt', 'decrypt'], /** @type {any} */('BLAKE2b')
            );
            expect(result).toBe(false);
        });
    });

    // -- No-throw contract --------------------------------------------------

    describe('no-throw contract', () => {
        test('deriveBits never rejects (invalid lengthBits)', async () => {
            // Must resolve (to false) not throw/reject
            await expect(_hkdf.deriveBits(TC1.ikm, TC1.salt, TC1.info, 7)).resolves.toBe(false);
        });

        test('deriveKey never rejects (invalid hash)', async () => {
            const derivedKeyAlg = { name: 'AES-GCM', length: 256 };
            await expect(
                _hkdf.deriveKey(TC1.ikm, TC1.salt, TC1.info, derivedKeyAlg, ['encrypt'], /** @type {any} */('invalid'))
            ).resolves.toBe(false);
        });
    });
});
