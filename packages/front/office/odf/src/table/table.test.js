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

        test('a table without rows is written with one row of one empty cell (the schema needs a row); the model is not changed', () => {
            const { xml, t } = build();
            const m = { type: 'table', name: 'Empty', columns: [], rows: [] };
            const before = JSON.stringify(m);
            expect(xml.serialize(t.renderTable(m))).toContain('<table:table table:name="Empty"><table:table-column/><table:table-row><table:table-cell/></table:table-row></table:table>');
            expect(JSON.stringify(m)).toBe(before);
            expect(t.renderTable({ type: 'table' }).children.map((c) => c.name)).toEqual(['table:table-column', 'table:table-row']);
        });

        test('a row group among the extras holds the rows: no row is added', () => {
            const { xml, t } = build();
            const group = xml.parse('<table:table-row-group><table:table-row><table:table-cell/></table:table-row></table:table-row-group>');
            const node = t.renderTable({ type: 'table', rows: [], _extras: { children: [group] } });
            expect(node.children.map((c) => c.name)).toEqual(['table:table-column', 'table:table-row-group']);
        });

        test('header rows beyond the rows: no empty header-rows wrapper', () => {
            const { t } = build();
            const none = t.renderTable({ type: 'table', headerRows: 2, rows: [] });
            expect(none.children.map((c) => c.name)).toEqual(['table:table-column', 'table:table-row']);
            const one = t.renderTable({ type: 'table', headerRows: 2, rows: [{ type: 'row', cells: cellsOf({}) }] });
            expect(one.children.map((c) => c.name)).toEqual(['table:table-column', 'table:table-header-rows']);
        });

        test('columns in the model are written as given', () => {
            const { xml, t } = build();
            const m = { type: 'table', columns: [{ styleName: 'co1' }, { repeated: 2 }], rows: [{ type: 'row', cells: cellsOf({ repeated: 9 }) }] };
            expect(xml.serialize(t.renderTable(m))).toContain('<table:table><table:table-column table:style-name="co1"/><table:table-column table:number-columns-repeated="2"/><table:table-row>');
        });
    });

    // A34c: the schema allows a text:soft-page-break before a row only.
    describe('soft page breaks between rows', () => {
        const ROW = (v) => `<table:table-row><table:table-cell><text:p>${v}</text:p></table:table-cell></table:table-row>`;
        const BR = '<text:soft-page-break/>';
        const tags = (xml, el) => el.children.filter((c) => c.type === 'element').map((c) => c.name === 'table:table-row'
            ? 'row:' + xml.serialize(c).replace(/<[^>]+>/g, '').trim() : c.name);

        test('a break read before a row is written back before that row', () => {
            const { xml, t } = build();
            const m = t.parseTable(xml.parse(`<table:table><table:table-column/>${ROW('a')}${BR}${ROW('b')}${BR}${ROW('c')}</table:table>`));
            expect(m.rows).toHaveLength(3);
            expect(m._extras).toBeUndefined();
            expect(tags(xml, t.renderTable(m))).toEqual(['table:table-column', 'row:a', 'text:soft-page-break', 'row:b', 'text:soft-page-break', 'row:c']);
        });

        test('a break before the first row and one before the second', () => {
            const { xml, t } = build();
            const m = t.parseTable(xml.parse(`<table:table><table:table-column/>${BR}${ROW('h')}${BR}${ROW('a')}</table:table>`));
            expect(tags(xml, t.renderTable(m))).toEqual(['table:table-column', 'text:soft-page-break', 'row:h', 'text:soft-page-break', 'row:a']);
        });

        test('a break whose row is gone is not written; one after the last row stays last, as read', () => {
            const { xml, t } = build();
            const m = t.parseTable(xml.parse(`<table:table><table:table-column/>${ROW('a')}${BR}${ROW('b')}</table:table>`));
            m.rows.pop();
            expect(tags(xml, t.renderTable(m))).toEqual(['table:table-column', 'row:a']);
            const last = t.parseTable(xml.parse(`<table:table><table:table-column/>${ROW('a')}${BR}</table:table>`));
            expect(tags(xml, t.renderTable(last))).toEqual(['table:table-column', 'row:a', 'text:soft-page-break']);
        });
    });
});
