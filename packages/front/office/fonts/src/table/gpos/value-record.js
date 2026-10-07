// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GPOS ValueRecord — variable-size struct selected by a
 * `valueFormat` bitfield.
 *
 * Bits :
 *  - X_PLACEMENT 0x01, Y_PLACEMENT 0x02
 *  - X_ADVANCE   0x04, Y_ADVANCE   0x08
 *  - X_PLACEMENT_DEVICE 0x10, Y_PLACEMENT_DEVICE 0x20
 *  - X_ADVANCE_DEVICE   0x40, Y_ADVANCE_DEVICE   0x80
 *
 * Strict factory body — package-private helper for {@link ../gpos.js}.
 * Top-level shims have been removed. Resolve through the runtime.
 *
 * @module fonts/table/gpos/value-record
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';

export const tableGposValueRecord = {
    name: 'tableGposValueRecord',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const { BinaryReader } = reader;

        const VALUE_FORMAT = Object.freeze({
            X_PLACEMENT: 0x01, Y_PLACEMENT: 0x02,
            X_ADVANCE:   0x04, Y_ADVANCE:   0x08,
            X_PLACEMENT_DEVICE: 0x10, Y_PLACEMENT_DEVICE: 0x20,
            X_ADVANCE_DEVICE:   0x40, Y_ADVANCE_DEVICE:   0x80
        });

        function valueRecordSize(format) {
            let n = 0;
            for (let m = 1; m <= 0x80; m <<= 1) if (format & m) n++;
            return n * 2;
        }

        function readValueRecord(r, format) {
            if (!format) return null;
            const v = {};
            if (format & 0x01) v.xPlacement = r.readInt16();
            if (format & 0x02) v.yPlacement = r.readInt16();
            if (format & 0x04) v.xAdvance   = r.readInt16();
            if (format & 0x08) v.yAdvance   = r.readInt16();
            if (format & 0x10) v.xPlacementDeviceOffset = r.readUint16();
            if (format & 0x20) v.yPlacementDeviceOffset = r.readUint16();
            if (format & 0x40) v.xAdvanceDeviceOffset   = r.readUint16();
            if (format & 0x80) v.yAdvanceDeviceOffset   = r.readUint16();
            return v;
        }

        function subBytes(bytes, offset) {
            return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
        }

        function readGposSubstLookupRecords(r, count) {
            const records = new Array(count);
            for (let i = 0; i < count; i++) {
                records[i] = {
                    sequenceIndex: r.readUint16(),
                    lookupListIndex: r.readUint16()
                };
            }
            return records;
        }

        /** Parse an Anchor table at `bytes`+`offset`. Returns null on offset 0. */
        function parseAnchor(bytes, offset) {
            if (!offset) return null;
            const r = new BinaryReader(bytes, offset, bytes.length - offset);
            const format = r.readUint16();
            const xCoordinate = r.readInt16();
            const yCoordinate = r.readInt16();
            const a = { format, xCoordinate, yCoordinate };
            if (format === 2) a.anchorPoint = r.readUint16();
            else if (format === 3) {
                a.xDeviceOffset = r.readUint16();
                a.yDeviceOffset = r.readUint16();
            }
            return a;
        }

        return { parseAnchor, VALUE_FORMAT, valueRecordSize, readValueRecord, subBytes, readGposSubstLookupRecords };
    }
};
