// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `EBDT` — Embedded Bitmap Data Table (OT §8.4).
 *
 * Monochrome counterpart of CBDT. Layout is identical; only the bit-depth
 * referenced in EBLC's `bitmapSize.bitDepth` differs (1 here vs 32 for CBDT).
 *
 * Exposes a minimal `parseEbdt(bytes)` returning the header version and a
 * raw blob accessor. The actual per-glyph bitmap records are located via
 * EBLC subtables — joint access lives in the consumer.
 *
 * @module fonts/table/ebdt
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableEbdt = {
    name: 'tableEbdt',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseEbdt(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/ebdt-short', 'EBDT header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 2 && major !== 3)
                throw new ParseError('fonts/ebdt-version',
                    `unsupported EBDT major version ${major}`, { context: { major, minor } });
            return {
                majorVersion: major, minorVersion: minor,
                getRaw(offset, length) {
                    if (offset + length > bytes.length) return null;
                    return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length);
                }
            };
        }

        return { parseEbdt };
    }
};
