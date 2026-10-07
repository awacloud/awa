// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `HVAR` — Horizontal Metrics Variations (OT §10.6.6).
 *
 * Stores delta values to apply to `hmtx` advanceWidth / lsb when a
 * variable font is instantiated at a non-default axis location.
 *
 * Layout :
 *  - majorVersion uint16 (= 1), minorVersion uint16 (= 0)
 *  - itemVariationStoreOffset uint32
 *  - advanceWidthMappingOffset uint32
 *  - lsbMappingOffset uint32
 *  - rsbMappingOffset uint32
 *
 * The item-variation-store payload contains region-shared deltas in a
 * compact form. The IVS bytes are kept raw under
 * `itemVariationStoreBytes` (the store is not decoded) — header
 * decoding + offsets are exposed.
 *
 * @module fonts/table/hvar
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableHvar = {
    name: 'tableHvar',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseHvar(bytes) {
            if (bytes.length < 20)
                throw new ParseError('fonts/hvar-short', 'HVAR header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/hvar-version', `unsupported HVAR major ${major}`,
                    { context: { major, minor } });
            const itemVariationStoreOffset = r.readUint32();
            const advanceWidthMappingOffset = r.readUint32();
            const lsbMappingOffset = r.readUint32();
            const rsbMappingOffset = r.readUint32();
            const ivs = itemVariationStoreOffset
                ? new Uint8Array(bytes.buffer, bytes.byteOffset + itemVariationStoreOffset,
                                 bytes.length - itemVariationStoreOffset)
                : null;
            return {
                majorVersion: major, minorVersion: minor,
                itemVariationStoreOffset, advanceWidthMappingOffset,
                lsbMappingOffset, rsbMappingOffset,
                itemVariationStoreBytes: ivs
            };
        }

        return { parseHvar };
    }
};
