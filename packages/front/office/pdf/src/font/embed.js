// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Adapter between PDF Font objects and `@awacloud/fonts/embed-pdf`.
 *
 * This is the only file in `@awacloud/pdf` that knows about
 * `@awacloud/fonts/embed-pdf`. It takes a parsed font (the output of
 * `fonts.read(bytes)`) and a set of code points to embed, and produces the
 * PDF dicts needed for a simple (`/TrueType` + `/WinAnsiEncoding`) or a
 * composite (`/Type0` + `/Identity-H` + `/CIDFontType2`) embedding.
 *
 * **Re-derived against the REAL `@awacloud/fonts` contract.**
 * The `@awacloud/fonts/embed-pdf` `subsetForPdf(font, codePoints, opts?)` result
 * carries exactly these eight keys:
 *
 * ```js
 * {
 *     subsetBytes:    Uint8Array,           // packed TrueType SFNT
 *     gidMap:         Map<oldGid, newGid>,
 *     glyphMap:       Map<codePoint, newGid>,
 *     encoding:       null,                 // Identity-H → cmap-driven
 *     widths:         number[],             // per NEW gid, in FONT UNITS
 *     toUnicodeCmap:  string,               // ready-made CMap stream text
 *     postScriptName: string,               // 'ABCDEF+Family'
 *     fontDescriptor: object                // POJO, carries FontFile2 bytes
 * }
 * ```
 *
 * It does NOT return `font`, `subtype`, `baseFont`, `firstChar`, `lastChar`
 * nor `fontFile` — the keys the previous revision of this adapter read,
 * which made every call on a real `Font` throw `fonts/fd-no-font`.
 *
 * Two contracts this adapter owns:
 *
 * 1. **Widths are rescaled here.** `subset.widths[newGid]` is in font units
 *    (`hmtx.advanceWidth`); PDF wants 1000/em. Every width this module
 *    emits is `round(w * 1000 / parsedFont.unitsPerEm)`.
 * 2. **The descriptor leaves without its font program.** `FontFile2` /
 *    `FontFile3` is LIFTED out of the descriptor POJO into the returned
 *    `fontFile` (+ `fontFileKey`); the returned `descriptor` dict carries no
 *    font-program key. The consumer allocates the stream indirect
 *    (`/Length1` = `fontFile.length`) and injects the ref. Same for
 *    `toUnicodeStream`, which the consumer must also allocate as an indirect
 *    and reference (the serializer refuses an inline stream).
 *
 * 3. **`/ToUnicode` is keyed by character code, so its source is
 *    route-dependent.** `embedCid` uses `subset.toUnicodeCmap` as-is (under
 *    `Identity-H` the code IS the CID = the subset's new gid, exactly how
 *    the subsetter keys it); `embedSimple` builds its own byte-keyed map
 *    through `embedBuildToUnicode` (with `{ codeBytes: 1 }`: a one-byte
 *    `<00> <FF>` codespace), because a WinAnsi font's codes are bytes, not
 *    gids. Never both for one route.
 *
 * @module pdf/font/embed
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { embedSubsetForPdf } from '@awacloud/fonts/embed-pdf/subsetForPdf.js';
import { embedFontDescriptor } from '@awacloud/fonts/embed-pdf/fontDescriptor.js';
import { embedCidSystemInfo } from '@awacloud/fonts/embed-pdf/cidSystemInfo.js';
import { embedToUnicodeBuilder } from '@awacloud/fonts/embed-pdf/toUnicodeBuilder.js';

export const pdfFontEmbed = {
    name: 'pdfFontEmbed',
    dependencies: [
        'pdfErrors',
        'embedSubsetForPdf', 'embedFontDescriptor',
        'embedCidSystemInfo', 'embedToUnicodeBuilder'
    ],
    deps: [pdfErrors, embedSubsetForPdf, embedFontDescriptor, embedCidSystemInfo, embedToUnicodeBuilder],
    factory(errors, subsetMod, fontDescriptorMod, cidSystemInfoMod, toUnicodeBuilderMod) {
        const { ContractError } = errors;
        const fontsEmbedPdf = {
            subsetForPdf:        subsetMod.subsetForPdf,
            buildFontDescriptor: fontDescriptorMod.buildFontDescriptor,
            buildCidSystemInfo:  cidSystemInfoMod.buildCidSystemInfo,
            embedBuildToUnicode: toUnicodeBuilderMod.embedBuildToUnicode
        };

        // Minimal `obj.*` helpers — duplicated rather than depending on
        // pdfParserObj to keep this adapter slim (it's only used from
        // writers that already wired pdfParserObj independently).
        const obj = {
            name:   (v) => ({ type: 'name',   value: String(v) }),
            int:    (v) => ({ type: 'int',    value: v | 0 }),
            real:   (v) => ({ type: 'real',   value: +v }),
            bool:   (v) => ({ type: 'bool',   value: !!v }),
            string: (v) => ({ type: 'string', value: v }),
            array:  (items) => ({ type: 'array', items }),
            dict:   (entries) => ({ type: 'dict', entries }),
            stream: (dict, raw) => ({ type: 'stream', dict, raw }),
            nul:    () => ({ type: 'null' })
        };

        // --- WinAnsiEncoding (CP1252), ISO 32000-2 Annex D.2 -------------
        // Byte → code point for the 0x80..0x9F block; 0x20..0x7E and
        // 0xA0..0xFF are Latin-1 identity. Built inside the factory so the
        // descriptor stays capture-free (`fw/no-factory-capture`).
        const WIN_ANSI_HIGH = [
            0x20AC, null,   0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
            0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, null,   0x017D, null,
            null,   0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
            0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, null,   0x017E, 0x0178
        ];
        const WIN_ANSI_BYTE = new Map();   // codePoint → byte
        for (let b = 0x20; b <= 0x7E; b++) WIN_ANSI_BYTE.set(b, b);
        for (let i = 0; i < WIN_ANSI_HIGH.length; i++) {
            if (WIN_ANSI_HIGH[i] != null) WIN_ANSI_BYTE.set(WIN_ANSI_HIGH[i], 0x80 + i);
        }
        for (let b = 0xA0; b <= 0xFF; b++) WIN_ANSI_BYTE.set(b, b);

        function coerce(v) {
            if (v && typeof v === 'object' && typeof v.type === 'string') return v;
            if (typeof v === 'number') {
                return Number.isInteger(v) ? obj.int(v) : obj.real(v);
            }
            if (typeof v === 'boolean') return obj.bool(v);
            if (typeof v === 'string') {
                if (/^[A-Za-z][\w.-]{0,63}$/.test(v)) return obj.name(v);
                return obj.string(new TextEncoder().encode(v));
            }
            if (Array.isArray(v)) return obj.array(v.map(coerce));
            return obj.nul();
        }

        /**
         * Split a `buildFontDescriptor` POJO into the dict entries and the
         * raw font program. `FontName` is forced to a PDF name: a subset
         * name (`ABCDEF+Family`) is rejected by `coerce`'s name regex
         * because of the `+`, and would otherwise serialize as a string.
         */
        function splitDescriptor(desc) {
            const src = (desc && typeof desc === 'object') ? desc : {};
            const entries = {};
            let fontFile = null;
            let fontFileKey = 'FontFile2';
            for (const k of Object.keys(src)) {
                if (k === 'FontFile' || k === 'FontFile2' || k === 'FontFile3') {
                    fontFileKey = k;
                    fontFile = src[k];
                    continue;
                }
                entries[k] = (k === 'FontName') ? obj.name(src[k]) : coerce(src[k]);
            }
            if (!entries.Type) entries.Type = obj.name('FontDescriptor');
            return { descriptor: obj.dict(entries), fontFile, fontFileKey };
        }

        function wrapCidSysInfo(info) {
            if (!info || typeof info !== 'object') return obj.dict({});
            return obj.dict({
                Registry:   coerce(info.Registry   || 'Adobe'),
                Ordering:   coerce(info.Ordering   || 'Identity'),
                Supplement: coerce(info.Supplement != null ? info.Supplement : 0)
            });
        }

        function assertFont(parsedFont) {
            if (!parsedFont
                    || typeof parsedFont !== 'object'
                    || !parsedFont.unicodeMap
                    || typeof parsedFont.glyphIndexForCodePoint !== 'function'
                    || typeof parsedFont.advanceWidth !== 'function'
                    || !Number.isFinite(parsedFont.unitsPerEm)) {
                throw new ContractError('pdf/embed/bad-font',
                    'embed requires a parsed Font (unicodeMap, glyphIndexForCodePoint, advanceWidth, unitsPerEm)',
                    { context: { keys: parsedFont && typeof parsedFont === 'object'
                        ? Object.keys(parsedFont) : typeof parsedFont } });
            }
        }

        /** De-duplicate + sort, rejecting anything that is not a code point. */
        function normaliseCodePoints(codePoints) {
            if (codePoints == null || typeof codePoints[Symbol.iterator] !== 'function') {
                throw new ContractError('pdf/embed/bad-codepoints',
                    'codePoints must be an iterable of integer code points',
                    { context: { got: typeof codePoints } });
            }
            const seen = new Set();
            for (const cp of codePoints) {
                if (!Number.isInteger(cp) || cp < 0 || cp > 0x10FFFF) {
                    throw new ContractError('pdf/embed/bad-codepoints',
                        'codePoints must contain integer code points in [0, 0x10FFFF]',
                        { context: { cp } });
                }
                seen.add(cp);
            }
            if (seen.size === 0) {
                throw new ContractError('pdf/embed/bad-codepoints',
                    'codePoints must not be empty', { context: { size: 0 } });
            }
            return [...seen].sort((a, b) => a - b);
        }

        /** `subset.widths` is per NEW gid in font units — rescale to 1000/em. */
        function scaledWidthByCp(parsedFont, subset, cps) {
            const upem = parsedFont.unitsPerEm || 1000;
            const glyphMap = (subset.glyphMap instanceof Map) ? subset.glyphMap : new Map();
            const widths = Array.isArray(subset.widths) ? subset.widths : null;
            const out = new Map();
            for (const cp of cps) {
                const ng = glyphMap.get(cp);
                let raw;
                if (widths && ng != null && Number.isFinite(widths[ng])) {
                    raw = widths[ng];
                } else {
                    raw = parsedFont.advanceWidth(parsedFont.glyphIndexForCodePoint(cp));
                }
                out.set(cp, Math.round((raw * 1000) / upem));
            }
            return out;
        }

        /** Per NEW gid, in 1000/em — the source of the `/W` array. */
        function scaledWidthByGid(parsedFont, subset) {
            const upem = parsedFont.unitsPerEm || 1000;
            const out = new Map();
            if (Array.isArray(subset.widths)) {
                for (let g = 0; g < subset.widths.length; g++) {
                    if (Number.isFinite(subset.widths[g])) {
                        out.set(g, Math.round((subset.widths[g] * 1000) / upem));
                    }
                }
                return out;
            }
            const glyphMap = (subset.glyphMap instanceof Map) ? subset.glyphMap : new Map();
            for (const [cp, ng] of glyphMap) {
                const raw = parsedFont.advanceWidth(parsedFont.glyphIndexForCodePoint(cp));
                out.set(ng, Math.round((raw * 1000) / upem));
            }
            return out;
        }

        /** `[ c [w …] c [w …] … ]` — consecutive CIDs grouped into one run. */
        function compactWArray(byGid) {
            const gids = [...byGid.keys()].sort((a, b) => a - b);
            const items = [];
            let i = 0;
            while (i < gids.length) {
                const start = gids[i];
                const run = [byGid.get(gids[i])];
                let j = i + 1;
                while (j < gids.length && gids[j] === gids[j - 1] + 1) {
                    run.push(byGid.get(gids[j]));
                    j++;
                }
                items.push(obj.int(start));
                items.push(obj.array(run.map(w => obj.int(w))));
                i = j;
            }
            return obj.array(items);
        }

        function streamOfCmap(cmap) {
            const raw = (cmap instanceof Uint8Array)
                ? cmap
                : new TextEncoder().encode(String(cmap));
            return obj.stream(obj.dict({}), raw);
        }

        /**
         * A `/ToUnicode` CMap is keyed by the font's CHARACTER CODES, so the
         * two routes need different sources:
         *
         * - composite (`Identity-H`): the code IS the CID, i.e. the subset's
         *   new gid, which is exactly what `subset.toUnicodeCmap` is keyed by
         *   (`subsetForPdf` inverts `glyphMap` into `newGid → String.fromCodePoint(cp)`).
         *   Used as-is; the local builder is only the fallback for a subsetter that omits it.
         * - simple (`WinAnsiEncoding`): the codes are WinAnsi BYTES, so the
         *   subset's gid-keyed CMap would be plain wrong. The adapter builds
         *   the byte-keyed map and hands it to `embedBuildToUnicode`.
         *
         * Never both for one route — two CMaps over the same glyph set can
         * only diverge.
         */
        function toUnicodeStreamForCid(deps, subset) {
            if (subset.toUnicodeCmap != null) return streamOfCmap(subset.toUnicodeCmap);
            const gidToUnicode = new Map();
            const glyphMap = (subset.glyphMap instanceof Map) ? subset.glyphMap : new Map();
            for (const [cp, ng] of glyphMap) gidToUnicode.set(ng, String.fromCodePoint(cp));
            return streamOfCmap(deps.embedBuildToUnicode(gidToUnicode, {}));
        }

        function baseFontName(subset) {
            const n = subset && subset.postScriptName;
            return (typeof n === 'string' && n.length) ? n : 'Embedded';
        }

        function createEmbed(deps) {
            if (!deps
                    || typeof deps.subsetForPdf        !== 'function'
                    || typeof deps.buildFontDescriptor !== 'function'
                    || typeof deps.buildCidSystemInfo  !== 'function'
                    || typeof deps.embedBuildToUnicode !== 'function') {
                throw new ContractError('pdf/embed/missing-fonts-embed',
                    'createEmbed requires the @awacloud/fonts/embed-pdf factory output',
                    { context: { keys: deps && Object.keys(deps) } });
            }

            /**
             * The subset's descriptor already carries the font program; only
             * rebuild it when the subsetter omitted it entirely.
             */
            function descriptorOf(parsedFont, subset) {
                const raw = (subset.fontDescriptor && typeof subset.fontDescriptor === 'object')
                    ? subset.fontDescriptor
                    : deps.buildFontDescriptor(parsedFont, { subsetBytes: subset.subsetBytes });
                const split = splitDescriptor(raw);
                if (!split.fontFile && subset.subsetBytes instanceof Uint8Array) {
                    split.fontFile = subset.subsetBytes;
                }
                return split;
            }

            /**
             * Simple (non-composite) TrueType embedding with
             * `/WinAnsiEncoding`. Every code point must be representable in
             * CP1252 — a Unicode caller picks {@link embedCid} instead.
             *
             * The `/ToUnicode` CMap is built with a one-byte codespace (`<00> <FF>`),
             * matching the single-byte WinAnsi codes.
             *
             * @param {object} parsedFont Output of `fonts.read(bytes)`.
             * @param {Iterable<number>} codePoints
             * @param {object} [opts] Forwarded to `subsetForPdf`.
             */
            function embedSimple(parsedFont, codePoints, opts) {
                assertFont(parsedFont);
                const cps = normaliseCodePoints(codePoints);
                for (const cp of cps) {
                    if (!WIN_ANSI_BYTE.has(cp)) {
                        throw new ContractError('pdf/embed/not-winansi',
                            'embedSimple requires WinAnsi (CP1252)-representable code points; use embedCid',
                            { context: { cp } });
                    }
                }

                const subset = deps.subsetForPdf(parsedFont, cps, opts);
                const { descriptor, fontFile, fontFileKey } = descriptorOf(parsedFont, subset);

                const byteToUnicode = new Map();
                for (const cp of cps) byteToUnicode.set(WIN_ANSI_BYTE.get(cp), String.fromCodePoint(cp));
                const toUnicodeStream = streamOfCmap(deps.embedBuildToUnicode(byteToUnicode, { codeBytes: 1 }));

                const byCp = scaledWidthByCp(parsedFont, subset, cps);
                const bytes = cps.map(cp => WIN_ANSI_BYTE.get(cp));
                const firstChar = Math.min(...bytes);
                const lastChar  = Math.max(...bytes);
                const byByte = new Map();
                for (const cp of cps) byByte.set(WIN_ANSI_BYTE.get(cp), byCp.get(cp));
                const widths = [];
                for (let b = firstChar; b <= lastChar; b++) {
                    widths.push(obj.int(byByte.has(b) ? byByte.get(b) : 0));
                }

                const cpSet = new Set(cps);
                function encode(text) {
                    const out = [];
                    for (const ch of String(text)) {
                        const cp = ch.codePointAt(0);
                        if (!cpSet.has(cp) || !WIN_ANSI_BYTE.has(cp)) {
                            throw new ContractError('pdf/embed/not-winansi',
                                'code point is not part of this WinAnsi embedding',
                                { context: { cp } });
                        }
                        out.push(WIN_ANSI_BYTE.get(cp));
                    }
                    return Uint8Array.from(out);
                }
                function widthOf(cp) {
                    return byCp.has(cp) ? byCp.get(cp) : 0;
                }

                const fontDict = obj.dict({
                    Type:      obj.name('Font'),
                    Subtype:   obj.name('TrueType'),
                    BaseFont:  obj.name(baseFontName(subset)),
                    Encoding:  obj.name('WinAnsiEncoding'),
                    FirstChar: obj.int(firstChar),
                    LastChar:  obj.int(lastChar),
                    Widths:    obj.array(widths),
                    FontDescriptor: descriptor,
                    ToUnicode: toUnicodeStream
                });

                return {
                    subtype: 'TrueType',
                    fontDict,
                    descriptor,
                    toUnicodeStream,
                    fontFile,
                    fontFileKey,
                    encode,
                    widthOf,
                    codePoints: cps
                };
            }

            /**
             * Composite `/Type0` + `/Identity-H` embedding. The subset is
             * renumbered, so CID === new gid and `/CIDToGIDMap` is
             * `/Identity`.
             *
             * @param {object} parsedFont Output of `fonts.read(bytes)`.
             * @param {Iterable<number>} codePoints
             * @param {object} [opts] Forwarded to `subsetForPdf`.
             */
            function embedCid(parsedFont, codePoints, opts) {
                assertFont(parsedFont);
                const cps = normaliseCodePoints(codePoints);

                const subset = deps.subsetForPdf(parsedFont, cps, { ...(opts || {}), cid: true });
                const { descriptor, fontFile, fontFileKey } = descriptorOf(parsedFont, subset);
                const toUnicodeStream = toUnicodeStreamForCid(deps, subset);
                const cidSys = wrapCidSysInfo(deps.buildCidSystemInfo(parsedFont));

                const byCp  = scaledWidthByCp(parsedFont, subset, cps);
                const byGid = scaledWidthByGid(parsedFont, subset);
                const glyphMap = (subset.glyphMap instanceof Map) ? subset.glyphMap : new Map();

                function encode(text) {
                    const out = [];
                    for (const ch of String(text)) {
                        const cp = ch.codePointAt(0);
                        let gid = glyphMap.get(cp);
                        if (gid == null) { gid = 0; encode.missing++; }
                        out.push((gid >> 8) & 0xFF, gid & 0xFF);
                    }
                    return Uint8Array.from(out);
                }
                encode.missing = 0;
                function widthOf(cp) {
                    return byCp.has(cp) ? byCp.get(cp) : 0;
                }

                const baseFont = baseFontName(subset);
                const cidFontDict = obj.dict({
                    Type:           obj.name('Font'),
                    Subtype:        obj.name('CIDFontType2'),
                    BaseFont:       obj.name(baseFont),
                    CIDSystemInfo:  cidSys,
                    FontDescriptor: descriptor,
                    DW:             obj.int(1000),
                    W:              compactWArray(byGid),
                    CIDToGIDMap:    obj.name('Identity')
                });
                const type0Dict = obj.dict({
                    Type:            obj.name('Font'),
                    Subtype:         obj.name('Type0'),
                    BaseFont:        obj.name(baseFont),
                    Encoding:        obj.name('Identity-H'),
                    DescendantFonts: obj.array([cidFontDict]),
                    ToUnicode:       toUnicodeStream
                });

                return {
                    type0Dict,
                    cidFontDict,
                    descriptor,
                    toUnicodeStream,
                    fontFile,
                    fontFileKey,
                    encode,
                    widthOf,
                    codePoints: cps
                };
            }

            return { embedSimple, embedCid };
        }

        return createEmbed(fontsEmbedPdf);
    }
};
