// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `xlsxFullBundle` models the pivot caches and tables the
 * core leaves unmodelled (T60 (f3), `smlPackageParts` through
 * `smlPivotTables`): each cache the workbook names, with its records, and
 * each sheet's pivot tables. The write rebuilds them, their relationships
 * and the workbook's `pivotCaches`. `xlsxLargeBundle` reads as before.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const props = rt.resolve('docxProperties');
const resolveIn = (desc, name) => { const r = new ModuleRuntime(); r.registerDeep(desc); return r.resolve(name); };
const full = resolveIn(ooxmlMods.xlsxFullBundle, 'xlsxFullBundle');
const large = resolveIn(ooxmlMods.xlsxLargeBundle, 'xlsxLargeBundle');
const core = resolveIn(ooxmlMods.xlsx, 'xlsx');
const enc = new TextEncoder();
const dec = new TextDecoder();

const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CTP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
const WB = '/xl/workbook.xml';
const DEF = `<pivotCacheDefinition xmlns="${SS}" xmlns:r="${R}" r:id="rId1" refreshedBy="x" refreshedDate="45000.5" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="2">`
    + '<cacheSource type="worksheet"><worksheetSource ref="A1:B3" sheet="Data"/></cacheSource>'
    + '<cacheFields count="2"><cacheField name="a" numFmtId="0"><sharedItems count="2"><s v="x"/><s v="y"/></sharedItems></cacheField>'
    + '<cacheField name="b" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="0" containsNumber="1" containsInteger="1" minValue="1" maxValue="2"/></cacheField></cacheFields></pivotCacheDefinition>';
const RECORDS = `<pivotCacheRecords xmlns="${SS}" xmlns:r="${R}" count="2"><r><x v="0"/><n v="1"/></r><r><x v="1"/><n v="2"/></r></pivotCacheRecords>`;
const TABLE = `<pivotTableDefinition xmlns="${SS}" name="P" cacheId="5" dataCaption="Values" updatedVersion="6" minRefreshableVersion="3" createdVersion="6">`
    + '<location ref="A1:B4" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/>'
    + '<pivotFields count="2"><pivotField axis="axisRow" showAll="0"><items count="3"><item x="0"/><item x="1"/><item t="default"/></items></pivotField><pivotField dataField="1" showAll="0"/></pivotFields>'
    + '<rowFields count="1"><field x="0"/></rowFields><rowItems count="3"><i><x/></i><i><x v="1"/></i><i t="grand"><x/></i></rowItems>'
    + '<colItems count="1"><i/></colItems><dataFields count="1"><dataField name="Sum of b" fld="1" baseField="0" baseItem="0"/></dataFields>'
    + '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/></pivotTableDefinition>';

/** A workbook the core writes (Data, Pivot), given a cache with its records
 * and a pivot table on Pivot by hand. `opts.externalSource`: the cache
 * names an external workbook. */
function book(opts = {}) {
    const pkg = opc.read(core.write({ sheets: [
        { name: 'Data', rows: [['a', 'b'], ['x', 1], ['y', 2]] },
        { name: 'Pivot', rows: [['Row Labels', 'Sum of b'], ['x', 1], ['y', 2], ['Grand Total', 3]] }
    ] }));
    const put = (name, text, ct, rels) => { opc.setPart(pkg, name, enc.encode(text), ct); if (rels) opc.setRels(pkg, name, rels); };
    const defRels = [{ Id: 'rId1', Type: R + '/pivotCacheRecords', Target: 'pivotCacheRecords1.xml' }];
    if (opts.externalSource) defRels.push({ Id: 'rId2', Type: R + '/externalLinkPath', Target: 'other.xlsx', TargetMode: 'External' });
    put('/xl/pivotCache/pivotCacheDefinition1.xml', DEF, CTP + 'pivotCacheDefinition+xml', defRels);
    put('/xl/pivotCache/pivotCacheRecords1.xml', RECORDS, CTP + 'pivotCacheRecords+xml');
    put('/xl/pivotTables/pivotTable1.xml', TABLE, CTP + 'pivotTable+xml',
        [{ Id: 'rId1', Type: R + '/pivotCacheDefinition', Target: '../pivotCache/pivotCacheDefinition1.xml' }]);
    opc.setRels(pkg, '/xl/worksheets/sheet2.xml', [{ Id: 'rId1', Type: R + '/pivotTable', Target: '../pivotTables/pivotTable1.xml' }]);
    pkg.rels[WB].push({ Id: 'rIdP', Type: R + '/pivotCacheDefinition', Target: 'pivotCache/pivotCacheDefinition1.xml' });
    pkg.parts[WB] = enc.encode(dec.decode(pkg.parts[WB]).replace('</sheets>', '</sheets><pivotCaches><pivotCache cacheId="5" r:id="rIdP"/></pivotCaches>'));
    return opc.write(pkg);
}
const unmodelled = (r) => r.unmodelledParts.map(u => u.partName);
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const sameXml = (a, b) => props.sameElement(noNs(xml.parse(dec.decode(a))), noNs(xml.parse(dec.decode(b))));

describe('the pivot caches and tables through xlsxFullBundle', () => {
    test('read: a cache with its records, a sheet\'s pivot table naming it', () => {
        const r = full.read(book());
        expect(r.workbook.pivotCaches).toHaveLength(1);
        expect(r.workbook.pivotCaches[0].cacheId).toBe(5);
        expect(r.workbook.pivotCaches[0].definition.cacheFields).toHaveLength(2);
        expect(r.workbook.pivotCaches[0].records.records).toHaveLength(2);
        expect(r.workbook.sheets[1].pivotTables).toHaveLength(1);
        expect(r.workbook.sheets[1].pivotTables[0].cache).toBe(0);
        expect(r.workbook.sheets[1].pivotTables[0].table.location.ref).toBe('A1:B4');
        expect(r.unmodelledParts).toEqual([]);
    });
    test('write: the parts as read, their relationships, the workbook\'s pivotCaches', () => {
        const src = opc.read(book());
        const out = opc.read(full.write(full.read(book()).workbook));
        for (const n of ['/xl/pivotCache/pivotCacheDefinition1.xml', '/xl/pivotCache/pivotCacheRecords1.xml', '/xl/pivotTables/pivotTable1.xml']) {
            expect(sameXml(out.parts[n], src.parts[n])).toBe(true);
        }
        expect(out.contentTypes.overrides['/xl/pivotTables/pivotTable1.xml']).toBe(CTP + 'pivotTable+xml');
        expect(out.rels['/xl/pivotCache/pivotCacheDefinition1.xml']).toEqual([{ Id: 'rId1', Type: R + '/pivotCacheRecords', Target: 'pivotCacheRecords1.xml' }]);
        expect(out.rels['/xl/pivotTables/pivotTable1.xml'][0].Type).toBe(R + '/pivotCacheDefinition');
        expect(out.rels['/xl/worksheets/sheet2.xml'].map(x => x.Type)).toContain(R + '/pivotTable');
        const wb = xml.parse(dec.decode(out.parts[WB]));
        const caches = wb.children.find(c => c.name === 'pivotCaches');
        expect(caches.children[0].attrs.cacheId).toBe('5');
        const rel = out.rels[WB].find(x => x.Id === caches.children[0].attrs['r:id']);
        expect(rel.Type).toBe(R + '/pivotCacheDefinition');
    });
    test('a cache whose source is external stays unmodelled, and so does its table', () => {
        const r = full.read(book({ externalSource: true }));
        expect(r.workbook.pivotCaches).toBeUndefined();
        expect(r.workbook.sheets[1].pivotTables).toBeUndefined();
        expect(unmodelled(r)).toEqual(['/xl/pivotCache/pivotCacheDefinition1.xml', '/xl/pivotCache/pivotCacheRecords1.xml', '/xl/pivotTables/pivotTable1.xml']);
    });
    test('xlsxLargeBundle reads as before', () => {
        const r = large.read(book());
        expect(r.workbook.pivotCaches).toBeUndefined();
        expect(unmodelled(r)).toContain('/xl/pivotTables/pivotTable1.xml');
    });
});
