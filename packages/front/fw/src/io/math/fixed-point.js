// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Fixed-point ↔ float conversions for binary format I/O.
 * Supports Fixed16.16 (signed/unsigned), F2Dot14, FUnit (for fonts),
 * plus a generic helper for arbitrary bit splits.
 *
 * @example
 * const fp = registry.resolve('fixedPoint');
 * fp.f2dot14ToFloat(0x4000); // → 1.0
 * fp.fixed16ToFloat(0xFFFF0000); // → -1.0 (signed)
 * fp.funitToPx(2048, 16, 1024); // → 8.0
 */

/**
 * Object returned by `fixedPoint.factory()`.
 * @typedef {object} FixedPointAPI
 * @property {(raw: number) => number} fixed16ToFloat
 * @property {(value: number, opts?: object) => number} floatToFixed16
 * @property {(raw: number) => number} ufixed16ToFloat
 * @property {(value: number, opts?: object) => number} floatToUfixed16
 * @property {(raw: number) => number} f2dot14ToFloat
 * @property {(value: number, opts?: object) => number} floatToF2dot14
 * @property {(unitsPerEm: number, fontSize: number, funit: number) => number} funitToPx
 * @property {(raw: number, intBits: number, fracBits: number, signed?: boolean) => number} fixedToFloat
 * @property {(value: number, intBits: number, fracBits: number, signed?: boolean, opts?: { strict?: boolean }) => number} floatToFixed
 */

export const fixedPoint = {
    name: 'fixedPoint',
    version: '1.0.0',
    type: 'fw.io.math',
    dependencies: [],

    /** @returns {FixedPointAPI} */
    factory() {

        /**
         * Generic fixed-point raw integer → float.
         *
         * For `totalBits === 32`, JavaScript's `<<` operator wraps modulo 32,
         * so this generic helper uses `Math.pow(2, n)` for sign extension and
         * normalization. For totalBits > 32 the function is inaccurate due to
         * float precision - use BigInt-based code in that regime.
         *
         * @param {number} raw       Raw integer value (unsigned bit pattern).
         * @param {number} intBits   Number of integer bits (including sign bit if signed).
         * @param {number} fracBits  Number of fractional bits.
         * @param {boolean} [signed=true] Whether the format is signed (two's complement).
         * @returns {number}
         */
        function fixedToFloat(raw, intBits, fracBits, signed = true) {
            const totalBits = intBits + fracBits;
            let value = raw;
            if (signed) {
                // Sign-extend without using `<<` (which wraps at 32 bits).
                const pow = Math.pow(2, totalBits);
                const signBit = pow / 2;
                if (value & signBit) {
                    value = value - pow;
                }
            }
            return value / Math.pow(2, fracBits);
        }

        /**
         * Generic float → fixed-point raw integer.
         * By default clamps out-of-range values; pass `{ strict: true }` to throw.
         * @param {number} value      - Float value to convert.
         * @param {number} intBits    - Number of integer bits (including sign bit if signed).
         * @param {number} fracBits   - Number of fractional bits.
         * @param {boolean} [signed=true] - Whether the format is signed.
         * @param {object}  [opts]
         * @param {boolean} [opts.strict=false] - Throw on NaN/Infinity/overflow instead of clamp.
         * @returns {number} Unsigned bit-pattern integer.
         */
        function floatToFixed(value, intBits, fracBits, signed = true, opts = {}) {
            const strict = opts && opts.strict === true;
            const totalBits = intBits + fracBits;

            if (typeof value !== 'number' || value !== value) {
                // NaN
                if (strict) throw new RangeError(`fixedPoint: invalid value ${value}`);
                return 0;
            }

            // `<<` wraps modulo 32, so compute via Math.pow for totalBits up to 32.
            const scale = Math.pow(2, fracBits);
            let raw = Math.round(value * scale);

            const totalPow = Math.pow(2, totalBits);
            const halfPow = totalPow / 2;
            const minVal = signed ? -halfPow : 0;
            const maxVal = signed ? halfPow - 1 : totalPow - 1;

            if (!isFinite(raw) || raw < minVal || raw > maxVal) {
                if (strict) throw new RangeError(
                    `fixedPoint: value ${value} out of range [${minVal / scale}, ${maxVal / scale}]`
                );
                raw = (raw < minVal || raw === -Infinity) ? minVal : maxVal;
            }

            // Return unsigned bit pattern masked to totalBits.
            if (totalBits >= 32) {
                // Wrap into unsigned 32-bit space.
                return raw >>> 0;
            }
            return raw & ((1 << totalBits) - 1);
        }

        // ── Fixed16.16 signed ────────────────────────────────────────────────

        /**
         * Convert a raw 32-bit unsigned integer (Fixed16.16 signed) to float.
         * @param {number} raw - 32-bit unsigned integer.
         * @returns {number}
         */
        function fixed16ToFloat(raw) {
            // Treat as signed 32-bit two's complement
            const signed32 = raw | 0; // coerce to signed int32
            return signed32 / 65536;
        }

        /**
         * Convert a float to a Fixed16.16 signed raw 32-bit integer.
         * Clamps by default; pass `{ strict: true }` to throw.
         * @param {number} value
         * @param {object} [opts]
         * @returns {number} Unsigned 32-bit integer (bit pattern).
         */
        function floatToFixed16(value, opts) {
            const strict = opts && opts.strict === true;

            if (typeof value !== 'number' || value !== value) {
                // NaN check (value !== value is true only for NaN)
                if (strict) throw new RangeError(`fixedPoint: invalid value ${value}`);
                return 0;
            }

            const MIN = -2147483648; // -(1 << 31)
            const MAX =  2147483647; //  (1 << 31) - 1

            let raw = Math.round(value * 65536);

            if (!isFinite(raw) || raw < MIN || raw > MAX) {
                if (strict) throw new RangeError(
                    `fixedPoint: value ${value} out of Fixed16.16 range [-32768, 32767.99998…]`
                );
                raw = raw < MIN || raw === -Infinity ? MIN : MAX;
            }

            // Return as unsigned 32-bit pattern
            return raw >>> 0;
        }

        // ── Fixed16.16 unsigned ──────────────────────────────────────────────

        /**
         * Convert a raw 32-bit unsigned integer (UFix16.16) to float.
         * @param {number} raw - 32-bit unsigned integer.
         * @returns {number}
         */
        function ufixed16ToFloat(raw) {
            return (raw >>> 0) / 65536;
        }

        /**
         * Convert a float to a UFix16.16 raw 32-bit unsigned integer.
         * Clamps by default; pass `{ strict: true }` to throw.
         * @param {number} value
         * @param {object} [opts]
         * @returns {number}
         */
        function floatToUfixed16(value, opts) {
            const strict = opts && opts.strict === true;

            if (typeof value !== 'number' || !isFinite(value)) {
                if (strict) throw new RangeError(`fixedPoint: invalid value ${value}`);
                return 0;
            }

            let raw = Math.round(value * 65536);
            const MIN = 0;
            const MAX = 4294967295; // (1 << 32) - 1 unsigned

            if (raw < MIN || raw > MAX) {
                if (strict) throw new RangeError(
                    `fixedPoint: value ${value} out of UFix16.16 range [0, 65535.99998…]`
                );
                raw = raw < MIN ? MIN : MAX;
            }

            return raw >>> 0;
        }

        // ── F2Dot14 ──────────────────────────────────────────────────────────

        /**
         * Convert a raw 16-bit signed integer (F2Dot14) to float.
         * Range: -2.0 to ~1.99993896484375.
         * @param {number} raw - 16-bit value (may be unsigned bit pattern 0x0000–0xFFFF).
         * @returns {number}
         */
        function f2dot14ToFloat(raw) {
            // Sign-extend 16-bit value
            let v = raw & 0xFFFF;
            if (v & 0x8000) v = v - 0x10000; // two's complement
            return v / 16384;
        }

        /**
         * Convert a float to an F2Dot14 raw 16-bit value (returned as unsigned bit pattern).
         * Clamps by default; pass `{ strict: true }` to throw.
         * @param {number} value - Float in range [-2, 1.99993896…].
         * @param {object} [opts]
         * @returns {number} 0x0000–0xFFFF unsigned.
         */
        function floatToF2dot14(value, opts) {
            const strict = opts && opts.strict === true;

            if (typeof value !== 'number' || !isFinite(value)) {
                if (strict) throw new RangeError(`fixedPoint: invalid value ${value}`);
                return 0;
            }

            let raw = Math.round(value * 16384);
            const MIN = -32768;
            const MAX =  32767;

            if (raw < MIN || raw > MAX) {
                if (strict) throw new RangeError(
                    `fixedPoint: value ${value} out of F2Dot14 range [-2, 1.99993…]`
                );
                raw = raw < MIN ? MIN : MAX;
            }

            return raw & 0xFFFF;
        }

        // ── FUnit ────────────────────────────────────────────────────────────

        /**
         * Convert an FUnit value to pixels.
         * pixelValue = funit * (fontSize / unitsPerEm)
         * @param {number} unitsPerEm - Design units per em (e.g. 1000, 2048).
         * @param {number} fontSize   - Font size in px (or pt at 1:1 scale).
         * @param {number} funit      - Integer design-unit value.
         * @returns {number}
         */
        function funitToPx(unitsPerEm, fontSize, funit) {
            return funit * (fontSize / unitsPerEm);
        }

        return {
            fixed16ToFloat,
            floatToFixed16,
            ufixed16ToFloat,
            floatToUfixed16,
            f2dot14ToFloat,
            floatToF2dot14,
            funitToPx,
            fixedToFloat,
            floatToFixed,
        };
    },
};
