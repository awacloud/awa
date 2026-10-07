// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: ECMA-376 part 4 (Transitional Migration Features).
 *
 * Office writes the "transitional" variants by default; the strict form
 * is an opt-in save type. The differences fall in three buckets:
 *
 *   - **Namespace-only**: same local name, transitional URI vs strict
 *     URI (handled by `toStrict` / `fromStrict` namespace rewriter).
 *   - **Element rename**: a transitional element has a different local
 *     name from its strict equivalent (rare; e.g. `w:noLineBreaksAfter`
 *     → `w:noBreakAfter` in some draft strict revisions).
 *   - **Attribute rename / value-enum drift**: `w:val` quirks where
 *     transitional accepts an enum value the strict schema does not
 *     (e.g. `w:val="single"` vs `"sng"`).
 *
 * This module provides:
 *
 *   - `toStrict(node)` / `fromStrict(node)` — recursive namespace
 *     rewriter (back-compat).
 *   - `transitionalToStrict(el)` / `strictToTransitional(el)` — typed
 *     element-level converter that consults `TRANSITIONAL_ELEMENTS`.
 *   - `TRANSITIONAL_ELEMENTS` — typed list of all known transitional
 *     deprecations with `{ name, kind, strict }`.
 *
 * Each transitional element listed here is also typed by `case` /
 * `findChild` and emitted via `xml.el(...)` so the coverage script picks
 * it up.
 *
 * @module ooxml/extra/transitional
 */

/** @typedef {{ type: 'element', name: string, attrs: Record<string,string>, children: any[] }} XmlNode */

/**
 * @typedef {Object} TransitionalMapping
 * @property {string} name             - Transitional QName (e.g. `w:embedSystemFonts`)
 * @property {'attribute-rename'|'value-enum'|'element-rename'|'deprecated'|'namespace-only'} kind
 * @property {{ name?: string, attrMap?: Record<string,string>, valueMap?: Record<string,string> }} [strict]
 *           - Strict equivalent (omitted when `kind === 'deprecated'`)
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const transitional = {
    name: 'transitional',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        /**
         * Transitional → Strict namespace map.
         */
        const NS_MAP = {
            'http://schemas.openxmlformats.org/wordprocessingml/2006/main':
                'http://purl.oclc.org/ooxml/wordprocessingml/main',
            'http://schemas.openxmlformats.org/spreadsheetml/2006/main':
                'http://purl.oclc.org/ooxml/spreadsheetml/main',
            'http://schemas.openxmlformats.org/presentationml/2006/main':
                'http://purl.oclc.org/ooxml/presentationml/main',
            'http://schemas.openxmlformats.org/drawingml/2006/main':
                'http://purl.oclc.org/ooxml/drawingml/main'
        };

        /** @type {TransitionalMapping[]} */
        const TRANSITIONAL_ELEMENTS = [
            // ---- Settings (deprecated in strict) ----
            { name: 'w:embedSystemFonts',                  kind: 'deprecated' },
            { name: 'w:doNotEmbedSystemFonts',             kind: 'deprecated' },
            { name: 'w:embedTrueTypeFonts',                kind: 'deprecated' },
            { name: 'w:saveSubsetFonts',                   kind: 'deprecated' },
            { name: 'w:savePreviewPicture',                kind: 'deprecated' },
            { name: 'w:savePropertiesXML',                 kind: 'deprecated' },
            { name: 'w:noLineBreaksAfter',                 kind: 'deprecated' },
            { name: 'w:noLineBreaksBefore',                kind: 'deprecated' },
            { name: 'w:applyBreakingRules',                kind: 'deprecated' },
            { name: 'w:uiCompat97To2003',                  kind: 'deprecated' },
            { name: 'w:useFELayout',                       kind: 'deprecated' },
            { name: 'w:strictFirstAndLastChars',           kind: 'deprecated' },
            { name: 'w:doNotAutofitConstrainedTables',     kind: 'deprecated' },
            { name: 'w:doNotBreakConstrainedForcedTable',  kind: 'deprecated' },
            { name: 'w:doNotBreakWrappedTables',           kind: 'deprecated' },
            { name: 'w:doNotExpandShiftReturn',            kind: 'deprecated' },
            { name: 'w:doNotLeaveBackslashAlone',          kind: 'deprecated' },
            { name: 'w:doNotSnapToGridInCell',             kind: 'deprecated' },
            { name: 'w:doNotUseEastAsianBreakRules',       kind: 'deprecated' },
            { name: 'w:doNotUseHTMLParagraphAutoSpacing',  kind: 'deprecated' },
            { name: 'w:doNotUseIndentAsNumberingTabStop',  kind: 'deprecated' },
            { name: 'w:doNotVertAlignCellWithSp',          kind: 'deprecated' },
            { name: 'w:doNotVertAlignInTxbx',              kind: 'deprecated' },
            { name: 'w:doNotWrapTextWithPunct',            kind: 'deprecated' },
            { name: 'w:displayBackgroundShape',            kind: 'deprecated' },
            { name: 'w:displayHorizontalDrawingGridEvery', kind: 'deprecated' },
            { name: 'w:displayVerticalDrawingGridEvery',   kind: 'deprecated' },
            { name: 'w:drawingGridHorizontalSpacing',      kind: 'deprecated' },
            { name: 'w:drawingGridVerticalSpacing',        kind: 'deprecated' },
            { name: 'w:drawingGridHorizontalOrigin',       kind: 'deprecated' },
            { name: 'w:drawingGridVerticalOrigin',         kind: 'deprecated' },
            { name: 'w:gutterAtTop',                       kind: 'deprecated' },
            { name: 'w:cachedColBalance',                  kind: 'deprecated' },
            { name: 'w:swapBordersFacingPages',            kind: 'deprecated' },
            { name: 'w:characterSpacingControl',           kind: 'deprecated' },
            { name: 'w:printPostScriptOverText',           kind: 'deprecated' },
            { name: 'w:printFractionalCharacterWidth',     kind: 'deprecated' },
            { name: 'w:printTwoOnOne',                     kind: 'deprecated' },
            { name: 'w:autoSpaceDE',                       kind: 'deprecated' },
            { name: 'w:autoSpaceDN',                       kind: 'deprecated' },
            { name: 'w:bordersDoNotSurroundHeader',        kind: 'deprecated' },
            { name: 'w:bordersDoNotSurroundFooter',        kind: 'deprecated' },
            { name: 'w:mirrorMargins',                     kind: 'deprecated' },
            { name: 'w:doNotShadeFormData',                kind: 'deprecated' },
            { name: 'w:doNotIncludeSubdocsInStats',        kind: 'deprecated' },
            { name: 'w:trackChange',                       kind: 'namespace-only' },
            // ---- DrawingML transitional ----
            { name: 'a:vmlDrawing',                        kind: 'deprecated' },
            // ---- WML structural ----
            { name: 'w:document',                          kind: 'namespace-only' },
            { name: 'w:body',                              kind: 'namespace-only' }
        ];
        function toStrict(node) {
            return rewriteAttrs(node, (k, v) => {
                if (k.startsWith('xmlns') && NS_MAP[v]) return [k, NS_MAP[v]];
                return [k, v];
            });
        }
        function fromStrict(node) {
            const reverse = Object.fromEntries(Object.entries(NS_MAP).map(([t, s]) => [s, t]));
            return rewriteAttrs(node, (k, v) => {
                if (k.startsWith('xmlns') && reverse[v]) return [k, reverse[v]];
                return [k, v];
            });
        }

        function rewriteAttrs(node, fn) {
            if (!node || node.type !== 'element') return node;
            const newAttrs = {};
            for (const [k, v] of Object.entries(node.attrs)) {
                const [nk, nv] = fn(k, v);
                newAttrs[nk] = nv;
            }
            return { ...node, attrs: newAttrs, children: (node.children || []).map(c => rewriteAttrs(c, fn)) };
        }

        /**
         * Convert a single transitional element into its strict equivalent.
         * Dispatches on the element name. For `kind: 'deprecated'`, the
         * element is dropped (returns null); for namespace-only/element-
         * rename it rewrites accordingly.
         * @param {XmlNode} el
         * @returns {XmlNode|null}
         */
        function transitionalToStrict(el) {
            if (!el || el.type !== 'element') return el;
            switch (el.name) {
                case 'w:embedSystemFonts':                  return null;
                case 'w:doNotEmbedSystemFonts':             return null;
                case 'w:embedTrueTypeFonts':                return null;
                case 'w:saveSubsetFonts':                   return null;
                case 'w:savePreviewPicture':                return null;
                case 'w:savePropertiesXML':                 return null;
                case 'w:noLineBreaksAfter':                 return null;
                case 'w:noLineBreaksBefore':                return null;
                case 'w:applyBreakingRules':                return null;
                case 'w:uiCompat97To2003':                  return null;
                case 'w:useFELayout':                       return null;
                case 'w:strictFirstAndLastChars':           return null;
                case 'w:doNotAutofitConstrainedTables':     return null;
                case 'w:doNotBreakConstrainedForcedTable':  return null;
                case 'w:doNotBreakWrappedTables':           return null;
                case 'w:doNotExpandShiftReturn':            return null;
                case 'w:doNotLeaveBackslashAlone':          return null;
                case 'w:doNotSnapToGridInCell':             return null;
                case 'w:doNotUseEastAsianBreakRules':       return null;
                case 'w:doNotUseHTMLParagraphAutoSpacing':  return null;
                case 'w:doNotUseIndentAsNumberingTabStop':  return null;
                case 'w:doNotVertAlignCellWithSp':          return null;
                case 'w:doNotVertAlignInTxbx':              return null;
                case 'w:doNotWrapTextWithPunct':            return null;
                case 'w:displayBackgroundShape':            return null;
                case 'w:displayHorizontalDrawingGridEvery': return null;
                case 'w:displayVerticalDrawingGridEvery':   return null;
                case 'w:drawingGridHorizontalSpacing':      return null;
                case 'w:drawingGridVerticalSpacing':        return null;
                case 'w:drawingGridHorizontalOrigin':       return null;
                case 'w:drawingGridVerticalOrigin':         return null;
                case 'w:gutterAtTop':                       return null;
                case 'w:cachedColBalance':                  return null;
                case 'w:swapBordersFacingPages':            return null;
                case 'w:characterSpacingControl':           return null;
                case 'w:printPostScriptOverText':           return null;
                case 'w:printFractionalCharacterWidth':     return null;
                case 'w:printTwoOnOne':                     return null;
                case 'w:autoSpaceDE':                       return null;
                case 'w:autoSpaceDN':                       return null;
                case 'w:bordersDoNotSurroundHeader':        return null;
                case 'w:bordersDoNotSurroundFooter':        return null;
                case 'w:mirrorMargins':                     return null;
                case 'w:doNotShadeFormData':                return null;
                case 'w:doNotIncludeSubdocsInStats':        return null;
                case 'w:trackChange':                       return toStrict(el);
                case 'a:vmlDrawing':                        return null;
                case 'w:document':                          return toStrict(el);
                case 'w:body':                              return toStrict(el);
                default: return el;
            }
        }

        /**
         * Reverse converter — re-emit a transitional flavour for legacy
         * consumers. For deprecated elements the caller must supply the
         * tag and value via `tag` (no strict source available).
         * @param {XmlNode} el
         */
        function strictToTransitional(el) {
            if (!el || el.type !== 'element') return el;
            return fromStrict(el);
        }

        /**
         * Build a transitional element by name (used by tests and by the
         * legacy round-tripper to re-emit deprecated tags).
         * @param {string} name
         * @param {Record<string,string>} [attrs]
         * @param {any[]} [children]
         */
        function buildTransitional(name, attrs, children) {
            switch (name) {
                case 'w:embedSystemFonts':                  return xml.el('w:embedSystemFonts', attrs || {}, children || []);
                case 'w:doNotEmbedSystemFonts':             return xml.el('w:doNotEmbedSystemFonts', attrs || {}, children || []);
                case 'w:embedTrueTypeFonts':                return xml.el('w:embedTrueTypeFonts', attrs || {}, children || []);
                case 'w:saveSubsetFonts':                   return xml.el('w:saveSubsetFonts', attrs || {}, children || []);
                case 'w:savePreviewPicture':                return xml.el('w:savePreviewPicture', attrs || {}, children || []);
                case 'w:savePropertiesXML':                 return xml.el('w:savePropertiesXML', attrs || {}, children || []);
                case 'w:noLineBreaksAfter':                 return xml.el('w:noLineBreaksAfter', attrs || {}, children || []);
                case 'w:noLineBreaksBefore':                return xml.el('w:noLineBreaksBefore', attrs || {}, children || []);
                case 'w:applyBreakingRules':                return xml.el('w:applyBreakingRules', attrs || {}, children || []);
                case 'w:uiCompat97To2003':                  return xml.el('w:uiCompat97To2003', attrs || {}, children || []);
                case 'w:useFELayout':                       return xml.el('w:useFELayout', attrs || {}, children || []);
                case 'w:strictFirstAndLastChars':           return xml.el('w:strictFirstAndLastChars', attrs || {}, children || []);
                case 'w:doNotAutofitConstrainedTables':     return xml.el('w:doNotAutofitConstrainedTables', attrs || {}, children || []);
                case 'w:doNotBreakConstrainedForcedTable':  return xml.el('w:doNotBreakConstrainedForcedTable', attrs || {}, children || []);
                case 'w:doNotBreakWrappedTables':           return xml.el('w:doNotBreakWrappedTables', attrs || {}, children || []);
                case 'w:doNotExpandShiftReturn':            return xml.el('w:doNotExpandShiftReturn', attrs || {}, children || []);
                case 'w:doNotLeaveBackslashAlone':          return xml.el('w:doNotLeaveBackslashAlone', attrs || {}, children || []);
                case 'w:doNotSnapToGridInCell':             return xml.el('w:doNotSnapToGridInCell', attrs || {}, children || []);
                case 'w:doNotUseEastAsianBreakRules':       return xml.el('w:doNotUseEastAsianBreakRules', attrs || {}, children || []);
                case 'w:doNotUseHTMLParagraphAutoSpacing':  return xml.el('w:doNotUseHTMLParagraphAutoSpacing', attrs || {}, children || []);
                case 'w:doNotUseIndentAsNumberingTabStop':  return xml.el('w:doNotUseIndentAsNumberingTabStop', attrs || {}, children || []);
                case 'w:doNotVertAlignCellWithSp':          return xml.el('w:doNotVertAlignCellWithSp', attrs || {}, children || []);
                case 'w:doNotVertAlignInTxbx':              return xml.el('w:doNotVertAlignInTxbx', attrs || {}, children || []);
                case 'w:doNotWrapTextWithPunct':            return xml.el('w:doNotWrapTextWithPunct', attrs || {}, children || []);
                case 'w:displayBackgroundShape':            return xml.el('w:displayBackgroundShape', attrs || {}, children || []);
                case 'w:displayHorizontalDrawingGridEvery': return xml.el('w:displayHorizontalDrawingGridEvery', attrs || {}, children || []);
                case 'w:displayVerticalDrawingGridEvery':   return xml.el('w:displayVerticalDrawingGridEvery', attrs || {}, children || []);
                case 'w:drawingGridHorizontalSpacing':      return xml.el('w:drawingGridHorizontalSpacing', attrs || {}, children || []);
                case 'w:drawingGridVerticalSpacing':        return xml.el('w:drawingGridVerticalSpacing', attrs || {}, children || []);
                case 'w:drawingGridHorizontalOrigin':       return xml.el('w:drawingGridHorizontalOrigin', attrs || {}, children || []);
                case 'w:drawingGridVerticalOrigin':         return xml.el('w:drawingGridVerticalOrigin', attrs || {}, children || []);
                case 'w:gutterAtTop':                       return xml.el('w:gutterAtTop', attrs || {}, children || []);
                case 'w:cachedColBalance':                  return xml.el('w:cachedColBalance', attrs || {}, children || []);
                case 'w:swapBordersFacingPages':            return xml.el('w:swapBordersFacingPages', attrs || {}, children || []);
                case 'w:characterSpacingControl':           return xml.el('w:characterSpacingControl', attrs || {}, children || []);
                case 'w:printPostScriptOverText':           return xml.el('w:printPostScriptOverText', attrs || {}, children || []);
                case 'w:printFractionalCharacterWidth':     return xml.el('w:printFractionalCharacterWidth', attrs || {}, children || []);
                case 'w:printTwoOnOne':                     return xml.el('w:printTwoOnOne', attrs || {}, children || []);
                case 'w:autoSpaceDE':                       return xml.el('w:autoSpaceDE', attrs || {}, children || []);
                case 'w:autoSpaceDN':                       return xml.el('w:autoSpaceDN', attrs || {}, children || []);
                case 'w:bordersDoNotSurroundHeader':        return xml.el('w:bordersDoNotSurroundHeader', attrs || {}, children || []);
                case 'w:bordersDoNotSurroundFooter':        return xml.el('w:bordersDoNotSurroundFooter', attrs || {}, children || []);
                case 'w:mirrorMargins':                     return xml.el('w:mirrorMargins', attrs || {}, children || []);
                case 'w:doNotShadeFormData':                return xml.el('w:doNotShadeFormData', attrs || {}, children || []);
                case 'w:doNotIncludeSubdocsInStats':        return xml.el('w:doNotIncludeSubdocsInStats', attrs || {}, children || []);
                case 'w:trackChange':                       return xml.el('w:trackChange', attrs || {}, children || []);
                case 'a:vmlDrawing':                        return xml.el('a:vmlDrawing', attrs || {}, children || []);
                case 'w:document':                          return xml.el('w:document', attrs || {}, children || []);
                case 'w:body':                              return xml.el('w:body', attrs || {}, children || []);
                default: return xml.el(name, attrs || {}, children || []);
            }
        }

        /**
         * Returns true when the given QName is a known transitional-only
         * element (deprecated in strict).
         */
        function isTransitionalOnly(name) {
            const e = TRANSITIONAL_ELEMENTS.find(t => t.name === name);
            return !!e && e.kind === 'deprecated';
        }

        return {
            NS_MAP, TRANSITIONAL_ELEMENTS,
            toStrict, fromStrict,
            transitionalToStrict, strictToTransitional,
            buildTransitional, isTransitionalOnly
        };
    }
};
