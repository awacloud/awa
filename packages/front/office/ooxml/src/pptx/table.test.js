// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingml } from '../drawingml/drawingml.js';
import { pptxTable } from './table.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const dml = drawingml.factory(xml, null, _shared);
const tbl = pptxTable.factory(xml, dml, _shared);

describe('pptxTable — basic', () => {
    test('tableFromRows builds a typed table', () => {
        const t = tbl.tableFromRows([
            ['Name', 'Age'],
            ['Alice', '30'],
            ['Bob', '25']
        ]);
        expect(t.type).toBe('table');
        expect(t.columns).toHaveLength(2);
        expect(t.rows).toHaveLength(3);
        expect(t.rows[0].cells[0].txBody.paragraphs[0].runs[0].value)
            .toBe('Name');
        expect(t.flags.firstRow).toBe(true);
    });

    test('renderGraphicFrame + parseGraphicFrame roundtrip', () => {
        const t = tbl.tableFromRows([
            ['A', 'B'],
            ['1', '2']
        ], { cx: 4000000, cy: 800000, offsetX: 100000, offsetY: 200000,
             tableStyleId: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}' });
        const gf = tbl.renderGraphicFrame(t);
        const back = tbl.parseGraphicFrame(gf);
        expect(back).toBeDefined();
        expect(back.type).toBe('table');
        expect(back.cx).toBe(4000000);
        expect(back.cy).toBe(800000);
        expect(back.offsetX).toBe(100000);
        expect(back.offsetY).toBe(200000);
        expect(back.tableStyleId).toBe('{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}');
        expect(back.columns).toHaveLength(2);
        expect(back.rows).toHaveLength(2);
        expect(back.rows[0].cells[0].txBody.paragraphs[0].runs[0].value).toBe('A');
        expect(back.rows[1].cells[1].txBody.paragraphs[0].runs[0].value).toBe('2');
    });

    test('cell with rich text + run properties roundtrips', () => {
        const t = {
            type: 'table',
            cx: 3000000, cy: 500000,
            columns: [{ width: 3000000 }],
            rows: [{
                height: 370840,
                cells: [{
                    txBody: {
                        paragraphs: [{
                            pPr: { align: 'ctr' },
                            runs: [{
                                type: 'text', value: 'Bold Cell',
                                rPr: { bold: true, size: 1800, color: 'FF0000' }
                            }]
                        }]
                    }
                }]
            }]
        };
        const back = tbl.parseGraphicFrame(tbl.renderGraphicFrame(t));
        const r = back.rows[0].cells[0].txBody.paragraphs[0].runs[0];
        expect(r.rPr.bold).toBe(true);
        expect(r.rPr.size).toBe(1800);
        expect(r.rPr.color).toBe('FF0000');
        expect(back.rows[0].cells[0].txBody.paragraphs[0].pPr.align).toBe('ctr');
    });

    test('gridSpan + vMerge attrs roundtrip', () => {
        const t = {
            type: 'table',
            cx: 6000000, cy: 800000,
            columns: [{ width: 2000000 }, { width: 2000000 }, { width: 2000000 }],
            rows: [{
                height: 400000,
                cells: [
                    { gridSpan: 2, txBody: dml.textBodyFromString('Wide') },
                    { hMerge: true, txBody: dml.textBodyFromString('') },
                    { txBody: dml.textBodyFromString('C') }
                ]
            }]
        };
        const back = tbl.parseGraphicFrame(tbl.renderGraphicFrame(t));
        expect(back.rows[0].cells[0].gridSpan).toBe(2);
        expect(back.rows[0].cells[1].hMerge).toBe(true);
    });

    test('parseGraphicFrame returns null for non-table graphicData', () => {
        const fakeChart = xml.parse(
            '<p:graphicFrame'
            + ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
            + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            + '<a:graphic><a:graphicData uri="http://example.com/chart">'
            + '<chart/></a:graphicData></a:graphic>'
            + '</p:graphicFrame>');
        expect(tbl.parseGraphicFrame(fakeChart)).toBeNull();
    });
});
