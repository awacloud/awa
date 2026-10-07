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
 *   columns: [ { styleName?, defaultCellStyleName?, repeated? } ],
 *   headerRows?: integer,        // number of header rows (count of children
 *                                //   under <table:table-header-rows>)
 *   rows: [ ...rowModel ],
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

        function parseColumn(el) {
            const out = {};
            const a = el.attrs || {};
            if (a['table:style-name'])              out.styleName = a['table:style-name'];
            if (a['table:default-cell-style-name']) out.defaultCellStyleName = a['table:default-cell-style-name'];
            const r = parseInt(a['table:number-columns-repeated'], 10);
            if (Number.isFinite(r) && r > 1) out.repeated = r;
            return out;
        }

        function renderColumn(col) {
            const a = {};
            if (col.styleName)            a['table:style-name'] = col.styleName;
            if (col.defaultCellStyleName) a['table:default-cell-style-name'] = col.defaultCellStyleName;
            if (col.repeated && col.repeated > 1)
                a['table:number-columns-repeated'] = String(col.repeated);
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
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'table:table-column':
                        out.columns.push(parseColumn(c));
                        break;
                    case 'table:table-row':
                        out.rows.push(rowMod.parseRow(c));
                        break;
                    case 'table:table-header-rows':
                        for (const k of c.children || []) {
                            if (k.type === 'element' && k.name === 'table:table-row') {
                                out.rows.push(rowMod.parseRow(k));
                                headerRows++;
                            }
                        }
                        break;
                    default:
                        extras.push(c);
                }
            }
            if (headerRows > 0) out.headerRows = headerRows;
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * Render a table model to a `<table:table>` element node.
         *
         * @param {object} t
         * @returns {object}
         */
        function renderTable(t) {
            const attrs = {};
            if (t.name)      attrs['table:name'] = t.name;
            if (t.styleName) attrs['table:style-name'] = t.styleName;
            const children = [];
            for (const col of t.columns || []) children.push(renderColumn(col));
            const headerN = t.headerRows || 0;
            const rows = t.rows || [];
            if (headerN > 0) {
                const headerKids = rows.slice(0, headerN).map(r => rowMod.renderRow(r));
                children.push(xml.el('table:table-header-rows', {}, headerKids));
                for (const r of rows.slice(headerN)) children.push(rowMod.renderRow(r));
            } else {
                for (const r of rows) children.push(rowMod.renderRow(r));
            }
            if (t._extras && t._extras.children) {
                for (const c of t._extras.children) children.push(c);
            }
            return xml.el('table:table', attrs, children);
        }

        return { parseTable, renderTable };
    }
};
