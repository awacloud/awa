// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Embedded font programs drawn from their own outlines.
 * `@awacloud/fonts` reads the program; this module maps each PDF character
 * code to a glyph and turns the outline into a `Path2D` (`loadProgram`,
 * which the painter calls):
 *
 *  - **`/FontFile2`** (TrueType, `loadTrueType`): ISO 32000-2 §9.6.5.4 for
 *    simple fonts, the `/CIDToGIDMap` for CIDFontType2;
 *  - **`/FontFile`** (Type 1, `fontType1`) and **`/FontFile3` `Type1C`**
 *    (a bare CFF, `fontCffProgram`) for a simple font: the code's glyph
 *    name by §9.6.6 (`/Encoding` a name, or its `/BaseEncoding` and
 *    `/Differences` over the program's built-in encoding, which is also
 *    the encoding without an `/Encoding`), then the glyph of that name;
 *  - **`/FontFile3` `CIDFontType0C`** for a Type0 font: the code's CID
 *    (`cidMapOf`), its glyph the charset's (the glyph index of a
 *    name-keyed program);
 *  - **`/FontFile3` `OpenType`**: a `glyf` font as TrueType, a `CFF `
 *    table as the bare CFF.
 *
 * A Type 1 or CFF glyph is drawn through the program's font matrix:
 * `scale` when it is uniform, else `transformOf(code)` (a CID-keyed
 * glyph's Font DICT matrix too). Drawing the font's own glyphs is exact
 * whatever the program's tables hold — subset fonts, symbol fonts, glyphs
 * with no Unicode. A Type0 font's code → CID (`cidMapOf`, ISO 32000-2
 * §9.7.5) is the code itself under `Identity-H` / `-V`, and an embedded
 * CMap stream's mapping (`@awacloud/fonts`' `cmapCid`) with its
 * `/UseCMap` parent under it, each code at the length the decoder's
 * `split` read it (a codespace of 1 and 2 bytes included). A font this
 * module cannot use (a predefined CMap by another name, a damaged
 * program) returns `null` and the painter falls back to a system face.
 *
 * @module oview/render/pdf/glyphs
 */
import { arr, deref, entries, get, name, num } from './objects.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */

/**
 * The `@awacloud/fonts` readers this module needs (resolved instances, see
 * `core/runtime.js`); `type1`, `cff` and `encodings` (`fontType1`,
 * `fontCffProgram`, `encodingLookup`) for the Type 1 and CFF programs;
 * `cidCMap` (`cmapCid`) for a composite font's embedded CMap.
 * @typedef {{sfnt: any, head: any, maxp: any, loca: any, glyf: any, cmap: any, composite: any, type1?: any, cff?: any, encodings?: any, cidCMap?: any}} FontKit
 */

/** @param {string|null} n */
const identityCMap = (n) => n === 'Identity-H' || n === 'Identity-V';

/**
 * A Type0 font's code → CID map (ISO 32000-2 §9.7.5): under `Identity-H`
 * / `-V` the code itself; under an embedded CMap stream, its mapping
 * (`cmapCid`) over its parent — the stream dictionary's `/UseCMap` (a
 * stream, read the same way, at most four deep; an Identity CMap by
 * name), else the text's `usecmap` when it names an Identity CMap. A code
 * the CMap does not map has no CID; a code is its value and its length
 * (2 by default), as the decoder's `split` reads it. `null` when the map
 * is unknown: a predefined CMap by another name (none is bundled), a CMap
 * with no codespace, a stream that does not read.
 * @param {PdfObj} fontDict
 * @param {import('./objects.js').Resolve} resolve
 * @param {{decode: (s: PdfObj) => Uint8Array}} filters
 * @param {FontKit} kit
 * @returns {((code: number, length?: number) => number|null)|null}
 */
export function cidMapOf(fontDict, resolve, filters, kit) {
    const enc = deref(get(fontDict, 'Encoding', resolve), resolve);
    if (enc && enc.type === 'name') return identityCMap(/** @type {string} */ (enc.value)) ? (code) => code : null;
    if (!enc || enc.type !== 'stream' || !kit.cidCMap) return null;
    const cmaps = kit.cidCMap;
    /** @param {PdfObj} stream @param {number} depth @returns {{cmap: any, identity: boolean}|null} */
    const read = (stream, depth) => {
        const own = cmaps.parseCidCMap(new TextDecoder('latin1').decode(filters.decode(stream)));
        const use = deref(get(stream, 'UseCMap', resolve), resolve);
        if (use && use.type === 'stream') {
            const parent = depth < 3 ? read(use, depth + 1) : null;
            return parent ? { cmap: cmaps.chain(parent.cmap, own), identity: parent.identity } : null;
        }
        const named = use && use.type === 'name' ? /** @type {string} */ (use.value) : (use ? null : own.useCMap);
        return { cmap: own, identity: identityCMap(named) };
    };
    let r;
    try { r = read(enc, 0); } catch { return null; }
    if (!r) return null;
    const { cmap, identity } = r;
    if (!cmap.codespace.length && !identity) return null;
    return (code, length = 2) => {
        const cid = cmaps.cidOf(cmap, code, length);
        return cid !== null ? cid : identity && length === 2 ? code : null;
    };
}

/**
 * A `Path2D` from `@awacloud/fonts` path commands (font units, y up).
 * @param {{type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number}[]} commands
 */
function toPath2D(commands) {
    const p = new Path2D();
    for (const c of commands) {
        switch (c.type) {
            case 'M': p.moveTo(/** @type {number} */ (c.x), /** @type {number} */ (c.y)); break;
            case 'L': p.lineTo(/** @type {number} */ (c.x), /** @type {number} */ (c.y)); break;
            case 'Q': p.quadraticCurveTo(/** @type {number} */ (c.x1), /** @type {number} */ (c.y1), /** @type {number} */ (c.x), /** @type {number} */ (c.y)); break;
            case 'C': p.bezierCurveTo(/** @type {number} */ (c.x1), /** @type {number} */ (c.y1), /** @type {number} */ (c.x2), /** @type {number} */ (c.y2), /** @type {number} */ (c.x), /** @type {number} */ (c.y)); break;
            case 'Z': p.closePath(); break;
            default: break;
        }
    }
    return p;
}

/**
 * A `code → Map(code → gid)` lookup over a parsed `cmap`.
 * @param {any} cmap `tableCmap.parseCmap` output
 * @param {number} platform
 * @param {number} encoding
 * @returns {Map<number, number>|null}
 */
function subtable(cmap, platform, encoding) {
    const rec = (cmap?.encodings || []).find((e) => e.platformID === platform && e.encodingID === encoding);
    return rec?.subtable?.map instanceof Map ? rec.subtable.map : null;
}

/**
 * Load the outlines of an embedded TrueType font.
 *
 * @param {PdfObj} fontDict the PDF font dictionary (Type0 or simple)
 * @param {import('./objects.js').Resolve} resolve
 * @param {{decode: (s: PdfObj) => Uint8Array}} filters
 * @param {FontKit} kit
 * @param {(code: number) => (string|null)} unicodeOf the decoder's `decode`
 * @param {Uint8Array|null} [program] the program's bytes (an OpenType
 *   `/FontFile3`), instead of the descriptor's `/FontFile2`
 * @returns {{glyph: (code: number, length?: number) => Path2D|null, scale: number}|null}
 */
export function loadTrueType(fontDict, resolve, filters, kit, unicodeOf, program = null) {
    const e = entries(fontDict) || {};
    const subtype = name(deref(e.Subtype, resolve));
    let descriptor;
    let cid = null;
    if (subtype === 'Type0') {
        const cidOf = cidMapOf(fontDict, resolve, filters, kit);
        if (!cidOf) return null;
        const descendant = arr(deref(e.DescendantFonts, resolve), resolve)?.[0] || null;
        if (name(get(descendant, 'Subtype', resolve)) !== 'CIDFontType2' && !program) return null;
        descriptor = get(descendant, 'FontDescriptor', resolve);
        const map = get(descendant, 'CIDToGIDMap', resolve);
        let table = null;
        if (map && map.type === 'stream') { try { table = filters.decode(map); } catch { return null; } }
        cid = { table, cidOf };
    } else if (subtype === 'TrueType' || program) {
        descriptor = get(fontDict, 'FontDescriptor', resolve);
    } else {
        return null;
    }
    const stream = program ? null : get(descriptor, 'FontFile2', resolve);
    if (!program && (!stream || stream.type !== 'stream')) return null;

    let glyphs;
    let unitsPerEm;
    let cmap = null;
    try {
        const bytes = program || filters.decode(/** @type {PdfObj} */ (stream));
        const font = kit.sfnt.parseSfnt(bytes);
        const t = font.tables;
        if (!t.head || !t.maxp || !t.loca || !t.glyf) return null;
        const head = kit.head.parseHead(t.head.bytes);
        const maxp = kit.maxp.parseMaxp(t.maxp.bytes);
        const loca = kit.loca.parseLoca(t.loca.bytes, maxp.numGlyphs, head.indexToLocFormat);
        glyphs = kit.glyf.parseGlyf(t.glyf.bytes, loca);
        unitsPerEm = head.unitsPerEm || 1000;
        if (t.cmap) { try { cmap = kit.cmap.parseCmap(t.cmap.bytes); } catch { cmap = null; } }
    } catch {
        return null;
    }

    const flags = num(get(descriptor, 'Flags', resolve)) || 0;
    const symbolic = (flags & 4) !== 0;
    const ms30 = subtable(cmap, 3, 0);
    const ms31 = subtable(cmap, 3, 1);
    const mac10 = subtable(cmap, 1, 0);

    /** @param {number} code @param {number} [length] @returns {number|null} */
    function gidOf(code, length) {
        if (cid) {
            const c = cid.cidOf(code, length);
            if (c === null) return null;
            if (!cid.table) return c;                    // /Identity
            const i = c * 2;
            return i + 1 < cid.table.length ? (cid.table[i] << 8) | cid.table[i + 1] : null;
        }
        // Simple TrueType (§9.6.5.4): a non-symbolic font maps through
        // Unicode (3,1); a symbolic one through (3,0) at 0xF0xx, then (1,0).
        if (!symbolic && ms31) {
            const u = unicodeOf(code);
            const cp = u ? u.codePointAt(0) : undefined;
            if (cp !== undefined && ms31.has(cp)) return /** @type {number} */ (ms31.get(cp));
        }
        if (ms30) {
            for (const c of [code, 0xf000 | code, 0xf100 | code, 0xf200 | code]) if (ms30.has(c)) return /** @type {number} */ (ms30.get(c));
        }
        if (mac10 && mac10.has(code)) return /** @type {number} */ (mac10.get(code));
        if (ms31) {
            const u = unicodeOf(code);
            const cp = u ? u.codePointAt(0) : undefined;
            if (cp !== undefined && ms31.has(cp)) return /** @type {number} */ (ms31.get(cp));
        }
        // A subset program without a usable cmap: codes are often glyph ids.
        return !cmap ? code : null;
    }

    /** @type {Map<number, Path2D|null>} */
    const cache = new Map();
    return {
        scale: 1 / unitsPerEm,
        glyph(code, length) {
            const gid = gidOf(code, length);
            if (gid === null || gid <= 0 || gid >= glyphs.length) return null;
            if (cache.has(gid)) return /** @type {Path2D|null} */ (cache.get(gid));
            let path;
            try {
                const commands = kit.composite.resolveGlyphPath(glyphs, gid).commands;
                path = commands.length ? toPath2D(commands) : null;
            } catch { path = null; }
            cache.set(gid, path);
            return path;
        }
    };
}

/** True when a font matrix is a uniform scale and nothing else. */
const uniform = (m) => m[1] === 0 && m[2] === 0 && m[4] === 0 && m[5] === 0 && m[0] === m[3] && m[0] > 0;

/**
 * A simple font's code → glyph name table (ISO 32000-2 §9.6.6): `/Encoding`
 * a name, or a dictionary's `/BaseEncoding` (else the program's built-in
 * encoding) with its `/Differences`; no `/Encoding`, the built-in one.
 * @param {PdfObj} fontDict
 * @param {import('./objects.js').Resolve} resolve
 * @param {(string|null)[]|null} builtIn
 * @param {any} encodings `encodingLookup`
 * @returns {(string|null)[]}
 */
export function codeNames(fontDict, resolve, builtIn, encodings) {
    const base = builtIn ? builtIn.slice() : new Array(256).fill(null);
    /** @param {string} n */
    const named = (n) => {
        try { return encodings.lookupEncoding(n).map((/** @type {string} */ g) => (g === '.notdef' ? null : g)); } catch { return null; }
    };
    const enc = deref(get(fontDict, 'Encoding', resolve), resolve);
    if (!enc) return base;
    if (enc.type === 'name') return named(/** @type {string} */ (enc.value)) || base;
    if (enc.type !== 'dict') return base;
    const be = name(get(enc, 'BaseEncoding', resolve));
    const table = (be && named(be)) || base;
    const diffs = arr(get(enc, 'Differences', resolve), resolve) || [];
    let code = 0;
    for (const d of diffs) {
        if (d.type === 'int' || d.type === 'real') code = Math.trunc(/** @type {number} */ (d.value));
        else if (d.type === 'name') { if (code >= 0 && code < 256) table[code] = /** @type {string} */ (d.value); code++; }
    }
    return table;
}

/**
 * The outlines of a font, by its descriptor's program: `/FontFile2`
 * (TrueType), `/FontFile` (Type 1), `/FontFile3` (`Type1C`,
 * `CIDFontType0C`, `OpenType`). `null` when the program cannot be used.
 * @param {PdfObj} fontDict
 * @param {import('./objects.js').Resolve} resolve
 * @param {{decode: (s: PdfObj) => Uint8Array}} filters
 * @param {FontKit} kit
 * @param {(code: number) => (string|null)} unicodeOf
 * @returns {{glyph: (code: number, length?: number) => Path2D|null, scale: number, transformOf?: (code: number, length?: number) => number[]|null}|null}
 */
export function loadProgram(fontDict, resolve, filters, kit, unicodeOf) {
    const e = entries(fontDict) || {};
    const subtype = name(deref(e.Subtype, resolve));
    let descriptor;
    /** @type {((code: number, length?: number) => number|null)|null} */
    let cidOf = null;
    if (subtype === 'Type0') {
        cidOf = cidMapOf(fontDict, resolve, filters, kit);
        if (!cidOf) return null;
        const descendant = arr(deref(e.DescendantFonts, resolve), resolve)?.[0] || null;
        descriptor = get(descendant, 'FontDescriptor', resolve);
    } else {
        descriptor = get(fontDict, 'FontDescriptor', resolve);
    }
    if (get(descriptor, 'FontFile2', resolve)) return loadTrueType(fontDict, resolve, filters, kit, unicodeOf);
    if (!kit.type1 || !kit.cff || !kit.encodings) return null;
    try {
        const t1 = get(descriptor, 'FontFile', resolve);
        if (t1 && t1.type === 'stream') {
            if (cidOf) return null;
            const length1 = num(get(t1, 'Length1', resolve)), length2 = num(get(t1, 'Length2', resolve));
            const font = kit.type1.readType1(filters.decode(t1), { length1: length1 ?? undefined, length2: length2 ?? undefined });
            const names = codeNames(fontDict, resolve, font.encoding, kit.encodings);
            return outlinesOf(font.fontMatrix, (code) => {
                const n = names[code & 0xff];
                const g = n && n !== '.notdef' ? font.glyph(n) : null;
                return g ? { path: g.path, matrix: null } : null;
            });
        }
        const f3 = get(descriptor, 'FontFile3', resolve);
        if (!f3 || f3.type !== 'stream') return null;
        const kind = name(get(f3, 'Subtype', resolve));
        let bytes = filters.decode(f3);
        if (kind === 'OpenType') {
            const sfnt = kit.sfnt.parseSfnt(bytes);
            if (sfnt.tables.glyf) return loadTrueType(fontDict, resolve, filters, kit, unicodeOf, bytes);
            if (!sfnt.tables['CFF ']) return null;
            bytes = sfnt.tables['CFF '].bytes;
        } else if (kind !== 'Type1C' && kind !== 'CIDFontType0C') return null;
        const font = kit.cff.readCff(bytes);
        /** @param {number} gid */
        const draw = (gid) => {
            const g = gid > 0 ? font.glyph(gid) : null;
            return g ? { path: g.path, matrix: g.fontMatrix } : null;
        };
        if (cidOf) {
            const toCid = cidOf;
            return outlinesOf(font.fontMatrix, (code, length) => {
                const cid = toCid(code, length);
                return cid === null ? null : draw(font.cidKeyed ? font.gidOfCid(cid) : cid);
            });
        }
        const names = codeNames(fontDict, resolve, font.encoding, kit.encodings);
        return outlinesOf(font.fontMatrix, (code) => {
            const n = names[code & 0xff];
            return n && n !== '.notdef' ? draw(font.gidOfName(n)) : null;
        });
    } catch {
        return null;
    }
}

/**
 * The painter's view of a Type 1 or CFF font: `glyph(code)` a `Path2D`,
 * `scale` for a uniform font matrix, else `transformOf(code)`.
 * @param {number[]} fontMatrix
 * @param {(code: number, length?: number) => ({path: any[], matrix: number[]|null}|null)} at
 */
function outlinesOf(fontMatrix, at) {
    /** @type {Map<string, {path: Path2D|null, matrix: number[]|null}>} */
    const cache = new Map();
    /** @param {number} code @param {number} [length] a composite font's code length (`<41>` and `<0041>` differ) */
    const one = (code, length) => {
        const key = `${length || 0}:${code}`;
        const hit = cache.get(key);
        if (hit) return hit;
        /** @type {{path: Path2D|null, matrix: number[]|null}} */
        let v = { path: null, matrix: null };
        try {
            const g = at(code, length);
            if (g && g.path.length) v = { path: toPath2D(g.path), matrix: g.matrix || fontMatrix };
        } catch { v = { path: null, matrix: null }; }
        cache.set(key, v);
        return v;
    };
    const plain = uniform(fontMatrix);
    return {
        scale: plain ? fontMatrix[0] : 1,
        glyph: (code, length) => one(code, length).path,
        transformOf: (code, length) => {
            const m = one(code, length).matrix;
            return m && !(plain && m.every((v, i) => v === fontMatrix[i])) ? m : null;
        }
    };
}
