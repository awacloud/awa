// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Embedded TrueType programs (`/FontFile2`) drawn from their
 * own outlines: `@awacloud/fonts` parses the program (`sfnt`, `head`, `maxp`,
 * `loca`, `glyf`, `cmap`, composite resolution); this module maps each PDF
 * character code to a glyph (ISO 32000-2 §9.6.5.4 for simple fonts, the
 * `/CIDToGIDMap` for CIDFontType2) and turns the outline into a `Path2D`.
 *
 * Drawing the font's own glyphs is exact whatever the program's `cmap`
 * holds — subset fonts, symbol fonts, glyphs with no Unicode. A font this
 * module cannot use (CFF / Type 1 programs, a non-Identity CMap, a damaged
 * program) returns `null` and the painter falls back to a system face.
 *
 * @module viewer/render/pdf/glyphs
 */
import { arr, deref, entries, get, name, num } from './objects.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */

/**
 * The `@awacloud/fonts` table readers this module needs (resolved
 * instances, see `core/runtime.js`).
 * @typedef {{sfnt: any, head: any, maxp: any, loca: any, glyf: any, cmap: any, composite: any}} FontKit
 */

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
 * @returns {{glyph: (code: number) => Path2D|null, scale: number}|null}
 */
export function loadTrueType(fontDict, resolve, filters, kit, unicodeOf) {
    const e = entries(fontDict) || {};
    const subtype = name(deref(e.Subtype, resolve));
    let descriptor;
    let cid = null;
    if (subtype === 'Type0') {
        // Only Identity CMaps keep code == CID without a CMap parser.
        const encoding = name(deref(e.Encoding, resolve));
        if (encoding !== 'Identity-H' && encoding !== 'Identity-V') return null;
        const descendant = arr(deref(e.DescendantFonts, resolve), resolve)?.[0] || null;
        if (name(get(descendant, 'Subtype', resolve)) !== 'CIDFontType2') return null;
        descriptor = get(descendant, 'FontDescriptor', resolve);
        const map = get(descendant, 'CIDToGIDMap', resolve);
        let table = null;
        if (map && map.type === 'stream') { try { table = filters.decode(map); } catch { return null; } }
        cid = { table };
    } else if (subtype === 'TrueType') {
        descriptor = get(fontDict, 'FontDescriptor', resolve);
    } else {
        return null;
    }
    const program = get(descriptor, 'FontFile2', resolve);
    if (!program || program.type !== 'stream') return null;

    let glyphs;
    let unitsPerEm;
    let cmap = null;
    try {
        const bytes = filters.decode(program);
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

    /** @param {number} code @returns {number|null} */
    function gidOf(code) {
        if (cid) {
            if (!cid.table) return code;                 // /Identity
            const i = code * 2;
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
        glyph(code) {
            const gid = gidOf(code);
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
