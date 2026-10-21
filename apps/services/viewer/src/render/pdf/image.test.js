// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF image decoding against a stand-in canvas (Happy-DOM has
 * none): sample expansion, the memory guard that subsamples huge images,
 * and time slicing (the event loop keeps turning while a big image or a
 * heavy page is processed).
 *
 * @module viewer/render/pdf/image.test
 */
import '../../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createImageCache, decodeImage } from './image.js';
import { paintOps } from './paint.js';

/** @type {Record<string, any>} */
const saved = {};
/** The last `putImageData` payload. */
let put = /** @type {{data: Uint8ClampedArray, width: number, height: number}|null} */ (null);

beforeAll(() => {
    for (const k of ['OffscreenCanvas', 'ImageData', 'Path2D']) saved[k] = /** @type {any} */ (globalThis)[k];
    /** @type {any} */ (globalThis).ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
    /** @type {any} */ (globalThis).OffscreenCanvas = class {
        constructor(w, h) { this.width = w; this.height = h; }
        getContext() { return { putImageData: (d) => { put = d; } }; }
    };
    /** @type {any} */ (globalThis).Path2D = class { moveTo() {} lineTo() {} rect() {} closePath() {} bezierCurveTo() {} };
});
afterAll(() => { for (const [k, v] of Object.entries(saved)) /** @type {any} */ (globalThis)[k] = v; });

const int = (value) => ({ type: 'int', value });
const nm = (value) => ({ type: 'name', value });
/** An image env over raw (unfiltered) samples. */
const env = (omitted = []) => ({
    resolve: (r) => r, resources: null, omit: (c) => omitted.push(c),
    filters: { decode: () => new Uint8Array(0), decodeChain: (b) => b }
});
/** A gray 8-bit inline-style image whose sample is `x & 255`. */
function grayRamp(w, h) {
    const data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = x & 255;
    return { dict: { Width: int(w), Height: int(h), ColorSpace: nm('DeviceGray'), BitsPerComponent: int(8) }, data, stream: null };
}

describe('image decoding', () => {
    test('a small image keeps every sample', async () => {
        const d = await decodeImage(grayRamp(4, 2), env());
        expect([d?.width, d?.height]).toEqual([4, 2]);
        expect([...(put?.data.subarray(0, 8) || [])]).toEqual([0, 0, 0, 255, 1, 1, 1, 255]);
    });
    test('a huge image is subsampled to at most 16 Mpx, picking real samples', async () => {
        const d = await decodeImage(grayRamp(6000, 3000), env());
        // 18 Mpx > 16.8 Mpx: every 2nd sample in both directions.
        expect([d?.width, d?.height]).toEqual([3000, 1500]);
        const px = /** @type {Uint8ClampedArray} */ (put?.data);
        expect(px[1 * 4]).toBe(2);          // kept pixel 1 is source pixel 2
        expect(px[100 * 4]).toBe(200);
    });
    test('the event loop turns while a big image expands', async () => {
        const img = grayRamp(4000, 4000);
        // A Decode array forces the general (slow) path.
        img.dict.Decode = /** @type {any} */ ({ type: 'array', items: [int(1), int(0)] });
        let settled = false;
        let ticksWhilePending = 0;
        const timer = setInterval(() => { if (!settled) ticksWhilePending++; }, 1);
        const d = await decodeImage(img, env());
        settled = true;
        clearInterval(timer);
        expect(d?.width).toBe(4000);
        expect(ticksWhilePending).toBeGreaterThan(0);
    });
});

describe('painter slicing', () => {
    test('the event loop turns while a heavy page paints', async () => {
        const noop = () => {};
        const g = /** @type {any} */ ({
            setTransform: noop, save: noop, restore: noop, fill: noop, stroke: noop, clip: noop, setLineDash: noop
        });
        const ops = [];
        for (let i = 0; i < 600_000; i++) ops.push({ op: 'm', args: [int(0), int(0)] }, { op: 'l', args: [int(1), int(1)] }, { op: 'S', args: [] });
        let settled = false;
        let ticksWhilePending = 0;
        const timer = setInterval(() => { if (!settled) ticksWhilePending++; }, 1);
        await paintOps({
            g, base: [1, 0, 0, 1, 0, 0], ops, resources: null, textSink: noop,
            doc: { resolve: (r) => r, eng: /** @type {any} */ ({}), fonts: new Map(), images: new Map(), hiddenOcgs: new Set(), omit: noop }
        });
        settled = true;
        clearInterval(timer);
        expect(ticksWhilePending).toBeGreaterThan(0);
    });
});

describe('image cache', () => {
    test('keeps at most its pixel budget, least recently drawn dropped first', async () => {
        const cache = createImageCache(250);
        const img = (w) => Promise.resolve(/** @type {any} */ ({ source: { close() {} }, width: w, height: 10, stencil: false }));
        cache.set('a', img(10));   // 100 px
        cache.set('b', img(10));   // 200 px
        await Promise.resolve();
        cache.get('a');            // a is now the most recent
        cache.set('c', img(10));   // 300 px > 250: b goes
        await new Promise((r) => setTimeout(r, 0));
        expect(cache.get('b')).toBe(undefined);
        expect(cache.get('a')).not.toBe(undefined);
        expect(cache.get('c')).not.toBe(undefined);
        expect(cache.size).toBe(2);
    });
});

describe('image smoothing', () => {
    /** Draw one inline 2 × 2 image enlarged to 200 × 200 device px; the smoothing state at drawImage. */
    async function smoothing(dict) {
        const noop = () => {};
        const seen = [];
        const g = /** @type {any} */ ({
            setTransform: noop, save: noop, restore: noop, transform: noop, imageSmoothingQuality: 'low', imageSmoothingEnabled: true,
            drawImage() { seen.push([g.imageSmoothingEnabled, g.imageSmoothingQuality]); }
        });
        const entries = { W: int(2), H: int(2), CS: nm('RGB'), BPC: int(8), ...dict };
        await paintOps({
            g, base: [1, 0, 0, 1, 0, 0], resources: null, textSink: noop,
            ops: [{ op: 'cm', args: [int(200), int(0), int(0), int(200), int(0), int(0)] }, { op: 'BI', args: [{ type: 'dict', entries }], data: new Uint8Array(12) }],
            doc: { resolve: (r) => r, eng: /** @type {any} */ ({ filters: env().filters }), fonts: new Map(), images: new Map(), hiddenOcgs: new Set(), omit: noop }
        });
        return seen[0];
    }
    test('an enlarged image stays crisp, unless the file asks for interpolation', async () => {
        expect(await smoothing({})).toEqual([false, 'high']);
        expect(await smoothing({ I: { type: 'bool', value: true } })).toEqual([true, 'high']);
    });
});

describe('the image fixture (tests/fixtures/images.pdf)', () => {
    test('every image case of every page is drawn, nothing omitted', async () => {
        const { renderContext, fixture } = await import('../../../tests/context.js');
        const { renderPdf } = await import('./pdf.js');
        const proto = /** @type {any} */ (globalThis.HTMLCanvasElement).prototype;
        const original = proto.getContext;
        const savedBitmap = /** @type {any} */ (globalThis).createImageBitmap;
        let images = 0;
        const noop = () => {};
        proto.getContext = function getContext() {
            return {
                fillRect: noop, setTransform: noop, transform: noop, scale: noop, clip: noop, save: noop, restore: noop, fill: noop, stroke: noop,
                setLineDash: noop, fillText: noop, strokeText: noop, measureText: (t) => ({ width: 5 * t.length }),
                drawImage() { images++; }, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: noop
            };
        };
        // Offscreen canvases compose images (masks, tints): their draws are not page draws.
        /** @type {any} */ (globalThis).OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { ...proto.getContext(), drawImage: noop }; } };
        /** @type {any} */ (globalThis).createImageBitmap = async () => ({ width: 64, height: 48, close() {} });
        try {
            const view = await renderPdf(fixture('images.pdf'), renderContext());
            expect(view.pages?.length).toBe(3);
            const perPage = [];
            for (const p of view.pages || []) {
                const host = document.createElement('div');
                host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
                const before = images;
                await p.draw(host, 1);
                perPage.push(images - before);
            }
            expect(perPage).toEqual([9, 9, 9]);
            expect(view.omissions).toEqual([]);
            view.dispose();
        } finally {
            proto.getContext = original;
            /** @type {any} */ (globalThis).createImageBitmap = savedBitmap;
        }
    });
});
