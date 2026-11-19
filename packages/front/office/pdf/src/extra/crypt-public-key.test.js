// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — the public-key security handler's dictionaries and the crypt
 * filter maps typed (T2, BL-2695 A41f): every key named is copied into the
 * record, the others land in `_extras`.
 */
import { describe, test, expect } from 'bun:test';
import { pdfCryptPublicKey } from './crypt-public-key.js';
import { pdfSigAesGcm } from './sig-aes-gcm.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const errors = pdfErrors.factory();
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const aesGcm = pdfSigAesGcm.factory(errors, parserObj);
const { typeCryptFilterPublicKey, typeCryptFilterPublicKeyMap, typeCryptFilterMap, typeEncryptedPayload } =
    pdfCryptPublicKey.factory(errors, parserObj, aesGcm);
const bytes = (...b) => new Uint8Array(b);
const pkFilter = () => obj.dict({
    Recipients: obj.array([obj.string(bytes(1, 2)), obj.string(bytes(3))]),
    EncryptMetadata: obj.bool(false), Type: obj.name('CryptFilter'), CFM: obj.name('AESV3'),
    AuthEvent: obj.name('DocOpen'), Length: obj.int(256), Extra: obj.int(1)
});

describe('typeCryptFilterPublicKey', () => {
    test('every key of Table 27 copied; another one in _extras', () => {
        const r = typeCryptFilterPublicKey(pkFilter());
        expect(r.recipients).toEqual([bytes(1, 2), bytes(3)]);
        expect([r.encryptMetadata, r.type, r.cfm, r.authEvent, r.length]).toEqual([false, 'CryptFilter', 'AESV3', 'DocOpen', 256]);
        expect(Object.keys(r._extras)).toEqual(['Extra']);
    });
    test('a single byte string as Recipients; EncryptMetadata defaults to true', () => {
        const r = typeCryptFilterPublicKey(obj.dict({ Recipients: obj.string(bytes(9)), Length: obj.int(128) }));
        expect(r.recipients).toEqual([bytes(9)]);
        expect(r.encryptMetadata).toBe(true);
    });
    test('a non-dictionary is refused', () => {
        expect(() => typeCryptFilterPublicKey(obj.int(1))).toThrow();
    });
});

describe('the crypt filter maps', () => {
    test('a public-key map types each filter', () => {
        const r = typeCryptFilterPublicKeyMap(obj.dict({ DefaultCryptFilter: pkFilter(), DefEmbeddedFile: pkFilter() }));
        expect(Object.keys(r.filters)).toEqual(['DefaultCryptFilter', 'DefEmbeddedFile']);
        expect(r.filters.DefaultCryptFilter.cfm).toBe('AESV3');
        expect(r._extras).toEqual({});
    });
    test('a Standard map types each filter through typeCfEntry; a non-dictionary entry in _extras', () => {
        const r = typeCryptFilterMap(obj.dict({ StdCF: obj.dict({ CFM: obj.name('AESV2'), Length: obj.int(16) }), Identity: obj.dict({}), Odd: obj.int(1) }));
        expect(r.filters.StdCF.cfm).toBe('AESV2');
        expect(Object.keys(r.filters)).toEqual(['StdCF', 'Identity']);
        expect(Object.keys(r._extras)).toEqual(['Odd']);
    });
});

describe('typeEncryptedPayload', () => {
    test('Type, Subtype and Version copied', () => {
        const r = typeEncryptedPayload(obj.dict({ Type: obj.name('EncryptedPayload'), Subtype: obj.name('MicrosoftIRMServices'), Version: obj.name('2') }));
        expect([r.type, r.subtype, r.version]).toEqual(['EncryptedPayload', 'MicrosoftIRMServices', '2']);
        expect(r._extras).toEqual({});
    });
});
