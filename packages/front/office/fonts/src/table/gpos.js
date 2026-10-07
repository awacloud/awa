// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `GPOS` — Glyph Positioning (OT §6.5.8).
 *
 * Header is identical to GSUB. Every lookup subtable type 1-9 is parsed :
 *
 *  - **Type 1** : Single Adjustment (formats 1 & 2)
 *  - **Type 2** : Pair Adjustment (formats 1 & 2 — kerning)
 *  - **Types 3-9** : Cursive, Mark attachment, Context and Extension
 *    positioning (see the sub-modules below)
 *
 * Lookup types outside 1-9 fall back to metadata only
 * (`{ type, parsed: false }`).
 *
 * **ValueRecord** : variable-size struct selected by a `valueFormat`
 * bitfield (X_PLACEMENT 0x01, Y_PLACEMENT 0x02, X_ADVANCE 0x04,
 * Y_ADVANCE 0x08, four DEVICE_OFFSET bits 0x10..0x80).
 *
 * Logic is split across sibling sub-modules :
 *  - `./gpos/value-record.js`       — VALUE_FORMAT + ValueRecord + Anchor
 *  - `./gpos/type1-single.js`       — Type 1
 *  - `./gpos/type2-pair.js`         — Type 2
 *  - `./gpos/type3-cursive.js`      — Type 3
 *  - `./gpos/type4-6-mark.js`       — Types 4, 5, 6 (mark attachment)
 *  - `./gpos/type7-8-context.js`    — Types 7, 8 (contextual)
 *  - `./gpos/type9-extension.js`    — Type 9
 *
 * @module fonts/table/gpos
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { tableGsubScriptFeatureList } from './gsub/script-feature-list.js';
import { tableGposValueRecord } from './gpos/value-record.js';
import { tableGposType1 } from './gpos/type1-single.js';
import { tableGposType2 } from './gpos/type2-pair.js';
import { tableGposType3 } from './gpos/type3-cursive.js';
import { tableGposType46 } from './gpos/type4-6-mark.js';
import { tableGposType78 } from './gpos/type7-8-context.js';
import { tableGposType9 } from './gpos/type9-extension.js';

export const tableGpos = {
    name: 'tableGpos',
    dependencies: [
        'fontErrors', 'fontReader',
        'tableGsubScriptFeatureList', 'tableGposValueRecord',
        'tableGposType1', 'tableGposType2', 'tableGposType3',
        'tableGposType46', 'tableGposType78', 'tableGposType9'
    ],
    deps: [fontErrors, fontReader, tableGsubScriptFeatureList, tableGposValueRecord, tableGposType1, tableGposType2, tableGposType3, tableGposType46, tableGposType78, tableGposType9],
    factory(errors, reader, scriptFeatureList, valueRecord, t1, t2, t3, t46, t78, t9) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseScriptList, parseFeatureList, parseLookupList } = scriptFeatureList;
        const { VALUE_FORMAT, valueRecordSize } = valueRecord;
        const { parseSingleAdj } = t1;
        const { parsePairAdj } = t2;
        const { parseCursiveAdj } = t3;
        const { parseMarkBase, parseMarkLig, parseMarkMark } = t46;
        const { parseContextPos, parseChainContextPos } = t78;
        const { parseExtensionPos } = t9;

        function parseGpos(bytes) {
            if (bytes.length < 10)
                throw new ParseError('fonts/gpos-short', 'GPOS header truncated');
            const r = new BinaryReader(bytes);
            const major = r.readUint16();
            const minor = r.readUint16();
            if (major !== 1)
                throw new ParseError('fonts/gpos-version',
                    `unsupported GPOS major version ${major}`,
                    { context: { major, minor } });
            const scriptListOffset  = r.readUint16();
            const featureListOffset = r.readUint16();
            const lookupListOffset  = r.readUint16();

            const scripts  = parseScriptList(bytes, scriptListOffset);
            const features = parseFeatureList(bytes, featureListOffset);
            const lookups  = parseLookupList(bytes, lookupListOffset, parseGposSubtable);

            return {
                majorVersion: major, minorVersion: minor,
                scripts, features, lookups
            };
        }

        function parseGposSubtable(type, bytes) {
            switch (type) {
                case 1: return parseSingleAdj(bytes);
                case 2: return parsePairAdj(bytes);
                case 3: return parseCursiveAdj(bytes);
                case 4: return parseMarkBase(bytes);
                case 5: return parseMarkLig(bytes);
                case 6: return parseMarkMark(bytes);
                case 7: return parseContextPos(bytes);
                case 8: return parseChainContextPos(bytes);
                case 9: return parseExtensionPos(bytes, parseGposSubtable);
                default: return { type, parsed: false };
            }
        }

        /**
         * Build a memoised kerning lookup map from a parsed GPOS table.
         *
         * Iterates every Type 2 (Pair Adjustment) subtable and materialises a
         * `Map<(leftGid<<16)|rightGid, dx>` keyed by the canonical
         * `left × 0x10000 + right` integer (both gids fit in 16 bits → 32-bit
         * key). Only `value1.xAdvance` is captured — sufficient for the common
         * horizontal-kerning case. Consumers that need richer ValueRecords
         * should walk `gpos.lookups` directly.
         *
         * Memoization opt-in: callers responsible for caching the returned map
         * across shaping calls (typically one font instance → one kerning
         * table).
         *
         * @param {object} gpos  — output of {@link parseGpos}
         * @returns {Map<number, number>}
         */
        function buildKerningTable(gpos) {
            const out = new Map();
            if (!gpos || !gpos.lookups) return out;
            for (const lookup of gpos.lookups) {
                if (!lookup || lookup.type !== 2 || !lookup.subtables) continue;
                for (const st of lookup.subtables) {
                    if (!st || st.type !== 2) continue;
                    if (st.format === 1 && st.coverage && st.pairSets) {
                        // The coverage object yields the index for each left gid;
                        // we ask it to enumerate its gids via getGlyphs() if
                        // available, else best-effort via scan.
                        const lefts = (st.coverage.getGlyphs && st.coverage.getGlyphs()) || [];
                        for (const left of lefts) {
                            const idx = st.coverage.lookup(left);
                            if (idx == null) continue;
                            const set = st.pairSets[idx];
                            if (!set) continue;
                            for (const p of set) {
                                const dx = (p.value1 && p.value1.xAdvance) || 0;
                                if (dx) out.set((left << 16) | p.secondGlyph, dx);
                            }
                        }
                    } else if (st.format === 2 && st.coverage && st.classDef1 && st.classDef2 && st.grid) {
                        const lefts = (st.coverage.getGlyphs && st.coverage.getGlyphs()) || [];
                        const rights = (st.classDef2.getGlyphs && st.classDef2.getGlyphs()) || [];
                        for (const left of lefts) {
                            const c1 = st.classDef1.lookup(left);
                            if (c1 == null || c1 >= st.grid.length) continue;
                            for (const right of rights) {
                                const c2 = st.classDef2.lookup(right);
                                if (c2 == null || c2 >= st.grid[c1].length) continue;
                                const cell = st.grid[c1][c2];
                                const dx = (cell && cell.value1 && cell.value1.xAdvance) || 0;
                                if (dx) out.set((left << 16) | right, dx);
                            }
                        }
                    }
                }
            }
            return out;
        }

        return { parseGpos, parseGposSubtable, buildKerningTable, VALUE_FORMAT, valueRecordSize };
    }
};

