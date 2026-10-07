// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PresentationML tables — `<p:graphicFrame>` containing
 * `<a:graphic><a:graphicData uri=".../table"><a:tbl>` (ECMA-376 part 1
 * §19.3.1.21 + §20.1.4 DrawingML table).
 *
 * Slide tables sit in the `<p:spTree>` alongside `<p:sp>` and `<p:pic>`,
 * but they're wrapped in a `<p:graphicFrame>` because they use the
 * generic DrawingML graphic mechanism. Other graphicFrame uses (charts,
 * SmartArt) are out of scope here — they're preserved verbatim.
 *
 * Document model :
 *
 * ```js
 * {
 *   type: 'table',
 *   id?, name?,
 *   cx, cy,
 *   offsetX?, offsetY?,
 *   tableStyleId?: string,                 // GUID of a built-in style
 *   flags?: { firstRow?, lastRow?, firstCol?, lastCol?,
 *             bandRow?, bandCol? },
 *   columns: [{ width: number }],
 *   rows: [{
 *     height: number,
 *     cells: [{
 *       txBody?: textBody,                 // drawingml.parseTextBody
 *       gridSpan?, rowSpan?,
 *       hMerge?, vMerge?,
 *       tcPr?: xmlNode,                    // verbatim properties
 *       _extras?: [xmlNode]
 *     }]
 *   }],
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * Cells use `drawingml`'s typed text body model, so rich text + bullet
 * properties + run formatting all roundtrip.
 *
 * @module ooxml/pptx/table
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { drawingml } from '../drawingml/drawingml.js';
import { ooxmlShared } from '../_shared/index.js';

export const pptxTable = {
    name: 'pptxTable',
    dependencies: ['xml', 'drawingml', 'ooxmlShared'],
    deps: [xml, drawingml, ooxmlShared],

    factory(xml, dml, shared) {
        const { NS, readBoolAttr, writeBoolAttr } = shared;
        const A_NS = NS.A;
        const R_NS = NS.R;
        const TABLE_GRAPHIC_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';

        // --- Cell parse / render ---

        function parseCell(tcEl) {
            const out = {};
            const extras = [];
            for (const k of ['gridSpan', 'rowSpan']) {
                if (tcEl.attrs[k] != null) out[k] = Number(tcEl.attrs[k]);
            }
            for (const k of ['hMerge', 'vMerge']) {
                if (tcEl.attrs[k] != null) out[k] = readBoolAttr(tcEl.attrs[k]);
            }
            for (const c of tcEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:txBody')      out.txBody = dml.parseTextBody(c);
                else if (c.name === 'a:tcPr')   out.tcPr = c;
                else                            extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderCell(cell) {
            const a = {};
            if (cell.gridSpan != null) a.gridSpan = String(cell.gridSpan);
            if (cell.rowSpan != null)  a.rowSpan = String(cell.rowSpan);
            if (cell.hMerge != null)   a.hMerge = writeBoolAttr(cell.hMerge);
            if (cell.vMerge != null)   a.vMerge = writeBoolAttr(cell.vMerge);
            const children = [];
            // ECMA-376 schema: a:txBody first (mandatory), then a:tcPr.
            if (cell.txBody) {
                children.push(dml.renderTextBody(cell.txBody, 'a:txBody'));
            } else {
                // Cells must have a txBody — emit an empty one when absent.
                children.push(xml.el('a:txBody', {}, [
                    xml.el('a:bodyPr', {}),
                    xml.el('a:lstStyle', {}),
                    xml.el('a:p', {})
                ]));
            }
            children.push(cell.tcPr || xml.el('a:tcPr', {}));
            if (cell._extras) for (const ex of cell._extras) children.push(ex);
            return xml.el('a:tc', a, children);
        }

        // --- Row parse / render ---

        function parseRow(trEl) {
            const out = {
                height: trEl.attrs.h != null ? Number(trEl.attrs.h) : 370840,
                cells: []
            };
            for (const c of trEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:tc') out.cells.push(parseCell(c));
            }
            return out;
        }

        function renderRow(row) {
            return xml.el('a:tr', { h: String(row.height ?? 370840) },
                (row.cells || []).map(renderCell));
        }

        // --- Table parse / render ---

        const FLAG_ATTRS = ['firstRow', 'lastRow', 'firstCol', 'lastCol',
                             'bandRow', 'bandCol'];

        function parseTable(tblEl) {
            const out = { columns: [], rows: [] };
            const tblPr = xml.findChild(tblEl, 'a:tblPr');
            if (tblPr) {
                const flags = {};
                for (const k of FLAG_ATTRS) {
                    if (tblPr.attrs[k] != null) flags[k] = readBoolAttr(tblPr.attrs[k]);
                }
                if (Object.keys(flags).length) out.flags = flags;
                const styleId = xml.findChild(tblPr, 'a:tableStyleId');
                if (styleId) out.tableStyleId = xml.textContent(styleId);
            }
            const grid = xml.findChild(tblEl, 'a:tblGrid');
            if (grid) {
                for (const col of xml.findAll(grid, 'a:gridCol')) {
                    out.columns.push({
                        width: col.attrs.w != null ? Number(col.attrs.w) : 0
                    });
                }
            }
            for (const tr of xml.findAll(tblEl, 'a:tr')) {
                out.rows.push(parseRow(tr));
            }
            return out;
        }

        function renderTable(t) {
            const tblPrAttrs = {};
            for (const k of FLAG_ATTRS) {
                if (t.flags && t.flags[k] != null) {
                    tblPrAttrs[k] = writeBoolAttr(t.flags[k]);
                }
            }
            const tblPrChildren = [];
            if (t.tableStyleId) {
                tblPrChildren.push(xml.el('a:tableStyleId', {},
                    [xml.text(t.tableStyleId)]));
            }
            const tblGridChildren = (t.columns || []).map(col =>
                xml.el('a:gridCol', { w: String(col.width ?? 3000000) }));
            return xml.el('a:tbl', {}, [
                xml.el('a:tblPr', tblPrAttrs, tblPrChildren),
                xml.el('a:tblGrid', {}, tblGridChildren),
                ...(t.rows || []).map(renderRow)
            ]);
        }

        // --- Wrap the table in a <p:graphicFrame> ---

        /**
         * Parse a `<p:graphicFrame>` if it contains a DrawingML table.
         * Returns `null` when the graphicFrame holds something else
         * (e.g. a chart) — the caller should preserve the element raw.
         */
        function parseGraphicFrame(gfEl) {
            const graphic = xml.findChild(gfEl, 'a:graphic');
            if (!graphic) return null;
            const gd = xml.findChild(graphic, 'a:graphicData');
            if (!gd || gd.attrs.uri !== TABLE_GRAPHIC_URI) return null;
            const tbl = xml.findChild(gd, 'a:tbl');
            if (!tbl) return null;

            const out = parseTable(tbl);
            out.type = 'table';

            const nv = xml.findChild(gfEl, 'p:nvGraphicFramePr');
            if (nv) {
                const cNvPr = xml.findChild(nv, 'p:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.id = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.name = cNvPr.attrs.name;
                }
            }
            const xfrm = xml.findChild(gfEl, 'p:xfrm');
            if (xfrm) {
                const off = xml.findChild(xfrm, 'a:off');
                const ext = xml.findChild(xfrm, 'a:ext');
                if (off) {
                    if (off.attrs.x != null) out.offsetX = Number(off.attrs.x);
                    if (off.attrs.y != null) out.offsetY = Number(off.attrs.y);
                }
                if (ext) {
                    if (ext.attrs.cx != null) out.cx = Number(ext.attrs.cx);
                    if (ext.attrs.cy != null) out.cy = Number(ext.attrs.cy);
                }
            }
            return out;
        }

        function renderGraphicFrame(t) {
            const cNvPrAttrs = {
                id: String(t.id != null ? t.id : 4),
                name: t.name || 'Table'
            };
            return xml.el('p:graphicFrame', {}, [
                xml.el('p:nvGraphicFramePr', {}, [
                    xml.el('p:cNvPr', cNvPrAttrs),
                    xml.el('p:cNvGraphicFramePr', {}, [
                        xml.el('a:graphicFrameLocks', { noGrp: '1' })
                    ]),
                    xml.el('p:nvPr', {})
                ]),
                xml.el('p:xfrm', {}, [
                    xml.el('a:off', {
                        x: String(t.offsetX || 0),
                        y: String(t.offsetY || 0)
                    }),
                    xml.el('a:ext', {
                        cx: String(t.cx ?? 6000000),
                        cy: String(t.cy ?? 1500000)
                    })
                ]),
                xml.el('a:graphic', {}, [
                    xml.el('a:graphicData', { uri: TABLE_GRAPHIC_URI },
                        [renderTable(t)])
                ])
            ]);
        }

        // --- Convenience builders ---

        /**
         * Build a typed `{ type: 'table' }` slide shape from a 2-D array
         * of plain-text cell values.
         */
        function tableFromRows(rows, opts = {}) {
            const ncols = rows[0] ? rows[0].length : 0;
            const colWidth = opts.colWidth || (ncols ? Math.floor(6000000 / ncols) : 3000000);
            return {
                type: 'table',
                cx: opts.cx || (ncols * colWidth),
                cy: opts.cy || (rows.length * 370840),
                offsetX: opts.offsetX || 0,
                offsetY: opts.offsetY || 0,
                tableStyleId: opts.tableStyleId,
                flags: opts.flags || (rows.length > 0
                    ? { firstRow: true, bandRow: true } : undefined),
                columns: Array(ncols).fill(null).map(() => ({ width: colWidth })),
                rows: rows.map((row) => ({
                    height: 370840,
                    cells: row.map(value => ({
                        txBody: dml.textBodyFromString(String(value ?? ''))
                    }))
                }))
            };
        }

        return {
            parseTable, renderTable,
            parseRow, renderRow,
            parseCell, renderCell,
            parseGraphicFrame, renderGraphicFrame,
            tableFromRows,
            TABLE_GRAPHIC_URI,
            A_NS, R_NS
        };
    }
};
