// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Pixel patterns for the image fixtures. Each is asymmetric
 * on purpose, so a crop, a mirror, a flip or a rotation shows: four
 * coloured quadrants (red top-left, green top-right, blue bottom-left,
 * yellow bottom-right) crossed by a black diagonal from the top-left
 * corner, a grey ramp with a black square in its top-left corner, a CMYK
 * version of the quadrants, rings for resampling.
 *
 * @module viewer/tests/fixtures/image-sources
 */

/** RGB of the four quadrants: top-left, top-right, bottom-left, bottom-right. */
export const QUADRANT_RGB = Object.freeze([[220, 40, 40], [40, 170, 60], [40, 80, 220], [240, 200, 40]]);

/** Which quadrant (0–3) a pixel is in, or -1 on the diagonal. */
function quadrant(x, y, w, h) {
    if (Math.abs(x / w - y / h) < 1.5 / Math.min(w, h)) return -1;
    return (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1);
}

/** Interleaved RGB (or RGBA with `alpha(x, y)`) quadrants. */
export function quadrantsRgb(w, h, alpha) {
    const n = alpha ? 4 : 3;
    const px = new Uint8Array(w * h * n);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const q = quadrant(x, y, w, h);
            const rgb = q < 0 ? [0, 0, 0] : QUADRANT_RGB[q];
            px.set(rgb, (y * w + x) * n);
            if (alpha) px[(y * w + x) * n + 3] = alpha(x, y);
        }
    }
    return px;
}

/** Quadrant indices 0–3 (the diagonal is index 3 too: one byte per pixel). */
export function quadrantsIndexed(w, h) {
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.max(0, quadrant(x, y, w, h));
    return px;
}

/** CMYK quadrants: cyan, magenta, yellow, black; the diagonal is white. */
export function quadrantsCmyk(w, h) {
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const q = quadrant(x, y, w, h);
            const c = [0, 0, 0, 0];
            if (q >= 0) c[q] = 255;
            px.set(c, (y * w + x) * 4);
        }
    }
    return px;
}

/** A grey ramp (dark left → light right) with a black square top-left. */
export function grayRamp(w, h) {
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            px[y * w + x] = x < w / 4 && y < h / 4 ? 0 : Math.round(40 + (200 * x) / Math.max(1, w - 1));
        }
    }
    return px;
}

/** Concentric rings: aliasing shows when it is shrunk without smoothing. */
export function rings(w, h) {
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const r = Math.hypot(x - w / 2, y - h / 2);
            px[y * w + x] = (Math.floor(r / 3) % 2) ? 230 : 25;
        }
    }
    return px;
}

/**
 * Pack 8-bit samples to `bpc` bits per sample, rows padded to a byte.
 * @param {Uint8Array} px one sample per pixel (0–255)
 */
export function pack(px, w, h, bpc) {
    const rowBytes = Math.ceil((w * bpc) / 8);
    const out = new Uint8Array(rowBytes * h);
    const levels = (1 << bpc) - 1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const v = Math.round((px[y * w + x] / 255) * levels);
            const bit = x * bpc;
            out[y * rowBytes + (bit >> 3)] |= v << (8 - bpc - (bit & 7));
        }
    }
    return out;
}

/** 8-bit interleaved samples to 16-bit big-endian. */
export function to16(px) {
    const out = new Uint8Array(px.length * 2);
    for (let i = 0; i < px.length; i++) { out[2 * i] = px[i]; out[2 * i + 1] = px[i]; }
    return out;
}

/** A small SVG with the quadrants and a circle (vector, scales crisply). */
export const QUADRANTS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" width="64" height="48">
<rect width="32" height="24" fill="rgb(220,40,40)"/><rect x="32" width="32" height="24" fill="rgb(40,170,60)"/>
<rect y="24" width="32" height="24" fill="rgb(40,80,220)"/><rect x="32" y="24" width="32" height="24" fill="rgb(240,200,40)"/>
<line x1="0" y1="0" x2="64" y2="48" stroke="#000" stroke-width="2"/><circle cx="32" cy="24" r="9" fill="#fff" stroke="#000"/>
</svg>`;

/**
 * A minimal Enhanced Metafile: the header record and the end-of-file
 * record only. Enough to be recognised as EMF; browsers cannot draw it.
 */
export function minimalEmf() {
    const b = new Uint8Array(108 + 20);
    const v = new DataView(b.buffer);
    v.setUint32(0, 1, true);           // EMR_HEADER
    v.setUint32(4, 108, true);         // record size
    v.setInt32(16, 64, true); v.setInt32(20, 48, true);            // bounds
    v.setInt32(32, 1693, true); v.setInt32(36, 1270, true);        // frame (0.01 mm)
    v.setUint32(40, 0x464d4520, true); // " EMF"
    v.setUint32(44, 0x10000, true);    // version
    v.setUint32(48, b.length, true);   // file size
    v.setUint32(52, 2, true);          // records
    v.setUint32(108, 14, true);        // EMR_EOF
    v.setUint32(112, 20, true);
    return b;
}

/**
 * A GIF89a (palette of the quadrant colours, index 3 transparent — the
 * yellow quadrant shows the page through). LZW written the simple way: a
 * clear code every 254 literals, so every code stays 9 bits wide.
 */
export function quadrantsGif(w, h) {
    const idx = quadrantsIndexed(w, h);
    const bytes = [...new TextEncoder().encode('GIF89a'), w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0];
    const palette = new Array(256 * 3).fill(0);
    QUADRANT_RGB.forEach((rgb, i) => palette.splice(i * 3, 3, ...rgb));
    bytes.push(...palette);
    bytes.push(0x21, 0xf9, 4, 0x01, 0, 0, 3, 0);                       // transparency: index 3
    bytes.push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0);
    bytes.push(8);                                                     // LZW minimum code size
    const codes = [256];
    let since = 0;
    for (const p of idx) {
        if (since === 254) { codes.push(256); since = 0; }
        codes.push(p);
        since++;
    }
    codes.push(257);
    const data = [];
    let acc = 0; let n = 0;
    for (const c of codes) {
        acc |= c << n; n += 9;
        while (n >= 8) { data.push(acc & 255); acc >>= 8; n -= 8; }
    }
    if (n) data.push(acc & 255);
    for (let i = 0; i < data.length; i += 255) {
        const part = data.slice(i, i + 255);
        bytes.push(part.length, ...part);
    }
    bytes.push(0, 0x3b);
    return new Uint8Array(bytes);
}
