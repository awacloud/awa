// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `kerx` — Extended Kerning (Apple TT RM06).
 *
 * `parseKerx(bytes, opts?)` reads the header and each subtable, and decodes
 * every format with `parsed: true`, through `aatLookup` (`opts.numGlyphs`
 * bounds a format 0 lookup):
 *
 *  - 0, pairs: `pairs`, `map`, `kern(left, right)`;
 *  - 1, state-machine kerning: `stateTable` (each entry's data is the kern
 *    action index) and the reader `action(i)` (int16 from the state
 *    table's start);
 *  - 2, class kerning: `rowWidth` and `kern(left, right)`, the int16 at
 *    index left class + right class of the array (the class lookups and
 *    the array at offsets from the subtable's start), 0 for a missing
 *    class or a value past the subtable;
 *  - 4, attachment: `stateTable` (the anchor action index), `actionType`
 *    (0 control points, 1 anchors, 2 coordinates) and the reader `data(i)`
 *    (16-bit from the state table's start);
 *  - 6, index-array kerning: `long` and `kern(left, right)`, the array
 *    value at the row value plus the column value (int16, or int32 when
 *    flag 1 is set).
 *
 * A body of format 1, 2, 4 or 6 that does not decode keeps
 * `parsed: false` and an `error` (the `ParseError` code). Every
 * non-format-0 subtable keeps its raw `body`.
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/kerx
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { aatLookup } from './lookup.js';

export const aatKerx = {
    name: 'aatKerx',
    dependencies: ['fontErrors', 'fontReader', 'aatLookup'],
    deps: [fontErrors, fontReader, aatLookup],
    factory(errors, reader, lookups) {
        const HEADER_SIZE   = 8;
        const SUB_HDR_SIZE  = 12;
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        const u16 = (b, o) => (b[o] << 8) | b[o + 1];
        const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
        const i16 = (b, o) => (u16(b, o) << 16) >> 16;
        const i32 = (b, o) => (u32(b, o) | 0);

        /** A reader of `size`-byte values from `base` of `b`; `null` past it or below 0. */
        function valuesAt(b, base, size, read) {
            return (i) => (Number.isInteger(i) && i >= 0 && base + size * (i + 1) <= b.length ? read(b, base + size * i) : null);
        }

        function need(b, n, format) {
            if (b.length < n)
                throw new ParseError('fonts/kerx-format-short', `kerx format ${format} header truncated`, { context: { format, length: b.length } });
        }

        /** The decoded fields of a format 1, 2, 4 or 6 subtable: `sub` is the whole subtable, `body` after its 12-byte header. */
        function decode(format, sub, body, numGlyphs) {
            const opts = numGlyphs !== undefined ? { numGlyphs } : undefined;
            if (format === 1) {
                need(body, 20, 1);
                return { stateTable: lookups.parseStateTable(body, 0, 1, opts), action: valuesAt(body, u32(body, 16), 2, i16) };
            }
            if (format === 4) {
                need(body, 20, 4);
                const flags = u32(body, 16);
                return {
                    stateTable: lookups.parseStateTable(body, 0, 1, opts),
                    actionType: flags >>> 30,
                    data: valuesAt(body, flags & 0x00FFFFFF, 2, u16)
                };
            }
            if (format === 2) {
                need(body, 16, 2);
                const left = lookups.parseLookup(sub, u32(body, 4), opts);
                const right = lookups.parseLookup(sub, u32(body, 8), opts);
                const value = valuesAt(sub, u32(body, 12), 2, i16);
                return {
                    rowWidth: u32(body, 0),
                    kern(l, r) { return value((left.get(l) || 0) + (right.get(r) || 0)) || 0; }
                };
            }
            need(body, 20, 6);
            const long = !!(u32(body, 0) & 1);
            const lopts = { ...opts, valueSize: long ? 4 : 2 };
            const rows = lookups.parseLookup(sub, u32(body, 8), lopts);
            const cols = lookups.parseLookup(sub, u32(body, 12), lopts);
            const value = valuesAt(sub, u32(body, 16), long ? 4 : 2, long ? i32 : i16);
            return {
                long,
                kern(l, r) { return value((rows.get(l) || 0) + (cols.get(r) || 0)) || 0; }
            };
        }

        function parseKerx(bytes, opts) {
            const numGlyphs = opts && opts.numGlyphs;
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/kerx-input', 'parseKerx expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_SIZE)
                throw new ParseError('fonts/kerx-short', 'kerx table too short',
                    { context: { actual: bytes.length, needed: HEADER_SIZE } });

            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            r.readUint16();
            const nTables = r.readUint32();
            if (version !== 2 && version !== 3)
                throw new ParseError('fonts/kerx-version', `unsupported kerx version ${version}`,
                    { context: { version } });
            if (nTables > 0xFFFF)
                throw new ParseError('fonts/kerx-ntables', `implausible kerx subtable count ${nTables}`,
                    { context: { nTables } });

            const tables = new Array(nTables);
            for (let i = 0; i < nTables; i++) tables[i] = parseSubtable(r, i, bytes, numGlyphs);
            return { version, nTables, tables };
        }

        function parseSubtable(r, index, bytes, numGlyphs) {
            const start = r.pos;
            if (start + SUB_HDR_SIZE > r.length)
                throw new ParseError('fonts/kerx-sub-short', `kerx subtable ${index} header truncated`,
                    { context: { index } });

            const length     = r.readUint32();
            const coverage   = r.readUint32();
            const tupleCount = r.readUint32();
            if (length < SUB_HDR_SIZE || start + length > r.length)
                throw new ParseError('fonts/kerx-sub-length',
                    `kerx subtable ${index} length invalid`,
                    { context: { index, length, available: r.length - start } });

            const format      = coverage & 0xFF;
            const vertical    = !!(coverage & 0x80000000);
            const crossStream = !!(coverage & 0x40000000);
            const variation   = !!(coverage & 0x20000000);

            const meta = { length, coverage: coverage >>> 0, format, vertical, crossStream, variation, tupleCount };

            if (format === 0) {
                const sub = parseFormat0(r, start + length, index);
                return { ...meta, ...sub, parsed: true };
            }

            const bodyLen = length - SUB_HDR_SIZE;
            const body = r.readBytes(bodyLen);
            if (format !== 1 && format !== 2 && format !== 4 && format !== 6)
                return { ...meta, body, parsed: false, unknown: true };
            try {
                return { ...meta, body, ...decode(format, bytes.subarray(start, start + length), body, numGlyphs), parsed: true };
            } catch (e) {
                if (!(e instanceof ParseError)) throw e;
                return { ...meta, body, parsed: false, error: e.code };
            }
        }

        function parseFormat0(r, end, index) {
            if (r.pos + 16 > end)
                throw new ParseError('fonts/kerx-format0-short',
                    `kerx subtable ${index} format 0 header truncated`,
                    { context: { index } });
            const nPairs = r.readUint32();
            r.skip(12);
            const pairs = new Array(nPairs);
            const map = new Map();
            for (let i = 0; i < nPairs; i++) {
                if (r.pos + 6 > end)
                    throw new ParseError('fonts/kerx-format0-overflow',
                        `kerx subtable ${index} pair ${i} overflows subtable`,
                        { context: { index, pair: i } });
                const left  = r.readUint16();
                const right = r.readUint16();
                const value = r.readInt16();
                pairs[i] = { left, right, value };
                map.set((left << 16) | right, value);
            }
            r.seek(end);
            return {
                pairs,
                map,
                kern(l, rg) { return map.get(((l & 0xFFFF) << 16) | (rg & 0xFFFF)) || 0; }
            };
        }

        return { parseKerx };
    }
};

