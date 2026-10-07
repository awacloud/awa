// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `kern` — Kerning (OT §6.4.14 / TT RM02).
 *
 * Two top-level header layouts exist in the wild:
 *
 *  - **Microsoft / OpenType** : `version uint16 (= 0)` + `nTables uint16`
 *  - **Apple TrueType**       : `version Fixed (= 1.0)` + `nTables uint32`
 *
 * Each subtable then declares its own format. Format 0 (the only
 * format almost all fonts actually carry) is a sorted array of
 * `(leftGid, rightGid, value)` records.
 *
 * @module fonts/table/kern
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableKern = {
    name: 'tableKern',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        /**
         * @returns {{ version: number, tables: Array }}
         */
        function parseKern(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/kern-short', 'kern table too short',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const v0 = r.peek(rr => rr.readUint16());
            let version, nTables;
            if (v0 === 0) {
                version = 0;
                r.readUint16();
                nTables = r.readUint16();
                return { version, tables: parseSubtablesMs(r, nTables) };
            }
            // Apple format
            version = r.readFixed();
            nTables = r.readUint32();
            if (version !== 1)
                throw new ParseError('fonts/kern-version', `unsupported kern version ${version}`,
                    { context: { version } });
            return { version, tables: parseSubtablesApple(r, nTables) };
        }

        function parseSubtablesMs(r, n) {
            const out = [];
            for (let i = 0; i < n; i++) {
                r.readUint16();          // version
                const length    = r.readUint16();
                const coverage  = r.readUint16();
                const format    = coverage >>> 8;
                const horizontal = !(coverage & 0x01);
                const minimum    = !!(coverage & 0x02);
                const crossStream = !!(coverage & 0x04);
                const override   = !!(coverage & 0x08);
                if (format === 0) {
                    out.push(parseFormat0(r, { length, horizontal, minimum, crossStream, override }));
                } else {
                    r.skip(length - 6);
                    out.push({ format, length, parsed: false });
                }
            }
            return out;
        }

        function parseSubtablesApple(r, n) {
            const out = [];
            for (let i = 0; i < n; i++) {
                const length   = r.readUint32();
                const coverage = r.readUint16();
                r.readUint16();   // tupleIndex
                const format = coverage & 0xFF;
                const vertical = !!(coverage & 0x8000);
                if (format === 0) {
                    out.push(parseFormat0(r, { length, horizontal: !vertical }));
                } else {
                    r.skip(length - 8);
                    out.push({ format, length, parsed: false });
                }
            }
            return out;
        }

        function parseFormat0(r, meta) {
            const nPairs = r.readUint16();
            r.skip(6);   // searchRange, entrySelector, rangeShift
            const pairs = new Array(nPairs);
            const map = new Map();
            for (let i = 0; i < nPairs; i++) {
                const left  = r.readUint16();
                const right = r.readUint16();
                const value = r.readInt16();
                pairs[i] = { left, right, value };
                map.set((left << 16) | right, value);
            }
            return { format: 0, ...meta, pairs, map, kern(l, r2) { return map.get((l << 16) | r2) || 0; } };
        }

        return { parseKern };
    }
};
