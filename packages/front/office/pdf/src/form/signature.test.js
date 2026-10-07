// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSignatureField } from './signature.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfParserObj } from '../syntax/parser-obj.js';
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const parserObj = pdfParserObj.factory();
const { obj } = parserObj;
const { typeSignatureField } = pdfSignatureField.factory(errors, parserObj);

describe('typeSignatureField', () => {
    test('minimal unsigned signature field', () => {
        const d = obj.dict({ FT: obj.name('Sig') });
        const s = typeSignatureField(d);
        expect(s.ft).toBe('Sig');
        expect(s.v).toBeNull();
        expect(s.signed).toBe(false);
        expect(s.raw).toBe(d);
        expect(s._extras).toEqual({});
    });

    test('signed via /V as ref', () => {
        const d = obj.dict({ FT: obj.name('Sig'), V: obj.ref(99, 0) });
        const s = typeSignatureField(d);
        expect(s.signed).toBe(true);
        expect(s.v.type).toBe('ref');
        expect(s.v.num).toBe(99);
    });

    test('signed via inline /V dict', () => {
        const sig = obj.dict({ Type: obj.name('Sig') });
        const d = obj.dict({ FT: obj.name('Sig'), V: sig });
        const s = typeSignatureField(d);
        expect(s.v).toBe(sig);
    });

    test('reads /Lock /SV /T', () => {
        const lock = obj.dict({});
        const sv = obj.ref(50, 0);
        const t = new Uint8Array([0x66]);
        const d = obj.dict({
            FT: obj.name('Sig'), Lock: lock, SV: sv, T: obj.string(t)
        });
        const s = typeSignatureField(d);
        expect(s.lock).toBe(lock);
        expect(s.sv.num).toBe(50);
        expect(s.t).toBe(t);
    });

    test('preserves unknown entries in _extras', () => {
        const d = obj.dict({ FT: obj.name('Sig'), Mystery: obj.int(1) });
        expect(typeSignatureField(d)._extras.Mystery.value).toBe(1);
    });

    test('rejects non-dict input', () => {
        expect(() => typeSignatureField(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /FT', () => {
        expect(() => typeSignatureField(obj.dict({ FT: obj.name('Tx') }))).toThrow(ParseError);
    });

    test('rejects malformed /V', () => {
        const d = obj.dict({ FT: obj.name('Sig'), V: obj.int(0) });
        expect(() => typeSignatureField(d)).toThrow(ParseError);
    });

    test('rejects malformed /Lock', () => {
        const d = obj.dict({ FT: obj.name('Sig'), Lock: obj.int(0) });
        expect(() => typeSignatureField(d)).toThrow(ParseError);
    });

    test('preserves /SV seed values verbatim (read-tolerance)', () => {
        // ISO 32000-2 §12.7.5.5 — /SV may carry Filter, SubFilter,
        // DigestMethod, V, Reasons, MDP, TimeStamp, LegalAttestation,
        // AddRevInfo. Verify that an inline SV dict round-trips intact
        // so a higher layer can interpret the constraints.
        const sv = obj.dict({
            Type: obj.name('SV'),
            Filter:       obj.name('Adobe.PPKLite'),
            SubFilter:    obj.array([obj.name('ETSI.CAdES.detached')]),
            DigestMethod: obj.array([obj.name('SHA256')]),
            V:            obj.real(2.1),
            Reasons:      obj.array([obj.string(new Uint8Array([0x52]))]),
            AddRevInfo:   obj.bool(true),
            Ff:           obj.int(1)
        });
        const d = obj.dict({ FT: obj.name('Sig'), SV: sv });
        const s = typeSignatureField(d);
        expect(s.sv).toBe(sv);
        expect(s.sv.entries.Filter.value).toBe('Adobe.PPKLite');
        expect(s.sv.entries.SubFilter.items[0].value)
            .toBe('ETSI.CAdES.detached');
        expect(s.sv.entries.AddRevInfo.value).toBe(true);
    });

    test('rejects malformed /SV', () => {
        const d = obj.dict({ FT: obj.name('Sig'), SV: obj.int(0) });
        expect(() => typeSignatureField(d)).toThrow(ParseError);
    });
});

describe('pdfSignatureField module', () => {
    test('module shape + worker safety', () => {
        expect(pdfSignatureField.name).toBe('pdfSignatureField');
        expect(pdfSignatureField.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfSignatureField.factory.toString()).toContain('function');
        const m = pdfSignatureField.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeSignatureField).toBe('function');
    });
});
