// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview MacRomanEncoding — PDF 32000-1:2008 Annex D.2.
 *
 * 256-entry table mapping byte code → glyph name in Apple Mac Roman
 * encoding (the historical default on classic Mac OS).
 *
 * Strict factory-only : no top-level imports, no top-level
 * exports beyond the descriptor.
 *
 * @module fonts/encodings/macRoman
 */

export const encodingMacRoman = {
    name: 'encodingMacRoman',
    dependencies: [],
    factory() {
        const a = new Array(256).fill('.notdef');
        // 0x20..0x7E: ASCII printable (same as StandardEncoding's printable subset)
        const ascii = [
            'space','exclam','quotedbl','numbersign','dollar','percent','ampersand','quotesingle',
            'parenleft','parenright','asterisk','plus','comma','hyphen','period','slash',
            'zero','one','two','three','four','five','six','seven','eight','nine',
            'colon','semicolon','less','equal','greater','question','at',
            'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
            'bracketleft','backslash','bracketright','asciicircum','underscore','grave',
            'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
            'braceleft','bar','braceright','asciitilde'
        ];
        for (let i = 0; i < ascii.length; i++) a[0x20 + i] = ascii[i];

        // 0x80..0xFF — Mac Roman high range
        const hi = [
            'Adieresis','Aring','Ccedilla','Eacute','Ntilde','Odieresis','Udieresis','aacute',
            'agrave','acircumflex','adieresis','atilde','aring','ccedilla','eacute','egrave',
            'ecircumflex','edieresis','iacute','igrave','icircumflex','idieresis','ntilde','oacute',
            'ograve','ocircumflex','odieresis','otilde','uacute','ugrave','ucircumflex','udieresis',
            'dagger','degree','cent','sterling','section','bullet','paragraph','germandbls',
            'registered','copyright','trademark','acute','dieresis','notequal','AE','Oslash',
            'infinity','plusminus','lessequal','greaterequal','yen','mu','partialdiff','summation',
            'product','pi','integral','ordfeminine','ordmasculine','Omega','ae','oslash',
            'questiondown','exclamdown','logicalnot','radical','florin','approxequal','Delta','guillemotleft',
            'guillemotright','ellipsis','space','Agrave','Atilde','Otilde','OE','oe',
            'endash','emdash','quotedblleft','quotedblright','quoteleft','quoteright','divide','lozenge',
            'ydieresis','Ydieresis','fraction','currency','guilsinglleft','guilsinglright','fi','fl',
            'daggerdbl','periodcentered','quotesinglbase','quotedblbase','perthousand','Acircumflex','Ecircumflex','Aacute',
            'Edieresis','Egrave','Iacute','Icircumflex','Idieresis','Eacute','Igrave','Oacute',
            'Ocircumflex','apple','Ograve','Uacute','Ucircumflex','Ugrave','dotlessi','circumflex',
            'tilde','macron','breve','dotaccent','ring','cedilla','hungarumlaut','ogonek','caron'
        ];
        const cap = Math.min(hi.length, 128);
        for (let i = 0; i < cap; i++) a[0x80 + i] = hi[i];
        const MAC_ROMAN = Object.freeze(a);
        function lookup(byte) { return MAC_ROMAN[byte & 0xFF]; }
        return { MAC_ROMAN, lookup };
    }
};
