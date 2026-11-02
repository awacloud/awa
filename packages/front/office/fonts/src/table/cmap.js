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

        // Mac OS code pages of the Roman script (cmap platform 1, encoding 0):
        // bytes 0x80..0xFF -> Unicode, from Apple's mapping files
        // (VENDORS/APPLE/ROMAN, ICELAND, TURKISH, CROATIAN, ROMANIAN.TXT).
        const MAC_ROMAN =
            '\u00C4\u00C5\u00C7\u00C9\u00D1\u00D6\u00DC\u00E1\u00E0\u00E2\u00E4\u00E3\u00E5\u00E7\u00E9\u00E8' +
            '\u00EA\u00EB\u00ED\u00EC\u00EE\u00EF\u00F1\u00F3\u00F2\u00F4\u00F6\u00F5\u00FA\u00F9\u00FB\u00FC' +
            '\u2020\u00B0\u00A2\u00A3\u00A7\u2022\u00B6\u00DF\u00AE\u00A9\u2122\u00B4\u00A8\u2260\u00C6\u00D8' +
            '\u221E\u00B1\u2264\u2265\u00A5\u00B5\u2202\u2211\u220F\u03C0\u222B\u00AA\u00BA\u03A9\u00E6\u00F8' +
            '\u00BF\u00A1\u00AC\u221A\u0192\u2248\u2206\u00AB\u00BB\u2026\u00A0\u00C0\u00C3\u00D5\u0152\u0153' +
            '\u2013\u2014\u201C\u201D\u2018\u2019\u00F7\u25CA\u00FF\u0178\u2044\u20AC\u2039\u203A\uFB01\uFB02' +
            '\u2021\u00B7\u201A\u201E\u2030\u00C2\u00CA\u00C1\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u00D3\u00D4' +
            '\uF8FF\u00D2\u00DA\u00DB\u00D9\u0131\u02C6\u02DC\u00AF\u02D8\u02D9\u02DA\u00B8\u02DD\u02DB\u02C7';
        const MAC_ICELAND =
            '\u00C4\u00C5\u00C7\u00C9\u00D1\u00D6\u00DC\u00E1\u00E0\u00E2\u00E4\u00E3\u00E5\u00E7\u00E9\u00E8' +
            '\u00EA\u00EB\u00ED\u00EC\u00EE\u00EF\u00F1\u00F3\u00F2\u00F4\u00F6\u00F5\u00FA\u00F9\u00FB\u00FC' +
            '\u00DD\u00B0\u00A2\u00A3\u00A7\u2022\u00B6\u00DF\u00AE\u00A9\u2122\u00B4\u00A8\u2260\u00C6\u00D8' +
            '\u221E\u00B1\u2264\u2265\u00A5\u00B5\u2202\u2211\u220F\u03C0\u222B\u00AA\u00BA\u03A9\u00E6\u00F8' +
            '\u00BF\u00A1\u00AC\u221A\u0192\u2248\u2206\u00AB\u00BB\u2026\u00A0\u00C0\u00C3\u00D5\u0152\u0153' +
            '\u2013\u2014\u201C\u201D\u2018\u2019\u00F7\u25CA\u00FF\u0178\u2044\u20AC\u00D0\u00F0\u00DE\u00FE' +
            '\u00FD\u00B7\u201A\u201E\u2030\u00C2\u00CA\u00C1\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u00D3\u00D4' +
            '\uF8FF\u00D2\u00DA\u00DB\u00D9\u0131\u02C6\u02DC\u00AF\u02D8\u02D9\u02DA\u00B8\u02DD\u02DB\u02C7';
        const MAC_TURKISH =
            '\u00C4\u00C5\u00C7\u00C9\u00D1\u00D6\u00DC\u00E1\u00E0\u00E2\u00E4\u00E3\u00E5\u00E7\u00E9\u00E8' +
            '\u00EA\u00EB\u00ED\u00EC\u00EE\u00EF\u00F1\u00F3\u00F2\u00F4\u00F6\u00F5\u00FA\u00F9\u00FB\u00FC' +
            '\u2020\u00B0\u00A2\u00A3\u00A7\u2022\u00B6\u00DF\u00AE\u00A9\u2122\u00B4\u00A8\u2260\u00C6\u00D8' +
            '\u221E\u00B1\u2264\u2265\u00A5\u00B5\u2202\u2211\u220F\u03C0\u222B\u00AA\u00BA\u03A9\u00E6\u00F8' +
            '\u00BF\u00A1\u00AC\u221A\u0192\u2248\u2206\u00AB\u00BB\u2026\u00A0\u00C0\u00C3\u00D5\u0152\u0153' +
            '\u2013\u2014\u201C\u201D\u2018\u2019\u00F7\u25CA\u00FF\u0178\u011E\u011F\u0130\u0131\u015E\u015F' +
            '\u2021\u00B7\u201A\u201E\u2030\u00C2\u00CA\u00C1\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u00D3\u00D4' +
            '\uF8FF\u00D2\u00DA\u00DB\u00D9\uF8A0\u02C6\u02DC\u00AF\u02D8\u02D9\u02DA\u00B8\u02DD\u02DB\u02C7';
        const MAC_CROATIAN =
            '\u00C4\u00C5\u00C7\u00C9\u00D1\u00D6\u00DC\u00E1\u00E0\u00E2\u00E4\u00E3\u00E5\u00E7\u00E9\u00E8' +
            '\u00EA\u00EB\u00ED\u00EC\u00EE\u00EF\u00F1\u00F3\u00F2\u00F4\u00F6\u00F5\u00FA\u00F9\u00FB\u00FC' +
            '\u2020\u00B0\u00A2\u00A3\u00A7\u2022\u00B6\u00DF\u00AE\u0160\u2122\u00B4\u00A8\u2260\u017D\u00D8' +
            '\u221E\u00B1\u2264\u2265\u2206\u00B5\u2202\u2211\u220F\u0161\u222B\u00AA\u00BA\u03A9\u017E\u00F8' +
            '\u00BF\u00A1\u00AC\u221A\u0192\u2248\u0106\u00AB\u010C\u2026\u00A0\u00C0\u00C3\u00D5\u0152\u0153' +
            '\u0110\u2014\u201C\u201D\u2018\u2019\u00F7\u25CA\uF8FF\u00A9\u2044\u20AC\u2039\u203A\u00C6\u00BB' +
            '\u2013\u00B7\u201A\u201E\u2030\u00C2\u0107\u00C1\u010D\u00C8\u00CD\u00CE\u00CF\u00CC\u00D3\u00D4' +
            '\u0111\u00D2\u00DA\u00DB\u00D9\u0131\u02C6\u02DC\u00AF\u03C0\u00CB\u02DA\u00B8\u00CA\u00E6\u02C7';
        const MAC_ROMANIAN =
            '\u00C4\u00C5\u00C7\u00C9\u00D1\u00D6\u00DC\u00E1\u00E0\u00E2\u00E4\u00E3\u00E5\u00E7\u00E9\u00E8' +
            '\u00EA\u00EB\u00ED\u00EC\u00EE\u00EF\u00F1\u00F3\u00F2\u00F4\u00F6\u00F5\u00FA\u00F9\u00FB\u00FC' +
            '\u2020\u00B0\u00A2\u00A3\u00A7\u2022\u00B6\u00DF\u00AE\u00A9\u2122\u00B4\u00A8\u2260\u0102\u0218' +
            '\u221E\u00B1\u2264\u2265\u00A5\u00B5\u2202\u2211\u220F\u03C0\u222B\u00AA\u00BA\u03A9\u0103\u0219' +
            '\u00BF\u00A1\u00AC\u221A\u0192\u2248\u2206\u00AB\u00BB\u2026\u00A0\u00C0\u00C3\u00D5\u0152\u0153' +
            '\u2013\u2014\u201C\u201D\u2018\u2019\u00F7\u25CA\u00FF\u0178\u2044\u20AC\u2039\u203A\u021A\u021B' +
            '\u2021\u00B7\u201A\u201E\u2030\u00C2\u00CA\u00C1\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u00D3\u00D4' +
            '\uF8FF\u00D2\u00DA\u00DB\u00D9\u0131\u02C6\u02DC\u00AF\u02D8\u02D9\u02DA\u00B8\u02DD\u02DB\u02C7';
        /** A Mac cmap subtable's `language` (Mac language ID + 1) -> its code page; any other: Roman. */
        const MAC_ROMAN_SCRIPT_PAGES = { 16: MAC_ICELAND, 18: MAC_TURKISH, 19: MAC_CROATIAN, 38: MAC_ROMANIAN };

        /**
         * The Unicode map of a Macintosh Roman-script subtable: each byte code
         * read through the code page its `language` names (below 0x80, itself).
         */
        function macRomanScriptMap(subtable) {
            const page = MAC_ROMAN_SCRIPT_PAGES[subtable.language] || MAC_ROMAN;
            const out = new Map();
            for (const [code, gid] of subtable.map) {
                if (code > 0xFF) continue;
                out.set(code < 0x80 ? code : page.charCodeAt(code - 0x80), gid);
            }
            return out;
        }

        /**
         * Pick the best (platformID, encodingID) subtable for general Unicode
         * usage and return its `Map<codePoint, glyphID>`. Preference order:
         *
         *  1. Windows / Unicode full repertoire (3,10)
         *  2. Unicode platform / Unicode 2.0 full (0,4)
         *  3. Windows / Unicode BMP (3,1)
         *  4. Unicode platform / any
         *  5. anything that has a `.map` — a Macintosh Roman-script (1,0)
         *     subtable translated through its Mac OS code page
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
                    if (!pred(rec)) continue;
                    // A Macintosh Roman-script subtable holds byte codes, not code points.
                    return rec.platformID === 1 && rec.encodingID === 0
                        ? macRomanScriptMap(rec.subtable) : rec.subtable.map;
                }
            }
            return null;
        }

        return { parseCmap, pickUnicodeMap };
    }
};

