// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `vmtx` — Vertical Metrics (OT §6.4.11).
 *
 * Mirror of `hmtx` for vertical layout. Pairs of `(advanceHeight,
 * topSideBearing)` followed by a tsb-only trailing array.
 *
 * @module fonts/table/vmtx
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableVmtx = {
    name: 'tableVmtx',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        function parseVmtx(bytes, numOfLongVerMetrics, numGlyphs) {
            if (numOfLongVerMetrics < 1 || numOfLongVerMetrics > numGlyphs)
                throw new ParseError('fonts/vmtx-bad-count',
                    `numOfLongVerMetrics (${numOfLongVerMetrics}) must be 1..numGlyphs (${numGlyphs})`,
                    { context: { numOfLongVerMetrics, numGlyphs } });
            const expected = numOfLongVerMetrics * 4 + (numGlyphs - numOfLongVerMetrics) * 2;
            if (bytes.length < expected)
                throw new ParseError('fonts/vmtx-short',
                    `vmtx must be ≥ ${expected} bytes, got ${bytes.length}`);
            const r = new BinaryReader(bytes);
            const metrics = new Array(numGlyphs);
            let lastAdv = 0;
            for (let i = 0; i < numOfLongVerMetrics; i++) {
                const advanceHeight = r.readUint16();
                const tsb = r.readInt16();
                metrics[i] = { advanceHeight, tsb };
                lastAdv = advanceHeight;
            }
            for (let i = numOfLongVerMetrics; i < numGlyphs; i++) {
                metrics[i] = { advanceHeight: lastAdv, tsb: r.readInt16() };
            }
            return { metrics };
        }

        function encodeVmtx(vmtx) {
            const m = vmtx.metrics;
            if (m.length === 0) throw new ParseError('fonts/vmtx-empty', 'vmtx requires ≥ 1 glyph');
            let n = m.length;
            while (n > 1 && m[n - 1].advanceHeight === m[n - 2].advanceHeight) n--;
            const numOfLongVerMetrics = n;
            const w = new BinaryWriter(numOfLongVerMetrics * 4 + (m.length - numOfLongVerMetrics) * 2);
            for (let i = 0; i < numOfLongVerMetrics; i++) {
                w.writeUint16(m[i].advanceHeight & 0xFFFF);
                w.writeInt16(m[i].tsb | 0);
            }
            for (let i = numOfLongVerMetrics; i < m.length; i++) w.writeInt16(m[i].tsb | 0);
            return { bytes: w.finalize(), numOfLongVerMetrics };
        }

        return { parseVmtx, encodeVmtx };
    }
};
