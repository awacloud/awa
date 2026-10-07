// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SFNT — Scalable Font format container.
 *
 * Per [OT spec §5](https://learn.microsoft.com/en-us/typography/opentype/spec/otff)
 * an SFNT font file starts with:
 *
 * ```
 * Offset  Size  Field           Notes
 *      0     4  sfntVersion     0x00010000 (TrueType) or 'OTTO' (CFF) or 'true' / 'typ1' (legacy)
 *      4     2  numTables
 *      6     2  searchRange     (max-pow2-≤-numTables) × 16
 *      8     2  entrySelector   log2(max-pow2-≤-numTables)
 *     10     2  rangeShift      numTables × 16 − searchRange
 *     12     × Table records[numTables] :
 *                4  tableTag
 *                4  checksum
 *                4  offset      (from file start)
 *                4  length      (excluding any padding)
 * ```
 *
 * After the directory, each table sits at its declared offset, padded
 * with zeros to a 4-byte boundary (the directory's `length` field is
 * the unpadded length).
 *
 * This module parses both the directory and the raw table bytes ; it
 * does not interpret table contents. Returns:
 *
 * ```js
 * {
 *     sfntVersion: 0x00010000,
 *     flavor:      'truetype' | 'opentype' | 'apple-true' | 'apple-typ1',
 *     tables:      { head: { tag: 0x68656164, checksum, offset, length, bytes: Uint8Array }, ... }
 * }
 * ```
 *
 * @module fonts/sfnt/sfnt
 */

/**
 * Worker-safe strict factory: the body inlines every constant,
 * helper and the two `parseSfnt`/`packSfnt` functions, closing over only
 * the DI-injected modules.
 */
import { fontErrors } from '../errors.js';
import { fontsShared } from '../_shared/index.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { fontTag } from '../primitives/tag.js';
import { fontChecksum } from '../primitives/checksum.js';

export const fontSfnt = {
    name: 'fontSfnt',
    dependencies: ['fontErrors', 'fontsShared', 'fontReader', 'fontWriter', 'fontTag', 'fontChecksum'],
    deps: [fontErrors, fontsShared, fontReader, fontWriter, fontTag, fontChecksum],
    factory(errors, shared, readerMod, writerMod, tagMod, checksumMod) {
        const { ParseError } = errors;
        const {
            SFNT_FLAVOR, flavorFromVersion, versionFromFlavor, sfntSearchParams
        } = shared;
        const { BinaryReader } = readerMod;
        const { BinaryWriter } = writerMod;
        const { tag, untag } = tagMod;
        const { calcTableChecksum, computeChecksumAdjustment } = checksumMod;

        const SFNT_NUM_TABLES_MAX = 64;

        function parseSfnt(bytes) {
            const r = new BinaryReader(bytes);
            const sfntVersion = r.readUint32();
            const flavor = flavorFromVersion(sfntVersion);
            if (!flavor)
                throw new ParseError('fonts/sfnt-unknown-version',
                    `unknown SFNT version 0x${sfntVersion.toString(16).padStart(8, '0')}`,
                    { context: { sfntVersion } });
            const numTables = r.readUint16();
            r.readUint16(); r.readUint16(); r.readUint16();
            if (numTables === 0)
                throw new ParseError('fonts/sfnt-empty', 'SFNT directory has zero tables',
                    { context: { numTables } });
            if (numTables > SFNT_NUM_TABLES_MAX)
                throw new ParseError('fonts/sfnt-too-many-tables',
                    `SFNT directory declares ${numTables} tables (cap ${SFNT_NUM_TABLES_MAX})`,
                    { context: { numTables, cap: SFNT_NUM_TABLES_MAX } });
            if (12 + numTables * 16 > bytes.length)
                throw new ParseError('fonts/sfnt-truncated', 'SFNT directory truncated',
                    { context: { numTables, fileLength: bytes.length } });
            const tables = Object.create(null);
            for (let i = 0; i < numTables; i++) {
                const tagU32   = r.readUint32();
                const checksum = r.readUint32();
                const offset   = r.readUint32();
                const length   = r.readUint32();
                const name = untag(tagU32);
                if (offset + length > bytes.length)
                    throw new ParseError('fonts/sfnt-bad-offset',
                        `table '${name}' offset+length exceeds file (offset=${offset}, length=${length}, file=${bytes.length})`,
                        { context: { tag: name, offset, length, fileLength: bytes.length } });
                const tBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length);
                tables[name] = { tag: tagU32, checksum, offset, length, bytes: tBytes };
            }
            return { sfntVersion, flavor, tables, raw: bytes };
        }

        function packSfnt(input) {
            const tables = input.tables || {};
            const names = Object.keys(tables).sort();
            const numTables = names.length;
            if (numTables === 0)
                throw new ParseError('fonts/sfnt-empty', 'cannot pack SFNT with zero tables');
            let flavor = input.flavor;
            if (!flavor) flavor = ('CFF ' in tables || 'CFF2' in tables) ? SFNT_FLAVOR.OPENTYPE : SFNT_FLAVOR.TRUETYPE;
            const sfntVersion = versionFromFlavor(flavor);
            const { searchRange, entrySelector, rangeShift } = sfntSearchParams(numTables);
            const w = new BinaryWriter(1024 + numTables * 16);
            w.writeUint32(sfntVersion);
            w.writeUint16(numTables);
            w.writeUint16(searchRange);
            w.writeUint16(entrySelector);
            w.writeUint16(rangeShift);
            const dirEntryPositions = [];
            for (let i = 0; i < numTables; i++) {
                const name = names[i];
                w.writeTag(name);
                const cksumPos  = w.pos; w.writeUint32(0);
                const offsetPos = w.pos; w.writeUint32(0);
                const lengthPos = w.pos; w.writeUint32(0);
                dirEntryPositions.push({ name, cksumPos, offsetPos, lengthPos });
            }
            let headTableOffsetInFile = -1;
            for (const e of dirEntryPositions) {
                w.padTo4();
                const start = w.pos;
                const tb = tables[e.name];
                if (!(tb instanceof Uint8Array))
                    throw new ParseError('fonts/sfnt-bad-table-bytes', `table ${e.name} bytes must be Uint8Array`);
                w.writeBytes(tb);
                const unpaddedLen = tb.length;
                const cksum = calcTableChecksum(tb);
                w.patchUint32(e.cksumPos,  cksum);
                w.patchUint32(e.offsetPos, start);
                w.patchUint32(e.lengthPos, unpaddedLen);
                if (e.name === 'head') headTableOffsetInFile = start;
            }
            w.padTo4();
            const finalBytes = w.finalize();
            if (headTableOffsetInFile >= 0) {
                const adjOffset = headTableOffsetInFile + 8;
                finalBytes[adjOffset    ] = 0;
                finalBytes[adjOffset + 1] = 0;
                finalBytes[adjOffset + 2] = 0;
                finalBytes[adjOffset + 3] = 0;
                const adj = computeChecksumAdjustment(finalBytes);
                finalBytes[adjOffset    ] = (adj >>> 24) & 0xFF;
                finalBytes[adjOffset + 1] = (adj >>> 16) & 0xFF;
                finalBytes[adjOffset + 2] = (adj >>>  8) & 0xFF;
                finalBytes[adjOffset + 3] =  adj         & 0xFF;
            }
            return finalBytes;
        }

        return {
            parseSfnt, packSfnt, sfntSearchParams,
            SFNT_FLAVOR, flavorFromVersion, versionFromFlavor,
            SFNT_NUM_TABLES_MAX,
            tag, untag
        };
    }
};
