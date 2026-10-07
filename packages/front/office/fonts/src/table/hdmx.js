// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `hdmx` — Horizontal Device Metrics (OT §6.4.16).
 *
 * Per-ppem array of pre-computed advance widths for each glyph at that
 * ppem. Used by raster engines to skip rounding work for popular sizes.
 *
 * Layout :
 *  - version uint16
 *  - numRecords int16
 *  - sizeDeviceRecord int32
 *  - records[numRecords] :
 *      pixelSize uint8
 *      maxWidth uint8
 *      widths[numGlyphs] uint8
 *      (padded to sizeDeviceRecord)
 *
 * @module fonts/table/hdmx
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableHdmx = {
    name: 'tableHdmx',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        /**
         * @param {Uint8Array} bytes
         * @param {number} numGlyphs
         */
        function parseHdmx(bytes, numGlyphs) {
            if (bytes.length < 8)
                throw new ParseError('fonts/hdmx-short', 'hdmx must be ≥ 8 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            const numRecords = r.readInt16();
            const sizeDeviceRecord = r.readInt32();
            if (sizeDeviceRecord < 2 + numGlyphs)
                throw new ParseError('fonts/hdmx-bad-record-size',
                    `sizeDeviceRecord ${sizeDeviceRecord} less than required ${2 + numGlyphs}`,
                    { context: { sizeDeviceRecord, numGlyphs } });
            const records = new Array(numRecords);
            for (let i = 0; i < numRecords; i++) {
                const recStart = r.pos;
                const pixelSize = r.readUint8();
                const maxWidth  = r.readUint8();
                const widths = r.readBytesCopy(numGlyphs);
                records[i] = { pixelSize, maxWidth, widths };
                r.seek(recStart + sizeDeviceRecord);
            }
            return { version, numRecords, sizeDeviceRecord, records };
        }

        return { parseHdmx };
    }
};
