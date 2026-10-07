// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `prop` — Glyph Properties (Apple TT RM06).
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/prop
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const aatProp = {
    name: 'aatProp',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const HEADER_SIZE = 8;

        /** Bit layout of the 16-bit per-glyph property word. */
        const PROP_BITS_CONST = Object.freeze({
            DIRECTION_MASK:    0x001F,
            IS_FLOATER:        0x8000,
            HANGS_OFF_LEFT:    0x4000,
            HANGS_OFF_RIGHT:   0x2000,
            USES_COMPLEX_OT:   0x1000,
            ATTACHING:         0x0080
        });

        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseProp(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/prop-input', 'parseProp expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_SIZE)
                throw new ParseError('fonts/prop-short', 'prop table too short',
                    { context: { actual: bytes.length, needed: HEADER_SIZE } });

            const r = new BinaryReader(bytes);
            const version      = r.readFixed();
            const format       = r.readUint16();
            const defaultProps = r.readUint16();

            if (version !== 1 && version !== 2 && version !== 3)
                throw new ParseError('fonts/prop-version', `unsupported prop version ${version}`,
                    { context: { version } });
            if (format !== 0 && format !== 1)
                throw new ParseError('fonts/prop-format', `unsupported prop format ${format}`,
                    { context: { format } });

            if (format === 0) {
                return {
                    version,
                    format,
                    defaultProps,
                    lookup: () => defaultProps
                };
            }

            const lookupBytes = bytes.subarray(HEADER_SIZE);
            if (lookupBytes.length < 2)
                throw new ParseError('fonts/prop-lookup-short', 'prop lookup region too short',
                    { context: { length: lookupBytes.length } });
            const lookupFormat = (lookupBytes[0] << 8) | lookupBytes[1];

            return {
                version,
                format,
                defaultProps,
                lookupFormat,
                lookupBytes,
                parsed: false,
                reason: 'aat-state-machine-deferred',
                lookup: () => defaultProps
            };
        }

        return { parseProp, PROP_BITS: PROP_BITS_CONST };
    }
};

