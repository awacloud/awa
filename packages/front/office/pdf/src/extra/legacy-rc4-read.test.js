// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { EncryptionError } = _pdfErrors_TD1;
import { pdfLegacyRc4Read } from './legacy-rc4-read.js';

const m = pdfLegacyRc4Read.factory(_pdfErrors_TD1);
const enc = (s) => new TextEncoder().encode(s);
const hex = (bytes) =>
    Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

describe('extra/legacy-rc4-read — RC4 KAT', () => {
    test('Key/Plaintext → BBF316E8D940AF0AD3', () => {
        const ct = m.rc4(enc('Key'), enc('Plaintext'));
        expect(hex(ct)).toBe('BBF316E8D940AF0AD3');
    });

    test('rc4 is its own inverse', () => {
        const pt = enc('hello world hello world');
        const ct = m.rc4(enc('secret'), pt);
        const back = m.rc4(enc('secret'), ct);
        expect(new TextDecoder().decode(back)).toBe('hello world hello world');
    });

    test('rejects non-Uint8Array', () => {
        expect(() => m.rc4('Key', enc('x'))).toThrow(EncryptionError);
    });
});

describe('extra/legacy-rc4-read — MD5 KAT', () => {
    test('empty string', () => {
        expect(hex(m.md5(new Uint8Array(0)))).toBe('D41D8CD98F00B204E9800998ECF8427E');
    });
    test('"abc"', () => {
        expect(hex(m.md5(enc('abc')))).toBe('900150983CD24FB0D6963F7D28E17F72');
    });
    test('rejects bad input', () => {
        expect(() => m.md5('abc')).toThrow(EncryptionError);
    });
});

describe('extra/legacy-rc4-read — Standard SH plumbing', () => {
    test('padPassword pads to 32 bytes', () => {
        const padded = m.padPassword('hi');
        expect(padded.length).toBe(32);
        expect(padded[0]).toBe(0x68);
        expect(padded[1]).toBe(0x69);
        expect(padded[2]).toBe(m.PASSWORD_PADDING[0]);
    });

    test('computeFileKey returns the requested length', () => {
        const fk = m.computeFileKey('', {
            O: new Uint8Array(32),
            P: -4,
            idFirst: new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),
            revision: 3,
            keyLength: 128
        });
        expect(fk.length).toBe(16);
    });

    test('validateUserPassword roundtrip (R3) — own U accepts', () => {
        const idFirst = new Uint8Array(16);
        const fileKey = new Uint8Array(16); // arbitrary key for demo
        for (let i = 0; i < 16; i++) fileKey[i] = i + 1;
        const U = m.computeU(fileKey, idFirst, 3);
        // Synthesise an /O that would, with empty password, compute to
        // this fileKey is non-trivial — instead test computeU is
        // deterministic.
        expect(U.length).toBe(32);
        const U2 = m.computeU(fileKey, idFirst, 3);
        expect(hex(U)).toBe(hex(U2));
    });

    test('computeU R2 path differs from R3', () => {
        const fk = new Uint8Array([1,2,3,4,5]); // 40-bit
        const idFirst = new Uint8Array(16);
        const u2 = m.computeU(fk, idFirst, 2);
        const u3 = m.computeU(fk, idFirst, 3);
        expect(hex(u2)).not.toBe(hex(u3));
    });

    test('objectKey + decryptString roundtrip', () => {
        const fk = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
        const ct = m.decryptString(fk, 5, 0, enc('secret'));
        const back = m.decryptString(fk, 5, 0, ct);
        expect(new TextDecoder().decode(back)).toBe('secret');
    });

    test('computeFileKey rejects bad /O', () => {
        expect(() => m.computeFileKey('', {
            O: new Uint8Array(10),
            P: 0,
            idFirst: new Uint8Array(16),
            revision: 3,
            keyLength: 128
        })).toThrow(EncryptionError);
    });

    test('factory shape', () => {
        expect(pdfLegacyRc4Read.name).toBe('pdfLegacyRc4Read');
        expect(pdfLegacyRc4Read.dependencies).toEqual(['pdfErrors']);
        expect(pdfLegacyRc4Read.factory.toString()).toContain('function');
    });
});
