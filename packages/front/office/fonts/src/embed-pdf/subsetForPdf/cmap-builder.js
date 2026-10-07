// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview cmap subtable builder for PDF subsets — emits a single
 * Windows BMP format 4 subtable.
 *
 * Package-private helper for {@link ../subsetForPdf.js}.
 *
 * Strict factory body — `BinaryWriter` injected via DI (`fontWriter`).
 *
 * @module fonts/embed-pdf/subsetForPdf/cmap-builder
 */

import { fontWriter } from '../../primitives/writer.js';

export const embedCmapBuilder = {
    name: 'embedCmapBuilder',
    dependencies: ['fontWriter'],
    deps: [fontWriter],
    factory(writerMod) {
        const { BinaryWriter } = writerMod;

        /**
         * Build a cmap table containing a single Windows BMP format 4 subtable
         * mapping each code point in `cpToNewGid` to its renumbered gid.
         *
         * @param {Map<number, number>} cpToNewGid
         * @returns {Uint8Array}
         */
        function buildCmapFormat4(cpToNewGid) {
            // Group consecutive cps into segments.
            const sortedCps = [...cpToNewGid.keys()].sort((a, b) => a - b);
            const segments = [];
            let i = 0;
            while (i < sortedCps.length) {
                let j = i + 1;
                while (j < sortedCps.length
                       && sortedCps[j] === sortedCps[j - 1] + 1
                       && cpToNewGid.get(sortedCps[j]) === cpToNewGid.get(sortedCps[j - 1]) + 1)
                    j++;
                segments.push({ start: sortedCps[i], end: sortedCps[j - 1], firstGid: cpToNewGid.get(sortedCps[i]) });
                i = j;
            }
            // Add the mandatory terminator segment [FFFF..FFFF] -> 0 (delta 1)
            segments.push({ start: 0xFFFF, end: 0xFFFF, firstGid: 1 - 0xFFFF });
            const segCount = segments.length;
            const sub = new BinaryWriter();
            sub.writeUint16(4);
            sub.writeUint16(0);              // length placeholder
            sub.writeUint16(0);              // language
            sub.writeUint16(segCount * 2);
            sub.writeUint16(0).writeUint16(0).writeUint16(0);  // search/entry/range (loose)
            for (const s of segments) sub.writeUint16(s.end);
            sub.writeUint16(0);
            for (const s of segments) sub.writeUint16(s.start);
            for (const s of segments) {
                if (s.start === 0xFFFF) sub.writeInt16(1);
                else                    sub.writeInt16(s.firstGid - s.start);
            }
            for (const _ of segments) sub.writeUint16(0);   // idRangeOffset all zero
            const subBytes = sub.finalize();
            subBytes[2] = (subBytes.length >>> 8) & 0xFF;
            subBytes[3] = subBytes.length & 0xFF;

            const top = new BinaryWriter();
            top.writeUint16(0);
            top.writeUint16(1);
            top.writeUint16(3).writeUint16(1);
            top.writeUint32(12);
            top.writeBytes(subBytes);
            return top.finalize();
        }

        return { buildCmapFormat4 };
    }
};
