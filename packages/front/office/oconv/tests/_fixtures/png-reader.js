// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Test-only PNG reader, independent of the encoder under test: `node:zlib`
 * inflates, the CRC-32 is computed here. It accepts filter byte 0 only (the
 * encoder writes no other) and returns each row's bytes without it.
 */

import { inflateSync } from 'node:zlib';

const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc(bytes) {
    let c = 0xFFFFFFFF;
    for (const b of bytes) c = TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * @param {Uint8Array} bytes
 * @returns {{width: number, height: number, bitDepth: number, colorType: number,
 *   palette: Uint8Array|null, icc: Uint8Array|null, rows: Uint8Array[], chunks: string[]}}
 */
export function readPng(bytes) {
    const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!SIG.every((v, i) => bytes[i] === v)) throw new Error('not a png');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 8;
    const out = { palette: null, icc: null, chunks: [] };
    const idat = [];
    while (at < bytes.length) {
        const len = view.getUint32(at);
        const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        const data = bytes.subarray(at + 8, at + 8 + len);
        if (crc(bytes.subarray(at + 4, at + 8 + len)) !== view.getUint32(at + 8 + len)) throw new Error(`bad crc in ${type}`);
        out.chunks.push(type);
        if (type === 'IHDR') {
            const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
            Object.assign(out, { width: d.getUint32(0), height: d.getUint32(4), bitDepth: data[8], colorType: data[9] });
        } else if (type === 'PLTE') {
            out.palette = data.slice();
        } else if (type === 'iCCP') {
            const nul = data.indexOf(0);
            out.icc = new Uint8Array(inflateSync(data.subarray(nul + 2)));
        } else if (type === 'IDAT') {
            idat.push(data);
        }
        at += 12 + len;
        if (type === 'IEND') break;
    }
    const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
    let o = 0;
    for (const d of idat) { all.set(d, o); o += d.length; }
    const raw = new Uint8Array(inflateSync(all));
    const rowBytes = Math.ceil(out.width * CHANNELS[out.colorType] * out.bitDepth / 8);
    out.rows = [];
    for (let y = 0; y < out.height; y++) {
        const start = y * (rowBytes + 1);
        if (raw[start] !== 0) throw new Error('filter byte not 0');
        out.rows.push(raw.slice(start + 1, start + 1 + rowBytes));
    }
    return out;
}
