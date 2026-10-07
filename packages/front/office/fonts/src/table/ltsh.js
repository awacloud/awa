// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `LTSH` — Linear Threshold (OT §6.4.21).
 *
 * Per-glyph ppem at which the glyph's advance width becomes linear
 * (deviation from scaled value is zero).
 *
 * Layout :
 *  - version uint16
 *  - numGlyphs uint16
 *  - yPels[numGlyphs] uint8
 *
 * @module fonts/table/ltsh
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableLtsh = {
    name: 'tableLtsh',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseLtsh(bytes) {
            if (bytes.length < 4)
                throw new ParseError('fonts/ltsh-short', 'LTSH must be ≥ 4 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const version   = r.readUint16();
            const numGlyphs = r.readUint16();
            if (4 + numGlyphs > bytes.length)
                throw new ParseError('fonts/ltsh-truncated', 'LTSH yPels truncated');
            const yPels = r.readBytesCopy(numGlyphs);
            return { version, numGlyphs, yPels };
        }

        return { parseLtsh };
    }
};
