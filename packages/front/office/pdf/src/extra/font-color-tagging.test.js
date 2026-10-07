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
    FONT_DESCRIPTOR_FLAGS, COLOR_OT_TABLES
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
