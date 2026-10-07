// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfRedactionIso32005 } from './redaction-iso32005.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typeRedactionRecord, findRedactMarkers, REDACT_MARKERS } =
    pdfRedactionIso32005.factory(_errors, _parserObj);
const u8 = (s) => new TextEncoder().encode(s);

describe('typeRedactionRecord', () => {
    test('minimal record', () => {
        const r = typeRedactionRecord(obj.dict({}));
        expect(r.appliedAt).toBe(null);
        expect(r.annotations).toBe(null);
    });
    test('reads full record', () => {
        const r = typeRedactionRecord(obj.dict({
            AppliedAt:   obj.string(u8('2026-05-15')),
            Tool:        obj.string(u8('awa-pdf')),
            Annotations: obj.array([obj.ref(5, 0)]),
            RD:          obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            IC:          obj.array([obj.real(0), obj.real(0), obj.real(0)])
        }));
        expect(r.tool).toBeDefined();
        expect(r.annotations.length).toBe(1);
        expect(r.rd).toEqual([0, 0, 10, 10]);
        expect(r.ic.length).toBe(3);
    });
    test('preserves _extras', () => {
        const r = typeRedactionRecord(obj.dict({ Foo: obj.int(1) }));
        expect(r._extras.Foo.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => typeRedactionRecord(obj.int(1))).toThrow(ParseError);
    });
    test('rejects bad /Annotations', () => {
        expect(() => typeRedactionRecord(obj.dict({
            Annotations: obj.int(1)
        }))).toThrow(ParseError);
    });
});

describe('findRedactMarkers', () => {
    test('locates BMC/EMC pairs', () => {
        const bytes = u8('q\n/Redact BMC\n(redacted)Tj\nEMC\nQ\n');
        const r = findRedactMarkers(bytes);
        expect(r.regions.length).toBe(1);
        expect(r.regions[0].kind).toBe('BMC');
        expect(r.regions[0].endOffset).toBeGreaterThan(r.regions[0].beginOffset);
    });
    test('handles missing EMC', () => {
        const r = findRedactMarkers(u8('/Redact BDC '));
        expect(r.regions[0].endOffset).toBe(null);
        expect(r.regions[0].kind).toBe('BDC');
    });
    test('rejects non-Uint8Array', () => {
        expect(() => findRedactMarkers('x')).toThrow(ParseError);
    });
});

describe('REDACT_MARKERS', () => {
    test('frozen catalog', () => {
        expect(Object.isFrozen(REDACT_MARKERS)).toBe(true);
        expect(REDACT_MARKERS.end).toBe('EMC');
    });
});

describe('pdfRedactionIso32005 module', () => {
    test('module shape + worker safety', () => {
        expect(pdfRedactionIso32005.name).toBe('pdfRedactionIso32005');
        expect(pdfRedactionIso32005.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfRedactionIso32005.factory.toString()).toContain('function');
        const m = pdfRedactionIso32005.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof m.typeRedactionRecord).toBe('function');
        expect(typeof m.findRedactMarkers).toBe('function');
    });
});
