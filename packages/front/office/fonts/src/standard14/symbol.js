// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard 14 — Symbol font (Greek + math).
 *
 * Strict factory-only.
 *
 * @module fonts/standard14/symbol
 */

export const standard14Symbol = {
    name: 'standard14Symbol',
    dependencies: [],
    factory() {
        const SYMBOL_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            // Approximation of common Symbol metrics: no exact AFM widths are
            // embedded. The printable-ASCII slots use a typical 500 (Symbol is
            // loosely monospaced for Greek letters in the original 1985
            // design), with the space and exclam slots set below; every other
            // slot is 0.
            for (let i = 0x20; i <= 0x7E; i++) w[i] = 500;
            w[0x20] = 250;   // space
            w[0x21] = 333;   // exclam
            return Object.freeze(w);
        })();

        const symbolFont = Object.freeze({
            familyName: 'Symbol', fontName: 'Symbol',
            flags:      0x04,                       // Symbolic
            fontBBox:   [-180, -293, 1090, 1010],
            ascent:     1010, descent: -293,
            capHeight:  700, xHeight: 500,
            stemV:      85, stemH: 92,
            italicAngle: 0, weight: 'Medium',
            encoding:   'Symbol',                   // built-in encoding
            widths:     SYMBOL_WIDTHS
        });

        return { SYMBOL_WIDTHS, symbolFont };
    }
};
