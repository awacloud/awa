// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF → a paged View. `@awacloud/pdf` reads the file (xref,
 * objects, page tree, resources, content-stream parsing, filters); this
 * module sizes each page (inherited `/MediaBox` / `/CropBox` / `/Rotate` /
 * `/UserUnit`), and draws it on demand: the content stream through
 * `paint.js`, then the annotations' normal appearances, then two DOM
 * layers over the canvas — the text layer (selectable, read by screen
 * readers; the canvas is `aria-hidden`) and the web links.
 *
 * @module viewer/render/pdf
 */
import { h } from '../dom.js';
import { createOmissions, MAX_PAGE_PX, PX } from '../view.js';
import { annotationHidden, hiddenGroups, paintOps } from './paint.js';
import { openPdf } from './decrypt.js';
import { createImageCache } from './image.js';
import { arr, deref, entries, get, IDENTITY, name, num, nums, text } from './objects.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */

/** Largest canvas drawn, in device pixels (browsers cap near 16–64 Mpx). */
const MAX_CANVAS_PIXELS = 16_777_216;
/**
 * Pages whose parsed operators are kept: a zoom redraws the pages in view
 * without parsing their content again (the parse is the slow, unsliced part).
 */
const OPS_CACHE_PAGES = 6;

/**
 * Walk a page and its `/Parent` chain for an inheritable attribute.
 * @param {PdfObj} pageRaw
 * @param {string} key
 * @param {import('./objects.js').Resolve} resolve
 * @returns {PdfObj|null}
 */
function inherited(pageRaw, key, resolve) {
    let node = pageRaw;
    for (let i = 0; node && i < 64; i++) {
        const v = get(node, key, resolve);
        if (v) return v;
        node = get(node, 'Parent', resolve);
    }
    return null;
}

/**
 * Normalise a rectangle `[x0 y0 x1 y1]` (any corner order).
 * @param {number[]|null} r
 * @returns {number[]|null}
 */
function rect(r) {
    if (!r || r.length < 4) return null;
    const [a, b, c, d] = r;
    const x0 = Math.min(a, c); const x1 = Math.max(a, c);
    const y0 = Math.min(b, d); const y1 = Math.max(b, d);
    return x1 - x0 > 0 && y1 - y0 > 0 ? [x0, y0, x1, y1] : null;
}

/**
 * The visible box, rotation and unit of a page.
 * @param {PdfObj} pageRaw
 * @param {import('./objects.js').Resolve} resolve
 */
export function pageGeometry(pageRaw, resolve) {
    const media = rect(nums(inherited(pageRaw, 'MediaBox', resolve), resolve)) || [0, 0, 612, 792];
    const cropRaw = rect(nums(inherited(pageRaw, 'CropBox', resolve), resolve));
    // The crop box is clipped to the media box (§14.11.2).
    const box = cropRaw
        ? [Math.max(media[0], cropRaw[0]), Math.max(media[1], cropRaw[1]), Math.min(media[2], cropRaw[2]), Math.min(media[3], cropRaw[3])]
        : media;
    const valid = box[2] > box[0] && box[3] > box[1] ? box : media;
    // A multiple of 90 (§7.7.3.3); any other value is ignored, as readers do.
    const r = num(inherited(pageRaw, 'Rotate', resolve)) || 0;
    const rotate = r % 90 === 0 ? ((r % 360) + 360) % 360 : 0;
    const declared = num(get(pageRaw, 'UserUnit', resolve)) || 1;
    // An absurd page (a 1e9-unit box, a huge /UserUnit) is scaled down whole.
    const side = Math.max(valid[2] - valid[0], valid[3] - valid[1]) * (declared > 0 ? declared : 1) * PX.pt;
    const unit = (declared > 0 ? declared : 1) * Math.min(1, MAX_PAGE_PX / side);
    const w = (valid[2] - valid[0]) * unit * PX.pt;
    const hgt = (valid[3] - valid[1]) * unit * PX.pt;
    const turned = rotate === 90 || rotate === 270;
    return { box: valid, rotate, unit, width: turned ? hgt : w, height: turned ? w : hgt };
}

/**
 * Default user space → device pixels for a page at scale `s` (device px
 * per PDF unit), honouring `/Rotate` (clockwise, §7.7.3.3).
 * @param {number[]} box
 * @param {number} rotate
 * @param {number} s
 */
export function baseMatrix(box, rotate, s) {
    const [x0, y0, x1, y1] = box;
    switch (rotate) {
        case 90: return [0, s, s, 0, -y0 * s, -x0 * s];
        case 180: return [-s, 0, 0, s, x1 * s, -y0 * s];
        case 270: return [0, -s, -s, 0, y1 * s, x1 * s];
        default: return [s, 0, 0, -s, -x0 * s, y1 * s];
    }
}

/**
 * A text measurer for the text layer: a 2D context's `measureText`, or —
 * where no canvas exists — half an em per character.
 * @returns {(text: string, size: number) => number}
 */
function createMeasurer() {
    let g = null;
    try {
        const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
        g = /** @type {CanvasRenderingContext2D|null} */ (c.getContext('2d'));
    } catch { g = null; }
    return (text, size) => {
        if (!g) return text.length * size * 0.5;
        g.font = `${size}px sans-serif`;
        return g.measureText(text).width;
    };
}

/**
 * Build the text layer: one transparent, absolutely placed span per LINE
 * SEGMENT — consecutive runs on the same baseline, close together, merged
 * (many PDFs show one glyph per operator) — stretched to the segment's PDF
 * width, in content-stream order, with a line break between segments on
 * different lines so assistive technology reads words and lines.
 * @param {import('./paint.js').TextRun[]} runs device-pixel runs
 * @param {number} dpr
 * @param {(text: string, size: number) => number} measure
 */
function textLayer(runs, dpr, measure) {
    /** @type {{x: number, y: number, size: number, angle: number, end: number, text: string}[]} */
    const segments = [];
    for (const run of runs) {
        const size = run.size / dpr;
        if (size < 1 || !run.text) continue;
        const x = run.m[4] / dpr;
        const y = run.m[5] / dpr;
        const angle = Math.atan2(run.m[1], run.m[0]);
        const end = x + run.width / dpr;
        const last = segments[segments.length - 1];
        const joins = last && !angle && !last.angle
            && Math.abs(last.y - y) < size * 0.2 && Math.abs(last.size - size) < size * 0.2
            && x >= last.end - size * 0.3 && x - last.end < size * 1.5;
        if (joins) {
            const gap = x - last.end > size * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(run.text);
            last.text += (gap ? ' ' : '') + run.text;
            last.end = Math.max(last.end, end);
        } else {
            segments.push({ x, y, size, angle, end, text: run.text });
        }
    }
    const layer = h('div', { class: 'awv-textlayer' });
    let prev = null;
    for (const seg of segments) {
        if (!seg.text.trim()) continue;
        if (prev) layer.append(Math.abs(prev.y - seg.y) < seg.size * 0.5 ? ' ' : '\n');
        const natural = measure(seg.text, seg.size);
        const width = seg.end - seg.x;
        const sx = natural > 0 && width > 0 ? width / natural : 1;
        const transform = `${seg.angle ? `rotate(${seg.angle}rad) ` : ''}scaleX(${sx.toFixed(4)})`;
        layer.append(h('span', {
            style: { left: `${seg.x.toFixed(2)}px`, top: `${(seg.y - seg.size * 0.86).toFixed(2)}px`, fontSize: `${seg.size.toFixed(2)}px`, transform }
        }, seg.text));
        prev = seg;
    }
    return layer;
}

/**
 * @param {Uint8Array} bytes
 * @param {import('../index.js').RenderContext} ctx
 * @returns {Promise<import('../view.js').View>}
 */
export async function renderPdf(bytes, ctx) {
    const eng = await ctx.engine('pdf');
    const { doc, resolve } = openPdf(bytes, eng);
    const omissions = createOmissions();
    const docEnv = {
        resolve,
        eng,
        fonts: new Map(),
        images: createImageCache(),
        hiddenOcgs: hiddenGroups(doc.catalog?.raw || null, resolve),
        omit: (code) => omissions.add(code)
    };
    const info = get(doc.trailer?.raw || null, 'Info', resolve);
    const meta = {
        title: text(get(info, 'Title', resolve))?.trim() || undefined,
        author: text(get(info, 'Author', resolve))?.trim() || undefined
    };
    // Omissions are counted once per page, not once per redraw.
    const counted = new Set();
    /** @type {Map<number, any[]>} page index → operators, least recent first */
    const opsCache = new Map();
    /** @param {number} index @param {any} page @param {(code: string) => void} omit */
    const opsOf = (index, page, omit) => {
        let ops = opsCache.get(index);
        if (ops) opsCache.delete(index);
        else ops = pageOps(page, eng, resolve, omit);
        opsCache.set(index, ops);
        if (opsCache.size > OPS_CACHE_PAGES) opsCache.delete(/** @type {number} */ (opsCache.keys().next().value));
        return ops;
    };
    const measure = createMeasurer();

    const pages = doc.pages.map((page, index) => {
        const geom = pageGeometry(page.raw, resolve);
        return {
            width: geom.width,
            height: geom.height,
            /**
             * @param {HTMLElement} host the page slot
             * @param {number} zoom
             */
            async draw(host, zoom) {
                const surface = /** @type {HTMLElement} */ (host.querySelector('.awv-page-surface') || host);
                let dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
                const cssW = geom.width * zoom;
                const cssH = geom.height * zoom;
                if (cssW * cssH * dpr * dpr > MAX_CANVAS_PIXELS) dpr = Math.sqrt(MAX_CANVAS_PIXELS / (cssW * cssH));
                const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { 'aria-hidden': 'true' }));
                canvas.width = Math.max(1, Math.round(cssW * dpr));
                canvas.height = Math.max(1, Math.round(cssH * dpr));
                const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
                g.fillStyle = '#ffffff';
                g.fillRect(0, 0, canvas.width, canvas.height);

                const s = zoom * dpr * PX.pt * geom.unit;
                const base = baseMatrix(geom.box, geom.rotate, s);
                // Clip to the visible box.
                g.setTransform(base[0], base[1], base[2], base[3], base[4], base[5]);
                const clip = new Path2D();
                clip.rect(geom.box[0], geom.box[1], geom.box[2] - geom.box[0], geom.box[3] - geom.box[1]);
                g.clip(clip);

                const first = !counted.has(index);
                counted.add(index);
                const doc1 = first ? docEnv : { ...docEnv, omit: () => {} };
                const runs = [];
                const textSink = (run) => runs.push(run);

                /** @type {HTMLElement[]} */
                let links = [];
                try {
                    const resources = pageResources(page, eng, resolve);
                    const ops = opsOf(index, page, doc1.omit);
                    await paintOps({ g, base, ops, resources, doc: doc1, textSink });
                    links = await paintAnnotations(page, g, base, doc1, dpr);
                } finally {
                    // Whatever was drawn is shown, even when a later step failed.
                    surface.replaceChildren(canvas, textLayer(runs, dpr, measure), ...links);
                }
            }
        };
    });

    return {
        kind: 'paged',
        pageLabel: 'page',
        title: meta.title || ctx.name,
        meta,
        pages,
        get omissions() { return omissions.list(); },
        dispose() {
            docEnv.images.dispose();
            docEnv.fonts.clear();
            opsCache.clear();
        }
    };
}

/** The page's resources, inheritance resolved (`null` when unreadable). */
function pageResources(page, eng, resolve) {
    try {
        return eng.resources.resolvePageResources(page.raw, resolve);
    } catch {
        return null;
    }
}

/**
 * The page's content streams, decoded and parsed as one operator list
 * (a damaged stream is skipped and recorded).
 */
function pageOps(page, eng, resolve, omit) {
    let ops = [];
    for (const ref of page.contents || []) {
        const stream = deref({ type: 'ref', num: ref.num, gen: ref.gen }, resolve);
        if (!stream || stream.type !== 'stream') continue;
        try {
            ops = ops.concat(eng.content.parseContentStream(eng.filters.decode(stream)));
        } catch {
            omit('pdf/content-undecodable');
        }
    }
    return ops;
}

/**
 * Draw each visible annotation's normal appearance (§12.5.5) and return the
 * web links as positioned anchors.
 * @returns {Promise<HTMLElement[]>}
 */
async function paintAnnotations(page, g, base, docEnv, dpr) {
    const { resolve } = docEnv;
    const annots = arr(get(page.raw, 'Annots', resolve), resolve) || [];
    /** @type {HTMLElement[]} */
    const links = [];
    for (const annot of annots) {
        if (!annot || annot.type !== 'dict' || annotationHidden(annot, resolve)) continue;
        const subtype = name(get(annot, 'Subtype', resolve));
        const r = rect(nums(get(annot, 'Rect', resolve), resolve));
        if (!r) continue;
        if (subtype === 'Link') {
            const action = get(annot, 'A', resolve);
            const uri = name(get(action, 'S', resolve)) === 'URI' ? text(get(action, 'URI', resolve)) : null;
            if (uri && /^(https?:|mailto:)/i.test(uri.trim())) links.push(linkAnchor(uri.trim(), r, base, dpr));
            continue;
        }
        if (subtype === 'Popup') continue;
        // The normal appearance: a stream, or a dict of states picked by /AS.
        const apRef = entries(get(annot, 'AP', resolve))?.N;
        let ap = deref(apRef, resolve);
        let apKey = apRef;
        if (ap && ap.type === 'dict') {
            const state = name(get(annot, 'AS', resolve));
            apKey = state ? entries(ap)?.[state] : null;
            ap = deref(apKey, resolve);
        }
        if (!ap || ap.type !== 'stream') {
            if (subtype !== 'Link') docEnv.omit('pdf/annotation');
            continue;
        }
        // Map the form's transformed BBox onto the annotation rectangle.
        const bbox = rect(nums(get(ap, 'BBox', resolve), resolve)) || [0, 0, 1, 1];
        const fm = nums(get(ap, 'Matrix', resolve), resolve) || IDENTITY;
        const corners = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]]
            .map(([x, y]) => [fm[0] * x + fm[2] * y + fm[4], fm[1] * x + fm[3] * y + fm[5]]);
        const tx0 = Math.min(...corners.map((c) => c[0])); const tx1 = Math.max(...corners.map((c) => c[0]));
        const ty0 = Math.min(...corners.map((c) => c[1])); const ty1 = Math.max(...corners.map((c) => c[1]));
        const sx = (r[2] - r[0]) / ((tx1 - tx0) || 1);
        const sy = (r[3] - r[1]) / ((ty1 - ty0) || 1);
        const a = [sx, 0, 0, sy, r[0] - tx0 * sx, r[1] - ty0 * sy];
        const ops = [
            { op: 'q', args: [] },
            { op: 'cm', args: a.map((v) => ({ type: 'real', value: v })) },
            { op: 'Do', args: [{ type: 'name', value: 'Annot' }] },
            { op: 'Q', args: [] }
        ];
        try {
            await paintOps({ g, base, ops, resources: { XObject: { Annot: apKey } }, doc: docEnv, textSink: () => {} });
        } catch {
            docEnv.omit('pdf/annotation');
        }
    }
    return links;
}

/** An anchor over a link annotation's rectangle (device → CSS px). */
function linkAnchor(uri, r, base, dpr) {
    const pts = [[r[0], r[1]], [r[2], r[3]]].map(([x, y]) => [
        (base[0] * x + base[2] * y + base[4]) / dpr,
        (base[1] * x + base[3] * y + base[5]) / dpr
    ]);
    const left = Math.min(pts[0][0], pts[1][0]);
    const top = Math.min(pts[0][1], pts[1][1]);
    return h('a', {
        class: 'awv-linkannot', href: uri, target: '_blank', rel: 'noopener noreferrer', title: uri,
        style: {
            left: `${left.toFixed(1)}px`, top: `${top.toFixed(1)}px`,
            width: `${Math.abs(pts[1][0] - pts[0][0]).toFixed(1)}px`, height: `${Math.abs(pts[1][1] - pts[0][1]).toFixed(1)}px`
        }
    }, h('span', { class: 'awv-visually-hidden', text: uri }));
}

