// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The OpenType item variation store and delta-set index map
 * (OT §"OpenType Font Variations Common Table Formats"), as `HVAR`,
 * `VVAR`, `MVAR`, `GDEF` and `CFF2` use them.
 *
 *  - `parseItemVariationStore(bytes, offset)` reads the region list and the
 *    item variation data, and gives `delta(outer, inner, coords)`: the
 *    item's deltas, each scaled by its region's scalar at the normalised
 *    `coords` (`fvar` axis order), summed; 0 for an item it does not hold.
 *    A region's scalar is the product of its axes' scalars: 1 for an axis
 *    whose peak is 0 or whose range is invalid (start > peak, peak > end,
 *    or start < 0 < end), 0 outside `[start, end]`, else the linear ramp to
 *    1 at the peak. Word deltas are 16-bit, or 32-bit with `LONG_WORDS`
 *    (`0x8000`), the others 8- or 16-bit. `scalars(outer, coords)` gives
 *    the scalars of the regions of item variation data `outer`, in its
 *    order (what a CFF2 `blend` under `vsindex` outer multiplies).
 *  - `parseDeltaSetIndexMap(bytes, offset)` (formats 0 and 1) gives
 *    `get(i)`: `{ outer, inner }`, the last entry for an index past the map.
 *
 * A structure that does not fit its bytes throws a `ParseError`.
 *
 * Strict factory body, capture-free, worker-safe.
 *
 * @module fonts/variable/itemVariationStore
 */

import { fontErrors } from '../errors.js';

export const varItemStore = {
    name: 'varItemStore',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;

        const u8 = (b, o) => b[o];
        const u16 = (b, o) => (b[o] << 8) | b[o + 1];
        const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
        const i8 = (b, o) => (b[o] << 24) >> 24;
        const i16 = (b, o) => (u16(b, o) << 16) >> 16;
        const i32 = (b, o) => u32(b, o) | 0;
        const f2dot14 = (b, o) => i16(b, o) / 16384;

        function need(bytes, end, what) {
            if (!(bytes instanceof Uint8Array) || end > bytes.length)
                throw new ParseError('fonts/ivs-short', `${what} runs past the table`, { context: { end, length: bytes && bytes.length } });
        }

        /** One axis's scalar for a region axis `(start, peak, end)` at `c`. */
        /** A region's scalar at `coords`. */
        function regionScalar(region, coords) {
            let s = 1;
            for (let a = 0; a < region.length && s !== 0; a++) s *= axisScalar(region[a][0], region[a][1], region[a][2], coords[a] || 0);
            return s;
        }

        function axisScalar(start, peak, end, c) {
            if (peak === 0 || start > peak || peak > end || (start < 0 && end > 0)) return 1;
            if (c < start || c > end) return 0;
            if (c === peak) return 1;
            return c < peak ? (c - start) / (peak - start) : (end - c) / (end - peak);
        }

        /**
         * @param {Uint8Array} bytes
         * @param {number} offset
         * @returns {{regionCount: number, delta: (outer: number, inner: number, coords: number[]) => number,
         *   scalars: (outer: number, coords: number[]) => number[]}}
         * @throws {ParseError} `fonts/ivs-short`, `fonts/ivs-format`.
         */
        function parseItemVariationStore(bytes, offset) {
            need(bytes, offset + 8, 'item variation store header');
            const format = u16(bytes, offset);
            if (format !== 1)
                throw new ParseError('fonts/ivs-format', `item variation store format ${format}`, { context: { format } });
            const regionOff = offset + u32(bytes, offset + 2);
            const dataCount = u16(bytes, offset + 6);
            need(bytes, offset + 8 + 4 * dataCount, 'item variation data offsets');
            need(bytes, regionOff + 4, 'region list header');
            const axisCount = u16(bytes, regionOff);
            const regionCount = u16(bytes, regionOff + 2);
            need(bytes, regionOff + 4 + 6 * axisCount * regionCount, 'region list');
            const regions = [];
            for (let r = 0; r < regionCount; r++) {
                const axes = [];
                for (let a = 0; a < axisCount; a++) {
                    const at = regionOff + 4 + 6 * (r * axisCount + a);
                    axes.push([f2dot14(bytes, at), f2dot14(bytes, at + 2), f2dot14(bytes, at + 4)]);
                }
                regions.push(axes);
            }
            const data = [];
            for (let k = 0; k < dataCount; k++) {
                const off = u32(bytes, offset + 8 + 4 * k);
                if (!off) { data.push(null); continue; }
                const at = offset + off;
                need(bytes, at + 6, 'item variation data header');
                const itemCount = u16(bytes, at);
                const wordField = u16(bytes, at + 2);
                const long = !!(wordField & 0x8000);
                const wordCount = wordField & 0x7FFF;
                const indexCount = u16(bytes, at + 4);
                need(bytes, at + 6 + 2 * indexCount, 'region indexes');
                const regionIndexes = [];
                for (let n = 0; n < indexCount; n++) regionIndexes.push(u16(bytes, at + 6 + 2 * n));
                const wordSize = long ? 4 : 2, restSize = long ? 2 : 1;
                const rowSize = wordCount * wordSize + (indexCount - wordCount) * restSize;
                const rows = at + 6 + 2 * indexCount;
                need(bytes, rows + rowSize * itemCount, 'delta sets');
                data.push({ itemCount, wordCount, long, regionIndexes, rows, rowSize });
            }
            return {
                regionCount,
                delta(outer, inner, coords) {
                    const d = data[outer];
                    if (!d || inner < 0 || inner >= d.itemCount) return 0;
                    let sum = 0;
                    let at = d.rows + d.rowSize * inner;
                    for (let n = 0; n < d.regionIndexes.length; n++) {
                        let v;
                        if (n < d.wordCount) { v = d.long ? i32(bytes, at) : i16(bytes, at); at += d.long ? 4 : 2; }
                        else { v = d.long ? i16(bytes, at) : i8(bytes, at); at += d.long ? 2 : 1; }
                        const region = regions[d.regionIndexes[n]];
                        if (!v || !region) continue;
                        sum += v * regionScalar(region, coords);
                    }
                    return sum;
                },
                scalars(outer, coords) {
                    const d = data[outer];
                    return d ? d.regionIndexes.map((r) => (regions[r] ? regionScalar(regions[r], coords) : 0)) : [];
                }
            };
        }

        /**
         * @param {Uint8Array} bytes
         * @param {number} offset
         * @returns {{mapCount: number, get: (i: number) => {outer: number, inner: number}}}
         * @throws {ParseError} `fonts/ivs-short`, `fonts/ivs-format`.
         */
        function parseDeltaSetIndexMap(bytes, offset) {
            need(bytes, offset + 2, 'delta-set index map header');
            const format = u8(bytes, offset);
            if (format !== 0 && format !== 1)
                throw new ParseError('fonts/ivs-format', `delta-set index map format ${format}`, { context: { format } });
            const entryFormat = u8(bytes, offset + 1);
            need(bytes, offset + (format === 0 ? 4 : 6), 'delta-set index map count');
            const mapCount = format === 0 ? u16(bytes, offset + 2) : u32(bytes, offset + 2);
            const first = offset + (format === 0 ? 4 : 6);
            const size = ((entryFormat & 0x30) >> 4) + 1;
            const innerBits = (entryFormat & 0x0F) + 1;
            need(bytes, first + size * mapCount, 'delta-set index map entries');
            return {
                mapCount,
                get(i) {
                    if (!mapCount) return { outer: 0, inner: i };
                    const k = Math.min(Math.max(0, i), mapCount - 1);
                    let v = 0;
                    for (let n = 0; n < size; n++) v = v * 256 + bytes[first + size * k + n];
                    return { outer: Math.floor(v / 2 ** innerBits), inner: v % 2 ** innerBits };
                }
            };
        }

        return { parseItemVariationStore, parseDeltaSetIndexMap };
    }
};
