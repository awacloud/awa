// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `maxp` — Maximum Profile (OT §6.4.6).
 *
 * Two versions :
 *
 * - **v0.5 (0x00005000)** — 6 bytes : version + numGlyphs. Used by CFF fonts.
 * - **v1.0 (0x00010000)** — 32 bytes : v0.5 + 13 TrueType-specific maxima
 *   (maxPoints, maxContours, maxComposite*, …).
 *
 * @module fonts/table/maxp
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableMaxp = {
    name: 'tableMaxp',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;

        /**
         * @typedef {object} MaxpTable
         * @property {number} version           — 0x00005000 or 0x00010000
         * @property {number} numGlyphs
         * @property {number} [maxPoints]
         * @property {number} [maxContours]
         * @property {number} [maxCompositePoints]
         * @property {number} [maxCompositeContours]
         * @property {number} [maxZones]
         * @property {number} [maxTwilightPoints]
         * @property {number} [maxStorage]
         * @property {number} [maxFunctionDefs]
         * @property {number} [maxInstructionDefs]
         * @property {number} [maxStackElements]
         * @property {number} [maxSizeOfInstructions]
         * @property {number} [maxComponentElements]
         * @property {number} [maxComponentDepth]
         */

        const MAXP_V0_5 = 0x00005000;
        const MAXP_V1_0 = 0x00010000;

        /**
         * Per OT spec, `numGlyphs` is a uint16 → max 65535. We reject larger
         * values to catch fonts whose 32-bit-wide field somehow leaked through
         * (defence in depth — current parser reads uint16, but the bound is
         * documented here for cross-table validation consumers).
         */
        const NUM_GLYPHS_MAX = 0xFFFF;

        /** @returns {MaxpTable} */
        function parseMaxp(bytes) {
            if (bytes.length < 6)
                throw new ParseError('fonts/maxp-short', 'maxp must be ≥ 6 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const version = r.readUint32();
            const numGlyphs = r.readUint16();
            if (numGlyphs > NUM_GLYPHS_MAX) {
                throw new ParseError('fonts/maxp-numglyphs-cap',
                    `numGlyphs ${numGlyphs} exceeds OT cap (${NUM_GLYPHS_MAX})`,
                    { context: { numGlyphs, cap: NUM_GLYPHS_MAX } });
            }
            if (version === MAXP_V0_5) return { version, numGlyphs };
            if (version === MAXP_V1_0) {
                if (bytes.length < 32)
                    throw new ParseError('fonts/maxp-v1-short', 'maxp v1.0 must be 32 bytes',
                        { context: { actual: bytes.length } });
                return {
                    version, numGlyphs,
                    maxPoints:             r.readUint16(),
                    maxContours:           r.readUint16(),
                    maxCompositePoints:    r.readUint16(),
                    maxCompositeContours:  r.readUint16(),
                    maxZones:              r.readUint16(),
                    maxTwilightPoints:     r.readUint16(),
                    maxStorage:            r.readUint16(),
                    maxFunctionDefs:       r.readUint16(),
                    maxInstructionDefs:    r.readUint16(),
                    maxStackElements:      r.readUint16(),
                    maxSizeOfInstructions: r.readUint16(),
                    maxComponentElements:  r.readUint16(),
                    maxComponentDepth:     r.readUint16()
                };
            }
            throw new ParseError('fonts/maxp-version',
                `unsupported maxp version 0x${version.toString(16)}`,
                { context: { version } });
        }

        /** @param {MaxpTable} m */
        function encodeMaxp(m) {
            const w = new BinaryWriter();
            w.writeUint32(m.version);
            w.writeUint16(m.numGlyphs);
            if (m.version === MAXP_V1_0) {
                w.writeUint16(m.maxPoints ?? 0);
                w.writeUint16(m.maxContours ?? 0);
                w.writeUint16(m.maxCompositePoints ?? 0);
                w.writeUint16(m.maxCompositeContours ?? 0);
                w.writeUint16(m.maxZones ?? 2);
                w.writeUint16(m.maxTwilightPoints ?? 0);
                w.writeUint16(m.maxStorage ?? 0);
                w.writeUint16(m.maxFunctionDefs ?? 0);
                w.writeUint16(m.maxInstructionDefs ?? 0);
                w.writeUint16(m.maxStackElements ?? 0);
                w.writeUint16(m.maxSizeOfInstructions ?? 0);
                w.writeUint16(m.maxComponentElements ?? 0);
                w.writeUint16(m.maxComponentDepth ?? 0);
            }
            return w.finalize();
        }

        return { parseMaxp, encodeMaxp, MAXP_V0_5, MAXP_V1_0 };
    }
};

