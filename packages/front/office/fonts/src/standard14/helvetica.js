// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard 14 — Helvetica family (4 variants).
 *
 * Regular widths from Adobe `Helvetica.afm` (existing, hand-authored
 * below). Bold widths from `vendor/afm/Helvetica-Bold.afm` — see
 * `_widths.generated.js` and `vendor/afm/PROVENANCE.md` for sha256s. Regenerate the Bold block with
 * `bun tools/gen-standard14-widths.mjs` from the package root after
 * re-vendoring the AFMs; do not hand-edit between the
 * `GENERATED-WIDTHS`/`END-GENERATED-WIDTHS` markers.
 *
 * Oblique legitimately SHARES its upright's width table (real Adobe
 * PDF behaviour: Helvetica-Oblique = Helvetica, Helvetica-BoldOblique =
 * Helvetica-Bold) — only Regular and Bold have their own AFM metrics.
 * 1000 units per em. The italic angle differs between roman and oblique.
 *
 * Strict factory-only: the generated Bold table is duplicated
 * as a factory-local block rather than imported from
 * `_widths.generated.js`, because a factory referencing ANY module-scope
 * binding (including a plain data import) is disallowed by
 * `fw/no-factory-capture` — see that module's fileoverview.
 *
 * @module fonts/standard14/helvetica
 */

export const standard14Helvetica = {
    name: 'standard14Helvetica',
    dependencies: [],
    factory() {
        const COMMON = Object.freeze({
            familyName:   'Helvetica',
            flags:        0x20,             // Nonsymbolic
            fontBBox:     [-166, -225, 1000, 931],
            ascent:       718,
            descent:     -207,
            capHeight:    718,
            xHeight:      523,
            stemV:        88,
            stemH:        76
        });

        // GENERATED-WIDTHS:HELVETICA_WIDTHS
        const HELVETICA_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            const ascii = {
                ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, '\'': 191,
                '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
                '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
                '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
                '@': 1015, 'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
                'H': 722, 'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778,
                'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
                'X': 667, 'Y': 667, 'Z': 611, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556,
                '`': 333, 'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556,
                'h': 556, 'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556,
                'p': 556, 'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722,
                'x': 500, 'y': 500, 'z': 500, '{': 334, '|': 260, '}': 334, '~': 584
            };
            for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];
            const high = {
                0x80: 556, 0x82: 222, 0x83: 556, 0x84: 333, 0x85: 1000, 0x86: 556, 0x87: 556, 0x88: 333,
                0x89: 1000, 0x8A: 667, 0x8B: 333, 0x8C: 1000, 0x8E: 611, 0x91: 222, 0x92: 222, 0x93: 333,
                0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9A: 500, 0x9B: 333,
                0x9C: 944, 0x9E: 500, 0x9F: 667, 0xA0: 278, 0xA1: 333, 0xA2: 556, 0xA3: 556, 0xA4: 556,
                0xA5: 556, 0xA6: 260, 0xA7: 556, 0xA8: 333, 0xA9: 737, 0xAA: 370, 0xAB: 556, 0xAC: 584,
                0xAD: 333, 0xAE: 737, 0xAF: 333, 0xB0: 400, 0xB1: 584, 0xB2: 333, 0xB3: 333, 0xB4: 333,
                0xB5: 556, 0xB6: 537, 0xB7: 278, 0xB8: 333, 0xB9: 333, 0xBA: 365, 0xBB: 556, 0xBC: 834,
                0xBD: 834, 0xBE: 834, 0xBF: 611, 0xC0: 667, 0xC1: 667, 0xC2: 667, 0xC3: 667, 0xC4: 667,
                0xC5: 667, 0xC6: 1000, 0xC7: 722, 0xC8: 667, 0xC9: 667, 0xCA: 667, 0xCB: 667, 0xCC: 278,
                0xCD: 278, 0xCE: 278, 0xCF: 278, 0xD0: 722, 0xD1: 722, 0xD2: 778, 0xD3: 778, 0xD4: 778,
                0xD5: 778, 0xD6: 778, 0xD7: 584, 0xD8: 778, 0xD9: 722, 0xDA: 722, 0xDB: 722, 0xDC: 722,
                0xDD: 667, 0xDE: 667, 0xDF: 611, 0xE0: 556, 0xE1: 556, 0xE2: 556, 0xE3: 556, 0xE4: 556,
                0xE5: 556, 0xE6: 889, 0xE7: 500, 0xE8: 556, 0xE9: 556, 0xEA: 556, 0xEB: 556, 0xEC: 278,
                0xED: 278, 0xEE: 278, 0xEF: 278, 0xF0: 556, 0xF1: 556, 0xF2: 556, 0xF3: 556, 0xF4: 556,
                0xF5: 556, 0xF6: 556, 0xF7: 584, 0xF8: 611, 0xF9: 556, 0xFA: 556, 0xFB: 556, 0xFC: 556,
                0xFD: 500, 0xFE: 556, 0xFF: 500
            };
            for (const k in high) w[k] = high[k];
            return Object.freeze(w);
        })();
        // END-GENERATED-WIDTHS:HELVETICA_WIDTHS

        // GENERATED-WIDTHS:HELVETICA_BOLD_WIDTHS
        const HELVETICA_BOLD_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            const ascii = {
                ' ': 278, '!': 333, '"': 474, '#': 556, '$': 556, '%': 889, '&': 722, '\'': 238,
                '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
                '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
                '8': 556, '9': 556, ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611,
                '@': 975, 'A': 722, 'B': 722, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
                'H': 722, 'I': 278, 'J': 556, 'K': 722, 'L': 611, 'M': 833, 'N': 722, 'O': 778,
                'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
                'X': 667, 'Y': 667, 'Z': 611, '[': 333, '\\': 278, ']': 333, '^': 584, '_': 556,
                '`': 333, 'a': 556, 'b': 611, 'c': 556, 'd': 611, 'e': 556, 'f': 333, 'g': 611,
                'h': 611, 'i': 278, 'j': 278, 'k': 556, 'l': 278, 'm': 889, 'n': 611, 'o': 611,
                'p': 611, 'q': 611, 'r': 389, 's': 556, 't': 333, 'u': 611, 'v': 556, 'w': 778,
                'x': 556, 'y': 556, 'z': 500, '{': 389, '|': 280, '}': 389, '~': 584
            };
            for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];
            const high = {
                0x80: 556, 0x82: 278, 0x83: 556, 0x84: 500, 0x85: 1000, 0x86: 556, 0x87: 556, 0x88: 333,
                0x89: 1000, 0x8A: 667, 0x8B: 333, 0x8C: 1000, 0x8E: 611, 0x91: 278, 0x92: 278, 0x93: 500,
                0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9A: 556, 0x9B: 333,
                0x9C: 944, 0x9E: 500, 0x9F: 667, 0xA0: 278, 0xA1: 333, 0xA2: 556, 0xA3: 556, 0xA4: 556,
                0xA5: 556, 0xA6: 280, 0xA7: 556, 0xA8: 333, 0xA9: 737, 0xAA: 370, 0xAB: 556, 0xAC: 584,
                0xAD: 333, 0xAE: 737, 0xAF: 333, 0xB0: 400, 0xB1: 584, 0xB2: 333, 0xB3: 333, 0xB4: 333,
                0xB5: 611, 0xB6: 556, 0xB7: 278, 0xB8: 333, 0xB9: 333, 0xBA: 365, 0xBB: 556, 0xBC: 834,
                0xBD: 834, 0xBE: 834, 0xBF: 611, 0xC0: 722, 0xC1: 722, 0xC2: 722, 0xC3: 722, 0xC4: 722,
                0xC5: 722, 0xC6: 1000, 0xC7: 722, 0xC8: 667, 0xC9: 667, 0xCA: 667, 0xCB: 667, 0xCC: 278,
                0xCD: 278, 0xCE: 278, 0xCF: 278, 0xD0: 722, 0xD1: 722, 0xD2: 778, 0xD3: 778, 0xD4: 778,
                0xD5: 778, 0xD6: 778, 0xD7: 584, 0xD8: 778, 0xD9: 722, 0xDA: 722, 0xDB: 722, 0xDC: 722,
                0xDD: 667, 0xDE: 667, 0xDF: 611, 0xE0: 556, 0xE1: 556, 0xE2: 556, 0xE3: 556, 0xE4: 556,
                0xE5: 556, 0xE6: 889, 0xE7: 556, 0xE8: 556, 0xE9: 556, 0xEA: 556, 0xEB: 556, 0xEC: 278,
                0xED: 278, 0xEE: 278, 0xEF: 278, 0xF0: 611, 0xF1: 611, 0xF2: 611, 0xF3: 611, 0xF4: 611,
                0xF5: 611, 0xF6: 611, 0xF7: 584, 0xF8: 611, 0xF9: 611, 0xFA: 611, 0xFB: 611, 0xFC: 611,
                0xFD: 556, 0xFE: 611, 0xFF: 556
            };
            for (const k in high) w[k] = high[k];
            return Object.freeze(w);
        })();
        // END-GENERATED-WIDTHS:HELVETICA_BOLD_WIDTHS

        const helveticaRegular = Object.freeze({
            ...COMMON,
            fontName:    'Helvetica',
            italicAngle: 0,
            weight:      'Medium',
            widths:      HELVETICA_WIDTHS
        });

        const helveticaBold = Object.freeze({
            ...COMMON,
            fontName:    'Helvetica-Bold',
            italicAngle: 0,
            weight:      'Bold',
            stemV:       140,
            widths:      HELVETICA_BOLD_WIDTHS
        });

        const helveticaOblique = Object.freeze({
            ...COMMON,
            fontName:    'Helvetica-Oblique',
            italicAngle: -12,
            weight:      'Medium',
            widths:      HELVETICA_WIDTHS
        });

        const helveticaBoldOblique = Object.freeze({
            ...COMMON,
            fontName:    'Helvetica-BoldOblique',
            italicAngle: -12,
            weight:      'Bold',
            stemV:       140,
            widths:      HELVETICA_BOLD_WIDTHS
        });

        return {
            HELVETICA_WIDTHS, HELVETICA_BOLD_WIDTHS,
            helveticaRegular, helveticaBold, helveticaOblique, helveticaBoldOblique
        };
    }
};
