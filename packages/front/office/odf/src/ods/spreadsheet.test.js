// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { spreadsheet } from './spreadsheet.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { tableCell } from '../table/cell.js';
import { tableRow } from '../table/row.js';
import { tableTable } from '../table/table.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';

function build() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);
    return { xml, s: spreadsheet.factory(xml, table) };
}

describe('spreadsheet module', () => {
    test('factory shape', () => {
        expect(spreadsheet.name).toBe('spreadsheet');
        expect(spreadsheet.dependencies).toEqual(['xml', 'tableTable']);
        expect(typeof spreadsheet.factory).toBe('function');
    });

    describe('parseSpreadsheet', () => {
        test('collects tables', () => {
            const { xml, s } = build();
            const el = xml.parse('<office:spreadsheet><table:table table:name="A"/><table:table table:name="B"/></office:spreadsheet>');
            const out = s.parseSpreadsheet(el);
            expect(out.tables).toHaveLength(2);
            expect(out.tables[0].name).toBe('A');
            expect(out.tables[1].name).toBe('B');
        });

        test('preserves named-expressions as raw', () => {
            const { xml, s } = build();
            const el = xml.parse('<office:spreadsheet><table:named-expressions><table:named-range table:name="N"/></table:named-expressions></office:spreadsheet>');
            const out = s.parseSpreadsheet(el);
            expect(out.namedExpressions).toHaveLength(1);
        });

        test('preserves content-validations as raw', () => {
            const { xml, s } = build();
            const el = xml.parse('<office:spreadsheet><table:content-validations><table:content-validation table:name="V"/></table:content-validations></office:spreadsheet>');
            const out = s.parseSpreadsheet(el);
            expect(out.dataValidations).toHaveLength(1);
        });

        test('stores unknown children in _extras', () => {
            const { xml, s } = build();
            const el = xml.parse('<office:spreadsheet><foo:bar/></office:spreadsheet>');
            const out = s.parseSpreadsheet(el);
            expect(out._extras.children).toHaveLength(1);
        });
    });

    describe('renderSpreadsheet', () => {
        test('renders tables', () => {
            const { xml, s } = build();
            const out = xml.serialize(s.renderSpreadsheet({
                tables: [{ type: 'table', name: 'Sheet1', columns: [], rows: [] }]
            }));
            expect(out).toContain('<office:spreadsheet');
            expect(out).toContain('table:name="Sheet1"');
        });

        test('roundtrips named-expressions', () => {
            const { xml, s } = build();
            const orig = xml.parse('<office:spreadsheet><table:named-expressions><table:named-range table:name="N"/></table:named-expressions><table:table table:name="S"/></office:spreadsheet>');
            const model = s.parseSpreadsheet(orig);
            const back = s.parseSpreadsheet(xml.parse(xml.serialize(s.renderSpreadsheet(model))));
            expect(back.tables).toHaveLength(1);
            expect(back.namedExpressions).toHaveLength(1);
        });
    });

    test('empty', () => {
        const { s } = build();
        expect(s.empty()).toEqual({ tables: [] });
    });
});
