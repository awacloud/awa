// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `VDMX` — Vertical Device Metrics (OT §6.4.20).
 *
 * Provides yMin / yMax per ppem for vertical metric calculations on
 * Windows (line height).
 *
 * @module fonts/table/vdmx
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableVdmx = {
    name: 'tableVdmx',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseVdmx(bytes) {
            if (bytes.length < 6)
                throw new ParseError('fonts/vdmx-short', 'VDMX must be ≥ 6 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const version    = r.readUint16();
            const numRecords = r.readUint16();
            const numRatios  = r.readUint16();
            const ratRanges = new Array(numRatios);
            for (let i = 0; i < numRatios; i++) {
                ratRanges[i] = {
                    bCharSet:    r.readUint8(),
                    xRatio:      r.readUint8(),
                    yStartRatio: r.readUint8(),
                    yEndRatio:   r.readUint8()
                };
            }
            const offsets = new Array(numRatios);
            for (let i = 0; i < numRatios; i++) offsets[i] = r.readUint16();
            // Group table follows; record entries reference vTable groups by offset.
            return { version, numRecords, numRatios, ratRanges, offsets };
        }

        return { parseVdmx };
    }
};
