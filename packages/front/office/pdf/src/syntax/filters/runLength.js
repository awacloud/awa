// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview RunLengthDecode filter per ISO 32000-2:2020 §7.4.5.
 *
 * Each control byte `n` is interpreted as:
 * - `0..127` → copy the next `n + 1` bytes literally,
 * - `128`    → end-of-data marker (stop decoding),
 * - `129..255` → repeat the next byte `257 - n` times (2..128 times).
 *
 * @module pdf/syntax/filters/runLength
 */

/**
 * Module factory — worker-safe.
 */
import { pdfErrors } from '../../errors.js';

export const pdfRunLength = {
    name: 'pdfRunLength',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ParseError } = errors;
        function decode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/runLength/bad-input',
                    'RunLengthDecode expects Uint8Array');
            }
            const out = [];
            let i = 0;
            while (i < bytes.length) {
                const n = bytes[i++];
                if (n === 128) break;
                if (n < 128) {
                    const count = n + 1;
                    if (i + count > bytes.length) {
                        throw new ParseError('pdf/runLength/truncated-literal',
                            'truncated literal run',
                            { context: { offset: i - 1, want: count, have: bytes.length - i } });
                    }
                    for (let k = 0; k < count; k++) out.push(bytes[i + k]);
                    i += count;
                } else {
                    if (i >= bytes.length) {
                        throw new ParseError('pdf/runLength/truncated-repeat',
                            'truncated repeat run',
                            { context: { offset: i - 1 } });
                    }
                    const v = bytes[i++];
                    const count = 257 - n;
                    for (let k = 0; k < count; k++) out.push(v);
                }
            }
            return Uint8Array.from(out);
        }

        function encode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/runLength/bad-input',
                    'RunLengthEncode expects Uint8Array');
            }
            const out = [];
            let i = 0;
            while (i < bytes.length) {
                const v = bytes[i];
                let runLen = 1;
                while (runLen < 128 && i + runLen < bytes.length && bytes[i + runLen] === v) {
                    runLen++;
                }
                if (runLen >= 3) {
                    out.push(257 - runLen, v);
                    i += runLen;
                    continue;
                }
                let litStart = i;
                let litLen = 0;
                while (litLen < 128 && i < bytes.length) {
                    let look = 1;
                    while (look < 3 && i + look < bytes.length && bytes[i + look] === bytes[i]) look++;
                    if (look >= 3 && litLen > 0) break;
                    i++; litLen++;
                }
                out.push(litLen - 1);
                for (let k = 0; k < litLen; k++) out.push(bytes[litStart + k]);
            }
            out.push(128);
            return Uint8Array.from(out);
        }

        return { decode, encode };
    }
};
