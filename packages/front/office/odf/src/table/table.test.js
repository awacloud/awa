// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableTable } from './table.js';
import { tableRow } from './row.js';
import { tableCell } from './cell.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const t = tableTable.factory(xml, row);
    return { xml, t };
}

describe('tableTable module', () => {
    test('factory shape', () => {
        expect(tableTable.name).toBe('tableTable');
        expect(tableTable.dependencies).toEqual(['xml', 'tableRow']);
        expect(typeof tableTable.factory).toBe('function');
    });

    describe('parseTable', () => {
        test('columns + rows + name', () => {
            const { xml, t } = build();
            const el = xml.parse('<table:table table:name="T1"><table:table-column table:style-name="co1"/><table:table-row><table:table-cell/></table:table-row></table:table>');
            const m = t.parseTable(el);
            expect(m.name).toBe('T1');
            expect(m.columns).toHaveLength(1);
            expect(m.rows).toHaveLength(1);
        });

        test('header rows promoted', () => {
            const { xml, t } = build();
            const el = xml.parse('<table:table><table:table-header-rows><table:table-row><table:table-cell/></table:table-row></table:table-header-rows><table:table-row><table:table-cell/></table:table-row></table:table>');
            const m = t.parseTable(el);
            expect(m.headerRows).toBe(1);
            expect(m.rows).toHaveLength(2);
        });
    });

    describe('renderTable', () => {
        test('roundtrip', () => {
            const { xml, t } = build();
            const m = {
                type: 'table', name: 'T1',
                columns: [{ styleName: 'co1' }],
                headerRows: 1,
                rows: [
                    { type: 'row', cells: [{ type: 'cell', children: [] }] },
                    { type: 'row', cells: [{ type: 'cell', children: [] }] }
                ]
            };
            const out = xml.serialize(t.renderTable(m));
            expect(out).toContain('<table:table table:name="T1">');
            expect(out).toContain('<table:table-header-rows>');
            expect(out).toContain('<table:table-column');
            // Parse back
            const back = t.parseTable(xml.parse(out.replace(/^<\?xml[^?]*\?>\r?\n/, '')));
            expect(back.headerRows).toBe(1);
            expect(back.rows).toHaveLength(2);
            expect(back.columns).toHaveLength(1);
        });

        const cellsOf = (...specs) => specs.map((s) => ({ type: 'cell', children: [], ...s }));
        const columnsOf = (node) => node.children.filter((c) => c.name === 'table:table-column');

        test('no column in the model: one column repeated to the widest row, before the rows (schema)', () => {
            const { xml, t } = build();
            const m = {
                type: 'table', name: 'S', columns: [], headerRows: 1,
                rows: [
                    { type: 'row', cells: cellsOf({}, {}) },
                    { type: 'row', cells: cellsOf({ repeated: 3 }, {}) },
                    { type: 'row', cells: cellsOf({}) }
                ]
            };
            const before = JSON.stringify(m);
            const node = t.renderTable(m);
            expect(node.children.map((c) => c.name)).toEqual(['table:table-column', 'table:table-header-rows', 'table:table-row', 'table:table-row']);
            expect(columnsOf(node)[0].attrs).toEqual({ 'table:number-columns-repeated': '4' });
            expect(JSON.stringify(m)).toBe(before);
            const back = t.parseTable(xml.parse(xml.serialize(node).replace(/^<\?xml[^?]*\?>\r?\n/, '')));
            expect(back.columns).toEqual([{ repeated: 4 }]);
        });

        test('the width counts a span reaching past the last cell; width 1 writes no repeat; no cell gives width 1', () => {
            const { t } = build();
            const span = t.renderTable({ type: 'table', rows: [{ type: 'row', cells: cellsOf({}, { colSpan: 3 }) }] });
            expect(columnsOf(span)[0].attrs).toEqual({ 'table:number-columns-repeated': '4' });
            const one = t.renderTable({ type: 'table', rows: [{ type: 'row', cells: cellsOf({}) }] });
            expect(columnsOf(one).map((c) => c.attrs)).toEqual([{}]);
            const none = t.renderTable({ type: 'table', columns: [], rows: [] });
            expect(columnsOf(none).map((c) => c.attrs)).toEqual([{}]);
        });

        test('columns in the model are written as given', () => {
            const { xml, t } = build();
            const m = { type: 'table', columns: [{ styleName: 'co1' }, { repeated: 2 }], rows: [{ type: 'row', cells: cellsOf({ repeated: 9 }) }] };
            expect(xml.serialize(t.renderTable(m))).toContain('<table:table><table:table-column table:style-name="co1"/><table:table-column table:number-columns-repeated="2"/><table:table-row>');
        });
    });
});
