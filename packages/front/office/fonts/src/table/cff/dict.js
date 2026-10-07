// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CFF DICT byte-stream parser + Top DICT operator names.
 *
 * DICT format : alternating operands (numbers) and operators (1- or
 * 2-byte). Operators are :
 *   0..21          : single-byte
 *   12 + b1 (=esc) : two-byte
 *
 * Operand encoding :
 *  32..246 → b - 139
 *  247..250 → (b - 247) * 256 + b1 + 108
 *  251..254 → -((b - 251) * 256 + b1 + 108)
 *  28 → 2-byte int (BE)
 *  29 → 4-byte int (BE)
 *  30 → real number nibble-encoded, terminated by 0xF
 *
 * Package-private helper for {@link ../cff.js}.
 *
 * @module fonts/table/cff/dict
 */

import { fontErrors } from '../../errors.js';

export const tableCffDict = {
    name: 'tableCffDict',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;

        /**
         * Decode a CFF DICT byte stream into a `Map<operator, operand[]>`.
         * Operators are encoded as either `op` (single-byte) or `0x0c00 | op`
         * (two-byte) — we use the same packed integer in the map key.
         */
        function parseDict(bytes) {
            const out = new Map();
            let operands = [];
            let i = 0;
            while (i < bytes.length) {
                const b0 = bytes[i];
                if (b0 <= 21) {
                    // Operator
                    let op;
                    if (b0 === 12) { op = 0x0C00 | bytes[i + 1]; i += 2; }
                    else           { op = b0; i += 1; }
                    out.set(op, operands);
                    operands = [];
                } else if (b0 === 28) {
                    operands.push(((bytes[i + 1] << 24) >> 16) | bytes[i + 2]);
                    i += 3;
                } else if (b0 === 29) {
                    operands.push(((bytes[i + 1] << 24) | (bytes[i + 2] << 16) | (bytes[i + 3] << 8) | bytes[i + 4]) | 0);
                    i += 5;
                } else if (b0 === 30) {
                    // real number — read nibbles until 0xF
                    let s = '';
                    const nibStart = i + 1;
                    let j = nibStart;
                    outer: while (true) {
                        const byte = bytes[j++];
                        for (const n of [(byte >>> 4) & 0xF, byte & 0xF]) {
                            if (n === 0xF) break outer;
                            if (n <= 9) s += String(n);
                            else if (n === 0xA) s += '.';
                            else if (n === 0xB) s += 'E';
                            else if (n === 0xC) s += 'E-';
                            else if (n === 0xE) s += '-';
                        }
                    }
                    operands.push(parseFloat(s));
                    i = j;
                } else if (b0 >= 32 && b0 <= 246) {
                    operands.push(b0 - 139);
                    i += 1;
                } else if (b0 >= 247 && b0 <= 250) {
                    operands.push((b0 - 247) * 256 + bytes[i + 1] + 108);
                    i += 2;
                } else if (b0 >= 251 && b0 <= 254) {
                    operands.push(-((b0 - 251) * 256 + bytes[i + 1] + 108));
                    i += 2;
                } else {
                    throw new ParseError('fonts/cff-dict-bad-byte',
                        `unexpected CFF DICT byte 0x${b0.toString(16)} at ${i}`,
                        { context: { pos: i, byte: b0 } });
                }
            }
            return out;
        }

        /** Friendly top DICT operator names (operator → name). */
        const TOP_DICT_OPS = Object.freeze({
            0: 'version', 1: 'Notice', 2: 'FullName', 3: 'FamilyName',
            4: 'Weight', 5: 'FontBBox', 13: 'UniqueID',
            14: 'XUID', 15: 'charset', 16: 'Encoding', 17: 'CharStrings',
            18: 'Private', 0x0C00: 'Copyright', 0x0C01: 'isFixedPitch',
            0x0C02: 'ItalicAngle', 0x0C03: 'UnderlinePosition',
            0x0C04: 'UnderlineThickness', 0x0C05: 'PaintType',
            0x0C06: 'CharstringType', 0x0C07: 'FontMatrix', 0x0C08: 'StrokeWidth',
            0x0C14: 'SyntheticBase', 0x0C15: 'PostScript',
            0x0C1E: 'ROS', 0x0C1F: 'CIDFontVersion', 0x0C20: 'CIDFontRevision',
            0x0C21: 'CIDFontType', 0x0C22: 'CIDCount', 0x0C23: 'UIDBase',
            0x0C24: 'FDArray', 0x0C25: 'FDSelect', 0x0C26: 'FontName'
        });

        return { parseDict, TOP_DICT_OPS };
    }
};

