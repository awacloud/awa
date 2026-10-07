// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WOFF2 — Web Open Font Format 2.0 (RFC 8311 §4 / W3C
 * WOFF2 spec).
 *
 * WOFF2 wraps an SFNT in a Brotli-compressed envelope and applies a
 * **lossless transform** to the `glyf` and `loca` tables that
 * out-performs raw SFNT compression. The container layout is :
 *
 * ```
 *   signature uint32          ( = 'wOF2' = 0x774F4632 )
 *   flavor uint32             ( sfntVersion of the wrapped font )
 *   length uint32             ( total WOFF2 byte length )
 *   numTables uint16
 *   reserved uint16
 *   totalSfntSize uint32      ( decompressed SFNT size )
 *   totalCompressedSize uint32
 *   majorVersion uint16
 *   minorVersion uint16
 *   metaOffset / metaLength / metaOrigLength uint32 × 3
 *   privOffset / privLength uint32 × 2
 *   tableDirectory[numTables] :
 *       flags uint8           ( low 6 bits = known-table index, 0x3F = followed by 4-byte tag )
 *       [tag uint32]          ( if flags & 0x3F == 0x3F )
 *       origLength UIntBase128 ( variable-length, RFC 8311 §4.4 )
 *       [transformLength UIntBase128]   ( iff non-null transform: version != 3 for glyf/loca, != 0 otherwise )
 *   collectionDirectory       ( if flavor == 'ttcf' )
 *   compressedData            ( Brotli-compressed body of length totalCompressedSize )
 * ```
 *
 * **Scope** : parse the envelope, decompress the body via the
 * DI-injected Brotli module (or `deps.brotli`), and report each table's
 * origLength / transformLength. The WOFF2 transform of the `glyf` /
 * `loca` tables is not reversed, so a transformed font is not
 * reconstructed into an SFNT: `decodeWoff2` returns the decompressed body
 * together with the directory, and an `inverseGlyfTransform: false`
 * flag.
 *
 * Untransformed tables can be re-assembled into a valid SFNT directly.
 * Most real-world WOFF2 fonts use the glyf transform, so this envelope
 * reader is suitable for inspection but not for plug-in SFNT
 * consumption.
 *
 * @module fonts/sfnt/woff2
 */

/**
 * Worker-safe strict factory: the body inlines the WOFF2 envelope
 * parser / decompressor and closes over only DI-injected modules.
 */
import { fontErrors } from '../errors.js';
import { fontsShared } from '../_shared/index.js';
import { fontReader } from '../primitives/reader.js';
import { fontTag } from '../primitives/tag.js';
import { brotli } from '@awacloud/fw/io/compress/brotli.js';

export const fontWoff2 = {
    name: 'fontWoff2',
    dependencies: ['fontErrors', 'fontsShared', 'fontReader', 'fontTag', 'brotli'],
    deps: [fontErrors, fontsShared, fontReader, fontTag, brotli],
    factory(errors, shared, readerMod, tagMod, brotliMod) {
        const { ParseError, ContractError } = errors;
        const { WOFF2_MAGIC } = shared;
        const { BinaryReader } = readerMod;
        const { untag } = tagMod;
        const WOFF2_KNOWN_TABLES = Object.freeze([
            'cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp',
            'hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL',
            'SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx',
            'opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'
        ]);

        function packTag(s) {
            return ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
        }

        function readBase128(r) {
            let result = 0;
            for (let i = 0; i < 5; i++) {
                const b = r.readUint8();
                if (i === 0 && b === 0x80)
                    throw new ParseError('fonts/woff2-base128-leading-zero',
                        'UIntBase128 leading zero');
                if ((result & 0xFE000000) !== 0)
                    throw new ParseError('fonts/woff2-base128-overflow', 'UIntBase128 overflow');
                result = (result << 7) | (b & 0x7F);
                if ((b & 0x80) === 0) return result >>> 0;
            }
            throw new ParseError('fonts/woff2-base128-too-long', 'UIntBase128 too long');
        }

        function parseWoff2Header(bytes) {
            if (bytes.length < 48)
                throw new ParseError('fonts/woff2-short', 'WOFF2 header truncated',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const signature = r.readUint32();
            if (signature !== WOFF2_MAGIC)
                throw new ParseError('fonts/woff2-magic',
                    `expected 'wOF2' magic, got 0x${signature.toString(16)}`,
                    { context: { signature } });
            const flavor       = r.readUint32();
            const length       = r.readUint32();
            const numTables    = r.readUint16();
            r.readUint16();
            const totalSfntSize       = r.readUint32();
            const totalCompressedSize = r.readUint32();
            const majorVersion = r.readUint16();
            const minorVersion = r.readUint16();
            const metaOffset       = r.readUint32();
            const metaLength       = r.readUint32();
            const metaOrigLength   = r.readUint32();
            const privOffset       = r.readUint32();
            const privLength       = r.readUint32();
            const directory = new Array(numTables);
            for (let i = 0; i < numTables; i++) {
                const flags = r.readUint8();
                const knownIdx = flags & 0x3F;
                let t;
                if (knownIdx === 0x3F) t = r.readUint32();
                else t = packTag(WOFF2_KNOWN_TABLES[knownIdx] || '????');
                const transformVersion = (flags >>> 6) & 0x03;
                const origLength = readBase128(r);
                const tagStr = untag(t);
                // W3C WOFF2 § 4.1: the null transform is version 3 for
                // glyf/loca and version 0 for every other table;
                // transformLength is present iff the transform is non-null.
                const nullTransformVersion = (tagStr === 'glyf' || tagStr === 'loca') ? 3 : 0;
                let transformLength;
                if (transformVersion !== nullTransformVersion) {
                    transformLength = readBase128(r);
                }
                directory[i] = {
                    tag: t, tagStr, flags, transformVersion, origLength, transformLength
                };
            }
            return {
                signature, flavor, length, numTables,
                totalSfntSize, totalCompressedSize,
                majorVersion, minorVersion,
                metaOffset, metaLength, metaOrigLength,
                privOffset, privLength,
                directory,
                directoryEnd: r.pos
            };
        }

        function decodeWoff2(bytes, deps) {
            const b = (deps && deps.brotli) || brotliMod;
            if (!b || typeof b.brotliDecompressSync !== 'function')
                throw new ContractError('fonts/woff2-no-brotli',
                    'decodeWoff2 requires { brotli: { brotliDecompressSync } }', { context: {} });
            const hdr = parseWoff2Header(bytes);
            const compStart = hdr.directoryEnd;
            if (compStart + hdr.totalCompressedSize > bytes.length)
                throw new ParseError('fonts/woff2-bad-comp-range',
                    `compressed body extends past file (start=${compStart}, len=${hdr.totalCompressedSize}, total=${bytes.length})`,
                    { context: { compStart, compLength: hdr.totalCompressedSize, total: bytes.length } });
            const compressed = new Uint8Array(bytes.buffer, bytes.byteOffset + compStart, hdr.totalCompressedSize);
            const body = b.brotliDecompressSync(compressed);
            let cursor = 0;
            const tables = {};
            for (const entry of hdr.directory) {
                const len = entry.transformLength != null ? entry.transformLength : entry.origLength;
                if (cursor + len > body.length)
                    throw new ParseError('fonts/woff2-body-truncated',
                        `decompressed body truncated for table ${entry.tagStr}`,
                        { context: { table: entry.tagStr, cursor, len, bodyLen: body.length } });
                const tBytes = new Uint8Array(body.buffer, body.byteOffset + cursor, len);
                tables[entry.tagStr] = {
                    tag: entry.tag,
                    origLength: entry.origLength,
                    transformLength: entry.transformLength,
                    transformed: entry.transformLength != null,
                    bytes: tBytes
                };
                cursor += len;
            }
            const inverseGlyfTransform = !('glyf' in tables) || !tables.glyf.transformed;
            return { header: hdr, body, tables, inverseGlyfTransform };
        }

        function parseHeader(b) { return parseWoff2Header(b); }
        function decode(b) { return decodeWoff2(b, { brotli: brotliMod }); }
        return { parseHeader, decode, parseWoff2Header, decodeWoff2, WOFF2_MAGIC, WOFF2_KNOWN_TABLES };
    }
};
