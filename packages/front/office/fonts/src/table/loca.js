// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `loca` — Index to Location (OT §6.4.13).
 *
 * Array of `numGlyphs + 1` offsets into the `glyf` table. The format
 * (short = uint16 × 2, long = uint32) is chosen by
 * `head.indexToLocFormat` :
 *
 *  - short : offset stored as `bytes / 2` (so usable up to 128 KiB of glyf)
 *  - long  : offset stored as bytes (full uint32)
 *
 * Glyph N occupies `[offsets[N], offsets[N+1])`. Empty glyphs have
 * `offsets[N] == offsets[N+1]`.
 *
 * @module fonts/table/loca
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableLoca = {
    name: 'tableLoca',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        /**
         * @param {Uint8Array} bytes
         * @param {number} numGlyphs
         * @param {0|1}    indexToLocFormat  — 0 = short, 1 = long
         * @returns {Uint32Array}            — N+1 byte offsets into glyf
         */
        function parseLoca(bytes, numGlyphs, indexToLocFormat) {
            const n = numGlyphs + 1;
            const r = new BinaryReader(bytes);
            const out = new Uint32Array(n);
            if (indexToLocFormat === 0) {
                if (bytes.length < n * 2)
                    throw new ParseError('fonts/loca-short-short',
                        `short loca too small: need ${n * 2}, got ${bytes.length}`,
                        { context: { expected: n * 2, actual: bytes.length } });
                for (let i = 0; i < n; i++) out[i] = r.readUint16() * 2;
            } else if (indexToLocFormat === 1) {
                if (bytes.length < n * 4)
                    throw new ParseError('fonts/loca-short-long',
                        `long loca too small: need ${n * 4}, got ${bytes.length}`,
                        { context: { expected: n * 4, actual: bytes.length } });
                for (let i = 0; i < n; i++) out[i] = r.readUint32();
            } else {
                throw new ParseError('fonts/loca-bad-format',
                    `unsupported indexToLocFormat ${indexToLocFormat}`,
                    { context: { indexToLocFormat } });
            }
            // Monotonic non-decreasing invariant: loca offsets describe glyph
            // boundaries in glyf. A drop produces a negative-length glyph slice
            // which subsequent parsers may handle silently.
            for (let i = 1; i < n; i++) {
                if (out[i] < out[i - 1]) {
                    throw new ParseError('fonts/loca-non-monotonic',
                        `loca offsets must be non-decreasing (offsets[${i - 1}]=${out[i - 1]} > offsets[${i}]=${out[i]})`,
                        { context: { i, prev: out[i - 1], curr: out[i] } });
                }
            }
            return out;
        }

        /**
         * Encode loca. `offsets` is `Uint32Array` of length `numGlyphs+1`. The
         * function picks short if every offset fits in 17 bits and is even ;
         * otherwise long. Returns `{ bytes, indexToLocFormat }`.
         */
        function encodeLoca(offsets) {
            if (!(offsets instanceof Uint32Array) && !Array.isArray(offsets))
                throw new ParseError('fonts/loca-bad-input', 'offsets must be Uint32Array or array');
            const n = offsets.length;
            let short = true;
            for (let i = 0; i < n; i++) {
                const o = offsets[i] >>> 0;
                if (o & 1) { short = false; break; }
                if (o > 0x1FFFE) { short = false; break; }
            }
            const w = new BinaryWriter(n * (short ? 2 : 4));
            if (short) {
                for (let i = 0; i < n; i++) w.writeUint16(offsets[i] / 2);
            } else {
                for (let i = 0; i < n; i++) w.writeUint32(offsets[i]);
            }
            return { bytes: w.finalize(), indexToLocFormat: short ? 0 : 1 };
        }

        return { parseLoca, encodeLoca };
    }
};

