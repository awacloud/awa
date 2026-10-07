// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfPermissions } from './permissions.js';
import { pdfErrors } from '../errors.js';
const errors = pdfErrors.factory();
const { EncryptionError } = errors;
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';

const rt = new ModuleRuntime();
rt.register(aes);
const aesFw = rt.resolve('aes');

const { decodePermissions } = pdfPermissions.factory(errors, aesFw);

describe('decodePermissions', () => {
    test('decodes each flag bit independently', () => {
        const bits = {
            print:            0x004,
            modify:           0x008,
            copy:             0x010,
            annot:            0x020,
            formFill:         0x100,
            accessible:       0x200,
            assemble:         0x400,
            printHighQuality: 0x800
        };
        for (const [name, mask] of Object.entries(bits)) {
            const r = decodePermissions(mask);
            expect(r[name]).toBe(true);
            for (const other of Object.keys(bits)) {
                if (other !== name) expect(r[other]).toBe(false);
            }
        }
    });
    test('all-off → all false', () => {
        const r = decodePermissions(0);
        expect(r.print).toBe(false);
        expect(r.printHighQuality).toBe(false);
    });
    test('negative (typical PDF /P)', () => {
        const r = decodePermissions(-4);
        expect(r.raw).toBe(-4);
        expect(typeof r.print).toBe('boolean');
    });
    test('rejects non-integer', () => {
        expect(() => decodePermissions('x')).toThrow(EncryptionError);
        expect(() => decodePermissions(1.5)).toThrow(EncryptionError);
    });
});

describe('pdfPermissions.factory / verifyPermsField', () => {
    test('rejects missing fw', () => {
        expect(() => pdfPermissions.factory(errors, null)).toThrow(EncryptionError);
        expect(() => pdfPermissions.factory(errors, {})).toThrow(EncryptionError);
    });

    test('verifies magic bytes adb on valid /Perms', () => {
        const perm = pdfPermissions.factory(errors, aesFw);
        const fek = new Uint8Array(32);
        for (let i = 0; i < 32; i++) fek[i] = i;
        const P = -3904;
        const pt = new Uint8Array(16);
        pt[0] = P & 0xff; pt[1] = (P >>> 8) & 0xff;
        pt[2] = (P >>> 16) & 0xff; pt[3] = (P >>> 24) & 0xff;
        pt[4] = pt[5] = pt[6] = pt[7] = 0xff;
        pt[8] = 0x54;
        pt[9] = 0x61; pt[10] = 0x64; pt[11] = 0x62;
        pt[12] = 0x00; pt[13] = 0x01; pt[14] = 0x02; pt[15] = 0x03;

        const cipher = aesFw.fn([
            (fek[0]<<24)|(fek[1]<<16)|(fek[2]<<8)|fek[3],
            (fek[4]<<24)|(fek[5]<<16)|(fek[6]<<8)|fek[7],
            (fek[8]<<24)|(fek[9]<<16)|(fek[10]<<8)|fek[11],
            (fek[12]<<24)|(fek[13]<<16)|(fek[14]<<8)|fek[15],
            (fek[16]<<24)|(fek[17]<<16)|(fek[18]<<8)|fek[19],
            (fek[20]<<24)|(fek[21]<<16)|(fek[22]<<8)|fek[23],
            (fek[24]<<24)|(fek[25]<<16)|(fek[26]<<8)|fek[27],
            (fek[28]<<24)|(fek[29]<<16)|(fek[30]<<8)|fek[31]
        ], true);
        const ctw = cipher.encrypt([
            (pt[0]<<24)|(pt[1]<<16)|(pt[2]<<8)|pt[3],
            (pt[4]<<24)|(pt[5]<<16)|(pt[6]<<8)|pt[7],
            (pt[8]<<24)|(pt[9]<<16)|(pt[10]<<8)|pt[11],
            (pt[12]<<24)|(pt[13]<<16)|(pt[14]<<8)|pt[15]
        ]);
        const Perms = new Uint8Array(16);
        for (let i = 0; i < 4; i++) {
            Perms[i*4]     = (ctw[i] >>> 24) & 0xff;
            Perms[i*4+1]   = (ctw[i] >>> 16) & 0xff;
            Perms[i*4+2]   = (ctw[i] >>>  8) & 0xff;
            Perms[i*4+3]   =  ctw[i]         & 0xff;
        }
        const r = perm.verifyPermsField({ Perms }, fek);
        expect(r.ok).toBe(true);
        expect(r.p).toBe(P);
        expect(r.encryptMetadata).toBe(true);
    });

    test('rejects /Perms with bad length', () => {
        const perm = pdfPermissions.factory(errors, aesFw);
        expect(() => perm.verifyPermsField({ Perms: new Uint8Array(15) }, new Uint8Array(32)))
            .toThrow(EncryptionError);
    });
    test('rejects bad fek', () => {
        const perm = pdfPermissions.factory(errors, aesFw);
        expect(() => perm.verifyPermsField({ Perms: new Uint8Array(16) }, new Uint8Array(31)))
            .toThrow(EncryptionError);
    });
    test('rejects missing /Perms', () => {
        const perm = pdfPermissions.factory(errors, aesFw);
        expect(() => perm.verifyPermsField({}, new Uint8Array(32))).toThrow(EncryptionError);
    });
});

describe('pdfPermissions module', () => {
    test('module shape', () => {
        expect(pdfPermissions.name).toBe('pdfPermissions');
        expect(pdfPermissions.dependencies).toEqual(['pdfErrors', 'aes']);
        expect(pdfPermissions.factory.toString()).toContain('function');
        const m = pdfPermissions.factory(errors, aesFw);
        expect(typeof m.decodePermissions).toBe('function');
        expect(typeof m.verifyPermsField).toBe('function');
    });
});
