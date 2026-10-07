// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview StandardEncoding — Adobe Type 1 base encoding (PDF
 * 32000-1:2008 Annex D.2). Used as the default for built-in PostScript
 * Type 1 fonts without an explicit Encoding override.
 *
 * Strict factory-only.
 *
 * @module fonts/encodings/standard
 */

export const encodingStandard = {
    name: 'encodingStandard',
    dependencies: [],
    factory() {
        const a = new Array(256).fill('.notdef');
        // 0x20..0x7E
        const ascii = [
            'space','exclam','quotedbl','numbersign','dollar','percent','ampersand','quoteright',
            'parenleft','parenright','asterisk','plus','comma','hyphen','period','slash',
            'zero','one','two','three','four','five','six','seven','eight','nine',
            'colon','semicolon','less','equal','greater','question','at',
            'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
            'bracketleft','backslash','bracketright','asciicircum','underscore','quoteleft',
            'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
            'braceleft','bar','braceright','asciitilde'
        ];
        for (let i = 0; i < ascii.length; i++) a[0x20 + i] = ascii[i];
        // High range (Adobe std encoding sparse high half)
        const hi = {
            0xA1: 'exclamdown', 0xA2: 'cent', 0xA3: 'sterling', 0xA4: 'fraction',
            0xA5: 'yen', 0xA6: 'florin', 0xA7: 'section', 0xA8: 'currency',
            0xA9: 'quotesingle', 0xAA: 'quotedblleft', 0xAB: 'guillemotleft',
            0xAC: 'guilsinglleft', 0xAD: 'guilsinglright', 0xAE: 'fi', 0xAF: 'fl',
            0xB1: 'endash', 0xB2: 'dagger', 0xB3: 'daggerdbl', 0xB4: 'periodcentered',
            0xB6: 'paragraph', 0xB7: 'bullet', 0xB8: 'quotesinglbase', 0xB9: 'quotedblbase',
            0xBA: 'quotedblright', 0xBB: 'guillemotright', 0xBC: 'ellipsis', 0xBD: 'perthousand',
            0xBF: 'questiondown', 0xC1: 'grave', 0xC2: 'acute', 0xC3: 'circumflex',
            0xC4: 'tilde', 0xC5: 'macron', 0xC6: 'breve', 0xC7: 'dotaccent', 0xC8: 'dieresis',
            0xCA: 'ring', 0xCB: 'cedilla', 0xCD: 'hungarumlaut', 0xCE: 'ogonek', 0xCF: 'caron',
            0xE1: 'AE', 0xE3: 'ordfeminine', 0xE8: 'Lslash', 0xE9: 'Oslash', 0xEA: 'OE',
            0xEB: 'ordmasculine', 0xF1: 'ae', 0xF5: 'dotlessi', 0xF8: 'lslash', 0xF9: 'oslash',
            0xFA: 'oe', 0xFB: 'germandbls'
        };
        for (const k in hi) a[k | 0] = hi[k];
        const STANDARD = Object.freeze(a);
        function lookup(byte) { return STANDARD[byte & 0xFF]; }
        return { STANDARD, lookup };
    }
};
