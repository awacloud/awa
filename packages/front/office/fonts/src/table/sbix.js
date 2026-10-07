// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `sbix` — Standard Bitmap Graphics (Apple — OT §8.10).
 *
 * Per-glyph bitmap data (PNG/JPG/TIFF) organised into strikes by ppem.
 *
 * Layout :
 *  - version uint16 (= 1)
 *  - flags uint16
 *  - numStrikes uint32
 *  - strikeOffsets[numStrikes] uint32  (from table start)
 *
 * Each strike :
 *  - ppem uint16
 *  - ppi uint16
 *  - glyphDataOffsets[numGlyphs + 1] uint32
 *  - glyph data : per-glyph { originOffsetX int16, originOffsetY int16,
 *                              graphicType Tag, data bytes }
 *
 * @module fonts/table/sbix
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';

export const tableSbix = {
    name: 'tableSbix',
    dependencies: ['fontErrors', 'fontReader', 'fontTag'],
    deps: [fontErrors, fontReader, fontTag],
    factory(errors, reader, tagMod) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { untag } = tagMod;

        function parseSbix(bytes, numGlyphs) {
            if (bytes.length < 8)
                throw new ParseError('fonts/sbix-short', 'sbix header truncated');
            const r = new BinaryReader(bytes);
            const version = r.readUint16();
            const flags   = r.readUint16();
            if (version !== 1)
                throw new ParseError('fonts/sbix-version', `unsupported sbix version ${version}`,
                    { context: { version } });
            const numStrikes = r.readUint32();
            const strikeOffsets = new Array(numStrikes);
            for (let i = 0; i < numStrikes; i++) strikeOffsets[i] = r.readUint32();
            const strikes = new Array(numStrikes);
            for (let i = 0; i < numStrikes; i++) {
                const so = strikeOffsets[i];
                const sr = new BinaryReader(bytes, so, bytes.length - so);
                const ppem = sr.readUint16();
                const ppi  = sr.readUint16();
                // glyphDataOffsets[numGlyphs + 1]
                const offsets = new Array(numGlyphs + 1);
                for (let g = 0; g <= numGlyphs; g++) offsets[g] = sr.readUint32();
                strikes[i] = {
                    ppem, ppi, strikeOffset: so, glyphDataOffsets: offsets,
                    getGlyphBitmap(gid) {
                        const start = so + offsets[gid];
                        const end   = so + offsets[gid + 1];
                        if (end <= start) return null;
                        const gr = new BinaryReader(bytes, start, end - start);
                        const originOffsetX = gr.readInt16();
                        const originOffsetY = gr.readInt16();
                        const graphicType = untag(gr.readUint32());
                        const data = gr.readBytesCopy(end - start - 8);
                        return { originOffsetX, originOffsetY, graphicType, data };
                    }
                };
            }
            return { version, flags, strikes };
        }

        return { parseSbix };
    }
};
