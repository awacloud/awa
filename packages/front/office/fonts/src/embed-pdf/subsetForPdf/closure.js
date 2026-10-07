// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Glyph closure computation — expands a set of code points
 * into the full set of gids required (including composite components).
 *
 * Package-private helper for {@link ../subsetForPdf.js}.
 *
 * @module fonts/embed-pdf/subsetForPdf/closure
 */

export const embedClosure = {
    name: 'embedClosure',
    dependencies: [],
    factory() {
        const NOTDEF = 0;

        /**
         * Compute the glyph closure for a code-point set.
         *
         * Resolves each code point through `font.unicodeMap`, then recursively
         * expands composite glyphs to include their referenced gids. Glyph 0
         * (.notdef) is always kept.
         *
         * @param {object} font
         * @param {Iterable<number>} codePoints
         * @returns {{ keptGids: number[], cpToGid: Map<number, number> }}
         */
        function computeGlyphClosure(font, codePoints) {
            const kept = new Set([NOTDEF]);
            const cpToGid = new Map();
            for (const cp of codePoints) {
                const gid = font.unicodeMap.get(cp);
                if (gid != null) { kept.add(gid); cpToGid.set(cp, gid); }
            }
            // Expand composites recursively
            if (font.glyphTable) {
                const visit = (gid) => {
                    const g = font.glyphTable[gid];
                    if (!g || g.kind !== 'composite') return;
                    for (const comp of g.components) {
                        if (!kept.has(comp.glyphIndex)) {
                            kept.add(comp.glyphIndex);
                            visit(comp.glyphIndex);
                        }
                    }
                };
                for (const gid of [...kept]) visit(gid);
            }
            return { keptGids: [...kept].sort((a, b) => a - b), cpToGid };
        }

        return { computeGlyphClosure };
    }
};
