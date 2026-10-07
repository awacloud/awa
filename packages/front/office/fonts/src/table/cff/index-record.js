// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CFF INDEX record parser.
 *
 * INDEX format :
 *  - count uint16              (uint32 in CFF2 — not supported here)
 *  - offSize uint8             (1..4 bytes per offset)
 *  - offsets[count+1] offSize  (1-based, data starts at offset 1)
 *  - data bytes                (item i = data[offsets[i]-1 .. offsets[i+1]-1])
 *
 * Package-private helper for {@link ../cff.js}.
 *
 * @module fonts/table/cff/index-record
 */

import { fontErrors } from '../../errors.js';

export const tableCffIndexRecord = {
    name: 'tableCffIndexRecord',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;

        /**
         * Parse a CFF INDEX starting at the current reader position. Returns
         * `{ count, offSize, offsets, data, items, end }` where `items[i]` is
         * a `Uint8Array` view over the data for item i.
         */
        function parseIndex(r) {
            const startPos = r.pos;
            const count = r.readUint16();
            if (count === 0) return { count: 0, offSize: 0, offsets: [], data: new Uint8Array(0), items: [], end: r.pos };
            const offSize = r.readUint8();
            if (offSize < 1 || offSize > 4)
                throw new ParseError('fonts/cff-index-offsize', `CFF INDEX offSize must be 1..4, got ${offSize}`,
                    { context: { startPos, offSize } });
            const offsets = new Array(count + 1);
            for (let i = 0; i <= count; i++) {
                let v = 0;
                for (let k = 0; k < offSize; k++) v = (v << 8) | r.readUint8();
                offsets[i] = v;
            }
            if (offsets[0] !== 1)
                throw new ParseError('fonts/cff-index-bad-first-offset',
                    `CFF INDEX first offset must be 1, got ${offsets[0]}`,
                    { context: { startPos } });
            // Data bytes begin one byte BEFORE the data section actually starts —
            // offsets are 1-based : offset 1 = first data byte.
            const totalDataLen = offsets[count] - 1;
            if (r.pos + totalDataLen > r._start + r._length)
                throw new ParseError('fonts/cff-index-truncated',
                    `CFF INDEX data exceeds reader window`,
                    { context: { dataLen: totalDataLen } });
            const dataView = r.readBytes(totalDataLen);
            const items = new Array(count);
            for (let i = 0; i < count; i++) {
                const from = offsets[i] - 1;
                const to   = offsets[i + 1] - 1;
                items[i] = new Uint8Array(dataView.buffer, dataView.byteOffset + from, to - from);
            }
            return { count, offSize, offsets, data: dataView, items, end: r.pos };
        }

        return { parseIndex };
    }
};

