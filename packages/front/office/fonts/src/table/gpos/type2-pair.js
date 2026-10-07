// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS Type 2 — Pair Adjustment (kerning).
 *
 * Package-private helper for {@link ../gpos.js}.
 *
 * @module fonts/table/gpos/type2-pair
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';
import { tableGposValueRecord } from './value-record.js';

export const tableGposType2 = {
    name: 'tableGposType2',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions', 'tableGposValueRecord'],
    deps: [fontErrors, fontReader, layoutClassDefinitions, tableGposValueRecord],
    factory(errors, reader, classDefs, valueRec) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage, parseClassDef } = classDefs;
        const { readValueRecord } = valueRec;

        function parsePairAdj(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            const coverageOffset = r.readUint16();
            const valueFormat1 = r.readUint16();
            const valueFormat2 = r.readUint16();
            const cov = parseCoverage(new Uint8Array(bytes.buffer, bytes.byteOffset + coverageOffset, bytes.length - coverageOffset));
            if (format === 1) {
                const pairSetCount = r.readUint16();
                const pairSetOffsets = new Array(pairSetCount);
                for (let i = 0; i < pairSetCount; i++) pairSetOffsets[i] = r.readUint16();
                const pairSets = pairSetOffsets.map(off => {
                    const sub = new BinaryReader(bytes, off, bytes.length - off);
                    const pairValueCount = sub.readUint16();
                    const pairs = new Array(pairValueCount);
                    for (let i = 0; i < pairValueCount; i++) {
                        pairs[i] = {
                            secondGlyph: sub.readUint16(),
                            value1: readValueRecord(sub, valueFormat1),
                            value2: readValueRecord(sub, valueFormat2)
                        };
                    }
                    return pairs;
                });
                return {
                    type: 2, format, coverage: cov, valueFormat1, valueFormat2, pairSets,
                    kern(left, right) {
                        const ci = cov.lookup(left);
                        if (ci == null) return null;
                        const set = pairSets[ci];
                        for (const p of set) if (p.secondGlyph === right) return p;
                        return null;
                    }
                };
            }
            if (format === 2) {
                const classDef1Offset = r.readUint16();
                const classDef2Offset = r.readUint16();
                const class1Count = r.readUint16();
                const class2Count = r.readUint16();
                const grid = new Array(class1Count);
                for (let i = 0; i < class1Count; i++) {
                    grid[i] = new Array(class2Count);
                    for (let j = 0; j < class2Count; j++) {
                        grid[i][j] = {
                            value1: readValueRecord(r, valueFormat1),
                            value2: readValueRecord(r, valueFormat2)
                        };
                    }
                }
                const cd1 = parseClassDef(new Uint8Array(bytes.buffer, bytes.byteOffset + classDef1Offset, bytes.length - classDef1Offset));
                const cd2 = parseClassDef(new Uint8Array(bytes.buffer, bytes.byteOffset + classDef2Offset, bytes.length - classDef2Offset));
                return {
                    type: 2, format, coverage: cov, valueFormat1, valueFormat2,
                    classDef1: cd1, classDef2: cd2, grid,
                    kern(left, right) {
                        if (cov.lookup(left) == null) return null;
                        const c1 = cd1.lookup(left);
                        const c2 = cd2.lookup(right);
                        if (c1 >= class1Count || c2 >= class2Count) return null;
                        return grid[c1][c2];
                    }
                };
            }
            throw new ParseError('fonts/gpos-pair-format', `unsupported GPOS type 2 format ${format}`);
        }

        return { parsePairAdj };
    }
};

