// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSigAesGcm } from './sig-aes-gcm.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError, EncryptionError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeEncryptForGcm, typeCfEntry, validateGcmFraming, CFM_CATALOG } =
    pdfSigAesGcm.factory(_errors, _parserObj);
describe('typeEncryptForGcm', () => {
    test('minimal Encrypt dict', () => {
        const r = typeEncryptForGcm(obj.dict({
            V: obj.int(5), R: obj.int(6), Length: obj.int(256)
        }));
        expect(r.v).toBe(5);
        expect(r.r).toBe(6);
        expect(r.length).toBe(256);
        expect(r.hasAesGcm).toBe(false);
    });
    test('detects AESV4 GCM filter', () => {
        const cf = obj.dict({
            StdCF: obj.dict({
                Type:     obj.name('CryptFilter'),
                CFM:      obj.name('AESV4'),
                AuthEvent: obj.name('DocOpen'),
                Length:    obj.int(32)
            })
        });
        const r = typeEncryptForGcm(obj.dict({
            V: obj.int(5), R: obj.int(6), CF: cf,
            StmF: obj.name('StdCF'), StrF: obj.name('StdCF')
        }));
        expect(r.hasAesGcm).toBe(true);
        expect(r.cf.StdCF.cfm).toBe('AESV4');
        expect(r.cf.StdCF.catalog.mode).toBe('gcm');
    });
    test('preserves _extras', () => {
        const r = typeEncryptForGcm(obj.dict({
            V: obj.int(5), Foo: obj.int(42)
        }));
        expect(r._extras.Foo.value).toBe(42);
    });
    test('rejects non-dict', () => {
        expect(() => typeEncryptForGcm(obj.array([]))).toThrow(ParseError);
    });
    test('rejects bad /CF', () => {
        expect(() => typeEncryptForGcm(obj.dict({
            CF: obj.int(1)
        }))).toThrow(ParseError);
    });
});

describe('typeCfEntry', () => {
    test('reads CFM', () => {
        const r = typeCfEntry(obj.dict({ CFM: obj.name('AESV3') }));
        expect(r.cfm).toBe('AESV3');
        expect(r.catalog.keyBits).toBe(256);
    });
    test('rejects non-dict', () => {
        expect(() => typeCfEntry(obj.int(1))).toThrow(ParseError);
    });
});

describe('validateGcmFraming', () => {
    test('splits IV/ct/tag', () => {
        const b = new Uint8Array(40);
        const r = validateGcmFraming(b);
        expect(r.iv.length).toBe(12);
        expect(r.tag.length).toBe(16);
        expect(r.ciphertext.length).toBe(12);
    });
    test('rejects too-short input', () => {
        expect(() => validateGcmFraming(new Uint8Array(10)))
            .toThrow(EncryptionError);
    });
    test('rejects non-Uint8Array', () => {
        expect(() => validateGcmFraming('abc')).toThrow(EncryptionError);
    });
});

describe('CFM_CATALOG', () => {
    test('frozen and lists AESV4', () => {
        expect(Object.isFrozen(CFM_CATALOG)).toBe(true);
        expect(CFM_CATALOG.AESV4.mode).toBe('gcm');
    });
});

describe('pdfSigAesGcm module', () => {
    test('module shape + worker safety', () => {
        expect(pdfSigAesGcm.name).toBe('pdfSigAesGcm');
        expect(pdfSigAesGcm.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfSigAesGcm.factory.toString()).toContain('function');
        const m = pdfSigAesGcm.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeEncryptForGcm).toBe('function');
        expect(typeof m.typeCfEntry).toBe('function');
        expect(typeof m.validateGcmFraming).toBe('function');
        expect(m.CFM_CATALOG).toEqual(CFM_CATALOG);
    });
});
