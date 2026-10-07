// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlChartDataLabels } from './dml-chart-data-labels.js';

const xml = ooxmlXml.factory();
const ext = dmlChartDataLabels.factory(xml);

describe('extra/dml-chart-data-labels', () => {
    test('basic flag + override roundtrip', () => {
        const d = {
            showVal: true, showCatName: false, showPercent: true,
            showLegendKey: false, dLblPos: 'outEnd', separator: ', ',
            dLblOverrides: [{ idx: 2, showVal: true, dLblPos: 'b' }]
        };
        const back = ext.parseDLbls(ext.renderDLbls(d));
        expect(back.showVal).toBe(true);
        expect(back.showCatName).toBe(false);
        expect(back.dLblPos).toBe('outEnd');
        expect(back.separator).toBe(', ');
        expect(back.dLblOverrides.length).toBe(1);
        expect(back.dLblOverrides[0].idx).toBe(2);
    });

    test('numFmt + showLeaderLines + leaderLines + showBubbleSize + showSerName', () => {
        const d = {
            numFmt: { formatCode: '0.00%', sourceLinked: '0' },
            showLeaderLines: true,
            showBubbleSize: false,
            showSerName: true,
            leaderLines: { spPr: xml.el('c:spPr', {}, []) }
        };
        const back = ext.parseDLbls(ext.renderDLbls(d));
        expect(back.numFmt.formatCode).toBe('0.00%');
        expect(back.numFmt.sourceLinked).toBe('0');
        expect(back.showLeaderLines).toBe(true);
        expect(back.showBubbleSize).toBe(false);
        expect(back.showSerName).toBe(true);
        expect(back.leaderLines.spPr.name).toBe('c:spPr');
    });

    test('typed txPr with paragraph runs', () => {
        const d = {
            txPr: {
                bodyPr: { rot: '0', vert: 'horz' },
                paras: [{
                    pPr: { lvl: '0' },
                    runs: [
                        { rPr: { sz: '900', b: '1' }, text: 'Label' },
                        { kind: 'br' },
                        { rPr: { sz: '700' }, text: 'sub' }
                    ],
                    endParaRPr: { lang: 'en-US' }
                }]
            }
        };
        const back = ext.parseDLbls(ext.renderDLbls(d));
        expect(back.txPr.bodyPr.rot).toBe('0');
        expect(back.txPr.paras.length).toBe(1);
        const p = back.txPr.paras[0];
        expect(p.runs.length).toBe(3);
        expect(p.runs[0].text).toBe('Label');
        expect(p.runs[0].rPr.b).toBe('1');
        expect(p.runs[1].kind).toBe('br');
        expect(p.runs[2].text).toBe('sub');
        expect(p.endParaRPr.lang).toBe('en-US');
    });

    test('dTable flags showHorzBorder / showVertBorder / showOutline / showKeys', () => {
        const d = {
            showHorzBorder: true,
            showVertBorder: false,
            showOutline: true,
            showKeys: false
        };
        const back = ext.parseDLbls(ext.renderDLbls(d));
        expect(back.showHorzBorder).toBe(true);
        expect(back.showVertBorder).toBe(false);
        expect(back.showOutline).toBe(true);
        expect(back.showKeys).toBe(false);
    });

    test('dLbl override with txPr + numFmt', () => {
        const o = {
            idx: 5,
            numFmt: { formatCode: '#,##0', sourceLinked: '1' },
            txPr: { bodyPr: {}, paras: [{ runs: [{ text: 'X' }] }] },
            showVal: true,
            dLblPos: 'ctr'
        };
        const back = ext.parseDLbl(ext.renderDLbl(o));
        expect(back.idx).toBe(5);
        expect(back.numFmt.formatCode).toBe('#,##0');
        expect(back.txPr.paras[0].runs[0].text).toBe('X');
        expect(back.showVal).toBe(true);
        expect(back.dLblPos).toBe('ctr');
    });
});
