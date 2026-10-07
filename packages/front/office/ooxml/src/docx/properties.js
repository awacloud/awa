// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Run and paragraph property bags for WordprocessingML.
 *
 * Maps the most common children of `<w:rPr>`, `<w:pPr>` and `<w:tblPr>` to a flat
 * JavaScript property bag with named fields. Anything unknown is preserved
 * verbatim in `_extras` so the roundtrip remains fidel for elements not
 * yet modelled.
 *
 * Run properties — `<w:rPr>` (ECMA-376 part 1 §17.3.2) :
 *
 * | Field | Source element | Type |
 * |-------|---------------|------|
 * | `bold` | `<w:b w:val=…/>` | boolean |
 * | `italic` | `<w:i w:val=…/>` | boolean |
 * | `underline` | `<w:u w:val="single"/>` | string |
 * | `strike` | `<w:strike/>` | boolean |
 * | `color` | `<w:color w:val="RRGGBB"/>` | string (hex, no `#`) |
 * | `size` | `<w:sz w:val="24"/>` | number (half-points) |
 * | `font` | `<w:rFonts w:ascii=…/>` | string |
 * | `vertAlign` | `<w:vertAlign w:val=…/>` | `'superscript'|'subscript'|'baseline'` |
 * | `highlight` | `<w:highlight w:val=…/>` | string |
 * | `rStyle` | `<w:rStyle w:val=…/>` | string (style id) |
 *
 * Paragraph properties — `<w:pPr>` (ECMA-376 part 1 §17.3.1) :
 *
 * | Field | Source element |
 * |-------|---------------|
 * | `align` | `<w:jc w:val=…/>` |
 * | `indent` | `<w:ind w:left=… w:right=… w:firstLine=… w:hanging=…/>` |
 * | `spacing` | `<w:spacing w:before=… w:after=… w:line=…/>` |
 * | `pStyle` | `<w:pStyle w:val=…/>` |
 * | `numPr` | `<w:numPr><w:ilvl/><w:numId/></w:numPr>` |
 *
 * Table properties — `<w:tblPr>` (ECMA-376 part 1 §17.4.59), typed so a
 * composer can border a table without hand-authoring XML :
 *
 * ```js
 * TableProperties := {
 *   style?:   string,                                   // <w:tblStyle w:val>
 *   width?:   { w: number|string, type: 'auto'|'dxa'|'pct'|'nil' }, // <w:tblW>
 *   borders?: TableBorders,                             // <w:tblBorders>
 *   cellMargins?: TableCellMargins,                     // <w:tblCellMar>
 *   _extras?: xmlNode[]        // every other child, verbatim, source order
 * }
 * TableCellMargins := { top?: Width, start?: Width, left?: Width,
 *                       bottom?: Width, end?: Width, right?: Width,
 *                       _extras?: xmlNode[] }      // edges in schema order
 * Width := { w: number|string, type: 'auto'|'dxa'|'pct'|'nil' }
 *                                                  // number when numeric
 * TableBorders := { top?: Border, left?: Border, bottom?: Border,
 *                   right?: Border, insideH?: Border, insideV?: Border,
 *                   _extras?: xmlNode[] }          // edges in schema order
 * Border := { val: string, sz?: number, space?: number, color?: string,
 *              extraAttrs?: { [attrName: string]: string } }
 *                                                  // <w:top …> (§17.3.4)
 *   // `extraAttrs`: every other attribute of the edge (w:themeColor,
 *   // w:themeTint, w:themeShade, w:shadow, w:frame, ...), full attribute
 *   // names, source order, re-emitted verbatim after w:color; the key is
 *   // omitted when there is nothing to carry.
 * ```
 *
 * `parseTableProperties(el)` returns `undefined` for an element with no
 * element children; `renderTableProperties(t)` returns `null` when nothing
 * would render. Children render as tblStyle, tblW, tblBorders, `_extras`.
 * `w:tblGrid`, `w:trPr`, `w:tcBorders`, `w:tblLook` and `w:tblStylePr` are
 * NOT modelled here (they stay verbatim in `_extras`).
 *
 * @module ooxml/docx/properties
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const docxProperties = {
    name: 'docxProperties',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // --- Boolean toggle elements (w:b / w:i / w:strike etc.) ---
        // ECMA-376 says: presence + no `w:val` = on; `w:val="0"|"false"` = off.
        function readToggle(el) {
            if (!el) return undefined;
            const v = el.attrs['w:val'];
            if (v === undefined) return true;
            return !(v === '0' || v === 'false' || v === 'off');
        }

        function writeToggle(name, value) {
            if (value === true) return xml.el(name, {});
            if (value === false) return xml.el(name, { 'w:val': '0' });
            return null;
        }

        // --- Helpers for w:val-bearing elements ---
        function valOf(el) { return el ? el.attrs['w:val'] : undefined; }
        function elVal(name, val) { return xml.el(name, { 'w:val': String(val) }); }

        // --- Run properties ---
        // Known children we explicitly map. Anything else lands in `_extras`.
        const RPR_KNOWN = new Set([
            'w:b', 'w:i', 'w:u', 'w:strike',
            'w:color', 'w:sz', 'w:rFonts',
            'w:vertAlign', 'w:highlight', 'w:rStyle'
        ]);

        function parseRunProperties(rPrEl) {
            if (!rPrEl) return undefined;
            const out = {};
            const extras = [];
            for (const c of rPrEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:b':         out.bold = readToggle(c); break;
                    case 'w:i':         out.italic = readToggle(c); break;
                    case 'w:strike':    out.strike = readToggle(c); break;
                    case 'w:u':         out.underline = valOf(c) || 'single'; break;
                    case 'w:color':     out.color = valOf(c); break;
                    case 'w:sz':        out.size = Number(valOf(c)); break;
                    case 'w:rFonts':    out.font = c.attrs['w:ascii']
                                                || c.attrs['w:hAnsi']
                                                || c.attrs['w:cs']; break;
                    case 'w:vertAlign': out.vertAlign = valOf(c); break;
                    case 'w:highlight': out.highlight = valOf(c); break;
                    case 'w:rStyle':    out.rStyle = valOf(c); break;
                    default:
                        if (!RPR_KNOWN.has(c.name)) extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        // Order matters in OOXML — `<w:rStyle>` must appear first per the
        // schema, then formatting toggles, then size/color/etc. We follow
        // the canonical order to maximise compatibility with reference
        // implementations (Word reorders silently but stricter validators
        // reject out-of-order children).
        function renderRunProperties(rPr) {
            if (!rPr) return null;
            const children = [];
            if (rPr.rStyle != null)    children.push(elVal('w:rStyle', rPr.rStyle));
            if (rPr.font != null)      children.push(xml.el('w:rFonts', {
                                            'w:ascii': rPr.font,
                                            'w:hAnsi': rPr.font,
                                            'w:cs': rPr.font
                                       }));
            const bold = writeToggle('w:b', rPr.bold);
            if (bold) children.push(bold);
            const italic = writeToggle('w:i', rPr.italic);
            if (italic) children.push(italic);
            const strike = writeToggle('w:strike', rPr.strike);
            if (strike) children.push(strike);
            if (rPr.color != null)     children.push(elVal('w:color', rPr.color));
            if (rPr.size != null)      children.push(elVal('w:sz', rPr.size));
            if (rPr.underline != null) children.push(elVal('w:u', rPr.underline));
            if (rPr.highlight != null) children.push(elVal('w:highlight', rPr.highlight));
            if (rPr.vertAlign != null) children.push(elVal('w:vertAlign', rPr.vertAlign));
            if (rPr._extras) for (const ex of rPr._extras) children.push(ex);
            if (!children.length) return null;
            return xml.el('w:rPr', {}, children);
        }

        // --- Paragraph properties ---
        const PPR_KNOWN = new Set([
            'w:jc', 'w:ind', 'w:spacing', 'w:pStyle', 'w:numPr', 'w:rPr'
        ]);

        function parseParagraphProperties(pPrEl) {
            if (!pPrEl) return undefined;
            const out = {};
            const extras = [];
            for (const c of pPrEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:jc':      out.align = valOf(c); break;
                    case 'w:pStyle':  out.pStyle = valOf(c); break;
                    case 'w:ind': {
                        const ind = {};
                        if (c.attrs['w:left'])      ind.left = Number(c.attrs['w:left']);
                        if (c.attrs['w:right'])     ind.right = Number(c.attrs['w:right']);
                        if (c.attrs['w:firstLine']) ind.firstLine = Number(c.attrs['w:firstLine']);
                        if (c.attrs['w:hanging'])   ind.hanging = Number(c.attrs['w:hanging']);
                        if (Object.keys(ind).length) out.indent = ind;
                        break;
                    }
                    case 'w:spacing': {
                        const sp = {};
                        if (c.attrs['w:before']) sp.before = Number(c.attrs['w:before']);
                        if (c.attrs['w:after'])  sp.after = Number(c.attrs['w:after']);
                        if (c.attrs['w:line'])   sp.line = Number(c.attrs['w:line']);
                        if (Object.keys(sp).length) out.spacing = sp;
                        break;
                    }
                    case 'w:numPr': {
                        const np = {};
                        const ilvl = xml.findChild(c, 'w:ilvl');
                        const numId = xml.findChild(c, 'w:numId');
                        if (ilvl)  np.ilvl  = Number(valOf(ilvl));
                        if (numId) np.numId = Number(valOf(numId));
                        if (Object.keys(np).length) out.numPr = np;
                        break;
                    }
                    case 'w:rPr': {
                        const inner = parseRunProperties(c);
                        if (inner) out.rPr = inner;
                        break;
                    }
                    default:
                        if (!PPR_KNOWN.has(c.name)) extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderParagraphProperties(pPr) {
            if (!pPr) return null;
            const children = [];
            if (pPr.pStyle != null) children.push(elVal('w:pStyle', pPr.pStyle));
            if (pPr.numPr) {
                const inner = [];
                if (pPr.numPr.ilvl != null)  inner.push(elVal('w:ilvl', pPr.numPr.ilvl));
                if (pPr.numPr.numId != null) inner.push(elVal('w:numId', pPr.numPr.numId));
                children.push(xml.el('w:numPr', {}, inner));
            }
            if (pPr.spacing) {
                const a = {};
                if (pPr.spacing.before != null) a['w:before'] = String(pPr.spacing.before);
                if (pPr.spacing.after != null)  a['w:after']  = String(pPr.spacing.after);
                if (pPr.spacing.line != null)   a['w:line']   = String(pPr.spacing.line);
                children.push(xml.el('w:spacing', a));
            }
            if (pPr.indent) {
                const a = {};
                if (pPr.indent.left != null)      a['w:left']      = String(pPr.indent.left);
                if (pPr.indent.right != null)     a['w:right']     = String(pPr.indent.right);
                if (pPr.indent.firstLine != null) a['w:firstLine'] = String(pPr.indent.firstLine);
                if (pPr.indent.hanging != null)   a['w:hanging']   = String(pPr.indent.hanging);
                children.push(xml.el('w:ind', a));
            }
            if (pPr.align != null) children.push(elVal('w:jc', pPr.align));
            if (pPr.rPr) {
                const rPrEl = renderRunProperties(pPr.rPr);
                if (rPrEl) children.push(rPrEl);
            }
            if (pPr._extras) for (const ex of pPr._extras) children.push(ex);
            if (!children.length) return null;
            return xml.el('w:pPr', {}, children);
        }

        // --- Table properties ---
        // `<w:tblPr>` (ECMA-376 part 1 §17.4.59). Typed: tblStyle, tblW,
        // tblBorders, tblCellMar. Everything else stays verbatim in `_extras`.
        const BORDER_EDGES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
        const BORDER_EDGE_NAMES = new Set(BORDER_EDGES.map(e => 'w:' + e));

        function numOrRaw(v) {
            if (v === undefined) return v;
            const n = Number(v);
            return (String(v).trim() !== '' && Number.isFinite(n)) ? n : v;
        }

        const BORDER_MODELLED_ATTRS = new Set(['w:val', 'w:sz', 'w:space', 'w:color']);

        function parseBorder(el) {
            const b = { val: el.attrs['w:val'] };
            if (el.attrs['w:sz'] !== undefined)    b.sz = Number(el.attrs['w:sz']);
            if (el.attrs['w:space'] !== undefined) b.space = Number(el.attrs['w:space']);
            if (el.attrs['w:color'] !== undefined) b.color = el.attrs['w:color'];
            // Every other attribute (themeColor / themeTint / themeShade /
            // shadow / frame, ...) rides verbatim in `extraAttrs`, source order.
            const extraAttrs = {};
            let any = false;
            for (const k of Object.keys(el.attrs)) {
                if (BORDER_MODELLED_ATTRS.has(k)) continue;
                extraAttrs[k] = el.attrs[k];
                any = true;
            }
            if (any) b.extraAttrs = extraAttrs;
            return b;
        }

        function renderBorder(edge, b) {
            const a = { 'w:val': String(b.val) };
            if (b.sz !== undefined)    a['w:sz'] = String(b.sz);
            if (b.space !== undefined) a['w:space'] = String(b.space);
            if (b.color !== undefined) a['w:color'] = String(b.color);
            if (b.extraAttrs) {
                for (const k of Object.keys(b.extraAttrs)) {
                    if (!BORDER_MODELLED_ATTRS.has(k) && b.extraAttrs[k] !== undefined) {
                        a[k] = String(b.extraAttrs[k]);
                    }
                }
            }
            return xml.el('w:' + edge, a);
        }

        function parseTableBorders(el) {
            const out = {};
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (BORDER_EDGE_NAMES.has(c.name)) out[c.name.slice(2)] = parseBorder(c);
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderTableBorders(borders) {
            if (!borders) return null;
            const kids = [];
            for (const edge of BORDER_EDGES) {
                if (borders[edge]) kids.push(renderBorder(edge, borders[edge]));
            }
            if (borders._extras) for (const ex of borders._extras) kids.push(ex);
            if (!kids.length) return null;
            return xml.el('w:tblBorders', {}, kids);
        }

        // `<w:tblCellMar>` (§17.4.42): default cell margins, edges in the
        // strict schema order (top, start, bottom, end) with the transitional
        // left / right spellings beside their strict twins. Each edge is a
        // `<w:tblW>`-shaped width.
        const MARGIN_EDGES = ['top', 'start', 'left', 'bottom', 'end', 'right'];
        const MARGIN_EDGE_NAMES = new Set(MARGIN_EDGES.map(e => 'w:' + e));

        function parseWidth(el) {
            return { w: numOrRaw(el.attrs['w:w']), type: el.attrs['w:type'] || 'auto' };
        }

        function renderWidth(name, width) {
            const a = {};
            if (width.w !== undefined) a['w:w'] = String(width.w);
            a['w:type'] = width.type || 'auto';
            return xml.el(name, a);
        }

        function parseCellMargins(el) {
            const out = {};
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (MARGIN_EDGE_NAMES.has(c.name)) out[c.name.slice(2)] = parseWidth(c);
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderCellMargins(margins) {
            if (!margins) return null;
            const kids = [];
            for (const edge of MARGIN_EDGES) {
                if (margins[edge]) kids.push(renderWidth('w:' + edge, margins[edge]));
            }
            if (margins._extras) for (const ex of margins._extras) kids.push(ex);
            if (!kids.length) return null;
            return xml.el('w:tblCellMar', {}, kids);
        }

        // The CT_TblPr children that follow `w:tblCellMar` in the schema:
        // verbatim `_extras` of these names render after the typed margins,
        // every other extra before them, so a schema-ordered source keeps
        // its order.
        const AFTER_CELL_MARGINS = new Set(['w:tblLook', 'w:tblCaption', 'w:tblDescription', 'w:tblPrChange']);

        function parseTableProperties(tblPrEl) {
            if (!tblPrEl) return undefined;
            const out = {};
            const extras = [];
            let any = false;
            for (const c of tblPrEl.children) {
                if (c.type !== 'element') continue;
                any = true;
                switch (c.name) {
                    case 'w:tblStyle': out.style = valOf(c); break;
                    case 'w:tblW': out.width = parseWidth(c); break;
                    case 'w:tblBorders': out.borders = parseTableBorders(c); break;
                    case 'w:tblCellMar': out.cellMargins = parseCellMargins(c); break;
                    default: extras.push(c);
                }
            }
            if (!any) return undefined;
            if (extras.length) out._extras = extras;
            return out;
        }

        // Schema order inside <w:tblPr>: tblStyle, tblW, tblBorders, the
        // verbatim extras that precede tblCellMar in the schema, tblCellMar,
        // then the extras that follow it (tblLook, tblCaption, ...).
        function renderTableProperties(tblPr) {
            if (!tblPr) return null;
            const children = [];
            if (tblPr.style != null) children.push(elVal('w:tblStyle', tblPr.style));
            if (tblPr.width) children.push(renderWidth('w:tblW', tblPr.width));
            const bordersEl = renderTableBorders(tblPr.borders);
            if (bordersEl) children.push(bordersEl);
            const extras = tblPr._extras || [];
            const isAfter = ex => ex.type === 'element' && AFTER_CELL_MARGINS.has(ex.name);
            for (const ex of extras) if (!isAfter(ex)) children.push(ex);
            const marginsEl = renderCellMargins(tblPr.cellMargins);
            if (marginsEl) children.push(marginsEl);
            for (const ex of extras) if (isAfter(ex)) children.push(ex);
            if (!children.length) return null;
            return xml.el('w:tblPr', {}, children);
        }

        return {
            parseRunProperties, renderRunProperties,
            parseParagraphProperties, renderParagraphProperties,
            parseTableProperties, renderTableProperties,
            readToggle, writeToggle, valOf, elVal
        };
    }
};
