// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS Types 4, 5, 6 — Mark-to-Base / Mark-to-Ligature /
 * Mark-to-Mark attachment. All three share anchor + MarkArray layouts.
 *
 * Package-private helper for {@link ../gpos.js}.
 *
 * @module fonts/table/gpos/type4-6-mark
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';
import { tableGposValueRecord } from './value-record.js';

export const tableGposType46 = {
    name: 'tableGposType46',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions', 'tableGposValueRecord'],
    deps: [fontErrors, fontReader, layoutClassDefinitions, tableGposValueRecord],
    factory(errors, reader, classDefs, valueRec) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage } = classDefs;
        const { parseAnchor, subBytes } = valueRec;

        /**
         * Parse a MarkArray table (`markCount` + array of (class, anchorOffset)).
         * Offsets are relative to the MarkArray table start.
         */
        function parseMarkArray(bytes, offset) {
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const markCount = r.readUint16();
            const marks = new Array(markCount);
            for (let i = 0; i < markCount; i++) {
                const markClass = r.readUint16();
                const anchorOffset = r.readUint16();
                marks[i] = { markClass, anchorOffset };
            }
            // Resolve anchors (relative to MarkArray start)
            for (const m of marks) m.anchor = parseAnchor(bytes, offset + m.anchorOffset);
            return marks;
        }

        function parseMarkBase(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gpos-markbase-format', `unsupported GPOS type 4 format ${format}`);
            const markCoverageOffset = r.readUint16();
            const baseCoverageOffset = r.readUint16();
            const markClassCount = r.readUint16();
            const markArrayOffset = r.readUint16();
            const baseArrayOffset = r.readUint16();

            const markCoverage = parseCoverage(subBytes(bytes, markCoverageOffset));
            const baseCoverage = parseCoverage(subBytes(bytes, baseCoverageOffset));
            const markArray = parseMarkArray(bytes, markArrayOffset);

            // BaseArray: baseCount, then baseCount * (markClassCount Offset16)
            const br = new BinaryReader(bytes, baseArrayOffset, bytes.length - baseArrayOffset);
            const baseCount = br.readUint16();
            const baseArray = new Array(baseCount);
            for (let i = 0; i < baseCount; i++) {
                const anchorOffsets = new Array(markClassCount);
                for (let k = 0; k < markClassCount; k++) anchorOffsets[k] = br.readUint16();
                baseArray[i] = anchorOffsets.map(off => parseAnchor(bytes, off === 0 ? 0 : baseArrayOffset + off));
            }
            return {
                type: 4, format, markCoverage, baseCoverage,
                markClassCount, markArray, baseArray
            };
        }

        function parseMarkLig(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gpos-marklig-format', `unsupported GPOS type 5 format ${format}`);
            const markCoverageOffset = r.readUint16();
            const ligatureCoverageOffset = r.readUint16();
            const markClassCount = r.readUint16();
            const markArrayOffset = r.readUint16();
            const ligatureArrayOffset = r.readUint16();

            const markCoverage = parseCoverage(subBytes(bytes, markCoverageOffset));
            const ligatureCoverage = parseCoverage(subBytes(bytes, ligatureCoverageOffset));
            const markArray = parseMarkArray(bytes, markArrayOffset);

            // LigatureArray
            const lar = new BinaryReader(bytes, ligatureArrayOffset, bytes.length - ligatureArrayOffset);
            const ligatureCount = lar.readUint16();
            const ligAttachOffsets = new Array(ligatureCount);
            for (let i = 0; i < ligatureCount; i++) ligAttachOffsets[i] = lar.readUint16();
            const ligatureArray = ligAttachOffsets.map(off => {
                const attachStart = ligatureArrayOffset + off;
                const ar = new BinaryReader(bytes, attachStart, bytes.length - attachStart);
                const componentCount = ar.readUint16();
                const components = new Array(componentCount);
                for (let c = 0; c < componentCount; c++) {
                    const anchorOffsets = new Array(markClassCount);
                    for (let k = 0; k < markClassCount; k++) anchorOffsets[k] = ar.readUint16();
                    components[c] = anchorOffsets.map(o => parseAnchor(bytes, o === 0 ? 0 : attachStart + o));
                }
                return components;
            });
            return {
                type: 5, format, markCoverage, ligatureCoverage,
                markClassCount, markArray, ligatureArray
            };
        }

        function parseMarkMark(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gpos-markmark-format', `unsupported GPOS type 6 format ${format}`);
            const mark1CoverageOffset = r.readUint16();
            const mark2CoverageOffset = r.readUint16();
            const markClassCount = r.readUint16();
            const mark1ArrayOffset = r.readUint16();
            const mark2ArrayOffset = r.readUint16();

            const mark1Coverage = parseCoverage(subBytes(bytes, mark1CoverageOffset));
            const mark2Coverage = parseCoverage(subBytes(bytes, mark2CoverageOffset));
            const mark1Array = parseMarkArray(bytes, mark1ArrayOffset);

            // Mark2Array: same layout as BaseArray
            const m2r = new BinaryReader(bytes, mark2ArrayOffset, bytes.length - mark2ArrayOffset);
            const mark2Count = m2r.readUint16();
            const mark2Array = new Array(mark2Count);
            for (let i = 0; i < mark2Count; i++) {
                const anchorOffsets = new Array(markClassCount);
                for (let k = 0; k < markClassCount; k++) anchorOffsets[k] = m2r.readUint16();
                mark2Array[i] = anchorOffsets.map(off => parseAnchor(bytes, off === 0 ? 0 : mark2ArrayOffset + off));
            }
            return {
                type: 6, format, mark1Coverage, mark2Coverage,
                markClassCount, mark1Array, mark2Array
            };
        }

        return { parseMarkBase, parseMarkLig, parseMarkMark };
    }
};

