// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Re-emit raw glyf bytes for a subset glyph, patching
 * composite component gids via the renumber map.
 *
 * Package-private helper for {@link ../subsetForPdf.js}.
 *
 * Strict factory body.
 *
 * @module fonts/embed-pdf/subsetForPdf/glyph-rewriter
 */

import { fontErrors } from '../../errors.js';

export const embedGlyphRewriter = {
    name: 'embedGlyphRewriter',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { RenderError } = errors;
        /**
         * Re-emit the glyf bytes for a subset glyph (simple or composite).
         * For composites we rewrite the component glyphIndex via `gidMap`.
         * Implementation note: rather than reading then re-encoding via
         * primitives, we copy the raw byte slice — except for composite
         * glyphIndex bytes, which we patch in place.
         *
         * @param {Uint8Array} rawBytes
         * @param {object}     glyph
         * @param {Map<number, number>} gidMap
         * @returns {Uint8Array}
         */
        function rewriteGlyphBytes(rawBytes, glyph, gidMap) {
            if (!glyph || rawBytes.length === 0) return new Uint8Array(0);
            if (glyph.kind !== 'composite') return new Uint8Array(rawBytes);

            // Composite layout : header (10 bytes), then component records.
            // Each record starts with `flags uint16` + `glyphIndex uint16`.
            // We need to walk and patch each glyphIndex.
            const out = new Uint8Array(rawBytes);
            let p = 10;
            let moreFlags;
            do {
                if (p + 4 > out.length) break;
                moreFlags = (out[p] << 8) | out[p + 1];
                const gidOldHi = out[p + 2], gidOldLo = out[p + 3];
                const oldGid = (gidOldHi << 8) | gidOldLo;
                const newGid = gidMap.get(oldGid);
                if (newGid == null)
                    throw new RenderError('fonts/subset-bad-comp',
                        `composite references gid ${oldGid} not in retained set`,
                        { context: { oldGid } });
                out[p + 2] = (newGid >>> 8) & 0xFF;
                out[p + 3] =  newGid        & 0xFF;
                p += 4;
                // Skip args (1 or 2 bytes each)
                if (moreFlags & 0x0001) p += 4;        // ARG_1_AND_2_ARE_WORDS
                else                    p += 2;
                // Skip transform
                if (moreFlags & 0x0008) p += 2;        // WE_HAVE_A_SCALE
                else if (moreFlags & 0x0040) p += 4;   // X_Y_SCALE
                else if (moreFlags & 0x0080) p += 8;   // 2_BY_2
            } while (moreFlags & 0x0020);              // MORE_COMPONENTS
            return out;
        }
        return { rewriteGlyphBytes };
    }
};
