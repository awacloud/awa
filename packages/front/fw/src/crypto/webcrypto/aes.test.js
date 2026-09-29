// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { webcryptoAes } from './aes.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Convert a lowercase hex string to a Uint8Array. */
function fromHex(hex) {
    const out = new Uint8Array(hex.length >>> 1);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** Convert a Uint8Array to a lowercase hex string. */
function toHex(ui8) {
    return Array.from(ui8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── module-level instance ────────────────────────────────────────────────────

const _aes = webcryptoAes.factory();

// ── module metadata ──────────────────────────────────────────────────────────

describe('webcryptoAes — module metadata', () => {
    test('name', () => {
        expect(webcryptoAes.name).toBe('webcryptoAes');
    });

    test('version', () => {
        expect(webcryptoAes.version).toBe('1.0.0');
    });

    test('type', () => {
        expect(webcryptoAes.type).toBe('fw.crypto.webcrypto');
    });

    test('dependencies is empty array', () => {
        expect(webcryptoAes.dependencies).toEqual([]);
    });

    test('deps is absent (no dependencies)', () => {
        expect(webcryptoAes.deps).toBeUndefined();
    });

    test('factory is a function', () => {
        expect(typeof webcryptoAes.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('webcryptoAes — API shape', () => {
    test('isAvailable is a function', () => {
        expect(typeof _aes.isAvailable).toBe('function');
    });

    test('generateKey is a function', () => {
        expect(typeof _aes.generateKey).toBe('function');
    });

    test('importKey is a function', () => {
        expect(typeof _aes.importKey).toBe('function');
    });

    test('exportKey is a function', () => {
        expect(typeof _aes.exportKey).toBe('function');
    });

    test('encryptGcm is a function', () => {
        expect(typeof _aes.encryptGcm).toBe('function');
    });

    test('decryptGcm is a function', () => {
        expect(typeof _aes.decryptGcm).toBe('function');
    });

    test('encryptCbc is a function', () => {
        expect(typeof _aes.encryptCbc).toBe('function');
    });

    test('decryptCbc is a function', () => {
        expect(typeof _aes.decryptCbc).toBe('function');
    });

    test('encryptCtr is a function', () => {
        expect(typeof _aes.encryptCtr).toBe('function');
    });

    test('decryptCtr is a function', () => {
        expect(typeof _aes.decryptCtr).toBe('function');
    });

    test('isAvailable() returns boolean', () => {
        expect(typeof _aes.isAvailable()).toBe('boolean');
    });
});

// ── NIST SP 800-38D AES-GCM known-answer vectors ─────────────────────────────
//
// Test Case 4 from McGrew & Viega (2004), reproduced in NIST GCMVS.
// AES-128-GCM, 96-bit IV, 60-byte plaintext, 20-byte AAD, 128-bit tag.
//
// Key  : feffe9928665731c6d6a8f9467308308
// IV   : cafebabefacedbaddecaf888
// PT   : d9313225f88406e5a55909c5aff5269a
//          86a7a9531534f7da2e4c303d8a318a72
//          1c3c0c95956809532fcf0e2449a6b525
//          b16aedf5aa0de657ba637b39
// AAD  : feedfacedeadbeeffeedfacedeadbeef
//          abaddad2
// CT   : 42831ec2217774244b7221b784d0d49c
//          e3aa212f2c02a4e035c17e2329aca12e
//          21d514b25466931c7d8f6a5aac84aa05
//          1ba30b396a0aac973d58e091
// Tag  : 5bc94fbc3221a5db94fae95ae7121a47

describe('webcryptoAes — NIST SP 800-38D GCM known-answer vector (TC-4)', () => {
    const KEY_HEX = 'feffe9928665731c6d6a8f9467308308';
    const IV_HEX  = 'cafebabefacedbaddecaf888';
    const PT_HEX  =
        'd9313225f88406e5a55909c5aff5269a' +
        '86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525' +
        'b16aedf5aa0de657ba637b39';
    const AAD_HEX =
        'feedfacedeadbeeffeedfacedeadbeef' +
        'abaddad2';
    const CT_HEX  =
        '42831ec2217774244b7221b784d0d49c' +
        'e3aa212f2c02a4e035c17e2329aca12e' +
        '21d514b25466931c7d8f6a5aac84aa05' +
        '1ba30b396a0aac973d58e091';
    const TAG_HEX = '5bc94fbc3221a5db94fae95ae7121a47';

    // CT || Tag as produced by WebCrypto
    const CT_TAG_HEX = CT_HEX + TAG_HEX;

    test('encryptGcm produces correct ciphertext || tag', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'GCM');
        expect(key).not.toBe(false);
        const result = await _aes.encryptGcm(
            key,
            fromHex(IV_HEX),
            fromHex(PT_HEX),
            fromHex(AAD_HEX),
            128
        );
        expect(result).toBeInstanceOf(Uint8Array);
        expect(toHex(result)).toBe(CT_TAG_HEX);
    });

    test('decryptGcm recovers the plaintext from ct || tag', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'GCM');
        const result = await _aes.decryptGcm(
            key,
            fromHex(IV_HEX),
            fromHex(CT_TAG_HEX),
            fromHex(AAD_HEX),
            128
        );
        expect(result).toBeInstanceOf(Uint8Array);
        expect(toHex(result)).toBe(PT_HEX);
    });
});

// ── NIST SP 800-38A AES-CBC known-answer vector ───────────────────────────────
//
// F.2.1 — AES-128-CBC Encrypt, from NIST SP 800-38A.
// Key  : 2b7e151628aed2a6abf7158809cf4f3c
// IV   : 000102030405060708090a0b0c0d0e0f
// PT   : 6bc1bee22e409f96e93d7e117393172a  (one block = 16 bytes)
// CT   : 7649abac8119b246cee98e9b12e9197d  (one block, no PKCS7 visible here)
//
// NOTE: WebCrypto applies PKCS#7 padding, so even a one-block plaintext
// produces TWO blocks of output (the second block is all-0x10 padding).
// We verify round-trip: encrypt then decrypt recovers the original bytes.

describe('webcryptoAes — NIST SP 800-38A AES-128-CBC round-trip', () => {
    const KEY_HEX = '2b7e151628aed2a6abf7158809cf4f3c';
    const IV_HEX  = '000102030405060708090a0b0c0d0e0f';
    const PT_HEX  = '6bc1bee22e409f96e93d7e117393172a';

    test('encryptCbc then decryptCbc recovers original plaintext', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'CBC');
        expect(key).not.toBe(false);
        const ct = await _aes.encryptCbc(key, fromHex(IV_HEX), fromHex(PT_HEX));
        expect(ct).toBeInstanceOf(Uint8Array);
        // WebCrypto CBC always pads — one 16-byte block becomes 32 bytes
        expect(ct.byteLength).toBe(32);
        const pt = await _aes.decryptCbc(key, fromHex(IV_HEX), ct);
        expect(pt).toBeInstanceOf(Uint8Array);
        expect(toHex(pt)).toBe(PT_HEX);
    });
});

// ── NIST SP 800-38A AES-CTR known-answer vector ──────────────────────────────
//
// F.5.1 — AES-128-CTR Encrypt, from NIST SP 800-38A.
// Key  : 2b7e151628aed2a6abf7158809cf4f3c
// CTR  : f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff  (init counter block)
// PT   : 6bc1bee22e409f96e93d7e117393172a  (one block)
// CT   : 874d6191b620e3261bef6864990db6ce

describe('webcryptoAes — NIST SP 800-38A AES-128-CTR known-answer vector (F.5.1)', () => {
    const KEY_HEX = '2b7e151628aed2a6abf7158809cf4f3c';
    const CTR_HEX = 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';
    const PT_HEX  = '6bc1bee22e409f96e93d7e117393172a';
    const CT_HEX  = '874d6191b620e3261bef6864990db6ce';

    test('encryptCtr matches NIST F.5.1 (one block)', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'CTR');
        expect(key).not.toBe(false);
        const result = await _aes.encryptCtr(key, fromHex(CTR_HEX), 64, fromHex(PT_HEX));
        expect(result).toBeInstanceOf(Uint8Array);
        expect(toHex(result)).toBe(CT_HEX);
    });

    test('decryptCtr recovers plaintext from NIST F.5.1', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'CTR');
        const result = await _aes.decryptCtr(key, fromHex(CTR_HEX), 64, fromHex(CT_HEX));
        expect(result).toBeInstanceOf(Uint8Array);
        expect(toHex(result)).toBe(PT_HEX);
    });
});

// ── GCM auth-failure ─────────────────────────────────────────────────────────

describe('webcryptoAes — GCM auth failure resolves false', () => {
    test('flipping a ciphertext byte causes decryptGcm to return false', async () => {
        const key = await _aes.generateKey('GCM', 256);
        const iv = fromHex('000102030405060708090a0b');
        const pt = new TextEncoder().encode('hello world');
        const ctWithTag = await _aes.encryptGcm(key, iv, pt);
        expect(ctWithTag).toBeInstanceOf(Uint8Array);

        // Flip the first byte of the ciphertext
        const corrupted = new Uint8Array(ctWithTag);
        corrupted[0] ^= 0xFF;

        const errors = [];
        const origError = console.error;
        console.error = (...args) => errors.push(args.join(' '));
        try {
            const result = await _aes.decryptGcm(key, iv, corrupted);
            expect(result).toBe(false);
        } finally {
            console.error = origError;
        }
    });

    test('flipping a tag byte causes decryptGcm to return false', async () => {
        const key = await _aes.generateKey('GCM', 128);
        const iv = fromHex('cafebabefacedbaddecaf888');
        const pt = new TextEncoder().encode('test auth failure');
        const ctWithTag = await _aes.encryptGcm(key, iv, pt);
        expect(ctWithTag).toBeInstanceOf(Uint8Array);

        // Flip the last byte (tag byte)
        const corrupted = new Uint8Array(ctWithTag);
        corrupted[corrupted.length - 1] ^= 0x01;

        const origError = console.error;
        console.error = () => {};
        try {
            const result = await _aes.decryptGcm(key, iv, corrupted);
            expect(result).toBe(false);
        } finally {
            console.error = origError;
        }
    });
});

// ── round-trip tests (generateKey) ───────────────────────────────────────────

describe('webcryptoAes — round-trip via generateKey', () => {
    test('AES-GCM round-trip with generated key', async () => {
        const key = await _aes.generateKey('GCM', 256);
        expect(key).not.toBe(false);
        const iv = fromHex('000102030405060708090a0b');
        const pt = new TextEncoder().encode('round-trip test for AES-GCM');
        const ct = await _aes.encryptGcm(key, iv, pt);
        expect(ct).toBeInstanceOf(Uint8Array);
        const recovered = await _aes.decryptGcm(key, iv, ct);
        expect(recovered).toBeInstanceOf(Uint8Array);
        expect(toHex(recovered)).toBe(toHex(pt));
    });

    test('AES-CBC round-trip with generated key', async () => {
        const key = await _aes.generateKey('CBC', 128);
        expect(key).not.toBe(false);
        const iv = fromHex('000102030405060708090a0b0c0d0e0f');
        const pt = new TextEncoder().encode('round-trip test for AES-CBC');
        const ct = await _aes.encryptCbc(key, iv, pt);
        expect(ct).toBeInstanceOf(Uint8Array);
        const recovered = await _aes.decryptCbc(key, iv, ct);
        expect(recovered).toBeInstanceOf(Uint8Array);
        expect(toHex(recovered)).toBe(toHex(pt));
    });

    test('AES-CTR round-trip with generated key', async () => {
        const key = await _aes.generateKey('CTR', 192);
        expect(key).not.toBe(false);
        const counter = fromHex('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff');
        const pt = new TextEncoder().encode('round-trip test for AES-CTR');
        const ct = await _aes.encryptCtr(key, counter, 64, pt);
        expect(ct).toBeInstanceOf(Uint8Array);
        const recovered = await _aes.decryptCtr(key, counter, 64, ct);
        expect(recovered).toBeInstanceOf(Uint8Array);
        expect(toHex(recovered)).toBe(toHex(pt));
    });
});

// ── importKey / exportKey round-trip ─────────────────────────────────────────

describe('webcryptoAes — importKey / exportKey round-trip', () => {
    test('importKey with extractable:true then exportKey preserves raw bytes', async () => {
        const raw = fromHex('feffe9928665731c6d6a8f9467308308');  // 16 bytes = 128-bit
        const key = await _aes.importKey(raw, 'GCM', true);
        expect(key).not.toBe(false);
        const exported = await _aes.exportKey(key);
        expect(exported).toBeInstanceOf(Uint8Array);
        expect(toHex(exported)).toBe(toHex(raw));
    });

    test('importKey with extractable:false, exportKey resolves false', async () => {
        const raw = fromHex('2b7e151628aed2a6abf7158809cf4f3c');
        const key = await _aes.importKey(raw, 'CBC', false);
        expect(key).not.toBe(false);
        const origError = console.error;
        console.error = () => {};
        try {
            const result = await _aes.exportKey(key);
            expect(result).toBe(false);
        } finally {
            console.error = origError;
        }
    });

    test('generateKey(extractable:true) + exportKey yields 32 raw bytes for AES-256', async () => {
        const key = await _aes.generateKey('GCM', 256, true);
        expect(key).not.toBe(false);
        const raw = await _aes.exportKey(key);
        expect(raw).toBeInstanceOf(Uint8Array);
        expect(raw.byteLength).toBe(32);
    });
});

// ── GCM cross-check: WebCrypto vs pure-JS gcm via shared NIST vector ─────────
//
// The plan requires cross-checking one GCM vector against the pure-JS gcm
// module. The pitfall note says: for cross-impl parity, compare BOTH against
// a shared NIST hex vector rather than importing the pure-JS module.
//
// We use McGrew-Viega TC-2 (NIST SP 800-38D Appendix B, Test Case 2):
//   Key : 00000000000000000000000000000000  (AES-128)
//   IV  : 000000000000000000000000           (96-bit)
//   PT  : 00000000000000000000000000000000  (one zero block)
//   CT  : 0388dace60b6a392f328c2b971b2fe78
//   Tag : ab6e47d42cec13bdf53a67b21257bddf
//
// This test confirms webcryptoAes matches the independently-known NIST
// hex outputs — the same outputs the pure-JS gcm test suite verifies.

describe('webcryptoAes — cross-check GCM vector vs shared NIST reference', () => {
    const KEY_HEX = '00000000000000000000000000000000';
    const IV_HEX  = '000000000000000000000000';
    const PT_HEX  = '00000000000000000000000000000000';
    // NIST CT and Tag for this vector:
    const CT_HEX  = '0388dace60b6a392f328c2b971b2fe78';
    const TAG_HEX = 'ab6e47d42cec13bdf53a67b21257bddf';
    const CT_TAG_HEX = CT_HEX + TAG_HEX;

    test('encryptGcm output matches NIST GCM TC-2 (parity with pure-JS gcm)', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'GCM', false);
        expect(key).not.toBe(false);
        const result = await _aes.encryptGcm(
            key,
            fromHex(IV_HEX),
            fromHex(PT_HEX),
            undefined,
            128
        );
        expect(result).toBeInstanceOf(Uint8Array);
        expect(toHex(result)).toBe(CT_TAG_HEX);
    });

    test('decryptGcm recovers PT from NIST GCM TC-2 ct||tag', async () => {
        const key = await _aes.importKey(fromHex(KEY_HEX), 'GCM', false);
        const result = await _aes.decryptGcm(
            key,
            fromHex(IV_HEX),
            fromHex(CT_TAG_HEX),
            undefined,
            128
        );
        expect(result).toBeInstanceOf(Uint8Array);
        expect(toHex(result)).toBe(PT_HEX);
    });
});

// ── invalid inputs → false ────────────────────────────────────────────────────

describe('webcryptoAes — invalid inputs resolve false', () => {
    describe('generateKey', () => {
        test('invalid mode → false', async () => {
            const origError = console.error;
            const errors = [];
            console.error = (...args) => errors.push(args.join(' '));
            try {
                const result = await _aes.generateKey('ECB');
                expect(result).toBe(false);
                expect(errors.some(m => m.includes('[crypto] INVALID'))).toBe(true);
            } finally {
                console.error = origError;
            }
        });

        test('invalid key length → false', async () => {
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.generateKey('GCM', 64);
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });
    });

    describe('importKey', () => {
        test('invalid key length (15 bytes) → false', async () => {
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.importKey(new Uint8Array(15), 'GCM');
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });

        test('invalid mode → false', async () => {
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.importKey(new Uint8Array(16), 'ECB');
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });

        test('non-Uint8Array raw → false', async () => {
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.importKey('not-a-uint8array', 'GCM');
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });
    });

    describe('encryptGcm', () => {
        test('non-Uint8Array iv → false', async () => {
            const key = await _aes.generateKey('GCM', 128);
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.encryptGcm(key, 'not-iv', new Uint8Array(0));
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });

        test('non-Uint8Array plaintext → false', async () => {
            const key = await _aes.generateKey('GCM', 128);
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.encryptGcm(key, new Uint8Array(12), 'text');
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });
    });

    describe('encryptCbc', () => {
        test('iv length != 16 → false', async () => {
            const key = await _aes.generateKey('CBC', 128);
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.encryptCbc(key, new Uint8Array(12), new Uint8Array(16));
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });

        test('non-Uint8Array iv → false', async () => {
            const key = await _aes.generateKey('CBC', 128);
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.encryptCbc(key, null, new Uint8Array(16));
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });
    });

    describe('encryptCtr', () => {
        test('counter length != 16 → false', async () => {
            const key = await _aes.generateKey('CTR', 128);
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.encryptCtr(key, new Uint8Array(12), 64, new Uint8Array(16));
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });

        test('non-Uint8Array data → false', async () => {
            const key = await _aes.generateKey('CTR', 128);
            const origError = console.error;
            console.error = () => {};
            try {
                const result = await _aes.encryptCtr(key, new Uint8Array(16), 64, 'not-data');
                expect(result).toBe(false);
            } finally {
                console.error = origError;
            }
        });
    });
});
