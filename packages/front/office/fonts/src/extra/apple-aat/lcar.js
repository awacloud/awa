// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `lcar` — Ligature Caret (Apple TT RM06).
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/lcar
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const aatLcar = {
    name: 'aatLcar',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const HEADER_SIZE = 6;
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseLcar(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/lcar-input', 'parseLcar expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_SIZE)
                throw new ParseError('fonts/lcar-short', 'lcar table too short',
                    { context: { actual: bytes.length, needed: HEADER_SIZE } });

            const r = new BinaryReader(bytes);
            const version = r.readFixed();
            const format  = r.readUint16();

            if (version !== 1)
                throw new ParseError('fonts/lcar-version', `unsupported lcar version ${version}`,
                    { context: { version } });
            if (format !== 0 && format !== 1)
                throw new ParseError('fonts/lcar-format', `unsupported lcar format ${format}`,
                    { context: { format } });

            const lookupBytes = bytes.subarray(HEADER_SIZE);
            if (lookupBytes.length < 2)
                throw new ParseError('fonts/lcar-lookup-short', 'lcar lookup region too short',
                    { context: { length: lookupBytes.length } });
            const lookupFormat = (lookupBytes[0] << 8) | lookupBytes[1];

            return { version, format, lookupFormat, lookupBytes, bytes };
        }

        function readCaretBlock(bytes, offset) {
            if (offset < 0 || offset + 2 > bytes.length)
                throw new ParseError('fonts/lcar-block-range', 'caret block offset out of bounds',
                    { context: { offset, length: bytes.length } });
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const count = r.readUint16();
            if (2 + count * 2 > bytes.length - offset)
                throw new ParseError('fonts/lcar-block-count', 'caret block count invalid',
                    { context: { offset, count } });
            const out = new Array(count);
            for (let i = 0; i < count; i++) out[i] = r.readInt16();
            return out;
        }

        return { parseLcar, readCaretBlock };
    }
};

