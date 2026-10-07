// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfAnnot } from './annot.js';
import { pdfTextAnnot } from './text.js';
import { pdfLinkAnnot } from './link.js';
import { pdfMarkupAnnot } from './markup.js';
import { pdfShapeAnnot } from './square.js';
import { pdfFreeTextAnnot } from './freeText.js';
import { pdfInkAnnot } from './ink.js';
import { pdfStampAnnot } from './stamp.js';
import { pdfFileAttachAnnot } from './fileAttach.js';
import { pdfWidgetAnnot } from './widget.js';
import { pdfPopupAnnot } from './popup.js';
import { pdfProjectionAnnot } from './projection.js';
import { pdfRedactAnnot } from './redact.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeAnnot, typeBaseAnnot } = _annot;
const { obj } = _parserObj;
const { ParseError } = _errors;

const typers = {
    Text:           pdfTextAnnot.factory(_errors, _parserObj, _annot).typeTextAnnot,
    Link:           pdfLinkAnnot.factory(_errors, _parserObj, _annot).typeLinkAnnot,
    Markup:         pdfMarkupAnnot.factory(_errors, _parserObj, _annot).typeMarkupAnnot,
    Shape:          pdfShapeAnnot.factory(_errors, _parserObj, _annot).typeShapeAnnot,
    FreeText:       pdfFreeTextAnnot.factory(_errors, _parserObj, _annot).typeFreeTextAnnot,
    Ink:            pdfInkAnnot.factory(_errors, _parserObj, _annot).typeInkAnnot,
    Stamp:          pdfStampAnnot.factory(_errors, _parserObj, _annot).typeStampAnnot,
    FileAttachment: pdfFileAttachAnnot.factory(_errors, _parserObj, _annot).typeFileAttachAnnot,
    Widget:         pdfWidgetAnnot.factory(_errors, _parserObj, _annot).typeWidgetAnnot,
    Popup:          pdfPopupAnnot.factory(_errors, _parserObj, _annot).typePopupAnnot,
    Projection:     pdfProjectionAnnot.factory(_errors, _parserObj, _annot).typeProjectionAnnot,
    Redact:         pdfRedactAnnot.factory(_errors, _parserObj, _annot).typeRedactAnnot
};

const dispatch = (dict) => typeAnnot(dict, typers);

describe('typeBaseAnnot', () => {
    test('minimal dict captures defaults', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        const b = typeBaseAnnot(d);
        expect(b.subtype).toBe('Text');
        expect(b.rect).toBeNull();
        expect(b.f).toBe(0);
        expect(b.raw).toBe(d);
        expect(b._extras).toEqual({});
    });

    test('captures common entries', () => {
        const d = obj.dict({
            Type: obj.name('Annot'),
            Subtype: obj.name('Text'),
            Rect: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]),
            Contents: obj.string(new Uint8Array([0x68])),
            NM: obj.string(new Uint8Array([0x6e])),
            M: obj.string(new Uint8Array([0x6d])),
            F: obj.int(4),
            AP: obj.dict({ N: obj.ref(9, 0) }),
            AS: obj.name('On'),
            Border: obj.array([obj.int(0), obj.int(0), obj.int(1)]),
            C: obj.array([obj.real(1), obj.real(0), obj.real(0)]),
            StructParent: obj.int(3),
            CA: obj.real(0.5),
            BS: obj.dict({ W: obj.int(1) }),
            BE: obj.dict({ S: obj.name('S') }),
            P: obj.ref(7, 0)
        });
        const b = typeBaseAnnot(d);
        expect(b.rect).toEqual([0, 0, 10, 10]);
        expect(b.f).toBe(4);
        expect(b.as).toBe('On');
        expect(b.c).toEqual([1, 0, 0]);
        expect(b.structParent).toBe(3);
        expect(b.ca).toBe(0.5);
        expect(b.p).toEqual({ num: 7, gen: 0 });
        expect(b.ap.type).toBe('dict');
        expect(b.bs.type).toBe('dict');
    });

    test('rejects non-dict', () => {
        expect(() => typeBaseAnnot(obj.array([]))).toThrow(ParseError);
    });

    test('rejects wrong /Type', () => {
        const d = obj.dict({ Type: obj.name('Catalog'), Subtype: obj.name('Text') });
        expect(() => typeBaseAnnot(d)).toThrow(ParseError);
    });
});

describe('typeAnnot dispatch', () => {
    test('Text', () => {
        const d = obj.dict({ Subtype: obj.name('Text'), Open: obj.bool(true) });
        const a = dispatch(d);
        expect(a.kind).toBe('Text');
        expect(a.open).toBe(true);
    });

    test('Link', () => {
        const d = obj.dict({ Subtype: obj.name('Link') });
        expect(dispatch(d).kind).toBe('Link');
    });

    test('Highlight', () => {
        const d = obj.dict({ Subtype: obj.name('Highlight') });
        expect(dispatch(d).kind).toBe('Highlight');
    });

    test('Square', () => {
        const d = obj.dict({ Subtype: obj.name('Square') });
        expect(dispatch(d).kind).toBe('Square');
    });

    test('Line', () => {
        const d = obj.dict({ Subtype: obj.name('Line') });
        expect(dispatch(d).kind).toBe('Line');
    });

    test('Polygon', () => {
        const d = obj.dict({ Subtype: obj.name('Polygon') });
        expect(dispatch(d).kind).toBe('Polygon');
    });

    test('Ink', () => {
        const d = obj.dict({ Subtype: obj.name('Ink') });
        expect(dispatch(d).kind).toBe('Ink');
    });

    test('Widget', () => {
        const d = obj.dict({ Subtype: obj.name('Widget') });
        expect(dispatch(d).kind).toBe('Widget');
    });

    test('Redact', () => {
        const d = obj.dict({ Subtype: obj.name('Redact') });
        expect(dispatch(d).kind).toBe('Redact');
    });

    test('Projection', () => {
        const d = obj.dict({ Subtype: obj.name('Projection') });
        expect(dispatch(d).kind).toBe('Projection');
    });

    test('legacy Sound falls through to base', () => {
        const d = obj.dict({ Subtype: obj.name('Sound'),
            Mystery: obj.int(1) });
        const a = dispatch(d);
        expect(a.kind).toBe('Sound');
        expect(a._extras.Mystery).toBeDefined();
    });

    test('unknown subtype yields raw record', () => {
        const d = obj.dict({ Subtype: obj.name('Whatsit'), Foo: obj.int(2) });
        const a = dispatch(d);
        expect(a.kind).toBe('Whatsit');
        expect(a._extras.Foo).toBeDefined();
        expect(a.raw).toBe(d);
    });

    test('rejects missing /Subtype', () => {
        const d = obj.dict({ Type: obj.name('Annot') });
        expect(() => dispatch(d)).toThrow(ParseError);
    });

    test('rejects non-dict', () => {
        expect(() => dispatch(obj.array([]))).toThrow(ParseError);
    });
});

describe('pdfAnnot module', () => {
    test('module shape + worker safety', () => {
        expect(pdfAnnot.name).toBe('pdfAnnot');
        expect(pdfAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfAnnot.factory.toString()).toContain('function');
        const m = pdfAnnot.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeAnnot).toBe('function');
        expect(typeof m.typeBaseAnnot).toBe('function');
    });
});
