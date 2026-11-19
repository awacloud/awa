// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview cmap subtable builder for PDF subsets — emits a Windows
 * BMP format 4 subtable of the code points up to U+FFFF and, when a code
 * point lies past it, a Windows full-repertoire (3, 10) format 12
 * subtable of every code point.
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

        /** Runs of consecutive code points mapped to consecutive gids: `{ start, end, firstGid }`. */
        function runsOf(sortedCps, cpToNewGid) {
            const out = [];
            let i = 0;
            while (i < sortedCps.length) {
                let j = i + 1;
                while (j < sortedCps.length
                       && sortedCps[j] === sortedCps[j - 1] + 1
                       && cpToNewGid.get(sortedCps[j]) === cpToNewGid.get(sortedCps[j - 1]) + 1)
                    j++;
                out.push({ start: sortedCps[i], end: sortedCps[j - 1], firstGid: cpToNewGid.get(sortedCps[i]) });
                i = j;
            }
            return out;
        }

        /** A format 12 subtable of every code point of `cpToNewGid`. */
        function format12(cpToNewGid) {
            const groups = runsOf([...cpToNewGid.keys()].sort((a, b) => a - b), cpToNewGid);
            const w = new BinaryWriter();
            w.writeUint16(12).writeUint16(0);
            w.writeUint32(16 + 12 * groups.length);
            w.writeUint32(0);
            w.writeUint32(groups.length);
            for (const g of groups) w.writeUint32(g.start).writeUint32(g.end).writeUint32(g.firstGid);
            return w.finalize();
        }

        /**
         * Build a cmap table: a Windows BMP (3, 1) format 4 subtable mapping
         * each code point up to U+FFFF in `cpToNewGid` to its renumbered gid
         * and, when a code point lies past U+FFFF, a Windows full-repertoire
         * (3, 10) format 12 subtable mapping every code point.
         *
         * @param {Map<number, number>} cpToNewGid
         * @returns {Uint8Array}
         */
        function buildCmapFormat4(cpToNewGid) {
            // Group consecutive cps into segments.
            const sortedCps = [...cpToNewGid.keys()].filter((cp) => cp <= 0xFFFF).sort((a, b) => a - b);
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
            // The binary-search fields the spec derives from segCount.
            const entrySelector = Math.floor(Math.log2(segCount));
            const searchRange = 2 * 2 ** entrySelector;
            const sub = new BinaryWriter();
            sub.writeUint16(4);
            sub.writeUint16(0);              // length placeholder
            sub.writeUint16(0);              // language
            sub.writeUint16(segCount * 2);
            sub.writeUint16(searchRange).writeUint16(entrySelector).writeUint16(2 * segCount - searchRange);
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

            const full = [...cpToNewGid.keys()].some((cp) => cp > 0xFFFF) ? format12(cpToNewGid) : null;
            const top = new BinaryWriter();
            top.writeUint16(0);
            top.writeUint16(full ? 2 : 1);
            top.writeUint16(3).writeUint16(1);
            top.writeUint32(full ? 20 : 12);
            if (full) top.writeUint16(3).writeUint16(10).writeUint32(20 + subBytes.length);
            top.writeBytes(subBytes);
            if (full) top.writeBytes(full);
            return top.finalize();
        }

        return { buildCmapFormat4 };
    }
};
