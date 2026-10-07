// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `head` — Font Header Table (OT §6.4.2).
 *
 * 54 bytes fixed layout. The magicNumber `0x5F0F3CF5` and the
 * `unitsPerEm` field (typical values 1000 for CFF, 1024/2048 for TT)
 * are sanity-checked.
 *
 * Strict factory body — all parse/encode logic lives in `factory()`.
 * The top-level `parseHead`, `encodeHead`, `HEAD_MAGIC` exports are
 * transition shims removed in the final cleanup pass once consumers
 * (sfnt/, fonts.js, extra/, embed-pdf/, layout/, variable/) migrate to DI.
 *
 * @module fonts/table/head
 */


/**
 * @typedef {object} HeadTable
 * @property {number} majorVersion
 * @property {number} minorVersion
 * @property {number} fontRevision       — Fixed 16.16
 * @property {number} checksumAdjustment — uint32
 * @property {number} magicNumber
 * @property {number} flags              — uint16 bitfield
 * @property {number} unitsPerEm         — 16..16384
 * @property {number} created            — LONGDATETIME (seconds since 1904)
 * @property {number} modified
 * @property {number} xMin
 * @property {number} yMin
 * @property {number} xMax
 * @property {number} yMax
 * @property {number} macStyle           — uint16 bitfield
 * @property {number} lowestRecPPEM
 * @property {number} fontDirectionHint
 * @property {0|1}    indexToLocFormat   — 0 = short (uint16/2), 1 = long (uint32)
 * @property {number} glyphDataFormat
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';

export const tableHead = {
    name: 'tableHead',
    dependencies: ['fontErrors', 'fontReader', 'fontWriter'],
    deps: [fontErrors, fontReader, fontWriter],
    factory(errors, reader, writer) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { BinaryWriter } = writer;
        const HEAD_MAGIC = 0x5F0F3CF5;

        /** @returns {HeadTable} */
        function parseHead(bytes) {
            if (bytes.length < 54)
                throw new ParseError('fonts/head-short', 'head table must be 54 bytes',
                    { context: { actual: bytes.length } });
            const r = new BinaryReader(bytes);
            const majorVersion = r.readUint16();
            const minorVersion = r.readUint16();
            const fontRevision = r.readFixed();
            const checksumAdjustment = r.readUint32();
            const magicNumber = r.readUint32();
            if (magicNumber !== HEAD_MAGIC)
                throw new ParseError('fonts/head-magic',
                    `head.magicNumber expected 0x${HEAD_MAGIC.toString(16)}, got 0x${magicNumber.toString(16)}`,
                    { context: { magicNumber } });
            const flags         = r.readUint16();
            const unitsPerEm    = r.readUint16();
            if (unitsPerEm < 16 || unitsPerEm > 16384)
                throw new ParseError('fonts/head-upem', `head.unitsPerEm out of range (16..16384), got ${unitsPerEm}`,
                    { context: { unitsPerEm } });
            const created       = r.readLongDateTime();
            const modified      = r.readLongDateTime();
            const xMin          = r.readInt16();
            const yMin          = r.readInt16();
            const xMax          = r.readInt16();
            const yMax          = r.readInt16();
            const macStyle      = r.readUint16();
            const lowestRecPPEM = r.readUint16();
            const fontDirectionHint = r.readInt16();
            const indexToLocFormat  = r.readInt16();
            const glyphDataFormat   = r.readInt16();
            if (indexToLocFormat !== 0 && indexToLocFormat !== 1)
                throw new ParseError('fonts/head-itlf', `head.indexToLocFormat must be 0 or 1, got ${indexToLocFormat}`,
                    { context: { indexToLocFormat } });
            return {
                majorVersion, minorVersion, fontRevision,
                checksumAdjustment, magicNumber, flags, unitsPerEm,
                created, modified,
                xMin, yMin, xMax, yMax,
                macStyle, lowestRecPPEM, fontDirectionHint,
                indexToLocFormat, glyphDataFormat
            };
        }

        /** @param {HeadTable} head */
        function encodeHead(head) {
            const w = new BinaryWriter(54);
            w.writeUint16(head.majorVersion ?? 1);
            w.writeUint16(head.minorVersion ?? 0);
            w.writeFixed(head.fontRevision ?? 1);
            w.writeUint32(head.checksumAdjustment ?? 0);
            w.writeUint32(HEAD_MAGIC);
            w.writeUint16(head.flags ?? 0);
            w.writeUint16(head.unitsPerEm ?? 1000);
            w.writeLongDateTime(head.created ?? 0);
            w.writeLongDateTime(head.modified ?? 0);
            w.writeInt16(head.xMin ?? 0);
            w.writeInt16(head.yMin ?? 0);
            w.writeInt16(head.xMax ?? 0);
            w.writeInt16(head.yMax ?? 0);
            w.writeUint16(head.macStyle ?? 0);
            w.writeUint16(head.lowestRecPPEM ?? 8);
            w.writeInt16(head.fontDirectionHint ?? 2);
            w.writeInt16(head.indexToLocFormat ?? 0);
            w.writeInt16(head.glyphDataFormat ?? 0);
            return w.finalize();
        }

        return { parseHead, encodeHead, HEAD_MAGIC };
    }
};

