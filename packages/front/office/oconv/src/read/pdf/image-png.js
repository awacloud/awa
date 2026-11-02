// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A raw-pixel pdf picture written as a PNG, for the pdf
 * reader's opt-in pictures (`oconvPdfTextExtract`'s `opts.images`).
 *
 * `encodePng(spec)` writes a PNG (ISO/IEC 15948) from rows packed as PNG
 * packs them: the signature, `IHDR`, `iCCP` when a profile is given, `PLTE`
 * for a palette picture, one `IDAT` — the zlib stream (fw `zlib`) of the
 * rows, each led by filter byte 0 — and `IEND`, each chunk with its CRC-32
 * (fw `crc32`).
 *
 * `imageToPng(xo, resolve)` reads an image XObject's samples through
 * `pdfFilterDispatch` (no filter, Flate with or without a predictor, the
 * ASCII and run-length filters — never DCT or JPX, which pass through) and
 * writes them as a PNG, or returns `null`. It takes:
 *
 * - a colour space of **DeviceGray**, **DeviceRGB**, **ICCBased** with
 *   `/N` 1 or 3 (the profile carried in `iCCP`, the samples untouched — no
 *   colour conversion), or **Indexed** on one of those (hival ≤ 255, the
 *   lookup a string or a stream, a grey base replicated to RGB in `PLTE`);
 * - 1, 2, 4, 8 or 16 bits per component (Indexed 1–8);
 * - a `/Decode` that is the default, or every pair inverted (`1 0`; an
 *   Indexed picture's `2^bpc−1 0`, the index inverted);
 * - a decoded length of at least `height` rows; a picture whose samples or
 *   expanded pixels would pass 256 MiB is refused.
 *
 * Without alpha the samples go through as packed (grey 1–16 bits, RGB 8 /
 * 16, a palette 1–8); RGB at 1, 2 or 4 bits is widened to 8. An `/SMask`
 * that is a DeviceGray image stream of the same size, decodable to samples
 * and without `/Matte`, becomes the alpha channel; a colour-key `/Mask`
 * array makes the pixels whose raw samples all lie in its ranges
 * transparent. With alpha the picture is grey + alpha or RGBA (an Indexed
 * one expanded), 8-bit, 16-bit when the picture is. Any other mask leaves
 * the picture without alpha and sets `masked`.
 *
 * Composes ONLY documented public exports. Strict factory-only fw
 * descriptor, capture-free (`fw/no-factory-capture`), worker-safe.
 *
 * @module oconv/read/pdf/image-png
 */

import { pdfFilterDispatch } from '@awacloud/pdf';
import { zlib } from '@awacloud/fw/io/compress/zlib.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';

export const oconvPdfImagePng = {
    name: 'oconvPdfImagePng',
    dependencies: ['pdfFilterDispatch', 'zlib', 'crc32'],
    deps: [pdfFilterDispatch, zlib, crc32],

    factory(dispatchMod, zlibMod, Crc32) {
        // Capture-free: all helpers declared in the factory body.

        const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
        /** Samples per pixel and the bit depths PNG allows, per colour type. */
        const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
        const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        const MAX_BYTES = 256 * 1024 * 1024;
        const PASSTHROUGH = new Set(['DCTDecode', 'JPXDecode']);

        /** One chunk: length, type, data, CRC-32 of type and data. */
        function chunk(type, data) {
            const out = new Uint8Array(12 + data.length);
            const view = new DataView(out.buffer);
            view.setUint32(0, data.length);
            for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
            out.set(data, 8);
            const crc = new Crc32();
            crc.append(out.subarray(4, 8 + data.length));
            view.setUint32(8 + data.length, crc.get());
            return out;
        }

        /**
         * Write a PNG from packed rows.
         *
         * @param {{width: number, height: number, bitDepth: number, colorType: number,
         *   data: Uint8Array, palette?: Uint8Array, iccProfile?: Uint8Array}} spec
         *   `data` — the rows, each `ceil(width × channels × bitDepth / 8)`
         *   bytes; `palette` — RGB triplets (colour type 3, at most 256);
         *   `iccProfile` — the bytes carried in `iCCP`.
         * @returns {Uint8Array}
         * @throws {Error} `oconv: bad png`
         */
        function encodePng(spec) {
            const s = spec || {};
            const { width, height, bitDepth, colorType, data, palette, iccProfile } = s;
            const dim = (v) => Number.isSafeInteger(v) && v > 0 && v <= 0x7FFFFFFF;
            if (!dim(width) || !dim(height) || !Object.prototype.hasOwnProperty.call(CHANNELS, colorType)
                    || !DEPTHS[colorType].includes(bitDepth) || !(data instanceof Uint8Array)) {
                throw new Error('oconv: bad png');
            }
            const rowBytes = Math.ceil(width * CHANNELS[colorType] * bitDepth / 8);
            if (data.length < rowBytes * height) throw new Error('oconv: bad png');
            if (colorType === 3 && !(palette instanceof Uint8Array && palette.length >= 3
                    && palette.length % 3 === 0 && palette.length <= 768)) throw new Error('oconv: bad png');
            if (iccProfile !== undefined && !(iccProfile instanceof Uint8Array)) throw new Error('oconv: bad png');
            const rows = new Uint8Array((rowBytes + 1) * height);
            for (let y = 0; y < height; y++) rows.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
            const ihdr = new Uint8Array(13);
            const hv = new DataView(ihdr.buffer);
            hv.setUint32(0, width);
            hv.setUint32(4, height);
            ihdr[8] = bitDepth;
            ihdr[9] = colorType;
            const parts = [Uint8Array.from(SIGNATURE), chunk('IHDR', ihdr)];
            if (iccProfile) {
                const z = zlibMod.zlibSync(iccProfile);
                const name = 'ICC profile';
                const body = new Uint8Array(name.length + 2 + z.length);
                for (let i = 0; i < name.length; i++) body[i] = name.charCodeAt(i);
                body.set(z, name.length + 2);
                parts.push(chunk('iCCP', body));
            }
            if (colorType === 3) parts.push(chunk('PLTE', palette));
            parts.push(chunk('IDAT', zlibMod.zlibSync(rows)), chunk('IEND', new Uint8Array(0)));
            const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
            let at = 0;
            for (const p of parts) { out.set(p, at); at += p.length; }
            return out;
        }

        /**
         * Write image XObject `xo` as a PNG (module header).
         *
         * @param {object} xo An image XObject stream.
         * @param {(ref: object) => object} resolve Indirect-ref resolver.
         * @returns {{bytes: Uint8Array, masked: boolean} | null}
         */
        function imageToPng(xo, resolve) {
            const deref = (v) => {
                try { return v && v.type === 'ref' ? resolve(v) : v; } catch { return null; }
            };
            const intOf = (v) => { const d = deref(v); return d && d.type === 'int' ? d.value : NaN; };
            const nums = (v) => {
                const d = deref(v);
                if (!d || d.type !== 'array') return null;
                const out = d.items.map((it) => (it && (it.type === 'int' || it.type === 'real') ? it.value : NaN));
                return out.every(Number.isFinite) ? out : null;
            };

            /** A stream's samples, or `null` (a DCT / JPX stream is not samples). */
            function samplesOf(stream) {
                if (!stream || stream.type !== 'stream') return null;
                try {
                    const names = dispatchMod.normalizeFilterList(stream.dict.entries.Filter);
                    if (names.some((n) => PASSTHROUGH.has(n))) return null;
                    return dispatchMod.decode(stream);
                } catch {
                    return null;
                }
            }

            /** `{ kind: 'gray'|'rgb', icc? }`, `{ kind: 'indexed', base, hival, lookup }` or `null`. */
            function space(v, nested) {
                const cs = deref(v);
                if (cs && cs.type === 'name') {
                    if (cs.value === 'DeviceGray') return { kind: 'gray' };
                    if (cs.value === 'DeviceRGB') return { kind: 'rgb' };
                    return null;
                }
                if (!cs || cs.type !== 'array' || cs.items.length === 0) return null;
                const head = deref(cs.items[0]);
                const family = head && head.type === 'name' ? head.value : null;
                if (family === 'ICCBased' && cs.items.length >= 2) {
                    const stream = deref(cs.items[1]);
                    const n = stream && stream.type === 'stream' ? intOf(stream.dict.entries.N) : NaN;
                    const icc = samplesOf(stream);
                    if (!icc || (n !== 1 && n !== 3)) return null;
                    return { kind: n === 1 ? 'gray' : 'rgb', icc };
                }
                if (family === 'Indexed' && !nested && cs.items.length >= 4) {
                    const base = space(cs.items[1], true);
                    const hival = intOf(cs.items[2]);
                    const lk = deref(cs.items[3]);
                    const lookup = lk && lk.type === 'string' ? lk.value : samplesOf(lk);
                    const n = base && base.kind === 'rgb' ? 3 : 1;
                    if (!base || !(hival >= 0 && hival <= 255) || !lookup || lookup.length < (hival + 1) * n) return null;
                    return { kind: 'indexed', base, hival, lookup };
                }
                return null;
            }

            /** Raw sample `i` (in sample units) of row `row` of `data`. */
            function sampleAt(data, rowStart, i, bpc) {
                if (bpc === 8) return data[rowStart + i];
                if (bpc === 16) return (data[rowStart + 2 * i] << 8) | data[rowStart + 2 * i + 1];
                const bit = i * bpc;
                return (data[rowStart + (bit >> 3)] >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1);
            }

            if (!xo || xo.type !== 'stream') return null;
            const e = xo.dict.entries;
            const im = deref(e.ImageMask);
            if (im && im.value === true) return null;
            const width = intOf(e.Width);
            const height = intOf(e.Height);
            const bpc = intOf(e.BitsPerComponent);
            const cs = space(e.ColorSpace, false);
            if (!(width > 0 && height > 0) || !cs || ![1, 2, 4, 8, 16].includes(bpc)) return null;
            if (cs.kind === 'indexed' && bpc > 8) return null;
            const n = cs.kind === 'rgb' ? 3 : 1;
            const rowBytes = Math.ceil(width * n * bpc / 8);
            if (rowBytes * height > MAX_BYTES || width * height * 8 > MAX_BYTES) return null;
            const max = 2 ** bpc - 1;

            let invert = false;
            if (e.Decode !== undefined) {
                const d = nums(e.Decode);
                if (!d || d.length !== 2 * n) return null;
                const pairs = (lo, hi) => d.every((v, i) => v === (i % 2 === 0 ? lo : hi));
                if (cs.kind === 'indexed') {
                    if (pairs(max, 0)) invert = true;
                    else if (!pairs(0, max)) return null;
                } else if (pairs(1, 0)) {
                    invert = true;
                } else if (!pairs(0, 1)) {
                    return null;
                }
            }
            const samples = samplesOf(xo);
            if (!samples || samples.length < rowBytes * height) return null;
            const raw = samples.subarray(0, rowBytes * height);
            const data = invert ? raw.map((b) => b ^ 0xFF) : raw;

            // Alpha: `{ values, max }` (one raw level per pixel) or null.
            let alpha = null;
            let masked = false;
            if (e.SMask !== undefined) {
                const sm = deref(e.SMask);
                const se = sm && sm.type === 'stream' ? sm.dict.entries : null;
                const sbpc = se ? intOf(se.BitsPerComponent) : NaN;
                const scs = se ? deref(se.ColorSpace) : null;
                const sDecode = se && se.Decode !== undefined ? nums(se.Decode) : [0, 1];
                const ok = se && intOf(se.Width) === width && intOf(se.Height) === height
                    && [1, 2, 4, 8, 16].includes(sbpc) && se.Matte === undefined
                    && (!scs || (scs.type === 'name' && scs.value === 'DeviceGray'))
                    && sDecode && sDecode.length === 2 && (sDecode[0] === 0 || sDecode[0] === 1) && sDecode[1] === 1 - sDecode[0];
                const sRow = Math.ceil(width * sbpc / 8);
                const sSamples = ok ? samplesOf(sm) : null;
                if (sSamples && sSamples.length >= sRow * height) {
                    const sMax = sbpc === 16 ? 65535 : (1 << sbpc) - 1;
                    const values = new Uint16Array(width * height);
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            const v = sampleAt(sSamples, y * sRow, x, sbpc);
                            values[y * width + x] = sDecode[0] === 1 ? sMax - v : v;
                        }
                    }
                    alpha = { values, max: sMax };
                } else {
                    masked = true;
                }
            } else if (e.Mask !== undefined) {
                const ranges = nums(e.Mask);
                if (ranges && ranges.length === 2 * n) {
                    const values = new Uint16Array(width * height);
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            let inside = true;
                            for (let c = 0; c < n && inside; c++) {
                                const v = sampleAt(raw, y * rowBytes, x * n + c, bpc);
                                inside = v >= ranges[2 * c] && v <= ranges[2 * c + 1];
                            }
                            values[y * width + x] = inside ? 0 : 1;
                        }
                    }
                    alpha = { values, max: 1 };
                } else {
                    masked = true;
                }
            }

            const icc = cs.kind === 'indexed' ? cs.base.icc : cs.icc;
            const palette = () => {
                const entries = Math.min(cs.hival + 1, 1 << bpc);
                const out = new Uint8Array(entries * 3);
                const bn = cs.base.kind === 'rgb' ? 3 : 1;
                for (let k = 0; k < entries; k++) {
                    for (let c = 0; c < 3; c++) out[k * 3 + c] = cs.lookup[k * bn + (bn === 3 ? c : 0)];
                }
                return out;
            };
            const spec = { width, height, iccProfile: icc };

            if (!alpha) {
                if (cs.kind === 'indexed') {
                    Object.assign(spec, { bitDepth: bpc, colorType: 3, data, palette: palette() });
                } else if (cs.kind === 'gray' || bpc >= 8) {
                    Object.assign(spec, { bitDepth: bpc, colorType: cs.kind === 'gray' ? 0 : 2, data });
                } else {
                    // RGB at 1, 2 or 4 bits: widened to 8.
                    const out = new Uint8Array(width * height * 3);
                    for (let y = 0; y < height; y++) {
                        for (let i = 0; i < width * 3; i++) out[y * width * 3 + i] = Math.round(sampleAt(data, y * rowBytes, i, bpc) * 255 / max);
                    }
                    Object.assign(spec, { bitDepth: 8, colorType: 2, data: out });
                }
                return { bytes: encodePng(spec), masked };
            }

            // With alpha: grey + alpha or RGBA, 16-bit when the picture is.
            const depth = bpc === 16 && cs.kind !== 'indexed' ? 16 : 8;
            const channels = cs.kind === 'gray' ? 2 : 4;
            const bytesPer = depth / 8;
            const out = new Uint8Array(width * height * channels * bytesPer);
            const put = (at, v) => {
                if (depth === 16) { out[at] = v >> 8; out[at + 1] = v & 0xFF; } else { out[at] = v; }
            };
            const level = (v, from) => Math.round(v * (depth === 16 ? 65535 : 255) / from);
            const pal = cs.kind === 'indexed' ? palette() : null;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const px = (y * width + x) * channels * bytesPer;
                    if (pal) {
                        const k = Math.min(sampleAt(data, y * rowBytes, x, bpc), pal.length / 3 - 1);
                        for (let c = 0; c < 3; c++) put(px + c * bytesPer, pal[k * 3 + c]);
                    } else {
                        for (let c = 0; c < n; c++) put(px + c * bytesPer, level(sampleAt(data, y * rowBytes, x * n + c, bpc), max));
                    }
                    put(px + (channels - 1) * bytesPer, level(alpha.values[y * width + x], alpha.max));
                }
            }
            Object.assign(spec, { bitDepth: depth, colorType: cs.kind === 'gray' ? 4 : 6, data: out });
            return { bytes: encodePng(spec), masked };
        }

        return { encodePng, imageToPng };
    }
};
