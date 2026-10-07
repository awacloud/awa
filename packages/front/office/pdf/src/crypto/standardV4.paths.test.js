// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfStandardV4` — argument-contract and primitive-failure
 * paths of the standard security handler V=4 / R=4.
 *
 * `standardV4.test.js` owns the algorithmic roundtrips (RC4 / AESV2 key
 * derivation, /O, /U, /Perms). This file owns the refusals: malformed
 * passwords, /O and /ID inputs, truncated AESV2 ciphertexts, and the
 * three "fw primitive returned false" escalations, driven by explicit
 * stubs whose failure IS the thing under test.
 *
 * Nothing here asserts a cryptographic constant: the only positive
 * assertions are roundtrips (encrypt → decrypt) with the real fw
 * primitives.
 *
 * @module pdf/crypto/standardV4.paths.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfStandardV4 } from './standardV4.js';
import { pdfErrors } from '../errors.js';
import { aes as _fwAes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc as _fwCbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';

const _ba = _fwBA.factory();
const _aes = _fwAes.factory();
const _cbc = _fwCbc.factory(_ba);
const _errors = pdfErrors.factory();
const { EncryptionError } = _errors;

const v4 = pdfStandardV4.factory(_errors, _aes, _cbc, _ba);

const AESV2 = { method: 'AESV2' };
const ID = new Uint8Array(16).fill(0x5A);
const FEK = new Uint8Array(16).fill(0x11);

function code(fn) {
    try { fn(); } catch (e) { return e.code; }
    return null;
}

describe('padPassword', () => {
    test('accepts a string or Uint8Array and always yields 32 bytes', () => {
        expect(v4.padPassword('pw').length).toBe(32);
        expect(v4.padPassword(new Uint8Array([1, 2])).length).toBe(32);
        expect(v4.padPassword(undefined).length).toBe(32);
        expect(v4.padPassword(null).length).toBe(32);
        // An over-long password is truncated to 32 bytes.
        expect(Array.from(v4.padPassword(new Uint8Array(40).fill(7))))
            .toEqual(Array.from(new Uint8Array(32).fill(7)));
    });

    test('rejects any other password type', () => {
        expect(code(() => v4.padPassword(42))).toBe('pdf/crypto/v4/bad-password');
        expect(() => v4.padPassword({})).toThrow(EncryptionError);
    });
});

describe('computeFileKey / buildOU — input contract', () => {
    test('rejects an /O that is not 32 bytes', () => {
        expect(code(() => v4.computeFileKey('pw', new Uint8Array(4), -1, ID)))
            .toBe('pdf/crypto/v4/bad-O');
        expect(code(() => v4.computeFileKey('pw', 'notbytes', -1, ID)))
            .toBe('pdf/crypto/v4/bad-O');
    });

    test('rejects a missing first /ID element', () => {
        expect(code(() => v4.computeFileKey('pw', new Uint8Array(32), -1, null)))
            .toBe('pdf/crypto/v4/bad-id');
        expect(code(() => v4.buildOU('owner', 'user', -1, 'nope')))
            .toBe('pdf/crypto/v4/bad-id');
    });

    test('buildOU derives a self-consistent /O, /U and file key', () => {
        const { O, U, fek } = v4.buildOU('owner', 'user', -1, ID);
        expect(O.length).toBe(32);
        expect(U.length).toBe(32);
        expect(fek.length).toBe(16);
        // The user password must re-derive the same key from /O.
        expect(Array.from(v4.computeFileKey('user', O, -1, ID)))
            .toEqual(Array.from(fek));
        // …and the derived /U must match what the handler recomputes.
        expect(Array.from(v4.computeU(fek, ID))).toEqual(Array.from(U));
    });
});

describe('AESV2 string paths', () => {
    test('rejects a ciphertext shorter than the IV', () => {
        expect(code(() => v4.decryptString(AESV2, FEK, 1, 0,
            new Uint8Array(8)))).toBe('pdf/crypto/v4/bad-string');
    });

    test('rejects a ciphertext body that is not a multiple of the block', () => {
        expect(code(() => v4.decryptString(AESV2, FEK, 1, 0,
            new Uint8Array(16 + 3)))).toBe('pdf/crypto/v4/bad-ciphertext-len');
    });

    test('returns the empty body of an IV-only ciphertext', () => {
        expect(v4.decryptString(AESV2, FEK, 1, 0, new Uint8Array(16)).length)
            .toBe(0);
    });

    test('rejects a non-Uint8Array plaintext', () => {
        expect(code(() => v4.encryptString(AESV2, FEK, 1, 0, 'plain',
            new Uint8Array(16)))).toBe('pdf/crypto/v4/encrypt-bad-input');
    });

    test('rejects a missing or short AESV2 IV', () => {
        expect(code(() => v4.encryptString(AESV2, FEK, 1, 0,
            new Uint8Array(4)))).toBe('pdf/crypto/v4/encrypt-bad-iv');
        expect(code(() => v4.encryptString(AESV2, FEK, 1, 0,
            new Uint8Array(4), new Uint8Array(8))))
            .toBe('pdf/crypto/v4/encrypt-bad-iv');
    });

    test('encrypt → decrypt roundtrips the payload byte for byte', () => {
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = (i * 31 + 7) & 0xff;
        const plain = new TextEncoder().encode('AESV2 payload');
        const ct = v4.encryptString(AESV2, FEK, 3, 0, plain, iv);
        expect(Array.from(v4.decryptString(AESV2, FEK, 3, 0, ct)))
            .toEqual(Array.from(plain));
    });
});

describe('fw primitive failures escalate to typed errors', () => {
    const badSchedule = pdfStandardV4.factory(_errors,
        { fn: () => false }, _cbc, _ba);
    const badCbc = pdfStandardV4.factory(_errors, _aes,
        { decrypt: () => false, encrypt: () => false }, _ba);
    const iv = new Uint8Array(16);
    const block = new Uint8Array(32);

    test('AES key schedule failure on the decrypt path', () => {
        expect(code(() => badSchedule.decryptString(AESV2, FEK, 1, 0, block)))
            .toBe('pdf/crypto/v4/aes-schedule-failed');
    });

    test('AES key schedule failure on the encrypt path', () => {
        expect(code(() => badSchedule.encryptString(AESV2, FEK, 1, 0,
            new Uint8Array(4), iv)))
            .toBe('pdf/crypto/v4/aes-encrypt-schedule');
    });

    test('CBC decrypt failure', () => {
        expect(code(() => badCbc.decryptString(AESV2, FEK, 1, 0, block)))
            .toBe('pdf/crypto/v4/cbc-decrypt-failed');
    });

    test('CBC encrypt failure', () => {
        expect(code(() => badCbc.encryptString(AESV2, FEK, 1, 0,
            new Uint8Array(4), iv))).toBe('pdf/crypto/v4/cbc-encrypt-failed');
    });
});
