// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard 14 — Times family (4 variants).
 *
 * Regular widths from Adobe `Times-Roman.afm` (existing, hand-authored
 * below). Bold from `vendor/afm/Times-Bold.afm`, Italic from
 * `vendor/afm/Times-Italic.afm`, BoldItalic from
 * `vendor/afm/Times-BoldItalic.afm` — see `_widths.generated.js` and
 * `vendor/afm/PROVENANCE.md` for sha256s. Regenerate the three generated blocks with
 * `bun tools/gen-standard14-widths.mjs` from the package root after
 * re-vendoring the AFMs; do not hand-edit between the
 * `GENERATED-WIDTHS`/`END-GENERATED-WIDTHS` markers. Unlike Helvetica,
 * Times-Italic and Times-BoldItalic each have their OWN AFM metrics
 * (no sharing). 1000 units per em.
 *
 * Strict factory-only: the generated tables are duplicated as
 * factory-local blocks rather than imported from `_widths.generated.js`,
 * because a factory referencing ANY module-scope binding (including a
 * plain data import) is disallowed by `fw/no-factory-capture` — see
 * that module's fileoverview.
 *
 * @module fonts/standard14/times
 */

export const standard14Times = {
    name: 'standard14Times',
    dependencies: [],
    factory() {
        const COMMON = Object.freeze({
            familyName: 'Times',
            flags:      0x22,                        // Serif + Nonsymbolic
            fontBBox:   [-168, -218, 1000, 898],
            ascent:     683,
            descent:   -217,
            capHeight:  662,
            xHeight:    450,
            stemV:      84,
            stemH:      28
        });

        // GENERATED-WIDTHS:TIMES_ROMAN_WIDTHS
        const TIMES_ROMAN_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            const ascii = {
                ' ': 250, '!': 333, '"': 408, '#': 500, '$': 500, '%': 833, '&': 778, '\'': 180,
                '(': 333, ')': 333, '*': 500, '+': 564, ',': 250, '-': 333, '.': 250, '/': 278,
                '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
                '8': 500, '9': 500, ':': 278, ';': 278, '<': 564, '=': 564, '>': 564, '?': 444,
                '@': 921, 'A': 722, 'B': 667, 'C': 667, 'D': 722, 'E': 611, 'F': 556, 'G': 722,
                'H': 722, 'I': 333, 'J': 389, 'K': 722, 'L': 611, 'M': 889, 'N': 722, 'O': 722,
                'P': 556, 'Q': 722, 'R': 667, 'S': 556, 'T': 611, 'U': 722, 'V': 722, 'W': 944,
                'X': 722, 'Y': 722, 'Z': 611, '[': 333, '\\': 278, ']': 333, '^': 469, '_': 500,
                '`': 333, 'a': 444, 'b': 500, 'c': 444, 'd': 500, 'e': 444, 'f': 333, 'g': 500,
                'h': 500, 'i': 278, 'j': 278, 'k': 500, 'l': 278, 'm': 778, 'n': 500, 'o': 500,
                'p': 500, 'q': 500, 'r': 333, 's': 389, 't': 278, 'u': 500, 'v': 500, 'w': 722,
                'x': 500, 'y': 500, 'z': 444, '{': 480, '|': 200, '}': 480, '~': 541
            };
            for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];
            const high = {
                0x80: 500, 0x82: 333, 0x83: 500, 0x84: 444, 0x85: 1000, 0x86: 500, 0x87: 500, 0x88: 333,
                0x89: 1000, 0x8A: 556, 0x8B: 333, 0x8C: 889, 0x8E: 611, 0x91: 333, 0x92: 333, 0x93: 444,
                0x94: 444, 0x95: 350, 0x96: 500, 0x97: 1000, 0x98: 333, 0x99: 980, 0x9A: 389, 0x9B: 333,
                0x9C: 722, 0x9E: 444, 0x9F: 722, 0xA0: 250, 0xA1: 333, 0xA2: 500, 0xA3: 500, 0xA4: 500,
                0xA5: 500, 0xA6: 200, 0xA7: 500, 0xA8: 333, 0xA9: 760, 0xAA: 276, 0xAB: 500, 0xAC: 564,
                0xAD: 333, 0xAE: 760, 0xAF: 333, 0xB0: 400, 0xB1: 564, 0xB2: 300, 0xB3: 300, 0xB4: 333,
                0xB5: 500, 0xB6: 453, 0xB7: 250, 0xB8: 333, 0xB9: 300, 0xBA: 310, 0xBB: 500, 0xBC: 750,
                0xBD: 750, 0xBE: 750, 0xBF: 444, 0xC0: 722, 0xC1: 722, 0xC2: 722, 0xC3: 722, 0xC4: 722,
                0xC5: 722, 0xC6: 889, 0xC7: 667, 0xC8: 611, 0xC9: 611, 0xCA: 611, 0xCB: 611, 0xCC: 333,
                0xCD: 333, 0xCE: 333, 0xCF: 333, 0xD0: 722, 0xD1: 722, 0xD2: 722, 0xD3: 722, 0xD4: 722,
                0xD5: 722, 0xD6: 722, 0xD7: 564, 0xD8: 722, 0xD9: 722, 0xDA: 722, 0xDB: 722, 0xDC: 722,
                0xDD: 722, 0xDE: 556, 0xDF: 500, 0xE0: 444, 0xE1: 444, 0xE2: 444, 0xE3: 444, 0xE4: 444,
                0xE5: 444, 0xE6: 667, 0xE7: 444, 0xE8: 444, 0xE9: 444, 0xEA: 444, 0xEB: 444, 0xEC: 278,
                0xED: 278, 0xEE: 278, 0xEF: 278, 0xF0: 500, 0xF1: 500, 0xF2: 500, 0xF3: 500, 0xF4: 500,
                0xF5: 500, 0xF6: 500, 0xF7: 564, 0xF8: 500, 0xF9: 500, 0xFA: 500, 0xFB: 500, 0xFC: 500,
                0xFD: 500, 0xFE: 500, 0xFF: 500
            };
            for (const k in high) w[k] = high[k];
            return Object.freeze(w);
        })();
        // END-GENERATED-WIDTHS:TIMES_ROMAN_WIDTHS

        // GENERATED-WIDTHS:TIMES_BOLD_WIDTHS
        const TIMES_BOLD_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            const ascii = {
                ' ': 250, '!': 333, '"': 555, '#': 500, '$': 500, '%': 1000, '&': 833, '\'': 278,
                '(': 333, ')': 333, '*': 500, '+': 570, ',': 250, '-': 333, '.': 250, '/': 278,
                '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
                '8': 500, '9': 500, ':': 333, ';': 333, '<': 570, '=': 570, '>': 570, '?': 500,
                '@': 930, 'A': 722, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
                'H': 778, 'I': 389, 'J': 500, 'K': 778, 'L': 667, 'M': 944, 'N': 722, 'O': 778,
                'P': 611, 'Q': 778, 'R': 722, 'S': 556, 'T': 667, 'U': 722, 'V': 722, 'W': 1000,
                'X': 722, 'Y': 722, 'Z': 667, '[': 333, '\\': 278, ']': 333, '^': 581, '_': 500,
                '`': 333, 'a': 500, 'b': 556, 'c': 444, 'd': 556, 'e': 444, 'f': 333, 'g': 500,
                'h': 556, 'i': 278, 'j': 333, 'k': 556, 'l': 278, 'm': 833, 'n': 556, 'o': 500,
                'p': 556, 'q': 556, 'r': 444, 's': 389, 't': 333, 'u': 556, 'v': 500, 'w': 722,
                'x': 500, 'y': 500, 'z': 444, '{': 394, '|': 220, '}': 394, '~': 520
            };
            for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];
            const high = {
                0x80: 500, 0x82: 333, 0x83: 500, 0x84: 500, 0x85: 1000, 0x86: 500, 0x87: 500, 0x88: 333,
                0x89: 1000, 0x8A: 556, 0x8B: 333, 0x8C: 1000, 0x8E: 667, 0x91: 333, 0x92: 333, 0x93: 500,
                0x94: 500, 0x95: 350, 0x96: 500, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9A: 389, 0x9B: 333,
                0x9C: 722, 0x9E: 444, 0x9F: 722, 0xA0: 250, 0xA1: 333, 0xA2: 500, 0xA3: 500, 0xA4: 500,
                0xA5: 500, 0xA6: 220, 0xA7: 500, 0xA8: 333, 0xA9: 747, 0xAA: 300, 0xAB: 500, 0xAC: 570,
                0xAD: 333, 0xAE: 747, 0xAF: 333, 0xB0: 400, 0xB1: 570, 0xB2: 300, 0xB3: 300, 0xB4: 333,
                0xB5: 556, 0xB6: 540, 0xB7: 250, 0xB8: 333, 0xB9: 300, 0xBA: 330, 0xBB: 500, 0xBC: 750,
                0xBD: 750, 0xBE: 750, 0xBF: 500, 0xC0: 722, 0xC1: 722, 0xC2: 722, 0xC3: 722, 0xC4: 722,
                0xC5: 722, 0xC6: 1000, 0xC7: 722, 0xC8: 667, 0xC9: 667, 0xCA: 667, 0xCB: 667, 0xCC: 389,
                0xCD: 389, 0xCE: 389, 0xCF: 389, 0xD0: 722, 0xD1: 722, 0xD2: 778, 0xD3: 778, 0xD4: 778,
                0xD5: 778, 0xD6: 778, 0xD7: 570, 0xD8: 778, 0xD9: 722, 0xDA: 722, 0xDB: 722, 0xDC: 722,
                0xDD: 722, 0xDE: 611, 0xDF: 556, 0xE0: 500, 0xE1: 500, 0xE2: 500, 0xE3: 500, 0xE4: 500,
                0xE5: 500, 0xE6: 722, 0xE7: 444, 0xE8: 444, 0xE9: 444, 0xEA: 444, 0xEB: 444, 0xEC: 278,
                0xED: 278, 0xEE: 278, 0xEF: 278, 0xF0: 500, 0xF1: 556, 0xF2: 500, 0xF3: 500, 0xF4: 500,
                0xF5: 500, 0xF6: 500, 0xF7: 570, 0xF8: 500, 0xF9: 556, 0xFA: 556, 0xFB: 556, 0xFC: 556,
                0xFD: 500, 0xFE: 556, 0xFF: 500
            };
            for (const k in high) w[k] = high[k];
            return Object.freeze(w);
        })();
        // END-GENERATED-WIDTHS:TIMES_BOLD_WIDTHS

        // GENERATED-WIDTHS:TIMES_ITALIC_WIDTHS
        const TIMES_ITALIC_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            const ascii = {
                ' ': 250, '!': 333, '"': 420, '#': 500, '$': 500, '%': 833, '&': 778, '\'': 214,
                '(': 333, ')': 333, '*': 500, '+': 675, ',': 250, '-': 333, '.': 250, '/': 278,
                '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
                '8': 500, '9': 500, ':': 333, ';': 333, '<': 675, '=': 675, '>': 675, '?': 500,
                '@': 920, 'A': 611, 'B': 611, 'C': 667, 'D': 722, 'E': 611, 'F': 611, 'G': 722,
                'H': 722, 'I': 333, 'J': 444, 'K': 667, 'L': 556, 'M': 833, 'N': 667, 'O': 722,
                'P': 611, 'Q': 722, 'R': 611, 'S': 500, 'T': 556, 'U': 722, 'V': 611, 'W': 833,
                'X': 611, 'Y': 556, 'Z': 556, '[': 389, '\\': 278, ']': 389, '^': 422, '_': 500,
                '`': 333, 'a': 500, 'b': 500, 'c': 444, 'd': 500, 'e': 444, 'f': 278, 'g': 500,
                'h': 500, 'i': 278, 'j': 278, 'k': 444, 'l': 278, 'm': 722, 'n': 500, 'o': 500,
                'p': 500, 'q': 500, 'r': 389, 's': 389, 't': 278, 'u': 500, 'v': 444, 'w': 667,
                'x': 444, 'y': 444, 'z': 389, '{': 400, '|': 275, '}': 400, '~': 541
            };
            for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];
            const high = {
                0x80: 500, 0x82: 333, 0x83: 500, 0x84: 556, 0x85: 889, 0x86: 500, 0x87: 500, 0x88: 333,
                0x89: 1000, 0x8A: 500, 0x8B: 333, 0x8C: 944, 0x8E: 556, 0x91: 333, 0x92: 333, 0x93: 556,
                0x94: 556, 0x95: 350, 0x96: 500, 0x97: 889, 0x98: 333, 0x99: 980, 0x9A: 389, 0x9B: 333,
                0x9C: 667, 0x9E: 389, 0x9F: 556, 0xA0: 250, 0xA1: 389, 0xA2: 500, 0xA3: 500, 0xA4: 500,
                0xA5: 500, 0xA6: 275, 0xA7: 500, 0xA8: 333, 0xA9: 760, 0xAA: 276, 0xAB: 500, 0xAC: 675,
                0xAD: 333, 0xAE: 760, 0xAF: 333, 0xB0: 400, 0xB1: 675, 0xB2: 300, 0xB3: 300, 0xB4: 333,
                0xB5: 500, 0xB6: 523, 0xB7: 250, 0xB8: 333, 0xB9: 300, 0xBA: 310, 0xBB: 500, 0xBC: 750,
                0xBD: 750, 0xBE: 750, 0xBF: 500, 0xC0: 611, 0xC1: 611, 0xC2: 611, 0xC3: 611, 0xC4: 611,
                0xC5: 611, 0xC6: 889, 0xC7: 667, 0xC8: 611, 0xC9: 611, 0xCA: 611, 0xCB: 611, 0xCC: 333,
                0xCD: 333, 0xCE: 333, 0xCF: 333, 0xD0: 722, 0xD1: 667, 0xD2: 722, 0xD3: 722, 0xD4: 722,
                0xD5: 722, 0xD6: 722, 0xD7: 675, 0xD8: 722, 0xD9: 722, 0xDA: 722, 0xDB: 722, 0xDC: 722,
                0xDD: 556, 0xDE: 611, 0xDF: 500, 0xE0: 500, 0xE1: 500, 0xE2: 500, 0xE3: 500, 0xE4: 500,
                0xE5: 500, 0xE6: 667, 0xE7: 444, 0xE8: 444, 0xE9: 444, 0xEA: 444, 0xEB: 444, 0xEC: 278,
                0xED: 278, 0xEE: 278, 0xEF: 278, 0xF0: 500, 0xF1: 500, 0xF2: 500, 0xF3: 500, 0xF4: 500,
                0xF5: 500, 0xF6: 500, 0xF7: 675, 0xF8: 500, 0xF9: 500, 0xFA: 500, 0xFB: 500, 0xFC: 500,
                0xFD: 444, 0xFE: 500, 0xFF: 444
            };
            for (const k in high) w[k] = high[k];
            return Object.freeze(w);
        })();
        // END-GENERATED-WIDTHS:TIMES_ITALIC_WIDTHS

        // GENERATED-WIDTHS:TIMES_BOLD_ITALIC_WIDTHS
        const TIMES_BOLD_ITALIC_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            const ascii = {
                ' ': 250, '!': 389, '"': 555, '#': 500, '$': 500, '%': 833, '&': 778, '\'': 278,
                '(': 333, ')': 333, '*': 500, '+': 570, ',': 250, '-': 333, '.': 250, '/': 278,
                '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
                '8': 500, '9': 500, ':': 333, ';': 333, '<': 570, '=': 570, '>': 570, '?': 500,
                '@': 832, 'A': 667, 'B': 667, 'C': 667, 'D': 722, 'E': 667, 'F': 667, 'G': 722,
                'H': 778, 'I': 389, 'J': 500, 'K': 667, 'L': 611, 'M': 889, 'N': 722, 'O': 722,
                'P': 611, 'Q': 722, 'R': 667, 'S': 556, 'T': 611, 'U': 722, 'V': 667, 'W': 889,
                'X': 667, 'Y': 611, 'Z': 611, '[': 333, '\\': 278, ']': 333, '^': 570, '_': 500,
                '`': 333, 'a': 500, 'b': 500, 'c': 444, 'd': 500, 'e': 444, 'f': 333, 'g': 500,
                'h': 556, 'i': 278, 'j': 278, 'k': 500, 'l': 278, 'm': 778, 'n': 556, 'o': 500,
                'p': 500, 'q': 500, 'r': 389, 's': 389, 't': 278, 'u': 556, 'v': 444, 'w': 667,
                'x': 500, 'y': 444, 'z': 389, '{': 348, '|': 220, '}': 348, '~': 570
            };
            for (const k in ascii) w[k.charCodeAt(0)] = ascii[k];
            const high = {
                0x80: 500, 0x82: 333, 0x83: 500, 0x84: 500, 0x85: 1000, 0x86: 500, 0x87: 500, 0x88: 333,
                0x89: 1000, 0x8A: 556, 0x8B: 333, 0x8C: 944, 0x8E: 611, 0x91: 333, 0x92: 333, 0x93: 500,
                0x94: 500, 0x95: 350, 0x96: 500, 0x97: 1000, 0x98: 333, 0x99: 1000, 0x9A: 389, 0x9B: 333,
                0x9C: 722, 0x9E: 389, 0x9F: 611, 0xA0: 250, 0xA1: 389, 0xA2: 500, 0xA3: 500, 0xA4: 500,
                0xA5: 500, 0xA6: 220, 0xA7: 500, 0xA8: 333, 0xA9: 747, 0xAA: 266, 0xAB: 500, 0xAC: 606,
                0xAD: 333, 0xAE: 747, 0xAF: 333, 0xB0: 400, 0xB1: 570, 0xB2: 300, 0xB3: 300, 0xB4: 333,
                0xB5: 576, 0xB6: 500, 0xB7: 250, 0xB8: 333, 0xB9: 300, 0xBA: 300, 0xBB: 500, 0xBC: 750,
                0xBD: 750, 0xBE: 750, 0xBF: 500, 0xC0: 667, 0xC1: 667, 0xC2: 667, 0xC3: 667, 0xC4: 667,
                0xC5: 667, 0xC6: 944, 0xC7: 667, 0xC8: 667, 0xC9: 667, 0xCA: 667, 0xCB: 667, 0xCC: 389,
                0xCD: 389, 0xCE: 389, 0xCF: 389, 0xD0: 722, 0xD1: 722, 0xD2: 722, 0xD3: 722, 0xD4: 722,
                0xD5: 722, 0xD6: 722, 0xD7: 570, 0xD8: 722, 0xD9: 722, 0xDA: 722, 0xDB: 722, 0xDC: 722,
                0xDD: 611, 0xDE: 611, 0xDF: 500, 0xE0: 500, 0xE1: 500, 0xE2: 500, 0xE3: 500, 0xE4: 500,
                0xE5: 500, 0xE6: 722, 0xE7: 444, 0xE8: 444, 0xE9: 444, 0xEA: 444, 0xEB: 444, 0xEC: 278,
                0xED: 278, 0xEE: 278, 0xEF: 278, 0xF0: 500, 0xF1: 556, 0xF2: 500, 0xF3: 500, 0xF4: 500,
                0xF5: 500, 0xF6: 500, 0xF7: 570, 0xF8: 500, 0xF9: 556, 0xFA: 556, 0xFB: 556, 0xFC: 556,
                0xFD: 444, 0xFE: 500, 0xFF: 444
            };
            for (const k in high) w[k] = high[k];
            return Object.freeze(w);
        })();
        // END-GENERATED-WIDTHS:TIMES_BOLD_ITALIC_WIDTHS

        const timesRoman = Object.freeze({
            ...COMMON,
            fontName: 'Times-Roman', italicAngle: 0, weight: 'Roman', widths: TIMES_ROMAN_WIDTHS
        });
        const timesBold = Object.freeze({
            ...COMMON,
            fontName: 'Times-Bold', italicAngle: 0, weight: 'Bold', stemV: 139, widths: TIMES_BOLD_WIDTHS
        });
        const timesItalic = Object.freeze({
            ...COMMON,
            fontName: 'Times-Italic', italicAngle: -15.5, weight: 'Roman',
            flags: 0x22 | 0x40,                        // + Italic
            widths: TIMES_ITALIC_WIDTHS
        });
        const timesBoldItalic = Object.freeze({
            ...COMMON,
            fontName: 'Times-BoldItalic', italicAngle: -15, weight: 'Bold', stemV: 139,
            flags: 0x22 | 0x40,
            widths: TIMES_BOLD_ITALIC_WIDTHS
        });

        return {
            TIMES_ROMAN_WIDTHS, TIMES_BOLD_WIDTHS, TIMES_ITALIC_WIDTHS, TIMES_BOLD_ITALIC_WIDTHS,
            timesRoman, timesBold, timesItalic, timesBoldItalic
        };
    }
};
