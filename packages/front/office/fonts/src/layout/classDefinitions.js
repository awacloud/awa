// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Coverage + ClassDef parsers — the two indexing
 * primitives that every GSUB / GPOS / GDEF lookup uses (OT §6.2).
 *
 * **Coverage table** : maps a glyph index to a 0-based coverage index
 * (or returns null if the glyph isn't covered).
 *
 *  - Format 1 : sorted list of glyph IDs
 *  - Format 2 : sorted list of `(startGlyphID, endGlyphID, startCoverageIndex)` ranges
 *
 * **ClassDef table** : maps a glyph index to a class number (uint16),
 * with implicit class 0 for unmapped glyphs.
 *
 *  - Format 1 : `startGlyphID + classValueArray[glyphCount]`
 *  - Format 2 : sorted list of `(start, end, class)` ranges
 *
 * Each returns a typed POJO with a `lookup(gid)` helper for ergonomic
 * use by the lookup-application code.
 *
 * Strict factory body.
 *
 * @module fonts/layout/classDefinitions
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const layoutClassDefinitions = {
    name: 'layoutClassDefinitions',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        /**
         * Parse a Coverage table from a reader window starting at offset 0.
         *
         * @param {Uint8Array} bytes
         * @returns {{ format: 1|2, lookup: (gid:number) => number|null, glyphs?: number[], ranges?: Array }}
         */
        function parseCoverage(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/coverage-short', 'Coverage table truncated');
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format === 1) {
                const glyphCount = r.readUint16();
                const glyphs = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) glyphs[i] = r.readUint16();
                return {
                    format,
                    glyphs,
                    lookup(gid) {
                        // glyphs[] is sorted — binary search
                        let lo = 0, hi = glyphs.length - 1;
                        while (lo <= hi) {
                            const m = (lo + hi) >>> 1;
                            if (glyphs[m] === gid) return m;
                            if (glyphs[m] < gid) lo = m + 1; else hi = m - 1;
                        }
                        return null;
                    }
                };
            }
            if (format === 2) {
                const rangeCount = r.readUint16();
                const ranges = new Array(rangeCount);
                for (let i = 0; i < rangeCount; i++) {
                    ranges[i] = {
                        startGlyphID:      r.readUint16(),
                        endGlyphID:        r.readUint16(),
                        startCoverageIndex: r.readUint16()
                    };
                }
                return {
                    format,
                    ranges,
                    lookup(gid) {
                        let lo = 0, hi = ranges.length - 1;
                        while (lo <= hi) {
                            const m = (lo + hi) >>> 1;
                            const r2 = ranges[m];
                            if (gid < r2.startGlyphID) hi = m - 1;
                            else if (gid > r2.endGlyphID) lo = m + 1;
                            else return r2.startCoverageIndex + (gid - r2.startGlyphID);
                        }
                        return null;
                    }
                };
            }
            throw new ParseError('fonts/coverage-format', `unsupported Coverage format ${format}`,
                { context: { format } });
        }

        /**
         * Parse a ClassDef table.
         *
         * @param {Uint8Array} bytes
         * @returns {{ format: 1|2, lookup: (gid:number) => number }}
         */
        function parseClassDef(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/classdef-short', 'ClassDef table truncated');
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format === 1) {
                const startGlyphID = r.readUint16();
                const glyphCount   = r.readUint16();
                const classes = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) classes[i] = r.readUint16();
                return {
                    format, startGlyphID, classes,
                    lookup(gid) {
                        const k = gid - startGlyphID;
                        if (k < 0 || k >= glyphCount) return 0;
                        return classes[k];
                    }
                };
            }
            if (format === 2) {
                const classRangeCount = r.readUint16();
                const ranges = new Array(classRangeCount);
                for (let i = 0; i < classRangeCount; i++) {
                    ranges[i] = {
                        startGlyphID: r.readUint16(),
                        endGlyphID:   r.readUint16(),
                        class_:       r.readUint16()
                    };
                }
                return {
                    format, ranges,
                    lookup(gid) {
                        let lo = 0, hi = ranges.length - 1;
                        while (lo <= hi) {
                            const m = (lo + hi) >>> 1;
                            const r2 = ranges[m];
                            if (gid < r2.startGlyphID) hi = m - 1;
                            else if (gid > r2.endGlyphID) lo = m + 1;
                            else return r2.class_;
                        }
                        return 0;
                    }
                };
            }
            throw new ParseError('fonts/classdef-format', `unsupported ClassDef format ${format}`,
                { context: { format } });
        }

        return { parseCoverage, parseClassDef };
    }
};
