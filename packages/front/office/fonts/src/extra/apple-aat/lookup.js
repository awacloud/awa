// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The AAT lookup tables and extended state tables (Apple TT
 * RM06, "AAT special tables"), shared by `morx` (and later `kerx`).
 *
 *  - `parseLookup(bytes, offset, opts?)` reads a lookup table of format 0
 *    (simple array), 2 (segment single), 4 (segment array), 6 (single
 *    table), 8 (trimmed array) or 10 (extended trimmed array) and returns
 *    `{ format, get(glyph) }`; `get` gives the glyph's 16-bit value
 *    (`opts.valueSize: 4`: 32-bit, in formats 2, 4, 6 and 8; format 10: its
 *    unit-size value), or `null` when the table has none. Formats
 *    2, 4 and 6 are binary-search tables whose last unit may be the
 *    `0xFFFF` terminator; format 0 stops at `opts.numGlyphs` when given,
 *    else at the end of the bytes.
 *  - `parseStateTable(bytes, offset, entryWords, opts?)` reads an extended
 *    state table (`STXHeader`: `nClasses`, the class lookup, the state
 *    array, the entry table) whose entries carry `entryWords` 16-bit words
 *    of data. The states and entries are the reachable ones, counted from
 *    state 0 by a closure over each entry's new state, bounded by the
 *    bytes. It returns `{ nClasses, nStates, entries, classOf, entry }`:
 *    `classOf(glyph)` is 2 for the deleted glyph `0xFFFF`, the class
 *    lookup's value, else 1 (out of bounds); `entry(state, klass)` is
 *    `{ newState, flags, data }` (a class past `nClasses` reads as 1).
 *
 * A table that does not fit its bytes, or a lookup of another format,
 * throws a `ParseError`.
 *
 * Strict factory-only fw descriptor, capture-free, worker-safe.
 *
 * @module fonts/extra/apple-aat/lookup
 */

import { fontErrors } from '../../errors.js';

export const aatLookup = {
    name: 'aatLookup',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;

        /** The fixed classes of a state table. */
        const CLASS_OUT_OF_BOUNDS = 1;
        const CLASS_DELETED_GLYPH = 2;
        const DELETED_GLYPH = 0xFFFF;

        const u16 = (b, o) => (b[o] << 8) | b[o + 1];
        const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);

        function need(bytes, end, code, what) {
            if (end > bytes.length)
                throw new ParseError(code, `${what} runs past the table`, { context: { end, length: bytes.length } });
        }

        function checkBytes(bytes, offset, fn) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/aat-input', `${fn} expects Uint8Array`, { context: { actual: typeof bytes } });
            if (!Number.isSafeInteger(offset) || offset < 0)
                throw new ParseError('fonts/aat-input', `${fn}: bad offset`, { context: { offset } });
        }

        /** Binary search over `n` units of `size` bytes from `first`; `cmp(unitOffset)` < 0 when the glyph is before the unit. */
        function search(first, size, n, cmp) {
            let lo = 0, hi = n - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const c = cmp(first + mid * size);
                if (c < 0) hi = mid - 1;
                else if (c > 0) lo = mid + 1;
                else return first + mid * size;
            }
            return -1;
        }

        /**
         * A lookup table at `offset` of `bytes` (module header).
         *
         * @param {Uint8Array} bytes
         * @param {number} offset
         * @param {{numGlyphs?: number, valueSize?: 2|4}} [opts]
         * @returns {{format: number, get: (glyph: number) => number|null}}
         * @throws {ParseError} `fonts/aat-input`, `fonts/aat-lookup-short`, `fonts/aat-lookup-unit`, `fonts/aat-lookup-format`.
         */
        function parseLookup(bytes, offset, opts) {
            checkBytes(bytes, offset, 'parseLookup');
            const o = opts || {};
            const vs = o.valueSize === 4 ? 4 : 2;
            const val = vs === 4 ? u32 : u16;
            need(bytes, offset + 2, 'fonts/aat-lookup-short', 'lookup header');
            const format = u16(bytes, offset);
            const valid = (g) => Number.isInteger(g) && g >= 0 && g <= 0xFFFF;
            switch (format) {
                case 0: {
                    const start = offset + 2;
                    const avail = Math.floor((bytes.length - start) / vs);
                    const n = o.numGlyphs !== undefined ? Math.min(o.numGlyphs, avail) : avail;
                    return { format, get: (g) => (valid(g) && g < n ? val(bytes, start + vs * g) : null) };
                }
                case 2: case 4: case 6: {
                    need(bytes, offset + 12, 'fonts/aat-lookup-short', 'binary-search header');
                    const unitSize = u16(bytes, offset + 2);
                    let n = u16(bytes, offset + 4);
                    const first = offset + 12;
                    const keyWords = format === 6 ? 1 : 2;
                    if (unitSize < 2 * keyWords + (format === 4 ? 2 : vs))
                        throw new ParseError('fonts/aat-lookup-unit', `lookup format ${format} unit of ${unitSize} bytes`, { context: { format, unitSize } });
                    need(bytes, first + unitSize * n, 'fonts/aat-lookup-short', 'binary-search units');
                    if (n > 0) {
                        const last = first + (n - 1) * unitSize;
                        let terminator = true;
                        for (let k = 0; k < keyWords; k++) if (u16(bytes, last + 2 * k) !== 0xFFFF) terminator = false;
                        if (terminator) n--;
                    }
                    if (format === 6) {
                        return {
                            format,
                            get(g) {
                                if (!valid(g)) return null;
                                const at = search(first, unitSize, n, (u) => g - u16(bytes, u));
                                return at < 0 ? null : val(bytes, at + 2);
                            }
                        };
                    }
                    const seg = (g) => search(first, unitSize, n, (u) => (g < u16(bytes, u + 2) ? -1 : g > u16(bytes, u) ? 1 : 0));
                    if (format === 2) {
                        return { format, get: (g) => { if (!valid(g)) return null; const at = seg(g); return at < 0 ? null : val(bytes, at + 4); } };
                    }
                    return {
                        format,
                        get(g) {
                            if (!valid(g)) return null;
                            const at = seg(g);
                            if (at < 0) return null;
                            const v = offset + u16(bytes, at + 4) + vs * (g - u16(bytes, at + 2));
                            return v + vs <= bytes.length ? val(bytes, v) : null;
                        }
                    };
                }
                case 8: {
                    need(bytes, offset + 6, 'fonts/aat-lookup-short', 'trimmed-array header');
                    const firstGlyph = u16(bytes, offset + 2);
                    const count = u16(bytes, offset + 4);
                    need(bytes, offset + 6 + vs * count, 'fonts/aat-lookup-short', 'trimmed-array values');
                    return { format, get: (g) => (valid(g) && g >= firstGlyph && g - firstGlyph < count ? val(bytes, offset + 6 + vs * (g - firstGlyph)) : null) };
                }
                case 10: {
                    need(bytes, offset + 8, 'fonts/aat-lookup-short', 'extended trimmed-array header');
                    const unitSize = u16(bytes, offset + 2);
                    const firstGlyph = u16(bytes, offset + 4);
                    const count = u16(bytes, offset + 6);
                    if (unitSize !== 1 && unitSize !== 2 && unitSize !== 4)
                        throw new ParseError('fonts/aat-lookup-unit', `lookup format 10 unit of ${unitSize} bytes`, { context: { format, unitSize } });
                    need(bytes, offset + 8 + unitSize * count, 'fonts/aat-lookup-short', 'extended trimmed-array values');
                    const read = unitSize === 1 ? (p) => bytes[p] : unitSize === 2 ? (p) => u16(bytes, p) : (p) => u32(bytes, p);
                    return { format, get: (g) => (valid(g) && g >= firstGlyph && g - firstGlyph < count ? read(offset + 8 + unitSize * (g - firstGlyph)) : null) };
                }
                default:
                    throw new ParseError('fonts/aat-lookup-format', `unknown lookup format ${format}`, { context: { format } });
            }
        }

        /**
         * An extended state table at `offset` of `bytes` (module header).
         *
         * @param {Uint8Array} bytes
         * @param {number} offset
         * @param {number} entryWords 16-bit words of data per entry.
         * @param {{numGlyphs?: number}} [opts]
         * @returns {{nClasses: number, nStates: number, entries: {newState: number, flags: number, data: number[]}[],
         *   classOf: (glyph: number) => number, entry: (state: number, klass: number) => {newState: number, flags: number, data: number[]}}}
         * @throws {ParseError} `fonts/aat-input`, `fonts/aat-state-short`, `fonts/aat-state-classes`, and the lookup's.
         */
        function parseStateTable(bytes, offset, entryWords, opts) {
            checkBytes(bytes, offset, 'parseStateTable');
            need(bytes, offset + 16, 'fonts/aat-state-short', 'state table header');
            const nClasses = u32(bytes, offset);
            if (nClasses < 4 || nClasses > 0xFFFF)
                throw new ParseError('fonts/aat-state-classes', `state table with ${nClasses} classes`, { context: { nClasses } });
            const classes = parseLookup(bytes, offset + u32(bytes, offset + 4), opts);
            const stateBase = offset + u32(bytes, offset + 8);
            const entryBase = offset + u32(bytes, offset + 12);
            const entrySize = 4 + 2 * entryWords;

            // The reachable states and entries: a closure from state 0.
            let nStates = 1, nEntries = 0, rows = 0;
            const entries = [];
            while (rows < nStates || entries.length < nEntries) {
                need(bytes, stateBase + 2 * nClasses * nStates, 'fonts/aat-state-short', `state array of ${nStates} states`);
                for (; rows < nStates; rows++) {
                    for (let k = 0; k < nClasses; k++) nEntries = Math.max(nEntries, u16(bytes, stateBase + 2 * (rows * nClasses + k)) + 1);
                }
                need(bytes, entryBase + entrySize * nEntries, 'fonts/aat-state-short', `entry table of ${nEntries} entries`);
                for (let e = entries.length; e < nEntries; e++) {
                    const at = entryBase + entrySize * e;
                    const data = [];
                    for (let w = 0; w < entryWords; w++) data.push(u16(bytes, at + 4 + 2 * w));
                    const entry = { newState: u16(bytes, at), flags: u16(bytes, at + 2), data };
                    entries.push(entry);
                    nStates = Math.max(nStates, entry.newState + 1);
                }
            }
            return {
                nClasses,
                nStates,
                entries,
                classOf(glyph) {
                    if (glyph === DELETED_GLYPH) return CLASS_DELETED_GLYPH;
                    const v = classes.get(glyph);
                    return v === null ? CLASS_OUT_OF_BOUNDS : v;
                },
                entry(state, klass) {
                    const k = klass < nClasses ? klass : CLASS_OUT_OF_BOUNDS;
                    return entries[u16(bytes, stateBase + 2 * (state * nClasses + k))];
                }
            };
        }

        return { parseLookup, parseStateTable, DELETED_GLYPH };
    }
};
