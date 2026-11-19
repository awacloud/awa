// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The DOCX style cascade and the CSS it maps to, for the DOCX
 * painter and the `cascade.js` sub-path: document defaults → `basedOn`
 * chain (root first) → numbering level → direct formatting, character
 * styles between a paragraph's run base and the direct run formatting,
 * table styles and their conditional formats.
 *
 * Pure: plain objects in, plain objects out — no DOM, no fw runtime, no
 * side effect at import. `render/docx.js` paints with this code; there is
 * one cascade in the package.
 *
 * @module oview/render/docx-style
 */
import { fontStack } from './flow.js';
import { hexColour, PX } from './view.js';

/** @typedef {Record<string, any>} Props */

/** A raw `_extras` child by element name. */
export function extra(props, tag) {
    return (props && Array.isArray(props._extras)) ? props._extras.find((x) => x && x.name === tag) || null : null;
}

/** An attribute of a raw xml node (`w:val`…). */
export function attr(node, name) {
    return node && node.attrs ? node.attrs[name] ?? null : null;
}

const NESTED = new Set(['indent', 'spacing', 'lang', 'fonts', 'numPr']);

/**
 * Shallow merge of formatting bags; the nested bags Word merges per
 * attribute are merged too: `indent`, `spacing`, `lang`, the run `fonts`
 * (one face per script) and `numPr` (a direct `ilvl` keeps the style's
 * `numId`).
 */
export function merge(...bags) {
    /** @type {Props} */
    const out = {};
    for (const b of bags) {
        if (!b) continue;
        for (const [k, v] of Object.entries(b)) {
            if (v === undefined) continue;
            if (k === '_extras') { out._extras = [...(out._extras || []), ...v]; continue; }
            if (NESTED.has(k) && v && typeof v === 'object') out[k] = { ...(out[k] || {}), ...v };
            else out[k] = v;
        }
    }
    return out;
}

/**
 * The style cascade of one document.
 * @param {any} styles `docx.read().styles`
 */
export function createStyles(styles) {
    const byId = new Map((styles?.styles || []).map((s) => [s.styleId, s]));
    const defaults = styles?.docDefaults || {};
    const defaultPara = (styles?.styles || []).find((s) => s.type === 'paragraph' && s.isDefault);
    /** @param {string|undefined} id @returns {any[]} root first */
    function chain(id) {
        const out = [];
        const seen = new Set();
        let cur = id ? byId.get(id) : null;
        while (cur && !seen.has(cur.styleId) && out.length < 16) {
            seen.add(cur.styleId);
            out.unshift(cur);
            cur = cur.basedOn ? byId.get(cur.basedOn) : null;
        }
        return out;
    }
    return {
        /**
         * Effective paragraph properties and the run properties its style
         * carries. `listPPr` (a numbering level's) sits between the style and
         * the direct formatting, as in Word. In a table cell, the table
         * style's properties (`cell`) come over the document defaults — and
         * over the default paragraph style too (Word lets a table style
         * restyle "Normal" text, not a named style).
         * @param {Props} [pPr]
         * @param {Props} [listPPr]
         * @param {{pPr?: Props, rPr?: Props}|null} [cell]
         */
        paragraph(pPr, listPPr, cell) {
            const styleChain = chain(pPr?.pStyle || defaultPara?.styleId);
            const normal = !pPr?.pStyle || pPr.pStyle === defaultPara?.styleId;
            const sp = styleChain.map((s) => s.pPr);
            const sr = styleChain.map((s) => s.rPr);
            const p = normal ? merge(defaults.pPr, ...sp, cell?.pPr, listPPr, pPr) : merge(defaults.pPr, cell?.pPr, ...sp, listPPr, pPr);
            const r = normal ? merge(defaults.rPr, ...sr, cell?.rPr) : merge(defaults.rPr, cell?.rPr, ...sr);
            const outline = p.outlineLvl ?? styleChain.reduce((lvl, s) => s.pPr?.outlineLvl ?? lvl, undefined);
            // Built-in style NAMES stay English in every Word locale
            // ("heading 1", "Title"); style ids are translated ("Titre1").
            const named = (s) => String(s.name || s.styleId || '');
            const headingStyle = styleChain.map(named).reverse().find((n) => /^heading\s*\d$/i.test(n));
            const headingLevel = typeof outline === 'number' && outline < 9 ? outline + 1
                : headingStyle ? Number(headingStyle.replace(/\D/g, '')) : null;
            return {
                p, r, headingLevel,
                styleId: styleChain.length ? styleChain[styleChain.length - 1].styleId : null,
                title: styleChain.some((s) => /^title$/i.test(named(s)))
            };
        },
        /** Effective run properties over a paragraph's base. */
        run(baseRPr, rPr) {
            const rChain = chain(rPr?.rStyle);
            return merge(baseRPr, ...rChain.map((s) => s.rPr), rPr);
        },
        /** Table style properties (tblPr) of a table. */
        table(tblPr) {
            return merge(...chain(tblPr?.style || tblPr?.tblStyle).map((s) => s.tblPr), tblPr);
        },
        /**
         * What a table style gives the paragraphs of its cells, and its
         * conditional formats (`w:tblStylePr`: first row, bands…) by type,
         * read from the raw XML the typed model keeps.
         * @param {string|undefined} id
         */
        tableStyle(id) {
            const styleChain = chain(id);
            /** @type {Record<string, {rPr: Props, shd: string|null, borders: Record<string, any>|null}>} */
            const cond = {};
            for (const s of styleChain) {
                for (const x of s._extras || []) {
                    if (x?.name !== 'w:tblStylePr') continue;
                    const type = attr(x, 'w:type');
                    if (!type) continue;
                    const rRaw = (x.children || []).find((c) => c.name === 'w:rPr');
                    const tcRaw = (x.children || []).find((c) => c.name === 'w:tcPr');
                    const on = (tag) => {
                        const el = (rRaw?.children || []).find((c) => c.name === tag);
                        return el ? !/^(0|false|off)$/.test(attr(el, 'w:val') || '') : undefined;
                    };
                    const colour = attr((rRaw?.children || []).find((c) => c.name === 'w:color'), 'w:val');
                    const tc = { _extras: tcRaw?.children || [] };
                    const prev = cond[type] || { rPr: {}, shd: null, borders: null };
                    cond[type] = {
                        rPr: merge(prev.rPr, { bold: on('w:b'), italic: on('w:i'), color: colour && colour !== 'auto' ? colour : undefined }),
                        shd: shadingOf(tc) || prev.shd,
                        borders: bordersOf(tc, 'borders', 'w:tcBorders') || prev.borders
                    };
                }
            }
            return {
                pPr: merge(...styleChain.map((s) => s.pPr)),
                rPr: merge(...styleChain.map((s) => s.rPr)),
                cond,
                rowBand: Number(styleChain.map((s) => attr(extra(s.tblPr, 'w:tblStyleRowBandSize'), 'w:val')).filter(Boolean).pop()) || 1,
                colBand: Number(styleChain.map((s) => attr(extra(s.tblPr, 'w:tblStyleColBandSize'), 'w:val')).filter(Boolean).pop()) || 1
            };
        }
    };
}

/** CSS for a border bag entry (`{val, sz (eighths of a point), color}`). */
export function borderCss(b) {
    if (!b) return null;
    const val = b.val || b['w:val'];
    if (!val || val === 'nil' || val === 'none') return 'none';
    const sz = Number(b.sz ?? b['w:sz'] ?? 4) / 8;
    const colour = hexColour(b.color ?? b['w:color']) || 'currentColor';
    const style = val === 'double' ? 'double' : /dash/i.test(val) ? 'dashed' : /dot/i.test(val) ? 'dotted' : 'solid';
    return `${Math.max(1, sz * PX.pt).toFixed(1)}px ${style} ${colour}`;
}

/** Border bag from typed props or a raw `_extras` element (`w:tcBorders`, `w:pBdr`, `w:tblBorders`). */
export function bordersOf(props, typedKey, rawTag) {
    if (props?.[typedKey]) return props[typedKey];
    const raw = extra(props, rawTag);
    if (!raw) return null;
    /** @type {Record<string, any>} */
    const out = {};
    for (const c of raw.children || []) {
        if (c.type !== 'element') continue;
        out[c.name.replace(/^w:/, '')] = { val: attr(c, 'w:val'), sz: attr(c, 'w:sz'), color: attr(c, 'w:color') };
    }
    return out;
}

/** Shading fill colour (`w:shd w:fill`) from typed or raw props. */
export function shadingOf(props) {
    const typed = props?.shd || props?.shading;
    const fill = typed ? (typed.fill ?? typed['w:fill']) : attr(extra(props, 'w:shd'), 'w:fill');
    return fill && fill !== 'auto' ? hexColour(fill) : null;
}

/** Twips (number or numeric string) → CSS px, or null. */
export function twips(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n * PX.twip : null;
}

/** Inline CSS for run properties. */
export function runStyle(r) {
    /** @type {Record<string, string>} */
    const s = {};
    if (r.bold) s.fontWeight = '700';
    if (r.italic) s.fontStyle = 'italic';
    const deco = [];
    if (r.underline && r.underline !== 'none') deco.push('underline');
    if (r.strike || r.dstrike) deco.push('line-through');
    if (deco.length) s.textDecoration = deco.join(' ');
    if (r.underline === 'double') s.textDecorationStyle = 'double';
    const colour = hexColour(r.color?.val ?? r.color);
    if (colour) s.color = colour;
    if (r.size) s.fontSize = `${Number(r.size) / 2}pt`;
    const font = typeof r.font === 'string' ? r.font
        : (r.fonts?.ascii || r.fonts?.hAnsi || r.font?.ascii || r.rFonts?.ascii || attr(extra(r, 'w:rFonts'), 'w:ascii'));
    // The faces Word picks for East Asian and complex-script text come
    // next, so the browser falls back to them for those characters.
    const others = [r.fonts?.eastAsia, r.fonts?.cs].filter((f) => typeof f === 'string' && f && f !== font);
    const stack = fontStack(font || others.shift());
    if (stack) {
        const extras = [...new Set(others)].map((f) => `"${String(f).replace(/["\\]/g, '')}"`);
        s.fontFamily = extras.length ? stack.replace(/^("[^"]*")/, (first) => [first, ...extras].join(', ')) : stack;
    }
    if (r.vertAlign === 'superscript') { s.verticalAlign = 'super'; s.fontSize = '0.75em'; }
    if (r.vertAlign === 'subscript') { s.verticalAlign = 'sub'; s.fontSize = '0.75em'; }
    const hl = HIGHLIGHT[r.highlight] || shadingOf(r);
    if (hl) s.backgroundColor = hl;
    if (r.caps) s.textTransform = 'uppercase';
    if (r.smallCaps) s.fontVariant = 'small-caps';
    if (r.vanish) s.display = 'none';
    return s;
}

const HIGHLIGHT = Object.freeze({
    yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
    darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
    darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff'
});

/** Inline CSS for paragraph properties. */
export function paragraphStyle(p) {
    /** @type {Record<string, string>} */
    const s = {};
    const align = p.align || p.jc;
    if (align === 'center') s.textAlign = 'center';
    else if (align === 'right' || align === 'end') s.textAlign = 'right';
    else if (align === 'both' || align === 'distribute') s.textAlign = 'justify';
    const ind = p.indent || {};
    const left = twips(ind.left ?? ind.start);
    const right = twips(ind.right ?? ind.end);
    const first = twips(ind.firstLine);
    const hanging = twips(ind.hanging);
    if (left) s.marginLeft = `${left.toFixed(1)}px`;
    if (right) s.marginRight = `${right.toFixed(1)}px`;
    if (hanging) s.textIndent = `${(-hanging).toFixed(1)}px`;
    else if (first) s.textIndent = `${first.toFixed(1)}px`;
    const sp = p.spacing || {};
    const before = twips(sp.before);
    const after = twips(sp.after);
    s.marginTop = `${(before ?? 0).toFixed(1)}px`;
    s.marginBottom = `${(after ?? 0).toFixed(1)}px`;
    if (sp.line) {
        const line = Number(sp.line);
        if (!sp.lineRule || sp.lineRule === 'auto') s.lineHeight = String(Math.max(0.6, (line / 240) * 1.15).toFixed(3));
        else s.lineHeight = `${(line * PX.twip).toFixed(1)}px`;
    }
    const shade = shadingOf(p);
    if (shade) s.backgroundColor = shade;
    const bdr = bordersOf(p, 'borders', 'w:pBdr');
    if (bdr) {
        for (const side of ['top', 'right', 'bottom', 'left']) {
            const css = borderCss(bdr[side]);
            if (css && css !== 'none') s[`border${side[0].toUpperCase()}${side.slice(1)}`] = css;
        }
    }
    if (p.keepNext || p.keepLines) s.breakInside = 'avoid';
    return s;
}
