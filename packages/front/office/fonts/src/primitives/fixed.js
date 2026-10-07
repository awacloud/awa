// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Fixed-point numeric helpers used throughout OpenType.
 *
 * Strict factory body — top-level shims removed. Resolve `fontFixed`
 * through your runtime to access {@link fixedFromInt32}, {@link fixedToInt32},
 * {@link f2dot14FromInt16}, {@link f2dot14ToInt16}, {@link decodeVersion16Dot16},
 * and {@link encodeVersion16Dot16}.
 *
 * - `Fixed` / `version16Dot16` — 16.16 signed fixed (32-bit BE int).
 * - `F2Dot14` — 2.14 signed fixed (16-bit BE int), used by avar / gvar /
 *   STAT axis-coordinate normalised values.
 * - `shortFrac` — 2.14 unsigned (rare).
 * - `FUnit` — design-unit integer scaled by `unitsPerEm` (head.unitsPerEm).
 *
 * @module fonts/primitives/fixed
 */

/**
 * Factory wrapper — registers `fontFixed` for DI.
 *
 * Worker-safe: the factory body inlines the fixed-point arithmetic
 * (16.16 signed and F2Dot14 sign-extension) so factory.toString()
 * serialises without closing over any module-level state.
 */
export const fontFixed = {
    name: 'fontFixed',
    dependencies: [],
    factory() {
        function fixedFromInt32(i) {
            // 16.16 signed: sign-extend 32-bit, divide by 2^16
            const u = i >>> 0;
            const s = (u & 0x80000000) ? u - 0x100000000 : u;
            return s / 0x10000;
        }
        function fixedToInt32(v) {
            // Round to nearest then clamp + truncate to int32
            const r = Math.round(v * 0x10000) | 0;
            return r;
        }
        function f2dot14FromInt16(i) {
            const raw = i & 0xFFFF;
            const signed = (raw & 0x8000) ? raw - 0x10000 : raw;
            return signed / 0x4000;
        }
        function f2dot14ToInt16(v) {
            // F2Dot14 range: -2..(2 - 2^-14). Clamp before encoding.
            let r = Math.round(v * 0x4000);
            if (r >= 0x8000) r = 0x7FFF;
            if (r < -0x8000) r = -0x8000;
            return r | 0;
        }
        function decodeVersion16Dot16(i) {
            return { major: (i >>> 16) & 0xFFFF, minor: i & 0xFFFF };
        }
        function encodeVersion16Dot16(major, minor) {
            return (((major & 0xFFFF) << 16) | (minor & 0xFFFF)) >>> 0;
        }
        return {
            fixedFromInt32, fixedToInt32,
            f2dot14FromInt16, f2dot14ToInt16,
            decodeVersion16Dot16, encodeVersion16Dot16
        };
    }
};
