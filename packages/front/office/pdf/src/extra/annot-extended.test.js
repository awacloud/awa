// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAnnotExtended } from './annot-extended.js';
import { pdfAnnot } from '../annot/annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const _annot = pdfAnnot.factory(_errors, _parserObj);
const {
    typeAnnotExtended, typeWatermarkAnnot, type3DAnnot,
    typeRichMediaAnnot, typeSoundAnnot, typeMovieAnnot, typeScreenAnnot,
    typePrinterMarkAnnot, typeTrapNetAnnot, typeFreeTextExtended,
    FREETEXT_LINE_ENDINGS
} = pdfAnnotExtended.factory(_errors, _parserObj, _annot);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }
function annot(subtype, extra) {
    return obj.dict({
        Type: obj.name('Annot'),
        Subtype: obj.name(subtype),
        Rect: obj.array([obj.int(0), obj.int(0), obj.int(100), obj.int(50)]),
        ...extra
    });
}

describe('typeAnnotExtended dispatch', () => {
    test('dispatches Watermark', () => {
        const d = annot('Watermark', { FixedPrint: obj.dict({}) });
        const r = typeAnnotExtended(d);
        expect(r.kind).toBe('Watermark');
        expect(r.fixedPrint).toBeTruthy();
    });

    test('dispatches 3D with all entries', () => {
        const d = annot('3D', {
            '3DD': obj.ref(1, 0),
            '3DV': obj.name('F'),
            '3DA': obj.dict({}),
            '3DI': obj.bool(true),
            '3DB': obj.array([])
        });
        const r = type3DAnnot(d);
        expect(r['3DI']).toBe(true);
        expect(r['3DD'].num).toBe(1);
    });

    test('RichMedia', () => {
        const d = annot('RichMedia', { RichMediaContent: obj.dict({}) });
        const r = typeRichMediaAnnot(d);
        expect(r.richMediaContent).toBeTruthy();
    });

    test('Sound', () => {
        const d = annot('Sound', { Sound: obj.ref(2,0), Name: obj.name('Speaker') });
        const r = typeSoundAnnot(d);
        expect(r.name).toBe('Speaker');
    });

    test('Movie', () => {
        const d = annot('Movie', { T: obj.string(bytes('Clip')), Movie: obj.dict({}) });
        const r = typeMovieAnnot(d);
        expect(r.t).toEqual(bytes('Clip'));
    });

    test('Screen with action', () => {
        const d = annot('Screen', { T: obj.string(bytes('X')), A: obj.dict({}) });
        const r = typeScreenAnnot(d);
        expect(r.a).toBeTruthy();
    });

    test('PrinterMark', () => {
        const d = annot('PrinterMark', { MN: obj.name('ColorBar') });
        const r = typePrinterMarkAnnot(d);
        expect(r.mn).toBe('ColorBar');
    });

    test('TrapNet', () => {
        const d = annot('TrapNet', { LastModified: obj.string(bytes('D:2024')) });
        const r = typeTrapNetAnnot(d);
        expect(r.lastModified).toEqual(bytes('D:2024'));
    });

    test('FreeText extended with RC/DS/LE', () => {
        const d = annot('FreeText', {
            DA: obj.string(bytes('/F1 12 Tf 0 g')),
            Q: obj.int(1),
            RC: obj.string(bytes('<rt>...</rt>')),
            DS: obj.string(bytes('font:12pt Helvetica')),
            LE: obj.array([obj.name('OpenArrow'), obj.name('None')]),
            CL: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            IT: obj.name('FreeTextCallout')
        });
        const r = typeFreeTextExtended(d);
        expect(r.q).toBe(1);
        expect(r.le).toEqual(['OpenArrow', 'None']);
        expect(r.it).toBe('FreeTextCallout');
        expect(r.cl).toEqual([0, 0, 10, 10]);
    });

    test('preserves _extras', () => {
        const d = annot('Watermark', { Foo: obj.int(42) });
        const r = typeWatermarkAnnot(d);
        expect(r._extras.Foo.value).toBe(42);
    });

    test('rejects non-dict / unsupported / malformed', () => {
        expect(() => typeAnnotExtended(obj.array([]))).toThrow(ParseError);
        expect(() => typeAnnotExtended(obj.dict({ Subtype: obj.name('XYZ') })))
            .toThrow(ParseError);
        expect(() => typeAnnotExtended(annot('Watermark', { Type: obj.name('Bad') })))
            .toThrow(ParseError);
    });
});

describe('FREETEXT_LINE_ENDINGS', () => {
    test('frozen and includes known styles', () => {
        expect(Object.isFrozen(FREETEXT_LINE_ENDINGS)).toBe(true);
        expect(FREETEXT_LINE_ENDINGS).toContain('OpenArrow');
    });
});

describe('pdfAnnotExtended factory', () => {
    test('shape', () => {
        expect(pdfAnnotExtended.name).toBe('pdfAnnotExtended');
        expect(pdfAnnotExtended.factory.toString()).toContain('function');
        const api = pdfAnnotExtended.factory(_pdfErrors_TD1, { isType: () => false }, { typeBaseAnnot: () => ({}), captureExtras: () => {} });
        expect(typeof api.typeAnnotExtended).toBe('function');
    });
});
