// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `MVAR` — Metrics Variations (OT §10.6.7).
 *
 * Records named-metric deltas (sTypoAscender, sCapHeight, …) as a
 * function of axis location. Each value-record carries a tag + IVS index.
 *
 * Layout :
 *  - majorVersion uint16 (= 1), minorVersion uint16 (= 0)
 *  - reserved uint16
 *  - valueRecordSize uint16  (= 8)
 *  - valueRecordCount uint16
 *  - itemVariationStoreOffset uint16
 *  - valueRecords[valueRecordCount] :
 *      valueTag Tag (4 bytes)
 *      deltaSetOuterIndex uint16
 *      deltaSetInnerIndex uint16
 *
 * @module fonts/table/mvar
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';

export const tableMvar = {
    name: 'tableMvar',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tagMod) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tagMod;

        function parseMvar(bytes) {
            if (bytes.length < 12)
                throw new ParseError('fonts/mvar-short', 'MVAR header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/mvar-version', `unsupported MVAR major ${major}`,
                    { context: { major, minor } });
            r.readUint16();   // reserved
            const valueRecordSize  = r.readUint16();
            const valueRecordCount = r.readUint16();
            const itemVariationStoreOffset = r.readUint16();
            const records = new Array(valueRecordCount);
            for (let i = 0; i < valueRecordCount; i++) {
                records[i] = {
                    valueTag: untag(r.readUint32()),
                    deltaSetOuterIndex: r.readUint16(),
                    deltaSetInnerIndex: r.readUint16()
                };
            }
            const ivs = itemVariationStoreOffset
                ? new Uint8Array(bytes.buffer, bytes.byteOffset + itemVariationStoreOffset,
                                 bytes.length - itemVariationStoreOffset)
                : null;
            return {
                majorVersion: major, minorVersion: minor,
                valueRecordSize, valueRecordCount, records,
                itemVariationStoreBytes: ivs
            };
        }

        return { parseMvar };
    }
};
