// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `morx` — Extended Glyph Metamorphosis (Apple TT RM06).
 *
 * `parseMorx(bytes, opts?)` reads the header, each chain's features and
 * each subtable's header, and decodes the bodies with `parsed: true`,
 * through `aatLookup` (`opts.numGlyphs` bounds a format 0 lookup):
 *
 *  - type 0, rearrangement: `stateTable`;
 *  - type 1, contextual: `stateTable` (each entry's data is the mark and
 *    current indices) and `substitutions`, its lookups;
 *  - type 2, ligature: `stateTable` (the ligature action index) and the
 *    readers `action(i)` (32-bit), `component(i)`, `ligature(i)` (16-bit);
 *  - type 4, noncontextual: `lookup`;
 *  - type 5, insertion: `stateTable` (the current and marked insert
 *    indices) and the reader `insertion(i)`.
 *
 * A reader gives `null` past the body. A body that does not decode keeps
 * `parsed: false` and an `error` (the `ParseError` code). Every subtable
 * keeps its raw `body`.
 *
 * Strict factory body.
 *
 * @module fonts/extra/apple-aat/morx
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { aatLookup } from './lookup.js';

export const aatMorx = {
    name: 'aatMorx',
    dependencies: ['fontErrors', 'fontReader', 'aatLookup'],
    deps: [fontErrors, fontReader, aatLookup],
    factory(errors, reader, lookups) {
        const HEADER_MIN     = 8;
        const CHAIN_HDR_SIZE = 16;
        const FEATURE_SIZE   = 12;
        const SUB_HDR_SIZE   = 12;
        const { ParseError } = errors;
        const { BinaryReader } = reader;

        const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);

        const u16 = (b, o) => (b[o] << 8) | b[o + 1];

        /** A reader of `size`-byte values from `base` of `body`: `null` past the body or below 0. */
        function valuesAt(body, base, size) {
            const read = size === 4 ? u32 : u16;
            return (i) => (Number.isInteger(i) && i >= 0 && base + size * (i + 1) <= body.length ? read(body, base + size * i) : null);
        }

        /** The offsets (32-bit, after the state table header) of a type 2 or 5 body, each within the body. */
        function offsets(body, n, code, what) {
            if (body.length < 16 + 4 * n)
                throw new ParseError(code, `${what} subtable header truncated`, { context: { length: body.length } });
            const out = [];
            for (let i = 0; i < n; i++) {
                const off = u32(body, 16 + 4 * i);
                if (off > body.length)
                    throw new ParseError(code, `${what} subtable offset past the body`, { context: { offset: off, length: body.length } });
                out.push(off);
            }
            return out;
        }

        /** The decoded fields of a body; null for a type that has none. */
        function decodeBody(type, body, numGlyphs) {
            const opts = numGlyphs !== undefined ? { numGlyphs } : undefined;
            if (type === 0) return { stateTable: lookups.parseStateTable(body, 0, 0, opts) };
            if (type === 4) return { lookup: lookups.parseLookup(body, 0, opts) };
            if (type === 2) {
                const [actionOff, componentOff, ligatureOff] = offsets(body, 3, 'fonts/morx-ligature-short', 'ligature');
                return {
                    stateTable: lookups.parseStateTable(body, 0, 1, opts),
                    action: valuesAt(body, actionOff, 4),
                    component: valuesAt(body, componentOff, 2),
                    ligature: valuesAt(body, ligatureOff, 2)
                };
            }
            if (type === 5) {
                const [insertionOff] = offsets(body, 1, 'fonts/morx-insertion-short', 'insertion');
                return { stateTable: lookups.parseStateTable(body, 0, 2, opts), insertion: valuesAt(body, insertionOff, 2) };
            }
            if (type !== 1) return null;
            const stateTable = lookups.parseStateTable(body, 0, 2, opts);
            if (body.length < 20)
                throw new ParseError('fonts/morx-contextual-short', 'contextual subtable header truncated', { context: { length: body.length } });
            const listOff = u32(body, 16);
            let count = 0;
            for (const e of stateTable.entries) for (const i of e.data) if (i !== 0xFFFF) count = Math.max(count, i + 1);
            if (listOff + 4 * count > body.length)
                throw new ParseError('fonts/morx-contextual-short', 'contextual substitution list runs past the subtable', { context: { listOff, count } });
            const substitutions = [];
            for (let i = 0; i < count; i++) substitutions.push(lookups.parseLookup(body, listOff + u32(body, listOff + 4 * i), opts));
            return { stateTable, substitutions };
        }

        function parseMorx(bytes, opts) {
            const numGlyphs = opts && opts.numGlyphs;
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/morx-input', 'parseMorx expects Uint8Array',
                    { context: { actual: typeof bytes } });
            if (bytes.length < HEADER_MIN)
                throw new ParseError('fonts/morx-short', 'morx table too short',
                    { context: { actual: bytes.length, needed: HEADER_MIN } });

            const r = new BinaryReader(bytes);
            const version = r.readUint32();
            if (version !== 0x00020000 && version !== 0x00030000)
                throw new ParseError('fonts/morx-version', `unsupported morx version 0x${version.toString(16)}`,
                    { context: { version } });
            const nChains = r.readUint32();
            if (nChains > 0xFFFF)
                throw new ParseError('fonts/morx-chains', `implausible chain count ${nChains}`,
                    { context: { nChains } });

            const chains = new Array(nChains);
            for (let i = 0; i < nChains; i++) chains[i] = parseChain(r, i, numGlyphs);

            return { version, nChains, chains };
        }

        function parseChain(r, index, numGlyphs) {
            const chainStart = r.pos;
            if (r.length - chainStart < CHAIN_HDR_SIZE)
                throw new ParseError('fonts/morx-chain-short', `chain ${index} header truncated`,
                    { context: { index, remaining: r.length - chainStart } });

            const defaultFlags = r.readUint32();
            const chainLength  = r.readUint32();
            const nFeatures    = r.readUint32();
            const nSubtables   = r.readUint32();

            if (chainLength < CHAIN_HDR_SIZE
                || chainStart + chainLength > r.length)
                throw new ParseError('fonts/morx-chain-length', `chain ${index} length invalid`,
                    { context: { index, chainLength, available: r.length - chainStart } });

            const features = new Array(nFeatures);
            for (let i = 0; i < nFeatures; i++) {
                if (r.pos + FEATURE_SIZE > chainStart + chainLength)
                    throw new ParseError('fonts/morx-feature-overflow',
                        `chain ${index} feature ${i} overflows chain`,
                        { context: { index, feature: i } });
                features[i] = {
                    featureType:    r.readUint16(),
                    featureSetting: r.readUint16(),
                    enableFlags:    r.readUint32(),
                    disableFlags:   r.readUint32()
                };
            }

            const subtables = new Array(nSubtables);
            for (let i = 0; i < nSubtables; i++) subtables[i] = parseSubtable(r, chainStart + chainLength, index, i, numGlyphs);

            r.seek(chainStart + chainLength);
            return { defaultFlags, chainLength, features, subtables };
        }

        function parseSubtable(r, chainEnd, chainIdx, subIdx, numGlyphs) {
            const subStart = r.pos;
            if (subStart + SUB_HDR_SIZE > chainEnd)
                throw new ParseError('fonts/morx-sub-short',
                    `chain ${chainIdx} subtable ${subIdx} header truncated`,
                    { context: { chain: chainIdx, sub: subIdx } });

            const length          = r.readUint32();
            const coverage        = r.readUint32();
            const subFeatureFlags = r.readUint32();

            if (length < SUB_HDR_SIZE || subStart + length > chainEnd)
                throw new ParseError('fonts/morx-sub-length',
                    `chain ${chainIdx} subtable ${subIdx} length invalid`,
                    { context: { chain: chainIdx, sub: subIdx, length } });

            const bodyLen = length - SUB_HDR_SIZE;
            const body = r.readBytes(bodyLen);

            const type             = coverage & 0xFF;
            const vertical         = !!(coverage & 0x80000000);
            const descending       = !!(coverage & 0x40000000);
            const bothOrientations = !!(coverage & 0x20000000);
            const logicalOrder     = !!(coverage & 0x10000000);

            const sub = {
                length,
                coverage: coverage >>> 0,
                type,
                vertical,
                descending,
                bothOrientations,
                logicalOrder,
                subFeatureFlags: subFeatureFlags >>> 0,
                body,
                parsed: false
            };
            try {
                const decoded = decodeBody(type, body, numGlyphs);
                if (decoded) Object.assign(sub, decoded, { parsed: true });
            } catch (e) {
                if (!(e instanceof ParseError)) throw e;
                sub.error = e.code;
            }
            return sub;
        }

        return { parseMorx };
    }
};

