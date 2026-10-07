// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Arabic text shaper — assigns the contextual form
 * ('isol', 'init', 'medi', 'fina') to each glyph in a run, following the
 * Unicode joining algorithm (UAX §9 / Unicode core spec ch. 9.2).
 *
 * The algorithm operates purely on Unicode code points (no glyph IDs)
 * and is therefore independent of any specific font. It is the layer a
 * GSUB engine consults *before* applying `init`/`medi`/`fina`/`isol`
 * features.
 *
 * Joining types follow the standard nomenclature:
 *   - 'U' : non-joining
 *   - 'L' : left-joining (only joins on its left side)
 *   - 'R' : right-joining (only joins on its right side)
 *   - 'D' : dual-joining (joins on both sides)
 *   - 'C' : join-causing (transparent for shaping but propagates joins,
 *           e.g. ZWJ U+200D, tatweel U+0640)
 *   - 'T' : transparent (combining marks, ignored when looking at
 *           neighbours)
 *
 * The table covers the Arabic block (U+0620..U+064F) — sufficient for
 * Modern Standard Arabic letters. Extended Arabic / Arabic Presentation
 * Forms ranges are left out on purpose: those code points are *outputs*
 * of shaping, not inputs.
 *
 * @module fonts/extra/shaper-arabic
 */

import { fontErrors } from '../errors.js';

export const extraShaperArabic = {
    name: 'extraShaperArabic',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ContractError } = errors;

        /**
         * Joining-type table for the basic Arabic block + a handful of
         * supporting characters (ZWJ, ZWNJ, tatweel).
         *
         * Sourced from Unicode `ArabicShaping.txt` (subset — basic block).
         *
         * @type {Readonly<Object<number,'U'|'L'|'R'|'D'|'C'|'T'>>}
         */
        const JOINING_TYPES_CONST = Object.freeze({
    // Punctuation / non-joining
    0x0600: 'U', 0x0601: 'U', 0x0602: 'U', 0x0603: 'U',
    0x060C: 'U', 0x060D: 'U', 0x061B: 'U', 0x061F: 'U',
    // Hamza
    0x0621: 'U',                       // ARABIC LETTER HAMZA
    0x0622: 'R',                       // ALEF WITH MADDA ABOVE
    0x0623: 'R',                       // ALEF WITH HAMZA ABOVE
    0x0624: 'R',                       // WAW WITH HAMZA ABOVE
    0x0625: 'R',                       // ALEF WITH HAMZA BELOW
    0x0626: 'D',                       // YEH WITH HAMZA ABOVE
    // Main consonant set
    0x0627: 'R',                       // ALEF
    0x0628: 'D',                       // BEH
    0x0629: 'R',                       // TEH MARBUTA
    0x062A: 'D',                       // TEH
    0x062B: 'D',                       // THEH
    0x062C: 'D',                       // JEEM
    0x062D: 'D',                       // HAH
    0x062E: 'D',                       // KHAH
    0x062F: 'R',                       // DAL
    0x0630: 'R',                       // THAL
    0x0631: 'R',                       // REH
    0x0632: 'R',                       // ZAIN
    0x0633: 'D',                       // SEEN
    0x0634: 'D',                       // SHEEN
    0x0635: 'D',                       // SAD
    0x0636: 'D',                       // DAD
    0x0637: 'D',                       // TAH
    0x0638: 'D',                       // ZAH
    0x0639: 'D',                       // AIN
    0x063A: 'D',                       // GHAIN
    0x063B: 'D', 0x063C: 'D', 0x063D: 'D', 0x063E: 'D', 0x063F: 'D',
    // Tatweel (kashida) is join-causing
    0x0640: 'C',                       // ARABIC TATWEEL
    0x0641: 'D',                       // FEH
    0x0642: 'D',                       // QAF
    0x0643: 'D',                       // KAF
    0x0644: 'D',                       // LAM
    0x0645: 'D',                       // MEEM
    0x0646: 'D',                       // NOON
    0x0647: 'D',                       // HEH
    0x0648: 'R',                       // WAW
    0x0649: 'D',                       // ALEF MAKSURA
    0x064A: 'D',                       // YEH
    // Combining marks (transparent)
    0x064B: 'T', 0x064C: 'T', 0x064D: 'T', 0x064E: 'T',
    0x064F: 'T', 0x0650: 'T', 0x0651: 'T', 0x0652: 'T',
    0x0653: 'T', 0x0654: 'T', 0x0655: 'T', 0x0656: 'T',
    0x0657: 'T', 0x0658: 'T', 0x0659: 'T', 0x065A: 'T',
    0x065B: 'T', 0x065C: 'T', 0x065D: 'T', 0x065E: 'T',
    0x065F: 'T', 0x0670: 'T',
            // ZWNJ / ZWJ
            0x200C: 'U', 0x200D: 'C'
        });

        /**
         * Look up the joining type for a code point. Defaults to 'U'.
         */
        function joiningType(cp) {
            const t = JOINING_TYPES_CONST[cp];
            return t || 'U';
        }

        function joinsLeft(t) { return t === 'L' || t === 'D' || t === 'C'; }
        function joinsRight(t) { return t === 'R' || t === 'D' || t === 'C'; }

        function prevNonT(types, i) {
            for (let k = i - 1; k >= 0; k--) if (types[k] !== 'T') return k;
            return -1;
        }

        function nextNonT(types, i) {
            for (let k = i + 1; k < types.length; k++) if (types[k] !== 'T') return k;
            return -1;
        }

        /**
         * Compute the contextual form for each input code point.
         */
        function arabicShape(codePoints) {
            if (!Array.isArray(codePoints))
                throw new ContractError('fonts/arabic-input',
                    'arabicShape expects an array of code points');

            const n = codePoints.length;
            const cps = new Array(n);
            const types = new Array(n);

            for (let i = 0; i < n; i++) {
                const v = codePoints[i];
                let cp;
                if (typeof v === 'number') cp = v;
                else if (typeof v === 'string' && v.length > 0) cp = v.codePointAt(0);
                else throw new ContractError('fonts/arabic-input',
                    `invalid code point at index ${i}`, { context: { index: i, value: v } });
                cps[i] = cp;
                types[i] = joiningType(cp);
            }

            const forms = new Array(n);

            for (let i = 0; i < n; i++) {
                if (types[i] === 'T') { forms[i] = 'isol'; continue; }

                const p = prevNonT(types, i);
                const q = nextNonT(types, i);
                const prevT = p >= 0 ? types[p] : 'U';
                const nextT = q >= 0 ? types[q] : 'U';

                const joinPrev = joinsRight(types[i]) && joinsLeft(prevT);
                const joinNext = joinsLeft(types[i]) && joinsRight(nextT);

                if (joinPrev && joinNext) forms[i] = 'medi';
                else if (joinPrev) forms[i] = 'fina';
                else if (joinNext) forms[i] = 'init';
                else forms[i] = 'isol';
            }

            return forms;
        }

        function arabicShapeString(str) {
            if (typeof str !== 'string')
                throw new ContractError('fonts/arabic-input', 'expected string');
            const cps = [];
            for (const ch of str) cps.push(ch.codePointAt(0));
            return arabicShape(cps);
        }

        return {
            arabicShape, arabicShapeString, joiningType,
            JOINING_TYPES: JOINING_TYPES_CONST
        };
    }
};

