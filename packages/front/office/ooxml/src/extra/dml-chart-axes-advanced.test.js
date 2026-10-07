// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlChartAxesAdvanced } from './dml-chart-axes-advanced.js';

const xml = ooxmlXml.factory();
const ext = dmlChartAxesAdvanced.factory(xml);

describe('extra/dml-chart-axes-advanced: catAx full', () => {
    test('roundtrip with axId/scaling/delete/axPos/title/numFmt/major+minorTickMark/tickLblPos/crossAx/crosses/crossesAt/lblOffset/lblAlgn/tickLblSkip/tickMarkSkip', () => {
        const a = {
            kind: 'catAx',
            axId: '111',
            scaling: { orientation: 'minMax', min: 0, max: 100, logBase: 10 },
            delete: false,
            axPos: 'b',
            title: xml.el('c:title', {}, []),
            numFmt: { formatCode: 'General', sourceLinked: '1' },
            majorTickMark: 'out',
            minorTickMark: 'none',
            tickLblPos: 'nextTo',
            spPr: xml.el('c:spPr', {}, []),
            txPr: xml.el('c:txPr', {}, []),
            crossAx: '222',
            crosses: 'autoZero',
            crossesAt: '0',
            crossBetween: 'between',
            auto: '1',
            lblOffset: '100',
            lblAlgn: 'ctr',
            tickLblSkip: '2',
            tickMarkSkip: '1',
            majorGridlines: { spPr: xml.el('c:spPr', {}, []) },
            minorGridlines: { spPr: xml.el('c:spPr', {}, []) }
        };
        const back = ext.parseAxis(ext.renderCatAx(a));
        expect(back.kind).toBe('catAx');
        expect(back.axId).toBe('111');
        expect(back.scaling.orientation).toBe('minMax');
        expect(back.scaling.min).toBe(0);
        expect(back.scaling.max).toBe(100);
        expect(back.scaling.logBase).toBe(10);
        expect(back.delete).toBe(false);
        expect(back.axPos).toBe('b');
        expect(back.title.name).toBe('c:title');
        expect(back.numFmt.formatCode).toBe('General');
        expect(back.majorTickMark).toBe('out');
        expect(back.minorTickMark).toBe('none');
        expect(back.tickLblPos).toBe('nextTo');
        expect(back.crossAx).toBe('222');
        expect(back.crosses).toBe('autoZero');
        expect(back.crossesAt).toBe('0');
        expect(back.crossBetween).toBe('between');
        expect(back.lblOffset).toBe('100');
        expect(back.lblAlgn).toBe('ctr');
        expect(back.tickLblSkip).toBe('2');
        expect(back.tickMarkSkip).toBe('1');
        expect(back.majorGridlines.spPr.name).toBe('c:spPr');
        expect(back.minorGridlines.spPr.name).toBe('c:spPr');
    });
});

describe('extra/dml-chart-axes-advanced: valAx', () => {
    test('valAx with majorUnit/minorUnit/min/max/logBase', () => {
        const a = {
            kind: 'valAx',
            axId: '222',
            scaling: { orientation: 'minMax' },
            crossAx: '111',
            majorUnit: 50,
            minorUnit: 10,
            min: 0,
            max: 200,
            logBase: 10
        };
        const back = ext.parseAxis(ext.renderValAx(a));
        expect(back.kind).toBe('valAx');
        expect(back.majorUnit).toBe(50);
        expect(back.minorUnit).toBe(10);
        expect(back.min).toBe(0);
        expect(back.max).toBe(200);
        expect(back.logBase).toBe(10);
    });
});

describe('extra/dml-chart-axes-advanced: dateAx + serAx', () => {
    test('dateAx baseTimeUnit/majorTimeUnit/minorTimeUnit', () => {
        const a = {
            kind: 'dateAx',
            axId: '333',
            scaling: { orientation: 'minMax' },
            crossAx: '111',
            baseTimeUnit: 'days',
            majorTimeUnit: 'months',
            minorTimeUnit: 'days'
        };
        const back = ext.parseAxis(ext.renderDateAx(a));
        expect(back.kind).toBe('dateAx');
        expect(back.baseTimeUnit).toBe('days');
        expect(back.majorTimeUnit).toBe('months');
        expect(back.minorTimeUnit).toBe('days');
    });

    test('serAx', () => {
        const a = { kind: 'serAx', axId: '444', scaling: {}, crossAx: '111' };
        const back = ext.parseAxis(ext.renderSerAx(a));
        expect(back.kind).toBe('serAx');
        expect(back.axId).toBe('444');
    });
});

describe('extra/dml-chart-axes-advanced: layout / manualLayout', () => {
    test('manualLayout x/y/w/h with modes', () => {
        const m = {
            layoutTarget: 'inner',
            xMode: 'edge', yMode: 'edge', wMode: 'factor', hMode: 'factor',
            x: 0.1, y: 0.2, w: 0.7, h: 0.6
        };
        const back = ext.parseManualLayout(ext.renderManualLayout(m));
        expect(back.layoutTarget).toBe('inner');
        expect(back.xMode).toBe('edge');
        expect(back.wMode).toBe('factor');
        expect(back.x).toBe(0.1);
        expect(back.y).toBe(0.2);
        expect(back.w).toBe(0.7);
        expect(back.h).toBe(0.6);
    });

    test('layout wrapper roundtrip', () => {
        const back = ext.parseLayout(ext.renderLayout({ manualLayout: { x: 0, y: 0, w: 1, h: 1 } }));
        expect(back.manualLayout.w).toBe(1);
    });
});

describe('extra/dml-chart-axes-advanced: dispUnits', () => {
    test('builtInUnit + dispUnitsLbl roundtrip', () => {
        const d = {
            builtInUnit: 'thousands',
            dispUnitsLbl: {
                layout: { manualLayout: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
                tx: xml.el('c:tx', {}, []),
                spPr: xml.el('c:spPr', {}, []),
                txPr: xml.el('c:txPr', {}, [])
            }
        };
        const back = ext.parseDispUnits(ext.renderDispUnits(d));
        expect(back.builtInUnit).toBe('thousands');
        expect(back.dispUnitsLbl.tx.name).toBe('c:tx');
        expect(back.dispUnitsLbl.layout.manualLayout.w).toBe(0.1);
    });

    test('custUnit roundtrip', () => {
        const back = ext.parseDispUnits(ext.renderDispUnits({ custUnit: 1000 }));
        expect(back.custUnit).toBe(1000);
    });
});
