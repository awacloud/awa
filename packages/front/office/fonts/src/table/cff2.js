// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `CFF2` — Compact Font Format 2 (OT §10.2).
 *
 * Variable-aware companion of {@link ./cff.js}. Differences from CFF :
 *  - **No String INDEX** (strings live in the host font's `name` table)
 *  - **No Name INDEX** (font name comes from the host's `name`)
 *  - **No Encoding / Charset** (CFF2 only carries glyph outline data)
 *  - **Top DICT** is a single block, not an INDEX of per-font DICTs
 *  - **Header** has a `topDictLength` field telling us where the DICT
 *    ends and the next chunk (Global Subr INDEX) begins
 *  - **INDEX format** has a uint32 count instead of uint16
 *  - **Charstrings** add a `vsindex` operator + `blend` operator that
 *    cooperate with the Item Variation Store for variable outlines
 *
 * Header layout :
 *  - majorVersion uint8 (= 2)
 *  - minorVersion uint8 (= 0)
 *  - headerSize uint8
 *  - topDictLength uint16
 *
 * @module fonts/table/cff2
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { tableCffDict } from './cff/dict.js';

export const tableCff2 = {
    name: 'tableCff2',
    dependencies: ['fontErrors', 'fontReader', 'tableCffDict'],
    deps: [fontErrors, fontReader, tableCffDict],
    factory(errors, reader, dict) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseDict } = dict;

        /** Parse a CFF2 INDEX (32-bit count). Returns same shape as `parseIndex` from CFF1. */
        function parseCff2Index(r) {
            const count = r.readUint32();
            if (count === 0) return { count: 0, offSize: 0, offsets: [], data: new Uint8Array(0), items: [], end: r.pos };
            const offSize = r.readUint8();
            if (offSize < 1 || offSize > 4)
                throw new ParseError('fonts/cff2-index-offsize',
                    `CFF2 INDEX offSize must be 1..4, got ${offSize}`,
                    { context: { offSize } });
            // The offset array alone needs (count + 1) × offSize bytes: refuse a
            // count the reader window cannot hold before allocating for it.
            const remaining = r.length - r.pos;
            if ((count + 1) * offSize > remaining)
                throw new ParseError('fonts/cff2-index-truncated',
                    `CFF2 INDEX of ${count} items needs ${(count + 1) * offSize} offset bytes, ${remaining} left`,
                    { context: { count, offSize, remaining } });
            const offsets = new Array(count + 1);
            for (let i = 0; i <= count; i++) {
                let v = 0;
                for (let k = 0; k < offSize; k++) v = (v << 8) | r.readUint8();
                offsets[i] = v;
            }
            if (offsets[0] !== 1)
                throw new ParseError('fonts/cff2-index-first-offset',
                    `CFF2 INDEX first offset must be 1, got ${offsets[0]}`);
            // Offsets never decrease (an item cannot end before it starts),
            // so the last one bounds every item to the INDEX data.
            for (let i = 1; i <= count; i++) {
                if (offsets[i] < offsets[i - 1])
                    throw new ParseError('fonts/cff2-index-bad-offset',
                        `CFF2 INDEX offset ${i} (${offsets[i]}) is below offset ${i - 1} (${offsets[i - 1]})`,
                        { context: { index: i, offset: offsets[i], previous: offsets[i - 1] } });
            }
            const totalDataLen = offsets[count] - 1;
            const dataView = r.readBytes(totalDataLen);
            const items = new Array(count);
            for (let i = 0; i < count; i++) {
                const from = offsets[i] - 1;
                const to   = offsets[i + 1] - 1;
                items[i] = new Uint8Array(dataView.buffer, dataView.byteOffset + from, to - from);
            }
            return { count, offSize, offsets, data: dataView, items, end: r.pos };
        }

        /** CFF2 Top DICT operator names (OpenType CFF2, Table 9). */
        const CFF2_TOP_DICT_OPS = Object.freeze({
            17: 'CharStrings',
            24: 'vstore',       // VariationStore offset
            0x0C07: 'FontMatrix',
            0x0C24: 'FDArray',
            0x0C25: 'FDSelect'
        });

        // A [start, start + length) range inside the table, or a typed error.
        function checkRange(bytes, start, length, code, what) {
            if (!(start >= 0 && length >= 0 && start + length <= bytes.length)) {
                throw new ParseError(code,
                    `CFF2 ${what} at ${start} (+${length}) runs past the ${bytes.length}-byte table`,
                    { context: { start, length, tableLength: bytes.length } });
            }
        }

        // The VariationStore: uint16 length, then an Item Variation Store
        // (kept as bytes, not decoded).
        function readVstore(bytes, off) {
            checkRange(bytes, off, 2, 'fonts/cff2-vstore-range', 'VariationStore');
            const length = (bytes[off] << 8) | bytes[off + 1];
            checkRange(bytes, off + 2, length, 'fonts/cff2-vstore-range', 'VariationStore');
            return { offset: off, length,
                data: new Uint8Array(bytes.buffer, bytes.byteOffset + off + 2, length) };
        }

        // The FDArray: an INDEX of Font DICTs, each naming its Private DICT
        // with `Private` (18) [size, offset].
        function readFdArray(bytes, off) {
            checkRange(bytes, off, 4, 'fonts/cff2-fdarray-range', 'FDArray');
            const index = parseCff2Index(new BinaryReader(bytes, off, bytes.length - off));
            return index.items.map(item => {
                const fontDict = parseDict(item, { cff2: true });
                const priv = fontDict.get(18);
                if (!priv || priv.length !== 2) return { fontDict, private: null };
                const [size, offset] = priv;
                checkRange(bytes, offset, size, 'fonts/cff2-private-range', 'Private DICT');
                const pb = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, size);
                return { fontDict,
                    private: { size, offset, bytes: pb, dict: parseDict(pb, { cff2: true }) } };
            });
        }

        function parseCff2(bytes) {
            if (bytes.length < 5)
                throw new ParseError('fonts/cff2-short', 'CFF2 header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint8();
            const minor = r.readUint8();
            const headerSize = r.readUint8();
            const topDictLength = r.readUint16();
            if (major !== 2)
                throw new ParseError('fonts/cff2-version',
                    `unsupported CFF2 major ${major}`, { context: { major, minor } });

            // Skip to header end (in case headerSize > 5 — future revisions may add fields)
            r.seek(headerSize);
            const topDictBytes = r.readBytes(topDictLength);
            const topDict = parseDict(topDictBytes, { cff2: true });

            // After Top DICT : Global Subr INDEX
            const globalSubrIndex = parseCff2Index(r);

            // Per-font sections referenced by Top DICT
            const out = {
                majorVersion: major, minorVersion: minor, headerSize, topDictLength,
                topDict, globalSubrIndex,
                charStringsIndex: null, vstore: null, fdArray: null
            };
            const csOff = topDict.get(17);
            if (csOff && csOff.length === 1) {
                const sub = new BinaryReader(bytes, csOff[0], bytes.length - csOff[0]);
                out.charStringsIndex = parseCff2Index(sub);
            }
            const fdArrayOff = topDict.get(0x0C24);
            if (fdArrayOff && fdArrayOff.length === 1) {
                out.fdArray = readFdArray(bytes, fdArrayOff[0]);
            }
            const vstoreOff = topDict.get(24);
            if (vstoreOff && vstoreOff.length === 1) {
                const off = vstoreOff[0];
                out.vstore = readVstore(bytes, off);
                out.vstoreOffset = off;
                out.vstoreBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + off, bytes.length - off);
            }
            return out;
        }

        return { parseCff2, parseCff2Index, CFF2_TOP_DICT_OPS };
    }
};

