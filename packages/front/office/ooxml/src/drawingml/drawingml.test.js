// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for drawingml — text-body model + run / paragraph properties.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlMath } from '../math/math.js';
import { drawingml } from './drawingml.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

describe('drawingml module', () => {
    test('module metadata', () => {
        expect(drawingml.name).toBe('drawingml');
        expect(drawingml.dependencies).toEqual(['xml', 'ooxmlMath', 'ooxmlShared']);
        expect(typeof drawingml.factory).toBe('function');
    });

    describe('factory', () => {
        test('creates instance with expected API', () => {
            const xml = ooxmlXml.factory();
            const m = drawingml.factory(xml, ooxmlMath.factory(_errors, xml), _shared);
            expect(typeof m.parseRunProperties).toBe('function');
            expect(typeof m.renderRunProperties).toBe('function');
            expect(typeof m.parseParagraphProperties).toBe('function');
            expect(typeof m.renderParagraphProperties).toBe('function');
            expect(typeof m.parseRun).toBe('function');
            expect(typeof m.renderRun).toBe('function');
            expect(typeof m.parseBreak).toBe('function');
            expect(typeof m.renderBreak).toBe('function');
            expect(typeof m.parseField).toBe('function');
            expect(typeof m.renderField).toBe('function');
            expect(typeof m.parseParagraph).toBe('function');
            expect(typeof m.renderParagraph).toBe('function');
            expect(typeof m.parseTextBody).toBe('function');
            expect(typeof m.renderTextBody).toBe('function');
            expect(typeof m.srgbClr).toBe('function');
            expect(typeof m.textParagraph).toBe('function');
            expect(typeof m.textBodyFromString).toBe('function');
            expect(m.EMU_PER_INCH).toBe(914400);
            expect(m.EMU_PER_CM).toBe(360000);
            expect(m.EMU_PER_PT).toBe(12700);
            expect(m.A_NS).toContain('drawingml');
        });
    });

    let xml;
    let m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = drawingml.factory(xml, ooxmlMath.factory(_errors, xml), _shared);
    });

    describe('unit conversions', () => {
        test('inchesToEmu / cmToEmu / ptToEmu', () => {
            expect(m.inchesToEmu(1)).toBe(914400);
            expect(m.cmToEmu(2.54)).toBe(914400);
            expect(m.ptToEmu(72)).toBe(914400);
        });
    });

    describe('srgbClr', () => {
        test('uppercases and strips leading #', () => {
            const el = m.srgbClr('#ff0000');
            expect(el.name).toBe('a:srgbClr');
            expect(el.attrs.val).toBe('FF0000');
        });
    });

    describe('parseRunProperties / renderRunProperties', () => {
        test('roundtrip basic flags + color + font', () => {
            const rPr = { lang: 'en-US', size: 1800, bold: true, italic: false,
                          underline: 'sng', color: 'FF0000', font: 'Calibri',
                          baseline: 30000 };
            const back = m.parseRunProperties(m.renderRunProperties(rPr));
            expect(back.lang).toBe('en-US');
            expect(back.size).toBe(1800);
            expect(back.bold).toBe(true);
            expect(back.italic).toBe(false);
            expect(back.underline).toBe('sng');
            expect(back.color).toBe('FF0000');
            expect(back.font).toBe('Calibri');
            expect(back.baseline).toBe(30000);
        });

        test('returns undefined on null input', () => {
            expect(m.parseRunProperties(null)).toBeUndefined();
            expect(m.renderRunProperties(null)).toBeNull();
        });

        test('preserves unknown children in _extras', () => {
            const src = '<a:rPr xmlns:a="x"><a:unknownX a:foo="1"/></a:rPr>';
            const back = m.parseRunProperties(xml.parse(src));
            expect(back._extras).toHaveLength(1);
            expect(back._extras[0].name).toBe('a:unknownX');
        });
    });

    describe('parseParagraphProperties / renderParagraphProperties', () => {
        test('roundtrip lvl + algn + bullet char', () => {
            const pPr = { level: 2, align: 'ctr', indent: 100, marL: 360,
                          bullet: { char: '•' } };
            const back = m.parseParagraphProperties(m.renderParagraphProperties(pPr));
            expect(back.level).toBe(2);
            expect(back.align).toBe('ctr');
            expect(back.indent).toBe(100);
            expect(back.marL).toBe(360);
            expect(back.bullet).toEqual({ char: '•' });
        });

        test('bullet none / autoNumType', () => {
            const a = m.parseParagraphProperties(
                m.renderParagraphProperties({ bullet: 'none' }));
            expect(a.bullet).toBe('none');
            const b = m.parseParagraphProperties(
                m.renderParagraphProperties({ bullet: { autoNumType: 'arabicPeriod' } }));
            expect(b.bullet).toEqual({ autoNumType: 'arabicPeriod' });
        });

        test('returns null on empty input', () => {
            expect(m.parseParagraphProperties(null)).toBeUndefined();
            expect(m.renderParagraphProperties(null)).toBeNull();
            expect(m.renderParagraphProperties({})).toBeNull();
        });
    });

    describe('parseRun / renderRun', () => {
        test('roundtrip text + rPr', () => {
            const run = { type: 'text', value: 'hello',
                          rPr: { bold: true, color: 'AA0000' } };
            const back = m.parseRun(m.renderRun(run));
            expect(back.type).toBe('text');
            expect(back.value).toBe('hello');
            expect(back.rPr.bold).toBe(true);
            expect(back.rPr.color).toBe('AA0000');
        });

        test('empty value', () => {
            const back = m.parseRun(m.renderRun({ type: 'text', value: '' }));
            expect(back.value).toBe('');
        });
    });

    describe('parseField / renderField / parseBreak / renderBreak', () => {
        test('field roundtrip', () => {
            const f = { type: 'field', id: '{1}', fieldType: 'slidenum', value: '3' };
            const back = m.parseField(m.renderField(f));
            expect(back.id).toBe('{1}');
            expect(back.fieldType).toBe('slidenum');
            expect(back.value).toBe('3');
        });

        test('break with rPr', () => {
            const br = m.renderBreak({ type: 'break', rPr: { size: 1200 } });
            const back = m.parseBreak(br);
            expect(back.type).toBe('break');
            expect(back.rPr.size).toBe(1200);
        });
    });

    describe('parseParagraph / renderParagraph', () => {
        test('roundtrip multi-run paragraph', () => {
            const p = { runs: [
                { type: 'text', value: 'a' },
                { type: 'break' },
                { type: 'text', value: 'b', rPr: { bold: true } }
            ], pPr: { level: 1 } };
            const back = m.parseParagraph(m.renderParagraph(p));
            expect(back.pPr.level).toBe(1);
            expect(back.runs).toHaveLength(3);
            expect(back.runs[0].value).toBe('a');
            expect(back.runs[1].type).toBe('break');
            expect(back.runs[2].rPr.bold).toBe(true);
        });
    });

    describe('parseTextBody / renderTextBody', () => {
        test('roundtrip via textBodyFromString', () => {
            const tb = m.textBodyFromString('Hi', { bold: true });
            const el = m.renderTextBody(tb);
            expect(el.name).toBe('a:txBody');
            const back = m.parseTextBody(el);
            expect(back.paragraphs).toHaveLength(1);
            expect(back.paragraphs[0].runs[0].value).toBe('Hi');
            expect(back.paragraphs[0].runs[0].rPr.bold).toBe(true);
        });

        test('renderTextBody with custom root tag', () => {
            const el = m.renderTextBody(m.textBodyFromString('x'), 'p:txBody');
            expect(el.name).toBe('p:txBody');
        });
    });

    describe('textParagraph helper', () => {
        test('builds <a:p><a:r><a:t>X</a:t></a:r></a:p>', () => {
            const p = m.textParagraph('X');
            expect(p.name).toBe('a:p');
            expect(p.children[0].name).toBe('a:r');
            expect(p.children[0].children[0].name).toBe('a:t');
            expect(xml.textContent(p.children[0].children[0])).toBe('X');
        });
    });
});
