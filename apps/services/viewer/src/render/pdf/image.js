// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF images (§8.9) to something a canvas can draw.
 *
 * - JPEG (`DCTDecode`) goes to the browser's decoder (`createImageBitmap`);
 * - sample data (after Flate / LZW / CCITT / RunLength…, decoded by
 *   `@awacloud/pdf`'s filter dispatch) is expanded to RGBA here: any bit
 *   depth, any colour space `colour.js` knows, `/Decode` arrays, colour-key
 *   masks, soft masks and explicit masks;
 * - stencil masks (`/ImageMask true`) become an alpha-only canvas the
 *   painter tints with the current fill colour;
 * - JPEG 2000 and JBIG2 have no decoder in the repo: `null`, and the painter
 *   records the omission.
 *
 * @module viewer/render/pdf/image
 */
import { colourSpace, DEVICE_GRAY } from './colour.js';
import { arr, bool, deref, entries, name, num, nums } from './objects.js';
import { breathe, clock } from '../clock.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */

/** Inline-image abbreviations (§8.9.7, Table 91). */
const INLINE_KEYS = Object.freeze({
    W: 'Width', H: 'Height', BPC: 'BitsPerComponent', CS: 'ColorSpace', F: 'Filter',
    DP: 'DecodeParms', IM: 'ImageMask', D: 'Decode', I: 'Interpolate'
});
const FILTER_ABBREV = Object.freeze({
    AHx: 'ASCIIHexDecode', A85: 'ASCII85Decode', LZW: 'LZWDecode', Fl: 'FlateDecode',
    RL: 'RunLengthDecode', CCF: 'CCITTFaxDecode', DCT: 'DCTDecode'
});
/** Images above this many pixels are not expanded (memory guard on the decoded samples). */
const MAX_PIXELS = 40e6;
/**
 * Pixels a decoded image keeps, at most (64 MB RGBA): a larger one is
 * subsampled — no page canvas is bigger (`pdf.js` MAX_CANVAS_PIXELS).
 */
const MAX_OUT_PIXELS = 16_777_216;
/** Longest stretch of pixel expansion before the event loop gets a turn (ms). */
const SLICE_MS = 40;

/**
 * @typedef {{source: CanvasImageSource, width: number, height: number, stencil: boolean, interpolate?: boolean}} Drawable
 *   `interpolate`: the file asks for smoothing when enlarged (`/Interpolate true`)
 * @typedef {{resolve: import('./objects.js').Resolve, resources: Record<string, any>|null,
 *   filters: {decode: (s: PdfObj) => Uint8Array, decodeChain: (b: Uint8Array, f: string[], p: any[]|null) => Uint8Array},
 *   omit: (code: string) => void}} ImageEnv
 */

/** Decoded pixels a document keeps cached across its pages (256 MB RGBA). */
const CACHE_PIXELS = 64e6;

/**
 * The document's decoded-image cache: an image shared by many pages (a
 * logo) is decoded once, but the cache holds at most `maxPixels` decoded
 * pixels, least recently drawn dropped first — a 200-page scan keeps a
 * few pages' images, not all of them. Dropped images are left to the
 * garbage collector (one may still be drawing); `dispose` closes the rest.
 * @param {number} [maxPixels]
 */
export function createImageCache(maxPixels = CACHE_PIXELS) {
    /** @type {Map<string, {pending: Promise<Drawable|null>, pixels: number}>} */
    const map = new Map();
    let total = 0;
    return {
        /** @param {string} key */
        get(key) {
            const entry = map.get(key);
            if (!entry) return undefined;
            map.delete(key);
            map.set(key, entry);
            return entry.pending;
        },
        /** @param {string} key @param {Promise<Drawable|null>} pending */
        set(key, pending) {
            const entry = { pending, pixels: 0 };
            map.set(key, entry);
            pending.then((d) => {
                if (!d || map.get(key) !== entry) return;
                entry.pixels = d.width * d.height;
                total += entry.pixels;
                for (const [k, e] of map) {
                    if (total <= maxPixels || e === entry) break;
                    map.delete(k);
                    total -= e.pixels;
                }
            }, () => {});
        },
        get size() { return map.size; },
        /** Close what is still cached (decoded JPEGs hold GPU memory until closed). */
        dispose() {
            for (const { pending } of map.values()) {
                pending.then((d) => { if (d && typeof (/** @type {any} */ (d.source)).close === 'function') /** @type {any} */ (d.source).close(); }).catch(() => {});
            }
            map.clear();
            total = 0;
        }
    };
}

/**
 * A canvas of the given size: `OffscreenCanvas` where available.
 * @param {number} w
 * @param {number} h
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
export function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

/**
 * Expand an inline image's abbreviated dictionary to full keys.
 * @param {Record<string, PdfObj>} dict
 * @returns {Record<string, PdfObj>}
 */
export function expandInlineDict(dict) {
    /** @type {Record<string, PdfObj>} */
    const out = {};
    for (const [k, v] of Object.entries(dict)) {
        const key = INLINE_KEYS[/** @type {keyof typeof INLINE_KEYS} */ (k)] || k;
        if (key === 'Filter') {
            const expand = (n) => ({ type: 'name', value: FILTER_ABBREV[/** @type {keyof typeof FILTER_ABBREV} */ (n.value)] || n.value });
            out.Filter = v.type === 'array' ? { type: 'array', items: (v.items || []).map(expand) } : expand(v);
        } else {
            out[key] = v;
        }
    }
    return out;
}

/** The filter names of an image dictionary, in order. */
function filterNames(e, resolve) {
    const f = deref(e.Filter, resolve);
    if (!f) return [];
    if (f.type === 'name') return [String(f.value)];
    return (arr(f, resolve) || []).map((x) => name(x) || '');
}

/** The `/DecodeParms` of each filter as plain objects (what the decoders expect). */
function decodeParms(e, resolve, count) {
    const p = deref(e.DecodeParms, resolve);
    const plain = (d) => {
        const ent = entries(d);
        if (!ent) return null;
        /** @type {Record<string, any>} */
        const o = {};
        for (const [k, v] of Object.entries(ent)) o[k] = deref(v, resolve)?.value;
        return o;
    };
    if (!p) return null;
    if (p.type === 'array') return (arr(p, resolve) || []).map(plain);
    const list = new Array(count).fill(null);
    list[0] = plain(p);
    return list;
}

/**
 * The image's sample bytes after every non-image filter, and the image
 * codec left to apply (`DCTDecode`, `JPXDecode`, `JBIG2Decode`) if any.
 * @param {{dict: Record<string, PdfObj>, data: Uint8Array, stream: PdfObj|null}} img
 * @param {ImageEnv} env
 */
function sampleBytes(img, env) {
    const names = filterNames(img.dict, env.resolve);
    const last = names[names.length - 1];
    const codec = last === 'DCTDecode' || last === 'JPXDecode' || last === 'JBIG2Decode' ? last : null;
    const chain = codec ? names.slice(0, -1) : names;
    const parms = decodeParms(img.dict, env.resolve, names.length);
    // Streams go through the dispatch (DCT / JPX are passthrough there).
    const bytes = img.stream && !codec
        ? env.filters.decode(img.stream)
        : env.filters.decodeChain(img.data, chain, parms ? parms.slice(0, chain.length) : null);
    return { bytes, codec };
}

/**
 * Read one sample row-major: `bpc` bits at bit offset `bit`.
 * @param {Uint8Array} data
 * @param {number} bit
 * @param {number} bpc
 */
function readBits(data, bit, bpc) {
    if (bpc === 8) return data[bit >> 3] ?? 0;
    if (bpc === 16) return data[bit >> 3] ?? 0; // high byte: 8-bit precision is enough on screen
    const byte = data[bit >> 3] ?? 0;
    return (byte >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1);
}

/**
 * Expand a sampled gray mask (SMask or explicit /Mask) to `w × h` alpha.
 * @param {PdfObj} maskStream
 * @param {number} w
 * @param {number} h
 * @param {boolean} stencil true for an explicit /Mask (1 = masked out)
 * @param {ImageEnv} env
 * @returns {Uint8Array|null}
 */
function maskAlpha(maskStream, w, h, stencil, env) {
    const e = entries(maskStream);
    if (!e) return null;
    const mw = num(deref(e.Width, env.resolve)) || 0;
    const mh = num(deref(e.Height, env.resolve)) || 0;
    const bpc = stencil ? 1 : (num(deref(e.BitsPerComponent, env.resolve)) || 8);
    if (!mw || !mh) return null;
    let data;
    try {
        const s = sampleBytes({ dict: e, data: maskStream.raw || new Uint8Array(0), stream: maskStream }, env);
        if (s.codec) return null;
        data = s.bytes;
    } catch { return null; }
    const decode = nums(deref(e.Decode, env.resolve), env.resolve);
    const invert = decode ? decode[0] > decode[1] : false;
    const max = bpc === 16 ? 255 : (1 << bpc) - 1;
    const rowBits = Math.ceil((mw * bpc) / 8) * 8;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const my = Math.min(mh - 1, Math.floor((y * mh) / h));
        for (let x = 0; x < w; x++) {
            const mx = Math.min(mw - 1, Math.floor((x * mw) / w));
            let v = readBits(data, my * rowBits + mx * bpc, bpc) / max;
            if (invert) v = 1 - v;
            // Explicit mask: sample 1 (after /Decode) is masked out.
            out[y * w + x] = stencil ? (v >= 0.5 ? 0 : 255) : Math.round(v * 255);
        }
    }
    return out;
}

/**
 * Decode one image into a drawable.
 *
 * @param {{dict: Record<string, PdfObj>, data: Uint8Array, stream: PdfObj|null}} img
 *   `stream` for an XObject (its `raw` is the encoded data), `null` for an inline image.
 * @param {ImageEnv} env
 * @returns {Promise<Drawable|null>}
 */
export async function decodeImage(img, env) {
    const { resolve } = env;
    const e = img.dict;
    const width = num(deref(e.Width, resolve)) || 0;
    const height = num(deref(e.Height, resolve)) || 0;
    if (width <= 0 || height <= 0) return null;
    if (width * height > MAX_PIXELS) { env.omit('pdf/image-undecodable'); return null; }
    const stencil = bool(deref(e.ImageMask, resolve)) === true;
    const interpolate = bool(deref(e.Interpolate, resolve)) === true;

    let sampled;
    try { sampled = sampleBytes(img, env); } catch { env.omit('pdf/image-undecodable'); return null; }
    if (sampled.codec === 'JPXDecode') { env.omit('pdf/image-jpx'); return null; }
    if (sampled.codec === 'JBIG2Decode') { env.omit('pdf/image-undecodable'); return null; }

    // The size kept: every `step`-th sample of a huge image.
    const step = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_OUT_PIXELS)));
    const ow = Math.ceil(width / step);
    const oh = Math.ceil(height / step);

    const smaskObj = deref(e.SMask, resolve);
    const maskObj = deref(e.Mask, resolve);
    const smask = smaskObj && smaskObj.type === 'stream' ? maskAlpha(smaskObj, ow, oh, false, env) : null;
    const explicit = maskObj && maskObj.type === 'stream' ? maskAlpha(maskObj, ow, oh, true, env) : null;
    const alphaPlane = smask || explicit;

    if (sampled.codec === 'DCTDecode') {
        let bitmap;
        try {
            const blob = new Blob([sampled.bytes], { type: 'image/jpeg' });
            bitmap = await createImageBitmap(blob, ...(step > 1 ? [{ resizeWidth: ow, resizeHeight: oh, resizeQuality: /** @type {ResizeQuality} */ ('medium') }] : []));
        } catch { env.omit('pdf/image-undecodable'); return null; }
        // An inverting /Decode ([1 0] per component) on a grey or RGB JPEG.
        // CMYK is left alone: browsers decode CMYK JPEGs as Adobe-inverted
        // already, which is what an inverting /Decode asks for.
        const dec = nums(deref(e.Decode, resolve), resolve);
        const invert = !!dec && dec.length >= 2 && dec.length <= 6 && dec[0] > dec[1];
        if (!alphaPlane && !invert) return { source: bitmap, width: bitmap.width, height: bitmap.height, stencil: false, interpolate };
        // Combine the JPEG with its mask (or invert it) at the kept size.
        const c = makeCanvas(ow, oh);
        const g = /** @type {CanvasRenderingContext2D|null} */ (c.getContext('2d'));
        if (!g) return { source: bitmap, width: bitmap.width, height: bitmap.height, stencil: false, interpolate };
        g.drawImage(bitmap, 0, 0, ow, oh);
        bitmap.close();
        const px = g.getImageData(0, 0, ow, oh);
        for (let i = 0; i < ow * oh; i++) {
            if (invert) { px.data[i * 4] = 255 - px.data[i * 4]; px.data[i * 4 + 1] = 255 - px.data[i * 4 + 1]; px.data[i * 4 + 2] = 255 - px.data[i * 4 + 2]; }
            if (alphaPlane) px.data[i * 4 + 3] = alphaPlane[i];
        }
        g.putImageData(px, 0, 0);
        return { source: c, width: ow, height: oh, stencil: false, interpolate };
    }

    const data = sampled.bytes;
    const bpc = stencil ? 1 : (num(deref(e.BitsPerComponent, resolve)) || 8);
    const cs = stencil ? DEVICE_GRAY : colourSpace(e.ColorSpace || null, {
        resolve, resources: env.resources, decodeStream: (s) => env.filters.decode(s)
    });
    if (cs.approx) env.omit('pdf/colorspace');
    const n = Math.max(1, cs.n);
    // 16-bit samples are read by their high byte (readBits).
    const max = bpc === 16 ? 255 : (1 << bpc) - 1;
    const decode = nums(deref(e.Decode, resolve), resolve) || (stencil ? [0, 1] : cs.decodeDefault(bpc));
    const rowBits = Math.ceil((width * n * bpc) / 8) * 8;
    const colourKey = maskObj && maskObj.type === 'array' ? nums(maskObj, resolve) : null;
    const out = new Uint8ClampedArray(ow * oh * 4);
    let slice = clock();
    /** Every 32 rows, give the event loop a turn when the slice is spent. */
    const pace = async (y) => {
        if ((y & 31) === 0 && clock() - slice > SLICE_MS) { await breathe(); slice = clock(); }
    };

    if (stencil) {
        // Alpha-only: sample 0 (after /Decode) paints.
        const paintOn = decode[0] > decode[1] ? 1 : 0;
        for (let y = 0; y < oh; y++) {
            await pace(y);
            const row = y * step * rowBits;
            for (let x = 0; x < ow; x++) {
                const v = readBits(data, row + x * step, 1);
                out[(y * ow + x) * 4 + 3] = v === paintOn ? 255 : 0;
            }
        }
    } else {
        // Precompute a palette when the space has one input of ≤ 8 bits.
        const palette = n === 1 && bpc <= 8 ? new Uint8ClampedArray((max + 1) * 3) : null;
        // An Indexed /Decode maps onto table indices, not 0..1.
        if (palette) {
            for (let v = 0; v <= max; v++) {
                const c = (decode[0] ?? 0) + (v * ((decode[1] ?? max) - (decode[0] ?? 0))) / max;
                const rgb = cs.toRgb([c]);
                palette[v * 3] = rgb[0] * 255; palette[v * 3 + 1] = rgb[1] * 255; palette[v * 3 + 2] = rgb[2] * 255;
            }
        }
        const fastRgb = cs.kind === 'DeviceRGB' && bpc === 8 && decode.every((d, i) => d === (i % 2 ? 1 : 0));
        const comps = new Array(n).fill(0);
        const raw = new Array(n).fill(0);
        // Bits from one kept pixel to the next along a row.
        const pixelBits = n * bpc * step;
        for (let y = 0; y < oh; y++) {
            await pace(y);
            let bit = y * step * rowBits;
            for (let x = 0; x < ow; x++) {
                const o = (y * ow + x) * 4;
                if (fastRgb) {
                    const b = bit >> 3;
                    out[o] = data[b] ?? 0; out[o + 1] = data[b + 1] ?? 0; out[o + 2] = data[b + 2] ?? 0;
                    raw[0] = out[o]; raw[1] = out[o + 1]; raw[2] = out[o + 2];
                } else if (palette) {
                    const v = readBits(data, bit, bpc);
                    raw[0] = v;
                    out[o] = palette[v * 3]; out[o + 1] = palette[v * 3 + 1]; out[o + 2] = palette[v * 3 + 2];
                } else {
                    for (let k = 0; k < n; k++) {
                        const v = readBits(data, bit + k * bpc, bpc);
                        raw[k] = v;
                        comps[k] = (decode[2 * k] ?? 0) + (v * ((decode[2 * k + 1] ?? 1) - (decode[2 * k] ?? 0))) / max;
                    }
                    const rgb = cs.toRgb(comps);
                    out[o] = rgb[0] * 255; out[o + 1] = rgb[1] * 255; out[o + 2] = rgb[2] * 255;
                }
                bit += pixelBits;
                let alpha = 255;
                if (colourKey) {
                    let inside = true;
                    for (let k = 0; k < n && inside; k++) inside = raw[k] >= (colourKey[2 * k] ?? 0) && raw[k] <= (colourKey[2 * k + 1] ?? -1);
                    if (inside) alpha = 0;
                }
                out[o + 3] = alphaPlane ? Math.min(alpha, alphaPlane[y * ow + x]) : alpha;
            }
        }
    }

    const c = makeCanvas(ow, oh);
    const g = /** @type {CanvasRenderingContext2D|null} */ (c.getContext('2d'));
    if (!g || typeof ImageData !== 'function') { env.omit('pdf/image-undecodable'); return null; }
    g.putImageData(new ImageData(out, ow, oh), 0, 0);
    return { source: c, width: ow, height: oh, stencil, interpolate };
}
