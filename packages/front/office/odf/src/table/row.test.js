// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
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
    return { xml, errors, cell, r: tableRow.factory(errors, shared, xml, cell) };
}

describe('tableRow module', () => {
    test('factory shape', () => {
        expect(tableRow.name).toBe('tableRow');
        expect(tableRow.dependencies).toEqual(['odfErrors', 'odfShared', 'xml', 'tableCell']);
        expect(typeof tableRow.factory).toBe('function');
    });

    describe('parseRow', () => {
        test('rows with cells + style', () => {
            const { xml, r } = build();
            const el = xml.parse('<table:table-row table:style-name="ro1"><table:table-cell/><table:table-cell/></table:table-row>');
            const row = r.parseRow(el);
            expect(row.styleName).toBe('ro1');
            expect(row.cells).toHaveLength(2);
        });
        test('repeated', () => {
            const { xml, r } = build();
            const row = r.parseRow(xml.parse('<table:table-row table:number-rows-repeated="5"/>'));
            expect(row.repeated).toBe(5);
        });
    });

    describe('renderRow', () => {
        test('roundtrip', () => {
            const { xml, r } = build();
            const row = { type: 'row', styleName: 'r1', cells: [{ type: 'cell', children: [] }] };
            const out = xml.serialize(r.renderRow(row));
            expect(out).toContain('<table:table-row table:style-name="r1">');
            expect(out).toContain('<table:table-cell/>');
        });

        test('maxRepeat throws ParseError when rows-repeated overflows', () => {
            const { xml, r } = build();
            const el = xml.parse('<table:table-row table:number-rows-repeated="1000000"/>');
            let caught;
            try { r.parseRow(el, { maxRepeat: 65535 }); }
            catch (e) { caught = e; }
            expect(caught.code).toBe('odf/parse-error/limit');
        });

        test('maxRepeat propagates to cells', () => {
            const { xml, r } = build();
            const el = xml.parse('<table:table-row><table:table-cell table:number-columns-repeated="9999"/></table:table-row>');
            let caught;
            try { r.parseRow(el, { maxRepeat: 100 }); }
            catch (e) { caught = e; }
            expect(caught.code).toBe('odf/parse-error/limit');
        });
    });
});
