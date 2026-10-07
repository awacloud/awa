// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML tables — `xl/tables/table*.xml`
 * (ECMA-376 part 1 §18.5).
 *
 * An Excel "table" (formerly "list") is a structured rectangular range
 * with a header row, optional totals row, and a named columns. Each
 * table is a separate XML part referenced from a worksheet via a
 * relationship of type `…/relationships/table` and listed in the
 * worksheet's `<tableParts>` element.
 *
 * Document model :
 *
 * ```js
 * {
 *   id: number,
 *   name: string,        // unique within the workbook (e.g. "Table1")
 *   displayName: string, // shown in the UI
 *   ref: string,         // 'A1:D10'
 *   headerRowCount?: number,    // 0 or 1
 *   totalsRowCount?: number,    // 0 or 1
 *   totalsRowShown?: boolean,
 *   columns: [{ id, name, totalsRowLabel?, totalsRowFunction?, _extras? }],
 *   tableStyleInfo?: {
 *     name?, showFirstColumn?, showLastColumn?,
 *     showRowStripes?, showColumnStripes?
 *   },
 *   autoFilter?: { ref },
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/xlsx/tables
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsxTables = {
    name: 'xlsxTables',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared;

        const SS_NS = NS.SS;
        const REL_TYPE_TABLE = REL_TYPE.TABLE;
        const CT_TABLE = CT.TABLE;

        function parseColumn(cEl) {
            const out = {
                id: Number(cEl.attrs.id),
                name: cEl.attrs.name
            };
            if (cEl.attrs.totalsRowLabel)    out.totalsRowLabel = cEl.attrs.totalsRowLabel;
            if (cEl.attrs.totalsRowFunction) out.totalsRowFunction = cEl.attrs.totalsRowFunction;
            const extras = cEl.children.filter(n => n.type === 'element');
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderColumn(c) {
            const a = { id: String(c.id), name: c.name };
            if (c.totalsRowLabel)    a.totalsRowLabel = c.totalsRowLabel;
            if (c.totalsRowFunction) a.totalsRowFunction = c.totalsRowFunction;
            return xml.el('tableColumn', a, c._extras || []);
        }

        function parseTableStyleInfo(el) {
            const out = {};
            if (el.attrs.name) out.name = el.attrs.name;
            for (const k of ['showFirstColumn', 'showLastColumn',
                              'showRowStripes', 'showColumnStripes']) {
                if (el.attrs[k] != null) out[k] = readBoolAttr(el.attrs[k]);
            }
            return out;
        }

        function renderTableStyleInfo(s) {
            const a = {};
            if (s.name) a.name = s.name;
            for (const k of ['showFirstColumn', 'showLastColumn',
                              'showRowStripes', 'showColumnStripes']) {
                if (s[k] != null) a[k] = writeBoolAttr(s[k]);
            }
            return xml.el('tableStyleInfo', a);
        }

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'table') {
                throw new ParseError('xlsx/tables-bad-root', `xlsx tables: expected <table>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = {
                id: Number(root.attrs.id),
                name: root.attrs.name,
                displayName: root.attrs.displayName,
                ref: root.attrs.ref,
                columns: []
            };
            if (root.attrs.headerRowCount != null) out.headerRowCount = Number(root.attrs.headerRowCount);
            if (root.attrs.totalsRowCount != null) out.totalsRowCount = Number(root.attrs.totalsRowCount);
            if (root.attrs.totalsRowShown != null) out.totalsRowShown = readBoolAttr(root.attrs.totalsRowShown);

            const af = xml.findChild(root, 'autoFilter');
            if (af) out.autoFilter = { ref: af.attrs.ref };
            const cols = xml.findChild(root, 'tableColumns');
            if (cols) {
                for (const cEl of xml.findAll(cols, 'tableColumn')) {
                    out.columns.push(parseColumn(cEl));
                }
            }
            const tsi = xml.findChild(root, 'tableStyleInfo');
            if (tsi) out.tableStyleInfo = parseTableStyleInfo(tsi);

            return out;
        }

        function serialize(obj) {
            const a = {
                xmlns: SS_NS,
                id: String(obj.id),
                name: obj.name,
                displayName: obj.displayName,
                ref: obj.ref
            };
            if (obj.headerRowCount != null) a.headerRowCount = String(obj.headerRowCount);
            if (obj.totalsRowCount != null) a.totalsRowCount = String(obj.totalsRowCount);
            if (obj.totalsRowShown != null) a.totalsRowShown = writeBoolAttr(obj.totalsRowShown);

            const children = [];
            if (obj.autoFilter) children.push(xml.el('autoFilter', { ref: obj.autoFilter.ref }));
            children.push(xml.el('tableColumns',
                { count: String((obj.columns || []).length) },
                (obj.columns || []).map(renderColumn)));
            if (obj.tableStyleInfo) children.push(renderTableStyleInfo(obj.tableStyleInfo));
            if (obj._extras) for (const ex of obj._extras) children.push(ex);
            return xml.serialize(xml.el('table', a, children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        return {
            parse, serialize, bytesOf,
            REL_TYPE_TABLE, CT_TABLE
        };
    }
};
