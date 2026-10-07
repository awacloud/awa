// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { docxNumbering } from './numbering.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const props = docxProperties.factory(xml);
const num = docxNumbering.factory(_errors, xml, props, _shared);

describe('docxNumbering', () => {
    test('roundtrip abstract num + concrete num', () => {
        const obj = {
            abstractNums: [{
                abstractNumId: 0,
                multiLevelType: 'multilevel',
                name: 'numbered',
                levels: [
                    { ilvl: 0, start: 1, numFmt: 'decimal',
                      lvlText: '%1.', lvlJc: 'left',
                      pPr: { indent: { left: 720, hanging: 360 } } },
                    { ilvl: 1, start: 1, numFmt: 'lowerLetter',
                      lvlText: '%2)', lvlJc: 'left' }
                ]
            }],
            nums: [
                { numId: 1, abstractNumId: 0 },
                { numId: 2, abstractNumId: 0,
                  lvlOverrides: [{ ilvl: 0, startOverride: 5 }] }
            ]
        };
        const back = num.parse(num.serialize(obj));
        expect(back).toEqual(obj);
    });

    test('decimalList helper produces a parseable object', () => {
        const { numbering, numId } = num.decimalList();
        expect(numId).toBe(1);
        const back = num.parse(num.serialize(numbering));
        expect(back.abstractNums[0].levels[0].numFmt).toBe('decimal');
    });

    test('bulletList emits U+2022 with no run font (BL-1799)', () => {
        const { numbering, numId } = num.bulletList();
        expect(numId).toBe(1);
        const text = num.serialize(numbering);
        expect(text).toContain('<w:lvlText w:val="•"/>');
        expect(text).not.toContain('w:rFonts');
        const back = num.parse(text);
        const level = back.abstractNums[0].levels[0];
        expect(level.numFmt).toBe('bullet');
        expect(level.lvlText).toBe('•');
        expect(level.rPr).toBeUndefined();
    });

    test('numbering model still round-trips a caller-supplied level font', () => {
        // Non-vacuity control for the bulletList fix: the model is unchanged.
        const obj = {
            abstractNums: [{
                abstractNumId: 0,
                multiLevelType: 'singleLevel',
                levels: [{
                    ilvl: 0, numFmt: 'bullet', lvlText: '', lvlJc: 'left',
                    rPr: { font: 'Wingdings' }
                }]
            }],
            nums: [{ numId: 1, abstractNumId: 0 }]
        };
        const text = num.serialize(obj);
        expect(text).toContain('w:rFonts');
        expect(num.parse(text).abstractNums[0].levels[0].rPr.font).toBe('Wingdings');
    });

    test('preserves unknown elements in _extras', () => {
        const xmlText = '<?xml version="1.0"?>'
            + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:numIdMacAtCleanup w:val="0"/>'
            + '</w:numbering>';
        const back = num.parse(xmlText);
        expect(back._extras).toBeDefined();
        expect(back._extras[0].name).toBe('w:numIdMacAtCleanup');
    });
});
