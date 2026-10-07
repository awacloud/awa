// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS Type 3 — Cursive Adjustment.
 *
 * Package-private helper for {@link ../gpos.js}.
 *
 * @module fonts/table/gpos/type3-cursive
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';
import { tableGposValueRecord } from './value-record.js';

export const tableGposType3 = {
    name: 'tableGposType3',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions', 'tableGposValueRecord'],
    deps: [fontErrors, fontReader, layoutClassDefinitions, tableGposValueRecord],
    factory(errors, reader, classDefs, valueRec) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage } = classDefs;
        const { parseAnchor, subBytes } = valueRec;

        function parseCursiveAdj(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gpos-cursive-format', `unsupported GPOS type 3 format ${format}`);
            const coverageOffset = r.readUint16();
            const entryExitCount = r.readUint16();
            const records = new Array(entryExitCount);
            for (let i = 0; i < entryExitCount; i++) {
                records[i] = {
                    entryAnchorOffset: r.readUint16(),
                    exitAnchorOffset:  r.readUint16()
                };
            }
            const cov = parseCoverage(subBytes(bytes, coverageOffset));
            for (const rec of records) {
                rec.entryAnchor = parseAnchor(bytes, rec.entryAnchorOffset);
                rec.exitAnchor  = parseAnchor(bytes, rec.exitAnchorOffset);
            }
            return {
                type: 3, format, coverage: cov, entryExitRecords: records,
                anchorsFor(gid) {
                    const ci = cov.lookup(gid);
                    return ci == null ? null : records[ci];
                }
            };
        }

        return { parseCursiveAdj };
    }
};

