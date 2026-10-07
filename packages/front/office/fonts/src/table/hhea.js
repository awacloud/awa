// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `hhea` — Horizontal Header (OT §6.4.3). 36 bytes.
 *
 * Drives advance-width interpretation in `hmtx` (numberOfHMetrics
 * decides how many full long-metric records precede the lsb-only tail).
 *
 * @module fonts/table/hhea
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableHhea = {
    name: 'tableHhea',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        /**
         * @typedef {object} HheaTable
         * @property {number} majorVersion
         * @property {number} minorVersion
         * @property {number} ascender
         * @property {number} descender
         * @property {number} lineGap
         * @property {number} advanceWidthMax
         * @property {number} minLeftSideBearing
         * @property {number} minRightSideBearing
         * @property {number} xMaxExtent
         * @property {number} caretSlopeRise
         * @property {number} caretSlopeRun
         * @property {number} caretOffset
         * @property {number} metricDataFormat
         * @property {number} numberOfHMetrics
         */

        /** @returns {HheaTable} */
        function parseHhea(bytes) {
            if (bytes.length < 36)
                throw new ParseError('fonts/hhea-short', 'hhea must be 36 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const majorVersion = r.readUint16();
            const minorVersion = r.readUint16();
            const ascender    = r.readInt16();
            const descender   = r.readInt16();
            const lineGap     = r.readInt16();
            const advanceWidthMax     = r.readUint16();
            const minLeftSideBearing  = r.readInt16();
            const minRightSideBearing = r.readInt16();
            const xMaxExtent          = r.readInt16();
            const caretSlopeRise      = r.readInt16();
            const caretSlopeRun       = r.readInt16();
            const caretOffset         = r.readInt16();
            r.skip(8);  // 4 reserved int16
            const metricDataFormat    = r.readInt16();
            const numberOfHMetrics    = r.readUint16();
            return {
                majorVersion, minorVersion,
                ascender, descender, lineGap,
                advanceWidthMax, minLeftSideBearing, minRightSideBearing, xMaxExtent,
                caretSlopeRise, caretSlopeRun, caretOffset,
                metricDataFormat, numberOfHMetrics
            };
        }

        /** @param {HheaTable} h */
        function encodeHhea(h) {
            const w = new BinaryWriter(36);
            w.writeUint16(h.majorVersion ?? 1);
            w.writeUint16(h.minorVersion ?? 0);
            w.writeInt16(h.ascender ?? 0);
            w.writeInt16(h.descender ?? 0);
            w.writeInt16(h.lineGap ?? 0);
            w.writeUint16(h.advanceWidthMax ?? 0);
            w.writeInt16(h.minLeftSideBearing ?? 0);
            w.writeInt16(h.minRightSideBearing ?? 0);
            w.writeInt16(h.xMaxExtent ?? 0);
            w.writeInt16(h.caretSlopeRise ?? 1);
            w.writeInt16(h.caretSlopeRun ?? 0);
            w.writeInt16(h.caretOffset ?? 0);
            w.writeInt16(0).writeInt16(0).writeInt16(0).writeInt16(0);  // reserved
            w.writeInt16(h.metricDataFormat ?? 0);
            w.writeUint16(h.numberOfHMetrics ?? 0);
            return w.finalize();
        }

        return { parseHhea, encodeHhea };
    }
};

