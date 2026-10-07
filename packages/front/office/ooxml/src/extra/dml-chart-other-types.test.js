// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for typed parse/render of bubble/radar/stock/ofPie charts and
 * pivotFmt — Phase 22.
 */
import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlChartOtherTypes } from './dml-chart-other-types.js';

const xml = ooxmlXml.factory();
const m = dmlChartOtherTypes.factory(xml);

function numRef() {
    return xml.el('c:numRef', {}, [
        xml.el('c:f', {}, [xml.text('Sheet1!$A$1:$A$3')]),
        xml.el('c:numCache', {}, [
            xml.el('c:ptCount', { val: '3' })
        ])
    ]);
}
function strRef() {
    return xml.el('c:strRef', {}, [
        xml.el('c:f', {}, [xml.text('Sheet1!$B$1')])
    ]);
}

describe('extra/dml-chart-other-types: TYPES', () => {
    test('exposes the 4 typed chart kinds', () => {
        expect(m.TYPES).toEqual(['bubbleChart', 'radarChart', 'stockChart', 'ofPieChart']);
    });
});

describe('extra/dml-chart-other-types: bubbleChart', () => {
    test('roundtrip with one series', () => {
        const c = {
            kind: 'bubbleChart',
            varyColors: false,
            ser: [{
                idx: 0, order: 0,
                tx: xml.el('c:tx', {}, [strRef()]),
                bubble3D: false,
                xVal: xml.el('c:xVal', {}, [numRef()]),
                yVal: xml.el('c:yVal', {}, [numRef()]),
                bubbleSize: xml.el('c:bubbleSize', {}, [numRef()])
            }],
            bubbleScale: 100,
            showNegBubbles: false,
            sizeRepresents: 'area'
        };
        const back = m.parseBubbleChart(m.renderBubbleChart(c));
        expect(back.kind).toBe('bubbleChart');
        expect(back.varyColors).toBe(false);
        expect(back.bubbleScale).toBe(100);
        expect(back.showNegBubbles).toBe(false);
        expect(back.sizeRepresents).toBe('area');
        expect(back.ser.length).toBe(1);
        expect(back.ser[0].idx).toBe(0);
        expect(back.ser[0].order).toBe(0);
        expect(back.ser[0].bubble3D).toBe(false);
        expect(back.ser[0].xVal.name).toBe('c:xVal');
        expect(back.ser[0].yVal.name).toBe('c:yVal');
        expect(back.ser[0].bubbleSize.name).toBe('c:bubbleSize');
    });
});

describe('extra/dml-chart-other-types: radarChart', () => {
    test('roundtrip with radarStyle', () => {
        const c = {
            kind: 'radarChart',
            radarStyle: 'marker',
            varyColors: true,
            ser: [{
                idx: 0, order: 0,
                tx: xml.el('c:tx', {}, [strRef()]),
                cat: xml.el('c:cat', {}, [strRef()]),
                val: xml.el('c:val', {}, [numRef()])
            }]
        };
        const back = m.parseRadarChart(m.renderRadarChart(c));
        expect(back.radarStyle).toBe('marker');
        expect(back.varyColors).toBe(true);
        expect(back.ser.length).toBe(1);
        expect(back.ser[0].cat.name).toBe('c:cat');
        expect(back.ser[0].val.name).toBe('c:val');
    });
});

describe('extra/dml-chart-other-types: stockChart', () => {
    test('roundtrip with high/low/close/open by idx', () => {
        const c = {
            kind: 'stockChart',
            ser: [
                { idx: 0, order: 0, tx: xml.el('c:tx', {}, [strRef()]), val: xml.el('c:val', {}, [numRef()]) }, // open
                { idx: 1, order: 1, tx: xml.el('c:tx', {}, [strRef()]), val: xml.el('c:val', {}, [numRef()]) }, // high
                { idx: 2, order: 2, tx: xml.el('c:tx', {}, [strRef()]), val: xml.el('c:val', {}, [numRef()]) }, // low
                { idx: 3, order: 3, tx: xml.el('c:tx', {}, [strRef()]), val: xml.el('c:val', {}, [numRef()]) }  // close
            ]
        };
        const back = m.parseStockChart(m.renderStockChart(c));
        expect(back.ser.length).toBe(4);
        expect(back.ser.map(s => s.idx)).toEqual([0, 1, 2, 3]);
    });
});

describe('extra/dml-chart-other-types: ofPieChart', () => {
    test('roundtrip with custSplit', () => {
        const c = {
            kind: 'ofPieChart',
            ofPieType: 'bar',
            varyColors: true,
            ser: [{
                idx: 0, order: 0,
                tx: xml.el('c:tx', {}, [strRef()]),
                cat: xml.el('c:cat', {}, [strRef()]),
                val: xml.el('c:val', {}, [numRef()])
            }],
            gapWidth: 100,
            splitType: 'cust',
            splitPos: 0,
            secondPieSize: 75,
            custSplit: { secondPiePt: [3, 4, 5] }
        };
        const back = m.parseOfPieChart(m.renderOfPieChart(c));
        expect(back.ofPieType).toBe('bar');
        expect(back.varyColors).toBe(true);
        expect(back.gapWidth).toBe(100);
        expect(back.splitType).toBe('cust');
        expect(back.splitPos).toBe(0);
        expect(back.secondPieSize).toBe(75);
        expect(back.custSplit.secondPiePt).toEqual([3, 4, 5]);
        expect(back.ser[0].cat.name).toBe('c:cat');
    });
});

describe('extra/dml-chart-other-types: pivotFmt', () => {
    test('roundtrip with idx, spPr, dLbl', () => {
        const p = {
            idx: 2,
            spPr: xml.el('c:spPr', {}, []),
            txPr: xml.el('c:txPr', {}, []),
            marker: xml.el('c:marker', {}, []),
            dLbl: xml.el('c:dLbl', {}, [])
        };
        const back = m.parsePivotFmt(m.renderPivotFmt(p));
        expect(back.idx).toBe(2);
        expect(back.spPr.name).toBe('c:spPr');
        expect(back.txPr.name).toBe('c:txPr');
        expect(back.marker.name).toBe('c:marker');
        expect(back.dLbl.name).toBe('c:dLbl');
    });

    test('pivotFmts wraps a list', () => {
        const arr = [{ idx: 0 }, { idx: 1 }];
        const back = m.parsePivotFmts(m.renderPivotFmts(arr));
        expect(back.length).toBe(2);
        expect(back[0].idx).toBe(0);
        expect(back[1].idx).toBe(1);
    });
});

describe('extra/dml-chart-other-types: dispatcher', () => {
    test('parseChartByType / renderChartByType for bubbleChart', () => {
        const el = xml.el('c:bubbleChart', {}, [
            xml.el('c:bubbleScale', { val: '50' })
        ]);
        const p = m.parseChartByType(el);
        expect(p.kind).toBe('bubbleChart');
        expect(p.bubbleScale).toBe(50);
        const back = m.renderChartByType(p);
        expect(back.name).toBe('c:bubbleChart');
    });

    test('unknown chart kind passes through raw', () => {
        const el = xml.el('c:surfaceChart', {});
        const p = m.parseChartByType(el);
        expect(p.kind).toBe('surfaceChart');
        expect(m.renderChartByType(p)).toBe(el);
    });
});
