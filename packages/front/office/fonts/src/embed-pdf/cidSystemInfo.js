// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview embed-pdf — CIDSystemInfo dictionary for Type0 fonts.
 *
 * For most modern PDF embeddings the right value is:
 *
 * ```js
 * { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 }
 * ```
 *
 * For CJK fonts a script-specific ordering can be returned based on
 * the font's OS/2.ulCodePageRange flags (Adobe-Japan1, Adobe-GB1,
 * Adobe-CNS1, Adobe-Korea1). Otherwise fall back to Identity.
 *
 * Strict factory body.
 *
 * @module fonts/embed-pdf/cidSystemInfo
 */

export const embedCidSystemInfo = {
    name: 'embedCidSystemInfo',
    dependencies: [],
    factory() {
        /**
         * @param {object} font  — output of `fonts.read(bytes)`
         * @returns {{ Registry: string, Ordering: string, Supplement: number }}
         */
        function buildCidSystemInfo(font) {
            const cp1 = font?.os2?.ulCodePageRange1 ?? 0;
            // Heuristic ordering by code-page bit (PDF 32000-1 §9.7.3 + CMap registries)
            if (cp1 & 0x80000000) return { Registry: 'Adobe', Ordering: 'Japan1', Supplement: 6 };   // bit 31: Shift-JIS
            if (cp1 & 0x40000000) return { Registry: 'Adobe', Ordering: 'GB1',    Supplement: 5 };   // bit 30: GB2312
            if (cp1 & 0x20000000) return { Registry: 'Adobe', Ordering: 'Korea1', Supplement: 2 };   // bit 29: Wansung
            if (cp1 & 0x10000000) return { Registry: 'Adobe', Ordering: 'CNS1',   Supplement: 5 };   // bit 28: Big5
            return { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 };
        }
        return { buildCidSystemInfo };
    }
};
