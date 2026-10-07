// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `COLR` — Color Glyph Layers (OT §8.8.5).
 *
 * Two versions :
 *
 *  - **v0** : flat layer model — per base glyph, a list of `(layerGlyphID, paletteIndex)`.
 *  - **v1** : graph model — per base glyph a paint graph (linear/radial/sweep
 *    gradients, transforms, composites). Adds COLRv1 baseGlyphList +
 *    layerList + clipList + variation-store offset.
 *
 * The v1 Paint graph decoders live in `./colr/paint.js`.
 *
 * @module fonts/table/colr
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { tableColrPaint } from './colr/paint.js';

export const tableColr = {
    name: 'tableColr',
    dependencies: ['fontErrors', 'fontReader', 'tableColrPaint'],
    deps: [fontErrors, fontReader, tableColrPaint],
    factory(errors, reader, paint) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const {
            PAINT_FORMAT, BLEND_MODES,
            decodeColorLine, decodePaint, decodePaintGraph
        } = paint;

        function parseColr(bytes) {
            if (bytes.length < 14)
                throw new ParseError('fonts/colr-short', 'COLR header truncated');
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            if (version !== 0 && version !== 1)
                throw new ParseError('fonts/colr-version', `unsupported COLR version ${version}`,
                    { context: { version } });
            const numBaseGlyphRecords    = r.readUint16();
            const baseGlyphRecordsOffset = r.readUint32();
            const layerRecordsOffset     = r.readUint32();
            const numLayerRecords        = r.readUint16();

            const baseGlyphs = new Array(numBaseGlyphRecords);
            if (numBaseGlyphRecords && baseGlyphRecordsOffset) {
                const br = new BinaryReader(bytes, baseGlyphRecordsOffset, bytes.length - baseGlyphRecordsOffset);
                for (let i = 0; i < numBaseGlyphRecords; i++) {
                    baseGlyphs[i] = {
                        glyphID:        br.readUint16(),
                        firstLayerIndex: br.readUint16(),
                        numLayers:      br.readUint16()
                    };
                }
            }
            const layers = new Array(numLayerRecords);
            if (numLayerRecords && layerRecordsOffset) {
                const lr = new BinaryReader(bytes, layerRecordsOffset, bytes.length - layerRecordsOffset);
                for (let i = 0; i < numLayerRecords; i++) {
                    layers[i] = { glyphID: lr.readUint16(), paletteIndex: lr.readUint16() };
                }
            }

            let v1 = null;
            if (version === 1) {
                const baseGlyphListOffset      = r.readUint32();
                const layerListOffset          = r.readUint32();
                const clipListOffset           = r.readUint32();
                const varIndexMapOffset        = r.readUint32();
                const itemVariationStoreOffset = r.readUint32();
                v1 = {
                    baseGlyphListOffset, layerListOffset, clipListOffset,
                    varIndexMapOffset, itemVariationStoreOffset
                };
                if (baseGlyphListOffset && baseGlyphListOffset + 4 <= bytes.length) {
                    const bg = new BinaryReader(bytes, baseGlyphListOffset, bytes.length - baseGlyphListOffset);
                    const numBaseGlyphPaintRecords = bg.readUint32();
                    const baseGlyphPaintRecords = new Array(numBaseGlyphPaintRecords);
                    for (let i = 0; i < numBaseGlyphPaintRecords; i++) {
                        baseGlyphPaintRecords[i] = {
                            glyphID: bg.readUint16(),
                            paintOffset: bg.readUint32()
                        };
                    }
                    v1.baseGlyphPaintRecords = baseGlyphPaintRecords;
                }
            }

            return {
                version, baseGlyphs, layers, v1,
                baseLayer(gid) {
                    for (const rec of baseGlyphs) if (rec.glyphID === gid)
                        return layers.slice(rec.firstLayerIndex, rec.firstLayerIndex + rec.numLayers);
                    return null;
                }
            };
        }

        return { parseColr, decodePaint, decodeColorLine, decodePaintGraph, PAINT_FORMAT, BLEND_MODES };
    }
};

