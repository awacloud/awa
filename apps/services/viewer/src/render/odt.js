// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ODT → a flow View. `@awacloud/odf`'s `odtLargeBundle` reads
 * the package; `odf-style.js` resolves the style cascade; this module
 * paints paragraphs, headings (demoted under the viewer's outline), spans,
 * links, real `<ol>` / `<ul>` lists with their level indents and labels,
 * tables (column widths, spans, shading, borders), images, and paper sheets
 * cut at `fo:break-before` / `fo:break-after` page breaks.
 *
 * @module viewer/render/odt
 */
import { h } from './dom.js';
import { headingElement, hardenLinks } from './html.js';
import { sheetsElement } from './flow.js';
import { createOmissions, createUrlPool, imageType, lengthPx } from './view.js';
import { cropOnLoad, parseClip } from './odf-style.js';
import { applyCss, cellCss, createOdfStyles, paragraphCss, textCss } from './odf-style.js';

/** ODF `style:num-format` → CSS `list-style-type`. */
const LIST_TYPES = Object.freeze({ 1: 'decimal', a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman' });

/**
 * @param {Uint8Array} bytes
 * @param {import('./index.js').RenderContext} ctx
 * @returns {Promise<import('./view.js').View>}
 */
export async function renderOdt(bytes, ctx) {
    const { odt, frame: frameMod } = await ctx.engine('odt');
    // Frames as runs at their place in the text (`framesInRuns`).
    const d = odt.read(bytes, { framesInRuns: true });
    const omissions = createOmissions();
    const urls = createUrlPool();
    const styles = createOdfStyles(d);
    const face = (n) => styles.face(n);
    const parts = d.package?.parts || {};
    const listStyles = new Map((d.styles?.listStyles || []).map((l) => [l.name, l]));

    /** @type {HTMLElement[][]} */
    const sheets = [[]];
    const out = () => /** @type {HTMLElement[]} */ (sheets[sheets.length - 1]);

    /**
     * An image frame (`draw:frame` raw element) → `<img>` (in a clipping box
     * when its style has `fo:clip`) or a placeholder.
     */
    function frame(node) {
        const attrs = node.attrs || {};
        const w = lengthPx(attrs['svg:width']) || 0;
        const ht = lengthPx(attrs['svg:height']) || 0;
        const img = (node.children || []).find((c) => c.name === 'draw:image');
        const title = (node.children || []).find((c) => c.name === 'svg:title' || c.name === 'svg:desc');
        // The author's title or description; never the automatic name ("Image1").
        const label = title ? (title.children || []).map((c) => c.value || '').join('') : '';
        const href = img?.attrs?.['xlink:href'] || '';
        const data = parts[href.replace(/^\.\//, '')];
        const type = imageType(href);
        const size = { width: `${w.toFixed(1)}px`, height: `${ht.toFixed(1)}px` };
        if (!data || !type) {
            omissions.add(!img ? 'doc/shape' : data ? 'image/format' : 'doc/image-missing');
            return h('span', { class: 'awv-missing', role: 'img', 'aria-label': ctx.t('view.unavailable', { what: label || ctx.t('view.image') }), style: size });
        }
        const pic = /** @type {HTMLImageElement} */ (h('img', { src: urls.add(data, type), alt: label, style: size }));
        const clip = parseClip(styles.resolve(attrs['draw:style-name'], 'graphic').graphic?.clip);
        if (!clip) return pic;
        const box = h('span', { class: 'awv-crop', style: size }, pic);
        cropOnLoad(box, pic, clip);
        return box;
    }

    /**
     * Lay out a frame anchored to its paragraph (or a character, a frame,
     * the page) by its wrapping (`style:wrap`): run-through → over the
     * paragraph at its offset (behind the text when `style:run-through` is
     * background); none → a block of its own; otherwise floated to the side
     * it stands on. Page-relative offsets need pagination: the frame stays
     * at its paragraph.
     * @param {HTMLElement} el
     * @param {any} node
     */
    function place(el, node) {
        const attrs = node.attrs || {};
        const g = styles.resolve(attrs['draw:style-name'], 'graphic').graphic || {};
        const x = lengthPx(attrs['svg:x']) || 0;
        const y = lengthPx(attrs['svg:y']) || 0;
        const wrap = g.wrap || 'none';
        const pos = g['horizontal-pos'] || 'from-left';
        if (wrap === 'run-through') {
            el.classList.add('awv-anchor');
            el.style.left = `${x.toFixed(1)}px`;
            el.style.top = `${y.toFixed(1)}px`;
            if (g['run-through'] === 'background') el.style.zIndex = '-1';
        } else if (wrap === 'none') {
            el.style.display = 'block';
            if (pos === 'center') el.style.margin = '0 auto';
            else if (pos === 'right') el.style.marginLeft = 'auto';
            else el.style.marginLeft = `${Math.max(0, x).toFixed(1)}px`;
        } else {
            const side = pos === 'right' || wrap === 'left' ? 'right' : 'left';
            el.style.float = side;
            el.style.margin = side === 'left' ? `0 0.5em 0.25em ${Math.max(0, pos === 'from-left' ? x : 0).toFixed(1)}px` : '0 0 0.25em 0.5em';
        }
        return el;
    }

    /** A typed frame run → the raw `draw:frame` node `frame()` / `place()` read. */
    const rawFrame = (r) => (r.attrs ? r : frameMod.renderFrame(r));
    /** @param {any} n raw `draw:frame` node */
    const asChar = (n) => n.attrs?.['text:anchor-type'] === 'as-char';

    /**
     * @param {any[]} runs
     * @param {HTMLElement} into
     */
    function inline(runs, into) {
        for (const r of runs || []) {
            switch (r.type) {
                case 'text': into.append(r.value || ''); break;
                case 'span': {
                    const span = h('span', {}, r.value ?? '');
                    const t = styles.resolve(r.styleName, 'text').text;
                    applyCss(span, textCss(t, face));
                    // The reader's semantic flags (a span of the typed model, often with no style name).
                    if (r.bold) span.style.fontWeight = '700';
                    if (r.italic) span.style.fontStyle = 'italic';
                    if (r.strike) span.style.textDecoration = 'line-through';
                    if (r.monospace) span.style.fontFamily = 'ui-monospace, "Cascadia Code", Consolas, monospace';
                    if (r.runs) inline(r.runs, span);
                    into.append(span);
                    break;
                }
                case 'link': {
                    const a = h('a', { href: r.href || null });
                    inline(r.runs, a);
                    into.append(a);
                    break;
                }
                case 'tab': into.append('\t'); break;
                case 'line-break': into.append(h('br')); break;
                case 'space': into.append(' '.repeat(Math.min(1000, Number(r.count) || 1))); break;
                case 'note': omissions.add('doc/footnote'); break;
                case 'frame': {
                    const n = rawFrame(r);
                    into.append(asChar(n) ? frame(n) : place(frame(n), n));
                    break;
                }
                default:
                    if (typeof r.value === 'string') into.append(r.value);
                    else if (r.runs) inline(r.runs, into);
            }
        }
    }

    /**
     * A paragraph or heading.
     * @param {any} node
     * @param {HTMLElement[]} into
     */
    function paragraph(node, into) {
        const st = styles.resolve(node.styleName, 'paragraph');
        const level = node.type === 'heading' ? Number(node.outlineLevel || st.outline?.level || 1) : null;
        const el = level ? headingElement(level, ctx.headingOffset) : h('p');
        el.classList.add('awv-p');
        if (level) el.setAttribute('data-level', String(level));
        applyCss(el, paragraphCss(st.paragraph));
        applyCss(el, textCss(st.text, face));
        const pp = st.paragraph || {};
        // A page break starts a new sheet (top-level paragraphs only).
        const topLevel = into === out();
        if (pp['break-before'] === 'page' && topLevel && out().length) sheets.push([]);
        // Frame runs keep their place in the text: a frame anchored as a
        // character renders where it stands; a paragraph's floating frame
        // goes first (the text wraps round it). Raw extras frames (a
        // reader without frame runs) keep the old fallback: floating first,
        // as-char after the text.
        const floating = (node.runs || []).filter((r) => r.type === 'frame' && !asChar(rawFrame(r)));
        for (const r of floating) { const n = rawFrame(r); el.append(place(frame(n), n)); }
        const frames = (node._extras?.children || []).filter((c) => c.name === 'draw:frame');
        for (const c of frames) if (!asChar(c)) el.append(place(frame(c), c));
        inline((node.runs || []).filter((r) => !floating.includes(r)), el);
        for (const c of frames) if (asChar(c)) el.append(frame(c));
        if (!el.textContent && !el.querySelector('img, .awv-missing')) el.append(h('br'));
        (topLevel ? out() : into).push(el);
        if (pp['break-after'] === 'page' && topLevel) sheets.push([]);
    }

    /**
     * A list, rendered as a real `<ol>` / `<ul>`.
     * @param {any} node
     * @param {HTMLElement[]} into
     * @param {number} depth 1-based level
     * @param {string|null} inherited list style of the enclosing list
     */
    function list(node, into, depth, inherited) {
        const styleName = node.styleName || inherited;
        const ls = styleName ? listStyles.get(styleName) : null;
        const lvl = ls?.levels?.find((l) => Number(l.attrs?.['text:level']) === depth) || null;
        const ordered = lvl ? lvl.type === 'level-number' : !!node.ordered;
        const el = h(ordered ? 'ol' : 'ul', { class: 'awv-list' });
        if (ordered) {
            const fmt = lvl?.attrs?.['style:num-format'] ?? node.numFormat ?? '1';
            el.style.listStyleType = LIST_TYPES[/** @type {keyof typeof LIST_TYPES} */ (fmt)] || 'decimal';
            const start = Number(lvl?.attrs?.['text:start-value'] || 1);
            if (start !== 1) el.setAttribute('start', String(start));
            const suffix = lvl?.attrs?.['style:num-suffix'];
            if (suffix && suffix !== '.') el.dataset.suffix = suffix;
        } else {
            const ch = lvl?.attrs?.['text:bullet-char'] || '•';
            el.style.listStyleType = `"${ch.replace(/["\\]/g, '')}  "`;
        }
        // Level indent: the label-alignment margin, relative to the parent list.
        const align = lvl?._extras?.children?.find((c) => c.name === 'style:list-level-properties')
            ?.children?.find((c) => c.name === 'style:list-level-label-alignment');
        const margin = lengthPx(align?.attrs?.['fo:margin-left']);
        const prevMargin = depth > 1 ? lengthPx(ls?.levels?.find((l) => Number(l.attrs?.['text:level']) === depth - 1)
            ?._extras?.children?.find((c) => c.name === 'style:list-level-properties')
            ?.children?.find((c) => c.name === 'style:list-level-label-alignment')?.attrs?.['fo:margin-left']) || 0 : 0;
        el.style.paddingInlineStart = `${Math.max(16, (margin ?? depth * 24) - prevMargin).toFixed(1)}px`;
        for (const item of node.items || []) {
            const li = h('li');
            /** @type {HTMLElement[]} */
            const content = [];
            for (const child of item.children || []) {
                if (child.type === 'list') list(child, content, depth + 1, styleName);
                else block(child, content);
            }
            li.append(...content);
            el.append(li);
        }
        into.push(el);
    }

    /**
     * @param {any} node
     * @param {HTMLElement[]} into
     */
    function table(node, into) {
        const tbl = h('table', { class: 'awv-table' });
        const ts = styles.resolve(node.styleName, 'table').table || {};
        const width = lengthPx(ts.width);
        if (width) tbl.style.width = `${width.toFixed(0)}px`;
        if (ts.align === 'center') tbl.style.margin = '0 auto';
        else if (ts.align === 'right') tbl.style.marginLeft = 'auto';
        const colgroup = h('colgroup');
        for (const col of node.columns || []) {
            const cw = lengthPx(styles.resolve(col.styleName, 'table-column').tableColumn?.['column-width']);
            for (let i = 0; i < Number(col.repeated || 1) && i < 1024; i++) colgroup.append(h('col', { style: { width: cw ? `${cw.toFixed(0)}px` : null } }));
        }
        tbl.append(colgroup);
        const tbody = h('tbody');
        for (const row of node.rows || []) {
            const tr = h('tr');
            for (const cell of row.cells || []) {
                if (cell.covered) continue;
                const td = h('td', {
                    colspan: Number(cell.colSpan) > 1 ? Number(cell.colSpan) : null,
                    rowspan: Number(cell.rowSpan) > 1 ? Number(cell.rowSpan) : null
                });
                const cs = styles.resolve(cell.styleName, 'table-cell');
                applyCss(td, cellCss(cs.tableCell));
                applyCss(td, textCss(cs.text, face));
                /** @type {HTMLElement[]} */
                const content = [];
                for (const child of cell.children || []) block(child, content);
                td.append(...content);
                tr.append(td);
            }
            tbody.append(tr);
        }
        tbl.append(tbody);
        into.push(tbl);
    }

    /**
     * @param {any} node
     * @param {HTMLElement[]} into
     */
    function block(node, into) {
        if (!node) return;
        switch (node.type) {
            case 'paragraph': case 'heading': paragraph(node, into); break;
            case 'list': list(node, into, 1, null); break;
            case 'table': table(node, into); break;
            case 'section': for (const c of node.children || node.body || []) block(c, into); break;
            default:
                if (Array.isArray(node.children)) for (const c of node.children) block(c, into);
        }
    }

    for (const node of d.body || []) block(node, out());
    if (!out().length && sheets.length > 1) sheets.pop();

    // Page geometry: the first master page's layout.
    const master = (d.styles?.masterPages || [])[0];
    const layoutName = master?.attrs?.['style:page-layout-name'];
    const layout = (d.styles?.pageLayouts || []).find((l) => l.attrs?.['style:name'] === layoutName);
    const lp = layout?.children?.find((c) => c.kind === 'style:page-layout-properties')?.attrs || {};
    const pw = lengthPx(lp['fo:page-width']) || 794;
    const ph = lengthPx(lp['fo:page-height']) || 1123;
    const padding = {
        top: lengthPx(lp['fo:margin-top']) ?? 76, right: lengthPx(lp['fo:margin-right']) ?? 76,
        bottom: lengthPx(lp['fo:margin-bottom']) ?? 76, left: lengthPx(lp['fo:margin-left']) ?? 76
    };
    if ((master?.children || []).some((c) => c.kind === 'style:header' || c.kind === 'style:footer')) omissions.add('doc/header-footer');
    const defaults = styles.resolve(null, 'paragraph');
    const element = sheetsElement({ width: pw, minHeight: ph, padding }, sheets, {
        lang: defaults.text?.language ? `${defaults.text.language}${defaults.text.country ? '-' + defaults.text.country : ''}` : null
    });
    // The document's default font sits on each sheet.
    for (const sheet of element.querySelectorAll('.awv-doc')) applyCss(/** @type {HTMLElement} */ (sheet), textCss(defaults.text, face));
    hardenLinks(element);

    return {
        kind: 'flow',
        title: d.meta?.title || ctx.name,
        meta: { title: d.meta?.title || undefined, author: d.meta?.creator || d.meta?.initialCreator || undefined },
        width: pw,
        element,
        omissions: omissions.list(),
        dispose() { urls.dispose(); }
    };
}
