// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfInfoDictDeprecated } from './info-dict-deprecated.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfInfoDictDeprecated.factory(_pdfErrors_TD1);

describe('extra/info-dict-deprecated', () => {
    test('PDF 1.7 with /Info — no warning', () => {
        const r = m.lint({
            version: '1.7',
            info: obj.dict({ Title: obj.string(u8('Doc')) })
        });
        expect(r.isPdf2).toBe(false);
        expect(r.warnings).toEqual([]);
    });

    test('PDF 2.0 with /Info — emits deprecation warning + suggestions', () => {
        const r = m.lint({
            version: '2.0',
            info: obj.dict({
                Title: obj.string(u8('Doc')),
                Author: obj.string(u8('Alice')),
                Producer: obj.string(u8('awa'))
            }),
            xmpPresent: true
        });
        expect(r.isPdf2).toBe(true);
        expect(r.warnings.length).toBe(1);
        expect(r.warnings[0].code).toBe('pdf/info-deprecated');
        const map = r.warnings[0].suggestions.find(s => s.infoKey === 'Title');
        expect(map.xmpNamespace).toBe('dc');
        expect(map.xmpField).toBe('title');
    });

    test('PDF 2.0 with /Info but no XMP — extra warning', () => {
        const r = m.lint({
            version: '2.0',
            info: obj.dict({ Title: obj.string(u8('Doc')) }),
            xmpPresent: false
        });
        expect(r.warnings.map(w => w.code)).toContain('pdf/info-without-xmp');
    });

    test('PDF 2.0 with no /Info — no warning', () => {
        const r = m.lint({ version: '2.0', xmpPresent: true });
        expect(r.warnings).toEqual([]);
    });

    test('Info key with no XMP mapping is flagged', () => {
        const sugg = m.suggestionsFor(obj.dict({ CustomField: obj.string(u8('x')) }));
        expect(sugg[0].xmpNamespace).toBeNull();
        expect(sugg[0].note).toBeDefined();
    });

    test('accepts /Version as a name', () => {
        const r = m.lint({ version: obj.name('2.0') });
        expect(r.isPdf2).toBe(true);
    });

    test('isVersion2OrHigher', () => {
        expect(m.isVersion2OrHigher('2.0')).toBe(true);
        expect(m.isVersion2OrHigher('1.7')).toBe(false);
        expect(m.isVersion2OrHigher('')).toBe(false);
    });

    test('mapInfoKey', () => {
        expect(m.mapInfoKey('Author').field).toBe('creator');
        expect(m.mapInfoKey('Unknown')).toBeNull();
    });

    test('rejects bad /Info type', () => {
        expect(() => m.lint({ version: '2.0', info: obj.int(1) })).toThrow(ParseError);
    });

    test('rejects bad version type', () => {
        expect(() => m.lint({ version: {} })).toThrow(ParseError);
    });

    test('factory shape', () => {
        expect(pdfInfoDictDeprecated.name).toBe('pdfInfoDictDeprecated');
        expect(pdfInfoDictDeprecated.dependencies).toEqual(['pdfErrors']);
        expect(pdfInfoDictDeprecated.factory.toString()).toContain('function');
    });
});
