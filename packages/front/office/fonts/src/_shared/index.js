// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `fontsShared` — canonical source of font-format
 * constants and stateless helpers historically duplicated across
 * `@awacloud/fonts` factories (sfnt, ttc, woff, woff2).
 *
 * Exposes :
 * - **Magic numbers** for the four container envelopes :
 *   `SFNT_TT_OUTLINES` (0x00010000), `SFNT_CFF_OUTLINES` ('OTTO'),
 *   `SFNT_APPLE_TRUE` ('true'), `SFNT_APPLE_TYP1` ('typ1'),
 *   `TTC_MAGIC` ('ttcf'), `WOFF_MAGIC` ('wOFF'), `WOFF2_MAGIC` ('wOF2').
 * - **head.checksumAdjustment magic** : `CHECKSUM_MAGIC` (0xB1B0AFBA).
 * - **`SFNT_FLAVOR`** — frozen flavor-name dictionary (truetype /
 *   opentype / apple-true / apple-typ1).
 * - **`flavorFromVersion(v)` / `versionFromFlavor(f)`** — bi-directional
 *   mapping between the 4-byte SFNT version and the symbolic flavor
 *   string. Same logic was inlined inside `sfnt.js` and `ttc.js`.
 * - **`sfntSearchParams(numTables)`** — computes the legacy
 *   `{ searchRange, entrySelector, rangeShift }` triplet emitted in
 *   SFNT / WOFF / TTC nested-SFNT directories. Same algorithm was
 *   duplicated across `sfnt.js`, `ttc.js`, `woff.js`.
 *
 * **Strict factory-only** : single descriptor export, no top-level
 * `import`, no top-level `const`/`function` body — every helper lives
 * inside `factory()`. Worker-safe : `factory.toString()` serialises a
 * self-contained closure.
 *
 * @module fonts/_shared
 */

export const fontsShared = {
    name: 'fontsShared',
    dependencies: [],

    factory() {
        // --- Container magic numbers --------------------------------
        // SFNT sfntVersion field values (OT spec §5).
        const SFNT_TT_OUTLINES   = 0x00010000;
        const SFNT_CFF_OUTLINES  = 0x4F54544F; // 'OTTO'
        const SFNT_APPLE_TRUE    = 0x74727565; // 'true'
        const SFNT_APPLE_TYP1    = 0x74797031; // 'typ1'

        // Other envelope signatures.
        const TTC_MAGIC          = 0x74746366; // 'ttcf'
        const WOFF_MAGIC         = 0x774F4646; // 'wOFF'
        const WOFF2_MAGIC        = 0x774F4632; // 'wOF2'

        // head.checksumAdjustment magic constant (OT spec §5.1).
        const CHECKSUM_MAGIC     = 0xB1B0AFBA;

        // --- SFNT flavor strings ------------------------------------
        const SFNT_FLAVOR = Object.freeze({
            TRUETYPE:   'truetype',
            OPENTYPE:   'opentype',
            APPLE_TRUE: 'apple-true',
            APPLE_TYP1: 'apple-typ1'
        });

        function flavorFromVersion(v) {
            switch (v >>> 0) {
                case SFNT_TT_OUTLINES:  return SFNT_FLAVOR.TRUETYPE;
                case SFNT_CFF_OUTLINES: return SFNT_FLAVOR.OPENTYPE;
                case SFNT_APPLE_TRUE:   return SFNT_FLAVOR.APPLE_TRUE;
                case SFNT_APPLE_TYP1:   return SFNT_FLAVOR.APPLE_TYP1;
                default: return null;
            }
        }

        function versionFromFlavor(f) {
            switch (f) {
                case SFNT_FLAVOR.TRUETYPE:   return SFNT_TT_OUTLINES;
                case SFNT_FLAVOR.OPENTYPE:   return SFNT_CFF_OUTLINES;
                case SFNT_FLAVOR.APPLE_TRUE: return SFNT_APPLE_TRUE;
                case SFNT_FLAVOR.APPLE_TYP1: return SFNT_APPLE_TYP1;
                default: return SFNT_TT_OUTLINES;
            }
        }

        // --- SFNT search params (binary-search triplet) --------------
        /**
         * Compute the `{ searchRange, entrySelector, rangeShift }`
         * triplet emitted in every SFNT-style table directory header
         * (SFNT itself, WOFF, WOFF2, and TTC nested directories).
         *
         * Per OT spec :
         *   searchRange   = (max-pow2 ≤ numTables) × 16
         *   entrySelector = log2(max-pow2 ≤ numTables)
         *   rangeShift    = numTables × 16 − searchRange
         */
        function sfntSearchParams(numTables) {
            let entrySelector = 0;
            let maxPow2 = 1;
            while (maxPow2 * 2 <= numTables) { maxPow2 *= 2; entrySelector++; }
            const searchRange = maxPow2 * 16;
            const rangeShift  = numTables * 16 - searchRange;
            return { searchRange, entrySelector, rangeShift };
        }

        return {
            // magic
            SFNT_TT_OUTLINES, SFNT_CFF_OUTLINES,
            SFNT_APPLE_TRUE, SFNT_APPLE_TYP1,
            TTC_MAGIC, WOFF_MAGIC, WOFF2_MAGIC,
            CHECKSUM_MAGIC,
            // flavor
            SFNT_FLAVOR, flavorFromVersion, versionFromFlavor,
            // helpers
            sfntSearchParams
        };
    }
};
