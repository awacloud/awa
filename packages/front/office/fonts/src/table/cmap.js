// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `cmap` — Character to Glyph Index Mapping (OT §6.4.1).
 *
 * Top-level layout :
 *
 * ```
 *   version  uint16  (= 0)
 *   numTables uint16
 *   encodingRecords[numTables] :
 *       platformID uint16, encodingID uint16, subtableOffset uint32
 * ```
 *
 * Each subtable starts with a `format uint16`. The parsed formats are :
 *
 *  - **Format 0** : 256-byte direct array (Mac Roman legacy)
 *  - **Format 2** : High-byte mapping (legacy CJK)
 *  - **Format 4** : Segment mapping to delta values (Windows BMP)
 *  - **Format 6** : Trimmed table mapping
 *  - **Format 12** : Segmented coverage (Unicode full repertoire)
 *  - **Format 13** : Many-to-one segmented coverage
 *  - **Format 14** : Unicode Variation Sequences
 *
 * Other formats (8, 10, …) are recognised in metadata only
 * (`{ format, parsed: false, length }`) and left unparsed.
 *
 * Per-format parsers live in `./cmap/formats.js`.
 *
 * @module fonts/table/cmap
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { tableCmapFormats } from './cmap/formats.js';

export const tableCmap = {
    name: 'tableCmap',
    dependencies: ['fontErrors', 'fontReader', 'tableCmapFormats'],
    deps: [fontErrors, fontReader, tableCmapFormats],
    factory(errors, reader, formats) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const {
            parseFormat0, parseFormat2, parseFormat4, parseFormat6,
            parseFormat12, parseFormat13, parseFormat14
        } = formats;

        /**
         * Hard cap on the number of cmap subtables. Real fonts have 1–5.
         * Capping prevents allocation DoS on a malicious cmap that declares
         * tens of thousands of records.
         */
        const CMAP_NUM_TABLES_MAX = 64;

        /** Parse a cmap subtable from a sub-reader positioned at its start. */
        function parseSubtable(r) {
            const format = r.peek(rr => rr.readUint16());
            switch (format) {
                case 0:  return parseFormat0(r);
                case 2:  return parseFormat2(r);
                case 4:  return parseFormat4(r);
                case 6:  return parseFormat6(r);
                case 12: return parseFormat12(r);
                case 13: return parseFormat13(r);
                case 14: return parseFormat14(r);
                default: {
                    const length = format <= 6 ? r.peek(rr => { rr.readUint16(); return rr.readUint16(); }) : null;
                    return { format, parsed: false, length };
                }
            }
        }

        /**
         * Parse the cmap table.
         *
         * @param {Uint8Array} bytes
         * @returns {{ version:number, encodings: Array<{platformID, encodingID, subtableOffset, subtable: object}> }}
         */
        function parseCmap(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/cmap-short', 'cmap header truncated');
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            const numTables = r.readUint16();
            if (numTables > CMAP_NUM_TABLES_MAX)
                throw new ParseError('fonts/cmap-too-many-subtables',
                    `cmap declares ${numTables} subtables (cap ${CMAP_NUM_TABLES_MAX})`,
                    { context: { numTables, cap: CMAP_NUM_TABLES_MAX } });
            const records = new Array(numTables);
            for (let i = 0; i < numTables; i++) {
                records[i] = {
                    platformID: r.readUint16(),
                    encodingID: r.readUint16(),
                    subtableOffset: r.readUint32()
                };
            }
            const encodings = records.map(rec => {
                if (rec.subtableOffset >= bytes.length)
                    throw new ParseError('fonts/cmap-bad-offset',
                        `cmap subtable offset ${rec.subtableOffset} exceeds table (${bytes.length})`,
                        { context: rec });
                const sub = r.sub(rec.subtableOffset, bytes.length - rec.subtableOffset);
                return { ...rec, subtable: parseSubtable(sub) };
            });
            return { version, encodings };
        }

        /**
         * Pick the best (platformID, encodingID) subtable for general Unicode
         * usage and return its `Map<codePoint, glyphID>`. Preference order:
         *
         *  1. Windows / Unicode full repertoire (3,10)
         *  2. Unicode platform / Unicode 2.0 full (0,4)
         *  3. Windows / Unicode BMP (3,1)
         *  4. Unicode platform / any
         *  5. anything that has a `.map`
         */
        function pickUnicodeMap(cmap) {
            const prefer = [
                rec => rec.platformID === 3 && rec.encodingID === 10,
                rec => rec.platformID === 0 && rec.encodingID === 4,
                rec => rec.platformID === 3 && rec.encodingID === 1,
                rec => rec.platformID === 0,
                rec => !!(rec.subtable && rec.subtable.map)
            ];
            for (const pred of prefer) {
                for (const rec of cmap.encodings) {
                    if (!rec.subtable || !rec.subtable.map) continue;
                    if (pred(rec)) return rec.subtable.map;
                }
            }
            return null;
        }

        return { parseCmap, pickUnicodeMap };
    }
};

