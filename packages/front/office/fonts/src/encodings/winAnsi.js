// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WinAnsiEncoding — PDF 32000-1:2008 Annex D.2.
 *
 * 256-entry table mapping byte code (0..255) → glyph name (PostScript)
 * for the WinAnsi encoding used by most Windows-originated PDFs.
 *
 * Strict factory-only.
 *
 * @module fonts/encodings/winAnsi
 */

export const encodingWinAnsi = {
    name: 'encodingWinAnsi',
    dependencies: [],
    factory() {
        const a = new Array(256).fill('.notdef');
        // Control range (0x00..0x1F) and DEL → '.notdef' (already filled)
        // 0x20..0x7E — printable ASCII matches Adobe StandardEncoding mostly
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

        // 0x80..0x9F range — Win-1252 high-controls
        const win1252Hi = {
            0x80: 'Euro',
            0x82: 'quotesinglbase',
            0x83: 'florin',
            0x84: 'quotedblbase',
            0x85: 'ellipsis',
            0x86: 'dagger',
            0x87: 'daggerdbl',
            0x88: 'circumflex',
            0x89: 'perthousand',
            0x8A: 'Scaron',
            0x8B: 'guilsinglleft',
            0x8C: 'OE',
            0x8E: 'Zcaron',
            0x91: 'quoteleft',
            0x92: 'quoteright',
            0x93: 'quotedblleft',
            0x94: 'quotedblright',
            0x95: 'bullet',
            0x96: 'endash',
            0x97: 'emdash',
            0x98: 'tilde',
            0x99: 'trademark',
            0x9A: 'scaron',
            0x9B: 'guilsinglright',
            0x9C: 'oe',
            0x9E: 'zcaron',
            0x9F: 'Ydieresis'
        };
        for (const k in win1252Hi) a[k | 0] = win1252Hi[k];

        // 0xA0..0xFF — Latin-1 supplement (matches Win-1252)
        const latin1Hi = [
            'space','exclamdown','cent','sterling','currency','yen','brokenbar','section',
            'dieresis','copyright','ordfeminine','guillemotleft','logicalnot','hyphen','registered','macron',
            'degree','plusminus','twosuperior','threesuperior','acute','mu','paragraph','periodcentered',
            'cedilla','onesuperior','ordmasculine','guillemotright','onequarter','onehalf','threequarters','questiondown',
            'Agrave','Aacute','Acircumflex','Atilde','Adieresis','Aring','AE','Ccedilla',
            'Egrave','Eacute','Ecircumflex','Edieresis','Igrave','Iacute','Icircumflex','Idieresis',
            'Eth','Ntilde','Ograve','Oacute','Ocircumflex','Otilde','Odieresis','multiply',
            'Oslash','Ugrave','Uacute','Ucircumflex','Udieresis','Yacute','Thorn','germandbls',
            'agrave','aacute','acircumflex','atilde','adieresis','aring','ae','ccedilla',
            'egrave','eacute','ecircumflex','edieresis','igrave','iacute','icircumflex','idieresis',
            'eth','ntilde','ograve','oacute','ocircumflex','otilde','odieresis','divide',
            'oslash','ugrave','uacute','ucircumflex','udieresis','yacute','thorn','ydieresis'
        ];
        for (let i = 0; i < latin1Hi.length; i++) a[0xA0 + i] = latin1Hi[i];
        const WIN_ANSI = Object.freeze(a);
        function lookup(byte) { return WIN_ANSI[byte & 0xFF]; }
        return { WIN_ANSI, lookup };
    }
};
