// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WOFF2 encoder — packs an SFNT byte stream into a
 * WOFF2 (Web Open Font Format 2.0) envelope.
 *
 * Strict factory body.
 *
 * @module fonts/extra/woff2-write
 */

import { fontErrors } from '../errors.js';
import { fontWriter } from '../primitives/writer.js';
import { fontSfnt } from '../sfnt/sfnt.js';
import { brotli } from '@awacloud/fw/io/compress/brotli.js';

export const extraWoff2Write = {
    name: 'extraWoff2Write',
    dependencies: ['fontErrors', 'fontWriter', 'fontSfnt', 'brotli'],
    deps: [fontErrors, fontWriter, fontSfnt, brotli],
    factory(errors, writer, sfntMod, brotliMod) {
        const WOFF2_MAGIC_CONST = 0x774F4632; // 'wOF2'
        const TAG_ESCAPE = 0x3F; // known-tag index 63: explicit 4-byte tag follows

        const { ContractError, ParseError } = errors;
        const { BinaryWriter } = writer;
        const { parseSfnt } = sfntMod;

        /** Encode a uint32 as a UIntBase128 sequence (RFC 8311 §4.4). */
        function writeBase128(w, v) {
            if (v < 0 || v > 0xFFFFFFFF)
                throw new ContractError('fonts/woff2w-base128-range',
                    'UIntBase128 value out of range', { context: { value: v } });
            const bytes = [];
            let n = v >>> 0;
            do {
                bytes.unshift(n & 0x7F);
                n = n >>> 7;
            } while (n !== 0);
            for (let i = 0; i < bytes.length - 1; i++) w.writeUint8(bytes[i] | 0x80);
            w.writeUint8(bytes[bytes.length - 1]);
        }

        /**
         * Encode an SFNT byte stream into a WOFF2 envelope.
         *
         * @param {Uint8Array} sfntBytes
         * @param {{ brotliCompressSync: (u8: Uint8Array) => Uint8Array }} brotli
         * @returns {Uint8Array}
         */
        function encodeWoff2(sfntBytes, brotli) {
            if (!(sfntBytes instanceof Uint8Array))
                throw new ContractError('fonts/woff2w-input',
                    'encodeWoff2 expects a Uint8Array', { context: { actual: typeof sfntBytes } });
            if (!brotli || typeof brotli.brotliCompressSync !== 'function')
                throw new ContractError('fonts/woff2w-no-brotli',
                    'encodeWoff2 requires a brotli module with brotliCompressSync');

            const sfnt = parseSfnt(sfntBytes);
            const names = Object.keys(sfnt.tables);
            if (names.length === 0)
                throw new ParseError('fonts/woff2w-empty',
                    'cannot encode WOFF2 with zero tables');

            // Concatenate untransformed bodies in directory order.
            let bodyLen = 0;
            for (const n of names) bodyLen += sfnt.tables[n].bytes.length;
            const body = new Uint8Array(bodyLen);
            let off = 0;
            for (const n of names) {
                const t = sfnt.tables[n];
                body.set(t.bytes, off);
                off += t.bytes.length;
            }

            const compressed = brotli.brotliCompressSync(body);
            if (!(compressed instanceof Uint8Array))
                throw new ContractError('fonts/woff2w-brotli-output',
                    'brotli.brotliCompressSync must return Uint8Array');

            const totalSfntSize = sfntBytes.length;

            const w = new BinaryWriter(64 + names.length * 12 + compressed.length);
            w.writeUint32(WOFF2_MAGIC_CONST);
            w.writeUint32(sfnt.sfntVersion);
            const lengthPos = w.pos; w.writeUint32(0);
            w.writeUint16(names.length);
            w.writeUint16(0);
            w.writeUint32(totalSfntSize);
            w.writeUint32(compressed.length);
            w.writeUint16(1);
            w.writeUint16(0);
            w.writeUint32(0); w.writeUint32(0); w.writeUint32(0);
            w.writeUint32(0); w.writeUint32(0);

            // TableDirectoryEntry flags (W3C WOFF2 § 5.1): bits 0-5 = known-tag
            // index (63 = arbitrary tag, the 4-byte tag follows), bits 6-7 =
            // preprocessing transformation version. Every body is written
            // untransformed: for glyf/loca the null transform is version 3
            // (version 0 means "transformed" and would require a
            // transformLength); for every other table it is version 0. No
            // transformLength is emitted for any entry.
            for (const n of names) {
                const t = sfnt.tables[n];
                const transformVersion = (n === 'glyf' || n === 'loca') ? 3 : 0;
                w.writeUint8(TAG_ESCAPE | (transformVersion << 6));
                w.writeTag(n);
                writeBase128(w, t.bytes.length);
            }

            w.writeBytes(compressed);

            const out = w.finalize();
            const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
            dv.setUint32(lengthPos, out.length >>> 0, false);
            return out;
        }

        // Default-binding overload using the injected brotliMod.
        function encode(sfntBytes) { return encodeWoff2(sfntBytes, brotliMod); }

        return { encode, encodeWoff2, WOFF2_MAGIC: WOFF2_MAGIC_CONST };
    }
};

