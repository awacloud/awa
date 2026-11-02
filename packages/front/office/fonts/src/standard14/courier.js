// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard 14 — Courier family (monospaced, 600-unit
 * advance width for every glyph by design).
 *
 * Strict factory-only.
 *
 * @module fonts/standard14/courier
 */

export const standard14Courier = {
    name: 'standard14Courier',
    dependencies: [],
    factory() {
        const COMMON = Object.freeze({
            familyName: 'Courier',
            flags:      0x23,            // FixedPitch + Serif + Nonsymbolic
            fontBBox:   [-23, -250, 715, 805],
            ascent:     629,
            descent:   -157,
            capHeight:  562,
            xHeight:    426,
            stemV:      51,
            stemH:      51
        });
        const COURIER_WIDTHS = Object.freeze(new Array(256).fill(600));
        // The glyphs MacRomanEncoding and StandardEncoding name that the
        // WinAnsi table cannot hold (the list the generator composes for
        // Helvetica and Times), monospaced too.
        const COURIER_EXTRA_WIDTHS = Object.freeze(Object.fromEntries([
            'Delta', 'Lslash', 'breve', 'caron', 'dotaccent', 'dotlessi', 'fi',
            'fl', 'fraction', 'greaterequal', 'hungarumlaut', 'infinity', 'lessequal',
            'lozenge', 'lslash', 'notequal', 'ogonek', 'partialdiff', 'radical',
            'ring', 'summation'
        ].map((name) => [name, 600])));
        const courier = Object.freeze({
            ...COMMON, fontName: 'Courier',           italicAngle: 0,   weight: 'Medium', widths: COURIER_WIDTHS,
            extraWidths: COURIER_EXTRA_WIDTHS
        });
        const courierBold = Object.freeze({
            ...COMMON, fontName: 'Courier-Bold',      italicAngle: 0,   weight: 'Bold', stemV: 106, widths: COURIER_WIDTHS,
            extraWidths: COURIER_EXTRA_WIDTHS
        });
        const courierOblique = Object.freeze({
            ...COMMON, fontName: 'Courier-Oblique',   italicAngle: -12, weight: 'Medium',
            flags: 0x23 | 0x40, widths: COURIER_WIDTHS, extraWidths: COURIER_EXTRA_WIDTHS
        });
        const courierBoldOblique = Object.freeze({
            ...COMMON, fontName: 'Courier-BoldOblique', italicAngle: -12, weight: 'Bold', stemV: 106,
            flags: 0x23 | 0x40, widths: COURIER_WIDTHS, extraWidths: COURIER_EXTRA_WIDTHS
        });
        return { COURIER_WIDTHS, COURIER_EXTRA_WIDTHS, courier, courierBold, courierOblique, courierBoldOblique };
    }
};
