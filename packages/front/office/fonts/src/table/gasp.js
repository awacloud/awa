// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `gasp` — Grid-fitting And Scan-conversion Procedure
 * (OT §6.4.18). Drives the rasteriser hinting / smoothing decision
 * per ppem range.
 *
 * Layout :
 *  - version uint16  (0 or 1)
 *  - numRanges uint16
 *  - ranges[numRanges] :
 *      rangeMaxPPEM uint16
 *      rangeGaspBehavior uint16 (flags)
 *
 * @module fonts/table/gasp
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableGasp = {
    name: 'tableGasp',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        const GASP_FLAG = Object.freeze({
            GRIDFIT:           0x0001,
            DOGRAY:            0x0002,
            SYMMETRIC_GRIDFIT: 0x0004,
            SYMMETRIC_SMOOTHING: 0x0008
        });

        function parseGasp(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/gasp-short', 'gasp must be ≥ 4 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            if (version !== 0 && version !== 1)
                throw new ParseError('fonts/gasp-version', `unsupported gasp version ${version}`,
                    { context: { version } });
            const numRanges = r.readUint16();
            if (4 + numRanges * 4 > bytes.length)
                throw new ParseError('fonts/gasp-truncated', 'gasp ranges truncated');
            const ranges = new Array(numRanges);
            for (let i = 0; i < numRanges; i++) {
                ranges[i] = {
                    rangeMaxPPEM: r.readUint16(),
                    rangeGaspBehavior: r.readUint16()
                };
            }
            return { version, ranges };
        }

        return { parseGasp, GASP_FLAG };
    }
};
