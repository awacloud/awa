// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFontColorTagging } from './font-color-tagging.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const {
    decodeFontDescriptorFlags, detectColorFontTables, typeFontFile3OpenType,
    typeFontDescriptor, FONT_DESCRIPTOR_FLAGS, COLOR_OT_TABLES
} = pdfFontColorTagging.factory(_errors, _parserObj);
function buildSfnt(tags) {
    const n = tags.length;
    const buf = new Uint8Array(12 + n * 16);
    buf[0] = 0x4F; buf[1] = 0x54; buf[2] = 0x54; buf[3] = 0x4F;
    buf[4] = 0; buf[5] = n;
    for (let i = 0; i < n; i++) {
        const off = 12 + i * 16;
        for (let j = 0; j < 4; j++) buf[off + j] = tags[i].charCodeAt(j);
    }
    return buf;
}

describe('decodeFontDescriptorFlags', () => {
    test('decodes minimal', () => {
        const r = decodeFontDescriptorFlags(0);
        expect(r.raw).toBe(0);
        expect(r.fixedPitch).toBe(false);
    });
    test('decodes major flags', () => {
        const f = FONT_DESCRIPTOR_FLAGS.Italic | FONT_DESCRIPTOR_FLAGS.Symbolic |
                  FONT_DESCRIPTOR_FLAGS.ForceBold;
        const r = decodeFontDescriptorFlags(f);
        expect(r.italic).toBe(true);
        expect(r.symbolic).toBe(true);
        expect(r.forceBold).toBe(true);
        expect(r.serif).toBe(false);
    });
    test('throws on non-number', () => {
        expect(() => decodeFontDescriptorFlags('x')).toThrow(ParseError);
    });
});

describe('detectColorFontTables', () => {
    test('detects COLR/sbix/SVG', () => {
        const b = buildSfnt(['cmap', 'COLR', 'CPAL', 'sbix', 'SVG ']);
        const r = detectColorFontTables(b);
        expect(r.hasCOLR).toBe(true);
        expect(r.hasSbix).toBe(true);
        expect(r.hasSVG).toBe(true);
        expect(r.tables).toContain('cmap');
    });
    test('non-color font', () => {
        const r = detectColorFontTables(buildSfnt(['cmap', 'glyf']));
        expect(r.hasCOLR).toBe(false);
    });
    test('throws on truncated', () => {
        expect(() => detectColorFontTables(new Uint8Array(5))).toThrow(ParseError);
        expect(() => detectColorFontTables(new Uint8Array([0,0,0,0,0,2]))).toThrow(ParseError);
    });
    test('throws on non-Uint8Array', () => {
        expect(() => detectColorFontTables([])).toThrow(ParseError);
    });
});

describe('typeFontFile3OpenType', () => {
    test('minimal stream', () => {
        const s = obj.stream(obj.dict({ Subtype: obj.name('OpenType') }), new Uint8Array(0));
        const r = typeFontFile3OpenType(s);
        expect(r.subtype).toBe('OpenType');
        expect(r._extras).toEqual({});
    });
    test('with metadata + body and color detection + extras', () => {
        const body = buildSfnt(['cmap', 'COLR']);
        const s = obj.stream(obj.dict({
            Subtype: obj.name('OpenType'),
            Metadata: obj.ref(9, 0),
            Vendor: obj.int(7)
        }), body);
        const r = typeFontFile3OpenType(s);
        expect(r.metadata.num).toBe(9);
        expect(r.color.hasCOLR).toBe(true);
        expect(r._extras.Vendor.value).toBe(7);
    });
    test('rejects non-stream / bad subtype', () => {
        expect(() => typeFontFile3OpenType(obj.dict({}))).toThrow(ParseError);
        expect(() => typeFontFile3OpenType(obj.stream(obj.dict({ Subtype: obj.name('CIDFontType0C') }), new Uint8Array(0))))
            .toThrow(ParseError);
    });
});

describe('typeFontDescriptor', () => {
    const bytes = (s) => new TextEncoder().encode(s);
    const box = (a) => obj.array(a.map((n) => obj.int(n)));

    test('a full CIDFont descriptor: every field of Tables 120 and 123', () => {
        const style = obj.dict({ Panose: obj.string(new Uint8Array(12), 'hex') });
        const fd = obj.dict({ Bold: obj.dict({ Type: obj.name('FontDescriptor'), FontName: obj.name('X-Bold') }) });
        const r = typeFontDescriptor(obj.dict({
            Type: obj.name('FontDescriptor'),
            FontName: obj.name('ABCDEF+Noto'),
            FontFamily: obj.string(bytes('Noto Sans')),
            FontStretch: obj.name('Condensed'),
            FontWeight: obj.int(700),
            Flags: obj.int(32),
            FontBBox: box([-100, -250, 1100, 900]),
            ItalicAngle: obj.real(-12.5),
            Ascent: obj.int(880),
            Descent: obj.int(-120),
            Leading: obj.int(20),
            CapHeight: obj.int(700),
            XHeight: obj.int(500),
            StemV: obj.int(80),
            StemH: obj.int(70),
            AvgWidth: obj.int(450),
            MaxWidth: obj.int(1200),
            MissingWidth: obj.int(600),
            FontFile2: obj.ref(12, 0),
            CharSet: obj.string(bytes('/a/b')),
            Style: style,
            Lang: obj.name('ja'),
            FD: fd,
            CIDSet: obj.ref(13, 0)
        }));
        expect(r).toEqual({
            type: 'FontDescriptor', fontName: 'ABCDEF+Noto', fontFamily: bytes('Noto Sans'),
            fontStretch: 'Condensed', fontWeight: 700, flags: 32, fontBBox: [-100, -250, 1100, 900],
            italicAngle: -12.5, ascent: 880, descent: -120, leading: 20, capHeight: 700,
            xHeight: 500, stemV: 80, stemH: 70, avgWidth: 450, maxWidth: 1200, missingWidth: 600,
            fontFile: null, fontFile2: { num: 12, gen: 0 }, fontFile3: null, charSet: bytes('/a/b'),
            style, lang: 'ja', fd, cidSet: { num: 13, gen: 0 }, _extras: {}
        });
    });

    test('a TrueType descriptor: the font files by reference or as a direct stream', () => {
        const ff3 = obj.stream(obj.dict({ Subtype: obj.name('OpenType') }), new Uint8Array(4));
        const r = typeFontDescriptor(obj.dict({
            FontFile: obj.ref(4, 1), FontFile3: ff3, FontFile2: obj.ref(5, 0)
        }));
        expect(r.fontFile).toEqual({ num: 4, gen: 1 });
        expect(r.fontFile2).toEqual({ num: 5, gen: 0 });
        expect(r.fontFile3).toBe(ff3);
        const s = obj.stream(obj.dict({}), new Uint8Array(0));
        expect(typeFontDescriptor(obj.dict({ CIDSet: s })).cidSet).toBe(s);
    });

    test('a minimal descriptor: the defaulted metrics are 0, the others null', () => {
        const r = typeFontDescriptor(obj.dict({}));
        expect(r).toEqual({
            type: null, fontName: null, fontFamily: null, fontStretch: null, fontWeight: null,
            flags: null, fontBBox: null, italicAngle: null, ascent: null, descent: null,
            leading: 0, capHeight: null, xHeight: 0, stemV: null, stemH: 0, avgWidth: 0,
            maxWidth: 0, missingWidth: 0, fontFile: null, fontFile2: null, fontFile3: null,
            charSet: null, style: null, lang: null, fd: null, cidSet: null, _extras: {}
        });
    });

    test('Style and FD given by reference', () => {
        const r = typeFontDescriptor(obj.dict({ Style: obj.ref(7, 0), FD: obj.ref(8, 0) }));
        expect(r.style).toEqual({ num: 7, gen: 0 });
        expect(r.fd).toEqual({ num: 8, gen: 0 });
    });

    test('a value of another type gives null (the defaulted metrics: 0)', () => {
        const wrong = obj.string(bytes('x'));
        const r = typeFontDescriptor(obj.dict({
            Type: wrong, FontName: wrong, FontFamily: obj.name('F'), FontStretch: wrong,
            FontWeight: obj.real(400.5), Flags: obj.real(4.5), ItalicAngle: wrong, Ascent: wrong,
            Descent: wrong, Leading: wrong, CapHeight: wrong, XHeight: wrong, StemV: wrong,
            StemH: wrong, AvgWidth: wrong, MaxWidth: wrong, MissingWidth: wrong,
            FontFile: obj.int(1), FontFile2: wrong, FontFile3: obj.dict({}), CharSet: obj.name('a'),
            Style: wrong, Lang: wrong, FD: obj.array([]), CIDSet: obj.int(0)
        }));
        expect(r).toEqual({
            type: null, fontName: null, fontFamily: null, fontStretch: null, fontWeight: null,
            flags: null, fontBBox: null, italicAngle: null, ascent: null, descent: null,
            leading: 0, capHeight: null, xHeight: 0, stemV: null, stemH: 0, avgWidth: 0,
            maxWidth: 0, missingWidth: 0, fontFile: null, fontFile2: null, fontFile3: null,
            charSet: null, style: null, lang: null, fd: null, cidSet: null, _extras: {}
        });
    });

    test('a font bounding box must be four numbers', () => {
        expect(typeFontDescriptor(obj.dict({ FontBBox: box([0, 0, 1]) })).fontBBox).toBe(null);
        expect(typeFontDescriptor(obj.dict({
            FontBBox: obj.array([obj.int(0), obj.name('a'), obj.int(1), obj.int(2)])
        })).fontBBox).toBe(null);
        expect(typeFontDescriptor(obj.dict({
            FontBBox: obj.array([obj.real(0.5), obj.int(-1), obj.int(1), obj.real(2.25)])
        })).fontBBox).toEqual([0.5, -1, 1, 2.25]);
    });

    test('keys outside the descriptor tables go to _extras as read', () => {
        const v = obj.int(3);
        const r = typeFontDescriptor(obj.dict({ FontName: obj.name('A'), Vendor: v }));
        expect(r._extras).toEqual({ Vendor: v });
    });

    test('a non-dictionary throws pdf/extra/font-descriptor/not-dict', () => {
        let err = null;
        try { typeFontDescriptor(obj.ref(1, 0)); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('pdf/extra/font-descriptor/not-dict');
        expect(() => typeFontDescriptor(null)).toThrow(ParseError);
    });
});

describe('catalogs', () => {
    test('frozen', () => {
        expect(Object.isFrozen(FONT_DESCRIPTOR_FLAGS)).toBe(true);
        expect(Object.isFrozen(COLOR_OT_TABLES)).toBe(true);
        expect(COLOR_OT_TABLES).toContain('COLR');
    });
});

describe('pdfFontColorTagging factory', () => {
    test('shape', () => {
        expect(pdfFontColorTagging.name).toBe('pdfFontColorTagging');
        expect(pdfFontColorTagging.factory.toString()).toContain('function');
        const api = pdfFontColorTagging.factory(_pdfErrors_TD1, { isType: () => false });
        expect(typeof api.decodeFontDescriptorFlags).toBe('function');
    });
});

describe('font file stream keys (A39a)', () => {
    const { typeFontFileEntries, typeFontFile3OpenType: openType } = pdfFontColorTagging.factory(_errors, _parserObj);
    const st = (entries) => obj.stream(obj.dict(entries), new Uint8Array());

    test('typeFontFileEntries: Length1–3, Subtype, Metadata', () => {
        const s = st({ Length: obj.int(10), Length1: obj.int(4), Length2: obj.int(5), Length3: obj.int(0), Subtype: obj.name('Type1C'), Metadata: obj.ref(7, 0) });
        const r = typeFontFileEntries(s);
        expect([r.length1, r.length2, r.length3, r.subtype, r.metadata.type]).toEqual([4, 5, 0, 'Type1C', 'ref']);
        expect('length' in r || '_extras' in r).toBe(false);
        expect(r.raw).toBe(s);
        expect(typeFontFileEntries(st({ Length1: obj.real(1.5) })).length1).toBe(null);
        let err = null;
        try { typeFontFileEntries(obj.dict({})); } catch (e) { err = e; }
        expect([err instanceof ParseError, err.code]).toEqual([true, 'pdf/extra/fontfile/not-stream']);
    });

    test('typeFontFile3OpenType: Length1–3 typed, not extras', () => {
        const r = openType(st({ Subtype: obj.name('OpenType'), Length1: obj.int(3), Length2: obj.int(2), Length3: obj.int(1) }));
        expect([r.length1, r.length2, r.length3, r._extras]).toEqual([3, 2, 1, {}]);
    });
});
