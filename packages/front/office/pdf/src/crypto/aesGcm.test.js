// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAesGcm } from './aesGcm.js';
import { pdfErrors } from '../errors.js';
const errors = pdfErrors.factory();
const { EncryptionError } = errors;
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { gcm } from '@awacloud/fw/crypto/mode/gcm.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

const rt = new ModuleRuntime();
rt.register(bitArray); rt.register(aes); rt.register(gcm);
const deps = {
    aes: rt.resolve('aes'),
    gcm: rt.resolve('gcm'),
    bitArray: rt.resolve('bitArray')
};

function build(d) {
    d = d || deps;
    return pdfAesGcm.factory(errors, d.aes, d.gcm, d.bitArray);
}

describe('pdfAesGcm', () => {
    test('rejects missing deps', () => {
        expect(() => pdfAesGcm.factory(errors)).toThrow(EncryptionError);
        expect(() => pdfAesGcm.factory(errors, deps.aes)).toThrow(EncryptionError);
    });

    test('module shape', () => {
        expect(pdfAesGcm.name).toBe('pdfAesGcm');
        expect(pdfAesGcm.dependencies).toEqual(['pdfErrors', 'aes', 'gcm', 'bitArray']);
        expect(pdfAesGcm.factory.toString()).toContain('function');
        const m = pdfAesGcm.factory(errors, deps.aes, deps.gcm, deps.bitArray);
        expect(typeof m.encryptObjectGcm).toBe('function');
        expect(typeof m.decryptObjectGcm).toBe('function');
    });

    test('roundtrip encrypt → decrypt', () => {
        const w = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = (i * 5 + 1) & 0xff;
        const msg = new TextEncoder().encode('PDF TS 32003 AES-GCM payload');
        const iv = new Uint8Array(12);
        for (let i = 0; i < 12; i++) iv[i] = i + 7;
        const framed = w.encryptObjectGcm(fek, msg, () => iv);
        expect(framed.length).toBe(12 + msg.length + 16);
        expect(Array.from(framed.subarray(0, 12))).toEqual(Array.from(iv));
        const pt = w.decryptObjectGcm(fek, framed);
        expect(Array.from(pt)).toEqual(Array.from(msg));
    });

    test('decrypt rejects truncated input', () => {
        const w = build();
        const fek = new Uint8Array(32);
        expect(() => w.decryptObjectGcm(fek, new Uint8Array(10))).toThrow(EncryptionError);
    });

    test('decrypt rejects bad tag (corrupted ciphertext)', () => {
        const w = build();
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i;
        const msg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const iv = new Uint8Array(12);
        for (let i = 0; i < 12; i++) iv[i] = i;
        const framed = w.encryptObjectGcm(fek, msg, () => iv);
        framed[framed.length - 1] ^= 0xff;
        expect(() => w.decryptObjectGcm(fek, framed)).toThrow(EncryptionError);
    });

    test('encrypt rejects bad fek length', () => {
        const w = build();
        expect(() => w.encryptObjectGcm(new Uint8Array(16), new Uint8Array(0), () => new Uint8Array(12)))
            .toThrow(EncryptionError);
    });
    test('encrypt rejects bad iv length', () => {
        const w = build();
        const fek = new Uint8Array(32);
        expect(() => w.encryptObjectGcm(fek, new Uint8Array(0), () => new Uint8Array(8)))
            .toThrow(EncryptionError);
    });
    test('encrypt rejects bad plaintext type', () => {
        const w = build();
        expect(() => w.encryptObjectGcm(new Uint8Array(32), 'not-bytes', () => new Uint8Array(12)))
            .toThrow(EncryptionError);
    });
    test('encrypt rejects missing ivProvider', () => {
        const w = build();
        expect(() => w.encryptObjectGcm(new Uint8Array(32), new Uint8Array(0), null))
            .toThrow(EncryptionError);
    });
});
