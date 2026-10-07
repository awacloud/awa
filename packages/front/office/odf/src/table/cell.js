// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<table:table-cell>` and
 * `<table:covered-table-cell>`.
 *
 * Model:
 *
 * ```js
 * {
 *   type: 'cell',
 *   covered?: boolean,           // true for <table:covered-table-cell>
 *   styleName?,
 *   valueType?,                  // 'string' | 'float' | 'percentage' |
 *                                //   'currency' | 'date' | 'time' |
 *                                //   'boolean'
 *   value?,                      // typed value as string (raw attr) —
 *                                //   for float/percentage/currency this
 *                                //   maps office:value, otherwise the
 *                                //   per-type attribute (date-value, …).
 *   currency?,                   // office:currency (ISO code) when
 *                                //   valueType === 'currency'
 *   formula?,                    // table:formula (full string incl.
 *                                //   `of:=…` namespace prefix)
 *   repeated?: integer,          // table:number-columns-repeated
 *   colSpan?: integer,           // table:number-columns-spanned
 *   rowSpan?: integer,           // table:number-rows-spanned
 *   children: [ ...rawXmlNodes ],
 *   _extras?
 * }
 * ```
 *
 * The cell `children` array carries raw XML element nodes for the
 * actual content (paragraphs etc.). Higher layers may interpret these
 * via `textContent`. The value attributes (`valueType`, `value`,
 * `currency`, `formula`) are typed by this module.
 *
 * @module odf/table/cell
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const tableCell = {
    name: 'tableCell',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        const { ParseError } = errors;
        const { intAttr } = shared;

        /**
         * Parse a `<table:table-cell>` or `<table:covered-table-cell>`.
         *
         * @param {object} el
         * @param {object} [opts] — `{ maxRepeat?: number }`. When set, a
         *   `table:number-columns-repeated` greater than `maxRepeat`
         *   raises `ParseError('odf/parse-error/limit', ...)` instead
         *   of being preserved silently. Default: unbounded (preserve).
         * @returns {object}
         */
        function parseCell(el, opts) {
            const out = { type: 'cell', children: [] };
            if (el.name === 'table:covered-table-cell') out.covered = true;
            const attrs = el.attrs || {};
            if (attrs['table:style-name'])               out.styleName = attrs['table:style-name'];
            if (attrs['office:value-type'])              out.valueType = attrs['office:value-type'];
            // Prefer the per-type attribute matching valueType when present
            const vt = out.valueType;
            if (vt === 'date' && attrs['office:date-value'] != null) {
                out.value = attrs['office:date-value'];
            } else if (vt === 'time' && attrs['office:time-value'] != null) {
                out.value = attrs['office:time-value'];
            } else if (vt === 'boolean' && attrs['office:boolean-value'] != null) {
                out.value = attrs['office:boolean-value'];
            } else if (vt === 'string' && attrs['office:string-value'] != null) {
                out.value = attrs['office:string-value'];
            } else if (attrs['office:value'] != null) {
                out.value = attrs['office:value'];
            } else if (attrs['office:string-value'] != null) {
                out.value = attrs['office:string-value'];
            } else if (attrs['office:date-value'] != null) {
                out.value = attrs['office:date-value'];
            } else if (attrs['office:time-value'] != null) {
                out.value = attrs['office:time-value'];
            } else if (attrs['office:boolean-value'] != null) {
                out.value = attrs['office:boolean-value'];
            }
            if (attrs['office:currency'])                out.currency = attrs['office:currency'];
            if (attrs['table:formula'])                  out.formula = attrs['table:formula'];
            const repeated = intAttr(el, 'table:number-columns-repeated');
            if (repeated && repeated > 1) {
                const max = opts && Number.isFinite(opts.maxRepeat) ? opts.maxRepeat : null;
                if (max != null && repeated > max) {
                    throw new ParseError('odf/parse-error/limit',
                        `cell: number-columns-repeated ${repeated} exceeds max ${max}`,
                        { context: { module: 'tableCell', value: repeated, max } });
                }
                out.repeated = repeated;
            }
            const colSpan = intAttr(el, 'table:number-columns-spanned');
            if (colSpan && colSpan > 1) out.colSpan = colSpan;
            const rowSpan = intAttr(el, 'table:number-rows-spanned');
            if (rowSpan && rowSpan > 1) out.rowSpan = rowSpan;
            // Preserve other attrs
            const known = new Set([
                'table:style-name', 'office:value-type', 'office:value',
                'office:string-value', 'office:date-value', 'office:time-value',
                'office:boolean-value', 'office:currency',
                'table:formula', 'table:number-columns-repeated',
                'table:number-columns-spanned', 'table:number-rows-spanned'
            ]);
            const xtraAttrs = {};
            let anyAttr = false;
            for (const k of Object.keys(attrs)) {
                if (!known.has(k)) { xtraAttrs[k] = attrs[k]; anyAttr = true; }
            }
            for (const c of el.children || []) {
                if (c.type === 'element') out.children.push(c);
            }
            if (anyAttr) out._extras = { attrs: xtraAttrs };
            return out;
        }

        /**
         * Render a cell model to a `<table:table-cell>` element node.
         *
         * @param {object} cell
         * @returns {object}
         */
        function renderCell(cell) {
            const attrs = {};
            if (cell.styleName) attrs['table:style-name'] = cell.styleName;
            if (cell.valueType) attrs['office:value-type'] = cell.valueType;
            if (cell.value != null) {
                const kind = cell.valueType;
                if (kind === 'string')        attrs['office:string-value'] = cell.value;
                else if (kind === 'date')     attrs['office:date-value']   = cell.value;
                else if (kind === 'time')     attrs['office:time-value']   = cell.value;
                else if (kind === 'boolean')  attrs['office:boolean-value'] = cell.value;
                else                          attrs['office:value']         = cell.value;
            }
            if (cell.currency) attrs['office:currency'] = cell.currency;
            if (cell.formula)  attrs['table:formula'] = cell.formula;
            if (cell.repeated && cell.repeated > 1)
                attrs['table:number-columns-repeated'] = String(cell.repeated);
            if (cell.colSpan && cell.colSpan > 1)
                attrs['table:number-columns-spanned'] = String(cell.colSpan);
            if (cell.rowSpan && cell.rowSpan > 1)
                attrs['table:number-rows-spanned'] = String(cell.rowSpan);
            if (cell._extras && cell._extras.attrs) {
                for (const k of Object.keys(cell._extras.attrs)) attrs[k] = cell._extras.attrs[k];
            }
            const tag = cell.covered ? 'table:covered-table-cell' : 'table:table-cell';
            return xml.el(tag, attrs, (cell.children || []).slice());
        }

        return { parseCell, renderCell };
    }
};
