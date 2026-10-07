// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `glyf` — Glyph Data (OT §6.4.12, TT §1.2).
 *
 * Each glyph is either **simple** (its own contours) or **composite**
 * (a transformation of other glyphs). All glyphs start with the same
 * header :
 *
 * ```
 *   int16 numberOfContours  ( ≥ 0 simple ; < 0 composite )
 *   int16 xMin, yMin, xMax, yMax
 * ```
 *
 * ### Simple glyph
 *
 * ```
 *   uint16  endPtsOfContours[numberOfContours]
 *   uint16  instructionLength
 *   uint8   instructions[instructionLength]
 *   uint8   flags[]   ( length determined by point count + REPEAT_FLAG bit )
 *   int8|int16  xCoords[]  ( delta from previous, sign / size encoded in flag bits )
 *   int8|int16  yCoords[]
 * ```
 *
 * Flag bits :
 *  - 0x01 ON_CURVE_POINT
 *  - 0x02 X_SHORT_VECTOR
 *  - 0x04 Y_SHORT_VECTOR
 *  - 0x08 REPEAT_FLAG
 *  - 0x10 X_IS_SAME (when X_SHORT_VECTOR clear) or POSITIVE_X_SHORT_VECTOR
 *  - 0x20 Y_IS_SAME or POSITIVE_Y_SHORT_VECTOR
 *  - 0x40 OVERLAP_SIMPLE
 *
 * ### Composite glyph
 *
 * A sequence of component records, each beginning with flags+glyphIndex,
 * optionally followed by arg1/arg2 (offsets or anchor points) and a
 * 2×2 transform.
 *
 * @module fonts/table/glyf
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableGlyf = {
    name: 'tableGlyf',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        const GLYF_FLAG = Object.freeze({
            ON_CURVE: 0x01,
            X_SHORT:  0x02,
            Y_SHORT:  0x04,
            REPEAT:   0x08,
            X_SAME_OR_POS: 0x10,
            Y_SAME_OR_POS: 0x20,
            OVERLAP_SIMPLE: 0x40
        });

        const COMPONENT_FLAG = Object.freeze({
            ARG_1_AND_2_ARE_WORDS:    0x0001,
            ARGS_ARE_XY_VALUES:       0x0002,
            ROUND_XY_TO_GRID:         0x0004,
            WE_HAVE_A_SCALE:          0x0008,
            MORE_COMPONENTS:          0x0020,
            WE_HAVE_AN_X_AND_Y_SCALE: 0x0040,
            WE_HAVE_A_TWO_BY_TWO:     0x0080,
            WE_HAVE_INSTRUCTIONS:     0x0100,
            USE_MY_METRICS:           0x0200,
            OVERLAP_COMPOUND:         0x0400,
            SCALED_COMPONENT_OFFSET:  0x0800,
            UNSCALED_COMPONENT_OFFSET:0x1000
        });

        /**
         * Parse a single glyph's bytes (slice produced from loca offsets).
         *
         * @param {Uint8Array} bytes
         * @returns {object|null}  empty glyph (bytes.length === 0) yields null
         */
        function parseGlyph(bytes) {
            if (bytes.length === 0) return null;
            if (bytes.length < 10)
                throw new ParseError('fonts/glyf-short', 'glyph header truncated',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const numberOfContours = r.readInt16();
            const xMin = r.readInt16();
            const yMin = r.readInt16();
            const xMax = r.readInt16();
            const yMax = r.readInt16();
            if (numberOfContours >= 0) return parseSimpleGlyph(r, numberOfContours, { xMin, yMin, xMax, yMax });
            return parseCompositeGlyph(r, { xMin, yMin, xMax, yMax });
        }

        function parseSimpleGlyph(r, numberOfContours, bbox) {
            const endPts = new Array(numberOfContours);
            let lastPt = -1;
            for (let i = 0; i < numberOfContours; i++) {
                endPts[i] = r.readUint16();
                if (endPts[i] > 0xFFFE) throw new ParseError('fonts/glyf-endpts', 'glyf endpoint index too large');
                lastPt = endPts[i];
            }
            const numPoints = lastPt + 1;
            const instructionLength = r.readUint16();
            const instructions = instructionLength > 0 ? r.readBytesCopy(instructionLength) : new Uint8Array(0);

            // Flags: read until we have `numPoints` flag values (REPEAT byte expands)
            const flags = new Uint8Array(numPoints);
            let idx = 0;
            while (idx < numPoints) {
                const f = r.readUint8();
                flags[idx++] = f;
                if (f & GLYF_FLAG.REPEAT) {
                    const repeat = r.readUint8();
                    for (let k = 0; k < repeat; k++) flags[idx++] = f;
                }
            }
            // X coords
            const xCoords = new Int16Array(numPoints);
            let x = 0;
            for (let i = 0; i < numPoints; i++) {
                const f = flags[i];
                if (f & GLYF_FLAG.X_SHORT) {
                    const d = r.readUint8();
                    x += (f & GLYF_FLAG.X_SAME_OR_POS) ? d : -d;
                } else if (!(f & GLYF_FLAG.X_SAME_OR_POS)) {
                    x += r.readInt16();
                }
                xCoords[i] = x;
            }
            // Y coords
            const yCoords = new Int16Array(numPoints);
            let y = 0;
            for (let i = 0; i < numPoints; i++) {
                const f = flags[i];
                if (f & GLYF_FLAG.Y_SHORT) {
                    const d = r.readUint8();
                    y += (f & GLYF_FLAG.Y_SAME_OR_POS) ? d : -d;
                } else if (!(f & GLYF_FLAG.Y_SAME_OR_POS)) {
                    y += r.readInt16();
                }
                yCoords[i] = y;
            }
            const points = new Array(numPoints);
            for (let i = 0; i < numPoints; i++) {
                points[i] = { x: xCoords[i], y: yCoords[i], onCurve: !!(flags[i] & GLYF_FLAG.ON_CURVE) };
            }
            return {
                kind: 'simple',
                bbox,
                numberOfContours,
                endPtsOfContours: endPts,
                instructions,
                points
            };
        }

        /**
         * Hard cap on the number of components a single composite glyph may
         * declare. The OpenType `maxp.maxComponentElements` field is a uint16,
         * and `MAX_COMPONENT_ELEMENTS` is recommended by Microsoft's font
         * validator as ≤ 8 in well-behaved fonts. We pick a generous 256 to
         * accommodate ornate Indic/CJK glyphs while still bounding the parser.
         *
         * Without this cap, a malicious font can declare millions of
         * components (each with `MORE_COMPONENTS` flag set) → OOM / hang.
         * `compositeResolve.js` enforces a depth cap (`MAX_DEPTH=16`) but not
         * width.
         */
        const MAX_COMPOSITE_COMPONENTS = 256;

        function parseCompositeGlyph(r, bbox) {
            const components = [];
            let hasInstructions = false;
            let flags;
            do {
                if (components.length >= MAX_COMPOSITE_COMPONENTS)
                    throw new ParseError('fonts/glyf-too-many-components',
                        `composite glyph exceeds ${MAX_COMPOSITE_COMPONENTS} components`,
                        { context: { cap: MAX_COMPOSITE_COMPONENTS } });
                flags = r.readUint16();
                const glyphIndex = r.readUint16();
                let arg1, arg2;
                if (flags & COMPONENT_FLAG.ARG_1_AND_2_ARE_WORDS) {
                    if (flags & COMPONENT_FLAG.ARGS_ARE_XY_VALUES) {
                        arg1 = r.readInt16(); arg2 = r.readInt16();
                    } else {
                        arg1 = r.readUint16(); arg2 = r.readUint16();
                    }
                } else {
                    if (flags & COMPONENT_FLAG.ARGS_ARE_XY_VALUES) {
                        arg1 = r.readInt8(); arg2 = r.readInt8();
                    } else {
                        arg1 = r.readUint8(); arg2 = r.readUint8();
                    }
                }
                let a = 1, b = 0, c = 0, d = 1;
                if (flags & COMPONENT_FLAG.WE_HAVE_A_SCALE) {
                    const s = r.readF2Dot14();
                    a = d = s;
                } else if (flags & COMPONENT_FLAG.WE_HAVE_AN_X_AND_Y_SCALE) {
                    a = r.readF2Dot14();
                    d = r.readF2Dot14();
                } else if (flags & COMPONENT_FLAG.WE_HAVE_A_TWO_BY_TWO) {
                    a = r.readF2Dot14(); b = r.readF2Dot14();
                    c = r.readF2Dot14(); d = r.readF2Dot14();
                }
                if (flags & COMPONENT_FLAG.WE_HAVE_INSTRUCTIONS) hasInstructions = true;
                components.push({
                    flags, glyphIndex, arg1, arg2,
                    xy: !!(flags & COMPONENT_FLAG.ARGS_ARE_XY_VALUES),
                    transform: { a, b, c, d },
                    useMyMetrics: !!(flags & COMPONENT_FLAG.USE_MY_METRICS)
                });
            } while (flags & COMPONENT_FLAG.MORE_COMPONENTS);
            let instructions = new Uint8Array(0);
            if (hasInstructions) {
                const len = r.readUint16();
                instructions = len > 0 ? r.readBytesCopy(len) : new Uint8Array(0);
            }
            return { kind: 'composite', bbox, components, instructions };
        }

        /**
         * Parse the whole glyf table given a loca offsets array.
         *
         * @returns {Array<object|null>}  one entry per glyph
         */
        function parseGlyf(bytes, locaOffsets) {
            const out = new Array(locaOffsets.length - 1);
            for (let i = 0; i < out.length; i++) {
                const start = locaOffsets[i];
                const end   = locaOffsets[i + 1];
                if (end < start || end > bytes.length)
                    throw new ParseError('fonts/glyf-loca-range',
                        `glyph ${i} loca range invalid (${start}..${end}, glyf=${bytes.length})`,
                        { context: { glyph: i, start, end, glyfLength: bytes.length } });
                const slice = new Uint8Array(bytes.buffer, bytes.byteOffset + start, end - start);
                out[i] = parseGlyph(slice);
            }
            return out;
        }

        return { parseGlyph, parseGlyf, GLYF_FLAG, COMPONENT_FLAG };
    }
};
