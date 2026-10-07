// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `EBSC` — Embedded Bitmap Scaling Table (OT §8.4.x).
 *
 * Lists strikes that should be obtained by scaling another strike rather
 * than by storing bitmaps directly. Layout :
 *
 *  - majorVersion uint16, minorVersion uint16
 *  - numSizes uint32
 *  - bitmapScale[numSizes] : 28 bytes each
 *      - hori sbitLineMetrics (12 bytes)
 *      - vert sbitLineMetrics (12 bytes)
 *      - ppemX, ppemY uint8
 *      - substitutePpemX, substitutePpemY uint8
 *
 * @module fonts/table/ebsc
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableEbsc = {
    name: 'tableEbsc',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function readSbitLineMetrics(r) {
            return {
                ascender:                r.readInt8(),
                descender:               r.readInt8(),
                widthMax:                r.readUint8(),
                caretSlopeNumerator:     r.readInt8(),
                caretSlopeDenominator:   r.readInt8(),
                caretOffset:             r.readInt8(),
                minOriginSB:             r.readInt8(),
                minAdvanceSB:            r.readInt8(),
                maxBeforeBL:             r.readInt8(),
                minAfterBL:              r.readInt8(),
                pad1:                    r.readInt8(),
                pad2:                    r.readInt8()
            };
        }

        function parseEbsc(bytes) {
            if (bytes.length < 8)
                throw new ParseError('fonts/ebsc-short', 'EBSC header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 2 && major !== 3)
                throw new ParseError('fonts/ebsc-version',
                    `unsupported EBSC major version ${major}`, { context: { major, minor } });
            const numSizes = r.readUint32();
            const sizes = new Array(numSizes);
            for (let i = 0; i < numSizes; i++) {
                sizes[i] = {
                    hori:             readSbitLineMetrics(r),
                    vert:             readSbitLineMetrics(r),
                    ppemX:            r.readUint8(),
                    ppemY:            r.readUint8(),
                    substitutePpemX:  r.readUint8(),
                    substitutePpemY:  r.readUint8()
                };
            }
            return { majorVersion: major, minorVersion: minor, sizes };
        }

        return { parseEbsc };
    }
};
