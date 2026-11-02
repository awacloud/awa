// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfXPrepress } from './pdf-x-prepress.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const { typePdfXOutputIntent, lintPdfXPage, PDFX_PROFILES } =
    pdfXPrepress.factory(_errors, _parserObj);
const u8 = (s) => new TextEncoder().encode(s);

describe('typePdfXOutputIntent', () => {
    test('detects PDF/X-4', () => {
        const r = typePdfXOutputIntent(obj.dict({
            S: obj.name('GTS_PDFX'),
            OutputConditionIdentifier: obj.string(u8('PDF/X-4'))
        }));
        expect(r.isPdfX).toBe(true);
        expect(r.profile).toBe('X-4');
        expect(r.catalog.flavor).toBe('transparency');
    });
    test('non-pdfx subtype', () => {
        const r = typePdfXOutputIntent(obj.dict({
            S: obj.name('GTS_PDFA1')
        }));
        expect(r.isPdfX).toBe(false);
    });
    test('unknown identifier', () => {
        const r = typePdfXOutputIntent(obj.dict({
            S: obj.name('GTS_PDFX'),
            OutputConditionIdentifier: obj.string(u8('foo'))
        }));
        expect(r.profile).toBe(null);
    });
    test('rejects non-dict', () => {
        expect(() => typePdfXOutputIntent(obj.int(1))).toThrow(ParseError);
    });
});

describe('lintPdfXPage', () => {
    test('passes with TrimBox', () => {
        const r = lintPdfXPage({ entries: {
            TrimBox: obj.array([]), BleedBox: obj.array([])
        } });
        expect(r.pass).toBe(true);
    });
    test('errors when both Trim+Art', () => {
        const r = lintPdfXPage({ entries: {
            TrimBox: obj.array([]), ArtBox: obj.array([])
        } });
        expect(r.pass).toBe(false);
    });
    test('warns on missing BleedBox', () => {
        const r = lintPdfXPage({ entries: { TrimBox: obj.array([]) } });
        expect(r.warnings.length).toBeGreaterThan(0);
    });
    test('rejects bad input', () => {
        expect(() => lintPdfXPage(null)).toThrow(ParseError);
    });
});

describe('PDFX_PROFILES', () => {
    test('frozen and lists X-6', () => {
        expect(Object.isFrozen(PDFX_PROFILES)).toBe(true);
        expect(PDFX_PROFILES['X-6'].flavor).toBe('pdf-2.0');
    });
});

describe('pdfXPrepress module', () => {
    test('module shape + worker safety', () => {
        expect(pdfXPrepress.name).toBe('pdfXPrepress');
        expect(pdfXPrepress.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfXPrepress.factory.toString()).toContain('function');
        const m = pdfXPrepress.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof m.typePdfXOutputIntent).toBe('function');
        expect(typeof m.lintPdfXPage).toBe('function');
        expect(m.PDFX_PROFILES).toEqual(PDFX_PROFILES);
    });
});

describe('typeOpi, typeOpiDict (the OPI dictionaries)', () => {
    const { typeOpi, typeOpiDict, OPI_KEYS } = pdfXPrepress.factory(_errors, _parserObj);
    const { ContractError } = _errors;

    test('an OPI 1.3 dictionary: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('OPI'), Version: obj.real(1.3), F: obj.string(u8('img.tif')), ID: obj.string(u8('id-1')),
            Comments: obj.string(u8('note')), Size: obj.array([]), CropRect: obj.array([]), ColorType: obj.name('Process'),
            Tint: obj.real(0.5), Overprint: obj.bool(false), Transparency: obj.bool(true), Tags: obj.ref(2, 0), Foo: obj.int(1)
        });
        const r = typeOpiDict(d, '1.3');
        expect([r.type, r.version, r.colortype, r.tint, r.overprint, r.transparency]).toEqual(['OPI', 1.3, 'Process', 0.5, false, true]);
        expect([r.id, r.comments]).toEqual([u8('id-1'), u8('note')]);
        expect([r.f.type, r.size.type, r.croprect.type, r.tags.type]).toEqual(['string', 'array', 'array', 'ref']);
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
    });

    test('an OPI 2.0 dictionary: Inks a name or an array, a wrong-typed value null', () => {
        const r = typeOpiDict(obj.dict({ Version: obj.int(2), MainImage: obj.string(u8('main')), Inks: obj.name('full_color'), IncludedImageQuality: obj.int(2), F: obj.dict({}) }), '2.0');
        expect([r.version, r.inks, r.includedimagequality, r.f.type]).toEqual([2, 'full_color', 2, 'dict']);
        expect(r.mainimage).toEqual(u8('main'));
        expect(typeOpiDict(obj.dict({ Inks: obj.array([]), Overprint: obj.int(1) }), '2.0')).toMatchObject({ inks: { type: 'array' }, overprint: null });
    });

    test('the /OPI wrapper: each version dictionary typed', () => {
        const r = typeOpi(obj.dict({ '1.3': obj.dict({ Version: obj.real(1.3) }), '2.0': obj.ref(4, 0), Foo: obj.int(1) }));
        expect(r.version13.version).toBe(1.3);
        expect(r.version20.type).toBe('ref');
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(typeOpi(obj.dict({ '2.0': obj.int(3) })).version20).toBe(null);
        expect('version13' in typeOpi(obj.dict({}))).toBe(false);
    });

    test('every version of OPI_KEYS types every key of its list', () => {
        expect(Object.isFrozen(OPI_KEYS)).toBe(true);
        expect(Object.keys(OPI_KEYS).sort()).toEqual(['1.3', '2.0']);
        for (const [version, keys] of Object.entries(OPI_KEYS)) {
            expect(keys.length).toBe({ '1.3': 18, '2.0': 11 }[version]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typeOpiDict(obj.dict(entries), version)._extras).toEqual({});
        }
    });

    test('a non-dictionary throws ParseError, an unknown version ContractError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeOpi(obj.array([])))).toEqual([ParseError.name, 'pdf/extra/pdfx/opi/not-dict']);
        expect(code(() => typeOpiDict(obj.name('x'), '1.3'))).toEqual([ParseError.name, 'pdf/extra/pdfx/opi/not-dict']);
        expect(code(() => typeOpiDict(obj.dict({}), '1.4'))).toEqual([ContractError.name, 'pdf/extra/pdfx/opi/version']);
    });
});

describe('typePrepressPart (A41b)', () => {
    const { typePrepressPart, PREPRESS_PART_KEYS } = pdfXPrepress.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
    test('a separation, box colour info and style, a trap region, an output profile reference', () => {
        const sep = typePrepressPart(obj.dict({ Pages: obj.array([]), DeviceColorant: obj.name('Cyan'), ColorSpace: obj.array([]) }), 'separation');
        expect([sep.pages.type, sep.devicecolorant, sep.colorspace.type]).toEqual(['array', 'Cyan', 'array']);
        expect(typePrepressPart(obj.dict({ DeviceColorant: obj.string(u8('Spot 1')) }), 'separation').devicecolorant).toEqual(u8('Spot 1'));
        const bci = typePrepressPart(obj.dict({ CropBox: obj.dict({}), BleedBox: obj.dict({}), TrimBox: obj.ref(2, 0), ArtBox: obj.dict({}) }), 'boxColorInfo');
        expect([bci.cropbox.type, bci.bleedbox.type, bci.trimbox, bci.artbox.type]).toEqual(['dict', 'dict', obj.ref(2, 0), 'dict']);
        const bs = typePrepressPart(obj.dict({ C: obj.array([]), W: obj.real(0.5), S: obj.name('D'), D: obj.array([]) }), 'boxStyle');
        expect([bs.c.type, bs.w, bs.s, bs.d.type]).toEqual(['array', 0.5, 'D', 'array']);
        const tr = typePrepressPart(obj.dict({ TP: obj.name('Default'), TZ: obj.array([]) }), 'trapRegion');
        expect([tr.tp, tr.tz.type]).toEqual(['Default', 'array']);
        const op = typePrepressPart(obj.dict({ CheckSum: obj.string(u8('md5')), ColorantTable: obj.array([]), ICCVersion: obj.string(u8('4.3')),
            ProfileCS: obj.string(u8('CMYK')), ProfileName: obj.string(u8('FOGRA39')), URLs: obj.array([]), Foo: obj.int(1) }), 'outputProfileRef');
        expect([op.checksum, op.coloranttable.type, op.iccversion, op.profilecs, op.profilename, op.urls.type, op._extras])
            .toEqual([u8('md5'), 'array', u8('4.3'), u8('CMYK'), u8('FOGRA39'), 'array', { Foo: obj.int(1) }]);
    });
    test('every kind of PREPRESS_PART_KEYS types every key of its list; errors', () => {
        expect(Object.keys(PREPRESS_PART_KEYS).sort()).toEqual(['boxColorInfo', 'boxStyle', 'outputProfileRef', 'separation', 'trapRegion']);
        for (const [kind, keys] of Object.entries(PREPRESS_PART_KEYS)) {
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typePrepressPart(obj.dict(entries), kind)._extras).toEqual({});
        }
        expect(code(() => typePrepressPart(obj.array([]), 'boxStyle'))).toEqual([ParseError.name, 'pdf/extra/pdfx/part/not-dict']);
        expect(code(() => typePrepressPart(obj.dict({}), 'box'))).toEqual([ContractError.name, 'pdf/extra/pdfx/part/kind']);
    });
});
