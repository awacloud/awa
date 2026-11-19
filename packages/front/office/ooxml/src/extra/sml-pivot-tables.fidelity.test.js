// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — `smlPivotTables` writes a pivot table's children in
 * CT_pivotTableDefinition's order (T60 (f3)): a table read is written back
 * as read.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const props = rt.resolve('docxProperties');
const r2 = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules, ...ooxmlMods.extras]) r2.register(m);
const piv = r2.resolve('smlPivotTables');

const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PIVOT_TABLE = `<pivotTableDefinition xmlns="${SS}" name="P" cacheId="5" dataCaption="Values" updatedVersion="6" minRefreshableVersion="3" createdVersion="6">`
    + '<location ref="D1:E4" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/>'
    + '<pivotFields count="2"><pivotField axis="axisRow" showAll="0"><items count="3"><item x="0"/><item x="1"/><item t="default"/></items></pivotField><pivotField dataField="1" showAll="0"/></pivotFields>'
    + '<rowFields count="1"><field x="0"/></rowFields>'
    + '<rowItems count="3"><i><x/></i><i><x v="1"/></i><i t="grand"><x/></i></rowItems>'
    + '<colFields count="1"><field x="-2"/></colFields>'
    + '<colItems count="1"><i/></colItems>'
    + '<dataFields count="1"><dataField name="Sum of b" fld="1" baseField="0" baseItem="0"/></dataFields>'
    + '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>'
    + '</pivotTableDefinition>';
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const backOf = (text) => props.sameElement(noNs(xml.parse(piv.renderPivotTable(piv.parsePivotTable(text)))), noNs(xml.parse(text)));
const names = (text) => xml.parse(text).children.filter(c => c.type === 'element').map(c => c.name);

describe('smlPivotTables — a pivot table written back as read (T60 f3)', () => {
    test('rowItems and colFields, colItems in the schema order', () => {
        expect(names(piv.renderPivotTable(piv.parsePivotTable(PIVOT_TABLE)))).toEqual(names(PIVOT_TABLE));
        expect(backOf(PIVOT_TABLE)).toBe(true);
    });
    test('formats, conditionalFormats, chartFormats, pivotHierarchies, filters in the schema order', () => {
        const pa = '<pivotArea type="all"/>';
        const text = PIVOT_TABLE.replace('<pivotTableStyleInfo', `<formats count="1"><format dxfId="0">${pa}</format></formats>`
            + `<conditionalFormats count="1"><conditionalFormat priority="1"><pivotAreas count="1">${pa}</pivotAreas></conditionalFormat></conditionalFormats>`
            + `<chartFormats count="1"><chartFormat chart="0" format="1">${pa}</chartFormat></chartFormats>`
            + '<pivotHierarchies count="1"><pivotHierarchy/></pivotHierarchies><pivotTableStyleInfo')
            .replace('</pivotTableDefinition>', '<filters count="1"><filter fld="0" type="count" id="1" iMeasureFld="0"/></filters></pivotTableDefinition>');
        expect(names(piv.renderPivotTable(piv.parsePivotTable(text)))).toEqual(names(text));
    });
});
