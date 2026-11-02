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
    typeMarkupEntries, MARKUP_SUBTYPES,
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

describe('typeMarkupEntries', () => {
    const MARKUP = ['Text', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon',
        'PolyLine', 'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Caret',
        'Stamp', 'Ink', 'FileAttachment', 'Sound', 'Redact', 'Projection'];
    const NONE = {
        t: null, popup: null, rc: null, creationDate: null, irt: null,
        subj: null, rt: null, it: null, exData: null
    };
    const full = () => ({
        ca: obj.real(0.5), BM: obj.name('Multiply'), Lang: obj.string(bytes('fr-FR')),
        T: obj.string(bytes('Ana')), Popup: obj.ref(12, 0),
        RC: obj.string(bytes('<body/>')), CreationDate: obj.string(bytes('D:20261023')),
        IRT: obj.ref(9, 1), Subj: obj.string(bytes('Note')), RT: obj.name('Group'),
        IT: obj.name('FreeTextCallout'), ExData: obj.ref(30, 0)
    });

    test('the markup subtypes are the 18 of ISO 32000-2 Table 171 and Projection', () => {
        expect([...MARKUP_SUBTYPES].sort()).toEqual([...MARKUP].sort());
        expect(Object.isFrozen(MARKUP_SUBTYPES)).toBe(true);
    });

    test('every entry on a markup subtype', () => {
        const r = typeMarkupEntries(annot('Text', full()));
        expect(r).toEqual({
            subtype: 'Text', markup: true,
            ca: 0.5, bm: 'Multiply', lang: bytes('fr-FR'),
            t: bytes('Ana'), popup: { num: 12, gen: 0 }, rc: bytes('<body/>'),
            creationDate: bytes('D:20261023'), irt: { num: 9, gen: 1 },
            subj: bytes('Note'), rt: 'Group', it: 'FreeTextCallout',
            exData: { num: 30, gen: 0 }
        });
    });

    test('each of the 18 subtypes reads the markup entries', () => {
        for (const s of MARKUP) {
            const r = typeMarkupEntries(annot(s, { T: obj.string(bytes('A')) }));
            expect(r.markup).toBe(true);
            expect(r.t).toEqual(bytes('A'));
        }
    });

    test('a non-markup subtype keeps ca, BM and Lang only', () => {
        for (const s of ['Link', 'Widget', 'Popup', 'Screen', 'Movie', '3D']) {
            const r = typeMarkupEntries(annot(s, full()));
            expect(r).toEqual({
                subtype: s, markup: false,
                ca: 0.5, bm: 'Multiply', lang: bytes('fr-FR'), ...NONE
            });
        }
    });

    test('direct forms: an RC stream, an IRT and an ExData dictionary', () => {
        const rc = obj.stream(obj.dict({ Length: obj.int(7) }), bytes('<body/>'));
        const irt = obj.dict({ Type: obj.name('Annot') });
        const exData = obj.dict({ Type: obj.name('ExData'), Subtype: obj.name('Markup3D') });
        const r = typeMarkupEntries(annot('Square', { RC: rc, IRT: irt, ExData: exData, ca: obj.int(1) }));
        expect(r.rc).toBe(rc);
        expect(r.irt).toBe(irt);
        expect(r.exData).toBe(exData);
        expect(r.ca).toBe(1);
    });

    test('an RC text stream given by reference (it must be indirect)', () => {
        const r = typeMarkupEntries(annot('FreeText', { RC: obj.ref(44, 0) }));
        expect(r.rc).toEqual({ num: 44, gen: 0 });
    });

    test('a value of another type is null', () => {
        const r = typeMarkupEntries(annot('Ink', {
            ca: obj.name('half'), BM: obj.array([obj.name('Normal')]), Lang: obj.name('fr'),
            T: obj.int(1), Popup: obj.dict({}), RC: obj.int(2), CreationDate: obj.int(3),
            IRT: obj.int(4), Subj: obj.name('S'), RT: obj.string(bytes('R')),
            IT: obj.string(bytes('X')), ExData: obj.int(5)
        }));
        expect(r).toEqual({ subtype: 'Ink', markup: true, ca: null, bm: null, lang: null, ...NONE });
    });

    test('no entries and no subtype', () => {
        expect(typeMarkupEntries(obj.dict({}))).toEqual({
            subtype: null, markup: false, ca: null, bm: null, lang: null, ...NONE
        });
    });

    test('a non-dictionary throws pdf/extra/annot-ext/not-dict', () => {
        let err = null;
        try { typeMarkupEntries(obj.array([])); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('pdf/extra/annot-ext/not-dict');
        expect(() => typeMarkupEntries(null)).toThrow(ParseError);
    });

    test('the dictionary is not modified', () => {
        const d = annot('Highlight', full());
        const keys = Object.keys(d.entries);
        typeMarkupEntries(d);
        expect(Object.keys(d.entries)).toEqual(keys);
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

describe('the appearance dictionaries, the 3D annotation keys left (A40b)', () => {
    const { typeAppearanceDict, APPEARANCE_KEYS } = pdfAnnotExtended.factory(_errors, _parserObj, _annot);
    const { ContractError } = _errors;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };

    test('appearance characteristics: each key by its value or as read, the rest in _extras', () => {
        const icon = obj.ref(7, 0);
        const d = obj.dict({ R: obj.int(90), BC: obj.array([]), BG: obj.array([]), CA: obj.string(bytes('4')), RC: obj.string(bytes('r')),
            AC: obj.string(bytes('a')), I: icon, RI: icon, IX: icon, IF: obj.dict({}), TP: obj.int(1), Foo: obj.int(1) });
        const r = typeAppearanceDict(d, 'characteristics');
        expect([r.r, r.tp, r.bc.type, r.bg.type, r.i, r.ri, r.ix, r.if.type]).toEqual([90, 1, 'array', 'array', icon, icon, icon, 'dict']);
        expect([r.ca, r.rc, r.ac]).toEqual([bytes('4'), bytes('r'), bytes('a')]);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
        expect(typeAppearanceDict(obj.dict({ R: obj.name('x') }), 'characteristics').r).toBe(null);
    });

    test('border style, border effect, icon fit', () => {
        const bs = typeAppearanceDict(obj.dict({ Type: obj.name('Border'), W: obj.real(1.5), S: obj.name('D'), D: obj.array([]) }), 'borderStyle');
        expect([bs.type, bs.w, bs.s, bs.d.type]).toEqual(['Border', 1.5, 'D', 'array']);
        const be = typeAppearanceDict(obj.dict({ S: obj.name('C'), I: obj.int(1) }), 'borderEffect');
        expect([be.s, be.i]).toEqual(['C', 1]);
        const fit = typeAppearanceDict(obj.dict({ SW: obj.name('A'), S: obj.name('P'), A: obj.array([]), FB: obj.bool(true) }), 'iconFit');
        expect([fit.sw, fit.s, fit.a.type, fit.fb, 'raw' in fit]).toEqual(['A', 'P', 'array', true, true]);
        expect(Object.keys(APPEARANCE_KEYS).sort()).toEqual(['borderEffect', 'borderStyle', 'characteristics', 'iconFit']);
        for (const [kind, keys] of Object.entries(APPEARANCE_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typeAppearanceDict(obj.dict(entries), kind)._extras).toEqual({});
        }
    });

    test('a non-dictionary throws ParseError, an unknown kind ContractError', () => {
        expect(code(() => typeAppearanceDict(obj.array([]), 'iconFit'))).toEqual([ParseError.name, 'pdf/extra/annot-ext/appearance/not-dict']);
        expect(code(() => typeAppearanceDict(obj.dict({}), 'mk'))).toEqual([ContractError.name, 'pdf/extra/annot-ext/appearance/kind']);
    });

    test('a 3D annotation: 3DU and GEO as read', () => {
        const units = obj.dict({ TSm: obj.real(1) });
        const geo = obj.ref(5, 0);
        const r = type3DAnnot(annot('3D', { '3DU': units, GEO: geo }));
        expect([r['3DU'], r.GEO]).toEqual([units, geo]);
        expect(r._extras).toEqual({});
        expect([r['3DU'], r.GEO].map((v) => v === undefined)).toEqual([false, false]);
    });
});
