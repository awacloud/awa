// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ASCII85Decode filter per ISO 32000-2:2020 §7.4.3.
 *
 * 5 ASCII characters in the range `!`..`u` decode to 4 binary bytes
 * encoding a 32-bit big-endian integer (base-85). The special
 * character `z` represents 4 zero bytes. The stream is terminated by
 * `~>`. The final group may be 2..4 characters, decoding to 1..3
 * trailing bytes.
 *
 * @module pdf/syntax/filters/ascii85
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../../errors.js';

export const pdfAscii85 = {
    name: 'pdfAscii85',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ParseError } = errors;
        const TILDE = 0x7E, GT = 0x3E, Z = 0x7A, BANG = 0x21, U = 0x75;
        const SP = 0x20, HT = 0x09, LF = 0x0A, CR = 0x0D, FF = 0x0C, NUL = 0x00;
        function isWs(b) {
            return b === SP || b === HT || b === LF || b === CR || b === FF || b === NUL;
        }

        function decode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/ascii85/bad-input',
                    'ASCII85Decode expects Uint8Array');
            }
            const out = [];
            let group = 0, count = 0;
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if (isWs(b)) continue;
                if (b === TILDE) {
                    if (i + 1 < bytes.length && bytes[i + 1] === GT) break;
                    throw new ParseError('pdf/ascii85/bad-eod',
                        '~ not followed by >', { context: { offset: i } });
                }
                if (b === Z) {
                    if (count !== 0) {
                        throw new ParseError('pdf/ascii85/bad-z',
                            'z must appear at group boundary', { context: { offset: i } });
                    }
                    out.push(0, 0, 0, 0);
                    continue;
                }
                if (b < BANG || b > U) {
                    throw new ParseError('pdf/ascii85/bad-digit',
                        'character outside ! .. u',
                        { context: { offset: i, byte: b } });
                }
                group = group * 85 + (b - BANG);
                count++;
                if (count === 5) {
                    out.push((group >>> 24) & 0xFF, (group >>> 16) & 0xFF,
                             (group >>>  8) & 0xFF,  group         & 0xFF);
                    group = 0; count = 0;
                }
            }
            if (count > 0) {
                for (let k = count; k < 5; k++) group = group * 85 + 84;
                const decoded = [
                    (group >>> 24) & 0xFF, (group >>> 16) & 0xFF,
                    (group >>>  8) & 0xFF,  group         & 0xFF
                ];
                for (let k = 0; k < count - 1; k++) out.push(decoded[k]);
            }
            return Uint8Array.from(out);
        }

        function encode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/ascii85/bad-input',
                    'ASCII85Encode expects Uint8Array');
            }
            const chars = [];
            let i = 0;
            while (i + 4 <= bytes.length) {
                const v = (bytes[i] * 0x1000000) + (bytes[i + 1] << 16)
                        + (bytes[i + 2] << 8) + bytes[i + 3];
                if (v === 0) chars.push(Z);
                else {
                    const g = [0, 0, 0, 0, 0];
                    let n = v;
                    for (let k = 4; k >= 0; k--) {
                        g[k] = (n % 85) + BANG; n = Math.floor(n / 85);
                    }
                    chars.push(g[0], g[1], g[2], g[3], g[4]);
                }
                i += 4;
            }
            const rem = bytes.length - i;
            if (rem > 0) {
                const padded = new Uint8Array(4);
                padded.set(bytes.subarray(i));
                const v = (padded[0] * 0x1000000) + (padded[1] << 16)
                        + (padded[2] << 8) + padded[3];
                const g = [0, 0, 0, 0, 0];
                let n = v;
                for (let k = 4; k >= 0; k--) {
                    g[k] = (n % 85) + BANG; n = Math.floor(n / 85);
                }
                for (let k = 0; k < rem + 1; k++) chars.push(g[k]);
            }
            chars.push(TILDE, GT);
            return Uint8Array.from(chars);
        }

        return { decode, encode };
    }
};
