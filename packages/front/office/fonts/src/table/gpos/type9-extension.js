// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS Type 9 — Extension Positioning.
 *
 * Package-private helper for {@link ../gpos.js}. The extension parser
 * delegates back to the orchestrator via the `parseGposSubtable`
 * function passed in.
 *
 * @module fonts/table/gpos/type9-extension
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { tableGposValueRecord } from './value-record.js';

export const tableGposType9 = {
    name: 'tableGposType9',
    dependencies: ['fontErrors', 'fontReader', 'tableGposValueRecord'],
    deps: [fontErrors, fontReader, tableGposValueRecord],
    factory(errors, reader, valueRec) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { subBytes } = valueRec;

        function parseExtensionPos(bytes, parseGposSubtable) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gpos-ext-format', `unsupported GPOS type 9 format ${format}`);
            const extensionLookupType = r.readUint16();
            const extensionOffset = r.readUint32();
            const inner = parseGposSubtable(extensionLookupType, subBytes(bytes, extensionOffset));
            return {
                type: 9, format, extensionLookupType, extensionOffset,
                subtable: inner
            };
        }

        return { parseExtensionPos };
    }
};

