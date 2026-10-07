// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview MacExpertEncoding — PDF 32000-1:2008 Annex D.4.
 *
 * Apple "Expert" encoding used by the Times-Roman Expert / Symbol /
 * etc. companion fonts. Sparse table — most slots are `.notdef`.
 *
 * Strict factory-only.
 *
 * @module fonts/encodings/macExpert
 */

export const encodingMacExpert = {
    name: 'encodingMacExpert',
    dependencies: [],
    factory() {
        const a = new Array(256).fill('.notdef');
        const map = {
            0x20: 'space',
            0x21: 'exclamsmall', 0x22: 'Hungarumlautsmall', 0x23: 'centoldstyle',
            0x24: 'dollaroldstyle', 0x25: 'dollarsuperior', 0x26: 'ampersandsmall',
            0x27: 'Acutesmall', 0x28: 'parenleftsuperior', 0x29: 'parenrightsuperior',
            0x2A: 'twodotenleader', 0x2B: 'onedotenleader', 0x2C: 'comma', 0x2D: 'hyphen',
            0x2E: 'period', 0x2F: 'fraction',
            0x30: 'zerooldstyle', 0x31: 'oneoldstyle', 0x32: 'twooldstyle', 0x33: 'threeoldstyle',
            0x34: 'fouroldstyle', 0x35: 'fiveoldstyle', 0x36: 'sixoldstyle', 0x37: 'sevenoldstyle',
            0x38: 'eightoldstyle', 0x39: 'nineoldstyle', 0x3A: 'colon', 0x3B: 'semicolon',
            0x3D: 'threequartersemdash', 0x3F: 'questionsmall',
            0x44: 'Ethsmall',
            0x47: 'onequarter', 0x48: 'onehalf', 0x49: 'threequarters',
            0x4A: 'oneeighth', 0x4B: 'threeeighths', 0x4C: 'fiveeighths', 0x4D: 'seveneighths',
            0x4E: 'onethird', 0x4F: 'twothirds',
            0x56: 'ff', 0x57: 'fi', 0x58: 'fl', 0x59: 'ffi', 0x5A: 'ffl',
            0x5B: 'parenleftinferior', 0x5D: 'parenrightinferior',
            0x5E: 'Circumflexsmall', 0x5F: 'hypheninferior',
            0x60: 'Gravesmall',
            0x61: 'Asmall', 0x62: 'Bsmall', 0x63: 'Csmall', 0x64: 'Dsmall', 0x65: 'Esmall',
            0x66: 'Fsmall', 0x67: 'Gsmall', 0x68: 'Hsmall', 0x69: 'Ismall', 0x6A: 'Jsmall',
            0x6B: 'Ksmall', 0x6C: 'Lsmall', 0x6D: 'Msmall', 0x6E: 'Nsmall', 0x6F: 'Osmall',
            0x70: 'Psmall', 0x71: 'Qsmall', 0x72: 'Rsmall', 0x73: 'Ssmall', 0x74: 'Tsmall',
            0x75: 'Usmall', 0x76: 'Vsmall', 0x77: 'Wsmall', 0x78: 'Xsmall', 0x79: 'Ysmall', 0x7A: 'Zsmall',
            0x7B: 'colonmonetary', 0x7C: 'onefitted', 0x7D: 'rupiah', 0x7E: 'Tildesmall',
            0x82: 'asuperior', 0x83: 'centsuperior',
            0x87: 'Aacutesmall', 0x88: 'Agravesmall', 0x89: 'Acircumflexsmall',
            0x8A: 'Adieresissmall', 0x8B: 'Atildesmall', 0x8C: 'Aringsmall',
            0x8D: 'Ccedillasmall', 0x8E: 'Eacutesmall', 0x8F: 'Egravesmall',
            0x90: 'Ecircumflexsmall', 0x91: 'Edieresissmall', 0x92: 'Iacutesmall',
            0x93: 'Igravesmall', 0x94: 'Icircumflexsmall', 0x95: 'Idieresissmall',
            0x96: 'Ntildesmall', 0x97: 'Oacutesmall', 0x98: 'Ogravesmall',
            0x99: 'Ocircumflexsmall', 0x9A: 'Odieresissmall', 0x9B: 'Otildesmall',
            0x9C: 'Uacutesmall', 0x9D: 'Ugravesmall', 0x9E: 'Ucircumflexsmall', 0x9F: 'Udieresissmall',
            0xA1: 'eightsuperior', 0xA2: 'fourinferior', 0xA3: 'threeinferior',
            0xA4: 'sixinferior', 0xA5: 'eightinferior', 0xA6: 'seveninferior',
            0xA7: 'Scaronsmall', 0xA9: 'centinferior', 0xAA: 'twoinferior',
            0xAC: 'Dieresissmall', 0xAE: 'Caronsmall', 0xAF: 'osuperior',
            0xB0: 'fiveinferior', 0xB2: 'commainferior', 0xB3: 'periodinferior',
            0xB4: 'Yacutesmall', 0xB6: 'dollarinferior', 0xB9: 'Thornsmall',
            0xBB: 'nineinferior', 0xBC: 'zeroinferior', 0xBD: 'Zcaronsmall',
            0xBE: 'AEsmall', 0xBF: 'Oslashsmall', 0xC0: 'questiondownsmall',
            0xC1: 'oneinferior', 0xC2: 'Lslashsmall',
            0xC9: 'Cedillasmall', 0xCF: 'OEsmall',
            0xD0: 'figuredash', 0xD1: 'hyphensuperior',
            0xD6: 'exclamdownsmall', 0xD8: 'Ydieresissmall',
            0xDA: 'onesuperior', 0xDB: 'twosuperior', 0xDC: 'threesuperior',
            0xDD: 'foursuperior', 0xDE: 'fivesuperior', 0xDF: 'sixsuperior',
            0xE0: 'sevensuperior', 0xE1: 'ninesuperior', 0xE2: 'zerosuperior',
            0xE4: 'esuperior', 0xE5: 'rsuperior', 0xE6: 'tsuperior',
            0xE9: 'isuperior', 0xEA: 'ssuperior', 0xEB: 'dsuperior',
            0xEF: 'lsuperior',
            0xF0: 'Ogoneksmall', 0xF1: 'Brevesmall', 0xF2: 'Macronsmall',
            0xF3: 'bsuperior', 0xF4: 'nsuperior', 0xF5: 'msuperior',
            0xF6: 'commasuperior', 0xF7: 'periodsuperior', 0xF8: 'Dotaccentsmall', 0xF9: 'Ringsmall'
        };
        for (const k in map) a[k | 0] = map[k];
        const MAC_EXPERT = Object.freeze(a);
        function lookup(byte) { return MAC_EXPERT[byte & 0xFF]; }
        return { MAC_EXPERT, lookup };
    }
};
