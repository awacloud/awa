// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// lzw against a foreign encoder: GIF and TIFF images written by GDI+
// (System.Drawing), committed base64-encoded in
// tests/_vectors/lzw-foreign/images.json with their generator
// (generate.py.txt). Each image's LZW data, taken out of its container here,
// must decode with fw's lzw to the pixel bytes recorded beside it (for a GIF,
// the indices GDI+ itself reads back from the file).

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lzw } from './lzw.js';

const L = lzw.factory();
const SET = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', 'tests', '_vectors', 'lzw-foreign', 'images.json'), 'utf8'));
const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

/** The LZW stream and code size of a single-image, non-interlaced GIF. */
function gifStream(f) {
    expect(String.fromCharCode(...f.subarray(0, 6))).toMatch(/^GIF8[79]a$/);
    let p = 13;
    if (f[10] & 0x80) p += 3 << ((f[10] & 7) + 1);           // global colour table
    while (f[p] === 0x21) {                                    // extensions
        p += 2;
        while (f[p]) p += f[p] + 1;
        p++;
    }
    expect(f[p]).toBe(0x2c);                                   // image descriptor
    const flags = f[p + 9];
    expect(flags & 0x40).toBe(0);                              // not interlaced
    p += 10;
    if (flags & 0x80) p += 3 << ((flags & 7) + 1);            // local colour table
    const minCodeBits = f[p++];
    const parts = [];
    while (f[p]) { parts.push(f.subarray(p + 1, p + 1 + f[p])); p += f[p] + 1; }
    return { minCodeBits, data: Buffer.concat(parts) };
}

/** The LZW strips of a little-endian, single-IFD TIFF and its layout tags. */
function tiffStrips(f) {
    const dv = new DataView(f.buffer, f.byteOffset, f.byteLength);
    expect(dv.getUint16(0, true)).toBe(0x4949);
    expect(dv.getUint16(2, true)).toBe(42);
    const ifd = dv.getUint32(4, true);
    const tags = {};
    for (let i = 0, n = dv.getUint16(ifd, true); i < n; i++) {
        const e = ifd + 2 + i * 12;
        const tag = dv.getUint16(e, true), type = dv.getUint16(e + 2, true), count = dv.getUint32(e + 4, true);
        const size = type === 3 ? 2 : 4;
        const at = count * size <= 4 ? e + 8 : dv.getUint32(e + 8, true);
        tags[tag] = Array.from({ length: count }, (_, k) => (size === 2 ? dv.getUint16(at + 2 * k, true) : dv.getUint32(at + 4 * k, true)));
    }
    expect(tags[259][0]).toBe(5);                              // Compression = LZW
    const offsets = tags[273], counts = tags[279];
    return { predictor: tags[317] ? tags[317][0] : 1, spp: tags[277] ? tags[277][0] : 1, strips: offsets.map((o, k) => f.subarray(o, o + counts[k])) };
}

describe('lzw — streams from a foreign encoder (GDI+)', () => {
    test('the set: two GIFs and two TIFFs, from GDI+', () => {
        expect(SET.encoder).toMatch(/^GDI\+/);
        expect(Object.keys(SET.images).sort()).toEqual(['gif4.gif', 'gif8.gif', 'tif24.tif', 'tif8.tif']);
    });

    for (const name of ['gif8.gif', 'gif4.gif']) {
        test(`${name}: the image data decodes (GIF profile, its own minimum code size) to the indices GDI+ reads back`, () => {
            const img = SET.images[name];
            const { minCodeBits, data } = gifStream(b64(img.file));
            const out = L.decode(new Uint8Array(data), { minCodeBits });
            expect(Buffer.compare(Buffer.from(out), Buffer.from(b64(img.pixels)))).toBe(0);
            expect(out.length).toBe(img.width * img.height);
        });
    }

    test('earlyChange: GIF widens at 2^n entries, TIFF / PDF one code early; the old LSB wire reads with { earlyChange: true }', () => {
        const data = b64(SET.images['tif24.tif'].pixels);             // 6771 bytes: past 512 and 1024 codes
        const gif = L.encode(data);                                   // the GIF profile
        const early = L.encode(data, { earlyChange: true });          // what fw wrote LSB-first before
        expect(Buffer.compare(Buffer.from(gif), Buffer.from(early))).not.toBe(0);
        expect(Buffer.from(L.decode(gif)).equals(Buffer.from(data))).toBe(true);
        expect(Buffer.from(L.decode(early, { earlyChange: true })).equals(Buffer.from(data))).toBe(true);
        let misread;
        try { misread = !Buffer.from(L.decode(early)).equals(Buffer.from(data)); } catch { misread = true; }
        expect(misread).toBe(true);
        // bigEndian alone is the TIFF / PDF profile: early change by default
        expect(Buffer.from(L.encode(data, { bigEndian: true })).equals(Buffer.from(L.encode(data, { bigEndian: true, earlyChange: true })))).toBe(true);
    });

    for (const name of ['tif8.tif', 'tif24.tif']) {
        test(`${name}: every strip decodes (TIFF profile, MSB-first) to the source pixels`, () => {
            const img = SET.images[name];
            const { predictor, spp, strips } = tiffStrips(b64(img.file));
            const out = Buffer.concat(strips.map((s) => Buffer.from(L.decode(s, { bigEndian: true }))));
            if (predictor === 2) {                              // horizontal differencing, per row
                const row = img.width * spp;
                for (let y = 0; y < img.height; y++) for (let x = spp; x < row; x++) out[y * row + x] = (out[y * row + x] + out[y * row + x - spp]) & 255;
            }
            expect(Buffer.compare(out, Buffer.from(b64(img.pixels)))).toBe(0);
        });
    }
});
