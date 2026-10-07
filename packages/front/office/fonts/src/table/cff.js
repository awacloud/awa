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
                // Private DICT
                const priv = topDict.get(18);
                if (priv && priv.length === 2) {
                    const [privLen, privOff] = priv;
                    const privBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + privOff, privLen);
                    font.privateDict = parseDict(privBytes);
                    // Local Subr INDEX (relative to Private DICT start)
                    const subrsOp = font.privateDict.get(19);
                    if (subrsOp && subrsOp.length === 1) {
                        const lsAbs = privOff + subrsOp[0];
                        const sub = new BinaryReader(bytes, lsAbs, bytes.length - lsAbs);
                        font.localSubrIndex = parseIndex(sub);
                    }
                }
                fonts.push(font);
            }

            return { major, minor, hdrSize, offSize, nameIndex, topDictIndex, stringIndex, globalSubrIndex, fonts };
        }

        return { parseCff, parseIndex, parseDict, decodeCharstring, subrBias, TOP_DICT_OPS };
    }
};

