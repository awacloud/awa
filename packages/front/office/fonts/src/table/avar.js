// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `avar` — Axis Variations (OT §10.6.3).
 *
 * Per-axis segment-mapping table that adjusts the normalised
 * coordinate [-1, +1] before the gvar deltas are applied. Used to
 * make non-linear axis transitions feel right (e.g. weight 400 → 700
 * looks linear visually even if the deltas aren't).
 *
 * Layout :
 *  - majorVersion uint16 (1 or 2), minorVersion uint16
 *  - reserved uint16
 *  - axisCount uint16
 *  - segmentMaps[axisCount] :
 *      positionMapCount uint16
 *      axisValueMaps[positionMapCount] : fromCoord F2Dot14, toCoord F2Dot14
 *  - version 2 only (OpenType 1.9.1) :
 *      axisIndexMapOffset Offset32 (a DeltaSetIndexMap, 0 when absent)
 *      varStoreOffset     Offset32 (an ItemVariationStore, 0 when absent)
 *
 * For version 2 the offsets are returned as read (from the start of the
 * table); the second step of the version 2 normalisation — deltas from
 * the variation store added to the segment-mapped coordinates — is not
 * applied here nor by `normaliseAxesCoords`.
 *
 * @module fonts/table/avar
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableAvar = {
    name: 'tableAvar',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseAvar(bytes) {
            if (bytes.length < 8)
                throw new ParseError('fonts/avar-short', 'avar header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1 && major !== 2)
                throw new ParseError('fonts/avar-version',
                    `unsupported avar major version ${major}`, { context: { major, minor } });
            r.readUint16();                   // reserved
            const axisCount = r.readUint16();
            const segmentMaps = new Array(axisCount);
            for (let i = 0; i < axisCount; i++) {
                const positionMapCount = r.readUint16();
                const map = new Array(positionMapCount);
                for (let k = 0; k < positionMapCount; k++) {
                    map[k] = { fromCoord: r.readF2Dot14(), toCoord: r.readF2Dot14() };
                }
                segmentMaps[i] = map;
            }
            if (major === 1) return { majorVersion: major, minorVersion: minor, segmentMaps };
            if (r.pos + 8 > bytes.length)
                throw new ParseError('fonts/avar-short', 'avar version 2 offsets truncated',
                    { context: { offset: r.pos, length: bytes.length } });
            const axisIndexMapOffset = r.readUint32();
            const varStoreOffset = r.readUint32();
            for (const [field, offset] of [['axisIndexMapOffset', axisIndexMapOffset], ['varStoreOffset', varStoreOffset]]) {
                if (offset !== 0 && offset >= bytes.length)
                    throw new ParseError('fonts/avar-bad-offset',
                        `avar ${field} ${offset} is past the table (${bytes.length} bytes)`,
                        { context: { field, offset, length: bytes.length } });
            }
            return { majorVersion: major, minorVersion: minor, segmentMaps, axisIndexMapOffset, varStoreOffset };
        }

        /**
         * Apply an avar segment map to a normalised coordinate. Linear
         * interpolation between adjacent (fromCoord, toCoord) records.
         *
         * @param {Array<{fromCoord:number,toCoord:number}>} segmentMap
         * @param {number} normValue   in [-1, +1]
         * @returns {number}           remapped value
         */
        function applyAvarSegment(segmentMap, normValue) {
            if (!segmentMap || segmentMap.length === 0) return normValue;
            for (let i = 0; i < segmentMap.length - 1; i++) {
                const a = segmentMap[i], b = segmentMap[i + 1];
                if (normValue >= a.fromCoord && normValue <= b.fromCoord) {
                    const t = (normValue - a.fromCoord) / (b.fromCoord - a.fromCoord || 1);
                    return a.toCoord + t * (b.toCoord - a.toCoord);
                }
            }
            return normValue;
        }

        return { parseAvar, applyAvarSegment };
    }
};

