// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TTC / OTC — Font Collection (OT §5).
 *
 * Layout :
 *  - ttcTag uint32  (= 'ttcf')
 *  - majorVersion uint16
 *  - minorVersion uint16
 *  - numFonts uint32
 *  - offsetTable[numFonts] uint32  — each points to a per-font SFNT directory
 *  - [v2 only] DSIG tag/length/offset (ignored)
 *
 * Each member font shares the same overall byte stream. Calling
 * `extractFont(bytes, index)` returns the SFNT bytes assembled as a
 * standalone TTF/OTF — useful for embed pipelines that expect a single
 * font file.
 *
 * @module fonts/sfnt/ttc
 */

/**
 * Worker-safe strict factory: the body inlines TTC parse/extract
 * logic and closes over only the DI-injected modules.
 */
import { fontErrors } from '../errors.js';
import { fontsShared } from '../_shared/index.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { fontTag } from '../primitives/tag.js';

export const fontTtc = {
    name: 'fontTtc',
    dependencies: ['fontErrors', 'fontsShared', 'fontReader', 'fontWriter', 'fontTag'],
    deps: [fontErrors, fontsShared, fontReader, fontWriter, fontTag],
    factory(errors, shared, readerMod, writerMod, tagMod) {
        const { ParseError } = errors;
        const { TTC_MAGIC, sfntSearchParams } = shared;
        const { BinaryReader } = readerMod;
        const { BinaryWriter } = writerMod;
        const { untag } = tagMod;

        function parseTtc(bytes) {
            if (bytes.length < 12)
                throw new ParseError('fonts/ttc-short', 'TTC header too short');
            const r = new BinaryReader(bytes);
            const ttcTag = r.readUint32();
            if (ttcTag !== TTC_MAGIC)
                throw new ParseError('fonts/ttc-magic',
                    `expected 'ttcf' magic, got 0x${ttcTag.toString(16)}`,
                    { context: { ttcTag } });
            const majorVersion = r.readUint16();
            const minorVersion = r.readUint16();
            const numFonts     = r.readUint32();
            if (12 + numFonts * 4 > bytes.length)
                throw new ParseError('fonts/ttc-truncated', 'TTC offset table truncated',
                    { context: { numFonts, length: bytes.length } });
            const offsets = new Array(numFonts);
            for (let i = 0; i < numFonts; i++) offsets[i] = r.readUint32();
            return { ttcTag, majorVersion, minorVersion, numFonts, offsets, raw: bytes };
        }

        function extractFont(bytes, index) {
            const ttc = parseTtc(bytes);
            if (index < 0 || index >= ttc.numFonts)
                throw new ParseError('fonts/ttc-bad-index',
                    `font index ${index} out of range (numFonts=${ttc.numFonts})`,
                    { context: { index, numFonts: ttc.numFonts } });
            const fontOffset = ttc.offsets[index];
            const r = new BinaryReader(bytes, fontOffset, bytes.length - fontOffset);
            const sfntVersion = r.readUint32();
            const numTables   = r.readUint16();
            r.readUint16(); r.readUint16(); r.readUint16();
            const tables = [];
            for (let i = 0; i < numTables; i++) {
                const tagU32   = r.readUint32();
                const checksum = r.readUint32();
                const offset   = r.readUint32();
                const length   = r.readUint32();
                tables.push({ tagU32, checksum, offset, length });
            }
            tables.sort((a, b) => a.tagU32 - b.tagU32);
            const { searchRange, entrySelector, rangeShift } = sfntSearchParams(numTables);
            const w = new BinaryWriter(1024);
            w.writeUint32(sfntVersion);
            w.writeUint16(numTables);
            w.writeUint16(searchRange);
            w.writeUint16(entrySelector);
            w.writeUint16(rangeShift);
            const dirEntries = tables.map(t => {
                w.writeUint32(t.tagU32);
                w.writeUint32(t.checksum);
                const offPos = w.pos; w.writeUint32(0);
                w.writeUint32(t.length);
                return { ...t, offPos };
            });
            for (const e of dirEntries) {
                w.padTo4();
                const start = w.pos;
                const tbytes = new Uint8Array(bytes.buffer, bytes.byteOffset + e.offset, e.length);
                w.writeBytes(tbytes);
                w.patchUint32(e.offPos, start);
            }
            w.padTo4();
            return w.finalize();
        }

        function ttcFontTagAt(bytes, index) {
            const ttc = parseTtc(bytes);
            const off = ttc.offsets[index];
            return untag(new BinaryReader(bytes, off, 4).readUint32());
        }

        return { parseTtc, extractFont, ttcFontTagAt, TTC_MAGIC };
    }
};
