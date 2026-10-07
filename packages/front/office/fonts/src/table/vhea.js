// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `vhea` — Vertical Header (OT §6.4.10). 36 bytes.
 *
 * Vertical analogue of {@link ./hhea.js}. Drives `vmtx`.
 *
 * @module fonts/table/vhea
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableVhea = {
    name: 'tableVhea',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        function parseVhea(bytes) {
            if (bytes.length < 36)
                throw new ParseError('fonts/vhea-short', 'vhea must be 36 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            return {
                majorVersion:        r.readUint16(),
                minorVersion:        r.readUint16(),
                ascender:            r.readInt16(),
                descender:           r.readInt16(),
                lineGap:             r.readInt16(),
                advanceHeightMax:    r.readInt16(),
                minTopSideBearing:   r.readInt16(),
                minBottomSideBearing: r.readInt16(),
                yMaxExtent:          r.readInt16(),
                caretSlopeRise:      r.readInt16(),
                caretSlopeRun:       r.readInt16(),
                caretOffset:         r.readInt16(),
                // 4 reserved int16
                ...(r.skip(8), {
                    metricDataFormat:  r.readInt16(),
                    numOfLongVerMetrics: r.readUint16()
                })
            };
        }

        function encodeVhea(h) {
            const w = new BinaryWriter(36);
            w.writeUint16(h.majorVersion ?? 1);
            w.writeUint16(h.minorVersion ?? 0);
            w.writeInt16(h.ascender ?? 0);
            w.writeInt16(h.descender ?? 0);
            w.writeInt16(h.lineGap ?? 0);
            w.writeInt16(h.advanceHeightMax ?? 0);
            w.writeInt16(h.minTopSideBearing ?? 0);
            w.writeInt16(h.minBottomSideBearing ?? 0);
            w.writeInt16(h.yMaxExtent ?? 0);
            w.writeInt16(h.caretSlopeRise ?? 0);
            w.writeInt16(h.caretSlopeRun ?? 1);
            w.writeInt16(h.caretOffset ?? 0);
            w.writeInt16(0).writeInt16(0).writeInt16(0).writeInt16(0);
            w.writeInt16(h.metricDataFormat ?? 0);
            w.writeUint16(h.numOfLongVerMetrics ?? 0);
            return w.finalize();
        }

        return { parseVhea, encodeVhea };
    }
};
