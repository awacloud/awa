// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GSUB lookup types 1, 2, 3, 4 :
 *  - Type 1 : Single Substitution
 *  - Type 2 : Multiple Substitution
 *  - Type 3 : Alternate Substitution
 *  - Type 4 : Ligature Substitution
 *
 * Package-private helpers for {@link ../gsub.js}.
 *
 * @module fonts/table/gsub/types-1-4
 */

import { fontErrors } from '../../errors.js';
import { fontReader } from '../../primitives/reader.js';
import { layoutClassDefinitions } from '../../layout/classDefinitions.js';

export const tableGsubTypes14 = {
    name: 'tableGsubTypes14',
    dependencies: ['fontErrors', 'fontReader', 'layoutClassDefinitions'],
    deps: [fontErrors, fontReader, layoutClassDefinitions],
    factory(errors, reader, classDefs) {
        const { ParseError } = errors;
        const { BinaryReader } = reader;
        const { parseCoverage } = classDefs;

        function subBytes(bytes, offset) {
            return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
        }

        function parseSingleSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            const coverageOffset = r.readUint16();
            const cov = parseCoverage(subBytes(bytes, coverageOffset));
            if (format === 1) {
                const deltaGlyphID = r.readInt16();
                return {
                    type: 1, format, coverage: cov, deltaGlyphID,
                    substitute(gid) {
                        const ci = cov.lookup(gid);
                        if (ci == null) return null;
                        return (gid + deltaGlyphID) & 0xFFFF;
                    }
                };
            }
            if (format === 2) {
                const glyphCount = r.readUint16();
                const substituteGlyphIDs = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) substituteGlyphIDs[i] = r.readUint16();
                return {
                    type: 1, format, coverage: cov, substituteGlyphIDs,
                    substitute(gid) {
                        const ci = cov.lookup(gid);
                        if (ci == null) return null;
                        return substituteGlyphIDs[ci];
                    }
                };
            }
            throw new ParseError('fonts/gsub-single-format', `unsupported GSUB type 1 format ${format}`);
        }

        function parseMultipleSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gsub-mult-format', `unsupported GSUB type 2 format ${format}`);
            const coverageOffset = r.readUint16();
            const seqCount = r.readUint16();
            const seqOffsets = new Array(seqCount);
            for (let i = 0; i < seqCount; i++) seqOffsets[i] = r.readUint16();
            const cov = parseCoverage(subBytes(bytes, coverageOffset));
            const sequences = seqOffsets.map(off => {
                const sr = new BinaryReader(bytes, off, bytes.length - off);
                const glyphCount = sr.readUint16();
                const glyphs = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) glyphs[i] = sr.readUint16();
                return glyphs;
            });
            return {
                type: 2, format, coverage: cov, sequences,
                /** Apply at gids[idx]: returns { gids: replacement[], consumed: 1 } or null. */
                applyAt(gids, idx) {
                    const ci = cov.lookup(gids[idx]);
                    if (ci == null) return null;
                    const seq = sequences[ci];
                    if (!seq) return null;
                    return { gids: seq.slice(), consumed: 1 };
                }
            };
        }

        function parseAlternateSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gsub-alt-format', `unsupported GSUB type 3 format ${format}`);
            const coverageOffset = r.readUint16();
            const altSetCount = r.readUint16();
            const altSetOffsets = new Array(altSetCount);
            for (let i = 0; i < altSetCount; i++) altSetOffsets[i] = r.readUint16();
            const cov = parseCoverage(subBytes(bytes, coverageOffset));
            const alternateSets = altSetOffsets.map(off => {
                const sr = new BinaryReader(bytes, off, bytes.length - off);
                const glyphCount = sr.readUint16();
                const glyphs = new Array(glyphCount);
                for (let i = 0; i < glyphCount; i++) glyphs[i] = sr.readUint16();
                return glyphs;
            });
            return {
                type: 3, format, coverage: cov, alternateSets,
                /** Pick the `alt`-th alternate (default 0) for `gid` ; null if not covered. */
                alternate(gid, alt = 0) {
                    const ci = cov.lookup(gid);
                    if (ci == null) return null;
                    const set = alternateSets[ci];
                    if (!set || alt >= set.length) return null;
                    return set[alt];
                }
            };
        }

        function parseLigatureSubst(bytes) {
            const r = new BinaryReader(bytes);
            const format = r.readUint16();
            if (format !== 1)
                throw new ParseError('fonts/gsub-lig-format', `unsupported GSUB type 4 format ${format}`);
            const coverageOffset = r.readUint16();
            const ligSetCount = r.readUint16();
            const ligSetOffsets = new Array(ligSetCount);
            for (let i = 0; i < ligSetCount; i++) ligSetOffsets[i] = r.readUint16();
            const cov = parseCoverage(subBytes(bytes, coverageOffset));
            const ligSets = new Array(ligSetCount);
            for (let i = 0; i < ligSetCount; i++) {
                const lsStart = ligSetOffsets[i];
                const lr = new BinaryReader(bytes, lsStart, bytes.length - lsStart);
                const ligCount = lr.readUint16();
                const ligOffsets = new Array(ligCount);
                for (let k = 0; k < ligCount; k++) ligOffsets[k] = lr.readUint16();
                const ligs = ligOffsets.map(off => {
                    const ligStart = lsStart + off;
                    const lgr = new BinaryReader(bytes, ligStart, bytes.length - ligStart);
                    const ligatureGlyph = lgr.readUint16();
                    const componentCount = lgr.readUint16();
                    const components = new Array(componentCount - 1);   // first comp is the covered glyph
                    for (let k = 0; k < componentCount - 1; k++) components[k] = lgr.readUint16();
                    return { ligatureGlyph, components };
                });
                ligSets[i] = ligs;
            }
            return {
                type: 4, format, coverage: cov, ligatureSets: ligSets,
                /**
                 * Try to apply a ligature substitution starting at `gids[idx]`.
                 * Returns { gid, consumed } on match, null otherwise.
                 */
                substitute(gids, idx) {
                    const first = gids[idx];
                    const ci = cov.lookup(first);
                    if (ci == null) return null;
                    const set = ligSets[ci];
                    if (!set) return null;
                    for (const lig of set) {
                        if (idx + 1 + lig.components.length > gids.length) continue;
                        let ok = true;
                        for (let k = 0; k < lig.components.length; k++) {
                            if (gids[idx + 1 + k] !== lig.components[k]) { ok = false; break; }
                        }
                        if (ok) return { gid: lig.ligatureGlyph, consumed: 1 + lig.components.length };
                    }
                    return null;
                }
            };
        }

        return { parseSingleSubst, parseMultipleSubst, parseAlternateSubst, parseLigatureSubst };
    }
};

