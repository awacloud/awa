// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ASCIIHexDecode filter per ISO 32000-2:2020 §7.4.2.
 *
 * Each pair of ASCII hex digits decodes to one byte. Whitespace is
 * ignored. The terminator `>` ends the stream ; an odd number of hex
 * digits is treated as if a trailing `0` were present.
 *
 * @module pdf/syntax/filters/asciiHex
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../../errors.js';

export const pdfAsciiHex = {
    name: 'pdfAsciiHex',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ParseError } = errors;
        const HEX_LO = [
            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
             0,  1,  2,  3,  4,  5,  6,  7,  8,  9, -1, -1, -1, -1, -1, -1,
            -1, 10, 11, 12, 13, 14, 15, -1, -1, -1, -1, -1, -1, -1, -1, -1,
            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
            -1, 10, 11, 12, 13, 14, 15, -1
        ];
        const SP = 0x20, HT = 0x09, LF = 0x0A, CR = 0x0D, FF = 0x0C, NUL = 0x00;
        function isWs(b) {
            return b === SP || b === HT || b === LF || b === CR || b === FF || b === NUL;
        }

        function decode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/asciiHex/bad-input',
                    'ASCIIHexDecode expects Uint8Array');
            }
            const out = [];
            let pending = -1;
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if (b === 0x3E) break;
                if (isWs(b)) continue;
                const v = b < HEX_LO.length ? HEX_LO[b] : -1;
                if (v < 0) {
                    throw new ParseError('pdf/asciiHex/bad-digit',
                        'invalid hex digit',
                        { context: { offset: i, byte: b } });
                }
                if (pending < 0) pending = v;
                else { out.push((pending << 4) | v); pending = -1; }
            }
            if (pending >= 0) out.push(pending << 4);
            return Uint8Array.from(out);
        }

        function encode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/asciiHex/bad-input',
                    'ASCIIHexEncode expects Uint8Array');
            }
            const H = '0123456789ABCDEF';
            let s = '';
            for (let i = 0; i < bytes.length; i++) {
                if (i > 0 && (i & 31) === 0) s += '\n';
                const b = bytes[i];
                s += H[b >> 4] + H[b & 0xF];
            }
            s += '>';
            return new TextEncoder().encode(s);
        }

        return { decode, encode };
    }
};
