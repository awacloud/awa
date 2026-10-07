// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview COLR v1 Paint graph decoding.
 *
 * Package-private helpers for {@link ../colr.js}. Exposes the
 * `PAINT_FORMAT` / `BLEND_MODES` constants plus the per-paint decoder
 * and the recursive graph walker.
 *
 * Formats 1-32 follow the OpenType 1.9 COLR specification § "Paint
 * tables". The Var formats expose their `varIndexBase`; variation deltas
 * are NOT applied (no rendering, no ItemVariationStore resolution here).
 *
 * @module fonts/table/colr/paint
 */


import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const tableColrPaint = {
    name: 'tableColrPaint',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { BinaryReader } = reader;

        /**
         * Paint table formats 1-32, numbered per the OpenType 1.9 COLR
         * specification § "Paint tables" ("Thirty-two paint table formats
         * are defined (formats 1 to 32)"). Keys are the SCREAMING_SNAKE of
         * the spec table names without the `Paint` prefix.
         */
        const PAINT_FORMAT = Object.freeze({
            COLR_LAYERS:                      1,
            SOLID:                            2,
            VAR_SOLID:                        3,
            LINEAR_GRADIENT:                  4,
            VAR_LINEAR_GRADIENT:              5,
            RADIAL_GRADIENT:                  6,
            VAR_RADIAL_GRADIENT:              7,
            SWEEP_GRADIENT:                   8,
            VAR_SWEEP_GRADIENT:               9,
            GLYPH:                            10,
            COLR_GLYPH:                       11,
            TRANSFORM:                        12,
            VAR_TRANSFORM:                    13,
            TRANSLATE:                        14,
            VAR_TRANSLATE:                    15,
            SCALE:                            16,
            VAR_SCALE:                        17,
            SCALE_AROUND_CENTER:              18,
            VAR_SCALE_AROUND_CENTER:          19,
            SCALE_UNIFORM:                    20,
            VAR_SCALE_UNIFORM:                21,
            SCALE_UNIFORM_AROUND_CENTER:      22,
            VAR_SCALE_UNIFORM_AROUND_CENTER:  23,
            ROTATE:                           24,
            VAR_ROTATE:                       25,
            ROTATE_AROUND_CENTER:             26,
            VAR_ROTATE_AROUND_CENTER:         27,
            SKEW:                             28,
            VAR_SKEW:                         29,
            SKEW_AROUND_CENTER:               30,
            VAR_SKEW_AROUND_CENTER:           31,
            COMPOSITE:                        32
        });

        /** Spec table name per format (index = format; index 0 unused). */
        const PAINT_NAMES = Object.freeze([
            null,
            'PaintColrLayers', 'PaintSolid', 'PaintVarSolid',
            'PaintLinearGradient', 'PaintVarLinearGradient',
            'PaintRadialGradient', 'PaintVarRadialGradient',
            'PaintSweepGradient', 'PaintVarSweepGradient',
            'PaintGlyph', 'PaintColrGlyph',
            'PaintTransform', 'PaintVarTransform',
            'PaintTranslate', 'PaintVarTranslate',
            'PaintScale', 'PaintVarScale',
            'PaintScaleAroundCenter', 'PaintVarScaleAroundCenter',
            'PaintScaleUniform', 'PaintVarScaleUniform',
            'PaintScaleUniformAroundCenter', 'PaintVarScaleUniformAroundCenter',
            'PaintRotate', 'PaintVarRotate',
            'PaintRotateAroundCenter', 'PaintVarRotateAroundCenter',
            'PaintSkew', 'PaintVarSkew',
            'PaintSkewAroundCenter', 'PaintVarSkewAroundCenter',
            'PaintComposite'
        ]);

        // Field layouts of the reduced-precision transform family (formats
        // 16-31), read after the uint8 format + Offset24 paintOffset.
        // `f2` = F2DOT14 (decoded to a float; for angles 1.0 = 180 degrees),
        // `fw` = FWORD (int16 design units). Every Var variant (the odd
        // formats 17-31) appends a uint32 varIndexBase.
        const SCALE_XY = [['scaleX', 'f2'], ['scaleY', 'f2']];
        const SCALE_U  = [['scale', 'f2']];
        const ANGLE    = [['angle', 'f2']];
        const SKEW_XY  = [['xSkewAngle', 'f2'], ['ySkewAngle', 'f2']];
        const CENTER   = [['centerX', 'fw'], ['centerY', 'fw']];
        const TRANSFORM_LAYOUTS = Object.freeze({
            16: SCALE_XY,                 17: SCALE_XY,
            18: [...SCALE_XY, ...CENTER], 19: [...SCALE_XY, ...CENTER],
            20: SCALE_U,                  21: SCALE_U,
            22: [...SCALE_U, ...CENTER],  23: [...SCALE_U, ...CENTER],
            24: ANGLE,                    25: ANGLE,
            26: [...ANGLE, ...CENTER],    27: [...ANGLE, ...CENTER],
            28: SKEW_XY,                  29: SKEW_XY,
            30: [...SKEW_XY, ...CENTER],  31: [...SKEW_XY, ...CENTER]
        });

        const BLEND_MODES = Object.freeze({
            CLEAR:           0,
            SRC:             1,
            DST:             2,
            SRC_OVER:        3,
            DST_OVER:        4,
            SRC_IN:          5,
            DST_IN:          6,
            SRC_OUT:         7,
            DST_OUT:         8,
            SRC_ATOP:        9,
            DST_ATOP:        10,
            XOR:             11,
            PLUS:            12,
            SCREEN:          13,
            OVERLAY:         14,
            DARKEN:          15,
            LIGHTEN:         16,
            COLOR_DODGE:     17,
            COLOR_BURN:      18,
            HARD_LIGHT:      19,
            SOFT_LIGHT:      20,
            DIFFERENCE:      21,
            EXCLUSION:       22,
            MULTIPLY:        23,
            HSL_HUE:         24,
            HSL_SATURATION:  25,
            HSL_COLOR:       26,
            HSL_LUMINOSITY:  27
        });

        /**
         * Decode a ColorLine sub-table at `offset`.
         *  - extend uint8
         *  - numStops uint16
         *  - colorStops[numStops] : F2Dot14 stopOffset, uint16 paletteIndex, F2Dot14 alpha
         */
        function decodeColorLine(bytes, offset) {
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const extend = r.readUint8();
            const numStops = r.readUint16();
            const stops = new Array(numStops);
            for (let i = 0; i < numStops; i++) {
                stops[i] = {
                    stopOffset:   r.readInt16() / 16384,
                    paletteIndex: r.readUint16(),
                    alpha:        r.readInt16() / 16384
                };
            }
            return { extend, numStops, stops };
        }

        /**
         * Decode a Paint record at `offset` within `bytes`.
         *
         * Every format 1-32 of {@link PAINT_FORMAT} decodes into
         * `{ format, name, ...fields }` where `name` is the spec table name
         * (e.g. `'PaintScaleAroundCenter'`). F2DOT14 fields are returned as
         * floats, FWORD / UFWORD fields as integers, child paint offsets as
         * raw Offset24 values relative to this record (`decodePaintGraph`
         * resolves them into `paint` / `paintSrc` / `paintDst`). Var formats
         * carry `varIndexBase`; deltas are not applied. A format outside
         * 1-32 returns `{ format, parsed: false }`.
         */
        function decodePaint(bytes, offset) {
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const format = r.readUint8();
            const name = PAINT_NAMES[format];
            switch (format) {
                case PAINT_FORMAT.COLR_LAYERS: {
                    const numLayers = r.readUint8();
                    const firstLayerIndex = r.readUint32();
                    return { format, name, numLayers, firstLayerIndex };
                }
                case PAINT_FORMAT.SOLID: {
                    const paletteIndex = r.readUint16();
                    const alpha = r.readInt16() / 16384;   // F2Dot14
                    return { format, name, paletteIndex, alpha };
                }
                case PAINT_FORMAT.VAR_SOLID: {
                    const paletteIndex = r.readUint16();
                    const alpha = r.readInt16() / 16384;
                    const varIndexBase = r.readUint32();
                    return { format, name, paletteIndex, alpha, varIndexBase };
                }
                case PAINT_FORMAT.LINEAR_GRADIENT: {
                    const colorLineOffset = r.readUint24();
                    const x0 = r.readInt16(), y0 = r.readInt16();
                    const x1 = r.readInt16(), y1 = r.readInt16();
                    const x2 = r.readInt16(), y2 = r.readInt16();
                    return { format, name, colorLineOffset, x0, y0, x1, y1, x2, y2 };
                }
                case PAINT_FORMAT.VAR_LINEAR_GRADIENT: {
                    const colorLineOffset = r.readUint24();
                    const x0 = r.readInt16(), y0 = r.readInt16();
                    const x1 = r.readInt16(), y1 = r.readInt16();
                    const x2 = r.readInt16(), y2 = r.readInt16();
                    const varIndexBase = r.readUint32();
                    return { format, name, colorLineOffset, x0, y0, x1, y1, x2, y2, varIndexBase };
                }
                case PAINT_FORMAT.RADIAL_GRADIENT: {
                    const colorLineOffset = r.readUint24();
                    const x0 = r.readInt16(), y0 = r.readInt16(), r0 = r.readUint16();
                    const x1 = r.readInt16(), y1 = r.readInt16(), r1 = r.readUint16();
                    return { format, name, colorLineOffset, x0, y0, r0, x1, y1, r1 };
                }
                case PAINT_FORMAT.VAR_RADIAL_GRADIENT: {
                    const colorLineOffset = r.readUint24();
                    const x0 = r.readInt16(), y0 = r.readInt16(), r0 = r.readUint16();
                    const x1 = r.readInt16(), y1 = r.readInt16(), r1 = r.readUint16();
                    const varIndexBase = r.readUint32();
                    return { format, name, colorLineOffset, x0, y0, r0, x1, y1, r1, varIndexBase };
                }
                case PAINT_FORMAT.SWEEP_GRADIENT: {
                    const colorLineOffset = r.readUint24();
                    const centerX = r.readInt16(), centerY = r.readInt16();
                    const startAngle = r.readInt16() / 16384;
                    const endAngle   = r.readInt16() / 16384;
                    return { format, name, colorLineOffset, centerX, centerY, startAngle, endAngle };
                }
                case PAINT_FORMAT.VAR_SWEEP_GRADIENT: {
                    const colorLineOffset = r.readUint24();
                    const centerX = r.readInt16(), centerY = r.readInt16();
                    const startAngle = r.readInt16() / 16384;
                    const endAngle   = r.readInt16() / 16384;
                    const varIndexBase = r.readUint32();
                    return { format, name, colorLineOffset, centerX, centerY, startAngle, endAngle, varIndexBase };
                }
                case PAINT_FORMAT.GLYPH: {
                    const paintOffset = r.readUint24();
                    const glyphID = r.readUint16();
                    return { format, name, paintOffset, glyphID };
                }
                case PAINT_FORMAT.COLR_GLYPH: {
                    const glyphID = r.readUint16();
                    return { format, name, glyphID };
                }
                case PAINT_FORMAT.TRANSFORM:
                case PAINT_FORMAT.VAR_TRANSFORM: {
                    // Spec field name: transformOffset (to an Affine2x3 /
                    // VarAffine2x3 table, from the beginning of this paint).
                    const paintOffset = r.readUint24();
                    const affineOffset = r.readUint24();
                    return { format, name, paintOffset, affineOffset };
                }
                case PAINT_FORMAT.TRANSLATE: {
                    const paintOffset = r.readUint24();
                    const dx = r.readInt16(), dy = r.readInt16();
                    return { format, name, paintOffset, dx, dy };
                }
                case PAINT_FORMAT.VAR_TRANSLATE: {
                    const paintOffset = r.readUint24();
                    const dx = r.readInt16(), dy = r.readInt16();
                    const varIndexBase = r.readUint32();
                    return { format, name, paintOffset, dx, dy, varIndexBase };
                }
                case PAINT_FORMAT.COMPOSITE: {
                    // Spec field names: sourcePaintOffset / backdropPaintOffset.
                    const paintOffsetSrc = r.readUint24();
                    const compositeMode  = r.readUint8();
                    const paintOffsetDst = r.readUint24();
                    return { format, name, paintOffsetSrc, compositeMode, paintOffsetDst };
                }
                default: {
                    const layout = TRANSFORM_LAYOUTS[format];
                    if (!layout) return { format, parsed: false };
                    // Formats 16-31: the scale / rotate / skew family.
                    const node = { format, name, paintOffset: r.readUint24() };
                    for (const [field, type] of layout)
                        node[field] = type === 'f2' ? r.readInt16() / 16384 : r.readInt16();
                    if (format % 2 === 1) node.varIndexBase = r.readUint32();
                    return node;
                }
            }
        }

        /**
         * Recursively decode a Paint subtree starting at `rootOffset` within
         * `bytes`. Child paint offsets are relative to their parent paint record.
         * Walks up to `maxDepth` levels then returns `{ truncated: true }`.
         *
         * Tracks visited offsets to break accidental cycles (treats them as
         * `{ cycle: true }`).
         *
         * @param {Uint8Array} bytes
         * @param {number} rootOffset
         * @param {number} [maxDepth=16]
         */
        function decodePaintGraph(bytes, rootOffset, maxDepth = 16) {
            const visited = new Set();
            function walk(absoluteOffset, depth) {
                if (depth > maxDepth) return { truncated: true, offset: absoluteOffset };
                if (visited.has(absoluteOffset))
                    return { cycle: true, offset: absoluteOffset };
                visited.add(absoluteOffset);
                const node = decodePaint(bytes, absoluteOffset);
                node.offset = absoluteOffset;
                // resolve children
                if (node.paintOffset)
                    node.paint = walk(absoluteOffset + node.paintOffset, depth + 1);
                if (node.paintOffsetSrc)
                    node.paintSrc = walk(absoluteOffset + node.paintOffsetSrc, depth + 1);
                if (node.paintOffsetDst)
                    node.paintDst = walk(absoluteOffset + node.paintOffsetDst, depth + 1);
                visited.delete(absoluteOffset);
                return node;
            }
            return walk(rootOffset, 0);
        }

        return { PAINT_FORMAT, BLEND_MODES, decodeColorLine, decodePaint, decodePaintGraph };
    }
};
