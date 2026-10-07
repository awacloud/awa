// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';
import { wmlParagraphFormatting } from './wml-paragraph-formatting.js';

const xml = ooxmlXml.factory();
const core = docxProperties.factory(xml);
const ext = wmlParagraphFormatting.factory(xml, core);

describe('extra/wml-paragraph-formatting — toggles', () => {
    test('promotes keepNext/keepLines/widowControl', () => {
        const src = '<w:pPr xmlns:w="x"><w:keepNext/><w:keepLines/><w:widowControl w:val="0"/></w:pPr>';
        const p = ext.parseParagraphProperties(xml.parse(src));
        expect(p.keepNext).toBe(true);
        expect(p.keepLines).toBe(true);
        expect(p.widowControl).toBe(false);
        expect(p._extras).toBeUndefined();
    });

    test('roundtrip toggles + outlineLvl', () => {
        const pPr = { align: 'center', keepNext: true, keepLines: true, outlineLvl: 1, contextualSpacing: true };
        const el = ext.renderParagraphProperties(pPr);
        const back = ext.parseParagraphProperties(el);
        expect(back).toEqual(pPr);
    });
});

describe('extra/wml-paragraph-formatting — tabs / framePr', () => {
    test('tabs roundtrip', () => {
        const pPr = { tabs: [
            { val: 'left',  pos: 720,  leader: 'dot' },
            { val: 'right', pos: 9000, leader: 'underscore' }
        ]};
        const el = ext.renderParagraphProperties(pPr);
        const back = ext.parseParagraphProperties(el);
        expect(back.tabs).toEqual(pPr.tabs);
    });

    test('framePr roundtrip', () => {
        const pPr = { framePr: { w: '4000', h: '2000', wrap: 'around', dropCap: 'drop', lines: '3' } };
        const el = ext.renderParagraphProperties(pPr);
        const back = ext.parseParagraphProperties(el);
        expect(back.framePr).toEqual(pPr.framePr);
    });

    test('cnfStyle roundtrip', () => {
        const pPr = { cnfStyle: '100000000000' };
        const el = ext.renderParagraphProperties(pPr);
        const back = ext.parseParagraphProperties(el);
        expect(back.cnfStyle).toBe('100000000000');
    });
});

describe('extra/wml-paragraph-formatting — phase 2 toggles full set', () => {
    test('asian typography toggles', () => {
        const pPr = {
            kinsoku: true, wordWrap: false, overflowPunct: true,
            topLinePunct: true, autoSpaceDE: true, autoSpaceDN: false
        };
        const back = ext.parseParagraphProperties(ext.renderParagraphProperties(pPr));
        expect(back.kinsoku).toBe(true);
        expect(back.wordWrap).toBe(false);
        expect(back.overflowPunct).toBe(true);
        expect(back.topLinePunct).toBe(true);
        expect(back.autoSpaceDE).toBe(true);
        expect(back.autoSpaceDN).toBe(false);
    });

    test('layout flags', () => {
        const pPr = {
            mirrorIndents: true, adjustRightInd: false,
            suppressAutoHyphens: true, suppressLineNumbers: true,
            suppressOverlap: true, bidi: true, pageBreakBefore: true
        };
        const back = ext.parseParagraphProperties(ext.renderParagraphProperties(pPr));
        expect(back.mirrorIndents).toBe(true);
        expect(back.adjustRightInd).toBe(false);
        expect(back.suppressAutoHyphens).toBe(true);
        expect(back.suppressLineNumbers).toBe(true);
        expect(back.suppressOverlap).toBe(true);
        expect(back.bidi).toBe(true);
        expect(back.pageBreakBefore).toBe(true);
    });
});

describe('extra/wml-paragraph-formatting — phase 2 val-bearing full set', () => {
    test('divId / textAlignment / textDirection / textboxTightWrap', () => {
        const pPr = {
            divId: '1234',
            textAlignment: 'baseline',
            textDirection: 'lrTb',
            textboxTightWrap: 'allLines'
        };
        const back = ext.parseParagraphProperties(ext.renderParagraphProperties(pPr));
        expect(back.divId).toBe('1234');
        expect(back.textAlignment).toBe('baseline');
        expect(back.textDirection).toBe('lrTb');
        expect(back.textboxTightWrap).toBe('allLines');
    });
});

describe('extra/wml-paragraph-formatting — backward compat', () => {
    test('unknown extras still preserved', () => {
        const src = '<w:pPr xmlns:w="x"><w:keepNext/><w:zzUnknown/></w:pPr>';
        const p = ext.parseParagraphProperties(xml.parse(src));
        expect(p.keepNext).toBe(true);
        expect(p._extras).toHaveLength(1);
    });
});
