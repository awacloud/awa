// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `xlsxFullBundle` models the parts the core leaves
 * unmodelled (T60 (f2), `smlPackageParts`): the calculation chain, the
 * external links, the XML maps, the connections and a table's query table.
 * Each is read only when it is written back as read; the write rebuilds
 * them, their relationships and the workbook's `externalReferences`. The
 * xlsx walker's package hooks. `xlsxLargeBundle` reads as before.
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
const CALC = `<calcChain xmlns="${SS}"><c r="A2" i="3"/><c r="B2"/><c r="A1" i="1"/></calcChain>`;
const LINK = `<externalLink xmlns="${SS}"><externalBook xmlns:r="${R}" r:id="rId1"><sheetNames><sheetName val="Data"/></sheetNames>`
    + '<sheetDataSet><sheetData sheetId="0"><row r="1"><cell r="A1" t="n"><v>42</v></cell></row></sheetData></sheetDataSet></externalBook></externalLink>';
const MAPS = `<MapInfo xmlns="${SS}" SelectionNamespaces=""><Schema ID="Schema1"><xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"><xsd:element name="r"/></xsd:schema></Schema>`
    + '<Map ID="1" Name="r_Map" RootElement="r" SchemaID="Schema1" ShowImportExportValidationErrors="false" AutoFit="true" Append="false" PreserveSortAFLayout="true" PreserveFormat="true"/></MapInfo>';
const CONNS = (tail = '') => `<connections xmlns="${SS}"><connection id="1" name="Q" type="1" refreshedVersion="6" background="1" saveData="1"><dbPr connection="DSN=x" command="SELECT 1"/>${tail}</connection></connections>`;
const QUERY = `<queryTable xmlns="${SS}" name="Q" connectionId="1" autoFormatId="16" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="0">`
    + '<queryTableRefresh nextId="2"><queryTableFields count="1"><queryTableField id="1" name="a" tableColumnId="1"/></queryTableFields></queryTableRefresh></queryTable>';

/** A workbook the core writes (sheets with ids 3 and 1, formulas in A2, B2 of
 * the first and A1 of the second, a query table's table), given the parts
 * by hand. `opts.connTail`: a child appended to the connection. */
function book(opts = {}) {
    const f = (formula, value) => ({ type: 'cell', formula, value, t: 'n' });
    const pkg = opc.read(core.write({
        sheets: [
            { name: 'One', rows: [['a', 1], [f('1+1', 2), f('A2*2', 4)]], tableRefs: [1] },
            { name: 'Two', rows: [[f('[1]Data!A1', 42)]] }
        ],
        tables: [{ id: 1, name: 'Q', displayName: 'Q', ref: 'A1:B2', headerRowCount: 1, rootAttrs: { tableType: 'queryTable' },
            columns: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }]
    }));
    const put = (name, text, ct, rels) => { opc.setPart(pkg, name, enc.encode(text), ct); if (rels) opc.setRels(pkg, name, rels); };
    put('/xl/calcChain.xml', CALC, CTP + 'calcChain+xml');
    put('/xl/externalLinks/externalLink1.xml', LINK, CTP + 'externalLink+xml',
        [{ Id: 'rId1', Type: R + '/externalLinkPath', Target: 'other.xlsx', TargetMode: 'External' }]);
    put('/xl/xmlMaps.xml', MAPS, null);
    put('/xl/connections.xml', CONNS(opts.connTail), CTP + 'connections+xml');
    put('/xl/queryTables/queryTable1.xml', QUERY, CTP + 'queryTable+xml');
    opc.setRels(pkg, '/xl/tables/table1.xml', [{ Id: 'rId1', Type: R + '/queryTable', Target: '../queryTables/queryTable1.xml' }]);
    pkg.rels[WB].push({ Id: 'rIdC', Type: R + '/calcChain', Target: 'calcChain.xml' },
        { Id: 'rIdE', Type: R + '/externalLink', Target: 'externalLinks/externalLink1.xml' },
        { Id: 'rIdX', Type: R + '/xmlMaps', Target: 'xmlMaps.xml' },
        { Id: 'rIdN', Type: R + '/connections', Target: 'connections.xml' });
    pkg.parts[WB] = enc.encode(dec.decode(pkg.parts[WB])
        .replace('sheetId="1"', 'sheetId="3"').replace('sheetId="2"', 'sheetId="1"')
        .replace('</sheets>', '</sheets><externalReferences><externalReference r:id="rIdE"/></externalReferences>'));
    return opc.write(pkg);
}
const unmodelled = (r) => r.unmodelledParts.map(u => u.partName);
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const sameXml = (a, b) => props.sameElement(noNs(xml.parse(dec.decode(a))), noNs(xml.parse(dec.decode(b))));
const kids = (bytes) => xml.parse(dec.decode(bytes)).children.filter(c => c.type === 'element');

describe('smlPackageParts through xlsxFullBundle — the read', () => {
    const r = full.read(book());
    const w = r.workbook;
    test('the calculation chain, each entry on its sheet\'s position', () => {
        expect(w.calcChain.cells.map(c => [c.ref, c.sheet])).toEqual([['A2', 0], ['B2', 0], ['A1', 1]]);
        expect(unmodelled(r)).not.toContain('/xl/calcChain.xml');
    });
    test('the external links, with their target', () => {
        expect(w.externalLinks).toHaveLength(1);
        expect(w.externalLinks[0].target).toBe('other.xlsx');
        expect(w.externalLinks[0].book.sheetNames).toEqual(['Data']);
        expect(w.externalLinks[0].book.sheetDataSet[0].rows[0].cells[0]).toEqual({ ref: 'A1', t: 'n', v: '42' });
    });
    test('the XML maps, the schema kept verbatim; the connections; a table\'s query table', () => {
        expect(w.xmlMaps.maps[0]).toMatchObject({ id: 1, name: 'r_Map', autoFit: true, append: false });
        expect(w.xmlMaps.schemas[0].content[0].name).toBe('xsd:schema');
        expect(w.connections.connections[0]).toMatchObject({ id: 1, name: 'Q', type: 1, background: true, dbPr: { connection: 'DSN=x', command: 'SELECT 1' } });
        expect(w.tables[0].queryTable).toMatchObject({ name: 'Q', connectionId: 1, refresh: { nextId: 2, fields: [{ id: 1, name: 'a', tableColumnId: 1 }] } });
        expect(r.unmodelledParts).toEqual([]);
    });
});

describe('smlPackageParts through xlsxFullBundle — the write', () => {
    const src = opc.read(book());
    const out = opc.read(full.write(full.read(book()).workbook));
    test('the parts, their relationships, the content types and externalReferences', () => {
        for (const n of ['/xl/calcChain.xml', '/xl/externalLinks/externalLink1.xml', '/xl/xmlMaps.xml', '/xl/connections.xml', '/xl/queryTables/queryTable1.xml']) {
            expect(out.parts[n]).toBeDefined();
        }
        expect(out.contentTypes.overrides['/xl/externalLinks/externalLink1.xml']).toBe(CTP + 'externalLink+xml');
        const types = out.rels[WB].map(x => x.Type.split('/').pop());
        for (const t of ['calcChain', 'externalLink', 'xmlMaps', 'connections']) expect(types).toContain(t);
        expect(out.rels['/xl/externalLinks/externalLink1.xml']).toEqual([{ Id: 'rId1', Type: R + '/externalLinkPath', Target: 'other.xlsx', TargetMode: 'External' }]);
        expect(out.rels['/xl/tables/table1.xml'][0].Type).toBe(R + '/queryTable');
        expect(kids(out.parts[WB]).map(c => c.name)).toEqual(['sheets', 'externalReferences']);
    });
    test('the calculation chain names the sheet ids the core writes', () => {
        const cs = kids(out.parts['/xl/calcChain.xml']).map(c => [c.attrs.r, c.attrs.i]);
        expect(cs).toEqual([['A2', '1'], ['B2', undefined], ['A1', '2']]);
    });
    test('each other part is written as read', () => {
        for (const n of ['/xl/externalLinks/externalLink1.xml', '/xl/xmlMaps.xml', '/xl/connections.xml', '/xl/queryTables/queryTable1.xml']) {
            expect(sameXml(out.parts[n], src.parts[n])).toBe(true);
        }
    });
    test('an entry whose cell no longer holds a formula is dropped', () => {
        const w = full.read(book()).workbook;
        w.sheets[0].rows[1][1] = 4;
        const cs = kids(opc.read(full.write(w)).parts['/xl/calcChain.xml']).map(c => [c.attrs.r, c.attrs.i]);
        expect(cs).toEqual([['A2', '1'], ['A1', '2']]);
    });
});

describe('smlPackageParts — a chain entry inside an array formula\'s range', () => {
    test('is kept: the range\'s cells belong to the formula', () => {
        const pkg = opc.read(core.write({ sheets: [{ name: 'S', rows: [
            [{ type: 'cell', formula: 'B1:B2*2', formulaType: 'array', formulaRef: 'A1:A2', value: 2, t: 'n' }], [4]] }] }));
        opc.setPart(pkg, '/xl/calcChain.xml', enc.encode(`<calcChain xmlns="${SS}"><c r="A1" i="1" a="1"/><c r="A2"/></calcChain>`), CTP + 'calcChain+xml');
        pkg.rels[WB].push({ Id: 'rIdC', Type: R + '/calcChain', Target: 'calcChain.xml' });
        const out = opc.read(full.write(full.read(opc.write(pkg)).workbook));
        expect(kids(out.parts['/xl/calcChain.xml']).map(c => c.attrs.r)).toEqual(['A1', 'A2']);
    });
});

describe('smlPackageParts — what stays unmodelled', () => {
    test('a part not written back as read', () => {
        const r = full.read(book({ connTail: '<extLst><ext uri="{X}"/></extLst>' }));
        expect(r.workbook.connections).toBeUndefined();
        expect(unmodelled(r)).toEqual(['/xl/connections.xml']);
    });
    test('xlsxLargeBundle reads as before', () => {
        const r = large.read(book());
        expect(r.workbook.calcChain).toBeUndefined();
        expect(unmodelled(r)).toContain('/xl/calcChain.xml');
        expect(unmodelled(r)).toContain('/xl/queryTables/queryTable1.xml');
    });
});

describe('the xlsx walker — package hooks', () => {
    test('hydratePackage gets the context; dehydratePackage the written package', () => {
        const api = resolveIn(ooxmlMods.xlsx, 'xlsx');
        const seen = {};
        api.use({
            hydratePackage(wb, ctx) {
                seen.sheetParts = ctx.sheetParts;
                seen.sheetIds = ctx.sheetIds;
                seen.tableParts = ctx.tableParts;
                seen.peek = !!ctx.parts['/xl/xmlMaps.xml'];
                ctx.consume('/xl/connections.xml');
            },
            dehydratePackage(wb, ctx) { seen.table = ctx.tablePartOf(wb.tables[0]); seen.written = !!ctx.package.parts[ctx.wbPart]; }
        });
        const r = api.read(book());
        expect(seen.sheetParts).toEqual(['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml']);
        expect(seen.sheetIds).toEqual(['3', '1']);
        expect(seen.tableParts).toEqual(['/xl/tables/table1.xml']);
        expect(seen.peek).toBe(true);
        expect(unmodelled(r)).toContain('/xl/xmlMaps.xml');
        expect(unmodelled(r)).not.toContain('/xl/connections.xml');
        api.write(r.workbook);
        expect(seen.table).toBe('/xl/tables/table1.xml');
        expect(seen.written).toBe(true);
    });
});
