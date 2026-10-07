// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for pdfStandardV4 — V=4 R=4 Standard Security
 * Handler (AESV2 + RC4-128). Roundtrip encrypt-then-decrypt, password
 * derivation (user + owner), and /O /U construction.
 */
import { describe, test, expect } from 'bun:test';
import { pdfStandardV4 } from './standardV4.js';
import { pdfErrors } from '../errors.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';

const errors = pdfErrors.factory();
const rt = new ModuleRuntime();
rt.register(bitArray); rt.register(utf8); rt.register(aes); rt.register(cbc);
const aesFw = rt.resolve('aes');
const cbcFw = rt.resolve('cbc');
const baFw  = rt.resolve('bitArray');

const v4 = pdfStandardV4.factory(errors, aesFw, cbcFw, baFw);

describe('pdfStandardV4 module', () => {
    test('module shape', () => {
        expect(pdfStandardV4.name).toBe('pdfStandardV4');
        expect(pdfStandardV4.dependencies).toEqual(
            ['pdfErrors', 'aes', 'cbc', 'bitArray']);
        expect(typeof v4.tryPassword).toBe('function');
        expect(typeof v4.encryptStream).toBe('function');
        expect(typeof v4.decryptStream).toBe('function');
        expect(typeof v4.buildOU).toBe('function');
    });

    test('rejects bad framework deps', () => {
        expect(() => pdfStandardV4.factory(errors, null, cbcFw, baFw)).toThrow();
    });
});

describe('pdfStandardV4 — /O /U roundtrip', () => {
    const idFirst = new Uint8Array(16);
    for (let i = 0; i < 16; i++) idFirst[i] = i + 1;
    const userPw = 'user';
    const ownerPw = 'owner';
    const P = -4 | 0;

    test('buildOU produces 32-byte O and U; tryPassword recovers FEK', () => {
        const { O, U, fek } = v4.buildOU(ownerPw, userPw, P, idFirst, true);
        expect(O.length).toBe(32);
        expect(U.length).toBe(32);
        expect(fek.length).toBe(16);

        const typed = { O, U, P, idFirst, EncryptMetadata: true };
        const r = v4.tryPassword(typed, userPw, false);
        expect(r.fileEncryptionKey).toBeInstanceOf(Uint8Array);
        expect(Array.from(r.fileEncryptionKey)).toEqual(Array.from(fek));

        const ro = v4.tryPassword(typed, ownerPw, true);
        expect(ro.fileEncryptionKey).toBeInstanceOf(Uint8Array);
        expect(Array.from(ro.fileEncryptionKey)).toEqual(Array.from(fek));

        const bad = v4.tryPassword(typed, 'nope', false);
        expect(bad.fileEncryptionKey).toBe(null);
    });
});

describe('pdfStandardV4 — AESV2 stream roundtrip', () => {
    test('encryptStream → decryptStream byte-identical', () => {
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 17 + 3) & 0xff;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = 0x10 + i;
        const plain = new TextEncoder().encode('Hello, V=4 AESV2 stream!');
        const typed = { method: 'AESV2' };
        const ct = v4.encryptStream(typed, fek, 7, 0, plain, iv);
        const pt = v4.decryptStream(typed, fek, 7, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
});

describe('pdfStandardV4 — V2 (RC4) stream roundtrip', () => {
    test('encryptStream → decryptStream byte-identical', () => {
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 23 + 1) & 0xff;
        const plain = new TextEncoder().encode('Hello, V=4 RC4-128 stream!');
        const typed = { method: 'V2' };
        const ct = v4.encryptStream(typed, fek, 9, 0, plain);
        const pt = v4.decryptStream(typed, fek, 9, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
});

describe('pdfStandardV4 — error paths', () => {
    test('encryptStream rejects unknown method', () => {
        const fek = new Uint8Array(16);
        const plain = new Uint8Array(4);
        expect(() => v4.encryptStream({ method: 'X' }, fek, 1, 0, plain))
            .toThrow();
    });
    test('decryptStream rejects unknown method', () => {
        const fek = new Uint8Array(16);
        const ct = new Uint8Array(32);
        expect(() => v4.decryptStream({ method: 'X' }, fek, 1, 0, ct))
            .toThrow();
    });
    test('AESV2 encryptStream rejects bad IV', () => {
        const fek = new Uint8Array(16);
        const plain = new Uint8Array(4);
        expect(() => v4.encryptStream({ method: 'AESV2' }, fek, 1, 0, plain, new Uint8Array(8)))
            .toThrow();
    });
    test('tryPassword rejects bad /O length', () => {
        const typed = { O: new Uint8Array(8), U: new Uint8Array(32),
                        P: -1, idFirst: new Uint8Array(16) };
        expect(() => v4.tryPassword(typed, 'x', false)).toThrow();
    });
    test('tryPassword rejects missing idFirst', () => {
        const typed = { O: new Uint8Array(32), U: new Uint8Array(32), P: -1 };
        expect(() => v4.tryPassword(typed, 'x', false)).toThrow();
    });
});

describe('pdfStandardV4 — EFF embedded file roundtrip', () => {
    test('AESV2 encryptEmbeddedFile → decryptEmbeddedFile byte-identical', () => {
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 31 + 5) & 0xff;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = 0x20 + i;
        const plain = new TextEncoder().encode('embedded file payload AESV2');
        const typed = { method: 'AESV2' };
        const ct = v4.encryptEmbeddedFile(typed, fek, 11, 0, plain, iv);
        const pt = v4.decryptEmbeddedFile(typed, fek, 11, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
    test('V2 (RC4) encryptEmbeddedFile → decryptEmbeddedFile byte-identical', () => {
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 5 + 7) & 0xff;
        const plain = new TextEncoder().encode('embedded file V2 RC4');
        const typed = { method: 'V2' };
        const ct = v4.encryptEmbeddedFile(typed, fek, 13, 0, plain);
        const pt = v4.decryptEmbeddedFile(typed, fek, 13, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });
});
