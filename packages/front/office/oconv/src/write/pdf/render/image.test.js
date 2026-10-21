// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit + golden tests for `oconvPdfRenderImage` — REAL image placement since
 * BL-980 (office/BATCH_35 task 02), plus the two honest refusal paths it
 * keeps (`reason: 'no-bytes'`, `reason: 'unsupported-encoding'`).
 *
 * The committed first-party fixtures (`corpus/assets/px.jpg`,
 * `corpus/assets/px.png`, provenance in `corpus/assets/PROVENANCE.md`) carry
 * the two real formats; synthetic headers cover the geometry cases no 1×1
 * file can express (an image taller than a page, an image wider than the
 * column).
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { pdfWriterRuntime, corpusBytes } from '../_test-runtime.js';
import { oconvPdfRenderImage } from './image.js';
import { oconvIrToPdf as oconvIrToPdfDescriptor } from '../../ir-to-pdf.js';
import { readImageHeader } from '../../image-header.js';

const runtime = pdfWriterRuntime();
const renderImage = runtime.resolve('oconvPdfRenderImage');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const stack = runtime.resolve('oconvPdfStack');

const measurer = metrics.createMeasurer();
const LAYOUT = box.resolveLayout();

const JPEG = await corpusBytes('assets/px.jpg');
const PNG = await corpusBytes('assets/px.png');

/**
 * A synthetic baseline JPEG carrying nothing but a frame header — enough
 * for the renderer, which reads the header and embeds the bytes verbatim.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [components]
 * @returns {Uint8Array}
 */
function jpegOf(width, height, components = 3) {
    const hi = (n) => (n >>> 8) & 0xFF;
    const lo = (n) => n & 0xFF;
    const comps = [];
    for (let i = 0; i < components; i += 1) comps.push(i + 1, 0x11, 0x00);
    const frameLen = 8 + comps.length;
    return Uint8Array.from([0xFF, 0xD8, 0xFF, 0xC0, hi(frameLen), lo(frameLen),
        8, hi(height), lo(height), hi(width), lo(width), components].concat(comps));
}

/**
 * A `ctx.flowChildren` binding built the same way the facade's own
 * `flowChildrenAt` builds it (`../../ir-to-pdf.js`) — reproduced here,
 * test-local, so `render` can be exercised directly without going through
 * the whole facade for every case.
 *
 * @param {object} ctx The renderer child context this helper attaches to.
 * @returns {(blocks: object[], opts?: object) => {blocks: object[], height: number}}
 */
function makeFlowChildren(ctx) {
    return (blocks, opts) => {
        const o = opts || {};
        const delta = Number.isFinite(o.indentDelta) ? o.indentDelta : stack.INDENT_STEP;
        const childCtx = {
            ...ctx,
            indent: (Number.isFinite(ctx.indent) ? ctx.indent : 0) + delta,
            indexPrefix: ctx.index,
            linebreak: o.styleOverride
                ? {
                    ...linebreak,
                    breakInlines: (inlines, m, sizePt, columnPt) =>
                        linebreak.breakInlines(inlines, m, sizePt, columnPt, o.styleOverride)
                }
                : linebreak
        };
        const flowed = stack.flowBlocks({ kind: 'document', children: blocks || [] }, childCtx);
        let height = 0;
        for (const b of flowed) height += b.spaceBefore + b.height + b.spaceAfter;
        return { blocks: flowed, height };
    };
}

/**
 * Build a renderer child context for one `render(node, ctx)` call, with a
 * recording image sink shaped exactly like the facade's own.
 *
 * @param {object} [over]
 * @returns {object}
 */
function makeCtx(over = {}) {
    const calls = [];
    const base = {
        measurer, layout: LAYOUT, column: LAYOUT.column,
        sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading,
        linebreak, losses: [], index: '0', indent: 0, kind: 'image',
        imageCounter: { n: 0 },
        builder: { addImage(spec) { calls.push(spec); return this; } },
        ...over
    };
    base.flowChildren = makeFlowChildren(base);
    base.addImageCalls = calls;
    return base;
}

describe('oconvPdfRenderImage — descriptor', () => {
    test('name and declared dependencies are the frozen D-E shape', () => {
        expect(oconvPdfRenderImage.name).toBe('oconvPdfRenderImage');
        expect(oconvPdfRenderImage.dependencies).toEqual(['oconvPdfLinebreak']);
    });

    test('the resolved instance exposes exactly `render` — the throwing `placeImage` seam is GONE', () => {
        expect(Object.keys(renderImage)).toEqual(['render']);
        expect(typeof renderImage.render).toBe('function');
        expect(renderImage.placeImage).toBeUndefined();
    });

    test('the factory is capture-free (fw/no-factory-capture): it runs in a bare scope', () => {
        const rebuilt = new Function(
            'return (function ' + oconvPdfRenderImage.factory.toString() + ')'
        )();
        const inst = rebuilt(runtime.resolve('oconvPdfLinebreak'));
        expect(typeof inst.render).toBe('function');
    });
});

describe('the readImageHeader mirror (fw/no-factory-capture)', () => {
    /**
     * Extract a `function <name>(` block by brace counting.
     *
     * @param {string} source
     * @param {string} name
     * @returns {string}
     */
    function extract(source, name) {
        const start = source.indexOf(`function ${name}(`);
        expect(start).toBeGreaterThan(-1);
        let depth = 0;
        let seen = false;
        for (let i = start; i < source.length; i += 1) {
            if (source[i] === '{') { depth += 1; seen = true; }
            else if (source[i] === '}') {
                depth -= 1;
                if (seen && depth === 0) return source.slice(start, i + 1);
            }
        }
        throw new Error(`unbalanced ${name}`);
    }

    test('the factory-internal copy is the module copy, character for character (modulo its 8-space indent)', async () => {
        const canonical = extract(
            await Bun.file(fileURLToPath(new URL('../../image-header.js', import.meta.url))).text(),
            'readImageHeader'
        );
        const mirrored = extract(
            await Bun.file(fileURLToPath(new URL('./image.js', import.meta.url))).text(),
            'readImageHeader'
        );
        const dedented = mirrored.split('\n')
            .map((line) => (line.startsWith('        ') ? line.slice(8) : line))
            .join('\n');
        expect(dedented).toBe(canonical);
    });

    test('falsification — a mutated copy is REJECTED by the same comparison', () => {
        const canonical = 'function readImageHeader(bytes) {\n    return null;\n}';
        const mutated = '        function readImageHeader(bytes) {\n            return 1;\n        }';
        const dedented = mutated.split('\n')
            .map((line) => (line.startsWith('        ') ? line.slice(8) : line))
            .join('\n');
        expect(dedented).not.toBe(canonical);
    });

    test('and the two copies AGREE behaviourally on every fixture the suite uses', () => {
        const rebuilt = new Function(
            'return (function ' + oconvPdfRenderImage.factory.toString() + ')'
        )();
        void rebuilt;   // the mirror is private; agreement is proven through `render`
        for (const [bytes, expected] of [
            [JPEG, 'jpeg'], [PNG, 'png'],
            [jpegOf(4, 4, 4), null], [new Uint8Array([1, 2, 3]), null]
        ]) {
            const h = readImageHeader(bytes);
            expect(h === null ? null : h.format).toBe(expected);
        }
    });
});

describe('render — placement (the delivered path)', () => {
    test('a JPEG is PLACED: addImage gets the parsed parameters and the bytes verbatim, and NO loss is recorded', () => {
        const ctx = makeCtx({ assets: { 'photo.jpg': JPEG } });
        const { items, losses, height } = renderImage.render(
            { kind: 'image', name: 'photo.jpg', alt: 'Photo' }, ctx
        );

        expect(losses).toEqual([]);
        expect(ctx.addImageCalls).toHaveLength(1);
        expect(ctx.addImageCalls[0]).toEqual({
            name: 'Im0',
            width: 1, height: 1,
            colorSpace: 'DeviceGray',
            bitsPerComponent: 8,
            filter: 'DCTDecode',
            data: JPEG
        });
        expect(ctx.addImageCalls[0].data).toBe(JPEG);      // identity, not a copy

        expect(items).toHaveLength(1);
        expect(items[0].xobject).toEqual({ name: 'Im0', w: 1, h: 1 });
        expect(items[0].x).toBeCloseTo(LAYOUT.margin, 6);
        expect(items[0].y).toBeCloseTo(1, 6);              // local y = the bottom edge
        expect(items[0].index).toBe('0');
        expect(items[0].kind).toBe('image');
        expect(height).toBeCloseTo(1 + 6, 6);              // image + the fixed 6 pt
    });

    test('two images on one page get DISTINCT resource names from the document counter', () => {
        const ctx = makeCtx({ assets: { 'a.jpg': JPEG, 'b.jpg': JPEG } });
        const first = renderImage.render({ kind: 'image', name: 'a.jpg', alt: '' }, ctx);
        const second = renderImage.render({ kind: 'image', name: 'b.jpg', alt: '' }, ctx);
        expect(first.items[0].xobject.name).toBe('Im0');
        expect(second.items[0].xobject.name).toBe('Im1');
        expect(ctx.addImageCalls.map((s) => s.name)).toEqual(['Im0', 'Im1']);
        expect(ctx.imageCounter.n).toBe(2);
    });

    test('an image WIDER than the column is scaled down, aspect ratio preserved; a narrow one is never enlarged', () => {
        const wide = jpegOf(2000, 1000);
        const ctx = makeCtx({ assets: { 'w.jpg': wide, 'n.jpg': jpegOf(40, 20) } });

        const big = renderImage.render({ kind: 'image', name: 'w.jpg', alt: '' }, ctx);
        expect(big.items[0].xobject.w).toBeCloseTo(LAYOUT.column, 6);
        expect(big.items[0].xobject.h).toBeCloseTo(LAYOUT.column / 2, 6);

        const small = renderImage.render({ kind: 'image', name: 'n.jpg', alt: '' }, ctx);
        expect(small.items[0].xobject).toEqual({ name: 'Im1', w: 40, h: 20 });
    });

    test('a non-zero indent narrows the fitting column AND moves x', () => {
        const ctx = makeCtx({ indent: 18, assets: { 'w.jpg': jpegOf(2000, 1000) } });
        const { items } = renderImage.render({ kind: 'image', name: 'w.jpg', alt: '' }, ctx);
        expect(items[0].x).toBeCloseTo(LAYOUT.margin + 18, 6);
        expect(items[0].xobject.w).toBeCloseTo(LAYOUT.column - 18, 6);
    });

    test('reader-carried bytes (`escapes.docx.bytes`) place too; caller `assets` WINS when both are present', () => {
        const other = jpegOf(8, 8);
        const readerOnly = makeCtx();
        renderImage.render({
            kind: 'image', name: 'x.jpg', alt: '',
            escapes: { docx: { bytes: JPEG, contentType: 'image/jpeg' } }
        }, readerOnly);
        expect(readerOnly.addImageCalls[0].data).toBe(JPEG);

        const both = makeCtx({ assets: { 'x.jpg': other } });
        renderImage.render({
            kind: 'image', name: 'x.jpg', alt: '',
            escapes: { docx: { bytes: JPEG, contentType: 'image/jpeg' } }
        }, both);
        expect(both.addImageCalls[0].data).toBe(other);
        expect(both.addImageCalls[0].width).toBe(8);
    });

    test('a placeable image with no `ctx.builder` throws rather than dropping it silently', () => {
        const ctx = makeCtx({ assets: { 'a.jpg': JPEG } });
        delete ctx.builder;
        expect(() => renderImage.render({ kind: 'image', name: 'a.jpg', alt: '' }, ctx))
            .toThrow('oconv: pdf image renderer needs ctx.builder');
    });
});

describe('render — the two refusals, each with its reason', () => {
    test('no bytes at all → `reason: no-bytes`, placeholder drawn, nothing registered', () => {
        const ctx = makeCtx();
        const { items, losses } = renderImage.render(
            { kind: 'image', name: 'diagram.png', alt: 'Diagram' }, ctx
        );
        expect(losses).toEqual([{
            code: 'layout/image-dropped',
            detail: {
                index: '0', name: 'diagram.png', alt: 'Diagram',
                reason: 'no-bytes', bytes: 0
            }
        }]);
        expect(items[0].tokens.map((t) => t.text).join('')).toBe('[image: Diagram]');
        expect(items[0].tokens.every((t) => t.style === 'italic')).toBe(true);
        expect(items[0].xobject).toBeUndefined();
        expect(ctx.addImageCalls).toEqual([]);
    });

    test('a PNG it cannot place (interlaced) → `reason: unsupported-encoding` NAMING the format, placeholder still drawn', () => {
        const interlaced = pngOf({ width: 1, height: 1, colorType: 2, rows: [[1, 2, 3]], interlace: 1 });
        const ctx = makeCtx({ assets: { 'diagram.png': interlaced } });
        const { items, losses } = renderImage.render(
            { kind: 'image', name: 'diagram.png', alt: 'Diagram' }, ctx
        );
        expect(losses).toEqual([{
            code: 'layout/image-dropped',
            detail: {
                index: '0', name: 'diagram.png', alt: 'Diagram',
                reason: 'unsupported-encoding', bytes: interlaced.length, format: 'png'
            }
        }]);
        expect(items[0].tokens.map((t) => t.text).join('')).toBe('[image: Diagram]');
        expect(ctx.addImageCalls).toEqual([]);
    });

    test('bytes the header reader cannot name → `unsupported-encoding` with NO `format` key', () => {
        const random = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
        const ctx = makeCtx({ assets: { 'x.bin': random } });
        const { losses } = renderImage.render({ kind: 'image', name: 'x.bin', alt: '' }, ctx);
        expect(losses[0].detail).toEqual({
            index: '0', name: 'x.bin', alt: '',
            reason: 'unsupported-encoding', bytes: 8
        });
        expect('format' in losses[0].detail).toBe(false);
    });

    test('a CMYK JPEG is refused, not guessed at', () => {
        const ctx = makeCtx({ assets: { 'c.jpg': jpegOf(4, 4, 4) } });
        const { losses } = renderImage.render({ kind: 'image', name: 'c.jpg', alt: '' }, ctx);
        expect(losses[0].detail.reason).toBe('unsupported-encoding');
        expect(ctx.addImageCalls).toEqual([]);
    });

    test('an unreferenced assets key changes nothing — the image still refuses on `no-bytes`', () => {
        const ctx = makeCtx({ assets: { 'somethingelse.jpg': JPEG } });
        const { losses } = renderImage.render({ kind: 'image', name: 'a.png', alt: '' }, ctx);
        expect(losses[0].detail.reason).toBe('no-bytes');
    });
});

/* ── PNG placement ─────────────────────────────────────────────────────── */

const ZLIB = runtime.resolve('zlib');
const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** One PNG chunk with a zero CRC (the renderer never checks CRCs). */
function chunk(type, data) {
    return [...be32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

/** Filter one raw scanline with PNG filter `f` against the previous raw line. */
function filterRow(f, raw, prev, bpp) {
    const out = [f];
    for (let i = 0; i < raw.length; i += 1) {
        const a = i >= bpp ? raw[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        const c = i >= bpp && prev ? prev[i - bpp] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
            const p = a + b - c;
            const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
            pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
        }
        out.push((raw[i] - pred) & 255);
    }
    return out;
}

/**
 * A real PNG: IHDR, optional PLTE / tRNS, the zlib of the filtered scanlines
 * split over `idatSplit` IDAT chunks, IEND.
 *
 * @param {object} o `{ width, height, colorType, bitDepth = 8, rows (raw
 *   bytes per scanline), filters?, plte?, trns?, interlace = 0, idatSplit = 1,
 *   idat? (raw IDAT payload override) }`
 * @returns {Uint8Array}
 */
function pngOf(o) {
    const depth = o.bitDepth || 8;
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[o.colorType];
    const bpp = Math.max(1, (channels * depth) >> 3);
    const filtered = [];
    o.rows.forEach((raw, y) => {
        filtered.push(...filterRow((o.filters || [])[y] || 0, raw, y ? o.rows[y - 1] : null, bpp));
    });
    const idat = o.idat || ZLIB.zlibSync(Uint8Array.from(filtered));
    const parts = [];
    const split = o.idatSplit || 1;
    const step = Math.max(1, Math.ceil(idat.length / split));
    for (let i = 0; i < idat.length; i += step) parts.push(...chunk('IDAT', [...idat.subarray(i, i + step)]));
    return Uint8Array.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        ...chunk('IHDR', [...be32(o.width), ...be32(o.height), depth, o.colorType, 0, 0, o.interlace || 0]),
        ...(o.plte ? chunk('PLTE', o.plte) : []),
        ...(o.trns ? chunk('tRNS', o.trns) : []),
        ...parts,
        ...chunk('IEND', [])
    ]);
}

/** The concatenated IDAT payload of a PNG (what the predictor route embeds). */
function idatOf(png) {
    const out = [];
    for (let at = 8; at + 8 <= png.length;) {
        const len = (png[at] << 24 | png[at + 1] << 16 | png[at + 2] << 8 | png[at + 3]) >>> 0;
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
        if (type === 'IDAT') out.push(...png.subarray(at + 8, at + 8 + len));
        at += 12 + len;
    }
    return Uint8Array.from(out);
}

/** Inflate a placed stream back to its samples. */
const inflate = (data) => [...ZLIB.unzlibSync(data)];

describe('render — PNG placement', () => {
    const place = (png, over = {}) => {
        const ctx = makeCtx({ assets: { 'p.png': png }, zlib: ZLIB, ...over });
        const out = renderImage.render({ kind: 'image', name: 'p.png', alt: 'P' }, ctx);
        return { ...out, calls: ctx.addImageCalls };
    };
    const predictor = (colors, bits, columns) => ({
        type: 'dict',
        entries: {
            Predictor: { type: 'int', value: 15 },
            Colors: { type: 'int', value: colors },
            BitsPerComponent: { type: 'int', value: bits },
            Columns: { type: 'int', value: columns }
        }
    });

    test('RGB 8-bit, no tRNS: the IDAT stream is embedded VERBATIM behind a PNG predictor, no inflate, no loss', () => {
        const png = pngOf({ width: 2, height: 2, colorType: 2, idatSplit: 2,
            rows: [[255, 0, 0, 0, 255, 0], [0, 0, 255, 9, 9, 9]], filters: [1, 2] });
        const { losses, calls, items } = place(png, { zlib: undefined });

        expect(losses).toEqual([]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            name: 'Im0', width: 2, height: 2, colorSpace: 'DeviceRGB', bitsPerComponent: 8,
            filter: 'FlateDecode', decodeParms: predictor(3, 8, 2), data: idatOf(png)
        });
        expect(items[0].xobject).toEqual({ name: 'Im0', w: 2, h: 2 });
    });

    test('the committed greyscale fixture places through the predictor route (Colors 1)', () => {
        const { losses, calls } = place(PNG, { zlib: undefined });
        expect(losses).toEqual([]);
        expect(calls[0]).toMatchObject({
            width: 1, height: 1, colorSpace: 'DeviceGray', bitsPerComponent: 8,
            filter: 'FlateDecode', decodeParms: predictor(1, 8, 1)
        });
        expect(calls[0].sMask).toBeUndefined();
    });

    test('RGBA 8-bit: unfiltered (Sub, Paeth), colour and an /SMask, both re-deflated', () => {
        const rows = [
            [10, 20, 30, 255, 40, 50, 60, 0, 70, 80, 90, 128],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        ];
        const { losses, calls } = place(pngOf({ width: 3, height: 2, colorType: 6, rows, filters: [1, 4] }));

        expect(losses).toEqual([]);
        const spec = calls[0];
        expect(spec).toMatchObject({ width: 3, height: 2, colorSpace: 'DeviceRGB', bitsPerComponent: 8, filter: 'FlateDecode' });
        expect(spec.decodeParms).toBeUndefined();
        expect(inflate(spec.data)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 1, 2, 3, 5, 6, 7, 9, 10, 11]);
        expect(spec.sMask).toMatchObject({ width: 3, height: 2, colorSpace: 'DeviceGray', bitsPerComponent: 8, filter: 'FlateDecode' });
        expect(inflate(spec.sMask.data)).toEqual([255, 0, 128, 4, 8, 12]);
    });

    test('RGBA whose every pixel is opaque: no /SMask', () => {
        const { calls } = place(pngOf({ width: 1, height: 2, colorType: 6, rows: [[1, 2, 3, 255], [4, 5, 6, 255]] }));
        expect(inflate(calls[0].data)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(calls[0].sMask).toBeUndefined();
    });

    test('grey + alpha at 16 bits (Up, Average): 16-bit grey samples and a 16-bit /SMask', () => {
        const rows = [[0x12, 0x34, 0xFF, 0xFF], [0xAB, 0xCD, 0x00, 0x10]];
        const { losses, calls } = place(pngOf({ width: 1, height: 2, colorType: 4, bitDepth: 16, rows, filters: [2, 3] }));
        expect(losses).toEqual([]);
        expect(calls[0]).toMatchObject({ colorSpace: 'DeviceGray', bitsPerComponent: 16 });
        expect(inflate(calls[0].data)).toEqual([0x12, 0x34, 0xAB, 0xCD]);
        expect(calls[0].sMask.bitsPerComponent).toBe(16);
        expect(inflate(calls[0].sMask.data)).toEqual([0xFF, 0xFF, 0x00, 0x10]);
    });

    test('palette at 2 bits, an odd width: expanded to 8-bit RGB, tRNS gives the /SMask', () => {
        // 5 pixels of 2 bits = 10 bits = 2 bytes per row: indices 0,1,2,3,1 then 3,3,0,0,2.
        const rows = [[0b00011011, 0b01000000], [0b11110000, 0b10000000]];
        const plte = [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9];
        const { losses, calls } = place(pngOf({ width: 5, height: 2, colorType: 3, bitDepth: 2, rows, plte, trns: [255, 0] }));

        expect(losses).toEqual([]);
        expect(calls[0]).toMatchObject({ colorSpace: 'DeviceRGB', bitsPerComponent: 8 });
        const rgb = (i) => plte.slice(i * 3, i * 3 + 3);
        expect(inflate(calls[0].data)).toEqual([0, 1, 2, 3, 1, 3, 3, 0, 0, 2].flatMap(rgb));
        expect(inflate(calls[0].sMask.data)).toEqual([255, 0, 255, 255, 0, 255, 255, 255, 255, 255]);
    });

    test('palette at 8 bits with no tRNS: no /SMask', () => {
        const { calls } = place(pngOf({ width: 2, height: 1, colorType: 3, rows: [[1, 0]], plte: [1, 2, 3, 4, 5, 6] }));
        expect(inflate(calls[0].data)).toEqual([4, 5, 6, 1, 2, 3]);
        expect(calls[0].sMask).toBeUndefined();
    });

    test('RGB with a tRNS colour key: decoded, the key colour is transparent in the /SMask', () => {
        const rows = [[1, 2, 3, 7, 7, 7]];
        const { calls } = place(pngOf({ width: 2, height: 1, colorType: 2, rows, trns: [0, 7, 0, 7, 0, 7] }));
        expect(calls[0].decodeParms).toBeUndefined();
        expect(inflate(calls[0].data)).toEqual([1, 2, 3, 7, 7, 7]);
        expect(inflate(calls[0].sMask.data)).toEqual([255, 0]);
    });

    const refused = (png, over) => {
        const { losses, calls, items } = place(png, over);
        expect(calls).toEqual([]);
        expect(items[0].tokens.map((t) => t.text).join('')).toBe('[image: P]');
        expect(losses).toEqual([{
            code: 'layout/image-dropped',
            detail: { index: '0', name: 'p.png', alt: 'P', reason: 'unsupported-encoding', bytes: png.length, format: 'png' }
        }]);
    };

    test('without ctx.zlib (a hand-wired facade) an alpha or palette PNG is refused as before', () => {
        refused(pngOf({ width: 1, height: 1, colorType: 6, rows: [[1, 2, 3, 4]] }), { zlib: undefined });
        refused(pngOf({ width: 1, height: 1, colorType: 3, rows: [[0]], plte: [1, 2, 3] }), { zlib: undefined });
    });

    test('refused, naming png: interlaced, no IDAT, no PLTE for a palette, bad filter type, short data', () => {
        refused(pngOf({ width: 1, height: 1, colorType: 2, rows: [[1, 2, 3]], interlace: 1 }));
        refused(pngOf({ width: 1, height: 1, colorType: 2, rows: [[1, 2, 3]], idat: new Uint8Array(0) }));
        refused(pngOf({ width: 1, height: 1, colorType: 3, rows: [[0]] }));
        refused(pngOf({ width: 1, height: 1, colorType: 6, rows: [[1, 2, 3, 4]], filters: [5] }));
        refused(pngOf({ width: 2, height: 2, colorType: 6, rows: [[1, 2, 3, 4, 5, 6, 7, 8]] }));
    });

    test('a stream that inflates past its IHDR size is refused (the output bound), and so is a 64 MiB+ image', () => {
        const bomb = ZLIB.zlibSync(new Uint8Array(100000));
        refused(pngOf({ width: 1, height: 1, colorType: 6, rows: [[0, 0, 0, 0]], idat: bomb }));
        refused(pngOf({ width: 20000, height: 20000, colorType: 6, rows: [], idat: bomb }));
    });
});

describe('render — a refused image names its format (signature, else the carried content type)', () => {
    const detailOf = (bytes, contentType) => {
        const ctx = makeCtx(contentType ? {} : { assets: { x: bytes } });
        const node = { kind: 'image', name: 'x', alt: '' };
        if (contentType) node.escapes = { docx: { bytes, contentType } };
        return renderImage.render(node, ctx).losses[0].detail;
    };

    test('a JPEG the header reader refuses (CMYK) is named jpeg', () => {
        expect(detailOf(jpegOf(4, 4, 4)).format).toBe('jpeg');
    });

    test('GIF, WebP, BMP and TIFF signatures', () => {
        expect(detailOf(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0])).format).toBe('gif');
        expect(detailOf(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])).format).toBe('webp');
        expect(detailOf(Uint8Array.from([0x42, 0x4D, 0, 0, 0, 0, 0, 0])).format).toBe('bmp');
        expect(detailOf(Uint8Array.from([0x49, 0x49, 0x2A, 0, 8, 0, 0, 0])).format).toBe('tiff');
        expect(detailOf(Uint8Array.from([0x4D, 0x4D, 0, 0x2A, 0, 0, 0, 8])).format).toBe('tiff');
    });

    test('no known signature: the reader-carried content type names it; neither → no format key', () => {
        expect(detailOf(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 'image/x-icon').format).toBe('x-icon');
        const none = detailOf(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
        expect('format' in none).toBe(false);
    });
});

describe('render — placeholder text selection (unchanged v1 behaviour)', () => {
    test('alt empty, name present → `[image: <name>]`', () => {
        const ctx = makeCtx();
        const { items, losses } = renderImage.render(
            { kind: 'image', name: 'diagram.png', alt: '' }, ctx
        );
        expect(items[0].tokens.map((t) => t.text).join('')).toBe('[image: diagram.png]');
        expect(losses[0].detail.name).toBe('diagram.png');
        expect(losses[0].detail.alt).toBe('');
    });

    test('both empty → `[image]`', () => {
        const ctx = makeCtx();
        const { items, losses } = renderImage.render({ kind: 'image', name: '', alt: '' }, ctx);
        expect(items[0].tokens.map((t) => t.text).join('')).toBe('[image]');
        expect(losses[0].detail).toEqual({
            index: '0', name: '', alt: '', reason: 'no-bytes', bytes: 0
        });
    });

    test('missing `name`/`alt` on the node degrade to the empty string, never throw', () => {
        const { items } = renderImage.render({ kind: 'image' }, makeCtx());
        expect(items[0].tokens.map((t) => t.text).join('')).toBe('[image]');
    });

    test('long alt text still wraps into ≥ 2 lines, one item each, one leading step apart', () => {
        const ctx = makeCtx();
        const longAlt = 'word '.repeat(60).trim();
        const { items } = renderImage.render({ kind: 'image', name: 'a.png', alt: longAlt }, ctx);
        expect(items.length).toBeGreaterThanOrEqual(2);
        const leading = LAYOUT.leading(LAYOUT.baseSize);
        for (let n = 0; n < items.length; n += 1) {
            expect(items[n].y).toBeCloseTo((n + 1) * leading, 6);
        }
    });

    test('`height` on the refusal path is one line + the fixed 6 pt trailing space', () => {
        const { height } = renderImage.render({ kind: 'image', name: 'a.png', alt: 'A' }, makeCtx());
        expect(height).toBeCloseTo(LAYOUT.leading(LAYOUT.baseSize) + 6, 6);
    });

    test('never the retired `layout/image-unrendered` stub code', () => {
        const { losses } = renderImage.render({ kind: 'image', name: 'a.png', alt: 'A' }, makeCtx());
        expect(losses.map((l) => l.code)).not.toContain('layout/image-unrendered');
    });
});

describe('render — the stack accounting invariant (D-E: a delegated kind is always drawable)', () => {
    /**
     * Flow one document through the real stack with this renderer wired in.
     *
     * @param {object} ir
     * @param {object} [assets]
     * @returns {object}
     */
    function layout(ir, assets) {
        const losses = [];
        const sink = [];
        const ctx = {
            measurer, layout: LAYOUT, column: LAYOUT.column,
            sizeFor: LAYOUT.sizeFor, leading: LAYOUT.leading, linebreak, losses,
            index: null, assets,
            imageCounter: { n: 0 },
            builder: { addImage(spec) { sink.push(spec); return this; } },
            render: (node, childCtx) => renderImage.render(
                node, { ...childCtx, flowChildren: makeFlowChildren(childCtx) }
            )
        };
        const laid = stack.layoutDocument(ir, ctx);
        return { ...laid, sink };
    }

    test('a refused image is accounted for by its loss', () => {
        const laid = layout({ kind: 'document', children: [{ kind: 'image', name: 'a.png', alt: 'A' }] });
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
        expect(laid.pages[0].items.length).toBeGreaterThan(0);
    });

    test('a PLACED image is accounted for by its item — no loss is needed', () => {
        const laid = layout(
            { kind: 'document', children: [{ kind: 'image', name: 'a.jpg', alt: '' }] },
            { 'a.jpg': JPEG }
        );
        expect(laid.losses).toEqual([]);
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
        expect(laid.pages[0].items[0].xobject).toEqual({ name: 'Im0', w: 1, h: 1 });
    });

    // MEASURED: the renderer does NOT invent a vertical-fit rule. An image
    // taller than a whole page is handed to the stacker as an oversized
    // block, and the stacker's OWN rule fires — a clean page, then the item
    // falls below the bottom margin and is clipped. The loss code is
    // `layout/block-clipped`, the one that rule already produces.
    test('an image that cannot fit records the stack\'s existing oversize code, `layout/block-clipped`', () => {
        const tall = jpegOf(1, 5000);
        const laid = layout(
            { kind: 'document', children: [{ kind: 'image', name: 't.jpg', alt: '' }] },
            { 't.jpg': tall }
        );
        expect(laid.losses.map((l) => l.code)).toEqual(['layout/block-clipped']);
        expect(laid.losses[0]).toMatchObject({
            index: '0', kind: 'image', clippedLines: 1
        });
        expect(stack.unaccounted(laid.blocks, laid.pages, laid.losses)).toEqual([]);
        // The XObject was queued but nothing drew it — the facade only
        // registers the names a page's items actually reference.
        expect(laid.sink.map((s) => s.name)).toEqual(['Im0']);
        expect(laid.pages.flatMap((p) => p.items).some((i) => i.xobject)).toBe(false);
    });
});

describe('the delivered facade — end to end through `oconvIrToPdf`', () => {
    const irToPdf = runtime.resolve('oconvIrToPdf');
    const pdfApi = runtime.resolve('pdf');

    /**
     * `/Resources /XObject` of one page of a written document.
     *
     * @param {object} doc `pdf.read` result.
     * @param {number} pageIndex
     * @returns {object|null}
     */
    function xobjectsOf(doc, pageIndex) {
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const res = deref(doc.pages[pageIndex].resources);
        const x = res.entries.XObject;
        return x ? deref(x) : null;
    }

    /**
     * The whole file as latin-1 text — the idiom `ir-to-pdf.test.js`
     * already uses to assert on emitted operators.
     *
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    test('a block `image` with JPEG bytes: /XObject names the resource, the stream draws it, NO loss', () => {
        const ir = { kind: 'document', children: [{ kind: 'image', name: 'p.jpg', alt: 'Photo' }] };
        const written = irToPdf.irToPdf(ir, undefined, { assets: { 'p.jpg': JPEG } });

        expect(written.losses).toEqual([]);
        const doc = pdfApi.read(written.bytes);
        const xo = xobjectsOf(doc, 0);
        expect(xo).not.toBeNull();
        expect(Object.keys(xo.entries)).toEqual(['Im0']);
        expect(latin1(written.bytes)).toContain('/Im0 Do Q');
    });

    test('the same block WITHOUT assets: no /XObject at all, and the honest `no-bytes` loss', () => {
        const ir = { kind: 'document', children: [{ kind: 'image', name: 'p.jpg', alt: 'Photo' }] };
        const written = irToPdf.irToPdf(ir);

        const imageLosses = written.losses.filter((l) => l.code === 'layout/image-dropped');
        expect(imageLosses).toHaveLength(1);
        expect(imageLosses[0].detail).toEqual({
            index: '0', name: 'p.jpg', alt: 'Photo', reason: 'no-bytes', bytes: 0
        });
        expect(xobjectsOf(pdfApi.read(written.bytes), 0)).toBeNull();
        expect(latin1(written.bytes)).toMatch(/\/FI [\d.]+ Tf [^(]*\(\[image: Photo\]\)/);
    });

    test('md-degrade.md through `fromMd`: the INLINE image now reaches the renderer (BL-980 closes the silent drop)', async () => {
        const markdown = new TextDecoder().decode(await corpusBytes('md/md-degrade.md'));
        const oconvApi = runtime.resolve('oconv');

        const bare = await oconvApi.fromMd({ markdown, target: 'pdf' });
        const dropped = bare.losses.filter((l) => l.code === 'layout/image-dropped');
        expect(dropped).toHaveLength(1);
        expect(dropped[0].detail.reason).toBe('no-bytes');
        expect(latin1(bare.bytes)).toContain('[image: Diagram]');

        const placed = await oconvApi.fromMd({
            markdown, target: 'pdf', assets: { 'diagram.png': JPEG }
        });
        expect(placed.losses.some((l) => l.code === 'layout/image-dropped')).toBe(false);
        expect(latin1(placed.bytes)).toContain('/Im0 Do Q');
    });

    test('an RGBA PNG through the facade: placed with its /SMask, no loss (the facade hands zlib to the renderer)', () => {
        const png = pngOf({ width: 2, height: 1, colorType: 6, rows: [[1, 2, 3, 0, 4, 5, 6, 255]] });
        const ir = { kind: 'document', children: [{ kind: 'image', name: 'a.png', alt: 'A' }] };
        const written = irToPdf.irToPdf(ir, undefined, { assets: { 'a.png': png } });

        expect(written.losses).toEqual([]);
        const doc = pdfApi.read(written.bytes);
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const image = deref(xobjectsOf(doc, 0).entries.Im0);
        expect(image.dict.entries.SMask).toBeDefined();
        const mask = deref(image.dict.entries.SMask);
        expect(mask.dict.entries.ColorSpace.value).toBe('DeviceGray');
        expect(latin1(written.bytes)).toContain('/Im0 Do Q');
    });
});

describe('PNG placement — oracle: @awacloud/pdf decodes the written streams back to the samples', () => {
    const irToPdf = runtime.resolve('oconvIrToPdf');
    const pdfApi = runtime.resolve('pdf');
    const filters = runtime.resolve('pdfFilterDispatch');

    /** Im0 (and its /SMask) of page 0 of a written PDF, decoded by pdf's own filters. */
    function decodedIm0(bytes) {
        const doc = pdfApi.read(bytes);
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const res = deref(doc.pages[0].resources);
        const image = deref(deref(res.entries.XObject).entries.Im0);
        const mask = image.dict.entries.SMask ? deref(image.dict.entries.SMask) : null;
        return { samples: [...filters.decode(image)], mask: mask ? [...filters.decode(mask)] : null };
    }

    const write = (png) => irToPdf.irToPdf(
        { kind: 'document', children: [{ kind: 'image', name: 'p.png', alt: '' }] },
        undefined, { assets: { 'p.png': png } });

    test('RGB, every filter type, predictor route: the decoded stream is the raw samples', () => {
        const rows = [
            [200, 10, 10, 10, 200, 10, 10, 10, 200],
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            [9, 8, 7, 6, 5, 4, 3, 2, 1],
            [50, 60, 70, 80, 90, 100, 110, 120, 130],
            [0, 255, 0, 255, 0, 255, 0, 255, 0]
        ];
        const written = write(pngOf({ width: 3, height: 5, colorType: 2, rows, filters: [0, 1, 2, 3, 4] }));
        expect(written.losses).toEqual([]);
        const { samples, mask } = decodedIm0(written.bytes);
        expect(samples).toEqual(rows.flat());
        expect(mask).toBeNull();
    });

    test('RGBA, decoded route: the colour stream and the /SMask decode to the split samples', () => {
        const rows = [[10, 20, 30, 40, 50, 60, 70, 80], [90, 100, 110, 120, 130, 140, 150, 0]];
        const written = write(pngOf({ width: 2, height: 2, colorType: 6, rows, filters: [4, 3] }));
        expect(written.losses).toEqual([]);
        const { samples, mask } = decodedIm0(written.bytes);
        expect(samples).toEqual([10, 20, 30, 50, 60, 70, 90, 100, 110, 130, 140, 150]);
        expect(mask).toEqual([40, 80, 120, 0]);
    });
});

describe('oconvIrToPdf — `zlib` is an OPTIONAL dependency, after the first 14', () => {
    test('declared right after the 14 dependencies a hand-wired call already passes (then `standard14Lookup`, last)', () => {
        const descriptor = oconvIrToPdfDescriptor;
        expect(descriptor.dependencies[14]).toBe('zlib');
        expect(descriptor.dependencies.at(-1)).toBe('standard14Lookup');
        expect(descriptor.dependencies).toHaveLength(16);
        expect(descriptor.deps).toHaveLength(16);
    });

    test('a hand-wired factory without it still writes, refusing an alpha PNG exactly as before', () => {
        const args = oconvIrToPdfDescriptor.dependencies.slice(0, 14).map((name) => runtime.resolve(name));
        const handWired = oconvIrToPdfDescriptor.factory(...args);
        const png = pngOf({ width: 1, height: 1, colorType: 6, rows: [[1, 2, 3, 4]] });
        const ir = { kind: 'document', children: [{ kind: 'image', name: 'a.png', alt: 'A' }] };

        const without = handWired.irToPdf(ir, undefined, { assets: { 'a.png': png } });
        expect(without.losses.map((l) => [l.code, l.detail.reason, l.detail.format]))
            .toEqual([['layout/image-dropped', 'unsupported-encoding', 'png']]);

        const withZlib = oconvIrToPdfDescriptor.factory(...args, runtime.resolve('zlib'));
        expect(withZlib.irToPdf(ir, undefined, { assets: { 'a.png': png } }).losses).toEqual([]);
    });
});
