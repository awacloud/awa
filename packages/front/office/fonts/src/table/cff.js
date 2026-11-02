// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `CFF ` — Compact Font Format Type 2 (OT §10).
 *
 * Layout (top-down) :
 *
 * ```
 *   Header             : 5 bytes (major, minor, hdrSize, offSize)
 *   Name INDEX         : font name(s) of this CFF
 *   Top DICT INDEX     : per-font DICT (CharStrings offset, charset, …)
 *   String INDEX       : pool of CFF strings beyond the 391 std names
 *   Global Subr INDEX  : globally shared subroutines
 *   <Encodings / Charsets / FDSelect / CharStrings INDEX / Private DICT
 *    / Local Subr INDEX>  — addressed by Top DICT offsets
 * ```
 *
 * Logic is split across sibling sub-modules :
 *  - `./cff/index-record.js` — INDEX parser
 *  - `./cff/dict.js`         — DICT parser + Top DICT op names
 *  - `./cff/charstring.js`   — Type 2 charstring decoder
 *
 * Type 2 charstrings : per-glyph byte stream of operators (see
 * {@link decodeCharstring}).
 *
 * @module fonts/table/cff
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { tableCffIndexRecord } from './cff/index-record.js';
import { tableCffDict } from './cff/dict.js';
import { tableCffCharstring } from './cff/charstring.js';

export const tableCff = {
    name: 'tableCff',
    dependencies: ['fontErrors', 'fontReader', 'tableCffIndexRecord', 'tableCffDict', 'tableCffCharstring'],
    deps: [fontErrors, fontReader, tableCffIndexRecord, tableCffDict, tableCffCharstring],
    factory(errors, reader, indexRecord, dict, charstring) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseIndex } = indexRecord;
        const { parseDict, TOP_DICT_OPS } = dict;
        const { decodeCharstring, subrBias } = charstring;

        // The 391 standard strings (CFF specification, Appendix A): SIDs 0..390.
        const CFF_STANDARD_STRINGS = Object.freeze([
            '.notdef', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand',
            'quoteright', 'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period',
            'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
            'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D',
            'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
            'W', 'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum',
            'underscore', 'quoteleft', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
            'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar',
            'braceright', 'asciitilde', 'exclamdown', 'cent', 'sterling', 'fraction', 'yen', 'florin',
            'section', 'currency', 'quotesingle', 'quotedblleft', 'guillemotleft', 'guilsinglleft',
            'guilsinglright', 'fi', 'fl', 'endash', 'dagger', 'daggerdbl', 'periodcentered',
            'paragraph', 'bullet', 'quotesinglbase', 'quotedblbase', 'quotedblright', 'guillemotright',
            'ellipsis', 'perthousand', 'questiondown', 'grave', 'acute', 'circumflex', 'tilde',
            'macron', 'breve', 'dotaccent', 'dieresis', 'ring', 'cedilla', 'hungarumlaut', 'ogonek',
            'caron', 'emdash', 'AE', 'ordfeminine', 'Lslash', 'Oslash', 'OE', 'ordmasculine', 'ae',
            'dotlessi', 'lslash', 'oslash', 'oe', 'germandbls', 'onesuperior', 'logicalnot', 'mu',
            'trademark', 'Eth', 'onehalf', 'plusminus', 'Thorn', 'onequarter', 'divide', 'brokenbar',
            'degree', 'thorn', 'threequarters', 'twosuperior', 'registered', 'minus', 'eth',
            'multiply', 'threesuperior', 'copyright', 'Aacute', 'Acircumflex', 'Adieresis', 'Agrave',
            'Aring', 'Atilde', 'Ccedilla', 'Eacute', 'Ecircumflex', 'Edieresis', 'Egrave', 'Iacute',
            'Icircumflex', 'Idieresis', 'Igrave', 'Ntilde', 'Oacute', 'Ocircumflex', 'Odieresis',
            'Ograve', 'Otilde', 'Scaron', 'Uacute', 'Ucircumflex', 'Udieresis', 'Ugrave', 'Yacute',
            'Ydieresis', 'Zcaron', 'aacute', 'acircumflex', 'adieresis', 'agrave', 'aring', 'atilde',
            'ccedilla', 'eacute', 'ecircumflex', 'edieresis', 'egrave', 'iacute', 'icircumflex',
            'idieresis', 'igrave', 'ntilde', 'oacute', 'ocircumflex', 'odieresis', 'ograve', 'otilde',
            'scaron', 'uacute', 'ucircumflex', 'udieresis', 'ugrave', 'yacute', 'ydieresis', 'zcaron',
            'exclamsmall', 'Hungarumlautsmall', 'dollaroldstyle', 'dollarsuperior', 'ampersandsmall',
            'Acutesmall', 'parenleftsuperior', 'parenrightsuperior', 'twodotenleader',
            'onedotenleader', 'zerooldstyle', 'oneoldstyle', 'twooldstyle', 'threeoldstyle',
            'fouroldstyle', 'fiveoldstyle', 'sixoldstyle', 'sevenoldstyle', 'eightoldstyle',
            'nineoldstyle', 'commasuperior', 'threequartersemdash', 'periodsuperior', 'questionsmall',
            'asuperior', 'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', 'isuperior',
            'lsuperior', 'msuperior', 'nsuperior', 'osuperior', 'rsuperior', 'ssuperior', 'tsuperior',
            'ff', 'ffi', 'ffl', 'parenleftinferior', 'parenrightinferior', 'Circumflexsmall',
            'hyphensuperior', 'Gravesmall', 'Asmall', 'Bsmall', 'Csmall', 'Dsmall', 'Esmall', 'Fsmall',
            'Gsmall', 'Hsmall', 'Ismall', 'Jsmall', 'Ksmall', 'Lsmall', 'Msmall', 'Nsmall', 'Osmall',
            'Psmall', 'Qsmall', 'Rsmall', 'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall', 'Xsmall',
            'Ysmall', 'Zsmall', 'colonmonetary', 'onefitted', 'rupiah', 'Tildesmall',
            'exclamdownsmall', 'centoldstyle', 'Lslashsmall', 'Scaronsmall', 'Zcaronsmall',
            'Dieresissmall', 'Brevesmall', 'Caronsmall', 'Dotaccentsmall', 'Macronsmall', 'figuredash',
            'hypheninferior', 'Ogoneksmall', 'Ringsmall', 'Cedillasmall', 'questiondownsmall',
            'oneeighth', 'threeeighths', 'fiveeighths', 'seveneighths', 'onethird', 'twothirds',
            'zerosuperior', 'foursuperior', 'fivesuperior', 'sixsuperior', 'sevensuperior',
            'eightsuperior', 'ninesuperior', 'zeroinferior', 'oneinferior', 'twoinferior',
            'threeinferior', 'fourinferior', 'fiveinferior', 'sixinferior', 'seveninferior',
            'eightinferior', 'nineinferior', 'centinferior', 'dollarinferior', 'periodinferior',
            'commainferior', 'Agravesmall', 'Aacutesmall', 'Acircumflexsmall', 'Atildesmall',
            'Adieresissmall', 'Aringsmall', 'AEsmall', 'Ccedillasmall', 'Egravesmall', 'Eacutesmall',
            'Ecircumflexsmall', 'Edieresissmall', 'Igravesmall', 'Iacutesmall', 'Icircumflexsmall',
            'Idieresissmall', 'Ethsmall', 'Ntildesmall', 'Ogravesmall', 'Oacutesmall',
            'Ocircumflexsmall', 'Otildesmall', 'Odieresissmall', 'OEsmall', 'Oslashsmall',
            'Ugravesmall', 'Uacutesmall', 'Ucircumflexsmall', 'Udieresissmall', 'Yacutesmall',
            'Thornsmall', 'Ydieresissmall', '001.000', '001.001', '001.002', '001.003', 'Black',
            'Bold', 'Book', 'Light', 'Medium', 'Regular', 'Roman', 'Semibold'
        ]);

        function bytesToAscii(u8) {
            let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
            return s;
        }

        function parseCff(bytes) {
            const r = new BinaryReader(bytes);
            if (bytes.length < 4)
                throw new ParseError('fonts/cff-short', 'CFF header truncated');
            const major   = r.readUint8();
            const minor   = r.readUint8();
            const hdrSize = r.readUint8();
            const offSize = r.readUint8();
            if (major !== 1)
                throw new ParseError('fonts/cff-version',
                    `unsupported CFF major version ${major} (expected 1)`,
                    { context: { major, minor } });
            r.seek(hdrSize);
            const nameIndex   = parseIndex(r);
            const topDictIndex = parseIndex(r);
            const stringIndex = parseIndex(r);
            const globalSubrIndex = parseIndex(r);

            const fonts = [];
            for (let i = 0; i < topDictIndex.count; i++) {
                const topDict = parseDict(topDictIndex.items[i]);
                const name = bytesToAscii(nameIndex.items[i]);
                const font = {
                    name, topDict,
                    charStringsIndex: null, privateDict: null, localSubrIndex: null,
                    charset: null
                };
                // CharStrings INDEX
                const csOff = topDict.get(17);
                if (csOff && csOff.length === 1) {
                    const sub = new BinaryReader(bytes, csOff[0], bytes.length - csOff[0]);
                    font.charStringsIndex = parseIndex(sub);
                }
                // Private DICT and its Local Subr INDEX (relative to the Private DICT start)
                Object.assign(font, readPrivate(bytes, topDict.get(18)));
                // Glyph SIDs (CIDs in a CID-keyed font) and, name-keyed, glyph names.
                // Malformed data gives null, never a throw.
                font.charset = readCharset(bytes, topDict.get(15), font.charStringsIndex ? font.charStringsIndex.count : 0);
                font.glyphNames = font.charset && !topDict.has(0x0C1E) ? glyphNamesOf(font.charset, stringIndex) : null;
                // CID-keyed font: per-glyph Font DICTs (FDArray) and their
                // selector (FDSelect). Malformed data gives null, never a throw.
                font.fdArray = readFdArray(bytes, topDict.get(0x0C24));
                font.fdSelect = font.fdArray && font.charStringsIndex
                    ? readFdSelect(bytes, topDict.get(0x0C25), font.charStringsIndex.count, font.fdArray.length)
                    : null;
                fonts.push(font);
            }

            return { major, minor, hdrSize, offSize, nameIndex, topDictIndex, stringIndex, globalSubrIndex, fonts };
        }

        /**
         * The charset (§13): the SID — CID in a CID-keyed font — of every
         * glyph, glyph 0 being 0; formats 0, 1 and 2 and the predefined
         * ISOAdobe charset (offset 0, also when the operator is absent). The
         * predefined Expert charsets (1, 2), malformed or out-of-range data
         * give null.
         */
        function readCharset(bytes, op, nGlyphs) {
            if (nGlyphs <= 0) return null;
            const off = op && op.length === 1 ? op[0] : 0;
            if (off === 0) {
                if (nGlyphs > 229) return null; // ISOAdobe holds SIDs 0..228
                return Uint16Array.from({ length: nGlyphs }, (_, gid) => gid);
            }
            if (off < 3 || off >= bytes.length) return null;
            const u8 = (at) => (at < bytes.length ? bytes[at] : -1);
            const u16 = (at) => (at + 1 < bytes.length ? (bytes[at] << 8) | bytes[at + 1] : -1);
            const out = new Uint16Array(nGlyphs);
            const format = bytes[off];
            let p = off + 1;
            let gid = 1;
            if (format === 0) {
                for (; gid < nGlyphs; gid++, p += 2) {
                    const sid = u16(p);
                    if (sid < 0) return null;
                    out[gid] = sid;
                }
                return out;
            }
            if (format !== 1 && format !== 2) return null;
            while (gid < nGlyphs) {
                const first = u16(p);
                const nLeft = format === 1 ? u8(p + 2) : u16(p + 2);
                if (first < 0 || nLeft < 0) return null;
                p += format === 1 ? 3 : 4;
                for (let k = 0; k <= nLeft && gid < nGlyphs; k++) out[gid++] = first + k;
            }
            return out;
        }

        /** The glyph names of a name-keyed charset, or null when a SID names no string. */
        function glyphNamesOf(charset, stringIndex) {
            const names = new Array(charset.length);
            for (let gid = 0; gid < charset.length; gid++) {
                const sid = charset[gid];
                if (sid < CFF_STANDARD_STRINGS.length) names[gid] = CFF_STANDARD_STRINGS[sid];
                else if (sid - CFF_STANDARD_STRINGS.length < stringIndex.count) {
                    names[gid] = bytesToAscii(stringIndex.items[sid - CFF_STANDARD_STRINGS.length]);
                } else return null;
            }
            return names;
        }

        /** The Private DICT `[size, offset]` and its local Subr INDEX, or nulls. */
        function readPrivate(bytes, priv) {
            if (!priv || priv.length !== 2) return { privateDict: null, localSubrIndex: null };
            const [privLen, privOff] = priv;
            const privateDict = parseDict(new Uint8Array(bytes.buffer, bytes.byteOffset + privOff, privLen));
            let localSubrIndex = null;
            const subrsOp = privateDict.get(19);
            if (subrsOp && subrsOp.length === 1) {
                const lsAbs = privOff + subrsOp[0];
                localSubrIndex = parseIndex(new BinaryReader(bytes, lsAbs, bytes.length - lsAbs));
            }
            return { privateDict, localSubrIndex };
        }

        /** The FDArray (an INDEX of Font DICTs, each naming its Private DICT), or null. */
        function readFdArray(bytes, op) {
            if (!op || op.length !== 1 || op[0] <= 0 || op[0] >= bytes.length) return null;
            try {
                const idx = parseIndex(new BinaryReader(bytes, op[0], bytes.length - op[0]));
                return idx.items.map((item) => {
                    const fontDict = parseDict(item);
                    return { fontDict, ...readPrivate(bytes, fontDict.get(18)) };
                });
            } catch (_e) {
                return null;
            }
        }

        /**
         * The FDSelect table (formats 0 and 3): the Font DICT index of every
         * glyph, or null when it is absent, malformed or names a missing
         * Font DICT.
         */
        function readFdSelect(bytes, op, nGlyphs, nFds) {
            if (!op || op.length !== 1) return null;
            let p = op[0];
            if (p < 0 || p >= bytes.length) return null;
            const u8 = (at) => (at < bytes.length ? bytes[at] : -1);
            const u16 = (at) => (at + 1 < bytes.length ? (bytes[at] << 8) | bytes[at + 1] : -1);
            const out = new Uint8Array(nGlyphs);
            const format = bytes[p++];
            if (format === 0) {
                for (let gid = 0; gid < nGlyphs; gid++) {
                    const fd = u8(p + gid);
                    if (fd < 0 || fd >= nFds) return null;
                    out[gid] = fd;
                }
                return out;
            }
            if (format !== 3) return null;
            const nRanges = u16(p);
            if (nRanges <= 0) return null;
            p += 2;
            for (let i = 0; i < nRanges; i++) {
                const first = u16(p + 3 * i);
                const fd = u8(p + 3 * i + 2);
                const next = u16(p + 3 * (i + 1)); // the next range's first, or the sentinel
                if (first < 0 || next < 0 || fd < 0 || fd >= nFds || next < first || next > nGlyphs) return null;
                if (i === 0 && first !== 0) return null;
                out.fill(fd, first, next);
            }
            return out;
        }

        /**
         * The Private DICT and local subroutines a glyph's charstring runs
         * with: its Font DICT's for a CID-keyed font, else the Top DICT's.
         */
        function privateForGlyph(font, gid) {
            if (font.fdArray && font.fdSelect && gid >= 0 && gid < font.fdSelect.length) {
                const fd = font.fdArray[font.fdSelect[gid]];
                return { privateDict: fd.privateDict, localSubrIndex: fd.localSubrIndex };
            }
            return { privateDict: font.privateDict, localSubrIndex: font.localSubrIndex };
        }

        return { parseCff, parseIndex, parseDict, decodeCharstring, subrBias, privateForGlyph, TOP_DICT_OPS, CFF_STANDARD_STRINGS };
    }
};

