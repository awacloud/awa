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
 * origLength / transformLength. `decodeWoff2` returns the decompressed
 * body together with the directory, each table as stored (a transformed
 * `glyf` / `loca` stays transformed, `inverseGlyfTransform: false`).
 *
 * `woff2ToSfnt` (and `toSfnt`) reassemble one SFNT, as `fontWoff`'s
 * `decode` does for WOFF 1.0: the `glyf` / `loca` transform (version 0,
 * § 5.1–5.3: the seven streams, the triplet-encoded points, the bounding
 * box and overlap bitmaps) and the `hmtx` transform (version 1, § 5.4:
 * the left side bearings restored from the glyphs' `xMin`) reversed, each
 * glyph written as a standard TrueType glyph padded to 4 bytes, `loca` in
 * the stored `indexFormat`, the tables packed in tag order with their
 * checksums and `head.checkSumAdjustment`. A malformed transform throws
 * `fonts/woff2-bad-transform`; a collection (`ttcf`) is not reassembled
 * (`fonts/woff2-collection`).
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
        const { FontError, ParseError, ContractError } = errors;
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
            let body;
            try {
                body = b.brotliDecompressSync(compressed);
            } catch (e) {
                // An injected decoder may throw typed errors itself; the fw
                // decoder throws plain Errors with a `code`.
                if (e instanceof FontError) throw e;
                if (e && e.code === 'ENEEDDICT')
                    throw new ContractError('fonts/woff2-no-dictionary',
                        'WOFF2 body uses the Brotli static dictionary, which is not loaded: ' +
                        'call brotliDictWords.setBlob(bytes) or await brotliDictWords.load(url) first',
                        { context: {}, cause: e });
                throw new ParseError('fonts/woff2-bad-brotli',
                    `WOFF2 body does not decompress: ${e && e.message}`,
                    { context: { compStart, compLength: hdr.totalCompressedSize }, cause: e });
            }
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

        /* ── toSfnt: the transforms reversed (W3C WOFF2 § 5) ─────────── */

        const TTCF_FLAVOR = 0x74746366;

        function badTransform(table, message, glyph) {
            return new ParseError('fonts/woff2-bad-transform', `WOFF2 ${table} transform: ${message}`,
                { context: glyph === undefined ? { table } : { table, glyph } });
        }

        /** Bounded big-endian reader over one stream of a transformed table. */
        function streamReader(bytes, start, length, table, name) {
            if (start + length > bytes.length) throw badTransform(table, `${name} stream past the table end`);
            const end = start + length;
            let pos = start;
            const need = (n) => {
                if (pos + n > end) throw badTransform(table, `${name} stream too short`);
            };
            return {
                u8() { need(1); return bytes[pos++]; },
                u16() { need(2); const v = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2; return v; },
                i16() { const v = this.u16(); return v & 0x8000 ? v - 0x10000 : v; },
                // 255UInt16 (§ 3.2).
                u255() {
                    const c = this.u8();
                    if (c === 253) return this.u16();
                    if (c === 255) return this.u8() + 253;
                    if (c === 254) return this.u8() + 506;
                    return c;
                },
                take(n) { need(n); const s = bytes.subarray(pos, pos + n); pos += n; return s; },
                get pos() { return pos; }
            };
        }

        const hasBit = (bits, i) => (bits[i >> 3] & (0x80 >> (i & 7))) !== 0;
        const withSign = (flag, v) => ((flag & 1) ? v : -v);

        /** One TrueType simple glyph: flags with repeats, short and long deltas. */
        function encodeSimple(endPts, xs, ys, on, instructions, bbox, overlap) {
            const n = xs.length;
            const flags = new Uint8Array(n);
            const xb = [];
            const yb = [];
            let px = 0, py = 0;
            for (let i = 0; i < n; i++) {
                let f = on[i] ? 0x01 : 0;
                if (i === 0 && overlap) f |= 0x40;
                const dx = xs[i] - px, dy = ys[i] - py;
                if (dx === 0) f |= 0x10;
                else if (dx > -256 && dx < 256) { f |= 0x02 | (dx > 0 ? 0x10 : 0); xb.push(Math.abs(dx)); }
                else xb.push((dx >> 8) & 0xFF, dx & 0xFF);
                if (dy === 0) f |= 0x20;
                else if (dy > -256 && dy < 256) { f |= 0x04 | (dy > 0 ? 0x20 : 0); yb.push(Math.abs(dy)); }
                else yb.push((dy >> 8) & 0xFF, dy & 0xFF);
                flags[i] = f;
                px = xs[i]; py = ys[i];
            }
            const fb = [];
            for (let i = 0; i < n;) {
                let r = 0;
                while (i + 1 + r < n && flags[i + 1 + r] === flags[i] && r < 255) r++;
                if (r) fb.push(flags[i] | 0x08, r); else fb.push(flags[i]);
                i += 1 + r;
            }
            const size = 10 + 2 * endPts.length + 2 + instructions.length + fb.length + xb.length + yb.length;
            const out = new Uint8Array((size + 3) & ~3);
            const dv = new DataView(out.buffer);
            dv.setInt16(0, endPts.length);
            bbox.forEach((v, k) => dv.setInt16(2 + 2 * k, v));
            let at = 10;
            for (const e of endPts) { dv.setUint16(at, e); at += 2; }
            dv.setUint16(at, instructions.length); at += 2;
            out.set(instructions, at); at += instructions.length;
            out.set(fb, at); at += fb.length;
            out.set(xb, at); at += xb.length;
            out.set(yb, at);
            return out;
        }

        /** One TrueType composite glyph: its components and instructions as stored. */
        function encodeComposite(components, instructions, bbox) {
            const size = 10 + components.length + (instructions ? 2 + instructions.length : 0);
            const out = new Uint8Array((size + 3) & ~3);
            const dv = new DataView(out.buffer);
            dv.setInt16(0, -1);
            bbox.forEach((v, k) => dv.setInt16(2 + 2 * k, v));
            out.set(components, 10);
            if (instructions) {
                dv.setUint16(10 + components.length, instructions.length);
                out.set(instructions, 12 + components.length);
            }
            return out;
        }

        /**
         * The transformed `glyf` (§ 5.1) rebuilt into `glyf` and `loca`
         * bytes; `xMins` per glyph (0 for an empty one) for the `hmtx`
         * transform.
         */
        function rebuildGlyf(bytes) {
            const T = 'glyf';
            const h = streamReader(bytes, 0, 36, T, 'header');
            h.u16();
            const optionFlags = h.u16();
            const numGlyphs = h.u16();
            const indexFormat = h.u16();
            if (indexFormat > 1) throw badTransform(T, `indexFormat ${indexFormat}`);
            const names = ['nContour', 'nPoints', 'flag', 'glyph', 'composite', 'bbox', 'instruction'];
            const s = {};
            let at = 36;
            const sizes = names.map(() => h.u16() * 0x10000 + h.u16());
            names.forEach((name, k) => { s[name] = streamReader(bytes, at, sizes[k], T, name); at += sizes[k]; });
            const bboxBitmap = s.bbox.take(4 * Math.floor((numGlyphs + 31) / 32));
            const overlapBitmap = (optionFlags & 1)
                ? streamReader(bytes, at, (numGlyphs + 7) >> 3, T, 'overlap').take((numGlyphs + 7) >> 3) : null;
            const glyphs = new Array(numGlyphs);
            const xMins = new Array(numGlyphs);
            const readBbox = () => [s.bbox.i16(), s.bbox.i16(), s.bbox.i16(), s.bbox.i16()];
            for (let i = 0; i < numGlyphs; i++) {
                const nContours = s.nContour.i16();
                const explicit = hasBit(bboxBitmap, i);
                if (nContours === 0) {
                    if (explicit) throw badTransform(T, 'an empty glyph with a bounding box', i);
                    glyphs[i] = new Uint8Array(0);
                    xMins[i] = 0;
                } else if (nContours > 0) {
                    const endPts = new Array(nContours);
                    let total = 0;
                    for (let c = 0; c < nContours; c++) {
                        total += s.nPoints.u255();
                        if (total > 0x10000) throw badTransform(T, 'more than 65,536 points', i);
                        endPts[c] = total - 1;
                    }
                    const xs = new Array(total), ys = new Array(total), on = new Array(total);
                    let x = 0, y = 0;
                    for (let p = 0; p < total; p++) {
                        const raw = s.flag.u8();
                        const flag = raw & 0x7F;
                        on[p] = !(raw >> 7);
                        let dx, dy;
                        if (flag < 10) {
                            dx = 0; dy = withSign(flag, ((flag & 14) << 7) + s.glyph.u8());
                        } else if (flag < 20) {
                            dx = withSign(flag, (((flag - 10) & 14) << 7) + s.glyph.u8()); dy = 0;
                        } else if (flag < 84) {
                            const b0 = flag - 20, b1 = s.glyph.u8();
                            dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
                            dy = withSign(flag >> 1, 1 + ((b0 & 0x0C) << 2) + (b1 & 0x0F));
                        } else if (flag < 120) {
                            const b0 = flag - 84;
                            dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + s.glyph.u8());
                            dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + s.glyph.u8());
                        } else if (flag < 124) {
                            const b0 = s.glyph.u8(), b1 = s.glyph.u8(), b2 = s.glyph.u8();
                            dx = withSign(flag, (b0 << 4) + (b1 >> 4));
                            dy = withSign(flag >> 1, ((b1 & 0x0F) << 8) + b2);
                        } else {
                            const b0 = s.glyph.u8(), b1 = s.glyph.u8(), b2 = s.glyph.u8(), b3 = s.glyph.u8();
                            dx = withSign(flag, (b0 << 8) + b1);
                            dy = withSign(flag >> 1, (b2 << 8) + b3);
                        }
                        x += dx; y += dy;
                        xs[p] = x; ys[p] = y;
                    }
                    const instructions = s.instruction.take(s.glyph.u255());
                    let bbox;
                    if (explicit) bbox = readBbox();
                    else if (total === 0) bbox = [0, 0, 0, 0];
                    else {
                        bbox = [xs[0], ys[0], xs[0], ys[0]];
                        for (let p = 1; p < total; p++) {
                            if (xs[p] < bbox[0]) bbox[0] = xs[p];
                            if (ys[p] < bbox[1]) bbox[1] = ys[p];
                            if (xs[p] > bbox[2]) bbox[2] = xs[p];
                            if (ys[p] > bbox[3]) bbox[3] = ys[p];
                        }
                    }
                    glyphs[i] = encodeSimple(endPts, xs, ys, on, instructions, bbox,
                        overlapBitmap !== null && hasBit(overlapBitmap, i));
                    xMins[i] = bbox[0];
                } else if (nContours === -1) {
                    if (!explicit) throw badTransform(T, 'a composite glyph without its bounding box', i);
                    const start = s.composite.pos;
                    let flags, haveInstructions = false;
                    do {
                        flags = s.composite.u16();
                        s.composite.u16();
                        s.composite.take(flags & 0x0001 ? 4 : 2);
                        if (flags & 0x0008) s.composite.take(2);
                        else if (flags & 0x0040) s.composite.take(4);
                        else if (flags & 0x0080) s.composite.take(8);
                        if (flags & 0x0100) haveInstructions = true;
                    } while (flags & 0x0020);
                    const components = bytes.subarray(start, s.composite.pos);
                    const bbox = readBbox();
                    const instructions = haveInstructions ? s.instruction.take(s.glyph.u255()) : null;
                    glyphs[i] = encodeComposite(components, instructions, bbox);
                    xMins[i] = bbox[0];
                } else {
                    throw badTransform(T, `contour count ${nContours}`, i);
                }
            }
            let glyfLength = 0;
            for (const g of glyphs) glyfLength += g.length;
            if (indexFormat === 0 && glyfLength > 0x1FFFE) throw badTransform(T, 'a short loca cannot address the glyphs');
            const glyf = new Uint8Array(glyfLength);
            const loca = new Uint8Array((numGlyphs + 1) * (indexFormat ? 4 : 2));
            const lv = new DataView(loca.buffer);
            let off = 0;
            for (let i = 0; i <= numGlyphs; i++) {
                if (indexFormat) lv.setUint32(4 * i, off); else lv.setUint16(2 * i, off / 2);
                if (i < numGlyphs) { glyf.set(glyphs[i], off); off += glyphs[i].length; }
            }
            return { glyf, loca, xMins, numGlyphs };
        }

        /** The transformed `hmtx` (§ 5.4) with its left side bearings restored. */
        function rebuildHmtx(bytes, numGlyphs, numberOfHMetrics, xMins) {
            const T = 'hmtx';
            if (!xMins) throw badTransform(T, 'needs a transformed glyf');
            if (numberOfHMetrics < 1 || numberOfHMetrics > numGlyphs || numGlyphs > xMins.length)
                throw badTransform(T, `numberOfHMetrics ${numberOfHMetrics}, numGlyphs ${numGlyphs}`);
            const r = streamReader(bytes, 0, bytes.length, T, 'hmtx');
            const flags = r.u8();
            if ((flags & 0xFC) || !(flags & 0x03)) throw badTransform(T, `flags ${flags}`);
            const advances = [];
            for (let i = 0; i < numberOfHMetrics; i++) advances.push(r.u16());
            const out = new Uint8Array(numberOfHMetrics * 4 + (numGlyphs - numberOfHMetrics) * 2);
            const dv = new DataView(out.buffer);
            for (let i = 0; i < numberOfHMetrics; i++) {
                dv.setUint16(4 * i, advances[i]);
                dv.setInt16(4 * i + 2, (flags & 0x01) ? xMins[i] : r.i16());
            }
            for (let i = numberOfHMetrics; i < numGlyphs; i++) {
                dv.setInt16(4 * numberOfHMetrics + 2 * (i - numberOfHMetrics), (flags & 0x02) ? xMins[i] : r.i16());
            }
            return out;
        }

        function checksum(bytes) {
            let sum = 0;
            for (let i = 0; i < bytes.length; i += 4) {
                const w = ((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0;
                sum = (sum + w) >>> 0;
            }
            return sum;
        }

        /** Tables packed into one SFNT: tag order, 4-byte alignment, checksums. */
        function packTables(flavor, tables) {
            const tags = Object.keys(tables).sort();
            const { searchRange, entrySelector, rangeShift } = shared.sfntSearchParams(tags.length);
            let size = 12 + 16 * tags.length;
            const offsets = tags.map((t) => { const o = size; size = (size + tables[t].length + 3) & ~3; return o; });
            const out = new Uint8Array(size);
            const dv = new DataView(out.buffer);
            dv.setUint32(0, flavor);
            dv.setUint16(4, tags.length);
            dv.setUint16(6, searchRange);
            dv.setUint16(8, entrySelector);
            dv.setUint16(10, rangeShift);
            let headAt = -1;
            tags.forEach((t, k) => {
                const b = tables[t];
                out.set(b, offsets[k]);
                if (t === 'head' && b.length >= 12) { headAt = offsets[k]; dv.setUint32(headAt + 8, 0); }
                const e = 12 + 16 * k;
                for (let c = 0; c < 4; c++) out[e + c] = t.charCodeAt(c);
                dv.setUint32(e + 4, checksum(out.subarray(offsets[k], offsets[k] + b.length)));
                dv.setUint32(e + 8, offsets[k]);
                dv.setUint32(e + 12, b.length);
            });
            if (headAt >= 0) dv.setUint32(headAt + 8, (0xB1B0AFBA - checksum(out)) >>> 0);
            return out;
        }

        /**
         * The WOFF2 reassembled into one SFNT: decoded, its `glyf` / `loca`
         * (version 0) and `hmtx` (version 1) transforms reversed, every
         * table packed. A collection is refused.
         *
         * @param {Uint8Array} bytes
         * @param {{ brotli: { brotliDecompressSync: Function } }} deps
         * @returns {Uint8Array}
         * @throws {ContractError} `fonts/woff2-collection`
         * @throws {ParseError} `fonts/woff2-bad-transform`, and `decodeWoff2`'s
         */
        function woff2ToSfnt(bytes, deps) {
            const hdr = parseWoff2Header(bytes);
            if (hdr.flavor === TTCF_FLAVOR)
                throw new ContractError('fonts/woff2-collection',
                    'a WOFF2 collection is not reassembled into an SFNT', { context: { flavor: hdr.flavor } });
            const d = decodeWoff2(bytes, deps);
            const version = {};
            for (const e of d.header.directory) {
                const ok = (e.tagStr === 'glyf' || e.tagStr === 'loca') ? (e.transformVersion === 0 || e.transformVersion === 3)
                    : e.tagStr === 'hmtx' ? e.transformVersion <= 1 : e.transformVersion === 0;
                if (!ok) throw badTransform(e.tagStr, `version ${e.transformVersion}`);
                version[e.tagStr] = e.transformVersion;
            }
            const glyfT = version.glyf === 0, locaT = version.loca === 0;
            if (glyfT !== locaT) throw badTransform('glyf', 'glyf and loca are transformed together');
            const out = {};
            for (const t of Object.keys(d.tables)) out[t] = d.tables[t].bytes;
            let rebuilt = null;
            if (glyfT) {
                rebuilt = rebuildGlyf(d.tables.glyf.bytes);
                out.glyf = rebuilt.glyf;
                out.loca = rebuilt.loca;
            }
            if (version.hmtx === 1) {
                const maxp = out.maxp, hhea = out.hhea;
                if (!maxp || maxp.length < 6 || !hhea || hhea.length < 36)
                    throw badTransform('hmtx', 'needs maxp and hhea');
                out.hmtx = rebuildHmtx(d.tables.hmtx.bytes, (maxp[4] << 8) | maxp[5], (hhea[34] << 8) | hhea[35],
                    rebuilt && rebuilt.xMins);
            }
            return packTables(hdr.flavor, out);
        }

        function parseHeader(b) { return parseWoff2Header(b); }
        function decode(b) { return decodeWoff2(b, { brotli: brotliMod }); }
        function toSfnt(b) { return woff2ToSfnt(b, { brotli: brotliMod }); }
        return { parseHeader, decode, toSfnt, parseWoff2Header, decodeWoff2, woff2ToSfnt, WOFF2_MAGIC, WOFF2_KNOWN_TABLES };
    }
};
