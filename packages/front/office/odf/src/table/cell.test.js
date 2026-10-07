// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCell } from './cell.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    return { xml, errors, shared, c: tableCell.factory(errors, shared, xml) };
}

describe('tableCell module', () => {
    test('factory shape', () => {
        expect(tableCell.name).toBe('tableCell');
        expect(tableCell.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
        expect(typeof tableCell.factory).toBe('function');
    });

    describe('parseCell', () => {
        test('typed value + style', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell table:style-name="ce1" office:value-type="float" office:value="42"><text:p>42</text:p></table:table-cell>');
            const cell = c.parseCell(el);
            expect(cell.type).toBe('cell');
            expect(cell.styleName).toBe('ce1');
            expect(cell.valueType).toBe('float');
            expect(cell.value).toBe('42');
            expect(cell.children).toHaveLength(1);
        });

        test('covered cell', () => {
            const { xml, c } = build();
            const cell = c.parseCell(xml.parse('<table:covered-table-cell/>'));
            expect(cell.covered).toBe(true);
        });

        test('spans + repeated', () => {
            const { xml, c } = build();
            const cell = c.parseCell(xml.parse('<table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="3" table:number-columns-repeated="4"/>'));
            expect(cell.colSpan).toBe(2);
            expect(cell.rowSpan).toBe(3);
            expect(cell.repeated).toBe(4);
        });
    });

    describe('renderCell', () => {
        test('roundtrip float value', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', valueType: 'float', value: '7', children: [] }));
            expect(out).toContain('office:value-type="float"');
            expect(out).toContain('office:value="7"');
        });
        test('roundtrip string value', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', valueType: 'string', value: 'hi', children: [] }));
            expect(out).toContain('office:string-value="hi"');
        });
        test('roundtrip covered', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', covered: true, children: [] }));
            expect(out).toContain('<table:covered-table-cell');
        });
    });

    describe('L2 typed values', () => {
        test('parse date cell', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell office:value-type="date" office:date-value="2026-05-13"/>');
            const cell = c.parseCell(el);
            expect(cell.valueType).toBe('date');
            expect(cell.value).toBe('2026-05-13');
        });

        test('parse time cell', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell office:value-type="time" office:time-value="PT10H30M"/>');
            const cell = c.parseCell(el);
            expect(cell.valueType).toBe('time');
            expect(cell.value).toBe('PT10H30M');
        });

        test('parse boolean cell', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell office:value-type="boolean" office:boolean-value="true"/>');
            const cell = c.parseCell(el);
            expect(cell.valueType).toBe('boolean');
            expect(cell.value).toBe('true');
        });

        test('parse currency cell with currency code', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell office:value-type="currency" office:value="12.50" office:currency="EUR"/>');
            const cell = c.parseCell(el);
            expect(cell.valueType).toBe('currency');
            expect(cell.value).toBe('12.50');
            expect(cell.currency).toBe('EUR');
        });

        test('parse percentage cell', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell office:value-type="percentage" office:value="0.25"/>');
            const cell = c.parseCell(el);
            expect(cell.valueType).toBe('percentage');
            expect(cell.value).toBe('0.25');
        });

        test('parse formula (of:= prefix preserved)', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell office:value-type="float" office:value="6" table:formula="of:=SUM(A1:A3)"/>');
            const cell = c.parseCell(el);
            expect(cell.formula).toBe('of:=SUM(A1:A3)');
            expect(cell.value).toBe('6');
        });

        test('render date cell', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', valueType: 'date', value: '2026-05-13', children: [] }));
            expect(out).toContain('office:value-type="date"');
            expect(out).toContain('office:date-value="2026-05-13"');
        });

        test('render time cell', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', valueType: 'time', value: 'PT01H00M00S', children: [] }));
            expect(out).toContain('office:time-value="PT01H00M00S"');
        });

        test('render currency cell', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', valueType: 'currency', value: '12.50', currency: 'EUR', children: [] }));
            expect(out).toContain('office:value-type="currency"');
            expect(out).toContain('office:value="12.50"');
            expect(out).toContain('office:currency="EUR"');
        });

        test('render formula cell', () => {
            const { xml, c } = build();
            const out = xml.serialize(c.renderCell({ type: 'cell', valueType: 'float', value: '6', formula: 'of:=SUM(A1:A3)', children: [] }));
            expect(out).toContain('table:formula="of:=SUM(A1:A3)"');
        });

        test('roundtrip percentage cell', () => {
            const { xml, c } = build();
            const original = { type: 'cell', valueType: 'percentage', value: '0.42', children: [] };
            const back = c.parseCell(xml.parse(xml.serialize(c.renderCell(original))));
            expect(back.valueType).toBe('percentage');
            expect(back.value).toBe('0.42');
        });
    });

    describe('maxRepeat option', () => {
        test('throws ParseError when repeated exceeds maxRepeat', () => {
            const { xml, c } = build();
            const el = xml.parse('<table:table-cell table:number-columns-repeated="1000000"/>');
            let caught;
            try { c.parseCell(el, { maxRepeat: 65535 }); }
            catch (e) { caught = e; }
            expect(caught).toBeDefined();
            expect(caught.code).toBe('odf/parse-error/limit');
            expect(caught.context.value).toBe(1000000);
            expect(caught.context.max).toBe(65535);
        });

        test('respects threshold and preserves below it', () => {
            const { xml, c } = build();
            const cell = c.parseCell(xml.parse('<table:table-cell table:number-columns-repeated="10"/>'),
                { maxRepeat: 100 });
            expect(cell.repeated).toBe(10);
        });

        test('default unbounded preserves large values', () => {
            const { xml, c } = build();
            const cell = c.parseCell(xml.parse('<table:table-cell table:number-columns-repeated="1000000"/>'));
            expect(cell.repeated).toBe(1000000);
        });
    });
});
