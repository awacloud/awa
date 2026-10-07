// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { xlsxConditionalFormatting } from './conditionalFormatting.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const cf = xlsxConditionalFormatting.factory(xml, _shared);

describe('xlsxConditionalFormatting — operator-based rules', () => {
    test('cellIs greaterThan with dxfId + formula', () => {
        const rule = {
            type: 'cellIs', priority: 1,
            operator: 'greaterThan', dxfId: 0,
            formulas: ['100']
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('cellIs between with two formulas', () => {
        const rule = {
            type: 'cellIs', priority: 2,
            operator: 'between', dxfId: 1,
            stopIfTrue: true,
            formulas: ['10', '20']
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('expression rule with custom formula', () => {
        const rule = {
            type: 'expression', priority: 3, dxfId: 0,
            formulas: ['MOD(ROW(),2)=0']
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('containsText with text + formula', () => {
        const rule = {
            type: 'containsText', priority: 4, dxfId: 1,
            operator: 'containsText', text: 'error',
            formulas: ['NOT(ISERROR(SEARCH("error",A1)))']
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('top10 with rank + percent + bottom flags', () => {
        const rule = {
            type: 'top10', priority: 5, dxfId: 0,
            rank: 10, percent: true, bottom: true
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('aboveAverage with stdDev + equalAverage', () => {
        const rule = {
            type: 'aboveAverage', priority: 6, dxfId: 0,
            aboveAverage: false, equalAverage: true, stdDev: 2
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('timePeriod', () => {
        const rule = {
            type: 'timePeriod', priority: 7, dxfId: 0,
            timePeriod: 'today',
            formulas: ['FLOOR(A1,1)=TODAY()']
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('duplicateValues / uniqueValues', () => {
        const dup = { type: 'duplicateValues', priority: 8, dxfId: 0 };
        const uniq = { type: 'uniqueValues', priority: 9, dxfId: 1 };
        expect(cf.parseRule(cf.renderRule(dup))).toEqual(dup);
        expect(cf.parseRule(cf.renderRule(uniq))).toEqual(uniq);
    });
});

describe('xlsxConditionalFormatting — visualizations', () => {
    test('2-color colorScale roundtrip', () => {
        const rule = {
            type: 'colorScale', priority: 1,
            colorScale: {
                cfvos: [{ type: 'min' }, { type: 'max' }],
                colors: [{ rgb: 'FFFF7128' }, { rgb: 'FFFFEF9C' }]
            }
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('3-color colorScale with percentile', () => {
        const rule = {
            type: 'colorScale', priority: 1,
            colorScale: {
                cfvos: [
                    { type: 'min' },
                    { type: 'percentile', val: '50' },
                    { type: 'max' }
                ],
                colors: [
                    { rgb: 'FFF8696B' },
                    { rgb: 'FFFFEB84' },
                    { rgb: 'FF63BE7B' }
                ]
            }
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('dataBar with min/max + color', () => {
        const rule = {
            type: 'dataBar', priority: 2,
            dataBar: {
                cfvos: [{ type: 'min' }, { type: 'max' }],
                color: { rgb: 'FF638EC6' },
                showValue: true
            }
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });

    test('iconSet 3TrafficLights1', () => {
        const rule = {
            type: 'iconSet', priority: 3,
            iconSet: {
                iconSet: '3TrafficLights1',
                cfvos: [
                    { type: 'percent', val: '0' },
                    { type: 'percent', val: '33' },
                    { type: 'percent', val: '67' }
                ],
                showValue: true,
                percent: true,
                reverse: false
            }
        };
        const back = cf.parseRule(cf.renderRule(rule));
        expect(back).toEqual(rule);
    });
});

describe('xlsxConditionalFormatting — block', () => {
    test('block with multiple rules + sqref', () => {
        const block = {
            sqref: 'A1:A10 C1:C5',
            rules: [
                { type: 'cellIs', priority: 1, operator: 'greaterThan',
                  dxfId: 0, formulas: ['100'] },
                { type: 'cellIs', priority: 2, operator: 'lessThan',
                  dxfId: 1, formulas: ['0'] }
            ]
        };
        const back = cf.parseBlock(cf.renderBlock(block));
        expect(back).toEqual(block);
    });
});
