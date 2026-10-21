// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-fixture image encoders (never shipped): PNG (RGB /
 * RGBA, through fw `zlib`) and baseline JPEG (ITU-T T.81) with 1, 3 or 4
 * components. The repository has no JPEG encoder and the browser's canvas
 * writes RGB only; the image fixtures need grey and CMYK JPEGs too.
 *
 * The JPEG is deliberately simple and fully first-party: one flat
 * quantisation table, no subsampling, no colour transform (RGB stays RGB,
 * declared by an Adobe APP14 marker with transform 0), and Huffman tables
 * built here with fixed-length codes (valid T.81 tables, just not the
 * Annex K ones). CMYK is written the way Photoshop writes it — Adobe marker,
 * inverted samples — which is what browsers' JPEG decoders assume.
 *
 * @module viewer/tests/fixtures/image-encoders
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zlib as zlibModule } from '@awacloud/fw/io/compress/zlib.js';

const rt = new ModuleRuntime();
rt.registerDeep(zlibModule);
const zlib = rt.resolve('zlib');

// ── PNG ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type, data) {
    const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
    return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/**
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} pixels interleaved RGB or RGBA
 * @param {boolean} [alpha]
 * @returns {Uint8Array}
 */
export function encodePng(w, h, pixels, alpha = false) {
    const n = alpha ? 4 : 3;
    const raw = new Uint8Array(h * (w * n + 1));
    for (let y = 0; y < h; y++) raw.set(pixels.subarray(y * w * n, (y + 1) * w * n), y * (w * n + 1) + 1);
    return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...chunk('IHDR', [...u32(w), ...u32(h), 8, alpha ? 6 : 2, 0, 0, 0]),
        ...chunk('IDAT', [...zlib.zlibSync(raw)]),
        ...chunk('IEND', [])
    ]);
}

// ── JPEG ─────────────────────────────────────────────────────────────────

/** Natural index of each zig-zag position. */
const ZIGZAG = (() => {
    const out = [];
    for (let s = 0; s < 15; s++) {
        const cells = [];
        for (let y = 0; y < 8; y++) { const x = s - y; if (x >= 0 && x < 8) cells.push(y * 8 + x); }
        // Even diagonals run bottom-left → top-right, odd ones the other way.
        out.push(...(s % 2 === 0 ? cells.reverse() : cells));
    }
    return out;
})();

const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const C = (u) => (u === 0 ? Math.SQRT1_2 : 1);

/** Forward DCT of one 8×8 block of level-shifted samples. */
function fdct(block) {
    const out = new Float64Array(64);
    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            let sum = 0;
            for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) sum += block[y * 8 + x] * COS[x][u] * COS[y][v];
            out[v * 8 + u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return out;
}

/** AC symbols: EOB, ZRL and every (run, size 1..10). */
const AC_SYMBOLS = [0x00, 0xf0];
for (let run = 0; run < 16; run++) for (let size = 1; size <= 10; size++) AC_SYMBOLS.push((run << 4) | size);
/** Fixed-length codes: DC categories on 4 bits, AC symbols on 8. */
const DC_CODE = (cat) => ({ code: cat, len: 4 });
const AC_INDEX = new Map(AC_SYMBOLS.map((s, i) => [s, i]));
const AC_CODE = (sym) => ({ code: /** @type {number} */ (AC_INDEX.get(sym)), len: 8 });

function bitWriter() {
    const bytes = [];
    let acc = 0; let n = 0;
    return {
        put(code, len) {
            for (let i = len - 1; i >= 0; i--) {
                acc = (acc << 1) | ((code >> i) & 1);
                if (++n === 8) { bytes.push(acc); if (acc === 0xff) bytes.push(0); acc = 0; n = 0; }
            }
        },
        end() { while (n !== 0) this.put(1, 1); return bytes; }
    };
}
const category = (v) => { let a = Math.abs(v); let c = 0; while (a) { c++; a >>= 1; } return c; };
const extra = (v, cat) => (v < 0 ? v + (1 << cat) - 1 : v);

/**
 * @param {{width: number, height: number, components: 1|3|4, pixels: Uint8Array,
 *   q?: number, adobe?: boolean}} img interleaved samples; CMYK samples are
 *   written as given (pass inverted CMYK with `adobe: true`, Photoshop style)
 * @returns {Uint8Array}
 */
export function encodeJpeg({ width, height, components: n, pixels, q = 6, adobe = n > 1 }) {
    const out = [0xff, 0xd8];
    const seg = (marker, body) => out.push(0xff, marker, ((body.length + 2) >> 8) & 255, (body.length + 2) & 255, ...body);
    // Adobe APP14, transform 0: components stored as is (RGB, CMYK).
    if (adobe) seg(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x64, 0, 0, 0, 0, 0]);
    seg(0xdb, [0x00, ...new Array(64).fill(q)]);
    const comps = [];
    for (let i = 0; i < n; i++) comps.push(i + 1, 0x11, 0);
    seg(0xc0, [8, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, n, ...comps]);
    const dcBits = new Array(16).fill(0); dcBits[3] = 12;
    const acBits = new Array(16).fill(0); acBits[7] = AC_SYMBOLS.length;
    seg(0xc4, [0x00, ...dcBits, ...Array.from({ length: 12 }, (_, i) => i), 0x10, ...acBits, ...AC_SYMBOLS]);
    const sos = [n];
    for (let i = 0; i < n; i++) sos.push(i + 1, 0x00);
    seg(0xda, [...sos, 0, 63, 0]);

    const bw = bitWriter();
    const prevDc = new Array(n).fill(0);
    const block = new Float64Array(64);
    for (let by = 0; by < height; by += 8) {
        for (let bx = 0; bx < width; bx += 8) {
            for (let c = 0; c < n; c++) {
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        const sx = Math.min(width - 1, bx + x);
                        const sy = Math.min(height - 1, by + y);
                        block[y * 8 + x] = pixels[(sy * width + sx) * n + c] - 128;
                    }
                }
                const coef = fdct(block);
                const zz = ZIGZAG.map((k) => Math.round(coef[k] / q));
                const diff = zz[0] - prevDc[c];
                prevDc[c] = zz[0];
                const dcCat = category(diff);
                const dc = DC_CODE(dcCat);
                bw.put(dc.code, dc.len);
                if (dcCat) bw.put(extra(diff, dcCat), dcCat);
                let run = 0;
                for (let k = 1; k < 64; k++) {
                    const v = zz[k];
                    if (!v) { run++; continue; }
                    while (run > 15) { const z = AC_CODE(0xf0); bw.put(z.code, z.len); run -= 16; }
                    const size = category(v);
                    const sym = AC_CODE((run << 4) | size);
                    bw.put(sym.code, sym.len);
                    bw.put(extra(v, size), size);
                    run = 0;
                }
                if (run) { const eob = AC_CODE(0x00); bw.put(eob.code, eob.len); }
            }
        }
    }
    out.push(...bw.end(), 0xff, 0xd9);
    return new Uint8Array(out);
}
