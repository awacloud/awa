// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `EBLC` — Embedded Bitmap Location Table (OT §8.4).
 *
 * Monochrome counterpart of CBLC, with identical wire layout :
 *
 *  - majorVersion uint16, minorVersion uint16
 *  - numSizes uint32
 *  - bitmapSizeTable[numSizes] : 48 bytes each
 *
 * Each BitmapSizeTable :
 *  - indexSubTableArrayOffset, indexTablesSize, numberOfIndexSubTables uint32
 *  - colorRef uint32
 *  - hori sbitLineMetrics (12 bytes)
 *  - vert sbitLineMetrics (12 bytes)
 *  - startGlyphIndex, endGlyphIndex uint16
 *  - ppemX, ppemY uint8
 *  - bitDepth uint8 (always 1 for EBLC)
 *  - flags int8
 *
 * @module fonts/table/eblc
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableEblc = {
    name: 'tableEblc',
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

        function parseEblc(bytes) {
            if (bytes.length < 8)
                throw new ParseError('fonts/eblc-short', 'EBLC header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 2 && major !== 3)
                throw new ParseError('fonts/eblc-version',
                    `unsupported EBLC major version ${major}`, { context: { major, minor } });
            const numSizes = r.readUint32();
            const sizes = new Array(numSizes);
            for (let i = 0; i < numSizes; i++) {
                sizes[i] = {
                    indexSubTableArrayOffset: r.readUint32(),
                    indexTablesSize:           r.readUint32(),
                    numberOfIndexSubTables:    r.readUint32(),
                    colorRef:                  r.readUint32(),
                    hori:                      readSbitLineMetrics(r),
                    vert:                      readSbitLineMetrics(r),
                    startGlyphIndex: r.readUint16(),
                    endGlyphIndex:   r.readUint16(),
                    ppemX:           r.readUint8(),
                    ppemY:           r.readUint8(),
                    bitDepth:        r.readUint8(),
                    flags:           r.readInt8()
                };
            }
            return { majorVersion: major, minorVersion: minor, sizes };
        }

        return { parseEblc };
    }
};
