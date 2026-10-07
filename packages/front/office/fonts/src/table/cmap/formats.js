// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview cmap subtable format parsers.
 *
 * Package-private helpers for {@link ../cmap.js}. Each function parses
 * a single subtable format from a `BinaryReader` positioned at its
 * start (or sub-reader scoped to the subtable bytes).
 *
 * @module fonts/table/cmap/formats
 */

import { fontErrors } from '../../errors.js';

export const tableCmapFormats = {
    name: 'tableCmapFormats',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;

        /**
         * Format 0 — 256-byte direct array (Mac Roman legacy).
         */
        function parseFormat0(r) {
            const format = r.readUint16();
            const length = r.readUint16();
            const language = r.readUint16();
            if (length < 262)
                throw new ParseError('fonts/cmap-fmt0-len', 'format 0 length must be ≥ 262',
                    { context: { length } });
            const glyphIdArray = r.readBytesCopy(256);
            const map = new Map();
            for (let i = 0; i < 256; i++) if (glyphIdArray[i]) map.set(i, glyphIdArray[i]);
            return { format, length, language, glyphIdArray, map };
        }

        /**
         * Format 2 — high-byte / sub-header mapping (Japanese / Chinese
         * Shift-JIS-style encodings).
         */
        function parseFormat2(r) {
            const start = r.pos;
            const format   = r.readUint16();
            const length   = r.readUint16();
            const language = r.readUint16();
            const subHeaderKeys = new Array(256);
            let maxKey = 0;
            for (let i = 0; i < 256; i++) {
                const k = r.readUint16();
                subHeaderKeys[i] = k;
                if (k > maxKey) maxKey = k;
            }
            const numSubHeaders = (maxKey >>> 3) + 1;
            const subHeaders = new Array(numSubHeaders);
            for (let i = 0; i < numSubHeaders; i++) {
                subHeaders[i] = {
                    firstCode:     r.readUint16(),
                    entryCount:    r.readUint16(),
                    idDelta:       r.readInt16(),
                    idRangeOffset: r.readUint16(),
                    _idRangeOffsetPos: r.pos - 2
                };
            }
            const map = new Map();
            for (let i = 0; i < 256; i++) {
                const k = subHeaderKeys[i] >>> 3;
                const sh = subHeaders[k];
                if (k === 0) {
                    // Single-byte char
                    if (i >= sh.firstCode && i < sh.firstCode + sh.entryCount) {
                        const gidPos = sh._idRangeOffsetPos + sh.idRangeOffset + 2 * (i - sh.firstCode);
                        if (gidPos + 2 <= start + length) {
                            const rel = gidPos - start;
                            if (rel >= 0 && rel < length) {
                                const slice = r.peek(rr => { rr.seek(gidPos - start); return rr.readUint16(); });
                                if (slice) map.set(i, (slice + sh.idDelta) & 0xFFFF);
                            }
                        }
                    }
                }
            }
            for (let i = 0; i < 256; i++) {
                const k = subHeaderKeys[i] >>> 3;
                if (k === 0) continue;
                const sh = subHeaders[k];
                for (let j = 0; j < sh.entryCount; j++) {
                    const low = sh.firstCode + j;
                    const cp  = (i << 8) | low;
                    const gidPos = sh._idRangeOffsetPos + sh.idRangeOffset + 2 * j;
                    const rel = gidPos - start;
                    if (rel < 0 || rel + 2 > length) continue;
                    const gid0 = r.peek(rr => { rr.seek(rel); return rr.readUint16(); });
                    if (gid0) map.set(cp, (gid0 + sh.idDelta) & 0xFFFF);
                }
            }
            return { format, length, language, subHeaderKeys, subHeaders, map };
        }

        /** Format 4 — Segment mapping to delta values (Windows BMP). */
        function parseFormat4(r) {
            const format = r.readUint16();
            const length = r.readUint16();
            const language = r.readUint16();
            const segCountX2 = r.readUint16();
            const segCount = segCountX2 / 2;
            r.skip(6);    // searchRange, entrySelector, rangeShift
            const endCode = new Array(segCount);
            for (let i = 0; i < segCount; i++) endCode[i] = r.readUint16();
            r.readUint16();  // reservedPad
            const startCode = new Array(segCount);
            for (let i = 0; i < segCount; i++) startCode[i] = r.readUint16();
            const idDelta = new Array(segCount);
            for (let i = 0; i < segCount; i++) idDelta[i] = r.readInt16();
            const idRangeOffsetPos = r.pos;
            const idRangeOffset = new Array(segCount);
            for (let i = 0; i < segCount; i++) idRangeOffset[i] = r.readUint16();
            // Remaining bytes are glyphIdArray
            const glyphIdStartPos = r.pos;
            const remaining = length - 16 - 8 * segCount;
            const glyphIdArray = remaining > 0 ? r.readBytesCopy(remaining) : new Uint8Array(0);

            const map = new Map();
            for (let i = 0; i < segCount; i++) {
                const start = startCode[i];
                const end = endCode[i];
                if (start === 0xFFFF && end === 0xFFFF) continue;
                for (let c = start; c <= end; c++) {
                    let glyphId;
                    const idro = idRangeOffset[i];
                    if (idro === 0) {
                        glyphId = (c + idDelta[i]) & 0xFFFF;
                    } else {
                        // From OT spec :
                        //   *(idRangeOffset[i]/2 + (c - startCode[i]) + &idRangeOffset[i])
                        const offsetInBytes = idRangeOffsetPos + 2 * i + idro + 2 * (c - start);
                        if (offsetInBytes + 2 > glyphIdStartPos + glyphIdArray.length)
                            continue;
                        const gidPos = offsetInBytes - glyphIdStartPos;
                        if (gidPos < 0) continue;
                        const gid = (glyphIdArray[gidPos] << 8) | glyphIdArray[gidPos + 1];
                        glyphId = gid === 0 ? 0 : (gid + idDelta[i]) & 0xFFFF;
                    }
                    if (glyphId) map.set(c, glyphId);
                }
            }
            return { format, length, language, segments: { startCode, endCode, idDelta, idRangeOffset }, map };
        }

        /** Format 6 — Trimmed table mapping. */
        function parseFormat6(r) {
            const format = r.readUint16();
            const length = r.readUint16();
            const language = r.readUint16();
            const firstCode = r.readUint16();
            const entryCount = r.readUint16();
            const map = new Map();
            for (let i = 0; i < entryCount; i++) {
                const gid = r.readUint16();
                if (gid) map.set(firstCode + i, gid);
            }
            return { format, length, language, firstCode, entryCount, map };
        }

        /**
         * Maximum unicode code-point. Per Unicode standard, valid code-points
         * live in U+0000..U+10FFFF. Fonts declaring ranges above this are
         * malicious or corrupt and we refuse to materialise them.
         */
        const UNICODE_MAX = 0x10FFFF;

        /**
         * Hard cap on the total number of `(codePoint → gid)` entries any
         * single cmap format 12/13 subtable may materialise. Defends against
         * range-bomb fonts declaring e.g. `(start=0, end=0xFFFFFFFF)` which
         * would otherwise allocate 4 billion `Map` entries → OOM/hang.
         *
         * 2,097,152 = 2 × Unicode range (≈ 2 × 0x110000). Generous yet
         * bounded; legitimate Unicode-full fonts use ≤ 1.1M code-points.
         */
        const CMAP_RANGE_HARD_CAP = 2 * (UNICODE_MAX + 1);

        /** Format 12 — Segmented coverage (Unicode full repertoire). */
        function parseFormat12(r) {
            const format = r.readUint16();
            r.skip(2);  // reserved
            const length = r.readUint32();
            const language = r.readUint32();
            const numGroups = r.readUint32();
            const map = new Map();
            const groups = new Array(numGroups);
            let totalRange = 0;
            for (let i = 0; i < numGroups; i++) {
                const startCharCode = r.readUint32();
                const endCharCode   = r.readUint32();
                const startGlyphID  = r.readUint32();
                if (endCharCode < startCharCode || endCharCode > UNICODE_MAX) {
                    throw new ParseError('fonts/cmap-range-bomb',
                        `cmap format 12 group ${i} out of valid Unicode range (${startCharCode}..${endCharCode})`,
                        { context: { format: 12, group: i, startCharCode, endCharCode } });
                }
                totalRange += (endCharCode - startCharCode + 1);
                if (totalRange > CMAP_RANGE_HARD_CAP) {
                    throw new ParseError('fonts/cmap-range-bomb',
                        `cmap format 12 cumulative range exceeds ${CMAP_RANGE_HARD_CAP} entries`,
                        { context: { format: 12, group: i, totalRange, cap: CMAP_RANGE_HARD_CAP } });
                }
                groups[i] = { startCharCode, endCharCode, startGlyphID };
                for (let c = startCharCode; c <= endCharCode; c++) {
                    map.set(c, startGlyphID + (c - startCharCode));
                }
            }
            return { format, length, language, groups, map };
        }

        /** Format 13 — many-to-one mapping (single gid for a code-point range). */
        function parseFormat13(r) {
            const format = r.readUint16();
            r.skip(2);
            const length    = r.readUint32();
            const language  = r.readUint32();
            const numGroups = r.readUint32();
            const map = new Map();
            const groups = new Array(numGroups);
            let totalRange = 0;
            for (let i = 0; i < numGroups; i++) {
                const startCharCode = r.readUint32();
                const endCharCode   = r.readUint32();
                const glyphID       = r.readUint32();
                if (endCharCode < startCharCode || endCharCode > UNICODE_MAX) {
                    throw new ParseError('fonts/cmap-range-bomb',
                        `cmap format 13 group ${i} out of valid Unicode range (${startCharCode}..${endCharCode})`,
                        { context: { format: 13, group: i, startCharCode, endCharCode } });
                }
                totalRange += (endCharCode - startCharCode + 1);
                if (totalRange > CMAP_RANGE_HARD_CAP) {
                    throw new ParseError('fonts/cmap-range-bomb',
                        `cmap format 13 cumulative range exceeds ${CMAP_RANGE_HARD_CAP} entries`,
                        { context: { format: 13, group: i, totalRange, cap: CMAP_RANGE_HARD_CAP } });
                }
                groups[i] = { startCharCode, endCharCode, glyphID };
                for (let c = startCharCode; c <= endCharCode; c++) map.set(c, glyphID);
            }
            return { format, length, language, groups, map };
        }

        /** Format 14 — Unicode Variation Sequences. */
        function parseFormat14(r) {
            const start = r.pos;
            const format = r.readUint16();
            const length = r.readUint32();
            const numVarSelectorRecords = r.readUint32();
            const records = new Array(numVarSelectorRecords);
            for (let i = 0; i < numVarSelectorRecords; i++) {
                records[i] = {
                    varSelector:        r.readUint24(),
                    defaultUVSOffset:   r.readUint32(),
                    nonDefaultUVSOffset: r.readUint32()
                };
            }
            // Resolve default / non-default UVS tables.
            //
            // We use `r.sub(relativeOffset, ...)` to obtain an independent
            // sub-reader scoped to the UVS payload. Previous implementations
            // used `r.peek(rr => { rr.seek(...); return rr; })` which was
            // incorrect: `peek` *restores* the parent cursor on return, so
            // subsequent reads through the captured reference were reading
            // from the original pre-peek position rather than from the seeked
            // sub-table location.
            for (const rec of records) {
                if (rec.defaultUVSOffset) {
                    const rel = rec.defaultUVSOffset;
                    const sub = r.sub(rel, r.length - rel);
                    const numUnicodeValueRanges = sub.readUint32();
                    const ranges = new Array(numUnicodeValueRanges);
                    for (let i = 0; i < numUnicodeValueRanges; i++) {
                        ranges[i] = { startUnicodeValue: sub.readUint24(), additionalCount: sub.readUint8() };
                    }
                    rec.defaultUVS = ranges;
                }
                if (rec.nonDefaultUVSOffset) {
                    const rel = rec.nonDefaultUVSOffset;
                    const sub = r.sub(rel, r.length - rel);
                    const numUVSMappings = sub.readUint32();
                    const mappings = new Array(numUVSMappings);
                    for (let i = 0; i < numUVSMappings; i++) {
                        mappings[i] = { unicodeValue: sub.readUint24(), glyphID: sub.readUint16() };
                    }
                    rec.nonDefaultUVS = mappings;
                }
            }
            // `start` is unused now but kept to document the design intent.
            void start;
            return { format, length, records };
        }

        return { parseFormat0, parseFormat2, parseFormat4, parseFormat6, parseFormat12, parseFormat13, parseFormat14 };
    }
};

