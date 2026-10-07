// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS Type 1 — Single Adjustment.
 *
 * Package-private helper for {@link ../gpos.js}.
 *
 * @module fonts/table/gpos/type1-single
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';
import { tableGposValueRecord } from './value-record.js';

export const tableGposType1 = {
    name: 'tableGposType1',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions', 'tableGposValueRecord'],
    deps: [fontErrors, fontReader, layoutClassDefinitions, tableGposValueRecord],
    factory(errors, reader, classDefs, valueRec) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage } = classDefs;
        const { readValueRecord } = valueRec;

        function parseSingleAdj(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            const coverageOffset = r.readUint16();
            const valueFormat = r.readUint16();
            const cov = parseCoverage(new Uint8Array(bytes.buffer, bytes.byteOffset + coverageOffset, bytes.length - coverageOffset));
            if (format === 1) {
                const value = readValueRecord(r, valueFormat);
                return {
                    type: 1, format, coverage: cov, valueFormat, value,
                    adjust(gid) { return cov.lookup(gid) != null ? value : null; }
                };
            }
            if (format === 2) {
                const valueCount = r.readUint16();
                const values = new Array(valueCount);
                for (let i = 0; i < valueCount; i++) values[i] = readValueRecord(r, valueFormat);
                return {
                    type: 1, format, coverage: cov, valueFormat, values,
                    adjust(gid) {
                        const ci = cov.lookup(gid);
                        return ci == null ? null : values[ci];
                    }
                };
            }
            throw new ParseError('fonts/gpos-single-format', `unsupported GPOS type 1 format ${format}`);
        }

        return { parseSingleAdj };
    }
};

