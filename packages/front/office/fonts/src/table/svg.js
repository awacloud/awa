// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `SVG ` — Scalable Vector Graphics document table
 * (OT §8.9).
 *
 * Layout :
 *  - version uint16 (= 0)
 *  - svgDocumentListOffset uint32
 *  - reserved uint32
 *
 * SVGDocumentList :
 *  - numEntries uint16
 *  - documentRecords[numEntries] :
 *      startGlyphID uint16, endGlyphID uint16,
 *      svgDocOffset uint32 (from list start), svgDocLength uint32
 *
 * Each SVG document is gzip-compressed when its first 3 bytes are
 * `1F 8B 08` ; otherwise the bytes are raw XML. We expose the raw
 * bytes ; consumers can decode via `@awacloud/fw/io/compress/gzip.js`.
 *
 * @module fonts/table/svg
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableSvg = {
    name: 'tableSvg',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseSvg(bytes) {
            if (bytes.length < 10)
                throw new ParseError('fonts/svg-short', 'SVG header truncated');
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            if (version !== 0)
                throw new ParseError('fonts/svg-version', `unsupported SVG version ${version}`,
                    { context: { version } });
            const listOffset = r.readUint32();
            r.readUint32();  // reserved
            if (listOffset + 2 > bytes.length)
                throw new ParseError('fonts/svg-bad-list-offset', 'SVG document list offset out of range');
            const lr = new BinaryReader(bytes, listOffset, bytes.length - listOffset);
            const numEntries = lr.readUint16();
            const documents = new Array(numEntries);
            for (let i = 0; i < numEntries; i++) {
                const startGlyphID = lr.readUint16();
                const endGlyphID   = lr.readUint16();
                const svgDocOffset = lr.readUint32();
                const svgDocLength = lr.readUint32();
                documents[i] = {
                    startGlyphID, endGlyphID,
                    svgDocOffset, svgDocLength,
                    getBytes() {
                        const abs = listOffset + svgDocOffset;
                        if (abs + svgDocLength > bytes.length) return null;
                        return new Uint8Array(bytes.buffer, bytes.byteOffset + abs, svgDocLength);
                    },
                    isGzipped() {
                        const u = this.getBytes();
                        if (!u || u.length < 3) return false;
                        return u[0] === 0x1F && u[1] === 0x8B && u[2] === 0x08;
                    }
                };
            }
            return { version, documents };
        }

        return { parseSvg };
    }
};
