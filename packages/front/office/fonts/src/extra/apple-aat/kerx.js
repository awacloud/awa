// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `kerx` — Extended Kerning (Apple TT RM06).
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/kerx
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const aatKerx = {
    name: 'aatKerx',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const HEADER_SIZE   = 8;
        const SUB_HDR_SIZE  = 12;
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseKerx(bytes) {
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
            for (let i = 0; i < nTables; i++) tables[i] = parseSubtable(r, i);
            return { version, nTables, tables };
        }

        function parseSubtable(r, index) {
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
            return { ...meta, body, parsed: false };
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

