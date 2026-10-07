// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard 14 — ZapfDingbats (decorative).
 *
 * Strict factory-only.
 *
 * @module fonts/standard14/zapfDingbats
 */

export const standard14ZapfDingbats = {
    name: 'standard14ZapfDingbats',
    dependencies: [],
    factory() {
        const ZAPF_WIDTHS = (() => {
            const w = new Array(256).fill(0);
            for (let i = 0x20; i <= 0x7E; i++) w[i] = 600;
            w[0x20] = 278;
            return Object.freeze(w);
        })();

        const zapfDingbatsFont = Object.freeze({
            familyName: 'ITC Zapf Dingbats', fontName: 'ZapfDingbats',
            flags:      0x04,
            fontBBox:   [-1, -143, 981, 820],
            ascent:     820, descent: -143,
            capHeight:  820, xHeight: 500,
            stemV:      90, stemH: 28,
            italicAngle: 0, weight: 'Medium',
            encoding:   'ZapfDingbats',
            widths:     ZAPF_WIDTHS
        });

        return { ZAPF_WIDTHS, zapfDingbatsFont };
    }
};
