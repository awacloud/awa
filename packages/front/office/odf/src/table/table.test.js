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
    });
});
