// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PPTX and ODP → a paged View, one page per slide.
 *
 * A slide is built ONCE as real DOM at its natural size — absolutely
 * placed shapes, pictures and tables, with live text — and each page draw
 * scales it with a CSS transform. The text stays selectable and is read by
 * screen readers; nothing is rasterised.
 *
 * PPTX: `@awacloud/ooxml`'s `pptxLargeBundle` reads the deck; this module
 * resolves what PowerPoint inherits — placeholder geometry from the layout
 * then the master, text styles from the master's `txStyles` and the
 * placeholders' list styles, theme colours through the master's colour map,
 * backgrounds — and paints rectangles, rounded rectangles and ellipses;
 * other preset geometries are drawn as their bounding box and recorded.
 *
 * ODP: `@awacloud/odf`'s `odpLargeBundle` reads the deck; frames, text
 * boxes, images and the common custom shapes are painted through the ODF
 * style cascade.
 *
 * @module viewer/render/slides
 */
import { h } from './dom.js';
import { hardenLinks } from './html.js';
import { bulletChar, fontStack } from './flow.js';
import { applyCss, createOdfStyles, cropOnLoad, parseClip } from './odf-style.js';
import { odfNodes } from './odf-text.js';
import { applyCrop, createOmissions, createUrlPool, hexColour, imageType, lengthPx, pageSide, PX, typedCrop } from './view.js';

/**
 * @typedef {{width: number, height: number, background: string|null, element: HTMLElement}} BuiltSlide
 */

/** A paged View over built slides. */
function slidesView(slides, ctx, meta, omissions, urls) {
    return {
        kind: 'paged',
        pageLabel: 'slide',
        title: meta.title || ctx.name,
        meta,
        pages: slides.map((s) => ({
            width: s.width,
            height: s.height,
            async draw(host, zoom) {
                const surface = /** @type {HTMLElement} */ (host.querySelector('.awv-page-surface') || host);
                s.element.style.transform = `scale(${zoom})`;
                if (s.element.parentNode !== surface) surface.replaceChildren(s.element);
            }
        })),
        omissions: omissions.list(),
        dispose() { urls.dispose(); }
    };
}

/**
 * Apply DrawingML colour transforms (ECMA-376 §20.1.2.3) in document
 * order: `lumMod` / `lumOff` on the HSL lightness, `tint` towards white,
 * `shade` towards black. Others (alpha, satMod…) are left out.
 * @param {string} hex `#rrggbb`
 * @param {any} node the colour element (`a:schemeClr`, `a:srgbClr`…)
 */
export function colourMods(hex, node) {
    const mods = (node?.children || [])
        .filter((m) => typeof m?.name === 'string')
        .map((m) => ({ name: m.name.replace(/^a:/, ''), val: Number(m.attrs?.val) }));
    return applyMods(hex, mods);
}

/**
 * The same transforms, from the typed form `@awacloud/ooxml` gives
 * (`mods: [{ name, val }]`, `val` in 1/1000 %).
 * @param {string} hex `#rrggbb`
 * @param {{name: string, val?: number}[]} mods
 */
export function applyMods(hex, mods) {
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    for (const m of mods || []) {
        const v = Number(m?.val) / 100000;
        if (!Number.isFinite(v)) continue;
        if (m.name === 'tint') [r, g, b] = [r, g, b].map((c) => c * v + (1 - v));
        else if (m.name === 'shade') [r, g, b] = [r, g, b].map((c) => c * v);
        else if (m.name === 'lumMod' || m.name === 'lumOff') {
            const max = Math.max(r, g, b); const min = Math.min(r, g, b);
            let hue = 0; let sat = 0; let lum = (max + min) / 2;
            if (max !== min) {
                const d = max - min;
                sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
                hue = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
            }
            lum = Math.min(1, Math.max(0, m.name === 'lumMod' ? lum * v : lum + v));
            const f = (p, q, x) => {
                if (x < 0) x += 1; if (x > 1) x -= 1;
                if (x < 1 / 6) return p + (q - p) * 6 * x;
                if (x < 1 / 2) return q;
                if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
                return p;
            };
            if (!sat) { r = g = b = lum; } else {
                const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
                const p = 2 * lum - q;
                r = f(p, q, hue + 1 / 3); g = f(p, q, hue); b = f(p, q, hue - 1 / 3);
            }
        }
    }
    const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Mark a slide box as a picture that cannot be shown: named for assistive
 * technology, labelled on screen.
 * @param {HTMLElement} el
 * @param {string} what
 */
function missingBox(el, what, t) {
    el.classList.add('awv-missing');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', t('view.unavailable', { what: what || t('view.image') }));
}

/** A slide frame: the positioned box every item sits in. */
function box(x, y, w, ht, extra = {}) {
    return h('div', {
        class: 'awv-shape',
        style: { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px`, width: `${Math.max(0, w).toFixed(1)}px`, height: `${Math.max(0, ht).toFixed(1)}px`, ...extra }
    });
}

// ── PPTX ─────────────────────────────────────────────────────────────────

/** First child element of a raw node by name. */
const child = (node, name) => (node?.children || []).find((c) => c && c.name === name) || null;
/** Descendant element by path (`a:lvl1pPr/a:defRPr`). */
const path = (node, p) => p.split('/').reduce((n, name) => child(n, name), node);

/** Placeholder category: which master text style applies. */
function category(ph) {
    const t = ph?.type;
    if (t === 'title' || t === 'ctrTitle') return 'title';
    if (t === 'dt' || t === 'ftr' || t === 'sldNum' || t === 'hdr') return 'other';
    return ph ? 'body' : 'other';
}

/**
 * @param {Uint8Array} bytes
 * @param {import('./index.js').RenderContext} ctx
 */
export async function renderPptx(bytes, ctx) {
    const { pptx } = await ctx.engine('pptx');
    // Typed run colours: theme-coloured runs reach `colour()` as `{ schemeColor }`.
    const d = pptx.read(bytes, { typedRunColors: true });
    const P = d.presentation;
    const omissions = createOmissions();
    const urls = createUrlPool();
    const missing = (el, what) => missingBox(el, what, ctx.t);

    // Slide size: `presentation.sldSize` (`p:sldSz`, ECMA-376 §19.2.1.39),
    // 914400–51206400 EMU through `pageSide`; 16:9 by default.
    let W = 12192000 * PX.emu;
    let H = 6858000 * PX.emu;
    const w = pageSide(Number(P.sldSize?.cx) * PX.emu, 0);
    const ht = pageSide(Number(P.sldSize?.cy) * PX.emu, 0);
    if (w && ht) { W = w; H = ht; }

    // Theme colours, through the master's colour map.
    const master = (P.slideMasters || [])[0] || { shapes: [] };
    const themeColours = P.theme?.clrScheme?.colors || {};
    const clrMap = master.clrMap?.attrs || { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    const fonts = P.theme?.fontScheme || {};
    /** Scheme colour name → `#rrggbb`. */
    function scheme(name) {
        const key = clrMap[name] || name;
        const c = themeColours[key];
        return hexColour(typeof c === 'string' ? c : (c?.srgb || c?.sysClr?.lastClr)) || null;
    }
    /** A raw colour holder (`a:solidFill`, `a:schemeClr`, `a:srgbClr`…) → `#rrggbb`. */
    function rawColour(node) {
        if (!node) return null;
        const srgb = child(node, 'a:srgbClr') || (node.name === 'a:srgbClr' ? node : null);
        const sch = child(node, 'a:schemeClr') || (node.name === 'a:schemeClr' ? node : null);
        const sys = child(node, 'a:sysClr') || (node.name === 'a:sysClr' ? node : null);
        const el = srgb || sch || sys;
        const hex = srgb ? hexColour(srgb.attrs?.val) : sch ? scheme(sch.attrs?.val) : sys ? hexColour(sys.attrs?.lastClr) : null;
        return hex && el ? colourMods(hex, el) : hex;
    }
    /**
     * A typed colour → `#rrggbb`: `'RRGGBB'`, or `{ rgb | schemeColor,
     * mods? }` as `@awacloud/ooxml` types shape fills and (with
     * `typedRunColors`) run colours; `{ color }` is accepted too.
     */
    function colour(c) {
        if (!c) return null;
        if (typeof c === 'string') return hexColour(c) || scheme(c);
        const hex = c.rgb ? hexColour(c.rgb) : c.color ? hexColour(c.color) : c.schemeColor ? scheme(c.schemeColor) : null;
        return hex && Array.isArray(c.mods) && c.mods.length ? applyMods(hex, c.mods) : hex;
    }
    /** Typeface, resolving the theme's `+mj-lt` / `+mn-lt` references. */
    function typeface(name) {
        if (!name) return null;
        if (name.startsWith('+mj')) return fonts.majorFont?.latin || null;
        if (name.startsWith('+mn')) return fonts.minorFont?.latin || null;
        return name;
    }

    /** Read `a:lvlNpPr` levels of a list style / txStyles section. */
    function levels(node) {
        /** @type {Record<number, any>} */
        const out = {};
        for (let i = 1; i <= 9; i++) {
            const lvl = child(node, `a:lvl${i}pPr`);
            if (!lvl) continue;
            const def = child(lvl, 'a:defRPr');
            const latin = child(def, 'a:latin');
            const bu = child(lvl, 'a:buChar');
            out[i] = {
                align: lvl.attrs?.algn, marL: lvl.attrs?.marL, indent: lvl.attrs?.indent,
                size: def?.attrs?.sz, bold: def?.attrs?.b, italic: def?.attrs?.i,
                color: rawColour(child(def, 'a:solidFill')), font: latin?.attrs?.typeface,
                bullet: child(lvl, 'a:buNone') ? 'none' : (bu ? bu.attrs?.char : undefined)
            };
        }
        return out;
    }
    const txStyles = {
        title: levels(child(master.txStyles, 'p:titleStyle')),
        body: levels(child(master.txStyles, 'p:bodyStyle')),
        other: levels(child(master.txStyles, 'p:otherStyle'))
    };

    /** The placeholder this shape inherits from, in a layout or master. */
    function inherited(list, ph) {
        if (!ph) return null;
        return (list || []).find((s) => s.placeholder && ((ph.idx !== undefined && s.placeholder.idx === ph.idx) || (s.placeholder.type && s.placeholder.type === ph.type)))
            || (list || []).find((s) => s.placeholder && category(s.placeholder) === category(ph) && category(ph) !== 'other');
    }

    /** Geometry of a shape: its own, else its layout's, else its master's. */
    function geometry(shape, chain) {
        for (const s of [shape, ...chain]) {
            const p = s?.shapeProps || s;
            if (p && Number.isFinite(Number(p.cx)) && Number(p.cx) > 0) {
                return { x: Number(p.offsetX || 0) * PX.emu, y: Number(p.offsetY || 0) * PX.emu, w: Number(p.cx) * PX.emu, h: Number(p.cy) * PX.emu, rot: Number(p.rotation || 0) / 60000, flipH: !!p.flipH, flipV: !!p.flipV };
            }
        }
        return null;
    }

    /**
     * Paint a text body.
     * @param {any} body `txBody`
     * @param {Record<number, any>[]} styleChain level styles, weakest first
     */
    function textBody(body, styleChain, fontScale) {
        const el = h('div', { class: 'awv-shape-text' });
        for (const para of body?.paragraphs || []) {
            const pPr = para.pPr || {};
            const lvl = Number(pPr.lvl ?? pPr.level ?? 0) + 1;
            // A level that leaves a property out inherits it: never copy an undefined.
            /** @type {Record<string, any>} */
            const base = {};
            for (const s of styleChain) for (const [k, v] of Object.entries(s[lvl] || {})) if (v !== undefined) base[k] = v;
            const align = pPr.align || base.align;
            const p = h('p', { class: 'awv-slide-p' });
            if (align) p.style.textAlign = { ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[align] || 'left';
            const marL = Number(pPr.marL ?? base.marL ?? 0) * PX.emu;
            const indent = Number(pPr.indent ?? base.indent ?? 0) * PX.emu;
            if (marL) p.style.paddingLeft = `${marL.toFixed(1)}px`;
            if (indent) p.style.textIndent = `${indent.toFixed(1)}px`;
            const runSize = (r) => Number(r?.size ?? base.size ?? 1800) / 100 * fontScale;
            const bullet = pPr.bullet === 'none' ? null : (typeof pPr.bullet === 'object' ? pPr.bullet?.char : (pPr.bullet && pPr.bullet !== 'none' ? pPr.bullet : null)) ?? (base.bullet && base.bullet !== 'none' ? base.bullet : null);
            const runs = para.runs || [];
            if (bullet && runs.some((r) => r.value)) {
                p.append(h('span', { class: 'awv-slide-bullet', style: { fontSize: `${runSize(runs[0]?.rPr).toFixed(1)}pt` } }, bulletChar(bullet)));
            }
            for (const run of runs) {
                if (run.type === 'break') { p.append(h('br')); continue; }
                const r = run.rPr || {};
                const span = h('span', {}, run.value ?? run.text ?? '');
                const s = span.style;
                s.fontSize = `${runSize(r).toFixed(1)}pt`;
                if (r.bold ?? (base.bold === '1')) s.fontWeight = '700';
                if (r.italic ?? (base.italic === '1')) s.fontStyle = 'italic';
                const deco = [];
                if (r.underline && r.underline !== 'none') deco.push('underline');
                if (r.strike && r.strike !== 'noStrike') deco.push('line-through');
                if (deco.length) s.textDecoration = deco.join(' ');
                const c = colour(r.color) || base.color;
                if (c) s.color = c;
                const font = fontStack(typeface(r.font || base.font));
                if (font) s.fontFamily = font;
                if (r.baseline > 0) s.verticalAlign = 'super';
                else if (r.baseline < 0) s.verticalAlign = 'sub';
                if (r.lang) span.lang = r.lang;
                if (run.link || r.hlinkClick) {
                    const a = h('a', { href: run.link || null }, span);
                    p.append(a);
                } else p.append(span);
            }
            if (!runs.length) {
                p.append(h('br'));
                p.style.fontSize = `${runSize(null).toFixed(1)}pt`;
            }
            el.append(p);
        }
        return el;
    }

    /** Fill / outline CSS of a shape, from its typed props or its `p:style` references. */
    function shapeCss(shape, geom) {
        /** @type {Record<string, string>} */
        const css = {};
        const sp = shape.shapeProps || {};
        let fill = null;
        if (sp.fill && sp.fill !== 'none') fill = colour(sp.fill);
        else if (!sp.fill && shape.style) fill = rawColour(child(shape.style, 'a:fillRef'));
        if (sp.fill && typeof sp.fill === 'object' && (sp.fill.gradient || sp.fill.stops)) {
            omissions.add('slide/gradient');
            fill = colour(sp.fill.stops?.[0]?.color) || fill;
        }
        if (fill) css.backgroundColor = fill;
        const ln = sp.line;
        let lineColour = null;
        let lineWidth = 0;
        if (ln && ln !== 'none') {
            lineColour = colour(ln.color) || (shape.style ? rawColour(child(shape.style, 'a:lnRef')) : null);
            lineWidth = Number(ln.width ?? 12700) * PX.emu;
        } else if (!ln && shape.style && Number(child(shape.style, 'a:lnRef')?.attrs?.idx) > 0) {
            lineColour = rawColour(child(shape.style, 'a:lnRef'));
            lineWidth = 1;
        }
        if (lineColour && lineWidth > 0) css.border = `${Math.max(1, lineWidth).toFixed(1)}px ${ln?.dash && ln.dash !== 'solid' ? 'dashed' : 'solid'} ${lineColour}`;
        const g = sp.geom || 'rect';
        if (g === 'ellipse') css.borderRadius = '50%';
        else if (g === 'roundRect') css.borderRadius = `${(Math.min(geom.w, geom.h) * 0.1667).toFixed(1)}px`;
        else if (g !== 'rect' && (fill || css.border)) omissions.add('slide/geometry');
        return css;
    }

    /** Transform (rotation / flips) of a geometry. */
    function transform(geom) {
        const t = [];
        if (geom.rot) t.push(`rotate(${geom.rot}deg)`);
        if (geom.flipH) t.push('scaleX(-1)');
        if (geom.flipV) t.push('scaleY(-1)');
        return t.length ? { transform: t.join(' ') } : {};
    }

    /** Body properties: vertical anchor, insets, autofit scale. */
    function bodyProps(body, chainBodies) {
        const bp = [body?.bodyPr, ...chainBodies.map((b) => b?.bodyPr)].find((x) => x && x.attrs && Object.keys(x.attrs).length) || body?.bodyPr || null;
        const a = bp?.attrs || {};
        const ins = (k, d) => Number(a[k] ?? d) * PX.emu;
        const fit = child(body?.bodyPr, 'a:normAutofit');
        return {
            anchor: { t: 'flex-start', ctr: 'center', b: 'flex-end' }[a.anchor] || 'flex-start',
            padding: `${ins('tIns', 45720).toFixed(1)}px ${ins('rIns', 91440).toFixed(1)}px ${ins('bIns', 45720).toFixed(1)}px ${ins('lIns', 91440).toFixed(1)}px`,
            fontScale: fit?.attrs?.fontScale ? Number(fit.attrs.fontScale) / 100000 : 1
        };
    }

    /** Paint one shape-tree item; returns null when nothing is drawn. */
    function item(shape, layout, isTemplate) {
        if (!shape) return null;
        if (shape.type === 'picture') {
            const geom = geometry(shape, []);
            const data = shape.image?.data;
            const type = shape.image?.contentType || imageType(shape.image?.partName || '');
            if (!geom || !geom.w) return null;
            const el = box(geom.x, geom.y, geom.w, geom.h, transform(geom));
            if (data && type && /^image\/(png|jpeg|gif|bmp|webp|svg\+xml)$/.test(type)) {
                // The author's description or title; never the automatic name ("Picture 3").
                const img = /** @type {HTMLImageElement} */ (h('img', { src: urls.add(data, type), alt: shape.description || shape.title || '' }));
                if (shape.prstGeom === 'ellipse') el.style.borderRadius = '50%';
                el.append(img);
                applyCrop(el, img, typedCrop(shape.srcRect));
            } else {
                omissions.add(data ? 'image/format' : 'slide/media');
                missing(el, shape.description || shape.title || '');
            }
            return el;
        }
        if (shape.type === 'table') return table(shape);
        if (shape.type === 'chart' || shape.type === 'graphicFrame') {
            const geom = geometry(shape, []);
            omissions.add(shape.type === 'chart' ? 'slide/chart' : 'slide/media');
            if (!geom) return null;
            const el = box(geom.x, geom.y, geom.w, geom.h, {});
            el.append(h('span', { class: 'awv-missing', role: 'img', 'aria-label': ctx.t('view.unavailable', { what: shape.name || '' }) }));
            return el;
        }
        if (shape.type !== 'shape') { omissions.add('slide/geometry'); return null; }
        // Placeholders on layouts and masters are prompts, not content.
        if (isTemplate && shape.placeholder) return null;
        const ph = shape.placeholder || null;
        const fromLayout = inherited(layout?.shapes, ph);
        const fromMaster = inherited(master.shapes, ph);
        const geom = geometry(shape, [fromLayout, fromMaster]);
        if (!geom) return null;
        const el = box(geom.x, geom.y, geom.w, geom.h, { ...shapeCss(shape, geom), ...transform(geom) });
        if (shape.txBody && (shape.txBody.paragraphs || []).some((p) => (p.runs || []).length)) {
            const bp = bodyProps(shape.txBody, [fromLayout?.txBody, fromMaster?.txBody]);
            const cat = category(ph);
            const chain = [txStyles[cat], levels(fromMaster?.txBody?.lstStyle), levels(fromLayout?.txBody?.lstStyle), levels(shape.txBody.lstStyle)];
            const text = textBody(shape.txBody, chain, bp.fontScale);
            text.style.justifyContent = bp.anchor;
            text.style.padding = bp.padding;
            el.append(text);
        }
        return el;
    }

    /** A table graphic frame. */
    function table(frame) {
        const geom = geometry(frame, []) || { x: 0, y: 0, w: 0, h: 0, rot: 0, flipH: false, flipV: false };
        const el = box(geom.x, geom.y, geom.w, geom.h, { height: 'auto' });
        const t = frame.table || frame;
        const accent = scheme('accent1') || '#4472c4';
        const tbl = h('table', { class: 'awv-slide-table' });
        tbl.append(h('colgroup', {}, (t.columns || []).map((c) => h('col', { style: { width: `${(Number(c.width) * PX.emu).toFixed(1)}px` } }))));
        const rows = t.rows || [];
        rows.forEach((row, ri) => {
            const tr = h('tr', { style: { height: `${(Number(row.height) * PX.emu).toFixed(1)}px` } });
            for (const cell of row.cells || []) {
                if (cell.hMerge || cell.vMerge) continue;
                const td = h(ri === 0 ? 'th' : 'td', { colspan: cell.gridSpan > 1 ? cell.gridSpan : null, rowspan: cell.rowSpan > 1 ? cell.rowSpan : null });
                const fill = rawColour(child(cell.tcPr, 'a:solidFill'));
                // The default table style (Medium Style 2 – Accent 1): header, bands.
                td.style.backgroundColor = fill || (ri === 0 ? accent : (ri % 2 ? `color-mix(in srgb, ${accent} 30%, white)` : `color-mix(in srgb, ${accent} 15%, white)`));
                if (ri === 0 && !fill) { td.style.color = '#ffffff'; td.style.fontWeight = '700'; }
                td.append(textBody(cell.txBody, [txStyles.other], 1));
                tr.append(td);
            }
            tbl.append(tr);
        });
        el.append(tbl);
        return el;
    }

    /** Background CSS from a `p:bg` node. */
    function background(bg) {
        if (!bg) return null;
        const pr = child(bg, 'p:bgPr');
        if (pr) {
            if (child(pr, 'a:gradFill')) omissions.add('slide/gradient');
            return rawColour(child(pr, 'a:solidFill')) || rawColour(path(pr, 'a:gradFill/a:gsLst/a:gs')) || null;
        }
        return rawColour(child(bg, 'p:bgRef'));
    }

    const built = (P.slides || []).map((slide) => {
        const layout = (P.slideLayouts || [])[Number(slide.layoutRef) || 0] || null;
        const el = h('div', { class: 'awv-slide', style: { width: `${W}px`, height: `${H}px` } });
        el.style.background = background(slide.bg) || background(layout?.bg) || background(master.bg) || '#ffffff';
        // Decorations of the master then the layout (non-placeholder shapes), then the slide.
        for (const s of master.shapes || []) { const it = item(s, layout, true); if (it) el.append(it); }
        for (const s of layout?.shapes || []) { const it = item(s, layout, true); if (it) el.append(it); }
        for (const s of slide.shapes || []) { const it = item(s, layout, false); if (it) el.append(it); }
        if ((slide._extras || []).some((x) => x.name === 'p:timing')) { /* animations are not shown */ }
        hardenLinks(el);
        return { width: W, height: H, background: null, element: el };
    });
    if ((P.slides || []).some((s) => s.notes)) omissions.add('slide/notes');
    return slidesView(built, ctx, { title: undefined }, omissions, urls);
}

// ── ODP ──────────────────────────────────────────────────────────────────

/**
 * @param {Uint8Array} bytes
 * @param {import('./index.js').RenderContext} ctx
 */
export async function renderOdp(bytes, ctx) {
    const { odp } = await ctx.engine('odp');
    const d = odp.read(bytes);
    const omissions = createOmissions();
    const urls = createUrlPool();
    const styles = createOdfStyles(d);
    const parts = d.package?.parts || {};
    const listStyles = new Map((d.styles?.listStyles || d.automaticStyles?.listStyles || []).map((l) => [l.name, l]));
    // Automatic list styles of content.xml may sit as raw specs too.
    for (const s of d.automaticStyles?.styles || []) if (s.levels && s.name) listStyles.set(s.name, s);
    const env = { styles, listStyles };

    const masters = new Map((d.styles?.masterPages || []).map((m) => [m.attrs?.['style:name'], m]));
    const layouts = new Map((d.styles?.pageLayouts || []).map((l) => [l.attrs?.['style:name'], l]));
    const firstMaster = (d.styles?.masterPages || [])[0];

    /** Fill / stroke CSS from a graphic property bag. */
    function graphicCss(g) {
        /** @type {Record<string, string>} */
        const css = {};
        if (!g) return css;
        if (g.fill === 'solid' && hexColour(g['fill-color'])) css.backgroundColor = /** @type {string} */ (hexColour(g['fill-color']));
        else if (g.fill === 'gradient') omissions.add('slide/gradient');
        if (g.stroke && g.stroke !== 'none') {
            const w = Math.max(1, lengthPx(g['stroke-width']) || 1);
            css.border = `${w.toFixed(1)}px ${g.stroke === 'dash' ? 'dashed' : 'solid'} ${hexColour(g['stroke-color']) || '#000000'}`;
        }
        return css;
    }

    /** Text frame content (raw ODF text elements). */
    function textFrame(nodes, cls) {
        const el = h('div', { class: 'awv-shape-text' });
        // Presentation defaults (LibreOffice): title 44 pt, other text 32 / 18 pt.
        el.style.fontSize = cls === 'title' ? '44pt' : cls === 'subtitle' || cls === 'outline' ? '32pt' : '18pt';
        el.append(...odfNodes(nodes, env));
        return el;
    }

    /** One draw element (frame, custom shape, rect, ellipse…). */
    function drawItem(node) {
        const attrs = node.attrs || node._extras?.attrs || {};
        const x = lengthPx(node.x ?? attrs['svg:x']) || 0;
        const y = lengthPx(node.y ?? attrs['svg:y']) || 0;
        const w = lengthPx(node.width ?? attrs['svg:width']) || 0;
        const ht = lengthPx(node.height ?? attrs['svg:height']) || 0;
        const styleName = node.styleName || attrs['draw:style-name'] || attrs['presentation:style-name'];
        const gs = styles.resolve(styleName, 'graphic');
        const ps = attrs['presentation:style-name'] ? styles.resolve(attrs['presentation:style-name'], 'presentation') : {};
        const el = box(x, y, w, ht, {});
        applyCss(el, graphicCss({ ...(ps.graphic || {}), ...(gs.graphic || {}) }));
        const cls = node._extras?.attrs?.['presentation:class'] || attrs['presentation:class'] || null;
        if (node.type === 'frame') {
            const c = node.child || {};
            if (c.kind === 'image') {
                const href = String(c.href || '').replace(/^\.\//, '');
                const type = imageType(href);
                const title = (node._extras?.children || []).find((x) => x.name === 'svg:title');
                const alt = title ? (title.children || []).map((t) => t.value || '').join('') : '';
                if (parts[href] && type) {
                    const img = /** @type {HTMLImageElement} */ (h('img', { src: urls.add(parts[href], type), alt }));
                    el.append(img);
                    const clip = parseClip(gs.graphic?.clip);
                    if (clip) { el.style.overflow = 'hidden'; cropOnLoad(el, img, clip); }
                } else {
                    omissions.add(parts[href] ? 'image/format' : 'slide/media');
                    missingBox(el, alt, ctx.t);
                }
            } else if (c.kind === 'text-box') {
                el.append(textFrame(c.children, cls));
            } else if (c.kind === 'table') {
                omissions.add('slide/table');
            } else if (c.kind === 'object' || c.kind === 'chart') {
                omissions.add('slide/chart');
            }
            return el;
        }
        const name = node.name || '';
        if (name === 'draw:custom-shape' || name === 'draw:rect' || name === 'draw:ellipse' || name === 'draw:circle') {
            const geo = (node.children || []).find((c) => c.name === 'draw:enhanced-geometry');
            const kind = geo?.attrs?.['draw:type'] || (name === 'draw:ellipse' || name === 'draw:circle' ? 'ellipse' : 'rectangle');
            if (kind === 'ellipse') el.style.borderRadius = '50%';
            else if (kind === 'round-rectangle') el.style.borderRadius = `${(Math.min(w, ht) * 0.1667).toFixed(1)}px`;
            else if (kind !== 'rectangle') omissions.add('slide/geometry');
            const textNodes = (node.children || []).filter((c) => c.name === 'text:p' || c.name === 'text:list');
            if (textNodes.length) {
                const text = textFrame(textNodes, null);
                text.style.justifyContent = 'center';
                el.append(text);
            }
            return el;
        }
        if (name === 'draw:line') { omissions.add('slide/geometry'); return null; }
        return null;
    }

    const built = (d.slides || []).map((slide) => {
        const master = masters.get(slide.masterPageName) || firstMaster;
        const layout = layouts.get(master?.attrs?.['style:page-layout-name']);
        const lp = layout?.children?.find((c) => c.kind === 'style:page-layout-properties')?.attrs || {};
        const W = pageSide(lengthPx(lp['fo:page-width']), 1058);
        const H = pageSide(lengthPx(lp['fo:page-height']), 595);
        const el = h('div', { class: 'awv-slide', style: { width: `${W}px`, height: `${H}px` } });
        const bgOf = (name) => {
            const dp = name ? styles.resolve(name, 'drawing-page').drawingPage : null;
            return dp && dp.fill === 'solid' ? hexColour(dp['fill-color']) : null;
        };
        el.style.background = bgOf(slide.styleName) || bgOf(master?.attrs?.['draw:style-name']) || '#ffffff';
        const items = [...(slide.frames || []), ...(slide._extras?.children || [])];
        for (const node of items) { const it = drawItem(node); if (it) el.append(it); }
        hardenLinks(el);
        return { width: W, height: H, background: null, element: el };
    });
    return slidesView(built, ctx, { title: d.meta?.title || undefined, author: d.meta?.creator || undefined }, omissions, urls);
}

