// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview DOCX → a flow View. `@awacloud/ooxml`'s `docxLargeBundle`
 * reads the package into a typed model; this module paints it as DOM:
 * the style cascade (document defaults → `basedOn` chain → direct
 * formatting, from `docx-style.js`), list numbering with real counters,
 * tables (widths, merged cells, borders, shading), images, hyperlinks, the
 * default header and footer, footnotes at the end, and paper sheets cut at
 * explicit page breaks.
 *
 * Text goes in with `textContent` only. Paragraphs whose style has an
 * outline level become real headings (demoted under the viewer's outline).
 *
 * @module oview/render/docx
 */
import { h } from './dom.js';
import { headingElement, hardenLinks } from './html.js';
import { bulletChar, formatCounter, sheetsElement } from './flow.js';
import { applyCrop, createOmissions, createUrlPool, imageType, PX, typedCrop } from './view.js';
import { attr, borderCss, bordersOf, createStyles, extra, merge, paragraphStyle, runStyle, shadingOf, twips } from './docx-style.js';

/** @typedef {Record<string, any>} Props */

/** Text of a raw child element (`wp:posOffset`, `wp:align`), or null. */
function childText(node, tag) {
    const c = (node?.children || []).find((x) => x && x.name === tag);
    return c ? (c.children || []).map((t) => t.value ?? '').join('').trim() : null;
}

/**
 * Lay out a floating (anchored) drawing (ECMA-376 §20.4.2.3) in the flowing
 * page: no wrapping → placed over its paragraph at its offset (behind the
 * text when `behindDoc`); square / tight / through → floated to the side it
 * stands on, text flowing round it; top and bottom → a block of its own.
 * A vertical offset from the page or the margin has no meaning without
 * pagination: such a drawing stays at its paragraph.
 * @param {HTMLElement} el
 * @param {any} node the drawing
 * @param {number} w drawing width (CSS px)
 * @param {{width: number, left: number}} text the text area: width, and its left edge on the page
 */
function placeAnchor(el, node, w, text) {
    const kids = node.anchorChildren || [];
    const ph = kids.find((k) => k?.name === 'wp:positionH');
    const pv = kids.find((k) => k?.name === 'wp:positionV');
    const wrap = kids.find((k) => /^wp:wrap/.test(k?.name || ''))?.name || 'wp:wrapNone';
    const align = childText(ph, 'wp:align');
    let left = Number(childText(ph, 'wp:posOffset')) * PX.emu;
    if (!Number.isFinite(left)) left = 0;
    if (/^(page|leftMargin|insideMargin)$/.test(ph?.attrs?.relativeFrom || '')) left -= text.left;
    if (align === 'center') left = (text.width - w) / 2;
    else if (align === 'right' || align === 'outside') left = text.width - w;
    else if (align) left = 0;
    const top = /^(paragraph|line)$/.test(pv?.attrs?.relativeFrom || '') ? Number(childText(pv, 'wp:posOffset')) * PX.emu || 0 : 0;
    const dist = (k) => `${((Number(node[k]) || 0) * PX.emu).toFixed(1)}px`;
    if (wrap === 'wp:wrapNone') {
        el.classList.add('awv-anchor');
        el.style.left = `${left.toFixed(1)}px`;
        el.style.top = `${top.toFixed(1)}px`;
        if (node.anchorAttrs?.behindDoc === '1') el.style.zIndex = '-1';
    } else if (wrap === 'wp:wrapTopAndBottom') {
        el.style.display = 'block';
        el.style.marginLeft = `${Math.max(0, left).toFixed(1)}px`;
        el.style.marginTop = dist('distT');
        el.style.marginBottom = dist('distB');
    } else {
        const side = left + w / 2 < text.width / 2 ? 'left' : 'right';
        el.style.float = side;
        el.style.margin = `${dist('distT')} ${dist('distR')} ${dist('distB')} ${dist('distL')}`;
        el.style.setProperty(side === 'left' ? 'margin-left' : 'margin-right', `${Math.max(0, side === 'left' ? left : text.width - left - w).toFixed(1)}px`);
    }
}

/**
 * @param {Uint8Array} bytes
 * @param {import('./index.js').RenderContext} ctx
 * @returns {Promise<import('./view.js').View>}
 */
export async function renderDocx(bytes, ctx) {
    const { docx } = await ctx.engine('docx');
    const d = docx.read(bytes);
    const omissions = createOmissions();
    const urls = createUrlPool();
    const styles = createStyles(d.styles);
    const offset = ctx.headingOffset;

    // Page geometry from the final section.
    const sect = d.document.sectPr || {};
    const pw = twips(sect.pageSize?.w) || 816;
    const ph = twips(sect.pageSize?.h) || 1056;
    const m = sect.pageMargin || {};
    const padding = {
        top: twips(m.top) ?? 96, right: twips(m.right) ?? 96, bottom: twips(m.bottom) ?? 96, left: twips(m.left) ?? 96
    };
    const textArea = { width: Math.max(0, pw - padding.left - padding.right), left: padding.left };

    // ── numbering ────────────────────────────────────────────────────────
    const nums = new Map((d.numbering?.nums || []).map((n) => [Number(n.numId), n]));
    const abstracts = new Map((d.numbering?.abstractNums || []).map((a) => [Number(a.abstractNumId), a]));
    /** counters per abstract list: level → value */
    const counters = new Map();
    function levelOf(numId, ilvl) {
        const num = nums.get(Number(numId));
        const abs = num ? abstracts.get(Number(num.abstractNumId)) : null;
        const lvl = (abs?.levels || abs?.lvls || []).find((l) => Number(l.ilvl) === Number(ilvl)) || null;
        return { num, abs, lvl };
    }
    /** The marker text of a numbered paragraph, advancing its counters. */
    function marker(numPr) {
        if (!numPr || numPr.numId === undefined || Number(numPr.numId) === 0) return null;
        const ilvl = Number(numPr.ilvl || 0);
        const { num, abs, lvl } = levelOf(numPr.numId, ilvl);
        if (!abs || !lvl) return null;
        const key = abs.abstractNumId;
        let c = counters.get(key);
        if (!c) { c = []; counters.set(key, c); }
        const startOf = (i) => {
            const override = (num?.lvlOverrides || []).find((o) => Number(o.ilvl) === i);
            const l = levelOf(numPr.numId, i).lvl;
            return Number(override?.startOverride ?? l?.start ?? 1);
        };
        c[ilvl] = c[ilvl] === undefined ? startOf(ilvl) : c[ilvl] + 1;
        c.length = ilvl + 1;   // deeper levels restart
        if (lvl.numFmt === 'bullet') return { text: bulletChar(lvl.lvlText), lvl };
        const text = String(lvl.lvlText ?? `%${ilvl + 1}.`).replace(/%(\d)/g, (_, k) => {
            const i = Number(k) - 1;
            const value = c[i] ?? startOf(i);
            const fmt = i === ilvl ? lvl.numFmt : levelOf(numPr.numId, i).lvl?.numFmt;
            return formatCounter(value, fmt || 'decimal');
        });
        return { text, lvl };
    }

    // ── inline content ───────────────────────────────────────────────────
    /** Paint a drawing (picture) run. */
    function drawing(node) {
        const data = node.image?.data || (node.embedRef ? d.images?.[node.embedRef]?.data : null);
        const partName = d.images?.[node.embedRef]?.partName || '';
        const type = node.image?.contentType || d.images?.[node.embedRef]?.contentType || imageType(partName);
        const w = Number(node.cx) * PX.emu;
        const ht = Number(node.cy) * PX.emu;
        // The author's description or title; never the automatic name ("Picture 3").
        const label = node.description || node.title || '';
        /** @type {HTMLElement} */
        let el;
        if (!data || !type || !/^image\/(png|jpeg|gif|bmp|webp|svg\+xml)$/.test(type)) {
            omissions.add(data ? 'image/format' : 'doc/image-missing');
            el = h('span', {
                class: 'awv-missing', role: 'img', 'aria-label': ctx.t('view.unavailable', { what: label || ctx.t('view.image') }),
                style: { width: `${w.toFixed(0)}px`, height: `${ht.toFixed(0)}px` }
            });
        } else {
            const size = { width: `${w.toFixed(1)}px`, height: `${ht.toFixed(1)}px` };
            const img = /** @type {HTMLImageElement} */ (h('img', { src: urls.add(data, type), alt: label, style: size }));
            // The typed crop of the drawing, whatever part holds it.
            const crop = typedCrop(node.srcRect);
            el = img;
            if (crop) {
                el = h('span', { class: 'awv-crop', style: size }, img);
                applyCrop(el, img, crop);
            }
        }
        if (node.mode === 'anchor') placeAnchor(el, node, w, textArea);
        return el;
    }

    /**
     * @param {any[]} children paragraph children
     * @param {Props} baseR the paragraph's run base
     * @param {HTMLElement} into
     */
    function inline(children, baseR, into) {
        for (const child of children || []) {
            if (!child) continue;
            switch (child.type) {
                case 'run': {
                    const r = styles.run(baseR, child.rPr);
                    const span = h('span', { style: runStyle(r) });
                    if (r.lang?.val) span.lang = r.lang.val;
                    for (const c of child.children || []) {
                        if (c.type === 'text') span.append(c.value);
                        else if (c.type === 'tab') span.append('\t');
                        else if (c.type === 'break' && c.kind !== 'page' && c.kind !== 'column') span.append(h('br'));
                        else if (c.type === 'drawing') span.append(drawing(c));
                        else if (c.type === 'noBreakHyphen') span.append('\u2011');
                        else if (c.type === 'softHyphen') span.append('\u00ad');
                        else if (c.type === 'footnoteReference' || c.type === 'endnoteReference') {
                            span.append(noteRef(c.type === 'footnoteReference' ? 'fn' : 'en', c.id));
                        } else if (c.type === 'commentReference') omissions.add('doc/comment');
                        else if (c.type === 'sym') span.append(bulletChar(String.fromCharCode(parseInt(c.char || c.value || '0', 16) || 0x2022)));
                    }
                    into.append(span);
                    break;
                }
                case 'hyperlink': {
                    const target = child.target || (child.rId ? d.hyperlinks?.[child.rId]?.target : null);
                    const a = h('a', { href: target || (child.anchor ? `#${ctx.id}-bm-${child.anchor}` : null) });
                    inline(child.children, baseR, a);
                    into.append(a);
                    break;
                }
                case 'sdt': case 'fldSimple': case 'smartTag': case 'ins': case 'moveTo':
                    inline(child.children, baseR, into);
                    break;
                case 'moveFrom':
                    // The accepted view: a move source is not painted (its
                    // runs carry w:t, so the moved text would show twice).
                    break;
                case 'bookmarkStart':
                    if (child.name) into.append(h('span', { id: `${ctx.id}-bm-${child.name}` }));
                    break;
                case 'oMath': case 'oMathPara':
                    omissions.add('doc/math');
                    break;
                default:
                    if (Array.isArray(child.children)) inline(child.children, baseR, into);
            }
        }
    }

    // Footnotes / endnotes: referenced in order, painted after the body.
    /** @type {{kind: string, id: number, n: number}[]} */
    const notesUsed = [];
    function noteRef(kind, id) {
        const n = notesUsed.filter((x) => x.kind === kind).length + 1;
        notesUsed.push({ kind, id: Number(id), n });
        return h('sup', { class: 'awv-noteref' }, h('a', { href: `#${ctx.id}-${kind}-${id}`, id: `${ctx.id}-${kind}ref-${id}` }, kind === 'fn' ? String(n) : formatCounter(n, 'i')));
    }

    // ── blocks ───────────────────────────────────────────────────────────
    /** @type {HTMLElement[][]} */
    const sheets = [[]];
    const out = () => /** @type {HTMLElement[]} */ (sheets[sheets.length - 1]);
    const breakSheet = () => { if (out().length) sheets.push([]); };

    /**
     * @param {any} para
     * @param {HTMLElement[]} into
     */
    function paragraph(para, into, cell = null) {
        // The numbering (direct or from the style) first: its level's
        // indentation enters the cascade under the direct formatting.
        const first = styles.paragraph(para.pPr, undefined, cell);
        const mark = marker(first.p.numPr);
        const { p, r, headingLevel, title, styleId } = mark ? styles.paragraph(para.pPr, mark.lvl.pPr, cell) : first;
        const style = paragraphStyle(p);
        // Contextual spacing: no space between paragraphs of the same style.
        const prevEl = into[into.length - 1];
        if (p.contextualSpacing && prevEl && prevEl.dataset.style === String(styleId)) {
            style.marginTop = '0px';
            prevEl.style.marginBottom = '0px';
        } else if (prevEl?.dataset.after) {
            // Word adds the space after a paragraph to the space before the
            // next; CSS would keep the larger of the two margins only.
            style.marginTop = `${(parseFloat(style.marginTop) + Number(prevEl.dataset.after)).toFixed(1)}px`;
            prevEl.style.marginBottom = '0px';
        }
        const level = headingLevel || (title ? 1 : null);
        const el = level ? headingElement(level, offset) : h('p');
        el.classList.add('awv-p');
        for (const [k, v] of Object.entries(style)) el.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
        const baseStyle = runStyle(r);
        for (const [k, v] of Object.entries(baseStyle)) el.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
        if (level) el.setAttribute('data-level', String(level));
        if (title) el.setAttribute('data-title', '');
        el.dataset.style = String(styleId);

        if (mark) {
            const mr = merge(r, mark.lvl.rPr);
            const markStyle = runStyle(mr);
            if (mark.lvl.rPr?.font && /symbol|wingdings/i.test(String(mark.lvl.rPr.font))) delete markStyle.fontFamily;
            // The marker fills the hanging indent, so the text starts at the
            // paragraph's indent as in Word (no hanging: a space follows it).
            const hanging = twips(p.indent?.hanging);
            if (hanging) markStyle.minWidth = `${hanging.toFixed(1)}px`;
            // (Node.append would write a null as the text "null".)
            el.append(h('span', { class: 'awv-marker', style: markStyle }, mark.text));
            if (!hanging) el.append(' ');
        }
        // A page break inside a paragraph splits the sheet after it.
        let pageBreakAfter = false;
        const flat = [];
        for (const c of para.children || []) {
            if (c.type === 'run' && (c.children || []).some((x) => x.type === 'break' && x.kind === 'page')) pageBreakAfter = true;
            flat.push(c);
        }
        inline(flat, r, el);
        if (!el.textContent && !el.querySelector('img, .awv-missing')) el.append(h('br'));
        if (p.pageBreakBefore) breakSheet();
        el.dataset.after = String(parseFloat(style.marginBottom) || 0);
        into.push(el);
        if (pageBreakAfter && into === out()) sheets.push([]);
        // A paragraph carrying a section break ends the sheet.
        if (para.pPr?.sectPr && into === out()) sheets.push([]);
    }

    /**
     * @param {any} table
     * @param {HTMLElement[]} into
     */
    function tableEl(table, into) {
        const tp = styles.table(table.tblPr);
        const ts = styles.tableStyle(table.tblPr?.style || table.tblPr?.tblStyle);
        // Which conditional formats apply (w:tblLook: attributes, or the
        // legacy hex mask of ECMA-376 2006).
        const look = table.tblPr?.tblLook || attr(extra(table.tblPr, 'w:tblLook'), 'w:val') || {};
        const mask = parseInt(typeof look === 'string' ? look : look['w:val'] || look.val || '0', 16) || 0;
        const flag = (k, bit) => {
            const v = typeof look === 'object' ? (look[`w:${k}`] ?? look[k]) : undefined;
            return v === undefined ? (mask & bit) !== 0 : /^(1|true|on)$/.test(String(v));
        };
        const lk = {
            firstRow: flag('firstRow', 0x20), lastRow: flag('lastRow', 0x40), firstColumn: flag('firstColumn', 0x80),
            lastColumn: flag('lastColumn', 0x100), hBand: !flag('noHBand', 0x200), vBand: !flag('noVBand', 0x400)
        };
        const tbl = h('table', { class: 'awv-table' });
        const bdr = bordersOf(tp, 'borders', 'w:tblBorders') || (/grid/i.test(tp.style || tp.tblStyle || '') ? { top: { val: 'single' }, left: { val: 'single' }, bottom: { val: 'single' }, right: { val: 'single' }, insideH: { val: 'single' }, insideV: { val: 'single' } } : null);
        const jc = tp.jc || tp.align;
        if (jc === 'center') tbl.style.margin = '0 auto';
        else if (jc === 'right' || jc === 'end') tbl.style.marginLeft = 'auto';
        const tw = tp.width;
        if (tw && (tw.type === 'dxa') && Number(tw.w) > 0) tbl.style.width = `${(Number(tw.w) * PX.twip).toFixed(0)}px`;
        else if (tw && tw.type === 'pct' && Number(String(tw.w).replace('%', '')) > 0) {
            const v = String(tw.w);
            tbl.style.width = v.endsWith('%') ? v : `${Number(v) / 50}%`;
        }
        const margins = tp.cellMargins || {};
        const padL = twips(margins.left?.w ?? margins.start?.w) ?? 108 * PX.twip;
        const padR = twips(margins.right?.w ?? margins.end?.w) ?? 108 * PX.twip;
        const rows = table.rows || [];
        // Vertical merges: a `restart` cell spans the following `continue` cells.
        const grid = rows.map((row) => {
            let col = 0;
            return (row.cells || []).map((cell) => {
                const span = Number(cell.tcPr?.gridSpan ?? attr(extra(cell.tcPr, 'w:gridSpan'), 'w:val') ?? 1) || 1;
                const vm = cell.tcPr?.vMerge ?? (extra(cell.tcPr, 'w:vMerge') ? (attr(extra(cell.tcPr, 'w:vMerge'), 'w:val') || 'continue') : null);
                const item = { cell, col, span, vMerge: vm === true ? 'continue' : vm };
                col += span;
                return item;
            });
        });
        const gridWidth = Math.max(0, ...grid.map((r) => r.reduce((n, x) => n + x.span, 0)));
        const tbody = h('tbody');
        grid.forEach((row, ri) => {
            const tr = h('tr');
            const rowSrc = rows[ri];
            const height = twips(rowSrc.trPr?.height?.val ?? rowSrc.trPr?.height?.['w:val'] ?? rowSrc.trPr?.trHeight);
            if (height) tr.style.height = `${height.toFixed(0)}px`;
            const header = rowSrc.trPr?.tblHeader === true || !!extra(rowSrc.trPr, 'w:tblHeader');
            for (const item of row) {
                if (item.vMerge === 'continue') continue;
                let rowspan = 1;
                if (item.vMerge === 'restart') {
                    for (let k = ri + 1; k < grid.length; k++) {
                        const below = grid[k].find((x) => x.col === item.col);
                        if (below && below.vMerge === 'continue') rowspan++; else break;
                    }
                }
                const td = h(header ? 'th' : 'td', { colspan: item.span > 1 ? item.span : null, rowspan: rowspan > 1 ? rowspan : null });
                const tcPr = item.cell.tcPr || {};
                // The conditional formats of this cell, weakest first (Word's order).
                const first = lk.firstRow && ri === 0;
                const last = lk.lastRow && ri === grid.length - 1;
                const firstCol = lk.firstColumn && item.col === 0;
                const lastCol = lk.lastColumn && item.col + item.span >= gridWidth;
                const bodyRow = ri - (lk.firstRow ? 1 : 0);
                const bodyCol = item.col - (lk.firstColumn ? 1 : 0);
                const types = [
                    lk.vBand && !firstCol && !lastCol && bodyCol >= 0 ? (Math.floor(bodyCol / ts.colBand) % 2 ? 'band2Vert' : 'band1Vert') : null,
                    lk.hBand && !first && !last && bodyRow >= 0 ? (Math.floor(bodyRow / ts.rowBand) % 2 ? 'band2Horz' : 'band1Horz') : null,
                    firstCol ? 'firstCol' : null, lastCol ? 'lastCol' : null,
                    first ? 'firstRow' : null, last ? 'lastRow' : null,
                    first && firstCol ? 'nwCell' : null, first && lastCol ? 'neCell' : null,
                    last && firstCol ? 'swCell' : null, last && lastCol ? 'seCell' : null
                ].filter((t) => t && ts.cond[t]).map((t) => ts.cond[/** @type {string} */ (t)]);
                const condShd = types.map((c) => c.shd).filter(Boolean).pop() || null;
                const condBorders = Object.assign({}, ...types.map((c) => c.borders || {}));
                const cellStyle = { pPr: ts.pPr, rPr: merge(ts.rPr, ...types.map((c) => c.rPr)) };
                const w = tcPr.width;
                if (w && w.type === 'dxa' && Number(w.w) > 0) td.style.width = `${(Number(w.w) * PX.twip).toFixed(0)}px`;
                td.style.padding = `0 ${padR.toFixed(1)}px 0 ${padL.toFixed(1)}px`;
                const shade = shadingOf(tcPr) || condShd;
                if (shade) td.style.backgroundColor = shade;
                const va = tcPr.vAlign ?? attr(extra(tcPr, 'w:vAlign'), 'w:val');
                if (va) td.style.verticalAlign = va === 'center' ? 'middle' : va;
                // Borders: the cell's own, else the table's (outer / inside).
                const cb = { ...condBorders, ...(bordersOf(tcPr, 'borders', 'w:tcBorders') || {}) };
                const isTop = ri === 0; const isBottom = ri + rowspan >= grid.length;
                const isLeft = item.col === 0; const isRight = item.col + item.span >= gridWidth;
                const pick = (side, outer, inner) => borderCss(cb[side] || (bdr ? (outer ? bdr[side] : bdr[inner]) : null));
                const sides = {
                    borderTop: pick('top', isTop, 'insideH'), borderBottom: pick('bottom', isBottom, 'insideH'),
                    borderLeft: pick('left', isLeft, 'insideV') || pick('start', isLeft, 'insideV'),
                    borderRight: pick('right', isRight, 'insideV') || pick('end', isRight, 'insideV')
                };
                for (const [k, v] of Object.entries(sides)) if (v) td.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
                /** @type {HTMLElement[]} */
                const content = [];
                blocks(item.cell.children || [], content, cellStyle);
                td.append(...content);
                tr.append(td);
            }
            tbody.append(tr);
        });
        tbl.append(tbody);
        into.push(tbl);
    }

    /**
     * @param {any[]} list
     * @param {HTMLElement[]} into
     */
    function blocks(list, into, cell = null) {
        for (const b of list || []) {
            if (!b) continue;
            if (b.type === 'paragraph') paragraph(b, into, cell);
            else if (b.type === 'table') tableEl(b, into);
            else if (b.type === 'blockSdt' || b.type === 'sdt') blocks(b.children, into, cell);
            else if (b.type === 'oMathPara') omissions.add('doc/math');
        }
    }

    blocks(d.document.body, out());
    if (!out().length && sheets.length > 1) sheets.pop();

    // Notes, in order of first reference, after the body.
    if (notesUsed.length) {
        const list = h('ol', { class: 'awv-notes' });
        for (const ref of notesUsed) {
            const src = ref.kind === 'fn' ? d.footnotes : d.endnotes;
            const note = (src?.notes || []).find((n) => Number(n.id) === ref.id);
            if (!note) continue;
            /** @type {HTMLElement[]} */
            const content = [];
            blocks(note.body, content);
            const back = h('a', { href: `#${ctx.id}-${ref.kind}ref-${ref.id}`, class: 'awv-noteback', 'aria-label': ctx.t('view.noteBack') }, '↩');
            list.append(h('li', { id: `${ctx.id}-${ref.kind}-${ref.id}`, value: ref.n }, [...content, back]));
        }
        out().push(h('hr', { class: 'awv-notes-rule' }), list);
    }

    const partFor = (refs, parts) => {
        const ref = (refs || []).find((x) => x.type === 'default') || (refs || [])[0];
        const part = ref ? parts?.[ref.rId || ref.id] : null;
        return part ? () => {
            /** @type {HTMLElement[]} */
            const content = [];
            blocks(part.body, content);
            return h('div', {}, content);
        } : null;
    };
    const header = partFor(sect.headerReferences, d.headers);
    const footer = partFor(sect.footerReferences, d.footers);
    // The header and footer distances from the paper edges (w:pgMar w:header / w:footer).
    const element = sheetsElement({ width: pw, minHeight: ph, padding, headerTop: twips(m.header), footerBottom: twips(m.footer) }, sheets, {
        header: header || undefined,
        footer: footer || undefined,
        lang: d.styles?.docDefaults?.rPr?.lang?.val || null
    });
    hardenLinks(element);

    const props = d.coreProperties || d.properties || {};
    return {
        kind: 'flow',
        title: props.title || ctx.name,
        meta: { title: props.title || undefined, author: props.creator || undefined },
        width: pw,
        element,
        omissions: omissions.list(),
        dispose() { urls.dispose(); }
    };
}
