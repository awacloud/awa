// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `STAT` — Style Attributes (OT §10.6.4).
 *
 * Records the design-axis attributes of a variable font's named
 * instances + provides a structured family-grouping mechanism.
 *
 * Layout (v1.1+) :
 *  - majorVersion uint16 (= 1)
 *  - minorVersion uint16 (1 or 2)
 *  - designAxisSize uint16 (= 8)
 *  - designAxisCount uint16
 *  - designAxesOffset uint32
 *  - axisValueCount uint16
 *  - offsetToAxisValueOffsets uint32
 *  - elidedFallbackNameID uint16 (v1.1+)
 *
 * @module fonts/table/stat
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';

export const tableStat = {
    name: 'tableStat',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tagMod) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tagMod;

        function parseStat(bytes) {
            if (bytes.length < 16)
                throw new ParseError('fonts/stat-short', 'STAT header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/stat-version',
                    `unsupported STAT major version ${major}`, { context: { major, minor } });
            const designAxisSize    = r.readUint16();
            const designAxisCount   = r.readUint16();
            const designAxesOffset  = r.readUint32();
            const axisValueCount    = r.readUint16();
            const offsetToAxisValueOffsets = r.readUint32();
            const elidedFallbackNameID = minor >= 1 ? r.readUint16() : 0;

            // Design axes
            const designAxes = new Array(designAxisCount);
            for (let i = 0; i < designAxisCount; i++) {
                const pos = designAxesOffset + i * designAxisSize;
                const ar = new BinaryReader(bytes, pos, designAxisSize);
                designAxes[i] = {
                    axisTag:     untag(ar.readUint32()),
                    axisNameID:  ar.readUint16(),
                    axisOrdering: ar.readUint16()
                };
            }
            // Axis values (offsets, then records — recognise format 1,2,3,4)
            let axisValues = [];
            if (offsetToAxisValueOffsets) {
                const ofr = new BinaryReader(bytes, offsetToAxisValueOffsets, bytes.length - offsetToAxisValueOffsets);
                const offsets = new Array(axisValueCount);
                for (let i = 0; i < axisValueCount; i++) offsets[i] = ofr.readUint16();
                axisValues = offsets.map(off => {
                    const absStart = offsetToAxisValueOffsets + off;
                    const ar = new BinaryReader(bytes, absStart, bytes.length - absStart);
                    const format = ar.readUint16();
                    const out = { format };
                    if (format === 1) {
                        out.axisIndex = ar.readUint16();
                        out.flags = ar.readUint16();
                        out.valueNameID = ar.readUint16();
                        out.value = ar.readFixed();
                    } else if (format === 2) {
                        out.axisIndex = ar.readUint16();
                        out.flags = ar.readUint16();
                        out.valueNameID = ar.readUint16();
                        out.nominalValue = ar.readFixed();
                        out.rangeMinValue = ar.readFixed();
                        out.rangeMaxValue = ar.readFixed();
                    } else if (format === 3) {
                        out.axisIndex = ar.readUint16();
                        out.flags = ar.readUint16();
                        out.valueNameID = ar.readUint16();
                        out.value = ar.readFixed();
                        out.linkedValue = ar.readFixed();
                    } else if (format === 4) {
                        const axisCount = ar.readUint16();
                        out.flags = ar.readUint16();
                        out.valueNameID = ar.readUint16();
                        out.axisValues = new Array(axisCount);
                        for (let k = 0; k < axisCount; k++) {
                            out.axisValues[k] = { axisIndex: ar.readUint16(), value: ar.readFixed() };
                        }
                    }
                    return out;
                });
            }

            return {
                majorVersion: major, minorVersion: minor,
                designAxes, axisValues, elidedFallbackNameID
            };
        }

        return { parseStat };
    }
};
