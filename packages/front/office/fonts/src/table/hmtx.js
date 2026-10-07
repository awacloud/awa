// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `hmtx` — Horizontal Metrics (OT §6.4.4).
 *
 * Layout :
 *   hMetrics[numberOfHMetrics]  (advanceWidth uint16 + lsb int16)
 *   leftSideBearings[numGlyphs - numberOfHMetrics]  (int16)
 *
 * The trailing lsb-only array reuses the LAST advanceWidth from
 * hMetrics — a compaction trick for monospaced trailing glyphs.
 *
 * Returns `{ metrics: [{ advanceWidth, lsb }] * numGlyphs }`. Encoder
 * accepts the same shape and emits the compact form whenever the last
 * N glyphs share their advanceWidth with the (numberOfHMetrics-1)th.
 *
 * @module fonts/table/hmtx
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableHmtx = {
    name: 'tableHmtx',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        /**
         * @param {Uint8Array} bytes
         * @param {number} numberOfHMetrics  — from `hhea.numberOfHMetrics`
         * @param {number} numGlyphs         — from `maxp.numGlyphs`
         */
        function parseHmtx(bytes, numberOfHMetrics, numGlyphs) {
            if (numberOfHMetrics < 1 || numberOfHMetrics > numGlyphs)
                throw new ParseError('fonts/hmtx-bad-count',
                    `numberOfHMetrics (${numberOfHMetrics}) must be 1..numGlyphs (${numGlyphs})`,
                    { context: { numberOfHMetrics, numGlyphs } });
            const expected = numberOfHMetrics * 4 + (numGlyphs - numberOfHMetrics) * 2;
            if (bytes.length < expected)
                throw new ParseError('fonts/hmtx-short',
                    `hmtx must be ≥ ${expected} bytes, got ${bytes.length}`,
                    { context: { actual: bytes.length, expected } });
            const r = new BinaryReader(bytes);
            const metrics = new Array(numGlyphs);
            let lastAdvance = 0;
            for (let i = 0; i < numberOfHMetrics; i++) {
                const advanceWidth = r.readUint16();
                const lsb = r.readInt16();
                metrics[i] = { advanceWidth, lsb };
                lastAdvance = advanceWidth;
            }
            for (let i = numberOfHMetrics; i < numGlyphs; i++) {
                const lsb = r.readInt16();
                metrics[i] = { advanceWidth: lastAdvance, lsb };
            }
            return { metrics };
        }

        /**
         * Encode hmtx. Computes the optimal numberOfHMetrics by collapsing the
         * trailing run of identical advanceWidth.
         *
         * @returns {{ bytes: Uint8Array, numberOfHMetrics: number }}
         */
        function encodeHmtx(hmtx) {
            const m = hmtx.metrics;
            if (m.length === 0)
                throw new ParseError('fonts/hmtx-empty', 'hmtx requires ≥ 1 glyph');
            // numberOfHMetrics = position where the trailing equal-advance run starts.
            let n = m.length;
            while (n > 1 && m[n - 1].advanceWidth === m[n - 2].advanceWidth) n--;
            const numberOfHMetrics = n;
            const w = new BinaryWriter(numberOfHMetrics * 4 + (m.length - numberOfHMetrics) * 2);
            for (let i = 0; i < numberOfHMetrics; i++) {
                w.writeUint16(m[i].advanceWidth & 0xFFFF);
                w.writeInt16(m[i].lsb | 0);
            }
            for (let i = numberOfHMetrics; i < m.length; i++) {
                w.writeInt16(m[i].lsb | 0);
            }
            return { bytes: w.finalize(), numberOfHMetrics };
        }

        return { parseHmtx, encodeHmtx };
    }
};

