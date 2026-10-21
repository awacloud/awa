// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlChart } from './chart.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const chart = drawingmlChart.factory(_errors, xml, _shared);

describe('drawingmlChart — bar chart', () => {
    test('barChart roundtrip with title + categories + values', () => {
        const c = chart.barChart({
            title: 'Sales by Region',
            series: [{
                name: 'Q4',
                categories: ['EU', 'US', 'APAC'],
                values: [120, 85, 200]
            }],
            legend: { position: 'r' }
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.title).toBe('Sales by Region');
        expect(back.plotType).toBe('bar');
        expect(back.barDirection).toBe('col');
        expect(back.grouping).toBe('clustered');
        expect(back.series).toHaveLength(1);
        expect(back.series[0].name).toBe('Q4');
        expect(back.series[0].categories).toEqual(['EU', 'US', 'APAC']);
        expect(back.series[0].values).toEqual([120, 85, 200]);
        expect(back.legend.position).toBe('r');
    });

    test('horizontal bar (barDir = bar)', () => {
        const c = chart.barChart({
            direction: 'bar',
            series: [{ name: 's', values: [1, 2] }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.barDirection).toBe('bar');
    });

    test('series color via solidFill', () => {
        const c = chart.barChart({
            series: [{ name: 's', values: [1, 2], color: 'FF0000' }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.series[0].color).toBe('FF0000');
    });

    test('multiple series', () => {
        const c = chart.barChart({
            series: [
                { name: 'Q3', values: [10, 20, 30] },
                { name: 'Q4', values: [12, 25, 35] }
            ]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.series).toHaveLength(2);
        expect(back.series[1].values).toEqual([12, 25, 35]);
    });

    test('stacked grouping', () => {
        const c = chart.barChart({
            grouping: 'stacked',
            series: [{ name: 's', values: [1] }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.grouping).toBe('stacked');
    });
});

describe('drawingmlChart — line chart', () => {
    test('roundtrip', () => {
        const c = chart.lineChart({
            title: 'Trend',
            series: [{
                name: 'Revenue',
                categories: ['Jan', 'Feb', 'Mar', 'Apr'],
                values: [100, 110, 95, 130]
            }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.plotType).toBe('line');
        expect(back.series[0].values).toEqual([100, 110, 95, 130]);
    });
});

describe('drawingmlChart — pie chart', () => {
    test('roundtrip with varyColors', () => {
        const c = chart.pieChart({
            title: 'Market Share',
            series: [{
                name: 'Share',
                categories: ['A', 'B', 'C'],
                values: [40, 30, 30]
            }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.plotType).toBe('pie');
        expect(back.varyColors).toBe(true);
        expect(back.series[0].values).toEqual([40, 30, 30]);
        // Pie has no axes — title parses correctly anyway.
        expect(back.title).toBe('Market Share');
    });
});

describe('drawingmlChart — scatter chart', () => {
    test('roundtrip with xValues + yValues', () => {
        const c = chart.scatterChart({
            title: 'Correlation',
            series: [{
                name: 'Sample',
                xValues: [1, 2, 3, 4, 5],
                yValues: [2.1, 3.9, 6.5, 8.2, 10.1]
            }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.plotType).toBe('scatter');
        expect(back.scatterStyle).toBe('lineMarker');
        expect(back.series[0].xValues).toEqual([1, 2, 3, 4, 5]);
        expect(back.series[0].values).toEqual([2.1, 3.9, 6.5, 8.2, 10.1]);
    });
});

describe('drawingmlChart — doughnut chart', () => {
    test('roundtrip with holeSize', () => {
        const c = chart.doughnutChart({
            holeSize: 60,
            series: [{ name: 's', categories: ['a', 'b'], values: [1, 2] }]
        });
        const back = chart.parse(chart.serialize(c));
        expect(back.plotType).toBe('doughnut');
        expect(back.holeSize).toBe(60);
    });
});

describe('drawingmlChart — legend', () => {
    test('legend position roundtrip', () => {
        for (const position of ['r', 'l', 't', 'b', 'tr']) {
            const c = chart.barChart({
                series: [{ name: 's', values: [1] }],
                legend: { position }
            });
            const back = chart.parse(chart.serialize(c));
            expect(back.legend.position).toBe(position);
        }
    });

    test('no legend → no <c:legend> emitted', () => {
        const c = chart.barChart({
            series: [{ name: 's', values: [1] }]
        });
        const xmlText = chart.serialize(c);
        expect(xmlText).not.toContain('<c:legend>');
    });
});

describe('drawingmlChart — title', () => {
    test('omitted title sets autoTitleDeleted=1', () => {
        const c = chart.barChart({
            series: [{ name: 's', values: [1] }]
        });
        const xmlText = chart.serialize(c);
        expect(xmlText).toContain('<c:autoTitleDeleted val="1"/>');
        expect(xmlText).not.toContain('<c:title>');
    });

    test('title produces autoTitleDeleted=0 + rich text', () => {
        const c = chart.barChart({
            title: 'Hello',
            series: [{ name: 's', values: [1] }]
        });
        const xmlText = chart.serialize(c);
        expect(xmlText).toContain('<c:autoTitleDeleted val="0"/>');
        expect(xmlText).toContain('<c:title>');
    });
});

describe('drawingmlChart — series data (CT_StrRef / CT_NumRef hold a cache, literals stand alone)', () => {
    const ser = (text) => text.slice(text.indexOf('<c:ser>'), text.indexOf('</c:ser>') + 8);
    /** A chartSpace holding one plot of `plot` with the given series XML. */
    const space = (plot, series) => '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea>'
        + `<c:${plot}>${series}</c:${plot}></c:plotArea></c:chart></c:chartSpace>`;

    test('the writer gives the name as c:v, categories as c:strLit, values as c:numLit — no reference', () => {
        const text = ser(chart.serialize(chart.barChart({ series: [{ name: 'Q4', categories: ['EU', 'US'], values: [1, 2] }] })));
        expect(text).toContain('<c:tx><c:v>Q4</c:v></c:tx>');
        expect(text).toContain('<c:cat><c:strLit><c:ptCount val="2"/><c:pt idx="0"><c:v>EU</c:v></c:pt>');
        expect(text).toContain('<c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="2"/>');
        for (const gone of ['c:strRef', 'c:numRef', 'c:f>']) expect(text).not.toContain(gone);
        const xy = ser(chart.serialize(chart.scatterChart({ series: [{ name: 's', xValues: [1, 2], yValues: [3, 4] }] })));
        expect(xy).toContain('<c:xVal><c:numLit>');
        expect(xy).toContain('<c:yVal><c:numLit>');
        expect(xy).not.toContain('Ref>');
    });

    test('the reader takes a reference\'s cache — what Office writes', () => {
        const office = space('barChart', '<c:ser><c:idx val="0"/><c:order val="0"/>'
            + '<c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Sales</c:v></c:pt></c:strCache></c:strRef></c:tx>'
            + '<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>EU</c:v></c:pt><c:pt idx="1"><c:v>US</c:v></c:pt></c:strCache></c:strRef></c:cat>'
            + '<c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>4.5</c:v></c:pt><c:pt idx="1"><c:v>7</c:v></c:pt></c:numCache></c:numRef></c:val>'
            + '</c:ser>');
        const s = chart.parse(office).series[0];
        expect([s.name, s.categories, s.values]).toEqual(['Sales', ['EU', 'US'], [4.5, 7]]);

        const years = space('lineChart', '<c:ser><c:idx val="0"/><c:order val="0"/>'
            + '<c:cat><c:numRef><c:f>A2:A3</c:f><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>2024</c:v></c:pt><c:pt idx="1"><c:v>2025</c:v></c:pt></c:numCache></c:numRef></c:cat>'
            + '<c:val><c:numRef><c:f>B2:B3</c:f><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>');
        expect(chart.parse(years).series[0].categories).toEqual(['2024', '2025']);

        const xy = space('scatterChart', '<c:ser><c:idx val="0"/><c:order val="0"/>'
            + '<c:xVal><c:numRef><c:f>A2</c:f><c:numCache><c:ptCount val="1"/><c:pt idx="0"><c:v>3</c:v></c:pt></c:numCache></c:numRef></c:xVal>'
            + '<c:yVal><c:numRef><c:f>B2</c:f><c:numCache><c:ptCount val="1"/><c:pt idx="0"><c:v>9</c:v></c:pt></c:numCache></c:numRef></c:yVal></c:ser>');
        const p = chart.parse(xy).series[0];
        expect([p.xValues, p.values]).toEqual([[3], [9]]);
    });

    test('the form this package wrote before (a literal inside a reference) still reads the same', () => {
        const legacy = space('barChart', '<c:ser><c:idx val="0"/><c:order val="0"/>'
            + '<c:tx><c:strRef><c:f>"Q4"</c:f><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>Q4</c:v></c:pt></c:strLit></c:strRef></c:tx>'
            + '<c:cat><c:strRef><c:f>""</c:f><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>EU</c:v></c:pt></c:strLit></c:strRef></c:cat>'
            + '<c:val><c:numRef><c:f>""</c:f><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>5</c:v></c:pt></c:numLit></c:numRef></c:val></c:ser>');
        const s = chart.parse(legacy).series[0];
        expect([s.name, s.categories, s.values]).toEqual(['Q4', ['EU'], [5]]);
    });
});
