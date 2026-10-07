// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<table:table-row>`.
 *
 * Model: `{ type: 'row', styleName?, repeated?, cells: [...], _extras? }`.
 *
 * @module odf/table/row
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { tableCell } from './cell.js';

export const tableRow = {
    name: 'tableRow',
    dependencies: ['odfErrors', 'odfShared', 'xml', 'tableCell'],
    deps: [odfErrors, odfShared, xml, tableCell],

    factory(errors, shared, xml, cellMod) {
        const { ParseError } = errors;
        void shared;

        /**
         * Parse a `<table:table-row>`.
         *
         * @param {object} el
         * @param {object} [opts] — `{ maxRepeat?: number }`. When set,
         *   bounds-check `table:number-rows-repeated` and propagate to
         *   `cellMod.parseCell` for cell-level
         *   `table:number-columns-repeated`. Raises
         *   `ParseError('odf/parse-error/limit', ...)` on overflow.
         * @returns {object}
         */
        function parseRow(el, opts) {
            const out = { type: 'row', cells: [] };
            const attrs = el.attrs || {};
            if (attrs['table:style-name']) out.styleName = attrs['table:style-name'];
            const r = parseInt(attrs['table:number-rows-repeated'], 10);
            if (Number.isFinite(r) && r > 1) {
                const max = opts && Number.isFinite(opts.maxRepeat) ? opts.maxRepeat : null;
                if (max != null && r > max) {
                    throw new ParseError('odf/parse-error/limit',
                        `row: number-rows-repeated ${r} exceeds max ${max}`,
                        { context: { module: 'tableRow', value: r, max } });
                }
                out.repeated = r;
            }
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'table:table-cell' || c.name === 'table:covered-table-cell') {
                    out.cells.push(cellMod.parseCell(c, opts));
                }
            }
            return out;
        }

        /**
         * Render a row model to a `<table:table-row>` element node.
         *
         * @param {object} row
         * @returns {object}
         */
        function renderRow(row) {
            const attrs = {};
            if (row.styleName) attrs['table:style-name'] = row.styleName;
            if (row.repeated && row.repeated > 1) attrs['table:number-rows-repeated'] = String(row.repeated);
            const children = (row.cells || []).map(c => cellMod.renderCell(c));
            return xml.el('table:table-row', attrs, children);
        }

        return { parseRow, renderRow };
    }
};
