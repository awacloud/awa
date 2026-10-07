// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `CBDT` — Color Bitmap Data Table (OT §8.6).
 *
 * Companion of CBLC. Per-glyph small/medium/large bitmap records keyed
 * by the location subtables in CBLC. Bitmap formats : 17 (small metrics +
 * PNG), 18 (big metrics + PNG), 19 (set of PNG glyphs).
 *
 * This module exposes a tiny `parseCbdt(bytes)` returning the
 * header version + raw bytes accessor. Bitmap records are pulled by
 * offset from CBLC subtables — coupled access lives in the consumer.
 *
 * @module fonts/table/cbdt
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableCbdt = {
    name: 'tableCbdt',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseCbdt(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/cbdt-short', 'CBDT header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 2 && major !== 3)
                throw new ParseError('fonts/cbdt-version',
                    `unsupported CBDT major version ${major}`, { context: { major, minor } });
            return {
                majorVersion: major, minorVersion: minor,
                getRaw(offset, length) {
                    if (offset + length > bytes.length) return null;
                    return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length);
                }
            };
        }

        return { parseCbdt };
    }
};
