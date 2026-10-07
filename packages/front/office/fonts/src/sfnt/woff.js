// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WOFF 1.0 — Web Open Font Format (RFC 8311 §3).
 *
 * Envelope around an SFNT byte stream :
 *
 * ```
 *   signature uint32        ( = 'wOFF' = 0x774F4646 )
 *   flavor uint32           ( = sfntVersion of the wrapped font )
 *   length uint32           ( total WOFF byte length )
 *   numTables uint16
 *   reserved uint16
 *   totalSfntSize uint32    ( decompressed SFNT size )
 *   majorVersion uint16
 *   minorVersion uint16
 *   metaOffset / metaLength / metaOrigLength uint32 × 3
 *   privOffset / privLength uint32 × 2
 *   tableDirectory[numTables] :
 *       tag uint32, offset uint32, compLength uint32, origLength uint32, origChecksum uint32
 * ```
 *
 * Each table's bytes are either raw (when `compLength == origLength`)
 * or zlib-compressed. WOFF1 uses zlib (deflate + Adler32 wrapper),
 * decoded via `@awacloud/fw/io/compress/zlib.js`.
 *
 * `decodeWoff1(bytes, { zlib })` reverses the envelope and returns a
 * standalone SFNT byte stream. Caller supplies the zlib module
 * (no top-level dependency on fw so this file stays
 * factory-injectable).
 *
 * @module fonts/sfnt/woff
 */

/**
 * Worker-safe strict factory: the body inlines the WOFF1 parser /
 * decoder and closes over only DI-injected modules.
 */
import { fontErrors } from '../errors.js';
import { fontsShared } from '../_shared/index.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { fontTag } from '../primitives/tag.js';
import { zlib } from '@awacloud/fw/io/compress/zlib.js';

export const fontWoff = {
    name: 'fontWoff',
    dependencies: ['fontErrors', 'fontsShared', 'fontReader', 'fontWriter', 'fontTag', 'zlib'],
    deps: [fontErrors, fontsShared, fontReader, fontWriter, fontTag, zlib],
    factory(errors, shared, readerMod, writerMod, tagMod, zlibMod) {
        const { ParseError, ContractError } = errors;
        const { WOFF_MAGIC, sfntSearchParams } = shared;
        const { BinaryReader } = readerMod;
        const { BinaryWriter } = writerMod;
        const { untag } = tagMod;

        function parseWoff1Header(bytes) {
            if (bytes.length < 44)
                throw new ParseError('fonts/woff1-short', 'WOFF1 header truncated',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const signature = r.readUint32();
            if (signature !== WOFF_MAGIC)
                throw new ParseError('fonts/woff1-magic',
                    `expected 'wOFF' magic, got 0x${signature.toString(16)}`,
                    { context: { signature } });
            const flavor        = r.readUint32();
            const length        = r.readUint32();
            const numTables     = r.readUint16();
            r.readUint16();
            const totalSfntSize = r.readUint32();
            const majorVersion  = r.readUint16();
            const minorVersion  = r.readUint16();
            const metaOffset       = r.readUint32();
            const metaLength       = r.readUint32();
            const metaOrigLength   = r.readUint32();
            const privOffset       = r.readUint32();
            const privLength       = r.readUint32();
            const directory = new Array(numTables);
            for (let i = 0; i < numTables; i++) {
                directory[i] = {
                    tag:          r.readUint32(),
                    offset:       r.readUint32(),
                    compLength:   r.readUint32(),
                    origLength:   r.readUint32(),
                    origChecksum: r.readUint32()
                };
            }
            return {
                signature, flavor, length, numTables, totalSfntSize,
                majorVersion, minorVersion,
                metaOffset, metaLength, metaOrigLength,
                privOffset, privLength,
                directory
            };
        }

        function decodeWoff1(bytes, deps) {
            const z = (deps && deps.zlib) || zlibMod;
            if (!z || typeof z.unzlibSync !== 'function')
                throw new ContractError('fonts/woff1-no-zlib',
                    'decodeWoff1 requires { zlib: { unzlibSync } }', { context: {} });
            const hdr = parseWoff1Header(bytes);
            const { unzlibSync } = z;

            const decompressed = hdr.directory.map(entry => {
                const compStart = entry.offset;
                if (compStart + entry.compLength > bytes.length)
                    throw new ParseError('fonts/woff1-bad-offset',
                        `WOFF1 table '${untag(entry.tag)}' bytes out of range`,
                        { context: { tag: untag(entry.tag), offset: compStart, compLength: entry.compLength } });
                const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + compStart, entry.compLength);
                let table;
                if (entry.compLength === entry.origLength) {
                    table = new Uint8Array(raw);
                } else {
                    const inflated = unzlibSync(raw);
                    if (inflated.length !== entry.origLength)
                        throw new ParseError('fonts/woff1-bad-inflate',
                            `inflated length ${inflated.length} ≠ origLength ${entry.origLength}`,
                            { context: { tag: untag(entry.tag) } });
                    table = inflated;
                }
                return { tag: entry.tag, checksum: entry.origChecksum, bytes: table };
            });
            decompressed.sort((a, b) => a.tag - b.tag);
            const { searchRange, entrySelector, rangeShift } = sfntSearchParams(decompressed.length);
            const w = new BinaryWriter(hdr.totalSfntSize);
            w.writeUint32(hdr.flavor);
            w.writeUint16(decompressed.length);
            w.writeUint16(searchRange);
            w.writeUint16(entrySelector);
            w.writeUint16(rangeShift);
            const dirEntries = decompressed.map(d => {
                w.writeUint32(d.tag);
                w.writeUint32(d.checksum);
                const offPos = w.pos; w.writeUint32(0);
                w.writeUint32(d.bytes.length);
                return { ...d, offPos };
            });
            for (const e of dirEntries) {
                w.padTo4();
                w.patchUint32(e.offPos, w.pos);
                w.writeBytes(e.bytes);
            }
            w.padTo4();
            return w.finalize();
        }

        function parseHeader(b) { return parseWoff1Header(b); }
        function decode(b) { return decodeWoff1(b, { zlib: zlibMod }); }
        const WOFF_MAGIC_EXPORT = WOFF_MAGIC;
        return { parseHeader, decode, decodeWoff1, parseWoff1Header, WOFF_MAGIC: WOFF_MAGIC_EXPORT };
    }
};
