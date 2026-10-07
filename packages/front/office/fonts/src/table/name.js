// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `name` — Naming Table (OT §6.4.5).
 *
 * Layout (format 0) :
 *
 * ```
 *   format     uint16   (0 or 1)
 *   count      uint16   (number of name records)
 *   stringOffset uint16 (offset to start of string storage, from table start)
 *   nameRecords[count] :
 *       platformID  uint16
 *       encodingID  uint16
 *       languageID  uint16
 *       nameID      uint16
 *       length      uint16  (string length in bytes)
 *       offset      uint16  (from start of string storage)
 *   [if format 1] :
 *       langTagCount uint16
 *       langTagRecords[langTagCount] : { length: uint16, offset: uint16 }
 *   stringStorage  bytes
 * ```
 *
 * Strings are decoded to JS strings when the (platform, encoding) is
 * recognised (Unicode platform 0, Windows platform 3, Mac platform 1
 * Mac Roman) ; otherwise the raw bytes are kept.
 *
 * @module fonts/table/name
 */


import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { fontEncoding } from '../primitives/encoding.js';

export const tableName = {
    name: 'tableName',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter', 'fontEncoding'],
    deps: [fontErrors, fontReader, fontWriter, fontEncoding],
    factory(errors, reader, writer, encoding) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;
        const { decodeUtf16Be, encodeUtf16Be, decodeMacRoman, encodeMacRoman } = encoding;

        /**
         * Hard cap on the number of name records. Real fonts have 10–60.
         * Capping prevents allocation DoS on a malicious name table that
         * declares 65535 records.
         */
        const NAME_COUNT_MAX = 32768;

        const NAME_ID = Object.freeze({
            COPYRIGHT: 0,
            FONT_FAMILY: 1,
            FONT_SUBFAMILY: 2,
            UNIQUE_ID: 3,
            FULL_NAME: 4,
            VERSION: 5,
            POSTSCRIPT_NAME: 6,
            TRADEMARK: 7,
            MANUFACTURER: 8,
            DESIGNER: 9,
            DESCRIPTION: 10,
            VENDOR_URL: 11,
            DESIGNER_URL: 12,
            LICENSE: 13,
            LICENSE_URL: 14,
            TYPOGRAPHIC_FAMILY: 16,
            TYPOGRAPHIC_SUBFAMILY: 17
        });

        const PLATFORM = Object.freeze({
            UNICODE: 0,
            MAC:     1,
            ISO:     2,
            WINDOWS: 3,
            CUSTOM:  4
        });

        /**
         * Decode the string payload according to platform/encoding.
         * Returns null when the encoding is unsupported (caller keeps `.raw`).
         */
        function decodeString(platformID, encodingID, bytes) {
            // Unicode platform : always UTF-16BE
            if (platformID === PLATFORM.UNICODE) return decodeUtf16Be(bytes);
            // Windows : encoding 1 = Unicode BMP, encoding 10 = full repertoire (both UTF-16BE)
            if (platformID === PLATFORM.WINDOWS && (encodingID === 1 || encodingID === 10))
                return decodeUtf16Be(bytes);
            // Mac : encoding 0 = MacRoman
            if (platformID === PLATFORM.MAC && encodingID === 0) return decodeMacRoman(bytes);
            return null;
        }

        function encodeString(platformID, encodingID, str) {
            if (platformID === PLATFORM.UNICODE) return encodeUtf16Be(str);
            if (platformID === PLATFORM.WINDOWS && (encodingID === 1 || encodingID === 10))
                return encodeUtf16Be(str);
            if (platformID === PLATFORM.MAC && encodingID === 0) return encodeMacRoman(str);
            return null;
        }

        /**
         * @param {Uint8Array} bytes
         * @returns {{ format: number, records: Array, langTagRecords?: Array }}
         */
        function parseName(bytes) {
            if (bytes.length < 6)
                throw new ParseError('fonts/name-short', 'name table must be ≥ 6 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const format       = r.readUint16();
            if (format !== 0 && format !== 1)
                throw new ParseError('fonts/name-format', `unsupported name format ${format}`,
                    { context: { format } });
            const count        = r.readUint16();
            const stringOffset = r.readUint16();
            if (count > NAME_COUNT_MAX)
                throw new ParseError('fonts/name-too-many',
                    `name table declares ${count} records (cap ${NAME_COUNT_MAX})`,
                    { context: { count, cap: NAME_COUNT_MAX } });
            const records = [];
            for (let i = 0; i < count; i++) {
                records.push({
                    platformID: r.readUint16(),
                    encodingID: r.readUint16(),
                    languageID: r.readUint16(),
                    nameID:     r.readUint16(),
                    length:     r.readUint16(),
                    offset:     r.readUint16()
                });
            }
            let langTagRecords;
            if (format === 1) {
                const ltc = r.readUint16();
                langTagRecords = [];
                for (let i = 0; i < ltc; i++) {
                    langTagRecords.push({ length: r.readUint16(), offset: r.readUint16() });
                }
            }
            // Resolve string payloads
            for (const rec of records) {
                const start = stringOffset + rec.offset;
                if (start + rec.length > bytes.length)
                    throw new ParseError('fonts/name-bad-string-range',
                        `name record ${rec.nameID} string range exceeds table`,
                        { context: { start, length: rec.length, tableLength: bytes.length } });
                const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + start, rec.length);
                rec.raw = raw;
                const s = decodeString(rec.platformID, rec.encodingID, raw);
                if (s != null) rec.string = s;
            }
            if (langTagRecords) {
                for (const lt of langTagRecords) {
                    const start = stringOffset + lt.offset;
                    if (start + lt.length > bytes.length)
                        throw new ParseError('fonts/name-bad-langtag', 'langTag record range exceeds table');
                    const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + start, lt.length);
                    lt.raw = raw;
                    lt.string = decodeUtf16Be(raw);
                }
            }
            return langTagRecords ? { format, records, langTagRecords } : { format, records };
        }

        /**
         * Encode a name table from `{ records: [{ platformID, encodingID, languageID, nameID, string? | raw }] }`.
         * Always emits format 0 (language-tag records of format 1 are not written).
         */
        function encodeName(name) {
            const records = name.records || [];
            // Build string storage bytes per record (encode strings or use raw)
            const stringBlobs = records.map((rec) => {
                if (rec.raw instanceof Uint8Array) return rec.raw;
                if (typeof rec.string === 'string') {
                    const b = encodeString(rec.platformID, rec.encodingID, rec.string);
                    if (!b)
                        throw new ParseError('fonts/name-unsupported-encoding',
                            `cannot encode name record platform=${rec.platformID} encoding=${rec.encodingID}`,
                            { context: { platformID: rec.platformID, encodingID: rec.encodingID } });
                    return b;
                }
                return new Uint8Array(0);
            });
            const count = records.length;
            const headerLen = 6 + count * 12;
            const stringStorageOffset = headerLen;

            const w = new BinaryWriter(headerLen + 256);
            w.writeUint16(0);                       // format
            w.writeUint16(count);
            w.writeUint16(stringStorageOffset);

            // Allocate string offsets ; reuse identical blobs by content equality.
            const offsets = new Array(count);
            let cursor = 0;
            const cache = new Map();   // key: bytes-hex -> offset
            const storage = new BinaryWriter();
            for (let i = 0; i < count; i++) {
                const b = stringBlobs[i];
                let key = '';
                for (let k = 0; k < b.length; k++) key += b[k].toString(16).padStart(2, '0');
                if (cache.has(key)) {
                    offsets[i] = cache.get(key);
                } else {
                    offsets[i] = cursor;
                    cache.set(key, cursor);
                    storage.writeBytes(b);
                    cursor += b.length;
                }
            }
            for (let i = 0; i < count; i++) {
                const rec = records[i];
                w.writeUint16(rec.platformID);
                w.writeUint16(rec.encodingID);
                w.writeUint16(rec.languageID);
                w.writeUint16(rec.nameID);
                w.writeUint16(stringBlobs[i].length);
                w.writeUint16(offsets[i]);
            }
            w.writeBytes(storage.finalize());
            return w.finalize();
        }

        /**
         * Convenience : find the first record matching the given nameID and
         * (optional) platform preference order.
         *
         * @param {{ records: Array }} name
         * @param {number} nameID
         * @returns {string | undefined}
         */
        function getNameString(name, nameID) {
            if (!name || !name.records) return undefined;
            const prefer = [
                // Windows English US, Windows English (any), Mac English, anything
                rec => rec.platformID === 3 && rec.encodingID === 1 && rec.languageID === 0x0409,
                rec => rec.platformID === 3,
                rec => rec.platformID === 1 && rec.languageID === 0,
                _rec => true
            ];
            for (const pred of prefer) {
                for (const rec of name.records) {
                    if (rec.nameID !== nameID) continue;
                    if (typeof rec.string !== 'string') continue;
                    if (pred(rec)) return rec.string;
                }
            }
            return undefined;
        }

        return { parseName, encodeName, getNameString, NAME_ID, PLATFORM };
    }
};
