// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview MATH — OpenType MATH typesetting metadata table.
 *
 * Per [OT spec — MATH](https://learn.microsoft.com/en-us/typography/opentype/spec/math)
 * the table header (v1.0) is :
 *
 * ```
 *   majorVersion         uint16   ( = 1 )
 *   minorVersion         uint16   ( = 0 )
 *   mathConstantsOffset  Offset16 ( from table start )
 *   mathGlyphInfoOffset  Offset16
 *   mathVariantsOffset   Offset16
 * ```
 *
 * The `MathConstants` sub-table is a fixed-layout struct with **89
 * fields**. The first eight are plain `int16` ; the rest are
 * `MathValueRecord`s — a `(value: int16, deviceOffset: Offset16)`
 * pair. The names listed in {@link MATH_CONSTANTS_FIELDS} match the
 * spec verbatim.
 *
 * Scope : parse the header + MathConstants struct. The bodies of
 * MathGlyphInfo and MathVariants are kept as `{ offset, bytes }`
 * blobs — sufficient for round-trip + downstream layout passes that
 * walk those tables themselves.
 *
 * Strict factory body.
 *
 * @module fonts/extra/math
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const extraMath = {
    name: 'extraMath',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        /**
         * 89 MathConstants fields in declaration order. The first 8 are
         * plain `int16` ; the remaining 81 are `MathValueRecord`.
         */
        const MATH_CONSTANTS_FIELDS_ARR = Object.freeze([
    // plain int16 (8) — units / percentages
    'scriptPercentScaleDown',
    'scriptScriptPercentScaleDown',
    'delimitedSubFormulaMinHeight',
    'displayOperatorMinHeight',
    // MathValueRecord (81)
    'mathLeading',
    'axisHeight',
    'accentBaseHeight',
    'flattenedAccentBaseHeight',
    'subscriptShiftDown',
    'subscriptTopMax',
    'subscriptBaselineDropMin',
    'superscriptShiftUp',
    'superscriptShiftUpCramped',
    'superscriptBottomMin',
    'superscriptBaselineDropMax',
    'subSuperscriptGapMin',
    'superscriptBottomMaxWithSubscript',
    'spaceAfterScript',
    'upperLimitGapMin',
    'upperLimitBaselineRiseMin',
    'lowerLimitGapMin',
    'lowerLimitBaselineDropMin',
    'stackTopShiftUp',
    'stackTopDisplayStyleShiftUp',
    'stackBottomShiftDown',
    'stackBottomDisplayStyleShiftDown',
    'stackGapMin',
    'stackDisplayStyleGapMin',
    'stretchStackTopShiftUp',
    'stretchStackBottomShiftDown',
    'stretchStackGapAboveMin',
    'stretchStackGapBelowMin',
    'fractionNumeratorShiftUp',
    'fractionNumeratorDisplayStyleShiftUp',
    'fractionDenominatorShiftDown',
    'fractionDenominatorDisplayStyleShiftDown',
    'fractionNumeratorGapMin',
    'fractionNumeratorDisplayStyleGapMin',
    'fractionRuleThickness',
    'fractionDenominatorGapMin',
    'fractionDenominatorDisplayStyleGapMin',
    'skewedFractionHorizontalGap',
    'skewedFractionVerticalGap',
    'overbarVerticalGap',
    'overbarRuleThickness',
    'overbarExtraAscender',
    'underbarVerticalGap',
    'underbarRuleThickness',
    'underbarExtraDescender',
    'radicalVerticalGap',
    'radicalDisplayStyleVerticalGap',
    'radicalRuleThickness',
    'radicalExtraAscender',
            'radicalKernBeforeDegree',
            'radicalKernAfterDegree'
        ]);

        // Last spec field — int16 (percentage), not a MathValueRecord.
        const MATH_CONSTANTS_TRAILING_INT16 = 'radicalDegreeBottomRaisePercent';

        /** Number of leading plain `int16` fields. */
        const PLAIN_INT16_COUNT = 4;

        const { ParseError } = errors;
        const { BinaryReader } = reader;

        /**
         * Parse a MATH table.
         *
         * @param {Uint8Array} bytes — raw MATH table bytes (offset 0 = table start)
         */
        function parseMath(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/math-input',
                    'parseMath expects a Uint8Array', { context: { actual: typeof bytes } });
            if (bytes.length < 10)
                throw new ParseError('fonts/math-short',
                    'MATH table header truncated', { context: { length: bytes.length } });

            const r = new BinaryReader(bytes);
            const majorVersion = r.readUint16();
            const minorVersion = r.readUint16();
            if (majorVersion !== 1)
                throw new ParseError('fonts/math-version',
                    `unsupported MATH version ${majorVersion}.${minorVersion}`,
                    { context: { majorVersion, minorVersion } });

            const mathConstantsOffset = r.readUint16();
            const mathGlyphInfoOffset = r.readUint16();
            const mathVariantsOffset  = r.readUint16();

            const constants = mathConstantsOffset
                ? readMathConstants(bytes, mathConstantsOffset)
                : null;

            const glyphInfo = mathGlyphInfoOffset
                ? sliceBlob(bytes, mathGlyphInfoOffset)
                : null;
            const variants = mathVariantsOffset
                ? sliceBlob(bytes, mathVariantsOffset)
                : null;

            return {
                majorVersion,
                minorVersion,
                mathConstantsOffset,
                mathGlyphInfoOffset,
                mathVariantsOffset,
                constants,
                glyphInfo,
                variants
            };
        }

        function sliceBlob(bytes, offset) {
            if (offset >= bytes.length)
                throw new ParseError('fonts/math-bad-offset',
                    'MATH sub-table offset out of range',
                    { context: { offset, length: bytes.length } });
            return {
                offset,
                bytes: new Uint8Array(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset)
            };
        }

        function readMathConstants(bytes, offset) {
            // Size = 4 int16 + 51 MathValueRecord (4 bytes) + 1 trailing int16
            //      = 8 + 204 + 2 = 214 bytes
            const SIZE = 4 * 2 + (MATH_CONSTANTS_FIELDS_ARR.length - PLAIN_INT16_COUNT) * 4 + 2;
            if (offset + SIZE > bytes.length)
                throw new ParseError('fonts/math-constants-truncated',
                    'MathConstants sub-table truncated',
                    { context: { offset, need: SIZE, available: bytes.length - offset } });

            const r = new BinaryReader(bytes, offset, SIZE);
            const out = {};
            for (let i = 0; i < PLAIN_INT16_COUNT; i++) {
                out[MATH_CONSTANTS_FIELDS_ARR[i]] = r.readInt16();
            }
            for (let i = PLAIN_INT16_COUNT; i < MATH_CONSTANTS_FIELDS_ARR.length; i++) {
                const value = r.readInt16();
                const deviceOffset = r.readUint16();
                out[MATH_CONSTANTS_FIELDS_ARR[i]] = { value, deviceOffset };
            }
            out[MATH_CONSTANTS_TRAILING_INT16] = r.readInt16();
            return out;
        }

        return { parseMath, MATH_CONSTANTS_FIELDS: MATH_CONSTANTS_FIELDS_ARR };
    }
};

