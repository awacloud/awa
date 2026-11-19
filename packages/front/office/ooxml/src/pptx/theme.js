// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PresentationML theme part — `ppt/theme/theme*.xml`
 * (ECMA-376 part 1 §20.1.6.9 / §14.2.7).
 *
 * The theme defines color scheme, font scheme and a (large) format
 * scheme that drives shape/text appearance. PowerPoint requires a
 * theme part to open a presentation.
 *
 * Document model :
 *
 * ```js
 * {
 *   name?: 'Office Theme',
 *   clrScheme?: {
 *     name: string,
 *     colors: { dk1, lt1, dk2, lt2, accent1..6, hlink, folHlink }
 *   },
 *   fontScheme?: {
 *     name: string,
 *     majorFont?: { latin?, ea?, cs?,     // typeface names
 *                   fontAttrs?: { latin?, ea?, cs? } }, // their other attributes
 *     minorFont?: { latin?, ea?, cs?, fontAttrs? }
 *   },
 *   fmtScheme?: xmlNode,  // preserved verbatim — large and rarely edited
 *   objectDefaults?: xmlNode | null,    // null: read without one, written without
 *   extraClrSchemeLst?: xmlNode | null, // null: read without one, written without
 *   _extras?: [xmlNode]   // the root's other children (custClrLst, extLst …)
 * }
 *
 * color := { srgb?: 'RRGGBB', sysClr?: { val, lastClr } }
 * ```
 *
 * @module ooxml/pptx/theme
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const pptxTheme = {
    name: 'pptxTheme',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText } = shared;

        const A_NS = NS.A;
        const REL_TYPE_THEME = REL_TYPE.THEME;
        const CT_THEME = CT.THEME;

        // --- Color helpers ---

        function parseColorContainer(el) {
            // <a:dk1> contains exactly one of <a:srgbClr> or <a:sysClr>.
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:srgbClr') return { srgb: c.attrs.val };
                if (c.name === 'a:sysClr')  return { sysClr: { val: c.attrs.val,
                                                                lastClr: c.attrs.lastClr } };
            }
            return null;
        }

        function renderColorContainer(name, color) {
            if (!color) return null;
            let inner;
            if (color.srgb) {
                inner = xml.el('a:srgbClr', { val: color.srgb });
            } else if (color.sysClr) {
                const a = { val: color.sysClr.val };
                if (color.sysClr.lastClr) a.lastClr = color.sysClr.lastClr;
                inner = xml.el('a:sysClr', a);
            } else return null;
            return xml.el(name, {}, [inner]);
        }

        const CLR_SCHEME_KEYS = ['dk1', 'lt1', 'dk2', 'lt2',
                                  'accent1', 'accent2', 'accent3', 'accent4',
                                  'accent5', 'accent6', 'hlink', 'folHlink'];

        function parseClrScheme(el) {
            const out = { name: el.attrs.name ?? '', colors: {} };
            for (const key of CLR_SCHEME_KEYS) {
                const child = xml.findChild(el, 'a:' + key);
                if (child) out.colors[key] = parseColorContainer(child);
            }
            return out;
        }

        function renderClrScheme(scheme) {
            const children = [];
            for (const key of CLR_SCHEME_KEYS) {
                const c = scheme.colors[key];
                if (!c) continue;
                const el = renderColorContainer('a:' + key, c);
                if (el) children.push(el);
            }
            return xml.el('a:clrScheme', { name: schemeName(scheme) }, children);
        }

        // A scheme's name as read, `""` included; a model without one is
        // written "Office".
        function schemeName(scheme) {
            return typeof scheme.name === 'string' ? scheme.name : 'Office';
        }

        // --- Font scheme ---

        // A font's attributes beyond `typeface`.
        function otherFontAttrs(el) {
            const out = {};
            for (const [k, v] of Object.entries(el.attrs || {})) if (k !== 'typeface') out[k] = v;
            return Object.keys(out).length ? out : null;
        }

        function parseFontKind(el) {
            // <a:majorFont>: <a:latin typeface=…/> + <a:ea/> + <a:cs/> + many fallbacks
            const out = {};
            const latin = xml.findChild(el, 'a:latin');
            const ea    = xml.findChild(el, 'a:ea');
            const cs    = xml.findChild(el, 'a:cs');
            if (latin) out.latin = latin.attrs.typeface;
            if (ea)    out.ea = ea.attrs.typeface;
            if (cs)    out.cs = cs.attrs.typeface;
            const fontAttrs = {};
            for (const [key, f] of [['latin', latin], ['ea', ea], ['cs', cs]]) {
                const other = f && otherFontAttrs(f);
                if (other) fontAttrs[key] = other;
            }
            if (Object.keys(fontAttrs).length) out.fontAttrs = fontAttrs;
            // Preserve fallback fonts (<a:font script="..." typeface="..."/>).
            const extras = el.children.filter(n => n.type === 'element'
                && !['a:latin', 'a:ea', 'a:cs'].includes(n.name));
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderFontKind(tag, kind) {
            const children = [];
            const fa = (key) => {
                const a = kind.fontAttrs && kind.fontAttrs[key];
                const out = {};
                if (a && typeof a === 'object') {
                    for (const [k, v] of Object.entries(a)) if (k !== 'typeface' && v != null) out[k] = String(v);
                }
                return out;
            };
            children.push(xml.el('a:latin', { typeface: kind.latin || 'Calibri', ...fa('latin') }));
            children.push(xml.el('a:ea', { typeface: kind.ea || '', ...fa('ea') }));
            children.push(xml.el('a:cs', { typeface: kind.cs || '', ...fa('cs') }));
            if (kind._extras) for (const ex of kind._extras) children.push(ex);
            return xml.el(tag, {}, children);
        }

        function parseFontScheme(el) {
            const out = { name: el.attrs.name ?? '' };
            const major = xml.findChild(el, 'a:majorFont');
            const minor = xml.findChild(el, 'a:minorFont');
            if (major) out.majorFont = parseFontKind(major);
            if (minor) out.minorFont = parseFontKind(minor);
            return out;
        }

        function renderFontScheme(scheme) {
            const children = [];
            children.push(renderFontKind('a:majorFont', scheme.majorFont || {}));
            children.push(renderFontKind('a:minorFont', scheme.minorFont || {}));
            return xml.el('a:fontScheme', { name: schemeName(scheme) }, children);
        }

        // --- Top-level parse / serialize ---

        // The root's children the model types; the others are `_extras`,
        // written in CT_OfficeStyleSheet's order.
        const ROOT_TYPED = new Set(['a:themeElements', 'a:objectDefaults', 'a:extraClrSchemeLst']);
        const ROOT_SEQ = shared.sequence ? shared.sequence(['a:themeElements', 'a:objectDefaults',
            'a:extraClrSchemeLst', 'a:custClrLst', 'a:extLst']) : null;
        const ordered = (children, seq) => (seq && shared.orderBySequence ? shared.orderBySequence(children, seq) : children);

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'a:theme') {
                throw new ParseError('pptx/theme-bad-root', `pptx theme: expected <a:theme>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = { name: root.attrs.name || 'Office Theme' };
            const themeEls = xml.findChild(root, 'a:themeElements');
            if (themeEls) {
                const cs = xml.findChild(themeEls, 'a:clrScheme');
                const fs = xml.findChild(themeEls, 'a:fontScheme');
                const fm = xml.findChild(themeEls, 'a:fmtScheme');
                if (cs) out.clrScheme = parseClrScheme(cs);
                if (fs) out.fontScheme = parseFontScheme(fs);
                if (fm) out.fmtScheme = fm;     // preserved verbatim
            }
            // Absent, they are `null` and written without.
            out.objectDefaults = xml.findChild(root, 'a:objectDefaults') || null;
            out.extraClrSchemeLst = xml.findChild(root, 'a:extraClrSchemeLst') || null;
            const extras = root.children.filter(c => c.type === 'element' && !ROOT_TYPED.has(c.name));
            if (extras.length) out._extras = extras;
            return out;
        }

        function serialize(obj) {
            const themeChildren = [];
            if (obj.clrScheme)  themeChildren.push(renderClrScheme(obj.clrScheme));
            if (obj.fontScheme) themeChildren.push(renderFontScheme(obj.fontScheme));
            if (obj.fmtScheme)  themeChildren.push(obj.fmtScheme);
            const themeElements = xml.el('a:themeElements', {}, themeChildren);
            const children = [themeElements];
            if (obj.objectDefaults !== null) children.push(obj.objectDefaults || xml.el('a:objectDefaults', {}));
            if (obj.extraClrSchemeLst !== null) children.push(obj.extraClrSchemeLst || xml.el('a:extraClrSchemeLst', {}));
            for (const ex of Array.isArray(obj._extras) ? obj._extras : []) {
                if (ex && ex.type === 'element' && !ROOT_TYPED.has(ex.name)) children.push(ex);
            }
            return xml.serialize(xml.el('a:theme',
                { 'xmlns:a': A_NS, name: obj.name || 'Office Theme' },
                ordered(children, ROOT_SEQ)));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        // --- Default theme (minimum that PowerPoint accepts) ---

        function defaults() {
            // Construct fmtScheme via xml.parse so we get a real node tree.
            const fmtSchemeXml =
                '<a:fmtScheme xmlns:a="' + A_NS + '" name="Office">' +
                  '<a:fillStyleLst>' +
                    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                  '</a:fillStyleLst>' +
                  '<a:lnStyleLst>' +
                    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr">' +
                      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                      '<a:prstDash val="solid"/>' +
                    '</a:ln>' +
                    '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr">' +
                      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                      '<a:prstDash val="solid"/>' +
                    '</a:ln>' +
                    '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr">' +
                      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                      '<a:prstDash val="solid"/>' +
                    '</a:ln>' +
                  '</a:lnStyleLst>' +
                  '<a:effectStyleLst>' +
                    '<a:effectStyle><a:effectLst/></a:effectStyle>' +
                    '<a:effectStyle><a:effectLst/></a:effectStyle>' +
                    '<a:effectStyle><a:effectLst/></a:effectStyle>' +
                  '</a:effectStyleLst>' +
                  '<a:bgFillStyleLst>' +
                    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                  '</a:bgFillStyleLst>' +
                '</a:fmtScheme>';
            return {
                name: 'Office Theme',
                clrScheme: {
                    name: 'Office',
                    colors: {
                        dk1:     { sysClr: { val: 'windowText', lastClr: '000000' } },
                        lt1:     { sysClr: { val: 'window',     lastClr: 'FFFFFF' } },
                        dk2:     { srgb: '44546A' },
                        lt2:     { srgb: 'E7E6E6' },
                        accent1: { srgb: '4472C4' },
                        accent2: { srgb: 'ED7D31' },
                        accent3: { srgb: 'A5A5A5' },
                        accent4: { srgb: 'FFC000' },
                        accent5: { srgb: '5B9BD5' },
                        accent6: { srgb: '70AD47' },
                        hlink:    { srgb: '0563C1' },
                        folHlink: { srgb: '954F72' }
                    }
                },
                fontScheme: {
                    name: 'Office',
                    majorFont: { latin: 'Calibri Light' },
                    minorFont: { latin: 'Calibri' }
                },
                fmtScheme: xml.parse(fmtSchemeXml)
            };
        }

        return {
            parse, serialize, bytesOf, defaults,
            parseClrScheme, renderClrScheme,
            parseFontScheme, renderFontScheme,
            REL_TYPE_THEME, CT_THEME
        };
    }
};
