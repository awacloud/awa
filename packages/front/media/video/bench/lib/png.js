// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Minimal PNG writer (8-bit RGB, no filter), so that the
 * bench's source and decoded frames can be looked at. The compression
 * and the checksums come from the fw `zlib` and `crc32` modules.
 */

import { fw } from './fw.js';

/** One PNG chunk: length, type, data, CRC of type and data. */
function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crc = new fw.Crc32();
    crc.append(out.subarray(4, 8 + data.length));
    view.setUint32(8 + data.length, crc.get());
    return out;
}

/**
 * @param {Uint8ClampedArray} rgba The picture; alpha is not written.
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} A complete PNG file.
 */
export function encodePng(rgba, width, height) {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header.set([8, 2, 0, 0, 0], 8);        // 8 bits, RGB, deflate, no filter set, no interlace
    const stride = 1 + width * 3;
    const lines = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
        let to = y * stride + 1;           // each line starts with filter type 0
        let from = y * width * 4;
        for (let x = 0; x < width; x++, from += 4) {
            lines[to++] = rgba[from];
            lines[to++] = rgba[from + 1];
            lines[to++] = rgba[from + 2];
        }
    }
    const parts = [
        Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', fw.zlib.zlibSync(lines, { level: 6 })),
        chunk('IEND', new Uint8Array(0)),
    ];
    const file = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const p of parts) { file.set(p, at); at += p.length; }
    return file;
}
