// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A bare CFF program as a font (module `fontCffProgram`):
 * `readCff(bytes)`, for a PDF's `/FontFile3` of subtype `Type1C` or
 * `CIDFontType0C` (ISO 32000-2 §9.9), or any CFF data outside an sfnt.
 *
 *  - The first font of the CFF (a PDF program holds one), read by
 *    `tableCff.parseCff`: `{ fontName, fontMatrix, fontBBox, cidKeyed,
 *    encoding, glyphNames, cids, numGlyphs, glyph(gid), gidOfName(name),
 *    gidOfCid(cid) }`. `glyphNames` and `encoding` (256 glyph names,
 *    `null` an empty slot) are a name-keyed font's, `cids` a CID-keyed
 *    one's (`null` otherwise).
 *  - `glyph(gid)` gives `{ gid, name, cid, advanceWidth, path, fontMatrix }`
 *    or `null` past the glyphs:
 *    - the charstring is decoded with its Private DICT (its Font DICT's
 *      for a CID-keyed font) and the subroutines;
 *    - the advance is the charstring's width (plus `nominalWidthX`), else
 *      `defaultWidthX`;
 *    - every contour is closed (`Z`), as Type 2 contours are;
 *    - a `seac` is drawn as its base and its accent moved by (adx, ady),
 *      found by their `StandardEncoding` names, whichever the font holds;
 *    - `fontMatrix` is the Top DICT's (default `[0.001 0 0 0.001 0 0]`); a
 *      CID-keyed glyph whose Font DICT has a matrix gets that matrix, times
 *      the Top DICT's when the Top DICT states one.
 *  - Errors: bytes that are not a `Uint8Array` throw `ContractError`
 *    `fonts/cff-bad-input`; a font without CharStrings, `ParseError`
 *    `fonts/cff-no-charstrings`; `parseCff`'s errors and the charstring
 *    decoder's (`fonts/cff-cs-*`, on `glyph(gid)`) are thrown as they are.
 *
 * Strict factory body, capture-free, worker-safe.
 *
 * @module fonts/type1/cff
 */

import { fontErrors } from '../errors.js';
import { tableCff } from '../table/cff.js';
import { encodingStandard } from '../encodings/standard.js';

export const fontCffProgram = {
    name: 'fontCffProgram',
    dependencies: ['fontErrors', 'tableCff', 'encodingStandard'],
    deps: [fontErrors, tableCff, encodingStandard],
    factory(errors, cffMod, standard) {
        const { ParseError, ContractError } = errors;
        const { parseCff, decodeCharstring, privateForGlyph } = cffMod;
        const { STANDARD } = standard;
        const DEFAULT_MATRIX = Object.freeze([0.001, 0, 0, 0.001, 0, 0]);

        const nums = (v, n) => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number') ? v.slice() : null);
        const one = (dict, op, dflt) => { const v = dict && dict.get(op); return v && v.length === 1 && typeof v[0] === 'number' ? v[0] : dflt; };
        /** `m` then `t` (PostScript concatenation). */
        function concat(m, t) {
            return [
                m[0] * t[0] + m[1] * t[2], m[0] * t[1] + m[1] * t[3],
                m[2] * t[0] + m[3] * t[2], m[2] * t[1] + m[3] * t[3],
                m[4] * t[0] + m[5] * t[2] + t[4], m[4] * t[1] + m[5] * t[3] + t[5]
            ];
        }
        /** Type 2 contours are closed: a `Z` before each later `M`, and at the end. */
        function closed(cmds) {
            const out = [];
            let open = false;
            for (const c of cmds) {
                if (c.type === 'M' && open) out.push({ type: 'Z' });
                out.push(c);
                if (c.type === 'M') open = true;
            }
            if (open) out.push({ type: 'Z' });
            return out;
        }
        function shift(c, dx, dy) {
            if (c.type === 'Z') return c;
            if (c.type === 'C') return { type: 'C', x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy, x: c.x + dx, y: c.y + dy };
            return { type: c.type, x: c.x + dx, y: c.y + dy };
        }

        /** @param {Uint8Array} bytes */
        function readCff(bytes) {
            if (!(bytes instanceof Uint8Array)) throw new ContractError('fonts/cff-bad-input', 'readCff takes a Uint8Array');
            const set = parseCff(bytes);
            const font = set.fonts[0];
            if (!font || !font.charStringsIndex || font.charStringsIndex.count === 0) {
                throw new ParseError('fonts/cff-no-charstrings', 'the CFF font has no CharStrings INDEX');
            }
            const top = font.topDict;
            const cidKeyed = top.has(0x0C1E);
            const numGlyphs = font.charStringsIndex.count;
            const topMatrix = nums(top.get(0x0C07), 6);
            const fontMatrix = topMatrix || DEFAULT_MATRIX.slice();
            const fontBBox = nums(top.get(5), 4) || [0, 0, 0, 0];
            const glyphNames = cidKeyed ? null : font.glyphNames ? font.glyphNames.slice() : null;
            const cids = cidKeyed && font.charset ? Array.from(font.charset) : null;
            const byName = new Map();
            if (glyphNames) glyphNames.forEach((n, gid) => { if (!byName.has(n)) byName.set(n, gid); });
            const byCid = new Map();
            if (cids) cids.forEach((c, gid) => { if (!byCid.has(c)) byCid.set(c, gid); });
            const globalSubrs = set.globalSubrIndex ? set.globalSubrIndex.items : [];

            function matrixOf(gid) {
                if (!cidKeyed || !font.fdArray || !font.fdSelect) return fontMatrix.slice();
                const fd = font.fdArray[font.fdSelect[gid]];
                const m = fd ? nums(fd.fontDict.get(0x0C07), 6) : null;
                if (!m) return fontMatrix.slice();
                return topMatrix ? concat(m, topMatrix) : m;
            }

            function decode(gid) {
                const { privateDict, localSubrIndex } = privateForGlyph(font, gid);
                const out = decodeCharstring(font.charStringsIndex.items[gid], {
                    globalSubrs,
                    localSubrs: localSubrIndex ? localSubrIndex.items : [],
                    nominalWidthX: one(privateDict, 21, 0),
                    defaultWidthX: one(privateDict, 20, 0)
                });
                const width = out.width ?? one(privateDict, 20, 0);
                return { width, commands: closed(out.commands), seac: out.seac };
            }

            const cache = new Map();
            function glyph(gid) {
                if (!Number.isInteger(gid) || gid < 0 || gid >= numGlyphs) return null;
                if (cache.has(gid)) return cache.get(gid);
                const d = decode(gid);
                const path = d.commands;
                if (d.seac) {
                    const part = (code) => {
                        const g = byName.get(STANDARD[code & 0xFF]);
                        return g === undefined || g === gid ? null : decode(g).commands;
                    };
                    const base = part(d.seac.bchar), accent = part(d.seac.achar);
                    if (base) path.push(...base);
                    if (accent) for (const c of accent) path.push(shift(c, d.seac.adx, d.seac.ady));
                }
                const g = {
                    gid,
                    name: glyphNames ? glyphNames[gid] ?? null : null,
                    cid: cids ? cids[gid] ?? null : null,
                    advanceWidth: d.width,
                    path,
                    fontMatrix: matrixOf(gid)
                };
                cache.set(gid, g);
                return g;
            }

            return {
                fontName: font.name ?? null,
                fontMatrix,
                fontBBox,
                cidKeyed,
                encoding: cidKeyed ? null : font.encoding ? font.encoding.slice() : null,
                glyphNames,
                cids,
                numGlyphs,
                glyph,
                gidOfName: (n) => byName.get(n) ?? -1,
                gidOfCid: (c) => byCid.get(c) ?? -1
            };
        }

        return { readCff };
    }
};
