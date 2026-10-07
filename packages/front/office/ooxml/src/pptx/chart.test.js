// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for pptxChart — slide-level <p:graphicFrame> chart wrapper.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { pptxChart } from './chart.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

describe('pptxChart module', () => {
    test('module metadata', () => {
        expect(pptxChart.name).toBe('pptxChart');
        expect(pptxChart.dependencies).toEqual(['xml', 'drawingmlChart', 'ooxmlShared']);
        expect(typeof pptxChart.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = pptxChart.factory(xml, drawingmlChart.factory(_errors, xml, _shared), _shared);
    });

    describe('factory', () => {
        test('exposes parse + render + URI constants', () => {
            expect(typeof m.parseGraphicFrame).toBe('function');
            expect(typeof m.renderGraphicFrame).toBe('function');
            expect(m.CHART_URI).toContain('chart');
            expect(m.A_NS).toContain('drawingml');
            expect(m.R_NS).toContain('relationships');
        });
    });

    describe('renderGraphicFrame / parseGraphicFrame', () => {
        test('roundtrip with id, name, extent, offset, chartRef', () => {
            const spec = {
                type: 'chart',
                id: 7, name: 'MyChart',
                cx: 5000000, cy: 3000000,
                offsetX: 100000, offsetY: 200000,
                chartRef: 'rId42'
            };
            const el = m.renderGraphicFrame(spec);
            expect(el.name).toBe('p:graphicFrame');
            const back = m.parseGraphicFrame(el);
            expect(back.type).toBe('chart');
            expect(back.id).toBe(7);
            expect(back.name).toBe('MyChart');
            expect(back.cx).toBe(5000000);
            expect(back.cy).toBe(3000000);
            expect(back.offsetX).toBe(100000);
            expect(back.offsetY).toBe(200000);
            expect(back.chartRef).toBe('rId42');
        });

        test('defaults applied for missing extent', () => {
            const el = m.renderGraphicFrame({});
            const back = m.parseGraphicFrame(el);
            expect(back.cx).toBe(6000000);
            expect(back.cy).toBe(4000000);
            expect(back.offsetX).toBe(0);
            expect(back.offsetY).toBe(0);
        });
    });

    describe('parseGraphicFrame edge cases', () => {
        test('returns null when graphicData uri is not chart', () => {
            const gf = xml.el('p:graphicFrame', {}, [
                xml.el('a:graphic', {}, [
                    xml.el('a:graphicData', { uri: 'http://other' }, [])
                ])
            ]);
            expect(m.parseGraphicFrame(gf)).toBeNull();
        });

        test('returns null when no graphic child', () => {
            const gf = xml.el('p:graphicFrame', {}, []);
            expect(m.parseGraphicFrame(gf)).toBeNull();
        });
    });
});
