// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Text encodings used by the `name` table and a few
 * legacy paths.
 *
 * - **UTF-16BE** : Windows platform (3) almost always uses
 *   `Unicode BMP` (encoding 1) or `Unicode full repertoire` (10).
 *   Decoded via successive `getUint16` BE.
 * - **Mac Roman** : Macintosh platform (1) encoding 0 — single-byte
 *   table mapping bytes 0x80..0xFF to specific Unicode codepoints.
 *
 * Other Macintosh script encodings (Japanese, ChineseTrad, …) are
 * declared with a stub that returns the bytes unchanged — applications
 * needing CJK Mac names can plug a transcoder via the extra mechanism.
 *
 * Strict factory-only : no top-level imports, no top-level
 * exports beyond the descriptor.
 *
 * @module fonts/primitives/encoding
 */

import { fontErrors } from '../errors.js';

export const fontEncoding = {
    name: 'fontEncoding',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;
        const MAC_ROMAN_HIGH = [
            0x00C4, 0x00C5, 0x00C7, 0x00C9, 0x00D1, 0x00D6, 0x00DC, 0x00E1,
            0x00E0, 0x00E2, 0x00E4, 0x00E3, 0x00E5, 0x00E7, 0x00E9, 0x00E8,
            0x00EA, 0x00EB, 0x00ED, 0x00EC, 0x00EE, 0x00EF, 0x00F1, 0x00F3,
            0x00F2, 0x00F4, 0x00F6, 0x00F5, 0x00FA, 0x00F9, 0x00FB, 0x00FC,
            0x2020, 0x00B0, 0x00A2, 0x00A3, 0x00A7, 0x2022, 0x00B6, 0x00DF,
            0x00AE, 0x00A9, 0x2122, 0x00B4, 0x00A8, 0x2260, 0x00C6, 0x00D8,
            0x221E, 0x00B1, 0x2264, 0x2265, 0x00A5, 0x00B5, 0x2202, 0x2211,
            0x220F, 0x03C0, 0x222B, 0x00AA, 0x00BA, 0x03A9, 0x00E6, 0x00F8,
            0x00BF, 0x00A1, 0x00AC, 0x221A, 0x0192, 0x2248, 0x2206, 0x00AB,
            0x00BB, 0x2026, 0x00A0, 0x00C0, 0x00C3, 0x00D5, 0x0152, 0x0153,
            0x2013, 0x2014, 0x201C, 0x201D, 0x2018, 0x2019, 0x00F7, 0x25CA,
            0x00FF, 0x0178, 0x2044, 0x20AC, 0x2039, 0x203A, 0xFB01, 0xFB02,
            0x2021, 0x00B7, 0x201A, 0x201E, 0x2030, 0x00C2, 0x00CA, 0x00C1,
            0x00CB, 0x00C8, 0x00CD, 0x00CE, 0x00CF, 0x00CC, 0x00D3, 0x00D4,
            0xF8FF, 0x00D2, 0x00DA, 0x00DB, 0x00D9, 0x0131, 0x02C6, 0x02DC,
            0x00AF, 0x02D8, 0x02D9, 0x02DA, 0x00B8, 0x02DD, 0x02DB, 0x02C7
        ];
        function decodeUtf16Be(bytes) {
            if (bytes.length & 1)
                throw new ParseError('fonts/utf16be-odd', 'UTF-16BE byte length must be even',
                    { context: { length: bytes.length } });
            let s = '';
            for (let i = 0; i < bytes.length; i += 2) {
                s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
            }
            return s;
        }
        function encodeUtf16Be(str) {
            const out = new Uint8Array(str.length * 2);
            for (let i = 0, j = 0; i < str.length; i++, j += 2) {
                const c = str.charCodeAt(i);
                out[j]     = (c >>> 8) & 0xFF;
                out[j + 1] =  c        & 0xFF;
            }
            return out;
        }
        function decodeMacRoman(bytes) {
            let s = '';
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                s += b < 0x80 ? String.fromCharCode(b)
                              : String.fromCharCode(MAC_ROMAN_HIGH[b - 0x80]);
            }
            return s;
        }
        function encodeMacRoman(str) {
            const out = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                const c = str.charCodeAt(i);
                if (c < 0x80) { out[i] = c; continue; }
                let found = 0;
                for (let j = 0; j < MAC_ROMAN_HIGH.length; j++) {
                    if (MAC_ROMAN_HIGH[j] === c) { found = 0x80 + j; break; }
                }
                out[i] = found || 0x3F;
            }
            return out;
        }
        return { decodeUtf16Be, encodeUtf16Be, decodeMacRoman, encodeMacRoman };
    }
};
