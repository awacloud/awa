// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `table:visibility` (ODF 1.3 §19.749: `visible` | `collapse` | `filter`) on
 * `<table:table-column>` and `<table:table-row>` reaches the typed model as
 * `visibility` and is written back — a hidden ODS column or row used to be
 * dropped on read, so a consumer could not leave it out and a read → write
 * made it visible again.
 */
import { describe, test, expect } from 'bun:test';
import { tableTable } from './table.js';
import { tableRow } from './row.js';
import { tableCell } from './cell.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

const xml = fwXml.factory();
const errors = odfErrors.factory();
const shared = odfShared.factory(errors, xml);
const cell = tableCell.factory(errors, shared, xml);
const row = tableRow.factory(errors, shared, xml, cell);
const t = tableTable.factory(xml, row);

const TABLE = '<table:table xmlns:table="t" xmlns:text="x" table:name="S">'
    + '<table:table-column table:visibility="collapse"/>'
    + '<table:table-column table:number-columns-repeated="2"/>'
    + '<table:table-column table:visibility="filter" table:style-name="co1"/>'
    + '<table:table-row table:visibility="collapse"><table:table-cell/></table:table-row>'
    + '<table:table-row><table:table-cell/></table:table-row>'
    + '<table:table-row table:visibility="visible"><table:table-cell/></table:table-row>'
    + '</table:table>';

describe('odf tables — table:visibility', () => {
    test('columns and rows keep their visibility; absent stays absent', () => {
        const model = t.parseTable(xml.parse(TABLE));
        expect(model.columns.map(c => c.visibility)).toEqual(['collapse', undefined, 'filter']);
        expect(model.rows.map(r => r.visibility)).toEqual(['collapse', undefined, 'visible']);
    });

    test('a read → write keeps every visibility attribute', () => {
        const out = xml.serialize(t.renderTable(t.parseTable(xml.parse(TABLE))));
        expect(out).toContain('<table:table-column table:visibility="collapse"/>');
        expect(out).toContain('table:style-name="co1" table:visibility="filter"');
        expect(out).toContain('<table:table-row table:visibility="collapse">');
        expect(out).toContain('<table:table-row table:visibility="visible">');
        expect(t.parseTable(xml.parse(out))).toEqual(t.parseTable(xml.parse(TABLE)));
    });

    test('a model built by hand: visibility on a repeated row', () => {
        const out = xml.serialize(row.renderRow({ type: 'row', repeated: 3, visibility: 'collapse', cells: [] }));
        expect(out).toContain('table:number-rows-repeated="3" table:visibility="collapse"');
    });
});
