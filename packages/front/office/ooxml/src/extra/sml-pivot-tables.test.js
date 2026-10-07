// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlPivotTables } from './sml-pivot-tables.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
const _errors = _ooxmlErrors.factory();

const xml = ooxmlXml.factory();
const ext = smlPivotTables.factory(_errors, xml);

describe('extra/sml-pivot-tables — pivot table', () => {
    test('parse + render roundtrip skeleton', () => {
        const pt = {
            attrs: { name: 'PT1', cacheId: '0', dataCaption: 'Values' },
            location: { ref: 'A1:E10', firstHeaderRow: '1', firstDataRow: '2', firstDataCol: '0' },
            pivotFields: [
                { attrs: { axis: 'axisRow' }, items: [{ x: '0' }, { x: '1' }, { t: 'default' }] },
                { attrs: { dataField: '1' }, items: [] }
            ],
            rowFields: [{ name: 'field', attrs: { x: '0' } }],
            dataFields: [{ name: 'dataField', attrs: { name: 'Sum', fld: '1', baseField: '0' } }],
            pivotTableStyleInfo: { name: 'PivotStyleLight16', showRowHeaders: '1' }
        };
        const xmlText = ext.renderPivotTable(pt);
        expect(xmlText).toContain('<pivotTableDefinition');
        const back = ext.parsePivotTable(xmlText);
        expect(back.location.ref).toBe('A1:E10');
        expect(back.pivotFields.length).toBe(2);
        expect(back.pivotFields[0].items.length).toBe(3);
        expect(back.rowFields.length).toBe(1);
        expect(back.dataFields[0].attrs.name).toBe('Sum');
        expect(back.pivotTableStyleInfo.name).toBe('PivotStyleLight16');
    });

    test('rowItems / colItems with x children', () => {
        const pt = {
            attrs: { name: 'P' },
            rowItems: [{ attrs: { i: '0' }, x: [{ v: '0' }, { v: '1' }] }],
            colItems: [{ attrs: {}, x: [{ v: '0' }] }]
        };
        const t = ext.renderPivotTable(pt);
        const back = ext.parsePivotTable(t);
        expect(back.rowItems.length).toBe(1);
        expect(back.rowItems[0].x.length).toBe(2);
        expect(back.colItems.length).toBe(1);
    });

    test('formats / chartFormats / conditionalFormats / pivotAreas', () => {
        const pa = { attrs: { type: 'all' }, references: [{ attrs: { field: '0' }, x: [{ v: '0' }] }] };
        const pt = {
            attrs: { name: 'P' },
            formats: [{ attrs: { dxfId: '0' }, pivotArea: pa }],
            chartFormats: [{ attrs: { chart: '0', format: '0', series: '1' }, pivotArea: pa }],
            conditionalFormats: [{ attrs: { scope: 'data' }, pivotAreas: [pa] }]
        };
        const back = ext.parsePivotTable(ext.renderPivotTable(pt));
        expect(back.formats.length).toBe(1);
        expect(back.formats[0].pivotArea.references[0].x[0].v).toBe('0');
        expect(back.chartFormats[0].attrs.chart).toBe('0');
        expect(back.conditionalFormats[0].pivotAreas[0].attrs.type).toBe('all');
    });

    test('pivotHierarchies + row/colHierarchiesUsage', () => {
        const pt = {
            attrs: { name: 'P' },
            pivotHierarchies: [{ attrs: { caption: 'H1' } }],
            rowHierarchiesUsage: [{ hierarchyUsage: '0' }],
            colHierarchiesUsage: [{ hierarchyUsage: '1' }]
        };
        const back = ext.parsePivotTable(ext.renderPivotTable(pt));
        expect(back.pivotHierarchies.length).toBe(1);
        expect(back.rowHierarchiesUsage[0].hierarchyUsage).toBe('0');
        expect(back.colHierarchiesUsage[0].hierarchyUsage).toBe('1');
    });
});

describe('extra/sml-pivot-tables — cache definition', () => {
    test('roundtrip with typed sharedItems', () => {
        const cd = {
            attrs: { recordCount: '10' },
            cacheSource: { attrs: { type: 'worksheet' }, worksheetSource: { ref: 'A1:B5', sheet: 'S1' } },
            cacheFields: [{
                attrs: { name: 'Region', numFmtId: '0' },
                sharedItems: {
                    attrs: { count: '5' },
                    items: [
                        { kind: 's', v: 'North' },
                        { kind: 'n', v: '42', u: '0' },
                        { kind: 'm' },
                        { kind: 'b', v: '1' },
                        { kind: 'd', v: '2024-01-01T00:00:00' },
                        { kind: 'e', v: '#N/A' },
                        { kind: 'x', v: '0' }
                    ]
                }
            }]
        };
        const text = ext.renderPivotCacheDefinition(cd);
        const back = ext.parsePivotCacheDefinition(text);
        expect(back.cacheFields.length).toBe(1);
        expect(back.cacheFields[0].sharedItems.items.length).toBe(7);
        expect(back.cacheFields[0].sharedItems.items[0]).toEqual({ kind: 's', v: 'North' });
        expect(back.cacheFields[0].sharedItems.items[2].kind).toBe('m');
        expect(back.cacheFields[0].sharedItems.items[6]).toEqual({ kind: 'x', v: '0' });
        expect(back.cacheSource.worksheetSource.ref).toBe('A1:B5');
    });

    test('cacheSource consolidation with pages and rangeSets', () => {
        const cd = {
            attrs: {},
            cacheSource: {
                attrs: { type: 'consolidation' },
                consolidation: {
                    attrs: { autoPage: '1' },
                    pages: [{ attrs: { count: '1' }, pageItems: [{ name: 'p1' }] }],
                    rangeSets: [{ i1: '0', ref: 'A1:B2', sheet: 'S1' }]
                }
            },
            cacheFields: []
        };
        const back = ext.parsePivotCacheDefinition(ext.renderPivotCacheDefinition(cd));
        expect(back.cacheSource.consolidation.pages.length).toBe(1);
        expect(back.cacheSource.consolidation.rangeSets[0].sheet).toBe('S1');
    });

    test('cacheHierarchies + kpis + dimensions + measureGroups + maps', () => {
        const cd = {
            attrs: {},
            cacheFields: [],
            cacheHierarchies: [{
                attrs: { uniqueName: '[H1]' },
                fieldsUsage: [{ index: '0' }],
                groupLevels: [{
                    attrs: { uniqueName: '[L1]' },
                    groups: [{
                        attrs: { name: 'g1' },
                        groupMembers: [{ uniqueName: 'm1' }]
                    }]
                }]
            }],
            kpis: [{ uniqueName: '[K1]', caption: 'KPI 1' }],
            dimensions: [{ measure: '1', name: 'D1', uniqueName: '[D1]' }],
            measureGroups: [{ name: 'MG1', caption: 'MG1' }],
            maps: [{ measureGroup: '0', dimension: '0' }]
        };
        const back = ext.parsePivotCacheDefinition(ext.renderPivotCacheDefinition(cd));
        expect(back.cacheHierarchies.length).toBe(1);
        expect(back.cacheHierarchies[0].fieldsUsage[0].index).toBe('0');
        expect(back.cacheHierarchies[0].groupLevels[0].groups[0].groupMembers[0].uniqueName).toBe('m1');
        expect(back.kpis[0].uniqueName).toBe('[K1]');
        expect(back.dimensions.length).toBe(1);
        expect(back.measureGroups.length).toBe(1);
        expect(back.maps.length).toBe(1);
    });

    test('fieldGroup with rangePr/discretePr/groupItems', () => {
        const cd = {
            attrs: {},
            cacheFields: [{
                attrs: { name: 'F1' },
                fieldGroup: {
                    attrs: { par: '0', base: '1' },
                    rangePr: { autoStart: '1', startNum: '0', endNum: '100' },
                    discretePr: { attrs: { count: '2' }, x: [{ v: '0' }, { v: '1' }] },
                    groupItems: { attrs: { count: '2' }, items: [{ kind: 's', v: 'A' }, { kind: 's', v: 'B' }] }
                }
            }]
        };
        const back = ext.parsePivotCacheDefinition(ext.renderPivotCacheDefinition(cd));
        const fg = back.cacheFields[0].fieldGroup;
        expect(fg.rangePr.startNum).toBe('0');
        expect(fg.discretePr.x.length).toBe(2);
        expect(fg.groupItems.items[1].v).toBe('B');
    });
});

describe('extra/sml-pivot-tables — cache records', () => {
    test('roundtrip with typed cells', () => {
        const rec = {
            attrs: {},
            records: [
                [{ kind: 's', attrs: { v: 'North' } }, { kind: 'n', attrs: { v: '42' } }],
                [{ kind: 'x', attrs: { v: '0' } }, { kind: 'm', attrs: {} }]
            ]
        };
        const text = ext.renderPivotCacheRecords(rec);
        expect(text).toContain('<pivotCacheRecords');
        const back = ext.parsePivotCacheRecords(text);
        expect(back.records.length).toBe(2);
        expect(back.records[0][0].kind).toBe('s');
        expect(back.records[0][1].attrs.v).toBe('42');
        expect(back.records[1][1].kind).toBe('m');
    });
});
