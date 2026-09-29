// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for webcryptoHmac — WebCrypto-backed HMAC module.
 *
 * Covers:
 * - Module metadata and factory shape
 * - RFC 4231 HMAC-SHA-256 test vectors (TC1 and TC2)
 * - Round-trip: sign → verify (correct/tampered signature/data)
 * - mac() one-shot equals importKey+sign
 * - Parity cross-check against pure-JS hmac module
 * - Unsupported hash → false
 * - SHA-1 emits deprecation warning
 */

import { describe, test, expect, spyOn, mock } from 'bun:test';
import { webcryptoHmac } from './hmac.js';
import { hmac } from '../hash/hmac.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { sha256 } from '../hash/sha256.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hex string → Uint8Array */
function fromHex(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** Uint8Array → lowercase hex string */
function toHex(u8) {
    return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** ASCII/UTF-8 string → Uint8Array */
function fromStr(s) {
    return new TextEncoder().encode(s);
}

// ---------------------------------------------------------------------------
// Pure-JS hmac helpers for the parity cross-check
// ---------------------------------------------------------------------------

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _hmac = hmac.factory(_ba, _utf8, _sha256);

/** Compute HMAC-SHA-256 with pure-JS and return hex.
 * Keys and data must be passed as bitArray (number[]) for correct word packing. */
function pureHmacHex(keyBytes, dataBytes) {
    // Convert Uint8Array → bitArray (word-packed) before handing to pure-JS hmac
    const keyBa = _ba.ui8_to_ba(keyBytes);
    const dataBa = _ba.ui8_to_ba(dataBytes);
    const mac = new _hmac.fn(keyBa).encrypt(dataBa);
    if (mac === false) return null;
    return toHex(_ba.ba_to_ui8(mac));
}

// ---------------------------------------------------------------------------
// Instantiate the module under test
// ---------------------------------------------------------------------------

const _wc = webcryptoHmac.factory();

// ---------------------------------------------------------------------------
// 1. Metadata + factory shape
// ---------------------------------------------------------------------------

describe('webcryptoHmac metadata', () => {
    test('name', () => expect(webcryptoHmac.name).toBe('webcryptoHmac'));
    test('type', () => expect(webcryptoHmac.type).toBe('fw.crypto.webcrypto'));
    test('dependencies is empty', () => expect(webcryptoHmac.dependencies).toEqual([]));
    test('factory is a function', () => expect(typeof webcryptoHmac.factory).toBe('function'));
});

describe('webcryptoHmac factory shape', () => {
    test('isAvailable is a function', () => expect(typeof _wc.isAvailable).toBe('function'));
    test('importKey is a function', () => expect(typeof _wc.importKey).toBe('function'));
    test('generateKey is a function', () => expect(typeof _wc.generateKey).toBe('function'));
    test('sign is a function', () => expect(typeof _wc.sign).toBe('function'));
    test('verify is a function', () => expect(typeof _wc.verify).toBe('function'));
    test('mac is a function', () => expect(typeof _wc.mac).toBe('function'));
    test('isAvailable returns boolean', () => expect(typeof _wc.isAvailable()).toBe('boolean'));
    test('isAvailable is true in Bun (crypto.subtle available)', () => {
        // Bun exposes globalThis.crypto.subtle
        expect(_wc.isAvailable()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 2. RFC 4231 HMAC-SHA-256 test vectors
// ---------------------------------------------------------------------------

describe('webcryptoHmac RFC 4231 HMAC-SHA-256 vectors', () => {
    // TC1: key = 20 bytes of 0x0b, data = "Hi There"
    // Expected: b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
    test('TC1: 20-byte key 0x0b, "Hi There"', async () => {
        const key = fromHex('0b'.repeat(20));
        const data = fromStr('Hi There');
        const tag = await _wc.mac(key, data);
        expect(tag).not.toBe(false);
        expect(toHex(tag)).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    });

    // TC2: key = "Jefe", data = "what do ya want for nothing?"
    // Expected: 5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843
    test('TC2: key "Jefe", "what do ya want for nothing?"', async () => {
        const key = fromStr('Jefe');
        const data = fromStr('what do ya want for nothing?');
        const tag = await _wc.mac(key, data);
        expect(tag).not.toBe(false);
        expect(toHex(tag)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    });
});

// ---------------------------------------------------------------------------
// 3. Round-trip: sign then verify
// ---------------------------------------------------------------------------

describe('webcryptoHmac sign/verify round-trip', () => {
    test('sign then verify returns true', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const data = fromStr('Hello, WebCrypto!');
        const key = await _wc.importKey(rawKey);
        expect(key).not.toBe(false);
        const sig = await _wc.sign(key, data);
        expect(sig).not.toBe(false);
        const ok = await _wc.verify(key, sig, data);
        expect(ok).toBe(true);
    });

    test('tampered signature returns false', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const data = fromStr('tamper-sig-test');
        const key = await _wc.importKey(rawKey);
        const sig = await _wc.sign(key, data);
        expect(sig).not.toBe(false);
        // Flip one bit in the signature
        const tampered = new Uint8Array(sig);
        tampered[0] ^= 0x01;
        const ok = await _wc.verify(key, tampered, data);
        expect(ok).toBe(false);
    });

    test('tampered data returns false', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const data = fromStr('tamper-data-test');
        const key = await _wc.importKey(rawKey);
        const sig = await _wc.sign(key, data);
        expect(sig).not.toBe(false);
        const tamperedData = fromStr('tamper-data-XXXX');
        const ok = await _wc.verify(key, sig, tamperedData);
        expect(ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 4. mac() one-shot equals importKey + sign
// ---------------------------------------------------------------------------

describe('webcryptoHmac mac() one-shot parity', () => {
    test('mac equals importKey then sign', async () => {
        const rawKey = fromHex('aa'.repeat(20));
        const data = fromStr('parity check data');
        // Via mac()
        const macTag = await _wc.mac(rawKey, data);
        expect(macTag).not.toBe(false);
        // Via importKey + sign
        const key = await _wc.importKey(rawKey);
        const signTag = await _wc.sign(key, data);
        expect(signTag).not.toBe(false);
        expect(toHex(macTag)).toBe(toHex(signTag));
    });
});

// ---------------------------------------------------------------------------
// 5. Cross-check one vector against pure-JS hmac (parity)
// ---------------------------------------------------------------------------

describe('webcryptoHmac parity with pure-JS hmac on RFC 4231 TC1', () => {
    test('TC1 hex matches pure-JS hmac', async () => {
        const keyBytes = fromHex('0b'.repeat(20));
        const dataBytes = fromStr('Hi There');

        // WebCrypto result
        const wcTag = await _wc.mac(keyBytes, dataBytes);
        expect(wcTag).not.toBe(false);
        const wcHex = toHex(wcTag);

        // Pure-JS result
        const pureHex = pureHmacHex(keyBytes, dataBytes);
        expect(pureHex).not.toBeNull();

        expect(wcHex).toBe(pureHex);
    });
});

// ---------------------------------------------------------------------------
// 6. Unsupported hash → false
// ---------------------------------------------------------------------------

describe('webcryptoHmac unsupported hash', () => {
    test('importKey with unsupported hash returns false', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const result = await _wc.importKey(rawKey, 'SHA-3-256');
        expect(result).toBe(false);
    });

    test('generateKey with unsupported hash returns false', async () => {
        const result = await _wc.generateKey('SHA-224');
        expect(result).toBe(false);
    });

    test('mac with unsupported hash returns false', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const data = fromStr('test');
        const result = await _wc.mac(rawKey, data, 'BLAKE2b');
        expect(result).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 7. SHA-1 emits deprecation warning
// ---------------------------------------------------------------------------

describe('webcryptoHmac SHA-1 deprecation warning', () => {
    test('importKey with SHA-1 emits console.warn', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const originalWarn = console.warn;
        const warnings = [];
        console.warn = (...args) => warnings.push(args.join(' '));
        try {
            const key = await _wc.importKey(rawKey, 'SHA-1');
            // SHA-1 is supported, so it should succeed
            expect(key).not.toBe(false);
        } finally {
            console.warn = originalWarn;
        }
        expect(warnings.some(w => w.includes('[crypto] DEPRECATED: HMAC-SHA-1'))).toBe(true);
    });

    test('mac with SHA-1 still returns a result (legacy interop)', async () => {
        const rawKey = fromHex('0b'.repeat(20));
        const data = fromStr('sha1 test');
        const originalWarn = console.warn;
        console.warn = () => {};
        let result;
        try {
            result = await _wc.mac(rawKey, data, 'SHA-1');
        } finally {
            console.warn = originalWarn;
        }
        // Should return a Uint8Array (20 bytes for SHA-1)
        expect(result).not.toBe(false);
        expect(result instanceof Uint8Array).toBe(true);
        expect(result.length).toBe(20);
    });
});

// ---------------------------------------------------------------------------
// 8. generateKey produces a usable key
// ---------------------------------------------------------------------------

describe('webcryptoHmac generateKey', () => {
    test('generates a key that can sign and verify', async () => {
        const key = await _wc.generateKey('SHA-256');
        expect(key).not.toBe(false);
        const data = fromStr('generated key test');
        const sig = await _wc.sign(key, data);
        expect(sig).not.toBe(false);
        const ok = await _wc.verify(key, sig, data);
        expect(ok).toBe(true);
    });

    test('generateKey with custom bit length', async () => {
        const key = await _wc.generateKey('SHA-256', 256);
        expect(key).not.toBe(false);
    });
});
