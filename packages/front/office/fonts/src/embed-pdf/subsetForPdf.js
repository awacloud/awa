// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview embed-pdf — `subsetForPdf(font, codePoints)` produces a
 * minimal TrueType subset suitable for PDF Type0 / FontFile2 embedding.
 *
 * Output shape :
 *
 * ```js
 * {
 *     subsetBytes:    Uint8Array,         // SFNT bytes (TrueType subset)
 *     gidMap:         Map<oldGid, newGid>,
 *     glyphMap:       Map<codePoint, newGid>,
 *     toUnicodeCmap:  string,             // PDF CMap stream
 *     postScriptName: string,             // e.g. 'ABCDEF+Roboto-Regular'
 *     fontDescriptor: object              // PDF FontDescriptor dict
 * }
 * ```
 *
 * Algorithm :
 *  1. Compute the closure of the code-point set into a glyph-ID set by
 *     resolving each cp through `font.unicodeMap`. Composite glyphs
 *     expand to their referenced gids (recursive). Glyph 0 (.notdef)
 *     is always kept.
 *  2. Renumber the kept gids 0..N-1, preserving glyph 0 = .notdef.
 *  3. Re-encode the following tables :
 *       - `glyf` : keep only retained glyphs ; rewrite composite
 *         component glyph indices via `gidMap`.
 *       - `loca` : recompute offsets to point at the new glyf layout.
 *       - `hmtx` : keep only retained gids in source order.
 *       - `maxp` : update `numGlyphs`.
 *       - `head` : preserve fields (xMin..yMax, indexToLocFormat).
 *       - `hhea` : update `numberOfHMetrics`.
 *       - `cmap` : emit a single Windows BMP format 4 subtable mapping
 *         each kept cp → newGid.
 *       - `name` : preserve the original (could be stripped but kept
 *         for now since size impact is modest).
 *       - `OS/2` : preserve. `post` : header preserved, re-versioned to
 *         3.0 (no glyph names) unless already 3.0.
 *  4. Repack via {@link ../sfnt/sfnt.js#packSfnt}.
 *  5. Build the toUnicode CMap + FontDescriptor.
 *
 * Logic is split across sibling sub-modules :
 *   - `./subsetForPdf/closure.js`        — glyph closure
 *   - `./subsetForPdf/cmap-builder.js`   — Windows BMP format 4 builder
 *   - `./subsetForPdf/glyph-rewriter.js` — composite gid patch
 *   - `./subsetForPdf/hash.js`           — 6-char name prefix
 *
 * **Precondition**: `font` must have TrueType outlines (`glyf` + `loca`).
 * A CFF / CFF2-flavoured font (`OTTO`) — or any font without `glyf` /
 * `loca` — is rejected with `ContractError('fonts/subset-bad-font')`;
 * there is no CFF subsetting route, so the subset is always a TrueType
 * (`FontFile2`) program.
 *
 * Not carried through to the subset: variable-font tables (the default
 * instance's `glyf` outlines are subset, `gvar` / `fvar` are dropped) and
 * the GSUB / GPOS layout tables.
 *
 * Strict factory body.
 *
 * @module fonts/embed-pdf/subsetForPdf
 */

import { fontErrors } from '../errors.js';
import { fontSfnt } from '../sfnt/sfnt.js';
import { tableHead } from '../table/head.js';
import { tableHhea } from '../table/hhea.js';
import { tableMaxp } from '../table/maxp.js';
import { tableHmtx } from '../table/hmtx.js';
import { tableLoca } from '../table/loca.js';
import { embedFontDescriptor } from './fontDescriptor.js';
import { cmapToUnicode } from '../cmap/toUnicode.js';
import { fontWriter } from '../primitives/writer.js';
import { embedClosure } from './subsetForPdf/closure.js';
import { embedCmapBuilder } from './subsetForPdf/cmap-builder.js';
import { embedGlyphRewriter } from './subsetForPdf/glyph-rewriter.js';
import { embedHash } from './subsetForPdf/hash.js';

export const embedSubsetForPdf = {
    name: 'embedSubsetForPdf',
    dependencies: [
        'fontErrors', 'fontSfnt',
        'tableHead', 'tableHhea', 'tableMaxp', 'tableHmtx', 'tableLoca',
        'embedFontDescriptor', 'cmapToUnicode', 'fontWriter',
        'embedClosure', 'embedCmapBuilder', 'embedGlyphRewriter', 'embedHash'
    ],
    deps: [fontErrors, fontSfnt, tableHead, tableHhea, tableMaxp, tableHmtx, tableLoca, embedFontDescriptor, cmapToUnicode, fontWriter, embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash],
    factory(errors, sfnt, head, hhea, maxp, hmtx, loca, fd, toUni, writer, closure, cmapBuilder, rewriter, hash) {
        const { ContractError } = errors;
        const { packSfnt, SFNT_FLAVOR } = sfnt;
        const { encodeHead, HEAD_MAGIC } = head;
        const { encodeHhea } = hhea;
        const { encodeMaxp, MAXP_V1_0 } = maxp;
        const { encodeHmtx } = hmtx;
        const { encodeLoca } = loca;
        const { buildFontDescriptor } = fd;
        const { buildToUnicode } = toUni;
        const { BinaryWriter } = writer;
        const { computeGlyphClosure } = closure;
        const { buildCmapFormat4 } = cmapBuilder;
        const { rewriteGlyphBytes } = rewriter;
        const { hashPrefix } = hash;

        /**
         * @param {object} font           — output of `fonts.read(bytes)` — TrueType outlines required (see the precondition above)
         * @param {Iterable<number>} codePoints
         * @param {object} [opts]
         * @returns {{ subsetBytes: Uint8Array, gidMap: Map, glyphMap: Map, toUnicodeCmap: string, postScriptName: string, fontDescriptor: object }}
         */
        // eslint-disable-next-line no-unused-vars
        function subsetForPdf(font, codePoints, opts) {
            if (!font || !font.head || !font.glyphTable || !font.loca)
                throw new ContractError('fonts/subset-bad-font',
                    'subsetForPdf requires a TrueType font with glyf/loca tables', {});

            const cps = [...codePoints];
            const { keptGids, cpToGid } = computeGlyphClosure(font, cps);

            // Renumber : newGid = position in keptGids[]
            const gidMap = new Map();
            keptGids.forEach((g, i) => gidMap.set(g, i));
            const numGlyphs = keptGids.length;

            // Build new glyf bytes + offsets
            const glyfWriter = new BinaryWriter();
            const newOffsets = new Uint32Array(numGlyphs + 1);
            for (let i = 0; i < numGlyphs; i++) {
                newOffsets[i] = glyfWriter.length;
                const oldGid = keptGids[i];
                const rawStart = font.loca[oldGid];
                const rawEnd   = font.loca[oldGid + 1];
                const raw = new Uint8Array(font.rawSfnt.tables.glyf.bytes.buffer,
                                           font.rawSfnt.tables.glyf.bytes.byteOffset + rawStart,
                                           rawEnd - rawStart);
                const rewritten = rewriteGlyphBytes(raw, font.glyphTable[oldGid], gidMap);
                glyfWriter.writeBytes(rewritten);
                glyfWriter.padTo(2);
            }
            newOffsets[numGlyphs] = glyfWriter.length;
            const glyfBytes = glyfWriter.finalize();
            const locaEnc = encodeLoca(newOffsets);

            // hmtx
            const newMetrics = keptGids.map(oldGid => {
                const m = font.hmtx.metrics[oldGid] || { advanceWidth: 0, lsb: 0 };
                return { advanceWidth: m.advanceWidth, lsb: m.lsb };
            });
            const hmtxEnc = encodeHmtx({ metrics: newMetrics });

            // head : preserve, override indexToLocFormat from new loca
            const headBytes = encodeHead({
                ...font.head,
                magicNumber: HEAD_MAGIC,
                checksumAdjustment: 0,
                indexToLocFormat: locaEnc.indexToLocFormat
            });
            // hhea : preserve, override numberOfHMetrics
            const hheaBytes = encodeHhea({ ...font.hhea, numberOfHMetrics: hmtxEnc.numberOfHMetrics });
            // maxp v1.0 — minimal
            const maxpBytes = encodeMaxp({ ...font.maxp, version: MAXP_V1_0, numGlyphs });

            // cmap : rebuild from cpToGid → newGid map
            const cpToNewGid = new Map();
            for (const [cp, oldGid] of cpToGid) {
                const ng = gidMap.get(oldGid);
                if (ng != null) cpToNewGid.set(cp, ng);
            }
            const cmapBytes = buildCmapFormat4(cpToNewGid);

            // name + os/2 + post : reuse original raw bytes
            const tables = {
                head: headBytes, hhea: hheaBytes, maxp: maxpBytes,
                hmtx: hmtxEnc.bytes,
                cmap: cmapBytes,
                loca: locaEnc.bytes,
                glyf: glyfBytes,
                name: new Uint8Array(font.rawSfnt.tables.name.bytes)
            };
            if (font.rawSfnt.tables['OS/2']) tables['OS/2'] = new Uint8Array(font.rawSfnt.tables['OS/2'].bytes);
            // post : the source table is only safe to copy verbatim when it
            // is already v3.0 (header only, no glyph names). A v1.0/v2.0/v4.0
            // source carries glyph-name data keyed to the SOURCE font's gid
            // count/order, which the subset's renumbered/reduced glyph set
            // invalidates — `fonts.read()` on the subset then throws
            // `fonts/post-num-mismatch`. Re-version the 32-byte header to
            // 3.0 instead (no glyph names emitted); the 28 bytes after the
            // version tag (italicAngle, underline, isFixedPitch, memory
            // hints) share one layout across v1/v2/v3, so they are
            // preserved bit-for-bit.
            const srcPost = font.rawSfnt.tables.post;
            if (srcPost && srcPost.bytes.length >= 32) {
                const src = srcPost.bytes;
                if (src[0] === 0 && src[1] === 3 && src[2] === 0 && src[3] === 0) {
                    tables.post = new Uint8Array(src);
                } else {
                    const p = new Uint8Array(src.subarray(0, 32));
                    p[0] = 0; p[1] = 3; p[2] = 0; p[3] = 0;
                    tables.post = p;
                }
            }

            const subsetBytes = packSfnt({ flavor: SFNT_FLAVOR.TRUETYPE, tables });

            // toUnicode: newGid -> Unicode string
            const newGidToUnicode = new Map();
            for (const [cp, newGid] of cpToNewGid) {
                newGidToUnicode.set(newGid, String.fromCodePoint(cp));
            }
            const toUnicodeCmap = buildToUnicode(newGidToUnicode);

            // FontDescriptor + 6-char hash prefix
            const baseName = font.names?.postScriptName || font.names?.fullName || font.names?.family || 'Font';
            const prefix = hashPrefix(keptGids, baseName);
            const postScriptName = `${prefix}+${baseName}`;
            const fontDescriptor = buildFontDescriptor(font, {
                subsetBytes, namePrefix: prefix, isCff: false
            });
            fontDescriptor.FontName = postScriptName;

            // Build a per-newGid widths array suitable for PDF /W entry
            const widths = new Array(numGlyphs);
            for (let i = 0; i < numGlyphs; i++) widths[i] = newMetrics[i].advanceWidth;

            return {
                subsetBytes,
                gidMap,
                glyphMap: cpToNewGid,
                encoding: null,             // Type0 / Identity-H : encoding is via cmap
                widths,
                toUnicodeCmap,
                postScriptName,
                fontDescriptor
            };
        }

        return { subsetForPdf };
    }
};

