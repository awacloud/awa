// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `glyphNameToUnicode(name)` — glyph-name → Unicode
 * resolver per the **Adobe Glyph List Specification**
 * (`adobe-type-tools/agl-specification`, §3 "Mapping glyph names to
 * Unicode values"). It gives text extraction a glyph-name → Unicode
 * mapping for fonts whose encoding carries only glyph names.
 *
 * The spec's heuristic algorithm, in order:
 *
 *   1. **Table lookup** — the name is looked up verbatim in the AGL
 *      (`glyphlist.txt`). The table (`encodingAglTable`) ships the
 *      vendored Adobe Glyph List — see `AGL-PROVENANCE.md`; the seam is
 *      `encodingAglTable`.
 *   2. **`uniXXXX` form** — `"uni"` followed by a sequence of
 *      4-hex-digit groups (length a multiple of 4, minimum 4). Each
 *      group is one Unicode code point; a name with several groups
 *      (e.g. `"uni00410042"`) maps to the corresponding sequence
 *      (`[0x0041, 0x0042]`). A group outside `0x0000..0x10FFFF` or in
 *      the surrogate range `0xD800..0xDFFF` invalidates the whole name.
 *   3. **`uXXXX[XX]` form** — `"u"` followed by 4 to 6 hex digits,
 *      mapping to a single code point, subject to the same range/
 *      surrogate exclusion as above.
 *   4. Anything else (including a malformed `uni`/`u` name) → `null`.
 *      `glyphNameToUnicode` never throws.
 *
 * Hex-digit matching is case-insensitive here (a pragmatic, documented
 * deviation from the spec's literal "uppercase hexadecimal digits" —
 * real-world glyph names in the wild use both cases; accepting both
 * only widens what resolves, it never changes an already-valid name's
 * result).
 *
 * Strict factory-only: no top-level imports beyond the
 * descriptor, which receives `encodingAglTable` via DI. Pure
 * data + string parsing — worker-safe.
 *
 * @module fonts/encodings/agl
 */

import { encodingAglTable } from './aglTable.js';

export const encodingAgl = {
    name: 'encodingAgl',
    dependencies: ['encodingAglTable'],
    deps: [encodingAglTable],
    factory(aglTable) {
        // Self-contained closure (fw/no-factory-capture — cf. the macRoman.js
        // sibling pattern):
        // every helper the factory needs is declared IN the factory body,
        // not captured from module scope, so the descriptor stays
        // serializable to a Worker.
        const UNI_RE = /^uni([0-9A-Fa-f]+)$/;
        const U_RE = /^u([0-9A-Fa-f]{4,6})$/;

        function isValidCodePoint(cp) {
            return cp >= 0x0000 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF);
        }

        // Parse the `uniXXXX[YYYY...]` heuristic (AGL spec heuristic 2).
        function fromUniForm(name) {
            const m = UNI_RE.exec(name);
            if (!m) return null;
            const hex = m[1];
            if (hex.length === 0 || hex.length % 4 !== 0) return null;
            const codePoints = [];
            for (let i = 0; i < hex.length; i += 4) {
                const cp = parseInt(hex.slice(i, i + 4), 16);
                if (!isValidCodePoint(cp)) return null;
                codePoints.push(cp);
            }
            return codePoints;
        }

        // Parse the `uXXXX`/`uXXXXX`/`uXXXXXX` heuristic (AGL spec heuristic 3).
        function fromUForm(name) {
            const m = U_RE.exec(name);
            if (!m) return null;
            const cp = parseInt(m[1], 16);
            if (!isValidCodePoint(cp)) return null;
            return [cp];
        }

        /**
         * Resolve a PostScript glyph name to its Unicode code point(s).
         * @param {string} name
         * @returns {number[] | null} `null` when the name resolves to no
         *   known Unicode value — never throws.
         */
        function glyphNameToUnicode(name) {
            if (typeof name !== 'string' || name.length === 0) return null;

            const tableHit = aglTable.lookup(name);
            if (tableHit !== undefined) return tableHit;

            const uni = fromUniForm(name);
            if (uni !== null) return uni;

            const u = fromUForm(name);
            if (u !== null) return u;

            return null;
        }
        return { glyphNameToUnicode };
    }
};
