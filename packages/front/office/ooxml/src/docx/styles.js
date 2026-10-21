// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML styles part — `word/styles.xml`.
 *
 * Reads and writes the styles part referenced by relationship type
 * `…/relationships/styles`. ECMA-376 part 1 §17.7. The model :
 *
 * ```js
 * {
 *   docDefaults?: { rPr?: RunProperties, pPr?: ParagraphProperties },
 *   styles: [{
 *     type: 'paragraph' | 'character' | 'table' | 'numbering',
 *     styleId: string,
 *     name?: string,
 *     basedOn?: string,
 *     next?: string,
 *     isDefault?: boolean,
 *     rPr?: RunProperties,
 *     pPr?: ParagraphProperties,
 *     tblPr?: TableProperties,   // table styles: style / width / borders / cellMargins
 *     _extras?: [xmlNode]
 *   }],
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/docx/styles
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxStyles = {
    name: 'docxStyles',
    dependencies: ['ooxmlErrors', 'xml', 'docxProperties', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, docxProperties, ooxmlShared],

    factory(errors, xml, props, shared) {
        const { ParseError } = errors;
        const { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared;
        // Schema order (ECMA-376 Part 1); a hand-wired ooxmlShared without
        // the ordering helper writes children in the old order.
        const orderSeq = shared.sequence ? shared.sequence : () => null;
        const ordered = (children, seq) => (seq && shared.orderBySequence ? shared.orderBySequence(children, seq) : children);
        const STYLE_SEQ = orderSeq([
            'w:name', 'w:aliases', 'w:basedOn', 'w:next', 'w:link', 'w:autoRedefine', 'w:hidden',
            'w:uiPriority', 'w:semiHidden', 'w:unhideWhenUsed', 'w:qFormat', 'w:locked',
            'w:personal', 'w:personalCompose', 'w:personalReply', 'w:rsid', 'w:pPr', 'w:rPr',
            'w:tblPr', 'w:trPr', 'w:tcPr', 'w:tblStylePr'
        ]);
        const STYLES_SEQ = orderSeq([
            'w:docDefaults', 'w:latentStyles', 'w:style'
        ]);

        const REL_TYPE_STYLES = REL_TYPE.STYLES;
        const CT_STYLES = CT.STYLES_W;

        function valOf(el) { return el ? el.attrs['w:val'] : undefined; }
        function elVal(name, val) { return xml.el(name, { 'w:val': String(val) }); }

        function parseStyle(sEl) {
            const out = {
                type: sEl.attrs['w:type'] || 'paragraph',
                styleId: sEl.attrs['w:styleId']
            };
            if (sEl.attrs['w:default'] === '1') out.isDefault = true;
            const extras = [];
            for (const c of sEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:name':    out.name = valOf(c); break;
                    case 'w:basedOn': out.basedOn = valOf(c); break;
                    case 'w:next':    out.next = valOf(c); break;
                    case 'w:rPr': {
                        const r = props.parseRunProperties(c);
                        if (r) out.rPr = r;
                        break;
                    }
                    case 'w:pPr': {
                        const p = props.parseParagraphProperties(c);
                        if (p) out.pPr = p;
                        break;
                    }
                    case 'w:tblPr': {
                        const t = props.parseTableProperties(c);
                        if (t) out.tblPr = t;
                        else extras.push(c);
                        break;
                    }
                    default:
                        extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderStyle(s) {
            const attrs = { 'w:type': s.type || 'paragraph', 'w:styleId': s.styleId };
            if (s.isDefault) attrs['w:default'] = '1';
            const children = [];
            if (s.name != null)    children.push(elVal('w:name', s.name));
            if (s.basedOn != null) children.push(elVal('w:basedOn', s.basedOn));
            if (s.next != null)    children.push(elVal('w:next', s.next));
            const pPrEl = props.renderParagraphProperties(s.pPr);
            if (pPrEl) children.push(pPrEl);
            const rPrEl = props.renderRunProperties(s.rPr);
            if (rPrEl) children.push(rPrEl);
            // CT_Style sequence: pPr, rPr, tblPr (then trPr / tcPr / tblStylePr in _extras).
            const tblPrEl = props.renderTableProperties(s.tblPr);
            if (tblPrEl) children.push(tblPrEl);
            if (s._extras) for (const ex of s._extras) children.push(ex);
            return xml.el('w:style', attrs, ordered(children, STYLE_SEQ));
        }

        function parseDocDefaults(ddEl) {
            const out = {};
            for (const c of ddEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:rPrDefault') {
                    const inner = c.children.find(n => n.type === 'element' && n.name === 'w:rPr');
                    if (inner) {
                        const r = props.parseRunProperties(inner);
                        if (r) out.rPr = r;
                    }
                } else if (c.name === 'w:pPrDefault') {
                    const inner = c.children.find(n => n.type === 'element' && n.name === 'w:pPr');
                    if (inner) {
                        const p = props.parseParagraphProperties(inner);
                        if (p) out.pPr = p;
                    }
                }
            }
            return Object.keys(out).length ? out : undefined;
        }

        function renderDocDefaults(dd) {
            if (!dd) return null;
            const children = [];
            const rPrEl = props.renderRunProperties(dd.rPr);
            if (rPrEl) children.push(xml.el('w:rPrDefault', {}, [rPrEl]));
            const pPrEl = props.renderParagraphProperties(dd.pPr);
            if (pPrEl) children.push(xml.el('w:pPrDefault', {}, [pPrEl]));
            if (!children.length) return null;
            return xml.el('w:docDefaults', {}, children);
        }

        /**
         * Parse a `word/styles.xml` body into a structured styles object.
         *
         * @param {string|Uint8Array} input
         * @returns {{ docDefaults?, styles, _extras? }}
         */
        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'w:styles') {
                throw new ParseError('docx/styles-bad-root', `docx styles: expected <w:styles>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { styles: [] };
            const extras = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:docDefaults') {
                    const dd = parseDocDefaults(c);
                    if (dd) out.docDefaults = dd;
                } else if (c.name === 'w:style') {
                    out.styles.push(parseStyle(c));
                } else {
                    extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        /**
         * Serialize a structured styles object to XML.
         *
         * @param {object} stylesObj
         * @returns {string}
         */
        function serialize(stylesObj) {
            const children = [];
            const dd = renderDocDefaults(stylesObj.docDefaults);
            if (dd) children.push(dd);
            for (const s of stylesObj.styles || []) children.push(renderStyle(s));
            if (stylesObj._extras) for (const ex of stylesObj._extras) children.push(ex);
            const kids = ordered(children, STYLES_SEQ);
            return xml.serialize(xml.el('w:styles',
                wordRootAttrs(kids, { r: false }), kids));
        }

        /** Build a styles object with a couple of common defaults. */
        function defaults() {
            return {
                docDefaults: { rPr: { font: 'Calibri', size: 22 } },
                styles: [
                    { type: 'paragraph', styleId: 'Normal',
                      name: 'Normal', isDefault: true }
                ]
            };
        }

        function bytesOf(stylesObj) { return encodeText(serialize(stylesObj)); }

        return {
            parse, serialize, defaults, bytesOf,
            renderStyle, parseStyle,
            REL_TYPE_STYLES, CT_STYLES
        };
    }
};
