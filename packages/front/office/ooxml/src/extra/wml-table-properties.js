// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed support for `<w:tblPr>`, `<w:trPr>`, and the
 * extended `<w:tcPr>` children that core preserves verbatim.
 *
 * Tables in core: rows + cells are typed; cell width/gridSpan/vMerge are
 * typed; `tblPr` is typed for style / width / borders and table
 * cell margins (`cellMargins`); trPr / cell borders / cell
 * margins (`tcMar`) / vAlign and the rest of tblPr are kept as raw XML in
 * `_extras`. This module promotes them to typed fields.
 *
 * ## Elements covered
 *
 * - **tblPr** : `tblStyle`, `tblpPr`, `tblOverlap`, `bidiVisual`, `tblW`,
 *   `tblInd`, `tblBorders`, `tblCellMar`, `tblCellSpacing`, `tblLayout`,
 *   `tblLook`, `tblCaption`, `tblDescription`, `tblStyleColBandSize`,
 *   `tblStyleRowBandSize`, `jc`
 * - **trPr** : `trHeight`, `gridBefore`, `gridAfter`, `wAfter`, `wBefore`,
 *   `hidden`, `cantSplit`, `tblHeader`, `cnfStyle`
 * - **tcPr** : `tcBorders`, `tcMar`, `vAlign`, `hideMark`, `tcFitText`,
 *   `noWrap`, `cnfStyle`, `tcW`
 * - **Sub-children of borders** : `top`, `left`, `bottom`, `right`,
 *   `insideH`, `insideV`, `tl2br`, `tr2bl`, `start`, `end`
 *
 * @module ooxml/extra/wml-table-properties
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';

export const wmlTableProperties = {
    name: 'wmlTableProperties',
    dependencies: ['xml', 'docxProperties'],
    deps: [xml, docxProperties],

    factory(xml, core) {
        // --- common helpers ---
        function widthAttrs(w) {
            const a = {};
            if (w.w != null)    a['w:w'] = String(w.w);
            if (w.type != null) a['w:type'] = w.type;
            return a;
        }
        function parseWidth(el) {
            const w = {};
            if (el.attrs['w:w'] != null)    w.w = el.attrs['w:w'];
            if (el.attrs['w:type'] != null) w.type = el.attrs['w:type'];
            return Object.keys(w).length ? w : undefined;
        }

        const BORDER_ATTRS = ['val', 'sz', 'space', 'color', 'shadow', 'frame', 'themeColor'];

        function readBorderSide(c) {
            const b = {};
            for (const a of BORDER_ATTRS) {
                if (c.attrs['w:' + a] != null) b[a] = c.attrs['w:' + a];
            }
            // Attributes this bag does not name (themeTint, themeShade, ...)
            // ride verbatim in `extraAttrs`, the same key core's Border uses.
            const known = new Set(BORDER_ATTRS.map(a => 'w:' + a));
            const extraAttrs = {};
            let any = false;
            for (const k of Object.keys(c.attrs)) {
                if (!known.has(k)) { extraAttrs[k] = c.attrs[k]; any = true; }
            }
            if (any) b.extraAttrs = extraAttrs;
            return Object.keys(b).length ? b : undefined;
        }

        function parseBorders(el) {
            const out = {};
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:top':     { const v = readBorderSide(c); if (v) out.top = v; break; }
                    case 'w:left':    { const v = readBorderSide(c); if (v) out.left = v; break; }
                    case 'w:bottom':  { const v = readBorderSide(c); if (v) out.bottom = v; break; }
                    case 'w:right':   { const v = readBorderSide(c); if (v) out.right = v; break; }
                    case 'w:insideH': { const v = readBorderSide(c); if (v) out.insideH = v; break; }
                    case 'w:insideV': { const v = readBorderSide(c); if (v) out.insideV = v; break; }
                    case 'w:tl2br':   { const v = readBorderSide(c); if (v) out.tl2br = v; break; }
                    case 'w:tr2bl':   { const v = readBorderSide(c); if (v) out.tr2bl = v; break; }
                    case 'w:start':   { const v = readBorderSide(c); if (v) out.start = v; break; }
                    case 'w:end':     { const v = readBorderSide(c); if (v) out.end = v; break; }
                }
            }
            return Object.keys(out).length ? out : undefined;
        }
        function borderSideAttrs(b) {
            const a = {};
            for (const k of BORDER_ATTRS) if (b[k] != null) a['w:' + k] = String(b[k]);
            if (b.extraAttrs) {
                const known = new Set(BORDER_ATTRS.map(x => 'w:' + x));
                for (const k of Object.keys(b.extraAttrs)) {
                    if (!known.has(k) && b.extraAttrs[k] !== undefined) a[k] = String(b.extraAttrs[k]);
                }
            }
            return a;
        }
        function bordersChildren(b) {
            const kids = [];
            if (b.top)     kids.push(xml.el('w:top',     borderSideAttrs(b.top)));
            if (b.left)    kids.push(xml.el('w:left',    borderSideAttrs(b.left)));
            if (b.bottom)  kids.push(xml.el('w:bottom',  borderSideAttrs(b.bottom)));
            if (b.right)   kids.push(xml.el('w:right',   borderSideAttrs(b.right)));
            if (b.insideH) kids.push(xml.el('w:insideH', borderSideAttrs(b.insideH)));
            if (b.insideV) kids.push(xml.el('w:insideV', borderSideAttrs(b.insideV)));
            if (b.tl2br)   kids.push(xml.el('w:tl2br',   borderSideAttrs(b.tl2br)));
            if (b.tr2bl)   kids.push(xml.el('w:tr2bl',   borderSideAttrs(b.tr2bl)));
            if (b.start)   kids.push(xml.el('w:start',   borderSideAttrs(b.start)));
            if (b.end)     kids.push(xml.el('w:end',     borderSideAttrs(b.end)));
            if (b._extras) for (const ex of b._extras) kids.push(ex);   // unmodelled children (core-typed borders)
            return kids;
        }
        function renderBorders(parentName, b) {
            if (!b) return null;
            const kids = bordersChildren(b);
            if (!kids.length) return null;
            if (parentName === 'w:tblBorders') return xml.el('w:tblBorders', {}, kids);
            if (parentName === 'w:tcBorders')  return xml.el('w:tcBorders',  {}, kids);
            if (parentName === 'w:pBdr')       return xml.el('w:pBdr',       {}, kids);
            return xml.el(parentName, {}, kids);
        }

        function parseMargins(el) {
            const out = {};
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:top':    { const w = parseWidth(c); if (w) out.top = w; break; }
                    case 'w:left':   { const w = parseWidth(c); if (w) out.left = w; break; }
                    case 'w:bottom': { const w = parseWidth(c); if (w) out.bottom = w; break; }
                    case 'w:right':  { const w = parseWidth(c); if (w) out.right = w; break; }
                    case 'w:start':  { const w = parseWidth(c); if (w) out.start = w; break; }
                    case 'w:end':    { const w = parseWidth(c); if (w) out.end = w; break; }
                }
            }
            return Object.keys(out).length ? out : undefined;
        }
        function marginsChildren(m) {
            const kids = [];
            if (m.top)    kids.push(xml.el('w:top',    widthAttrs(m.top)));
            if (m.left)   kids.push(xml.el('w:left',   widthAttrs(m.left)));
            if (m.bottom) kids.push(xml.el('w:bottom', widthAttrs(m.bottom)));
            if (m.right)  kids.push(xml.el('w:right',  widthAttrs(m.right)));
            if (m.start)  kids.push(xml.el('w:start',  widthAttrs(m.start)));
            if (m.end)    kids.push(xml.el('w:end',    widthAttrs(m.end)));
            return kids;
        }
        function renderMargins(parentName, m) {
            if (!m) return null;
            const kids = marginsChildren(m);
            if (!kids.length) return null;
            if (parentName === 'w:tblCellMar') return xml.el('w:tblCellMar', {}, kids);
            if (parentName === 'w:tcMar')      return xml.el('w:tcMar',      {}, kids);
            return xml.el(parentName, {}, kids);
        }

        // --- tblPr ---
        function parseTblPr(el) {
            const out = {};
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:tblStyle':            out.tblStyle = c.attrs['w:val']; break;
                    case 'w:tblOverlap':          out.tblOverlap = c.attrs['w:val']; break;
                    case 'w:tblLayout':           out.tblLayout = c.attrs['w:type']; break;
                    case 'w:tblCaption':          out.tblCaption = c.attrs['w:val']; break;
                    case 'w:tblDescription':      out.tblDescription = c.attrs['w:val']; break;
                    case 'w:tblStyleColBandSize': out.tblStyleColBandSize = c.attrs['w:val']; break;
                    case 'w:tblStyleRowBandSize': out.tblStyleRowBandSize = c.attrs['w:val']; break;
                    case 'w:jc':                  out.jc = c.attrs['w:val']; break;
                    case 'w:bidiVisual':          out.bidiVisual = core.readToggle(c); break;
                    case 'w:tblW':                { const w = parseWidth(c); if (w) out.width = w; break; }
                    case 'w:tblInd':              { const w = parseWidth(c); if (w) out.indent = w; break; }
                    case 'w:tblCellSpacing':      { const w = parseWidth(c); if (w) out.cellSpacing = w; break; }
                    case 'w:tblBorders':          { const b = parseBorders(c); if (b) out.borders = b; break; }
                    case 'w:tblCellMar':          { const m = parseMargins(c); if (m) out.cellMargins = m; break; }
                    case 'w:tblLook':             out.tblLook = { ...c.attrs }; break;
                    case 'w:tblpPr':              out.floatPos = { ...c.attrs }; break;
                    default: extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return Object.keys(out).length ? out : undefined;
        }

        function renderTblPr(t) {
            if (!t) return null;
            const c = [];
            // `style` is the core-typed spelling; accept it so a
            // composer-authored core tblPr keeps its style under this extension.
            const styleId = t.tblStyle != null ? t.tblStyle : t.style;
            if (styleId != null)                c.push(xml.el('w:tblStyle', { 'w:val': String(styleId) }));
            if (t.floatPos)                     c.push(xml.el('w:tblpPr', { ...t.floatPos }));
            if (t.tblOverlap != null)           c.push(xml.el('w:tblOverlap', { 'w:val': String(t.tblOverlap) }));
            if (t.bidiVisual !== undefined) {
                c.push(xml.el('w:bidiVisual', t.bidiVisual === false ? { 'w:val': '0' } : {}));
            }
            if (t.tblStyleRowBandSize != null)  c.push(xml.el('w:tblStyleRowBandSize', { 'w:val': String(t.tblStyleRowBandSize) }));
            if (t.tblStyleColBandSize != null)  c.push(xml.el('w:tblStyleColBandSize', { 'w:val': String(t.tblStyleColBandSize) }));
            if (t.width)       c.push(xml.el('w:tblW',           widthAttrs(t.width)));
            if (t.jc != null)  c.push(xml.el('w:jc',             { 'w:val': String(t.jc) }));
            if (t.cellSpacing) c.push(xml.el('w:tblCellSpacing', widthAttrs(t.cellSpacing)));
            if (t.indent)      c.push(xml.el('w:tblInd',         widthAttrs(t.indent)));
            const bs = renderBorders('w:tblBorders', t.borders);     if (bs) c.push(bs);
            const ms = renderMargins('w:tblCellMar', t.cellMargins); if (ms) c.push(ms);
            if (t.tblLayout != null)      c.push(xml.el('w:tblLayout', { 'w:type': String(t.tblLayout) }));
            if (t.tblLook)                c.push(xml.el('w:tblLook', { ...t.tblLook }));
            if (t.tblCaption != null)     c.push(xml.el('w:tblCaption', { 'w:val': String(t.tblCaption) }));
            if (t.tblDescription != null) c.push(xml.el('w:tblDescription', { 'w:val': String(t.tblDescription) }));
            if (t._extras) for (const ex of t._extras) c.push(ex);
            return c.length ? xml.el('w:tblPr', {}, c) : null;
        }

        // --- trPr ---
        function parseTrPr(el) {
            const out = {};
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:trHeight':   out.height = { ...c.attrs }; break;
                    case 'w:gridBefore': out.gridBefore = Number(c.attrs['w:val']); break;
                    case 'w:gridAfter':  out.gridAfter = Number(c.attrs['w:val']); break;
                    case 'w:wAfter':     { const w = parseWidth(c); if (w) out.wAfter = w; break; }
                    case 'w:wBefore':    { const w = parseWidth(c); if (w) out.wBefore = w; break; }
                    case 'w:cnfStyle':   out.cnfStyle = c.attrs['w:val']; break;
                    case 'w:hidden':     out.hidden = core.readToggle(c); break;
                    case 'w:cantSplit':  out.cantSplit = core.readToggle(c); break;
                    case 'w:tblHeader':  out.tblHeader = core.readToggle(c); break;
                    default: extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return Object.keys(out).length ? out : undefined;
        }
        function renderTrPr(t) {
            if (!t) return null;
            const c = [];
            if (t.cnfStyle != null)   c.push(xml.el('w:cnfStyle', { 'w:val': String(t.cnfStyle) }));
            if (t.gridBefore != null) c.push(xml.el('w:gridBefore', { 'w:val': String(t.gridBefore) }));
            if (t.gridAfter != null)  c.push(xml.el('w:gridAfter',  { 'w:val': String(t.gridAfter) }));
            if (t.wBefore) c.push(xml.el('w:wBefore', widthAttrs(t.wBefore)));
            if (t.wAfter)  c.push(xml.el('w:wAfter',  widthAttrs(t.wAfter)));
            const tA = v => v === false ? { 'w:val': '0' } : {};
            if (t.hidden    !== undefined) c.push(xml.el('w:hidden',    tA(t.hidden)));
            if (t.cantSplit !== undefined) c.push(xml.el('w:cantSplit', tA(t.cantSplit)));
            if (t.tblHeader !== undefined) c.push(xml.el('w:tblHeader', tA(t.tblHeader)));
            if (t.height) c.push(xml.el('w:trHeight', { ...t.height }));
            if (t._extras) for (const ex of t._extras) c.push(ex);
            return c.length ? xml.el('w:trPr', {}, c) : null;
        }

        // --- tcPr extension (extends core typed fields) ---
        function parseTcW(el) {
            const w = parseWidth(el);
            return w;
        }

        function hydrateTcPr(tcPr) {
            if (!tcPr || !tcPr._extras) return tcPr;
            const remaining = [];
            for (const c of tcPr._extras) {
                if (c.type !== 'element') { remaining.push(c); continue; }
                switch (c.name) {
                    case 'w:tcBorders': { const b = parseBorders(c); if (b) tcPr.borders = b; break; }
                    case 'w:tcMar':     { const m = parseMargins(c); if (m) tcPr.margins = m; break; }
                    case 'w:tcW':       { const w = parseTcW(c);    if (w) tcPr.width = w; break; }
                    case 'w:vAlign':    tcPr.vAlign = c.attrs['w:val']; break;
                    case 'w:cnfStyle':  tcPr.cnfStyle = c.attrs['w:val']; break;
                    case 'w:noWrap':    tcPr.noWrap = core.readToggle(c); break;
                    case 'w:hideMark':  tcPr.hideMark = core.readToggle(c); break;
                    case 'w:tcFitText': tcPr.tcFitText = core.readToggle(c); break;
                    default: remaining.push(c);
                }
            }
            if (remaining.length) tcPr._extras = remaining;
            else delete tcPr._extras;
            return tcPr;
        }
        function dehydrateTcPr(tcPr) {
            if (!tcPr) return tcPr;
            const out = { ...tcPr };
            const extras = out._extras ? [...out._extras] : [];
            if (out.cnfStyle != null) { extras.push(xml.el('w:cnfStyle', { 'w:val': String(out.cnfStyle) })); delete out.cnfStyle; }
            // tcW handled by core when out.width is the cell-level one; if we
            // hydrated from _extras, emit it ourselves.
            const bs = renderBorders('w:tcBorders', out.borders); if (bs) extras.push(bs); delete out.borders;
            const ms = renderMargins('w:tcMar',     out.margins); if (ms) extras.push(ms); delete out.margins;
            if (out.vAlign != null)   { extras.push(xml.el('w:vAlign', { 'w:val': String(out.vAlign) })); delete out.vAlign; }
            const tA = v => v === false ? { 'w:val': '0' } : {};
            if (out.noWrap    !== undefined) { extras.push(xml.el('w:noWrap',    tA(out.noWrap)));    delete out.noWrap; }
            if (out.hideMark  !== undefined) { extras.push(xml.el('w:hideMark',  tA(out.hideMark)));  delete out.hideMark; }
            if (out.tcFitText !== undefined) { extras.push(xml.el('w:tcFitText', tA(out.tcFitText))); delete out.tcFitText; }
            if (extras.length) out._extras = extras;
            return out;
        }

        // --- table/row/cell hydrate-dehydrate ---
        // Core (docxProperties / docxStructure) types `tblPr`
        // (style / width / borders / cellMargins; the rest sits in
        // `tblPr._extras`), so a read table reaches hydrate with
        // `table.tblPr` ALREADY parsed in the core shape. This extension owns the full tblPr shape when installed: it
        // renders the core-typed bag back to a `<w:tblPr>` element (core's
        // `_extras` are the verbatim children) and re-parses it with its own
        // `parseTblPr`, giving the exact shape it produced before core typed `tblPr`.
        // `extShaped` marks bags this factory already produced, so a second
        // hydrate never re-derives (and lossily narrows) an extension-shaped bag.
        const extShaped = new WeakSet();
        function adoptCoreTblPr(table) {
            const t = table && table.tblPr;
            if (!t || extShaped.has(t)) return;
            const el = core.renderTableProperties(t);
            const typed = el ? parseTblPr(el) : undefined;
            if (typed) { extShaped.add(typed); table.tblPr = typed; }
        }
        function hydrateTable(table) {
            adoptCoreTblPr(table);
            if (!table || !table._extras) {
                if (table && table.rows) table.rows.forEach(hydrateRow);
                return table;
            }
            const remaining = [];
            for (const c of table._extras) {
                if (c.type === 'element' && c.name === 'w:tblPr') {
                    const t = parseTblPr(c);
                    if (t) { extShaped.add(t); table.tblPr = t; }
                    continue;
                }
                remaining.push(c);
            }
            if (remaining.length) table._extras = remaining;
            else delete table._extras;
            if (table.rows) table.rows.forEach(hydrateRow);
            return table;
        }
        function hydrateRow(row) {
            if (row && row._extras) {
                const remaining = [];
                for (const c of row._extras) {
                    if (c.type === 'element' && c.name === 'w:trPr') {
                        const t = parseTrPr(c);
                        if (t) row.trPr = t;
                        continue;
                    }
                    remaining.push(c);
                }
                if (remaining.length) row._extras = remaining;
                else delete row._extras;
            }
            if (row && row.cells) for (const cell of row.cells) {
                if (cell.tcPr) hydrateTcPr(cell.tcPr);
            }
            return row;
        }

        function dehydrateTable(table) {
            if (!table) return table;
            const out = { ...table };
            const extras = out._extras ? [...out._extras] : [];
            if (out.tblPr) {
                const el = renderTblPr(out.tblPr);
                if (el) extras.unshift(el); // tblPr first per schema
                delete out.tblPr;
            }
            out.rows = (out.rows || []).map(dehydrateRow);
            if (extras.length) out._extras = extras;
            return out;
        }
        function dehydrateRow(row) {
            if (!row) return row;
            const out = { ...row };
            const extras = out._extras ? [...out._extras] : [];
            if (out.trPr) {
                const el = renderTrPr(out.trPr);
                if (el) extras.unshift(el);
                delete out.trPr;
            }
            out.cells = (out.cells || []).map(cell => {
                if (!cell.tcPr) return cell;
                return { ...cell, tcPr: dehydrateTcPr(cell.tcPr) };
            });
            if (extras.length) out._extras = extras;
            return out;
        }

        return {
            hydrateTable, dehydrateTable,
            hydrateRow, dehydrateRow,
            hydrateTcPr, dehydrateTcPr,
            parseTblPr, renderTblPr,
            parseTrPr, renderTrPr,
            parseBorders, renderBorders,
            parseMargins, renderMargins
        };
    }
};
