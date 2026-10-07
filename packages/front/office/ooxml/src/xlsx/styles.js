// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML styles part — `xl/styles.xml` (ECMA-376
 * part 1 §18.8).
 *
 * The styles part is the registry that cells point into via the `s`
 * attribute. It contains six indexed tables :
 *
 * | Table | Cell field | Purpose |
 * |-------|-----------|---------|
 * | `numFmts` | `numFmtId` | Format codes (`"0.00%"`, `"yyyy-mm-dd"`). Built-in IDs 0–163 are predefined ; user-defined start at 164. |
 * | `fonts` | `fontId` | Typeface, size, color, bold/italic/underline/strike. |
 * | `fills` | `fillId` | Solid fill, pattern, gradient. |
 * | `borders` | `borderId` | Per-side line style and color. |
 * | `cellStyleXfs` | (referenced by `cellStyles`) | Style templates. |
 * | `cellXfs` | `s` | Concrete cell formats — combination of the above. |
 *
 * `cellStyles` names a `cellStyleXfs` entry (e.g. `"Normal"`, `"Heading 1"`)
 * and is what the Excel UI shows in the style picker.
 *
 * Document model :
 *
 * ```js
 * {
 *   numFmts: [{ id, formatCode }],
 *   fonts: [{ size?, color?, name?, family?, bold?, italic?, underline?, strike? }],
 *   fills: [{ patternType, fgColor?, bgColor? }],
 *   borders: [{ left?, right?, top?, bottom?, diagonal?, diagonalUp?, diagonalDown? }],
 *   cellStyleXfs: [xf],
 *   cellXfs: [xf],
 *   cellStyles: [{ name, xfId, builtinId? }],
 *   _extras?: [xmlNode]
 * }
 *
 * xf := {
 *   numFmtId?, fontId?, fillId?, borderId?, xfId?,
 *   applyFont?, applyFill?, applyBorder?, applyNumberFormat?, applyAlignment?,
 *   alignment?: {
 *     horizontal?, vertical?, wrapText?, indent?, textRotation?, shrinkToFit?
 *   }
 * }
 *
 * borderSide := { style?, color? }   // style: 'thin'|'medium'|'thick'|…
 * color := { rgb?: 'AARRGGBB', theme?: number, tint?: number, indexed?: number }
 * ```
 *
 * @module ooxml/xlsx/styles
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsxStyles = {
    name: 'xlsxStyles',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared;

        const SS_NS = NS.SS;
        const REL_TYPE_STYLES = REL_TYPE.STYLES;
        const CT_STYLES = CT.STYLES_X;

        // --- Toggle helpers (font flags use <b/> and similar) ---
        function readToggle(el) {
            if (!el) return undefined;
            const v = el.attrs.val;
            if (v === undefined) return true;
            return !(v === '0' || v === 'false');
        }

        function elFlag(name, val) {
            // Excel convention: presence with no `val` = on. We always emit
            // explicitly to match what Excel produces.
            return val ? xml.el(name, {}) : null;
        }

        // --- Color (<color>) — backed by the shared xlsx color codec
        //     (handles the full `rgb` / `theme` / `tint` / `indexed` /
        //     `auto` attribute set ; absent fields are omitted on
        //     render, preserving the historical no-`auto` round-trip
        //     guarantee).
        const _xlsxColor = shared.createXlsxColorCodec(xml);
        const parseColor = _xlsxColor.parseColor;
        const renderColor = _xlsxColor.renderColor;

        // --- Number formats ---

        function parseNumFmts(el) {
            const out = [];
            for (const c of xml.findAll(el, 'numFmt')) {
                out.push({
                    id: Number(c.attrs.numFmtId),
                    formatCode: c.attrs.formatCode
                });
            }
            return out;
        }

        function renderNumFmts(numFmts) {
            if (!numFmts || !numFmts.length) return null;
            return xml.el('numFmts', { count: String(numFmts.length) },
                numFmts.map(f => xml.el('numFmt', {
                    numFmtId: String(f.id),
                    formatCode: f.formatCode
                })));
        }

        // --- Fonts ---

        function parseFont(fEl) {
            const out = {};
            const extras = [];
            for (const c of fEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'sz':        out.size = Number(c.attrs.val); break;
                    case 'name':      out.name = c.attrs.val; break;
                    case 'family':    out.family = Number(c.attrs.val); break;
                    case 'color':     out.color = parseColor(c); break;
                    case 'b':         out.bold = readToggle(c); break;
                    case 'i':         out.italic = readToggle(c); break;
                    case 'strike':    out.strike = readToggle(c); break;
                    case 'u':         out.underline = c.attrs.val || 'single'; break;
                    case 'vertAlign': out.vertAlign = c.attrs.val; break;
                    case 'scheme':    out.scheme = c.attrs.val; break;
                    case 'charset':   out.charset = Number(c.attrs.val); break;
                    default:          extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderFont(f) {
            const children = [];
            // ECMA-376 schema order is fairly loose; match what Excel emits.
            if (f.bold !== undefined)   children.push(elFlag('b', f.bold) || xml.el('b', { val: '0' }));
            if (f.italic !== undefined) children.push(elFlag('i', f.italic) || xml.el('i', { val: '0' }));
            if (f.strike !== undefined) children.push(elFlag('strike', f.strike) || xml.el('strike', { val: '0' }));
            if (f.underline)            children.push(xml.el('u', { val: f.underline }));
            if (f.vertAlign)            children.push(xml.el('vertAlign', { val: f.vertAlign }));
            if (f.size != null)         children.push(xml.el('sz', { val: String(f.size) }));
            if (f.color)                children.push(renderColor('color', f.color));
            if (f.name != null)         children.push(xml.el('name', { val: f.name }));
            if (f.family != null)       children.push(xml.el('family', { val: String(f.family) }));
            if (f.charset != null)      children.push(xml.el('charset', { val: String(f.charset) }));
            if (f.scheme)               children.push(xml.el('scheme', { val: f.scheme }));
            if (f._extras) for (const ex of f._extras) children.push(ex);
            return xml.el('font', {}, children.filter(Boolean));
        }

        // --- Fills ---

        function parseFill(fEl) {
            // <fill> contains exactly one of <patternFill> or <gradientFill>.
            const patt = xml.findChild(fEl, 'patternFill');
            if (patt) {
                const out = { patternType: patt.attrs.patternType || 'none' };
                const fg = xml.findChild(patt, 'fgColor');
                const bg = xml.findChild(patt, 'bgColor');
                if (fg) out.fgColor = parseColor(fg);
                if (bg) out.bgColor = parseColor(bg);
                return out;
            }
            const grad = xml.findChild(fEl, 'gradientFill');
            if (grad) {
                // Gradient fills are uncommon — preserve verbatim.
                return { gradient: grad };
            }
            return { patternType: 'none' };
        }

        function renderFill(f) {
            if (f.gradient) {
                return xml.el('fill', {}, [f.gradient]);
            }
            const children = [];
            if (f.fgColor) children.push(renderColor('fgColor', f.fgColor));
            if (f.bgColor) children.push(renderColor('bgColor', f.bgColor));
            const patt = xml.el('patternFill',
                { patternType: f.patternType || 'none' }, children);
            return xml.el('fill', {}, [patt]);
        }

        // --- Borders ---

        const SIDE_TAGS = ['left', 'right', 'top', 'bottom',
                           'diagonal', 'vertical', 'horizontal'];

        function parseSide(sEl) {
            if (!sEl) return undefined;
            const out = {};
            if (sEl.attrs.style) out.style = sEl.attrs.style;
            const color = xml.findChild(sEl, 'color');
            if (color) out.color = parseColor(color);
            // Empty side elements (`<left/>`) carry meaning — they declare the
            // side as "no specific style". Preserve them as `{}` so render
            // and parse stay symmetric.
            return out;
        }

        function renderSide(name, side) {
            if (!side) return xml.el(name, {});
            const a = {};
            if (side.style) a.style = side.style;
            const children = [];
            if (side.color) children.push(renderColor('color', side.color));
            return xml.el(name, a, children);
        }

        function parseBorder(bEl) {
            const out = {};
            for (const tag of SIDE_TAGS) {
                const s = parseSide(xml.findChild(bEl, tag));
                if (s) out[tag] = s;
            }
            if (bEl.attrs.diagonalUp === '1')   out.diagonalUp = true;
            if (bEl.attrs.diagonalDown === '1') out.diagonalDown = true;
            return out;
        }

        function renderBorder(b) {
            const a = {};
            if (b.diagonalUp)   a.diagonalUp = '1';
            if (b.diagonalDown) a.diagonalDown = '1';
            // Excel canonical order: left, right, top, bottom, diagonal —
            // emitted unconditionally so the schema is stable even when
            // a side is absent from the input. `vertical` / `horizontal`
            // are inner borders (used for ranges / dxfs) — emitted only
            // when explicitly set.
            const children = [];
            for (const tag of ['left', 'right', 'top', 'bottom', 'diagonal']) {
                children.push(renderSide(tag, b[tag]));
            }
            for (const tag of ['vertical', 'horizontal']) {
                if (b[tag]) children.push(renderSide(tag, b[tag]));
            }
            return xml.el('border', a, children);
        }

        // --- xf (cell format) ---

        function parseXf(el) {
            const out = {};
            const a = el.attrs;
            if (a.numFmtId != null) out.numFmtId = Number(a.numFmtId);
            if (a.fontId != null)   out.fontId = Number(a.fontId);
            if (a.fillId != null)   out.fillId = Number(a.fillId);
            if (a.borderId != null) out.borderId = Number(a.borderId);
            if (a.xfId != null)     out.xfId = Number(a.xfId);
            const flags = ['applyNumberFormat', 'applyFont', 'applyFill',
                           'applyBorder', 'applyAlignment', 'applyProtection'];
            for (const f of flags) {
                if (a[f] != null) out[f] = readBoolAttr(a[f]);
            }
            const align = xml.findChild(el, 'alignment');
            if (align) {
                const al = {};
                for (const k of ['horizontal', 'vertical']) {
                    if (align.attrs[k]) al[k] = align.attrs[k];
                }
                if (align.attrs.wrapText)     al.wrapText = readBoolAttr(align.attrs.wrapText);
                if (align.attrs.shrinkToFit)  al.shrinkToFit = readBoolAttr(align.attrs.shrinkToFit);
                if (align.attrs.indent)       al.indent = Number(align.attrs.indent);
                if (align.attrs.textRotation) al.textRotation = Number(align.attrs.textRotation);
                if (Object.keys(al).length) out.alignment = al;
            }
            return out;
        }

        function renderXf(xf) {
            const a = {};
            if (xf.numFmtId != null) a.numFmtId = String(xf.numFmtId);
            if (xf.fontId != null)   a.fontId   = String(xf.fontId);
            if (xf.fillId != null)   a.fillId   = String(xf.fillId);
            if (xf.borderId != null) a.borderId = String(xf.borderId);
            if (xf.xfId != null)     a.xfId     = String(xf.xfId);
            for (const f of ['applyNumberFormat', 'applyFont', 'applyFill',
                              'applyBorder', 'applyAlignment', 'applyProtection']) {
                if (xf[f] != null) a[f] = writeBoolAttr(xf[f]);
            }
            const children = [];
            if (xf.alignment) {
                const al = xf.alignment;
                const at = {};
                if (al.horizontal)        at.horizontal = al.horizontal;
                if (al.vertical)          at.vertical = al.vertical;
                if (al.wrapText != null)  at.wrapText = writeBoolAttr(al.wrapText);
                if (al.shrinkToFit != null) at.shrinkToFit = writeBoolAttr(al.shrinkToFit);
                if (al.indent != null)    at.indent = String(al.indent);
                if (al.textRotation != null) at.textRotation = String(al.textRotation);
                children.push(xml.el('alignment', at));
            }
            return xml.el('xf', a, children);
        }

        // --- cellStyles (UI-named styles) ---

        function parseCellStyle(el) {
            const out = { name: el.attrs.name, xfId: Number(el.attrs.xfId) };
            if (el.attrs.builtinId != null) out.builtinId = Number(el.attrs.builtinId);
            return out;
        }

        function renderCellStyle(s) {
            const a = { name: s.name, xfId: String(s.xfId) };
            if (s.builtinId != null) a.builtinId = String(s.builtinId);
            return xml.el('cellStyle', a);
        }

        // --- Top-level parse / serialize ---

        // --- dxf (differential format — used by conditional formatting) ---
        // ECMA-376 §18.8.14. A dxf records only the *changes* a CF rule
        // applies on top of the cell's normal style. Same building blocks
        // as a full xf (font/fill/border/numFmt/alignment) but every
        // sub-element is optional.

        function parseDxf(el) {
            const out = {};
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'font':   out.font = parseFont(c); break;
                    case 'fill':   out.fill = parseFill(c); break;
                    case 'border': out.border = parseBorder(c); break;
                    case 'numFmt':
                        out.numFmt = {
                            id: Number(c.attrs.numFmtId),
                            formatCode: c.attrs.formatCode
                        };
                        break;
                    case 'alignment': {
                        const a = {};
                        if (c.attrs.horizontal)   a.horizontal = c.attrs.horizontal;
                        if (c.attrs.vertical)     a.vertical = c.attrs.vertical;
                        if (c.attrs.wrapText)     a.wrapText = readBoolAttr(c.attrs.wrapText);
                        if (c.attrs.indent)       a.indent = Number(c.attrs.indent);
                        if (c.attrs.textRotation) a.textRotation = Number(c.attrs.textRotation);
                        out.alignment = a;
                        break;
                    }
                    default: extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderDxf(d) {
            const children = [];
            if (d.font)   children.push(renderFont(d.font));
            if (d.numFmt) children.push(xml.el('numFmt', {
                numFmtId: String(d.numFmt.id),
                formatCode: d.numFmt.formatCode
            }));
            if (d.fill)   children.push(renderFill(d.fill));
            if (d.alignment) {
                const a = {};
                if (d.alignment.horizontal)        a.horizontal = d.alignment.horizontal;
                if (d.alignment.vertical)          a.vertical = d.alignment.vertical;
                if (d.alignment.wrapText != null)  a.wrapText = writeBoolAttr(d.alignment.wrapText);
                if (d.alignment.indent != null)    a.indent = String(d.alignment.indent);
                if (d.alignment.textRotation != null) a.textRotation = String(d.alignment.textRotation);
                children.push(xml.el('alignment', a));
            }
            if (d.border) children.push(renderBorder(d.border));
            if (d._extras) for (const ex of d._extras) children.push(ex);
            return xml.el('dxf', {}, children);
        }

        // --- tableStyles (preserved verbatim) ---
        // ECMA-376 §18.8.42. Custom table style definitions — rare and
        // schema-heavy ; we preserve as raw XML.

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'styleSheet') {
                throw new ParseError('xlsx/styles-bad-root', `xlsx styles: expected <styleSheet>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = {
                numFmts: [], fonts: [], fills: [], borders: [],
                cellStyleXfs: [], cellXfs: [], cellStyles: [], dxfs: []
            };
            const extras = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'numFmts':      out.numFmts = parseNumFmts(c); break;
                    case 'fonts':        out.fonts = xml.findAll(c, 'font').map(parseFont); break;
                    case 'fills':        out.fills = xml.findAll(c, 'fill').map(parseFill); break;
                    case 'borders':      out.borders = xml.findAll(c, 'border').map(parseBorder); break;
                    case 'cellStyleXfs': out.cellStyleXfs = xml.findAll(c, 'xf').map(parseXf); break;
                    case 'cellXfs':      out.cellXfs = xml.findAll(c, 'xf').map(parseXf); break;
                    case 'cellStyles':   out.cellStyles = xml.findAll(c, 'cellStyle').map(parseCellStyle); break;
                    case 'dxfs':         out.dxfs = xml.findAll(c, 'dxf').map(parseDxf); break;
                    case 'tableStyles':  out.tableStyles = c; break;   // verbatim
                    default:             extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function countWrap(name, items, renderer) {
            if (!items || !items.length) return null;
            return xml.el(name, { count: String(items.length) },
                items.map(renderer));
        }

        function serialize(obj) {
            const children = [];
            const numFmts = renderNumFmts(obj.numFmts);
            if (numFmts) children.push(numFmts);
            const fonts = countWrap('fonts', obj.fonts, renderFont);
            if (fonts) children.push(fonts);
            const fills = countWrap('fills', obj.fills, renderFill);
            if (fills) children.push(fills);
            const borders = countWrap('borders', obj.borders, renderBorder);
            if (borders) children.push(borders);
            const csxf = countWrap('cellStyleXfs', obj.cellStyleXfs, renderXf);
            if (csxf) children.push(csxf);
            const cxf = countWrap('cellXfs', obj.cellXfs, renderXf);
            if (cxf) children.push(cxf);
            const cs = countWrap('cellStyles', obj.cellStyles, renderCellStyle);
            if (cs) children.push(cs);
            const dxfs = countWrap('dxfs', obj.dxfs, renderDxf);
            if (dxfs) children.push(dxfs);
            if (obj.tableStyles) children.push(obj.tableStyles);
            if (obj._extras) for (const ex of obj._extras) children.push(ex);
            return xml.serialize(xml.el('styleSheet',
                { xmlns: SS_NS }, children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        // --- Defaults (Excel-compatible minimum) ---
        // Excel always emits at least one font, one fill ('none'), one
        // ('gray125' as a workaround per the spec), one border, one xf.
        // Without these, Excel rejects the workbook.
        function defaults() {
            return {
                numFmts: [],
                fonts: [{ size: 11, name: 'Calibri', family: 2, scheme: 'minor' }],
                fills: [
                    { patternType: 'none' },
                    { patternType: 'gray125' }
                ],
                borders: [{ left: {}, right: {}, top: {}, bottom: {}, diagonal: {} }],
                cellStyleXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 }],
                cellXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 }],
                cellStyles: [{ name: 'Normal', xfId: 0, builtinId: 0 }],
                dxfs: []
            };
        }

        /**
         * Append `dxfs` to a styles object and return the parallel array
         * of dxfId indices the caller should use in its CF rules.
         */
        function withDxfs(stylesObj, dxfs) {
            stylesObj.dxfs = stylesObj.dxfs || [];
            const indices = [];
            for (const d of dxfs) {
                indices.push(stylesObj.dxfs.length);
                stylesObj.dxfs.push(d);
            }
            return indices;
        }

        /**
         * Build a styles object on top of `defaults()` and add the given
         * `xfs` to the cellXfs table. Returns `{ styles, indices }` where
         * `indices` is parallel to the input `xfs`.
         */
        function withCellXfs(xfs) {
            const styles = defaults();
            const indices = [];
            for (const xf of xfs) {
                indices.push(styles.cellXfs.length);
                styles.cellXfs.push(Object.assign({ xfId: 0 }, xf));
            }
            return { styles, indices };
        }

        return {
            parse, serialize, bytesOf, defaults, withCellXfs, withDxfs,
            parseFont, renderFont,
            parseFill, renderFill,
            parseBorder, renderBorder,
            parseXf, renderXf,
            parseDxf, renderDxf,
            parseColor, renderColor,
            REL_TYPE_STYLES, CT_STYLES
        };
    }
};
