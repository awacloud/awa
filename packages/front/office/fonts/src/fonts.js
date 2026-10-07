// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `fonts` — top-level orchestrator. Reads a TTF / OTF byte
 * stream and returns a navigable `Font` object — strict factory body.
 *
 * The `Font` exposes:
 *
 * ```js
 * {
 *     flavor: 'truetype' | 'opentype',
 *     head, hhea, maxp, hmtx, name, os2, post,
 *     numGlyphs,
 *     unitsPerEm,
 *     cmap,                   // parsed (with .encodings + maps)
 *     glyphTable,             // raw glyf parse output (array of glyph objects)
 *     loca,                   // Uint32Array offsets
 *     names: { family, subfamily, fullName, postScriptName, ... },
 *     unicodeMap,             // Map<codePoint, gid>
 *     getGlyphByIndex(gid)    // -> Glyph
 *     getGlyphByCodePoint(cp) // -> Glyph
 *     advanceWidth(gid),
 * }
 * ```
 *
 * This orchestrator only reads: encoding lives in the per-table
 * `encode<Name>` functions, `embed-pdf/subsetForPdf` and
 * `extra/woff2-write`. It assembles the TrueType (`glyf`) outline model;
 * for an OTF font with CFF outlines `glyphTable` / `loca` are `null` and
 * every `Glyph.path` is `null` — CFF CharStrings are parsed by the
 * separate `table/cff` modules, which `fonts.read` does not call.
 *
 * @module fonts/fonts
 */

/**
 * @worker-safe
 *
 * Strict factory body — all dependencies wired via DI. Worker-safe when
 * its 14 dependencies are themselves resolved through a `ModuleRuntime`.
 */
import { fontErrors } from './errors.js';
import { fontSfnt } from './sfnt/sfnt.js';
import { tableHead } from './table/head.js';
import { tableHhea } from './table/hhea.js';
import { tableMaxp } from './table/maxp.js';
import { tableHmtx } from './table/hmtx.js';
import { tableCmap } from './table/cmap.js';
import { tableName } from './table/name.js';
import { tableOs2 } from './table/os2.js';
import { tablePost } from './table/post.js';
import { tableLoca } from './table/loca.js';
import { tableGlyf } from './table/glyf.js';
import { tableGvar } from './table/gvar.js';
import { fontGlyph } from './glyph/glyph.js';
import { fontCompositeResolve } from './glyph/compositeResolve.js';

export const fonts = {
    name: 'fonts',
    dependencies: [
        'fontErrors',
        'fontSfnt',
        'tableHead', 'tableHhea', 'tableMaxp', 'tableHmtx',
        'tableCmap', 'tableName', 'tableOs2', 'tablePost',
        'tableLoca', 'tableGlyf', 'tableGvar',
        'fontGlyph', 'fontCompositeResolve'
    ],
    deps: [fontErrors, fontSfnt, tableHead, tableHhea, tableMaxp, tableHmtx, tableCmap, tableName, tableOs2, tablePost, tableLoca, tableGlyf, tableGvar, fontGlyph, fontCompositeResolve],
    factory(
        errors,
        sfntMod,
        headMod, hheaMod, maxpMod, hmtxMod,
        cmapMod, nameMod, os2Mod, postMod,
        locaMod, glyfMod, gvarMod,
        glyphMod, compositeResolveMod
    ) {
        /** Hooks recognised by `.use()` extension modules. */
        const KNOWN_HOOKS = [
            'hydrateFont', 'dehydrateFont',
            'hydrateGlyph', 'dehydrateGlyph',
            'hydrateTable', 'dehydrateTable',
            'hydrateName', 'dehydrateName'
        ];

        const { ContractError, ParseError } = errors;
        const { parseSfnt, SFNT_FLAVOR } = sfntMod;
        const { parseHead } = headMod;
        const { parseHhea } = hheaMod;
        const { parseMaxp } = maxpMod;
        const { parseHmtx } = hmtxMod;
        const { parseCmap, pickUnicodeMap } = cmapMod;
        const { parseName, getNameString, NAME_ID } = nameMod;
        const { parseOs2 } = os2Mod;
        const { parsePost } = postMod;
        const { parseLoca } = locaMod;
        const { parseGlyf } = glyfMod;
        const { parseGvar } = gvarMod;
        const { Glyph } = glyphMod;
        const { resolveGlyphPath } = compositeResolveMod;

        function buildFont(sfnt) {
            if (!sfnt.tables.head) throw new ParseError('fonts/missing-head', 'font is missing the required `head` table');
            if (!sfnt.tables.maxp) throw new ParseError('fonts/missing-maxp', 'font is missing the required `maxp` table');
            if (!sfnt.tables.hhea) throw new ParseError('fonts/missing-hhea', 'font is missing the required `hhea` table');
            if (!sfnt.tables.hmtx) throw new ParseError('fonts/missing-hmtx', 'font is missing the required `hmtx` table');
            if (!sfnt.tables.cmap) throw new ParseError('fonts/missing-cmap', 'font is missing the required `cmap` table');
            if (!sfnt.tables.name) throw new ParseError('fonts/missing-name', 'font is missing the required `name` table');

            const head = parseHead(sfnt.tables.head.bytes);
            const maxp = parseMaxp(sfnt.tables.maxp.bytes);
            const hhea = parseHhea(sfnt.tables.hhea.bytes);
            const hmtx = parseHmtx(sfnt.tables.hmtx.bytes, hhea.numberOfHMetrics, maxp.numGlyphs);
            const cmap = parseCmap(sfnt.tables.cmap.bytes);
            const nameTable = parseName(sfnt.tables.name.bytes);
            const os2  = sfnt.tables['OS/2'] ? parseOs2(sfnt.tables['OS/2'].bytes) : null;
            const post = sfnt.tables.post   ? parsePost(sfnt.tables.post.bytes, maxp.numGlyphs) : null;

            let loca = null;
            let glyphTable = null;
            if (sfnt.tables.loca && sfnt.tables.glyf) {
                loca = parseLoca(sfnt.tables.loca.bytes, maxp.numGlyphs, head.indexToLocFormat);
                glyphTable = parseGlyf(sfnt.tables.glyf.bytes, loca);
            }

            const unicodeMap = pickUnicodeMap(cmap) || new Map();

            // Cross-table validation — defensive checks that a font's
            // cross-references are internally consistent. Without these a
            // malicious font can produce out-of-range glyph indices that only
            // surface later (or not at all) at render time.
            const numGlyphs = maxp.numGlyphs;
            // cmap → numGlyphs
            for (const [cp, gid] of unicodeMap) {
                if (gid >= numGlyphs) {
                    throw new ParseError('fonts/inconsistent-tables',
                        `cmap maps U+${cp.toString(16)} to glyph ${gid} but numGlyphs=${numGlyphs}`,
                        { context: { codePoint: cp, gid, numGlyphs } });
                }
            }
            // composite glyf → numGlyphs (width check; depth handled by compositeResolve)
            if (glyphTable) {
                for (let gid = 0; gid < glyphTable.length; gid++) {
                    const g = glyphTable[gid];
                    if (!g || g.kind !== 'composite') continue;
                    for (const comp of g.components) {
                        if (comp.glyphIndex >= numGlyphs) {
                            throw new ParseError('fonts/inconsistent-tables',
                                `composite glyph ${gid} references component glyph ${comp.glyphIndex} but numGlyphs=${numGlyphs}`,
                                { context: { gid, componentIndex: comp.glyphIndex, numGlyphs } });
                        }
                    }
                }
            }
            // gvar.glyphCount → numGlyphs (self-declared count, same class of
            // cross-table check already applied to cmap gids above; per OT
            // §10.6.5 gvar.glyphCount MUST equal maxp.numGlyphs).
            if (sfnt.tables.gvar) {
                const gvar = parseGvar(sfnt.tables.gvar.bytes);
                if (gvar.glyphCount !== numGlyphs) {
                    throw new ParseError('fonts/inconsistent-tables',
                        `gvar declares glyphCount=${gvar.glyphCount} but numGlyphs=${numGlyphs}`,
                        { context: { gvarGlyphCount: gvar.glyphCount, numGlyphs } });
                }
            }

            const names = {
                family:         getNameString(nameTable, NAME_ID.FONT_FAMILY),
                subfamily:      getNameString(nameTable, NAME_ID.FONT_SUBFAMILY),
                fullName:       getNameString(nameTable, NAME_ID.FULL_NAME),
                postScriptName: getNameString(nameTable, NAME_ID.POSTSCRIPT_NAME),
                version:        getNameString(nameTable, NAME_ID.VERSION),
                copyright:      getNameString(nameTable, NAME_ID.COPYRIGHT),
                manufacturer:   getNameString(nameTable, NAME_ID.MANUFACTURER),
                designer:       getNameString(nameTable, NAME_ID.DESIGNER)
            };

            const font = {
                flavor: sfnt.flavor,
                sfntVersion: sfnt.sfntVersion,
                rawSfnt: sfnt,
                head, hhea, maxp, hmtx, cmap, name: nameTable, os2, post,
                loca, glyphTable,
                names,
                numGlyphs: maxp.numGlyphs,
                unitsPerEm: head.unitsPerEm,
                unicodeMap,

                advanceWidth(gid) {
                    if (gid < 0 || gid >= maxp.numGlyphs) return 0;
                    return hmtx.metrics[gid].advanceWidth;
                },

                leftSideBearing(gid) {
                    if (gid < 0 || gid >= maxp.numGlyphs) return 0;
                    return hmtx.metrics[gid].lsb;
                },

                /**
                 * Lookup a code-point in the cmap. Returns `0` (`.notdef`) when
                 * the code-point is absent — semantically ambiguous since `0`
                 * is also a valid gid. Pass `{ strict: true }` to instead
                 * receive `-1` for "not found".
                 *
                 * @param {number} cp
                 * @param {{ strict?: boolean }} [opts]
                 */
                glyphIndexForCodePoint(cp, opts) {
                    const gid = unicodeMap.get(cp);
                    if (gid !== undefined) return gid;
                    return (opts && opts.strict) ? -1 : 0;
                },

                getGlyphByIndex(gid) {
                    if (gid < 0 || gid >= maxp.numGlyphs)
                        throw new ContractError('fonts/bad-gid',
                            `glyph index ${gid} out of range (numGlyphs=${maxp.numGlyphs})`,
                            { context: { gid, numGlyphs: maxp.numGlyphs } });
                    const entry = glyphTable ? glyphTable[gid] : null;
                    const psName = post && post.glyphNames ? post.glyphNames[gid] : undefined;
                    const m = hmtx.metrics[gid];
                    const path = entry ? resolveGlyphPath(glyphTable, gid) : null;
                    const bbox = entry ? entry.bbox : null;
                    const components = entry && entry.kind === 'composite' ? entry.components : null;
                    return new Glyph({
                        id: gid, name: psName,
                        advanceWidth: m.advanceWidth, lsb: m.lsb,
                        bbox, path, components
                    });
                },

                getGlyphByCodePoint(cp) {
                    const gid = font.glyphIndexForCodePoint(cp);
                    return font.getGlyphByIndex(gid);
                }
            };

            return font;
        }

        const extensions = [];
        function notify(hook, payload) {
            for (const ext of extensions) {
                if (typeof ext[hook] === 'function') ext[hook](payload);
            }
        }
        function read(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ContractError('fonts/read-input', 'fonts.read expects Uint8Array',
                    { context: { actual: typeof bytes } });
            const sfnt = parseSfnt(bytes);
            const font = buildFont(sfnt);
            notify('hydrateFont', font);
            return font;
        }
        function use(...exts) {
            for (const ext of exts) {
                if (!ext || typeof ext !== 'object') continue;
                if (extensions.includes(ext)) continue;   // idempotent
                extensions.push(ext);
            }
            return api;
        }
        const api = { read, use, buildFont, KNOWN_HOOKS, SFNT_FLAVOR };
        return api;
    }
};
