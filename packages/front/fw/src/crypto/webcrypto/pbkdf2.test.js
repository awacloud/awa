// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { webcryptoPbkdf2 } from './pbkdf2.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const toUi8 = (s) => enc.encode(s);

/** Uint8Array → lowercase hex string */
function toHex(ui8) {
    return Array.from(ui8, b => b.toString(16).padStart(2, '0')).join('');
}

/** Hex string → Uint8Array */
function fromHex(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

// ── Module metadata ────────────────────────────────────────────────────────

describe('webcryptoPbkdf2 — module metadata', () => {
    test('name', () => {
        expect(webcryptoPbkdf2.name).toBe('webcryptoPbkdf2');
    });

    test('version', () => {
        expect(webcryptoPbkdf2.version).toBe('1.0.0');
    });

    test('type', () => {
        expect(webcryptoPbkdf2.type).toBe('fw.crypto.webcrypto');
    });

    test('dependencies / deps are empty arrays', () => {
        expect(webcryptoPbkdf2.dependencies).toEqual([]);
        expect(webcryptoPbkdf2.deps).toBeUndefined();
    });

    test('factory is a function', () => {
        expect(typeof webcryptoPbkdf2.factory).toBe('function');
    });
});

// ── Factory API shape ──────────────────────────────────────────────────────

const wc = webcryptoPbkdf2.factory();

describe('webcryptoPbkdf2 — factory API shape', () => {
    test('returns object with isAvailable, deriveBits, deriveKey', () => {
        expect(typeof wc.isAvailable).toBe('function');
        expect(typeof wc.deriveBits).toBe('function');
        expect(typeof wc.deriveKey).toBe('function');
    });

    test('isAvailable() returns boolean', () => {
        expect(typeof wc.isAvailable()).toBe('boolean');
    });
});

// ── Availability guard (conditional — skip if crypto.subtle absent) ────────

const available = wc.isAvailable();

// ── Published PBKDF2-HMAC-SHA-256 vectors ─────────────────────────────────
//
// Source: well-known test vectors published alongside RFC 7914 (scrypt) and
// commonly used to validate PBKDF2-HMAC-SHA-256 implementations, matching
// the same vectors used in packages/front/fw/src/crypto/hash/pbkdf2.test.js.

describe('webcryptoPbkdf2 — PBKDF2-HMAC-SHA-256 published vectors', () => {
    test.skipIf(!available)('P="password", S="salt", c=1, dkLen=256 bits', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 1, 'SHA-256');
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    });

    test.skipIf(!available)('P="password", S="salt", c=2, dkLen=256 bits', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 2, 'SHA-256');
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
    });

    test.skipIf(!available)('P="password", S="salt", c=4096, dkLen=256 bits', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 4096, 'SHA-256');
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
    }, 30_000);

    test.skipIf(!available)('P="passwordPASSWORDpassword", S=long, c=4096, dkLen=320 bits', async () => {
        const result = await wc.deriveBits(
            toUi8('passwordPASSWORDpassword'),
            toUi8('saltSALTsaltSALTsaltSALTsaltSALTsalt'),
            320,
            4096,
            'SHA-256'
        );
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9');
    }, 30_000);
});

// ── RFC 6070 PBKDF2-HMAC-SHA-1 vectors ────────────────────────────────────
//
// Source: RFC 6070 §2. Using small c to keep tests fast.

describe('webcryptoPbkdf2 — RFC 6070 PBKDF2-HMAC-SHA-1 vectors', () => {
    test.skipIf(!available)('P="password", S="salt", c=1, dkLen=160 bits', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 160, 1, 'SHA-1');
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('0c60c80f961f0e71f3a9b524af6012062fe037a6');
    });

    test.skipIf(!available)('P="password", S="salt", c=2, dkLen=160 bits', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 160, 2, 'SHA-1');
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957');
    });
});

// ── PBKDF2-HMAC-SHA-512 spot check ────────────────────────────────────────

describe('webcryptoPbkdf2 — PBKDF2-HMAC-SHA-512 spot check', () => {
    test.skipIf(!available)('P="password", S="salt", c=1, dkLen=256 bits', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 1, 'SHA-512');
        expect(result).not.toBe(false);
        expect(toHex(result)).toBe('867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252');
    });
});

// ── Parity vs pure-JS pbkdf2 ───────────────────────────────────────────────
//
// Cross-check one derivation (c=2, SHA-256, 256 bits) against the pure-JS
// module. The pure-JS result is a known vector so we compare both against it.

describe('webcryptoPbkdf2 — parity with pure-JS pbkdf2 module', () => {
    test.skipIf(!available)('c=2, SHA-256, 256-bit output matches pure-JS vector', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 2, 'SHA-256');
        expect(result).not.toBe(false);
        // Same vector as pure-JS pbkdf2.test.js c=2 case
        expect(toHex(result)).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
    });

    test.skipIf(!available)('c=1, SHA-256 matches pure-JS anchor vector', async () => {
        const result = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 1, 'SHA-256');
        expect(result).not.toBe(false);
        // Same vector as pure-JS pbkdf2.test.js c=1 case
        expect(toHex(result)).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    });
});

// ── deriveKey ──────────────────────────────────────────────────────────────

describe('webcryptoPbkdf2 — deriveKey', () => {
    test.skipIf(!available)('returns a CryptoKey with correct algorithm (AES-GCM 256)', async () => {
        const key = await wc.deriveKey(
            toUi8('password'),
            toUi8('salt'),
            { name: 'AES-GCM', length: 256 },
            ['encrypt', 'decrypt'],
            10,
            'SHA-256',
            false
        );
        expect(key).not.toBe(false);
        expect(key instanceof CryptoKey).toBe(true);
        expect(key.type).toBe('secret');
        expect(key.algorithm.name).toBe('AES-GCM');
        expect(key.algorithm.length).toBe(256);
        expect(key.extractable).toBe(false);
    });

    test.skipIf(!available)('derived AES-GCM key can encrypt/decrypt a round-trip', async () => {
        const key = await wc.deriveKey(
            toUi8('password'),
            toUi8('salt'),
            { name: 'AES-GCM', length: 256 },
            ['encrypt', 'decrypt'],
            10,
            'SHA-256'
        );
        expect(key).not.toBe(false);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plaintext = toUi8('hello world');
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    test.skipIf(!available)('extractable=true produces extractable key', async () => {
        const key = await wc.deriveKey(
            toUi8('p'),
            toUi8('s'),
            { name: 'AES-GCM', length: 128 },
            ['encrypt'],
            10,
            'SHA-256',
            true
        );
        expect(key).not.toBe(false);
        expect(key.extractable).toBe(true);
    });
});

// ── deriveBits output shape ────────────────────────────────────────────────

describe('webcryptoPbkdf2 — deriveBits output shape', () => {
    test.skipIf(!available)('returns Uint8Array of correct byte length', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 128, 1, 'SHA-256');
        expect(result).not.toBe(false);
        expect(result instanceof Uint8Array).toBe(true);
        expect(result.byteLength).toBe(16);
    });

    test.skipIf(!available)('256-bit output is 32 bytes', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 256, 1, 'SHA-256');
        expect(result instanceof Uint8Array).toBe(true);
        expect(result.byteLength).toBe(32);
    });

    test.skipIf(!available)('default hash (no hash arg) is SHA-256', async () => {
        const withDefault = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 1);
        const withSha256 = await wc.deriveBits(toUi8('password'), toUi8('salt'), 256, 1, 'SHA-256');
        expect(withDefault).not.toBe(false);
        expect(toHex(withDefault)).toBe(toHex(withSha256));
    });
});

// ── Invalid input → false ──────────────────────────────────────────────────

describe('webcryptoPbkdf2 — invalid input returns false', () => {
    test('deriveBits: iterations=0 → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 128, 0);
        expect(result).toBe(false);
    });

    test('deriveBits: iterations=-1 → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 128, -1);
        expect(result).toBe(false);
    });

    test('deriveBits: iterations=1.5 (non-integer) → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 128, 1.5);
        expect(result).toBe(false);
    });

    test('deriveBits: lengthBits=0 → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 0, 1);
        expect(result).toBe(false);
    });

    test('deriveBits: lengthBits=-128 → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), -128, 1);
        expect(result).toBe(false);
    });

    test('deriveBits: lengthBits=12 (not multiple of 8) → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 12, 1);
        expect(result).toBe(false);
    });

    test('deriveBits: unsupported hash "SHA-3-256" → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 128, 1, 'SHA-3-256');
        expect(result).toBe(false);
    });

    test('deriveBits: unsupported hash "SHA-224" → false', async () => {
        const result = await wc.deriveBits(toUi8('p'), toUi8('s'), 128, 1, 'SHA-224');
        expect(result).toBe(false);
    });

    test('deriveKey: iterations=0 → false', async () => {
        const result = await wc.deriveKey(
            toUi8('p'), toUi8('s'),
            { name: 'AES-GCM', length: 256 }, ['encrypt'], 0
        );
        expect(result).toBe(false);
    });

    test('deriveKey: unsupported hash → false', async () => {
        const result = await wc.deriveKey(
            toUi8('p'), toUi8('s'),
            { name: 'AES-GCM', length: 256 }, ['encrypt'], 1, 'SHA-3-512'
        );
        expect(result).toBe(false);
    });
});
