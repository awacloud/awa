// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Parser for RFC 9841 §8 Shared Brotli Framing Format.
 *
 * Decodes the chunked container that wraps one or more brotli /
 * shared-brotli streams with per-chunk metadata, dictionary references,
 * optional hashes, and an optional central directory. Signature
 * `0x91 0x0a 0x42 0x52` - the first byte corresponds to a WBITS pattern
 * that is invalid in brotli / large-window-brotli, which disambiguates
 * a container framing from a raw stream.
 *
 * This module is a **parser only**: it returns a structured representation
 * of the container and its chunks. Payload decompression is the caller's
 * responsibility (typically [`brotli`](./brotli.md)). For `first` →
 * `middle*` → `last` sequences, `extractResources` concatenates the
 * partials into a single resource.
 *
 * ## RFC 9841 §8 coverage
 *
 * | Section | Coverage |
 * |---|---|
 * | §8.1 Main format (signature + flags) | yes |
 * | §8.2 Chunk header (length / type / codec / uSize / dict refs) | yes |
 * | §8.3 Metadata fields (`id`, `mt`, customs) | yes, via `parseMetadataFields` |
 * | §8.4.1 Padding chunk | yes |
 * | §8.4.2 Metadata chunk | yes |
 * | §8.4.3 Data chunk + flags + hash | yes |
 * | §8.4.4-6 Partial data chunks | yes |
 * | §8.4.7-9 Footer / global / repeat metadata | yes |
 * | §8.4.10-11 Central directory + final footer | yes (entries parsing: future) |
 * | Hash verification (256-bit HighwayHash) | no - implementation absent from `fw` |
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `parse(buf)` | `{ flags, hasFinalFooter, chunks, finalFooter? }` |
 * | `extractResources(parsed)` | `[{ payload, codec, codecName, ... }, …]` |
 * | `parseMetadataFields(payload)` | `[{ name, kind, content }, …]` |
 *
 */

/**
 * One parsed chunk (RFC 9841 §8.2).
 * @typedef {object} BrotliFrameChunk
 * @property {number} type Chunk type id.
 * @property {string} typeName Human-readable chunk type name.
 * @property {number} codec Codec id (-1 if none).
 * @property {string|null} codecName Codec name, or `null`.
 * @property {number} uncompressedSize Declared uncompressed size (-1 if absent).
 * @property {Array<object>|null} dictionaryRefs Shared-brotli dictionary references, or `null`.
 * @property {number} dataFlags Data-chunk flags byte (-1 if absent).
 * @property {{ type: number, bytes: Uint8Array }|null} hash Optional chunk hash.
 * @property {number} headerStart Byte offset of the chunk length varint.
 * @property {number} contentStart Byte offset of chunk content.
 * @property {number} payloadStart Byte offset of the chunk payload.
 * @property {number} contentEnd Exclusive byte offset of the chunk end.
 * @property {Uint8Array} payload Chunk payload bytes.
 */

/**
 * Result of `parse`.
 * @typedef {object} BrotliFrameParsed
 * @property {number} flags Header flags byte.
 * @property {boolean} hasFinalFooter Whether the flags declare a final footer.
 * @property {BrotliFrameChunk[]} chunks Parsed chunks in order.
 * @property {Uint8Array|null} finalFooter Final-footer bytes, or `null`.
 */

/**
 * One extracted resource (`extractResources`).
 * @typedef {object} BrotliFrameResource
 * @property {Uint8Array} payload Resource payload (concatenated for partial sequences).
 * @property {number} codec Codec id.
 * @property {string|null} codecName Codec name.
 * @property {number} uncompressedSize Declared uncompressed size.
 * @property {Array<object>|null} dictionaryRefs Dictionary references, or `null`.
 */

/**
 * One metadata field (`parseMetadataFields`).
 * @typedef {object} BrotliFrameMetadataField
 * @property {string} name Two-character field name.
 * @property {'standard'|'custom'} kind Field kind by name case.
 * @property {Uint8Array} content Field content bytes.
 */

/**
 * Public surface of `brotliFrame.factory()`.
 * @typedef {object} BrotliFrameAPI
 * @property {(buf: Uint8Array) => BrotliFrameParsed} parse Parse an RFC 9841 §8 framed container.
 * @property {(parsed: BrotliFrameParsed) => BrotliFrameResource[]} extractResources Group data chunks into resources.
 * @property {(payload: Uint8Array) => BrotliFrameMetadataField[]} parseMetadataFields Parse a §8.3 metadata field sequence.
 * @property {Object<number, string>} CHUNK_TYPE_NAMES Chunk type id → name map.
 * @property {Object<number, string>} CODEC_NAMES Codec id → name map.
 */

export const brotliFrame = {
    name: 'brotliFrame',
    version: '1.1.0',
    type: 'fw.io.compress',
    dependencies: [],

    /** @returns {BrotliFrameAPI} */
    factory() {

        const u8 = Uint8Array;

        function _err(code, msg, pos) {
            const e = new Error('brotliFrame: ' + msg + (pos != null ? ' @ byte ' + pos : ''));
            // @ts-ignore - Error.code/context is a non-standard but widely-used extension
            e.code = code;
            throw e;
        }

        // RFC 9841 §4 - varint (base-128, LSB-first byte order, MSB
        // continuation, max 9 bytes / 63 bits).
        function _readVarint(buf, p) {
            let v = 0;
            let shift = 0;
            let count = 0;
            while (count < 9) {
                if (p >= buf.length) _err('EBADSTREAM', 'varint truncated', p);
                const b = buf[p++];
                v += (b & 0x7F) * Math.pow(2, shift);
                count++;
                if ((b & 0x80) === 0) break;
                shift += 7;
                if (count === 9) _err('EBADSTREAM', 'varint > 63 bits', p);
            }
            return { v, p };
        }

        // Codec values per §8.2
        const CODEC_NAMES = { 0: 'uncompressed', 1: 'keep-decoder', 2: 'brotli', 3: 'shared-brotli' };

        // Chunk type values per §8.2
        const CHUNK_TYPE_NAMES = {
            0: 'padding',
            1: 'metadata',
            2: 'data',
            3: 'first-partial-data',
            4: 'middle-partial-data',
            5: 'last-partial-data',
            6: 'footer-metadata',
            7: 'global-metadata',
            8: 'repeat-metadata',
            9: 'central-directory',
            10: 'final-footer',
        };

        function parse(buf) {
            if (!(buf instanceof u8)) _err('EBADARG', 'expected Uint8Array');
            if (buf.length < 5) _err('EBADSTREAM', 'too short for header');

            // §8.1 signature
            if (buf[0] !== 0x91 || buf[1] !== 0x0a || buf[2] !== 0x42 || buf[3] !== 0x52) {
                _err('EBADSTREAM', 'invalid signature (expected 91 0a 42 52)');
            }

            const flags = buf[4];
            const version = flags & 0x03;
            if (version !== 0) _err('EBADSTREAM', 'unsupported version ' + version);
            const hasFinalFooter = (flags & 0x04) !== 0;
            if ((flags & 0xF8) !== 0) _err('EBADSTREAM', 'reserved flag bits must be zero');

            let p = 5;
            const chunks = [];
            let finalFooter = null;

            while (p < buf.length) {
                const lenStart = p;
                const lr = _readVarint(buf, p);
                const chunkLen = lr.v;
                p = lr.p;

                // Per §8.2: varint=0 → no chunk type byte, type defaults to 0 (padding).
                let chunkType = 0;
                let contentStart = p;
                const chunkEnd = p + chunkLen;
                if (chunkEnd > buf.length) _err('EBADSTREAM', 'chunk length exceeds buffer', p);

                if (chunkLen > 0) {
                    chunkType = buf[p++];
                    contentStart = p;
                }

                const isContentBearing = chunkType !== 0 && chunkType !== 9 && chunkType !== 10;

                let codec = -1;
                let uncompressedSize = -1;
                let dictionaryRefs = null;
                let dataFlags = -1;
                let hash = null;
                let payloadStart = contentStart;

                if (isContentBearing) {
                    if (p >= chunkEnd) _err('EBADSTREAM', 'missing CODEC byte', p);
                    codec = buf[p++];
                    if (!(codec in CODEC_NAMES)) _err('EBADSTREAM', 'invalid codec ' + codec, p);

                    if (codec !== 0) {  // not "uncompressed"
                        const us = _readVarint(buf, p);
                        uncompressedSize = us.v;
                        p = us.p;
                    }

                    if (codec === 3) {  // shared brotli - dictionary refs
                        if (p >= chunkEnd) _err('EBADSTREAM', 'missing NUM_DICT_REFS', p);
                        const ndr = buf[p++];
                        dictionaryRefs = [];
                        for (let i = 0; i < ndr; ++i) {
                            if (p >= chunkEnd) _err('EBADSTREAM', 'missing dict-ref flags', p);
                            const drFlags = buf[p++];
                            const source = drFlags & 0x03;
                            const dictType = (drFlags >> 2) & 0x03;
                            if (source === 3) _err('EBADSTREAM', 'invalid dict-ref source bits 11', p);
                            if (dictType >= 2) _err('EBADSTREAM', 'invalid dict-ref type bits', p);
                            if ((drFlags & 0xF0) !== 0) _err('EBADSTREAM', 'reserved dict-ref flag bits', p);
                            let ref;
                            if (source === 2) {  // hash-based
                                if (p + 33 > chunkEnd) _err('EBADSTREAM', 'truncated hash dict-ref', p);
                                const hashType = buf[p++];
                                const hash = new u8(buf.subarray(p, p + 32));
                                p += 32;
                                ref = { kind: 'hash', hashType, hash, dictType };
                            } else {
                                const ptrR = _readVarint(buf, p);
                                p = ptrR.p;
                                ref = { kind: 'pointer', source, ptr: ptrR.v, dictType };
                            }
                            dictionaryRefs.push(ref);
                        }
                    }

                    // Per-chunk-type extra header bytes (§8.4):
                    //   types 2/3/4/5 (data + partial data): 1 byte Flags
                    //     + if Flags bit 1 set (only valid for type 2):
                    //       1 byte hash type + 32 bytes hash digest
                    //   types 1/6/7/8 (metadata variants): no extras -
                    //     the chunk content is metadata fields (§8.3)
                    if (chunkType >= 2 && chunkType <= 5) {
                        if (p >= chunkEnd) _err('EBADSTREAM', 'missing data chunk flags', p);
                        dataFlags = buf[p++];
                        if ((dataFlags & 0xFC) !== 0) {
                            _err('EBADSTREAM', 'reserved data-chunk flag bits must be zero', p);
                        }
                        if (dataFlags & 0x02) {
                            if (chunkType !== 2) {
                                _err('EBADSTREAM', 'hash code only allowed on full data chunk (type 2)', p);
                            }
                            if (p + 33 > chunkEnd) _err('EBADSTREAM', 'truncated data chunk hash', p);
                            const hashType = buf[p++];
                            const hashBytes = new u8(buf.subarray(p, p + 32));
                            p += 32;
                            hash = { type: hashType, bytes: hashBytes };
                        }
                    }
                    payloadStart = p;
                }

                if (chunkType === 0) {
                    // Padding chunk - content must be zero except for the
                    // initial varint (already consumed).
                    for (let q = contentStart; q < chunkEnd; ++q) {
                        if (buf[q] !== 0) _err('EBADSTREAM', 'padding chunk byte != 0', q);
                    }
                } else if (chunkType === 10) {
                    // Final footer - must be last chunk in the stream.
                    finalFooter = new u8(buf.subarray(contentStart, chunkEnd));
                }

                chunks.push({
                    type: chunkType,
                    typeName: CHUNK_TYPE_NAMES[chunkType] || 'unknown',
                    codec,
                    codecName: codec >= 0 ? CODEC_NAMES[codec] : null,
                    uncompressedSize,
                    dictionaryRefs,
                    dataFlags,
                    hash,
                    headerStart: lenStart,
                    contentStart,
                    payloadStart,
                    contentEnd: chunkEnd,
                    payload: isContentBearing
                        ? new u8(buf.subarray(payloadStart, chunkEnd))
                        : new u8(buf.subarray(contentStart, chunkEnd)),
                });

                p = chunkEnd;
            }

            if (hasFinalFooter && finalFooter === null) {
                _err('EBADSTREAM', 'flags claim final footer but none present');
            }

            return { flags, hasFinalFooter, chunks, finalFooter };
        }

        // Group data chunks into resources. A resource is either:
        //   - a single chunk of type "data" (2)
        //   - a sequence type 3 (first) + 0..N type 4 (middle) + 1 type 5 (last)
        // Returns `[{ payload, codec, dictionaryRefs }, ...]` with payloads
        // concatenated for partial-data sequences.
        function extractResources(parsed) {
            const resources = [];
            let pending = null;

            for (const c of parsed.chunks) {
                if (c.type === 2) {
                    if (pending) _err('EBADSTREAM', 'data chunk amid partial sequence');
                    resources.push({
                        payload: c.payload,
                        codec: c.codec,
                        codecName: c.codecName,
                        uncompressedSize: c.uncompressedSize,
                        dictionaryRefs: c.dictionaryRefs,
                    });
                } else if (c.type === 3) {
                    if (pending) _err('EBADSTREAM', 'first-partial inside another partial sequence');
                    pending = {
                        parts: [c.payload],
                        codec: c.codec,
                        codecName: c.codecName,
                        uncompressedSize: c.uncompressedSize,
                        dictionaryRefs: c.dictionaryRefs,
                    };
                } else if (c.type === 4) {
                    if (!pending) _err('EBADSTREAM', 'middle-partial without preceding first-partial');
                    pending.parts.push(c.payload);
                } else if (c.type === 5) {
                    if (!pending) _err('EBADSTREAM', 'last-partial without preceding first-partial');
                    pending.parts.push(c.payload);
                    let total = 0;
                    for (const p of pending.parts) total += p.length;
                    const joined = new u8(total);
                    let off = 0;
                    for (const p of pending.parts) { joined.set(p, off); off += p.length; }
                    // @ts-ignore - pending object gains payload property at runtime
                    pending.payload = joined;
                    delete pending.parts;
                    resources.push(pending);
                    pending = null;
                }
                // Other chunk types (padding, metadata, footer, central
                // directory, final footer) - skipped.
            }
            if (pending) _err('EBADSTREAM', 'unterminated partial-data sequence');
            return resources;
        }

        // RFC 9841 §8.3 - Metadata fields format.
        //
        // The payload of every metadata-bearing chunk (types 1, 6, 7, 8)
        // is a sequence of metadata FIELDS. Each field has the form:
        //
        //   <NAME : 2 ASCII bytes><LENGTH : varint><CONTENT : LENGTH bytes>
        //
        // Standard names use two lowercase ASCII letters (`id` = resource
        // identifier, `mt` = MIME type, more reserved by future updates).
        // Application-defined names use two uppercase letters. Mixed-case
        // or non-letter pairs are reserved / invalid.
        //
        // Note: only the metadata chunk types contain field sequences.
        // For codec=0 (uncompressed) the payload IS the field sequence;
        // for codec=2/3 the payload is a compressed brotli stream whose
        // decompressed output is the field sequence (caller decompresses
        // first via the `brotli` module, then passes the decoded bytes
        // here).
        function parseMetadataFields(payload) {
            if (!(payload instanceof u8)) _err('EBADARG', 'expected Uint8Array');
            const fields = [];
            let p = 0;
            while (p < payload.length) {
                if (p + 2 > payload.length) _err('EBADSTREAM', 'truncated metadata field name', p);
                const n0 = payload[p];
                const n1 = payload[p + 1];
                // Each name byte must be an ASCII letter [A-Za-z].
                const isLetter = (b) => (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A);
                if (!isLetter(n0) || !isLetter(n1)) {
                    _err('EBADSTREAM', 'metadata field name bytes not ASCII letters', p);
                }
                // Lowercase pair = standard, uppercase pair = custom.
                // Mixed-case is reserved per §8.3 - flag as invalid.
                const lc0 = n0 >= 0x61;
                const lc1 = n1 >= 0x61;
                if (lc0 !== lc1) {
                    _err('EBADSTREAM', 'metadata field name mixes cases (reserved)', p);
                }
                const kind = lc0 ? 'standard' : 'custom';
                const name = String.fromCharCode(n0, n1);
                p += 2;

                // LENGTH: varint.
                const lr = _readVarint(payload, p);
                const length = lr.v;
                p = lr.p;
                if (p + length > payload.length) {
                    _err('EBADSTREAM', 'metadata field content exceeds payload', p);
                }
                const content = new u8(payload.subarray(p, p + length));
                p += length;
                fields.push({ name, kind, content });
            }
            return fields;
        }

        return /** @type {BrotliFrameAPI} */ (/** @type {any} */ ({
            parse,
            extractResources,
            parseMetadataFields,
            CHUNK_TYPE_NAMES,
            CODEC_NAMES,
        }));
    }
};
