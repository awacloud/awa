// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlChartTrendlines } from './dml-chart-trendlines.js';

const xml = ooxmlXml.factory();
const ext = dmlChartTrendlines.factory(xml);

describe('extra/dml-chart-trendlines: trendline', () => {
    test('roundtrip name/type/order/period/forward/backward/intercept/dispRSqr/dispEq', () => {
        const t = {
            name: 'Linear (Sales)',
            spPr: xml.el('c:spPr', {}, []),
            trendlineType: 'poly',
            order: 3,
            period: 4,
            forward: 1.5,
            backward: 0.5,
            intercept: 10,
            dispRSqr: true,
            dispEq: false
        };
        const back = ext.parseTrendline(ext.renderTrendline(t));
        expect(back.name).toBe('Linear (Sales)');
        expect(back.spPr.name).toBe('c:spPr');
        expect(back.trendlineType).toBe('poly');
        expect(back.order).toBe(3);
        expect(back.period).toBe(4);
        expect(back.forward).toBe(1.5);
        expect(back.backward).toBe(0.5);
        expect(back.intercept).toBe(10);
        expect(back.dispRSqr).toBe(true);
        expect(back.dispEq).toBe(false);
    });

    test('trendlineLbl with layout/tx/numFmt/spPr/txPr', () => {
        const t = {
            trendlineType: 'linear',
            trendlineLbl: {
                layout: xml.el('c:layout', {}, []),
                tx: xml.el('c:tx', {}, []),
                numFmt: { formatCode: '0.00', sourceLinked: '0' },
                spPr: xml.el('c:spPr', {}, []),
                txPr: xml.el('c:txPr', {}, [])
            }
        };
        const back = ext.parseTrendline(ext.renderTrendline(t));
        expect(back.trendlineLbl.layout.name).toBe('c:layout');
        expect(back.trendlineLbl.tx.name).toBe('c:tx');
        expect(back.trendlineLbl.numFmt.formatCode).toBe('0.00');
        expect(back.trendlineLbl.spPr.name).toBe('c:spPr');
        expect(back.trendlineLbl.txPr.name).toBe('c:txPr');
    });
});

describe('extra/dml-chart-trendlines: errBars', () => {
    test('roundtrip errDir/errBarType/errValType/noEndCap/val/plus/minus', () => {
        const e = {
            errDir: 'y',
            errBarType: 'both',
            errValType: 'fixedVal',
            noEndCap: false,
            val: 1.5,
            plus: xml.el('c:plus', {}, []),
            minus: xml.el('c:minus', {}, []),
            spPr: xml.el('c:spPr', {}, [])
        };
        const back = ext.parseErrBars(ext.renderErrBars(e));
        expect(back.errDir).toBe('y');
        expect(back.errBarType).toBe('both');
        expect(back.errValType).toBe('fixedVal');
        expect(back.noEndCap).toBe(false);
        expect(back.val).toBe(1.5);
        expect(back.plus.name).toBe('c:plus');
        expect(back.minus.name).toBe('c:minus');
        expect(back.spPr.name).toBe('c:spPr');
    });
});

describe('extra/dml-chart-trendlines: drop/hi-lo/serLines', () => {
    test('dropLines/hiLowLines/serLines roundtrip', () => {
        const sp = xml.el('c:spPr', {}, []);
        const dl = ext.parseDropLines(ext.renderDropLines({ spPr: sp }));
        const hl = ext.parseHiLowLines(ext.renderHiLowLines({ spPr: sp }));
        const sl = ext.parseSerLines(ext.renderSerLines({ spPr: sp }));
        expect(dl.spPr.name).toBe('c:spPr');
        expect(hl.spPr.name).toBe('c:spPr');
        expect(sl.spPr.name).toBe('c:spPr');
    });
});

describe('extra/dml-chart-trendlines: upDownBars', () => {
    test('roundtrip with gapWidth + upBars + downBars', () => {
        const b = {
            gapWidth: 150,
            upBars:   { spPr: xml.el('c:spPr', {}, []) },
            downBars: { spPr: xml.el('c:spPr', {}, []) }
        };
        const back = ext.parseUpDownBars(ext.renderUpDownBars(b));
        expect(back.gapWidth).toBe(150);
        expect(back.upBars.spPr.name).toBe('c:spPr');
        expect(back.downBars.spPr.name).toBe('c:spPr');
    });

    test('gapWidth/gapDepth helper roundtrips', () => {
        expect(ext.parseGapWidth(ext.renderGapWidth(100))).toBe(100);
        expect(ext.parseGapDepth(ext.renderGapDepth(50))).toBe(50);
    });
});
