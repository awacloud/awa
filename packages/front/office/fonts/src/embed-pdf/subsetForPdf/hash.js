// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Deterministic 6-character hash prefix for subset font
 * naming (PDF /BaseFont entry).
 *
 * Package-private helper for {@link ../subsetForPdf.js}.
 *
 * @module fonts/embed-pdf/subsetForPdf/hash
 */

export const embedHash = {
    name: 'embedHash',
    dependencies: [],
    factory() {
        /**
         * Generate a 6-character uppercase hash prefix from a set of glyphs.
         * Deterministic — same input set always produces the same prefix
         * (useful for byte-identical roundtrips when the consumer keeps the
         * subset cached).
         *
         * @param {number[]} keptGids
         * @param {string}   fontName
         * @returns {string}
         */
        function hashPrefix(keptGids, fontName) {
            let h = 0x811C9DC5 >>> 0;
            for (const g of keptGids) {
                h = Math.imul(h ^ (g & 0xFF), 0x01000193);
                h = Math.imul(h ^ ((g >>> 8) & 0xFF), 0x01000193);
            }
            for (let i = 0; i < fontName.length; i++) {
                h = Math.imul(h ^ fontName.charCodeAt(i), 0x01000193);
            }
            let s = '';
            for (let i = 0; i < 6; i++) { s += String.fromCharCode(65 + (h & 0x1F) % 26); h >>>= 5; }
            return s;
        }
        return { hashPrefix };
    }
};
