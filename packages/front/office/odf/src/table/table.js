// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<table:table>` — orchestrator for cells/rows.
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'table',
 *   name?, styleName?,
 *   columns: [ { styleName?, defaultCellStyleName?, repeated?, visibility? } ],
 *   headerRows?: integer,        // number of header rows (count of children
 *                                //   under <table:table-header-rows>)
 *   rows: [ ...rowModel ],
 *   _softPageBreaks?: integer[], // internal: the index in `rows` of the row
 *                                //   each <text:soft-page-break> read precedes
 *   _extras?
 * }
 * ```
 *
 * @module odf/table/table
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { tableRow } from './row.js';

export const tableTable = {
    name: 'tableTable',
    dependencies: ['xml', 'tableRow'],
    deps: [xml, tableRow],

    factory(xml, rowMod) {
        // The extras that hold rows: a table with one of them needs no
        // added row.
        const ROW_GROUPS = new Set(['table:table-row-group', 'table:table-rows']);
        const SOFT_BREAK = 'text:soft-page-break';

        function parseColumn(el) {
            const out = {};
            const a = el.attrs || {};
            if (a['table:style-name'])              out.styleName = a['table:style-name'];
            if (a['table:default-cell-style-name']) out.defaultCellStyleName = a['table:default-cell-style-name'];
            const r = parseInt(a['table:number-columns-repeated'], 10);
            if (Number.isFinite(r) && r > 1) out.repeated = r;
            if (a['table:visibility'])              out.visibility = a['table:visibility'];
            return out;
        }

        function renderColumn(col) {
            const a = {};
            if (col.styleName)            a['table:style-name'] = col.styleName;
            if (col.defaultCellStyleName) a['table:default-cell-style-name'] = col.defaultCellStyleName;
            if (col.repeated && col.repeated > 1)
                a['table:number-columns-repeated'] = String(col.repeated);
            if (col.visibility)           a['table:visibility'] = col.visibility;
            return xml.el('table:table-column', a, []);
        }

        /**
         * Parse a `<table:table>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseTable(el) {
            const out = { type: 'table', columns: [], rows: [] };
            const a = el.attrs || {};
            if (a['table:name'])       out.name = a['table:name'];
            if (a['table:style-name']) out.styleName = a['table:style-name'];
            const extras = [];
            let headerRows = 0;
            // A soft page break goes before the row that follows it (the
            // only place the schema allows one); until a row follows, it
            // is an extra, as read.
            const breaks = [];
            let pending = [];
            const pushRow = (rowEl) => {
                for (const b of pending) {
                    if (b.inExtras) extras.splice(extras.indexOf(b.el), 1);
                    breaks.push(out.rows.length);
                }
                pending = [];
                out.rows.push(rowMod.parseRow(rowEl));
            };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'table:table-column':
                        out.columns.push(parseColumn(c));
                        pending = [];
                        break;
                    case 'table:table-row':
                        pushRow(c);
                        break;
                    case 'table:table-header-rows':
                        for (const k of c.children || []) {
                            if (k.type !== 'element') continue;
                            if (k.name === 'table:table-row') {
                                pushRow(k);
                                headerRows++;
                            } else if (k.name === SOFT_BREAK) {
                                pending.push({ el: k, inExtras: false });
                            }
                        }
                        break;
                    case SOFT_BREAK:
                        extras.push(c);
                        pending.push({ el: c, inExtras: true });
                        break;
                    default:
                        extras.push(c);
                        pending = [];
                }
            }
            if (headerRows > 0) out.headerRows = headerRows;
            if (breaks.length) out._softPageBreaks = breaks;
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * The number of columns the rows use: each cell counts its
         * `repeated`, and a `colSpan` reaching past the last cell counts
         * too. At least 1.
         *
         * @param {object[]} rows
         * @returns {number}
         */
        function widthOf(rows) {
            let width = 1;
            for (const r of rows) {
                let pos = 0;
                for (const c of (r && r.cells) || []) {
                    const rep = c.repeated > 1 ? c.repeated : 1;
                    const span = c.colSpan > 1 ? c.colSpan : 1;
                    width = Math.max(width, pos + rep - 1 + span);
                    pos += rep;
                }
            }
            return width;
        }

        /**
         * Render a table model to a `<table:table>` element node. A model
         * with no column is written with one `<table:table-column>`
         * repeated to the rows' width: the schema needs a column before
         * the rows. A model that would write no row (none in `rows`, no
         * row group among its extras) is written with one row of one
         * empty cell: the schema needs a row too. Each `_softPageBreaks`
         * entry writes a `<text:soft-page-break>` before the row of that
         * index, none for a row the model no longer has.
         *
         * @param {object} t
         * @returns {object}
         */
        function renderTable(t) {
            const attrs = {};
            if (t.name)      attrs['table:name'] = t.name;
            if (t.styleName) attrs['table:style-name'] = t.styleName;
            const children = [];
            const extras = (t._extras && t._extras.children) || [];
            let rows = t.rows || [];
            const headerN = Math.min(t.headerRows || 0, rows.length);
            if (!rows.length && !extras.some(c => c && ROW_GROUPS.has(c.name))) {
                rows = [{ type: 'row', cells: [] }];
            }
            const columns = t.columns && t.columns.length ? t.columns : [{ repeated: widthOf(rows) }];
            for (const col of columns) children.push(renderColumn(col));
            const breaksBefore = new Map();
            for (const i of t._softPageBreaks || []) breaksBefore.set(i, (breaksBefore.get(i) || 0) + 1);
            const pushRows = (into, from, to) => {
                for (let i = from; i < to; i++) {
                    for (let n = breaksBefore.get(i) || 0; n > 0; n--) into.push(xml.el(SOFT_BREAK, {}, []));
                    into.push(rowMod.renderRow(rows[i]));
                }
            };
            if (headerN > 0) {
                const headerKids = [];
                pushRows(headerKids, 0, headerN);
                children.push(xml.el('table:table-header-rows', {}, headerKids));
            }
            pushRows(children, headerN, rows.length);
            if (t._extras && t._extras.children) {
                for (const c of t._extras.children) children.push(c);
            }
            return xml.el('table:table', attrs, children);
        }

        return { parseTable, renderTable };
    }
};
