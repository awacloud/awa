// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed `styles.xml` and `numbering.xml` details the
 * core keeps raw. Styles: a
 * style's flags and names (`aliases`, `link`, `autoRedefine`, `hidden`,
 * `uiPriority`, `semiHidden`, `unhideWhenUsed`, `qFormat`, `locked`,
 * `personal`, `personalCompose`, `personalReply`, `rsid`), a table
 * style's conditional formats (`tblStylePr`), and the part's
 * `latentStyles`. A docx walker extension (`hydrateStyles` /
 * `dehydrateStyles`): every element is typed only when it is written back
 * as read (`docxProperties.hydrateLossless`); the others stay in
 * `_extras`. A table style's `trPr` and `tcPr`, and a conditional
 * format's, stay raw. Numbering (`hydrateNumbering` /
 * `dehydrateNumbering`): the part's `numIdMacAtCleanup`, an abstract
 * numbering's `nsid`, `tmpl`, `styleLink` and `numStyleLink`, a level's
 * `suff`, `pStyle`, `isLgl`, `legacy`, `lvlRestart` and `lvlPicBulletId`.
 * Registered by `docxFullBundle` (not `docxLargeBundle`, whose readers
 * read these elements in `_extras`).
 *
 * Usage:
 *
 * ```js
 * const word = runtime.resolve('docx');
 * word.use(runtime.resolve('wmlStyleDetails'));
 * const { styles } = word.read(bytes);
 * styles.styles.find((s) => s.styleId === 'Heading1').uiPriority; // 9
 * ```
 *
 * @module ooxml/extra/wml-style-details
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';

export const wmlStyleDetails = {
    name: 'wmlStyleDetails',
    dependencies: ['xml', 'docxProperties'],
    deps: [xml, docxProperties],

    factory(xml, core) {
        // A style's toggles, its string values, its number value.
        const TOGGLES = ['autoRedefine', 'hidden', 'semiHidden', 'unhideWhenUsed', 'qFormat', 'locked',
            'personal', 'personalCompose', 'personalReply'];
        const STRINGS = ['aliases', 'link', 'rsid'];
        // CT_TblStylePr's children, in order.
        const TBL_STYLE_PR_SEQ = core.sequence(['w:pPr', 'w:rPr', 'w:tblPr', 'w:trPr', 'w:tcPr']);

        /** The `w:`-less attributes of an element, as read. */
        function attrsOf(el) {
            const out = {};
            for (const [k, v] of Object.entries(el.attrs || {})) out[k.replace(/^w:/, '')] = v;
            return out;
        }
        function wAttrs(o) {
            const out = {};
            for (const [k, v] of Object.entries(o || {})) if (v != null) out['w:' + k] = String(v);
            return out;
        }

        // --- <w:tblStylePr> ---
        function parseTblStylePr(el) {
            const out = { type: el.attrs['w:type'] };
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                // An empty property element types as `{}` (written back empty).
                const empty = !(c.children || []).some((x) => x.type === 'element') && Object.keys(c.attrs || {}).length === 0;
                if (c.name === 'w:pPr') out.pPr = empty ? {} : core.parseParagraphProperties(c);
                else if (c.name === 'w:rPr') out.rPr = empty ? {} : core.parseRunProperties(c);
                else if (c.name === 'w:tblPr') out.tblPr = empty ? {} : core.parseTableProperties(c);
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }
        function renderTblStylePr(t) {
            const children = [];
            // An empty bag writes an empty element.
            const emptyEl = (bag, name) => (bag && typeof bag === 'object' && Object.keys(bag).length === 0 ? xml.el(name, {}) : null);
            const p = core.renderParagraphProperties(t.pPr) || emptyEl(t.pPr, 'w:pPr'); if (p) children.push(p);
            const r = core.renderRunProperties(t.rPr) || emptyEl(t.rPr, 'w:rPr');            if (r) children.push(r);
            const tb = core.renderTableProperties(t.tblPr) || emptyEl(t.tblPr, 'w:tblPr');   if (tb) children.push(tb);
            if (t._extras) for (const e of t._extras) children.push(e);
            return xml.el('w:tblStylePr', t.type != null ? { 'w:type': String(t.type) } : {}, core.orderBySequence(children, TBL_STYLE_PR_SEQ));
        }

        // --- <w:latentStyles> ---
        function parseLatentStyles(el) {
            const out = { ...attrsOf(el), exceptions: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name !== 'w:lsdException') return undefined;
                out.exceptions.push(attrsOf(c));
            }
            return out;
        }
        function renderLatentStyles(l) {
            const { exceptions, ...attrs } = l;
            return xml.el('w:latentStyles', wAttrs(attrs), (exceptions || []).map((e) => xml.el('w:lsdException', wAttrs(e))));
        }

        // --- a style's fields ---
        function typeStyle(st) {
            if (!st || !st._extras) return st;
            const remaining = [];
            for (const c of st._extras) {
                if (c.type !== 'element') { remaining.push(c); continue; }
                const local = c.name.replace(/^w:/, '');
                if (c.name.startsWith('w:') && TOGGLES.includes(local)) st[local] = core.readToggle(c);
                else if (c.name.startsWith('w:') && STRINGS.includes(local)) st[local] = c.attrs['w:val'];
                else if (c.name === 'w:uiPriority') st.uiPriority = Number(c.attrs['w:val']);
                else if (c.name === 'w:tblStylePr') (st.tblStylePr = st.tblStylePr || []).push(parseTblStylePr(c));
                else remaining.push(c);
            }
            if (remaining.length) st._extras = remaining; else delete st._extras;
            return st;
        }
        function untypeStyle(st) {
            if (!st) return st;
            const out = { ...st };
            const extras = out._extras ? [...out._extras] : [];
            for (const t of TOGGLES) {
                if (out[t] !== undefined) { const el = core.writeToggle('w:' + t, out[t]); if (el) extras.push(el); delete out[t]; }
            }
            for (const s of STRINGS) {
                if (out[s] != null) { extras.push(xml.el('w:' + s, { 'w:val': String(out[s]) })); delete out[s]; }
            }
            if (out.uiPriority != null) { extras.push(xml.el('w:uiPriority', { 'w:val': String(out.uiPriority) })); delete out.uiPriority; }
            if (out.tblStylePr) { for (const t of out.tblStylePr) extras.push(renderTblStylePr(t)); delete out.tblStylePr; }
            if (extras.length) out._extras = extras; else delete out._extras;
            return out;
        }

        // --- the part's fields ---
        function typePart(part) {
            if (!part || !part._extras) return part;
            const remaining = [];
            for (const c of part._extras) {
                if (c.type === 'element' && c.name === 'w:latentStyles') {
                    const l = parseLatentStyles(c);
                    if (l) { part.latentStyles = l; continue; }
                }
                remaining.push(c);
            }
            if (remaining.length) part._extras = remaining; else delete part._extras;
            return part;
        }
        function untypePart(part) {
            if (!part) return part;
            const out = { ...part };
            const extras = out._extras ? [...out._extras] : [];
            if (out.latentStyles) { extras.push(renderLatentStyles(out.latentStyles)); delete out.latentStyles; }
            if (extras.length) out._extras = extras; else delete out._extras;
            return out;
        }

        /** Walker hook: the styles part's latent styles and each style's fields, typed losslessly. */
        function hydrateStyles(styles) {
            if (!styles || typeof styles !== 'object') return styles;
            core.hydrateLossless(styles, typePart, untypePart);
            for (const st of Array.isArray(styles.styles) ? styles.styles : []) core.hydrateLossless(st, typeStyle, untypeStyle);
            return styles;
        }
        /** Walker hook: the typed fields back into `_extras`, in a new part object. */
        function dehydrateStyles(styles) {
            if (!styles || typeof styles !== 'object') return styles;
            const out = untypePart(styles);
            if (Array.isArray(styles.styles)) out.styles = styles.styles.map(untypeStyle);
            return out;
        }

        // --- the numbering part's details (the core's numbering model) ---
        const LEGACY_ATTRS = ['legacy', 'legacySpace', 'legacyIndent'];
        function typeBy(spec) {
            return (bag) => {
                if (!bag || !bag._extras) return bag;
                const remaining = [];
                for (const c of bag._extras) {
                    const local = c && c.type === 'element' && c.name.startsWith('w:') ? c.name.slice(2) : null;
                    if (local !== null && (spec.strings || []).includes(local)) bag[local] = c.attrs['w:val'];
                    else if (local !== null && (spec.numbers || []).includes(local)) bag[local] = Number(c.attrs['w:val']);
                    else if (local !== null && (spec.toggles || []).includes(local)) bag[local] = core.readToggle(c);
                    else if (local === 'legacy' && spec.legacy) {
                        const l = {};
                        for (const a of LEGACY_ATTRS) if (c.attrs['w:' + a] != null) l[a] = c.attrs['w:' + a];
                        bag.legacy = l;
                    } else remaining.push(c);
                }
                if (remaining.length) bag._extras = remaining; else delete bag._extras;
                return bag;
            };
        }
        function untypeBy(spec) {
            return (bag) => {
                if (!bag) return bag;
                const out = { ...bag };
                const extras = out._extras ? [...out._extras] : [];
                for (const k of [...(spec.strings || []), ...(spec.numbers || [])]) {
                    if (out[k] != null) { extras.push(xml.el('w:' + k, { 'w:val': String(out[k]) })); delete out[k]; }
                }
                for (const k of spec.toggles || []) {
                    if (out[k] !== undefined) { const el = core.writeToggle('w:' + k, out[k]); if (el) extras.push(el); delete out[k]; }
                }
                if (spec.legacy && out.legacy) {
                    const a = {};
                    for (const k of LEGACY_ATTRS) if (out.legacy[k] != null) a['w:' + k] = String(out.legacy[k]);
                    extras.push(xml.el('w:legacy', a));
                    delete out.legacy;
                }
                if (extras.length) out._extras = extras; else delete out._extras;
                return out;
            };
        }
        const NUMBERING_PART = { numbers: ['numIdMacAtCleanup'] };
        const ABSTRACT = { strings: ['nsid', 'tmpl', 'styleLink', 'numStyleLink'] };
        const LEVEL = { strings: ['suff', 'pStyle'], numbers: ['lvlRestart', 'lvlPicBulletId'], toggles: ['isLgl'], legacy: true };
        const typeNumberingPart = typeBy(NUMBERING_PART), untypeNumberingPart = untypeBy(NUMBERING_PART);
        const typeAbstract = typeBy(ABSTRACT), untypeAbstract = untypeBy(ABSTRACT);
        const typeLevel = typeBy(LEVEL), untypeLevel = untypeBy(LEVEL);

        /** Walker hook: the numbering part's, abstract numberings' and levels' details, typed losslessly. */
        function hydrateNumbering(numbering) {
            if (!numbering || typeof numbering !== 'object') return numbering;
            core.hydrateLossless(numbering, typeNumberingPart, untypeNumberingPart);
            for (const an of Array.isArray(numbering.abstractNums) ? numbering.abstractNums : []) {
                if (!an) continue;
                core.hydrateLossless(an, typeAbstract, untypeAbstract);
                for (const lvl of Array.isArray(an.levels) ? an.levels : []) if (lvl) core.hydrateLossless(lvl, typeLevel, untypeLevel);
            }
            return numbering;
        }
        /** Walker hook: the typed details back into `_extras`, in a new part object. */
        function dehydrateNumbering(numbering) {
            if (!numbering || typeof numbering !== 'object') return numbering;
            const out = untypeNumberingPart(numbering);
            if (Array.isArray(numbering.abstractNums)) {
                out.abstractNums = numbering.abstractNums.map((an) => {
                    if (!an) return an;
                    const a = untypeAbstract(an);
                    if (Array.isArray(an.levels)) a.levels = an.levels.map((lvl) => (lvl ? untypeLevel(lvl) : lvl));
                    return a;
                });
            }
            return out;
        }

        return {
            hydrateStyles, dehydrateStyles,
            hydrateNumbering, dehydrateNumbering,
            parseTblStylePr, renderTblStylePr,
            parseLatentStyles, renderLatentStyles
        };
    }
};
