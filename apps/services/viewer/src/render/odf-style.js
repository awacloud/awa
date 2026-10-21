// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The OpenDocument style cascade, for the ODT / ODS / ODP
 * painters.
 *
 * `@awacloud/odf` hands styles back in three shapes — content automatic
 * styles as typed specs (`{name, family, parentStyleName, properties}`),
 * `styles.xml` styles as element nodes whose property children are partly
 * typed (`{kind, attrs, fontSize, marginTop…}`), and default styles. This
 * module folds them into one registry of property bags keyed by LOCAL
 * attribute name (`font-size`, `margin-top`, `background-color`…), resolves
 * `parent-style-name` chains (relative font sizes included) and maps the
 * bags to CSS.
 *
 * @module viewer/render/odf-style
 */
import { applyCrop, hexColour, lengthPx } from './view.js';
import { fontStack } from './flow.js';

/** Property groups, by the element kind that carries them. */
const GROUPS = Object.freeze({
    'style:paragraph-properties': 'paragraph', 'style:text-properties': 'text',
    'style:table-properties': 'table', 'style:table-column-properties': 'tableColumn',
    'style:table-row-properties': 'tableRow', 'style:table-cell-properties': 'tableCell',
    'style:graphic-properties': 'graphic', 'style:drawing-page-properties': 'drawingPage',
    'style:page-layout-properties': 'pageLayout'
});

/** `fontSize` → `font-size`: typed camelCase keys back to attribute local names. */
const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
/** `fo:font-size` → `font-size`. */
const local = (k) => k.slice(k.indexOf(':') + 1);

/**
 * One property element (`{kind|name, attrs, …typed}`) → `{group, bag}`.
 * @param {any} child
 */
function readProps(child) {
    const kind = child.kind || child.name;
    const group = GROUPS[/** @type {keyof typeof GROUPS} */ (kind)];
    if (!group) return null;
    /** @type {Record<string, string>} */
    const bag = {};
    for (const [k, v] of Object.entries(child.attrs || {})) bag[local(k)] = String(v);
    for (const [k, v] of Object.entries(child)) {
        if (k === 'kind' || k === 'name' || k === 'attrs' || k === 'children' || k === 'type' || k === '_extras') continue;
        if (v === null || v === undefined || typeof v === 'object') continue;
        bag[kebab(k)] = String(v);
    }
    return { group, bag };
}

/**
 * @typedef {{name: string, family: string, parent: string|null,
 *   props: Record<string, Record<string, string>>, attrs: Record<string, string>}} OdfStyle
 */

/**
 * Normalise one style, whatever its shape.
 * @param {any} s
 * @returns {OdfStyle|null}
 */
function normalise(s) {
    if (!s) return null;
    // Typed spec (content automatic styles).
    if (typeof s.name === 'string' && s.properties) {
        /** @type {Record<string, Record<string, string>>} */
        const props = {};
        for (const [group, bag] of Object.entries(s.properties || {})) {
            props[group] = {};
            for (const [k, v] of Object.entries(bag || {})) props[group][local(k)] = String(v);
        }
        // Property elements the typed reader left raw (drawing-page, …).
        for (const child of s._extras?.children || []) {
            const r = readProps(child);
            if (r) props[r.group] = { ...(props[r.group] || {}), ...r.bag };
        }
        return { name: s.name, family: s.family || '', parent: s.parentStyleName || null, props, attrs: {} };
    }
    // Element node (`style:style`, `style:default-style`, `style:page-layout`…).
    const attrs = s.attrs || {};
    const name = attrs['style:name'] || (s.name === 'style:default-style' || s.kind === 'style:default-style' ? `#default:${attrs['style:family']}` : null);
    if (!name) return null;
    /** @type {Record<string, Record<string, string>>} */
    const props = {};
    for (const child of s.children || []) {
        const r = readProps(child);
        if (r) props[r.group] = { ...(props[r.group] || {}), ...r.bag };
    }
    const flat = {};
    for (const [k, v] of Object.entries(attrs)) flat[local(k)] = String(v);
    return { name, family: attrs['style:family'] || '', parent: attrs['style:parent-style-name'] || null, props, attrs: flat };
}

/**
 * Build the style registry of a document.
 *
 * @param {{styles?: any, autoStyles?: any}} doc an `odt` / `ods` / `odp` read result
 */
export function createOdfStyles(doc) {
    /** @type {Map<string, OdfStyle>} */
    const byName = new Map();
    const add = (list) => { for (const s of list || []) { const n = normalise(s); if (n) byName.set(`${n.family}|${n.name}`, n); } };
    add(doc.styles?.styles);
    add(doc.styles?.automaticStyles);
    add(doc.autoStyles?.styles);
    add(doc.automaticStyles?.styles);

    /** Font face name → CSS family (from `office:font-face-decls`). */
    const faces = new Map();
    const scan = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(scan); return; }
        if (node.name === 'style:font-face' && node.attrs) {
            faces.set(node.attrs['style:name'], String(node.attrs['svg:font-family'] || node.attrs['style:name']).replace(/^['"]|['"]$/g, ''));
        }
        if (node.children) scan(node.children);
    };
    scan(doc.styles?._extras);
    scan(doc.autoStyles?._extras);
    scan(doc._extras);

    /**
     * Resolve a style and its ancestors into one bag per group. Relative
     * font sizes (`130%`) are multiplied out against the parent's size.
     * @param {string|null|undefined} name
     * @param {string} family
     * @returns {Record<string, Record<string, string>>}
     */
    function resolve(name, family) {
        /** @type {OdfStyle[]} */
        const chain = [];
        const seen = new Set();
        let cur = name ? byName.get(`${family}|${name}`) : null;
        while (cur && !seen.has(cur.name) && chain.length < 16) {
            seen.add(cur.name);
            chain.unshift(cur);
            cur = cur.parent ? byName.get(`${family}|${cur.parent}`) : null;
        }
        const def = byName.get(`${family}|#default:${family}`);
        if (def) chain.unshift(def);
        /** @type {Record<string, Record<string, string>>} */
        const out = {};
        for (const s of chain) {
            for (const [group, bag] of Object.entries(s.props)) {
                const prev = out[group] || {};
                const next = { ...prev, ...bag };
                const size = bag['font-size'];
                if (size && size.endsWith('%') && prev['font-size']) {
                    const base = lengthPx(prev['font-size']);
                    if (base !== null) next['font-size'] = `${(base * parseFloat(size)) / 100}px`;
                }
                out[group] = next;
            }
            if (s.attrs['default-outline-level'] && !out.outline) out.outline = { level: s.attrs['default-outline-level'] };
            if (s.attrs['data-style-name']) out.data = { style: s.attrs['data-style-name'] };
        }
        return out;
    }

    return {
        resolve,
        /** @param {string} name */
        face(name) { return faces.get(name) || name; },
        /** The raw normalised style (no cascade). */
        get(name, family) { return byName.get(`${family}|${name}`) || null; }
    };
}

/** A border shorthand (`0.5pt solid #000000`) → CSS, or null for none. */
function border(v) {
    if (!v || v === 'none') return null;
    const parts = v.trim().split(/\s+/);
    const width = lengthPx(parts.find((p) => /^[\d.]+(pt|cm|mm|in|px)$/.test(p)) || '0.75pt') || 1;
    const style = parts.find((p) => /^(solid|double|dotted|dashed|groove|ridge|inset|outset)$/.test(p)) || 'solid';
    const colour = hexColour(parts.find((p) => p.startsWith('#'))) || 'currentColor';
    return `${Math.max(1, width).toFixed(1)}px ${style} ${colour}`;
}

/**
 * CSS for a text property bag.
 * @param {Record<string, string>|undefined} t
 * @param {(name: string) => string} face
 */
export function textCss(t, face) {
    /** @type {Record<string, string>} */
    const s = {};
    if (!t) return s;
    if (t['font-weight'] && t['font-weight'] !== 'normal') s.fontWeight = t['font-weight'] === 'bold' ? '700' : t['font-weight'];
    if (t['font-style'] && t['font-style'] !== 'normal') s.fontStyle = t['font-style'];
    const size = lengthPx(t['font-size']);
    if (size) s.fontSize = `${size.toFixed(2)}px`;
    const colour = hexColour(t.color);
    if (colour) s.color = colour;
    const family = t['font-name'] ? face(t['font-name']) : t['font-family'];
    const stack = fontStack(family);
    if (stack) s.fontFamily = stack;
    const deco = [];
    if (t['text-underline-style'] && t['text-underline-style'] !== 'none') deco.push('underline');
    if (t['text-line-through-style'] && t['text-line-through-style'] !== 'none') deco.push('line-through');
    if (deco.length) s.textDecoration = deco.join(' ');
    const bg = hexColour(t['background-color']);
    if (bg) s.backgroundColor = bg;
    const pos = t['text-position'];
    if (pos && /^(super|sub|-?\d)/.test(pos)) {
        const [shift] = pos.split(/\s+/);
        s.verticalAlign = shift === 'super' || parseFloat(shift) > 0 ? 'super' : 'sub';
        s.fontSize = '0.7em';
    }
    if (t['text-transform'] && t['text-transform'] !== 'none') s.textTransform = t['text-transform'];
    if (t['font-variant'] === 'small-caps') s.fontVariant = 'small-caps';
    if (t.display === 'none') s.display = 'none';
    return s;
}

/**
 * CSS for a paragraph property bag.
 * @param {Record<string, string>|undefined} p
 */
export function paragraphCss(p) {
    /** @type {Record<string, string>} */
    const s = {};
    if (!p) return s;
    const align = p['text-align'];
    if (align) s.textAlign = align === 'start' ? 'left' : align === 'end' ? 'right' : align;
    for (const side of ['top', 'bottom', 'left', 'right']) {
        const v = lengthPx(p[`margin-${side}`]);
        if (v !== null) s[`margin${side[0].toUpperCase()}${side.slice(1)}`] = `${v.toFixed(1)}px`;
    }
    const indent = lengthPx(p['text-indent']);
    if (indent) s.textIndent = `${indent.toFixed(1)}px`;
    const lh = p['line-height'];
    if (lh && lh !== 'normal') s.lineHeight = lh.endsWith('%') ? String(parseFloat(lh) / 100 * 1.15) : `${(lengthPx(lh) || 0).toFixed(1)}px`;
    const bg = hexColour(p['background-color']);
    if (bg) s.backgroundColor = bg;
    Object.assign(s, boxCss(p));
    return s;
}

/**
 * Borders and padding of a paragraph / cell bag.
 * @param {Record<string, string>|undefined} b
 */
export function boxCss(b) {
    /** @type {Record<string, string>} */
    const s = {};
    if (!b) return s;
    const all = border(b.border);
    for (const side of ['top', 'right', 'bottom', 'left']) {
        const v = b[`border-${side}`] !== undefined ? border(b[`border-${side}`]) : all;
        if (v) s[`border${side[0].toUpperCase()}${side.slice(1)}`] = v;
    }
    const pad = lengthPx(b.padding);
    for (const side of ['top', 'right', 'bottom', 'left']) {
        const v = lengthPx(b[`padding-${side}`]) ?? pad;
        if (v !== null && v !== undefined) s[`padding${side[0].toUpperCase()}${side.slice(1)}`] = `${v.toFixed(1)}px`;
    }
    return s;
}

/**
 * CSS for a table-cell property bag.
 * @param {Record<string, string>|undefined} c
 */
export function cellCss(c) {
    /** @type {Record<string, string>} */
    const s = { ...boxCss(c) };
    if (!c) return s;
    const bg = hexColour(c['background-color']);
    if (bg) s.backgroundColor = bg;
    const va = c['vertical-align'];
    if (va && va !== 'automatic') s.verticalAlign = va === 'middle' ? 'middle' : va;
    if (c['wrap-option'] === 'no-wrap') s.whiteSpace = 'nowrap';
    return s;
}

/** Apply a CSS record (camelCase keys) to an element's style. */
export function applyCss(el, css) {
    for (const [k, v] of Object.entries(css)) el.style.setProperty(kebab(k), v);
    return el;
}

/**
 * `fo:clip` (`rect(top, right, bottom, left)`, ODF 1.3 §20.179): lengths
 * cut from the picture's edges, measured on its natural size. `auto` and
 * unparsable values give `null`.
 * @param {string|undefined} clip
 * @returns {{t: number, r: number, b: number, l: number}|null} CSS px
 */
export function parseClip(clip) {
    const m = /^\s*rect\(([^)]*)\)\s*$/i.exec(String(clip || ''));
    if (!m) return null;
    const v = m[1].split(/\s*,\s*|\s+/).map((x) => (x === 'auto' ? 0 : lengthPx(x)));
    if (v.length !== 4 || v.some((x) => x === null)) return null;
    const [t, r, b, l] = /** @type {number[]} */ (v);
    return t || r || b || l ? { t, r, b, l } : null;
}

/**
 * Crop a picture by its `fo:clip` once its natural size is known: the
 * lengths are on the picture's own size (96 dpi when it declares none).
 * @param {HTMLElement} frame positioned box sized as the visible part
 * @param {HTMLImageElement} img
 * @param {{t: number, r: number, b: number, l: number}} clip CSS px
 */
export function cropOnLoad(frame, img, clip) {
    const apply = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w > 0 && h > 0) applyCrop(frame, img, { l: clip.l / w, r: clip.r / w, t: clip.t / h, b: clip.b / h });
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
}
