// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed sheet-level config (sheetPr, dimension,
 * sheetFormatPr, page setup, headers/footers, breaks, custom views,
 * phoneticPr, sheetCalcPr).
 *
 * Element names use no namespace prefix — SpreadsheetML's default
 * namespace is `http://schemas.openxmlformats.org/spreadsheetml/2006/main`.
 *
 * @module ooxml/extra/sml-sheet-config
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const smlSheetConfig = {
    name: 'smlSheetConfig',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const SHEET_PR_ATTRS = ['codeName', 'enableFormatConditionsCalculation',
            'filterMode', 'published', 'syncHorizontal', 'syncRef',
            'syncVertical', 'transitionEntry', 'transitionEvaluation'];

        const SHEET_FORMAT_ATTRS = ['baseColWidth', 'defaultColWidth',
            'defaultRowHeight', 'customHeight', 'zeroHeight', 'thickTop',
            'thickBottom', 'outlineLevelRow', 'outlineLevelCol'];

        const PRINT_OPTS_ATTRS = ['horizontalCentered', 'verticalCentered',
            'headings', 'gridLines', 'gridLinesSet'];

        const PAGE_MARGINS_ATTRS = ['left', 'right', 'top', 'bottom', 'header', 'footer'];

        const PAGE_SETUP_ATTRS = ['paperSize', 'paperHeight', 'paperWidth',
            'scale', 'firstPageNumber', 'fitToWidth', 'fitToHeight',
            'pageOrder', 'orientation', 'usePrinterDefaults', 'blackAndWhite',
            'draft', 'cellComments', 'useFirstPageNumber', 'errors',
            'horizontalDpi', 'verticalDpi', 'copies', 'r:id'];

        const HEADER_FOOTER_ATTRS = ['differentOddEven', 'differentFirst',
            'scaleWithDoc', 'alignWithMargins'];

        function pickAttrs(src, list) {
            const out = {};
            for (const k of list) if (src[k] != null) out[k] = src[k];
            return out;
        }
        function strAttrs(src, list) {
            const out = {};
            for (const k of list) if (src[k] != null) out[k] = String(src[k]);
            return out;
        }

        function parseSheetPr(node) {
            if (!node) return undefined;
            const out = pickAttrs(node.attrs || {}, SHEET_PR_ATTRS);
            const tabColor = xml.findChild(node, 'tabColor');
            if (tabColor) out.tabColor = { ...tabColor.attrs };
            const outlinePr = xml.findChild(node, 'outlinePr');
            if (outlinePr) out.outlinePr = { ...outlinePr.attrs };
            const pageSetUpPr = xml.findChild(node, 'pageSetUpPr');
            if (pageSetUpPr) out.pageSetUpPr = { ...pageSetUpPr.attrs };
            return out;
        }

        function renderSheetPr(s) {
            const a = strAttrs(s, SHEET_PR_ATTRS);
            const kids = [];
            if (s.tabColor) kids.push(xml.el('tabColor', strAttrs(s.tabColor, Object.keys(s.tabColor))));
            if (s.outlinePr) kids.push(xml.el('outlinePr', strAttrs(s.outlinePr, Object.keys(s.outlinePr))));
            if (s.pageSetUpPr) kids.push(xml.el('pageSetUpPr', strAttrs(s.pageSetUpPr, Object.keys(s.pageSetUpPr))));
            return xml.el('sheetPr', a, kids);
        }

        function parseHeaderFooter(node) {
            if (!node) return undefined;
            const out = { attrs: pickAttrs(node.attrs || {}, HEADER_FOOTER_ATTRS) };
            const oh = xml.findChild(node, 'oddHeader');     if (oh) out.oddHeader = xml.textContent(oh);
            const of = xml.findChild(node, 'oddFooter');     if (of) out.oddFooter = xml.textContent(of);
            const eh = xml.findChild(node, 'evenHeader');    if (eh) out.evenHeader = xml.textContent(eh);
            const ef = xml.findChild(node, 'evenFooter');    if (ef) out.evenFooter = xml.textContent(ef);
            const fh = xml.findChild(node, 'firstHeader');   if (fh) out.firstHeader = xml.textContent(fh);
            const ff = xml.findChild(node, 'firstFooter');   if (ff) out.firstFooter = xml.textContent(ff);
            return out;
        }
        function renderHeaderFooter(h) {
            const kids = [];
            if (h.oddHeader   != null) kids.push(xml.el('oddHeader',   {}, [xml.text(h.oddHeader)]));
            if (h.oddFooter   != null) kids.push(xml.el('oddFooter',   {}, [xml.text(h.oddFooter)]));
            if (h.evenHeader  != null) kids.push(xml.el('evenHeader',  {}, [xml.text(h.evenHeader)]));
            if (h.evenFooter  != null) kids.push(xml.el('evenFooter',  {}, [xml.text(h.evenFooter)]));
            if (h.firstHeader != null) kids.push(xml.el('firstHeader', {}, [xml.text(h.firstHeader)]));
            if (h.firstFooter != null) kids.push(xml.el('firstFooter', {}, [xml.text(h.firstFooter)]));
            return xml.el('headerFooter', strAttrs(h.attrs || {}, HEADER_FOOTER_ATTRS), kids);
        }

        function parseBreaks(node) {
            if (!node) return undefined;
            const items = [];
            for (const b of node.children || []) {
                if (b.type === 'element' && b.name === 'brk') items.push({ ...b.attrs });
            }
            return {
                count: node.attrs.count,
                manualBreakCount: node.attrs.manualBreakCount,
                items
            };
        }
        function _breakAttrs(b) {
            const a = {};
            if (b.count != null) a.count = String(b.count);
            if (b.manualBreakCount != null) a.manualBreakCount = String(b.manualBreakCount);
            return a;
        }
        function _breakKids(b) {
            return (b.items || []).map(i => xml.el('brk', strAttrs(i, Object.keys(i))));
        }
        function renderRowBreaks(b) { return xml.el('rowBreaks', _breakAttrs(b), _breakKids(b)); }
        function renderColBreaks(b) { return xml.el('colBreaks', _breakAttrs(b), _breakKids(b)); }
        function renderBreaks(name, b) {
            return name === 'rowBreaks' ? renderRowBreaks(b) : renderColBreaks(b);
        }

        function parseCustomSheetView(c) {
            const out = { attrs: { ...c.attrs } };
            const pm = xml.findChild(c, 'pageMargins');
            if (pm) out.pageMargins = pickAttrs(pm.attrs, PAGE_MARGINS_ATTRS);
            const ps = xml.findChild(c, 'pageSetup');
            if (ps) out.pageSetup = pickAttrs(ps.attrs, PAGE_SETUP_ATTRS);
            const po = xml.findChild(c, 'printOptions');
            if (po) out.printOptions = pickAttrs(po.attrs, PRINT_OPTS_ATTRS);
            const hf = xml.findChild(c, 'headerFooter');
            if (hf) out.headerFooter = parseHeaderFooter(hf);
            const rb = xml.findChild(c, 'rowBreaks');
            if (rb) out.rowBreaks = parseBreaks(rb);
            const cb = xml.findChild(c, 'colBreaks');
            if (cb) out.colBreaks = parseBreaks(cb);
            return out;
        }
        function renderCustomSheetView(v) {
            const kids = [];
            if (v.pageMargins) kids.push(xml.el('pageMargins', strAttrs(v.pageMargins, PAGE_MARGINS_ATTRS)));
            if (v.pageSetup) kids.push(xml.el('pageSetup', strAttrs(v.pageSetup, PAGE_SETUP_ATTRS)));
            if (v.printOptions) kids.push(xml.el('printOptions', strAttrs(v.printOptions, PRINT_OPTS_ATTRS)));
            if (v.headerFooter) kids.push(renderHeaderFooter(v.headerFooter));
            if (v.rowBreaks) kids.push(renderBreaks('rowBreaks', v.rowBreaks));
            if (v.colBreaks) kids.push(renderBreaks('colBreaks', v.colBreaks));
            return xml.el('customSheetView', { ...(v.attrs || {}) }, kids);
        }

        function parseSheetConfig(rootChildren) {
            const out = {};
            for (const c of rootChildren) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'sheetPr':       out.sheetPr = parseSheetPr(c); break;
                    case 'dimension':     out.dimension = c.attrs.ref; break;
                    case 'sheetFormatPr': out.sheetFormatPr = pickAttrs(c.attrs, SHEET_FORMAT_ATTRS); break;
                    case 'sheetCalcPr':   out.sheetCalcPr = { ...c.attrs }; break;
                    case 'phoneticPr':    out.phoneticPr = { ...c.attrs }; break;
                    case 'printOptions':  out.printOptions = pickAttrs(c.attrs, PRINT_OPTS_ATTRS); break;
                    case 'pageMargins':   out.pageMargins = pickAttrs(c.attrs, PAGE_MARGINS_ATTRS); break;
                    case 'pageSetup':     out.pageSetup = pickAttrs(c.attrs, PAGE_SETUP_ATTRS); break;
                    case 'headerFooter':  out.headerFooter = parseHeaderFooter(c); break;
                    case 'rowBreaks':     out.rowBreaks = parseBreaks(c); break;
                    case 'colBreaks':     out.colBreaks = parseBreaks(c); break;
                    case 'sheetProtection': out.sheetProtection = { ...c.attrs }; break;
                    case 'protectedRanges': {
                        out.protectedRanges = [];
                        for (const pr of c.children || []) {
                            if (pr.type === 'element' && pr.name === 'protectedRange') {
                                out.protectedRanges.push({ ...pr.attrs });
                            }
                        }
                        break;
                    }
                    case 'customSheetViews': {
                        out.customSheetViews = [];
                        for (const v of c.children || []) {
                            if (v.type === 'element' && v.name === 'customSheetView') {
                                out.customSheetViews.push(parseCustomSheetView(v));
                            }
                        }
                        break;
                    }
                }
            }
            return out;
        }

        function renderSheetConfig(s) {
            const out = [];
            if (s.sheetPr)         out.push(renderSheetPr(s.sheetPr));
            if (s.dimension)       out.push(xml.el('dimension', { ref: String(s.dimension) }));
            if (s.sheetFormatPr)   out.push(xml.el('sheetFormatPr', strAttrs(s.sheetFormatPr, SHEET_FORMAT_ATTRS)));
            if (s.sheetCalcPr)     out.push(xml.el('sheetCalcPr', strAttrs(s.sheetCalcPr, Object.keys(s.sheetCalcPr))));
            if (s.phoneticPr)      out.push(xml.el('phoneticPr', strAttrs(s.phoneticPr, Object.keys(s.phoneticPr))));
            if (s.printOptions)    out.push(xml.el('printOptions', strAttrs(s.printOptions, PRINT_OPTS_ATTRS)));
            if (s.pageMargins)     out.push(xml.el('pageMargins', strAttrs(s.pageMargins, PAGE_MARGINS_ATTRS)));
            if (s.pageSetup)       out.push(xml.el('pageSetup', strAttrs(s.pageSetup, PAGE_SETUP_ATTRS)));
            if (s.headerFooter)    out.push(renderHeaderFooter(s.headerFooter));
            if (s.rowBreaks)       out.push(renderBreaks('rowBreaks', s.rowBreaks));
            if (s.colBreaks)       out.push(renderBreaks('colBreaks', s.colBreaks));
            if (s.sheetProtection) out.push(xml.el('sheetProtection', strAttrs(s.sheetProtection, Object.keys(s.sheetProtection))));
            if (s.protectedRanges) {
                out.push(xml.el('protectedRanges', {},
                    s.protectedRanges.map(p => xml.el('protectedRange', strAttrs(p, Object.keys(p))))));
            }
            if (s.customSheetViews) {
                out.push(xml.el('customSheetViews', {},
                    s.customSheetViews.map(renderCustomSheetView)));
            }
            return out;
        }

        return {
            parseSheetConfig, renderSheetConfig,
            parseSheetPr, renderSheetPr,
            parseHeaderFooter, renderHeaderFooter,
            parseBreaks, renderBreaks,
            parseCustomSheetView, renderCustomSheetView
        };
    }
};
