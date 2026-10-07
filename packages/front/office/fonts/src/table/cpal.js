// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `CPAL` — Color Palette Table (OT §8.8.6).
 *
 * Provides RGBA palettes used by COLR layered glyphs.
 *
 * Layout (v0) :
 *  - version uint16 (0 or 1)
 *  - numPaletteEntries uint16
 *  - numPalettes uint16
 *  - numColorRecords uint16
 *  - colorRecordsArrayOffset uint32
 *  - colorRecordIndices[numPalettes] uint16
 *  - colorRecords[numColorRecords] : BGRA bytes (4 bytes each)
 *
 * v1 adds: paletteTypesArrayOffset, paletteLabelsArrayOffset,
 * paletteEntryLabelsArrayOffset (each uint32, often 0).
 *
 * Returned model :
 *  `{ version, palettes: Array<Array<{r,g,b,a}>>, paletteTypes?, paletteLabels?, paletteEntryLabels? }`
 *
 * @module fonts/table/cpal
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const tableCpal = {
    name: 'tableCpal',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        function parseCpal(bytes) {
            if (bytes.length < 12)
                throw new ParseError('fonts/cpal-short', 'CPAL header truncated');
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            if (version > 1)
                throw new ParseError('fonts/cpal-version', `unsupported CPAL version ${version}`,
                    { context: { version } });
            const numPaletteEntries = r.readUint16();
            const numPalettes       = r.readUint16();
            const numColorRecords   = r.readUint16();
            const colorRecordsArrayOffset = r.readUint32();
            const colorRecordIndices = new Array(numPalettes);
            for (let i = 0; i < numPalettes; i++) colorRecordIndices[i] = r.readUint16();
            // v1 optional fields
            let paletteTypesArrayOffset = 0;
            let paletteLabelsArrayOffset = 0;
            let paletteEntryLabelsArrayOffset = 0;
            if (version === 1) {
                paletteTypesArrayOffset = r.readUint32();
                paletteLabelsArrayOffset = r.readUint32();
                paletteEntryLabelsArrayOffset = r.readUint32();
            }
            // Read color records (BGRA, 4 bytes each)
            const cr = new BinaryReader(bytes, colorRecordsArrayOffset, bytes.length - colorRecordsArrayOffset);
            const allColors = new Array(numColorRecords);
            for (let i = 0; i < numColorRecords; i++) {
                const b = cr.readUint8(), g = cr.readUint8(), red = cr.readUint8(), a = cr.readUint8();
                allColors[i] = { r: red, g, b, a };
            }
            // Slice per-palette
            const palettes = new Array(numPalettes);
            for (let p = 0; p < numPalettes; p++) {
                const start = colorRecordIndices[p];
                palettes[p] = allColors.slice(start, start + numPaletteEntries);
            }

            const out = { version, numPaletteEntries, numPalettes, palettes };
            if (version === 1) {
                out.paletteTypesArrayOffset = paletteTypesArrayOffset;
                out.paletteLabelsArrayOffset = paletteLabelsArrayOffset;
                out.paletteEntryLabelsArrayOffset = paletteEntryLabelsArrayOffset;
                if (paletteTypesArrayOffset) {
                    const pr = new BinaryReader(bytes, paletteTypesArrayOffset, bytes.length - paletteTypesArrayOffset);
                    out.paletteTypes = new Array(numPalettes);
                    for (let i = 0; i < numPalettes; i++) out.paletteTypes[i] = pr.readUint32();
                }
            }
            return out;
        }

        return { parseCpal };
    }
};
