// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `ankr` — Anchor Points (Apple TT RM06).
 *
 * Strict factory body. `parseAnkr(bytes, opts?)` returns the raw
 * `lookupBytes` and `lookupFormat`, and `anchors(glyph)`: the glyph's
 * anchor points `[{ x, y }]` through the lookup (decoded by `aatLookup`;
 * its values are offsets into the glyph data), `[]` when the glyph has
 * none, the lookup does not decode, or the block does not.
 * `readAnchorBlock` decodes one anchor block at a given offset.
 *
 * @module fonts/extra/apple-aat/ankr
 */

/**
 * @typedef {Object} AnkrTable
 * @property {number}     version
 * @property {number}     flags
 * @property {number}     lookupTableOffset
 * @property {number}     glyphDataTableOffset
 * @property {number}     lookupFormat
 * @property {Uint8Array} lookupBytes
 * @property {Uint8Array} glyphDataBytes
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { aatLookup } from './lookup.js';

export const aatAnkr = {
    name: 'aatAnkr',
    dependencies: ['fontErrors', 'fontReader', 'aatLookup'],
    deps: [fontErrors, fontReader, aatLookup],
    factory(errors, reader, lookups) {
        const HEADER_SIZE = 12;
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        /**
         * Parse an `ankr` table.
         *
         * @param {Uint8Array} bytes
         * @param {{numGlyphs?: number}} [opts]
         * @returns {AnkrTable & {anchors: (glyph: number) => {x: number, y: number}[]}}
         */
        function parseAnkr(bytes, opts) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/ankr-input', 'parseAnkr expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_SIZE)
                throw new ParseError('fonts/ankr-short', 'ankr table too short',
                    { context: { actual: bytes.length, needed: HEADER_SIZE } });

            const r = new BinaryReader(bytes);
            const version              = r.readUint16();
            const flags                = r.readUint16();
            const lookupTableOffset    = r.readUint32();
            const glyphDataTableOffset = r.readUint32();

            if (version !== 0)
                throw new ParseError('fonts/ankr-version', `unsupported ankr version ${version}`,
                    { context: { version } });
            if (lookupTableOffset >= bytes.length || glyphDataTableOffset > bytes.length)
                throw new ParseError('fonts/ankr-offsets', 'ankr offsets out of bounds',
                    { context: { lookupTableOffset, glyphDataTableOffset, length: bytes.length } });

            const lookupEnd = glyphDataTableOffset > lookupTableOffset
                ? glyphDataTableOffset
                : bytes.length;
            const lookupBytes    = bytes.subarray(lookupTableOffset, lookupEnd);
            const glyphDataBytes = bytes.subarray(glyphDataTableOffset);

            if (lookupBytes.length < 2)
                throw new ParseError('fonts/ankr-lookup-short', 'ankr lookup region too short',
                    { context: { length: lookupBytes.length } });

            const lookupFormat = (lookupBytes[0] << 8) | lookupBytes[1];
            let table;

            return {
                version,
                flags,
                lookupTableOffset,
                glyphDataTableOffset,
                lookupFormat,
                lookupBytes,
                glyphDataBytes,
                anchors(glyph) {
                    if (table === undefined) {
                        try {
                            table = lookups.parseLookup(lookupBytes, 0, opts && opts.numGlyphs !== undefined ? { numGlyphs: opts.numGlyphs } : undefined);
                        } catch (e) {
                            if (!(e instanceof ParseError)) throw e;
                            table = null;
                        }
                    }
                    const off = table ? table.get(glyph) : null;
                    if (off === null) return [];
                    try { return readAnchorBlock(glyphDataBytes, off); } catch (e) {
                        if (!(e instanceof ParseError)) throw e;
                        return [];
                    }
                }
            };
        }

        /**
         * Decode an anchor block at a given byte offset.
         */
        function readAnchorBlock(glyphDataBytes, offset) {
            if (offset < 0 || offset + 4 > glyphDataBytes.length)
                throw new ParseError('fonts/ankr-block-range', 'anchor block offset out of bounds',
                    { context: { offset, length: glyphDataBytes.length } });
            const r = new BinaryReader(glyphDataBytes, offset, glyphDataBytes.length - offset);
            const n = r.readUint32();
            if (n > 0xFFFF || 4 + n * 4 > glyphDataBytes.length - offset)
                throw new ParseError('fonts/ankr-block-count', 'anchor block count invalid',
                    { context: { offset, count: n } });
            const out = new Array(n);
            for (let i = 0; i < n; i++) out[i] = { x: r.readInt16(), y: r.readInt16() };
            return out;
        }

        return { parseAnkr, readAnchorBlock };
    }
};

