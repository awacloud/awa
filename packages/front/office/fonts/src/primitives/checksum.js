// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview OpenType table checksum + head checksumAdjustment.
 *
 * Per [OT spec §5.1](https://learn.microsoft.com/en-us/typography/opentype/spec/otff#calculating-checksums) :
 *
 * > Tables are padded with zeros to a 4-byte boundary. The checksum
 * > of a table is computed by summing the 32-bit big-endian unsigned
 * > integers that make up the table (modulo 2^32).
 *
 * The `head` table's `checksumAdjustment` field has special handling :
 * it must be zeroed before computing the head checksum, and at the
 * end of the whole-font assembly, it is set to
 * `0xB1B0AFBA - checksum(entireFile)`.
 *
 * @module fonts/primitives/checksum
 */

export const fontChecksum = {
    name: 'fontChecksum',
    dependencies: [],
    factory() {
        // Worker-safe: factory body is self-contained; duplicates top-level
        // helpers so factory.toString() serialises without closures.
        function calcTableChecksum(bytes) {
            const n = bytes.length;
            let sum = 0;
            let i = 0;
            const full = n & ~3;
            while (i < full) {
                const w = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
                sum = (sum + w) >>> 0;
                i += 4;
            }
            if (i < n) {
                let w = 0;
                let shift = 24;
                while (i < n) { w |= bytes[i] << shift; shift -= 8; i++; }
                sum = (sum + (w >>> 0)) >>> 0;
            }
            return sum;
        }
        function computeChecksumAdjustment(entireFontBytes) {
            const sum = calcTableChecksum(entireFontBytes);
            return (0xB1B0AFBA - sum) >>> 0;
        }
        return { calcTableChecksum, computeChecksumAdjustment };
    }
};
