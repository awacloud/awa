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
        const courier = Object.freeze({
            ...COMMON, fontName: 'Courier',           italicAngle: 0,   weight: 'Medium', widths: COURIER_WIDTHS
        });
        const courierBold = Object.freeze({
            ...COMMON, fontName: 'Courier-Bold',      italicAngle: 0,   weight: 'Bold', stemV: 106, widths: COURIER_WIDTHS
        });
        const courierOblique = Object.freeze({
            ...COMMON, fontName: 'Courier-Oblique',   italicAngle: -12, weight: 'Medium',
            flags: 0x23 | 0x40, widths: COURIER_WIDTHS
        });
        const courierBoldOblique = Object.freeze({
            ...COMMON, fontName: 'Courier-BoldOblique', italicAngle: -12, weight: 'Bold', stemV: 106,
            flags: 0x23 | 0x40, widths: COURIER_WIDTHS
        });
        return { COURIER_WIDTHS, courier, courierBold, courierOblique, courierBoldOblique };
    }
};
