// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The designed showcase documents of `build-samples.js`, each
 * made by the licence it presents, in the awaforge palette of the apps:
 *
 * - `brochurePdf`: AWA PDF's brochure drawn with `pdfBuilder` — a navy
 *   cover band with the logo, the "your file → your browser → your screen"
 *   diagram, feature cards, strengths in two columns, a price panel, a
 *   footer on every page; Liberation Sans embedded (Unicode, subset);
 * - `brochureDocx`: AWA Office's brochure written by the Word writer — a
 *   styles part (a title band, coloured headings), a header with the logo,
 *   a footer with the page number, shaded tables, a price panel;
 * - `styleOdt`: AWA Convert's document stays a conversion from Markdown;
 *   a reference stylesheet then gives it its look (styles.xml only: page
 *   layout, body font, a title band, coloured headings), as a template
 *   does. The content is the converter's, untouched.
 *
 * Every sentence comes from the caller (the site's offer pages and the
 * validated words); this module only lays them out. Deterministic.
 *
 * @module viewer/tools/designs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FONTS = resolve(import.meta.dir, '../../../../packages/front/office/oconv-fonts/vendor/liberation');

/** The awaforge palette of the apps, as `RRGGBB`. */
export const INK = { navy: '00263D', navy2: '003462', sky: 'B3DFEF', mist: 'EEF6FA', blue: '0078B3', white: 'FFFFFF', muted: '5B7A8C', ink: '212529' };

/**
 * @typedef {{name: string, tagline: string, intro: string, amount: string, priceRest: string, terms: string,
 *   heads: {use: string, features: string, strengths: string, limits: string, licence: string},
 *   uses: string[], features: {lead: string, text: string}[], strengths: {lead: string, text: string}[],
 *   limits: string[]}} Offer
 */

/** Plain text without Markdown code-span ticks or link syntax. */
const text = (s) => String(s).replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const lead = (s) => text(s).replace(/[.:]\s*$/, '');

/**
 * A PNG (8-bit, RGB or RGBA, not interlaced) as PDF image data: the colour
 * and the alpha planes, zlib-compressed for `FlateDecode`.
 * @param {Uint8Array} png
 * @param {{unzlibSync: (d: Uint8Array) => Uint8Array, zlibSync: (d: Uint8Array, o?: object) => Uint8Array}} zlib
 */
export function pngPlanes(png, zlib) {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let at = 8;
    let width = 0, height = 0, type = 0;
    const idat = [];
    while (at < png.length) {
        const len = view.getUint32(at);
        const kind = String.fromCharCode(...png.subarray(at + 4, at + 8));
        const data = png.subarray(at + 8, at + 8 + len);
        if (kind === 'IHDR') {
            width = view.getUint32(at + 8); height = view.getUint32(at + 12);
            if (data[8] !== 8 || data[12] !== 0) throw new Error('designs: only 8-bit, non-interlaced PNG');
            type = data[9];
        } else if (kind === 'IDAT') idat.push(data);
        at += 12 + len;
    }
    const channels = type === 6 ? 4 : type === 2 ? 3 : 0;
    if (!channels) throw new Error(`designs: PNG colour type ${type} not handled`);
    const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
    let o = 0;
    for (const d of idat) { joined.set(d, o); o += d.length; }
    const raw = zlib.unzlibSync(joined);
    const stride = width * channels;
    const pixels = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const up = y ? pixels.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? row[x - channels] : 0;
            const b = up[x];
            const c = x >= channels ? up[x - channels] : 0;
            let v = src[x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            row[x] = v & 0xff;
        }
    }
    const rgb = new Uint8Array(width * height * 3);
    const alpha = channels === 4 ? new Uint8Array(width * height) : null;
    for (let i = 0; i < width * height; i++) {
        rgb.set(pixels.subarray(i * channels, i * channels + 3), i * 3);
        if (alpha) alpha[i] = pixels[i * channels + 3];
    }
    return { width, height, rgb: zlib.zlibSync(rgb, { level: 9 }), alpha: alpha && zlib.zlibSync(alpha, { level: 9 }) };
}

// ---------------------------------------------------------------------------
// PDF — AWA PDF's brochure
// ---------------------------------------------------------------------------

/**
 * @param {Offer} o
 * @param {{lang: 'en'|'fr', diagram: string[], nothing: string, colophon: string, site: string}} w
 * @param {any} rt A runtime with the oconv manifests registered (pdf, fonts, zlib).
 * @param {Uint8Array} logo The logo PNG.
 * @returns {Uint8Array}
 */
export function brochurePdf(o, w, rt, logo) {
    const W = 595.276, H = 841.89, M = 56, CW = W - 2 * M, BOTTOM = 64;
    const fonts = rt.resolve('fonts');
    const embed = rt.resolve('pdfFontEmbed');
    const zlib = rt.resolve('zlib');

    // Every character the document may draw, so each subset is complete.
    const all = new Set([...JSON.stringify(o), ...w.diagram.join(''), ...w.nothing, ...w.colophon, ...w.site, ...'0123456789 /—•→€']);
    const cps = [...all].map((c) => /** @type {number} */ (c.codePointAt(0))).filter((cp) => cp >= 0x20);
    /** @type {Record<string, any>} */
    const face = {};
    for (const [key, file] of [['R', 'Regular'], ['B', 'Bold'], ['I', 'Italic']]) {
        face[key] = embed.embedCid(fonts.read(new Uint8Array(readFileSync(resolve(FONTS, `LiberationSans-${file}.ttf`)))), cps);
    }
    const width = (s, f, size) => [...s].reduce((n, ch) => n + face[f].widthOf(ch.codePointAt(0)), 0) * size / 1000;
    /** Lines of at most `max` points; a no-break space never breaks. */
    const wrap = (s, f, size, max) => {
        const lines = [];
        let line = '';
        for (const word of String(s).split(/ +/)) {
            const next = line ? `${line} ${word}` : word;
            if (line && width(next, f, size) > max) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
        return lines;
    };
    const rgb = (hex) => [0, 2, 4].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
    const hex = (bytes) => `<${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}>`;
    const n = (v) => Number(v.toFixed(2));

    /** @type {string[][]} one operator list per page */
    const pages = [];
    let ops = /** @type {string[]} */ ([]);
    let y = 0;
    const newPage = () => { ops = []; pages.push(ops); y = H - M; };
    const rect = (x, top, wd, ht, fill, stroke) => {
        ops.push(`${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG 0.75 w ` : ''}${n(x)} ${n(top - ht)} ${n(wd)} ${n(ht)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    };
    const line = (x1, y1, x2, y2, colour, lw = 1) => ops.push(`${rgb(colour)} RG ${lw} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
    const put = (s, f, size, colour, x, base) => ops.push(`BT /${f} ${size} Tf ${rgb(colour)} rg ${n(x)} ${n(base)} Td ${hex(face[f].encode(s))} Tj ET`);
    /** A wrapped paragraph from the cursor; returns its height. */
    const para = (s, f, size, colour, x, max, lead = 1.4, draw = true, top = y) => {
        const lines = wrap(s, f, size, max);
        if (draw) lines.forEach((l, i) => put(l, f, size, colour, x, top - size - i * size * lead));
        return lines.length * size * lead;
    };
    const room = (h) => { if (y - h < BOTTOM) newPage(); };
    const heading = (s) => {
        room(60);
        y -= 18;
        put(s, 'B', 15, INK.blue, M, y - 15);
        y -= 22;
        line(M, y, M + CW, y, INK.sky, 1.2);
        y -= 12;
    };
    const bullets = (items, colour = INK.ink) => {
        for (const item of items) {
            const h = para(item, 'R', 10.5, colour, M + 16, CW - 16, 1.4, false);
            room(h + 4);
            rect(M + 3, y - 6, 4.5, 4.5, INK.blue);
            para(item, 'R', 10.5, colour, M + 16, CW - 16);
            y -= h + 5;
        }
    };

    // Cover band: logo, name, tagline.
    newPage();
    const band = 186;
    rect(0, H, W, band, INK.navy);
    const img = pngPlanes(logo, zlib);
    const L = 72;
    ops.push(`q ${L} 0 0 ${L} ${M} ${n(H - 52 - L)} cm /Logo Do Q`);
    const tx = M + L + 20, tw = W - M - tx;
    put(o.name, 'B', 34, INK.white, tx, H - 52 - 30);
    para(o.tagline, 'B', 13, INK.sky, tx, tw, 1.35, true, H - 52 - 44);
    put(w.site, 'R', 9, INK.sky, M, H - band + 18);
    y = H - band - 30;

    // Intro, then the diagram: three boxes and two arrows.
    y -= para(o.intro, 'R', 11.5, INK.ink, M, CW, 1.45) + 22;
    const gap = 34, bw = (CW - 2 * gap) / 3, bh = 46;
    w.diagram.forEach((label, i) => {
        const x = M + i * (bw + gap);
        rect(x, y, bw, bh, INK.mist, INK.sky);
        put(label, 'B', 12, INK.navy, x + (bw - width(label, 'B', 12)) / 2, y - bh / 2 - 4);
        if (i < 2) {
            const ax = x + bw + 6, ay = y - bh / 2;
            line(ax, ay, ax + gap - 14, ay, INK.blue, 1.6);
            ops.push(`${rgb(INK.blue)} rg ${n(ax + gap - 12)} ${n(ay)} m ${n(ax + gap - 20)} ${n(ay + 4.5)} l ${n(ax + gap - 20)} ${n(ay - 4.5)} l f`);
        }
    });
    y -= bh + 16;
    put(w.nothing, 'I', 10, INK.muted, M + (CW - width(w.nothing, 'I', 10)) / 2, y - 10);
    y -= 26;

    if (o.heads.use && o.uses.length) {
        heading(o.heads.use);
        bullets(o.uses.map(text));
    }

    // Features: cards with an accent bar.
    if (o.heads.features && o.features.length) heading(o.heads.features);
    for (const f of o.features) {
        const pad = 10, inner = CW - 2 * pad - 4;
        const h = pad + para(lead(f.lead), 'B', 11.5, INK.navy, 0, inner, 1.3, false) + 3 + (f.text ? para(text(f.text), 'R', 10, INK.ink, 0, inner, 1.4, false) : 0) + pad;
        room(h + 8);
        rect(M, y, CW, h, INK.mist);
        rect(M, y, 4, h, INK.blue);
        const top = y - pad;
        const lh = para(lead(f.lead), 'B', 11.5, INK.navy, M + 4 + pad, inner, 1.3, true, top);
        if (f.text) para(text(f.text), 'R', 10, INK.ink, M + 4 + pad, inner, 1.4, true, top - lh - 3);
        y -= h + 8;
    }

    // Strengths: two columns of cards, row by row.
    if (o.heads.strengths && o.strengths.length) heading(o.heads.strengths);
    const cw2 = (CW - 12) / 2;
    for (let i = 0; i < o.strengths.length; i += 2) {
        const pair = o.strengths.slice(i, i + 2);
        const pad = 10, inner = cw2 - 2 * pad;
        const heights = pair.map((s) => pad + para(lead(s.lead), 'B', 11, INK.navy, 0, inner, 1.3, false) + 3 + (s.text ? para(text(s.text), 'R', 9.5, INK.ink, 0, inner, 1.4, false) : 0) + pad);
        const h = Math.max(...heights);
        room(h + 10);
        pair.forEach((s, j) => {
            const x = M + j * (cw2 + 12);
            rect(x, y, cw2, h, INK.white, INK.sky);
            rect(x, y, cw2, 3, INK.blue);
            const lh = para(lead(s.lead), 'B', 11, INK.navy, x + pad, inner, 1.3, true, y - pad - 2);
            if (s.text) para(text(s.text), 'R', 9.5, INK.ink, x + pad, inner, 1.4, true, y - pad - 2 - lh - 3);
        });
        y -= h + 10;
    }

    if (o.heads.limits && o.limits.length) {
        heading(o.heads.limits);
        bullets(o.limits.map(text), INK.navy2);
    }

    // The price panel.
    heading(o.heads.licence);
    {
        const pad = 16, inner = CW - 2 * pad;
        const h = pad + 26 + para(o.priceRest, 'R', 11, INK.sky, 0, inner, 1.4, false) + 8 + para(o.terms, 'R', 9.5, INK.white, 0, inner, 1.45, false) + pad;
        room(h + 10);
        rect(M, y, CW, h, INK.navy);
        put(o.amount, 'B', 22, INK.white, M + pad, y - pad - 20);
        const ph = para(o.priceRest, 'R', 11, INK.sky, M + pad, inner, 1.4, true, y - pad - 26);
        para(o.terms, 'R', 9.5, INK.white, M + pad, inner, 1.45, true, y - pad - 26 - ph - 8);
        y -= h + 18;
    }
    room(40);
    para(text(w.colophon), 'I', 9, INK.muted, M, CW, 1.4);

    // Footers, now that the page count is known.
    pages.forEach((p, i) => {
        ops = p;
        line(M, 44, M + CW, 44, INK.sky, 0.75);
        put(`${o.name} — ${w.site}`, 'R', 8.5, INK.muted, M, 30);
        const num = `${i + 1} / ${pages.length}`;
        put(num, 'R', 8.5, INK.muted, M + CW - width(num, 'R', 8.5), 30);
    });

    const b = rt.resolve('pdfBuilder').builder();
    pages.forEach((p, i) => {
        b.addPage({ mediaBox: [0, 0, W, H] });
        for (const key of Object.keys(face)) b.addFont({ name: key, embedded: face[key] });
        if (i === 0) {
            const spec = { name: 'Logo', width: img.width, height: img.height, colorSpace: 'DeviceRGB', bitsPerComponent: 8, data: img.rgb, filter: 'FlateDecode' };
            if (img.alpha) spec.sMask = { width: img.width, height: img.height, colorSpace: 'DeviceGray', bitsPerComponent: 8, data: img.alpha, filter: 'FlateDecode' };
            b.addImage(spec);
        }
        b.addContent(p.join('\n'));
    });
    b.addMetadata({ Title: `${o.name} — ${o.tagline}`, Author: 'AwaCloud', Creator: 'AWA PDF', Producer: 'AWA PDF (@awacloud/pdf)' });
    return b.build();
}

// ---------------------------------------------------------------------------
// Word — AWA Office's brochure
// ---------------------------------------------------------------------------

/**
 * @param {Offer} o
 * @param {{lang: 'en'|'fr', colophon: string, site: string}} w
 * @param {any} d The resolved `docx` module.
 * @param {Uint8Array} logo
 * @returns {Uint8Array}
 */
export function brochureDocx(o, w, d, logo) {
    const el = (name, attrs = {}, children = []) => ({ type: 'element', name, attrs, children });
    const shd = (fill) => el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': fill });
    const side = (name, colour, sz, space = 0) => el(name, { 'w:val': 'single', 'w:sz': String(sz), 'w:space': String(space), 'w:color': colour });
    const box = (colour, sz, space) => el('w:pBdr', {}, ['w:top', 'w:left', 'w:bottom', 'w:right'].map((s) => side(s, colour, sz, space)));
    const FONT = 'Calibri';
    const run = (s, rPr = {}) => d.run(s, { font: FONT, ...rPr });
    const p = (runs, pPr = {}) => ({ type: 'paragraph', pPr, children: runs });
    const WIDTH = 9638;   // A4 less two 2 cm margins, in twentieths of a point

    const styles = {
        docDefaults: { rPr: { font: FONT, size: 21, color: INK.ink }, pPr: { spacing: { after: 120, line: 288 } } },
        styles: [
            { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true },
            {
                type: 'paragraph', styleId: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal',
                rPr: { bold: true, size: 56, color: INK.white },
                pPr: { spacing: { before: 0, after: 0 }, _extras: [box(INK.navy, 48, 12), shd(INK.navy)] }
            },
            {
                type: 'paragraph', styleId: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal',
                rPr: { bold: true, size: 28, color: INK.sky },
                pPr: { spacing: { before: 0, after: 240 }, _extras: [box(INK.navy, 48, 12), shd(INK.navy)] }
            },
            {
                type: 'paragraph', styleId: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal',
                rPr: { bold: true, size: 30, color: INK.blue },
                pPr: { spacing: { before: 360, after: 120 }, _extras: [el('w:keepNext'), el('w:pBdr', {}, [side('w:bottom', INK.sky, 12, 4)]), el('w:outlineLvl', { 'w:val': '0' })] }
            },
            { type: 'paragraph', styleId: 'Colophon', name: 'Colophon', basedOn: 'Normal', rPr: { italic: true, size: 17, color: INK.muted } }
        ]
    };
    const cell = (children, wd, fill, extra = []) => ({
        type: 'cell',
        tcPr: { width: { w: wd, type: 'dxa' }, _extras: [shd(fill), el('w:tcMar', {}, ['w:top', 'w:left', 'w:bottom', 'w:right'].map((s) => el(s, { 'w:w': '120', 'w:type': 'dxa' }))), ...extra] },
        children
    });
    const table = (rows) => ({
        type: 'table',
        tblPr: {
            width: { w: WIDTH, type: 'dxa' },
            borders: Object.fromEntries(['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => [s, { val: 'single', sz: 6, space: 0, color: INK.sky }]))
        },
        rows
    });
    const pairs = (items, leadFill) => table(items.map((f) => ({
        type: 'row',
        cells: [
            cell([p([run(lead(f.lead), { bold: true, color: INK.navy })], { spacing: { after: 0 } })], 3000, leadFill),
            cell([p([run(text(f.text))], { spacing: { after: 0 } })], WIDTH - 3000, INK.white)
        ]
    })));
    const bullets = (items) => items.map((s) => p([run('■  ', { color: INK.blue, size: 16 }), run(text(s))], { indent: { left: 360, hanging: 300 }, spacing: { after: 80 } }));

    /** A heading and its blocks, or nothing when the site's page has no such section. */
    const part = (head, items, blocks) => (head && items.length ? [p([run(head)], { pStyle: 'Heading1' }), ...blocks] : []);
    const body = [
        p([run(o.name)], { pStyle: 'Title' }),
        p([run(o.tagline)], { pStyle: 'Subtitle' }),
        p([run(text(o.intro), { size: 23 })], { spacing: { after: 200 } }),
        ...part(o.heads.use, o.uses, bullets(o.uses)),
        ...part(o.heads.features, o.features, [pairs(o.features, INK.mist)]),
        ...part(o.heads.strengths, o.strengths, [pairs(o.strengths, INK.sky)]),
        ...part(o.heads.limits, o.limits, bullets(o.limits)),
        p([run(o.heads.licence)], { pStyle: 'Heading1' }),
        table([{
            type: 'row',
            cells: [cell([
                p([run(o.amount, { bold: true, size: 44, color: INK.white })], { spacing: { after: 60 } }),
                p([run(o.priceRest, { color: INK.sky, size: 22 })], { spacing: { after: 120 } }),
                p([run(o.terms, { color: INK.white, size: 18 })], { spacing: { after: 0 } })
            ], WIDTH, INK.navy)]
        }]),
        p([run(text(w.colophon))], { pStyle: 'Colophon', spacing: { before: 360 } })
    ];
    const header = p([d.imageRun(logo, { cx: '0.45in', cy: '0.45in', name: 'AwaCloud', description: 'AwaCloud' }), run(`   ${o.name}`, { bold: true, color: INK.navy, size: 20 })],
        { spacing: { after: 0 }, _extras: [el('w:pBdr', {}, [side('w:bottom', INK.sky, 6, 6)])] });
    const footer = {
        type: 'paragraph',
        pPr: { align: 'center', spacing: { after: 0 } },
        children: [run(`${o.name} — ${w.site} — `, { size: 16, color: INK.muted }), d.fieldSimple('PAGE', '1', { font: FONT, size: 16, color: INK.muted })]
    };
    return d.write({
        type: 'document',
        body,
        sectPr: {
            pageSize: { w: 11906, h: 16838 },
            pageMargin: { top: 1418, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 567, gutter: 0 },
            headerReferences: [{ type: 'default', rId: 'rIdHdrMain' }],
            footerReferences: [{ type: 'default', rId: 'rIdFtrMain' }]
        }
    }, {
        styles,
        headers: { rIdHdrMain: { type: 'header', body: [header] } },
        footers: { rIdFtrMain: { type: 'footer', body: [footer] } }
    });
}

// ---------------------------------------------------------------------------
// OpenDocument — AWA Convert's output, with a reference stylesheet
// ---------------------------------------------------------------------------

/** The reference stylesheet: the converter's style names, given a look. */
function referenceStyles() {
    const c = (hex) => `#${hex}`;
    const body = 'fo:font-family="Liberation Sans" style:font-family-generic="swiss"';
    return '<office:styles>'
        + `<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm" fo:line-height="140%"/><style:text-properties ${body} fo:font-size="10.5pt" fo:color="${c(INK.ink)}"/></style:default-style>`
        + '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
        + '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm"/></style:style>'
        + `<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.6cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties ${body} fo:font-weight="bold" fo:color="${c(INK.navy)}"/></style:style>`
        + `<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="1" style:class="text"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.3cm" fo:background-color="${c(INK.navy)}" fo:padding="0.4cm" fo:border="0.06pt solid ${c(INK.navy)}"/><style:text-properties fo:font-size="26pt" fo:color="${c(INK.white)}"/></style:style>`
        + `<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="2" style:class="text"><style:paragraph-properties fo:padding-bottom="0.08cm" fo:border-bottom="1.5pt solid ${c(INK.sky)}"/><style:text-properties fo:font-size="15pt" fo:color="${c(INK.blue)}"/></style:style>`
        + [3, 4, 5, 6].map((lv) => `<style:style style:name="Heading_20_${lv}" style:display-name="Heading ${lv}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="${lv}" style:class="text"><style:text-properties fo:font-size="${lv === 3 ? 12.5 : 11}pt" fo:color="${c(INK.navy2)}"/></style:style>`).join('')
        + `<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:background-color="${c(INK.mist)}" fo:padding="0.2cm"/><style:text-properties fo:font-family="Liberation Mono" style:font-family-generic="modern" style:font-pitch="fixed" fo:font-size="9.5pt" fo:color="${c(INK.navy)}"/></style:style>`
        + `<style:style style:name="Quotations" style:display-name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="0.5cm" fo:margin-right="0cm" fo:margin-top="0cm" fo:margin-bottom="0.25cm" fo:background-color="${c(INK.mist)}" fo:padding="0.25cm" fo:border-left="3pt solid ${c(INK.blue)}"/></style:style>`
        + `<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:border-bottom="1pt solid ${c(INK.sky)}" fo:padding="0cm" fo:margin-top="0.4cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="6pt"/></style:style>`
        + '</office:styles>'
        + '<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.2cm" fo:margin-right="2.2cm"/></style:page-layout></office:automatic-styles>'
        + '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>';
}

/**
 * Give a converted OpenDocument text its reference stylesheet: `styles.xml`
 * keeps its root and namespaces, its styles become the reference ones. The
 * archive is rewritten with `mimetype` first and stored, every entry dated
 * at the DOS epoch (deterministic).
 * @param {Uint8Array} odt
 * @param {{zipSync: Function, unzipSync: Function}} zip
 * @returns {Uint8Array}
 */
export function styleOdt(odt, zip) {
    const files = zip.unzipSync(odt);
    const styles = new TextDecoder().decode(files['styles.xml']);
    const start = styles.indexOf('<office:styles');
    const end = styles.indexOf('</office:document-styles>');
    if (start < 0 || end < 0) throw new Error('designs: styles.xml has no office:styles');
    files['styles.xml'] = new TextEncoder().encode(styles.slice(0, start) + referenceStyles() + styles.slice(end));
    const epoch = new Date(1980, 0, 1, 0, 0, 0);
    /** @type {Record<string, any>} */
    const out = { mimetype: [files.mimetype, { level: 0, mtime: epoch }] };
    for (const name of Object.keys(files).filter((f) => f !== 'mimetype')) out[name] = [files[name], { level: 9, mtime: epoch }];
    return zip.zipSync(out, { mtime: epoch });
}
