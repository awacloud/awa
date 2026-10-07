// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { chartChart } from './chart.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const c = chartChart.factory(errors, shared, xml);
    return { xml, c };
}

describe('chartChart module', () => {
    test('factory shape', () => {
        expect(chartChart.name).toBe('chartChart');
        expect(chartChart.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
        expect(typeof chartChart.factory).toBe('function');
    });

    test('parses chart:chart with title, plot-area, axes, series', () => {
        const { xml, c } = build();
        const src =
            '<chart:chart chart:class="chart:bar">' +
            '<chart:title><text:p>Sales</text:p></chart:title>' +
            '<chart:legend chart:legend-position="end"/>' +
            '<chart:plot-area>' +
            '<chart:axis chart:dimension="x" chart:name="primary-x"/>' +
            '<chart:axis chart:dimension="y" chart:name="primary-y"/>' +
            '<chart:series chart:values-cell-range-address="Sheet1.A1:A3">' +
            '<chart:data-point chart:repeated="3"/>' +
            '</chart:series>' +
            '</chart:plot-area>' +
            '</chart:chart>';
        const m = c.parseChart(xml.parse(src));
        expect(m.type).toBe('chart');
        expect(m.chartClass).toBe('chart:bar');
        expect(m.title).toBeDefined();
        expect(m.legend).toBeDefined();
        expect(m.plotArea.axes).toHaveLength(2);
        expect(m.plotArea.series).toHaveLength(1);
        expect(m.plotArea.series[0].dataPoints).toHaveLength(1);
    });

    test('render roundtrip', () => {
        const { xml, c } = build();
        const m = {
            type: 'chart',
            chartClass: 'chart:line',
            plotArea: {
                axes: [{ kind: 'axis', attrs: { 'chart:dimension': 'x' } }],
                series: [{ kind: 'series', attrs: { 'chart:label-cell-address': 'A1' },
                    dataPoints: [{ kind: 'data-point', attrs: {} }] }]
            }
        };
        const out = xml.serialize(c.renderChart(m));
        expect(out).toContain('chart:class="chart:line"');
        expect(out).toContain('<chart:plot-area>');
        expect(out).toContain('<chart:axis');
        expect(out).toContain('<chart:series');
        expect(out).toContain('<chart:data-point/>');
    });

    test('bytesOf + parseBytes roundtrip', () => {
        const { c } = build();
        const m = { type: 'chart', chartClass: 'chart:pie',
            plotArea: { axes: [], series: [{ kind: 'series', attrs: {}, dataPoints: [] }] } };
        const bytes = c.bytesOf(m);
        const back = c.parseBytes(bytes);
        expect(back.chartClass).toBe('chart:pie');
        expect(back.plotArea.series).toHaveLength(1);
    });

    test('parseBytes tolerates raw chart:chart root', () => {
        const { c } = build();
        const xmlText = '<?xml version="1.0"?>\n<chart:chart chart:class="chart:area"/>';
        const back = c.parseBytes(xmlText);
        expect(back.chartClass).toBe('chart:area');
    });
});

describe('chartChart — bytesOf namespace declarations', () => {
    test('the document-content root declares every prefix the output uses', () => {
        const { xml, c } = build();
        const m = { type: 'chart', chartClass: 'chart:bar',
            plotArea: { attrs: { 'svg:width': '10cm', 'table:cell-range-address': 'local-table.A1:B3' },
                axes: [{ kind: 'axis', attrs: { 'chart:dimension': 'x' } }],
                series: [{ kind: 'series', attrs: { 'xlink:href': '#x' }, dataPoints: [] }] } };
        const root = xml.parse(new TextDecoder().decode(c.bytesOf(m)));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:chart', 'xmlns:office', 'xmlns:svg',
            'xmlns:table', 'xmlns:xlink']);
        expect(root.attrs['xmlns:chart']).toBe('urn:oasis:names:tc:opendocument:xmlns:chart:1.0');
        expect(root.attrs['xmlns:office']).toBe('urn:oasis:names:tc:opendocument:xmlns:office:1.0');
    });

    test('an unknown prefix in the model throws RenderError', () => {
        const { c } = build();
        let err = null;
        try { c.bytesOf({ type: 'chart', _extras: { attrs: { 'zzz:k': '1' } } }); } catch (e) { err = e; }
        expect(err && err.name).toBe('RenderError');
        expect(err.code).toBe('odf/render-error/namespace');
        expect(err.context).toEqual({ module: 'chart', part: 'content.xml', prefix: 'zzz' });
    });
});
