// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A few OFL faces, one per font technology the package
 * claims (static TrueType, static CFF, variable CFF2, COLR v1 colour with
 * variable TrueType outlines), measured per face:
 *
 * - **parse** — the fonttools per-file criterion (`_helpers/fonttools.js`:
 *   container, `fonts.read`, every table parser, every `glyf` glyph, every
 *   name-keyed CFF CharString), and for a CFF / CFF2 face the CharStrings
 *   INDEX count equals `maxp.numGlyphs`;
 * - **COLR v1 paints** — every paint graph reachable from the
 *   BaseGlyphList and every LayerList paint decodes through
 *   `decodePaintGraph` without a throw, a cycle or a depth truncation;
 * - **subset round-trip** — for a `glyf` face, `subsetForPdf` over every
 *   mapped code point, then `fonts.read` of the subset: every code point
 *   still maps, with the same advance width and the same outline. A CFF /
 *   CFF2 face is skipped (`subsetForPdf` subsets `glyf` outlines only, a
 *   documented limit).
 *
 * One module for both users: the package test
 * (`tests/ofl-faces.integration.test.js`) and the `ofl-faces` suite of
 * `tools/office-scorecard`. Never shipped (the package `files` exclude
 * `tests/`).
 *
 * @module fonts/tests/_helpers/ofl-faces
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { errorDetail, fontsRuntime, measure } from './fonttools.js';

/** The fixture directory (`MANIFEST.json`, `vendor/`). */
export const FIXTURE_DIR = fileURLToPath(new URL('../_fixtures/ofl-faces/', import.meta.url));

/** Reason a CFF / CFF2 face's round-trip is not run. */
export const SUBSET_SKIP = 'subsetForPdf subsets glyf outlines only (README known limit; it refuses a CFF or CFF2 font with the typed fonts/subset-bad-font)';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/**
 * The faces of the manifest with their bytes, each checked against its
 * byte count and SHA-256 (any mismatch throws).
 * @param {string} [dir] the fixture directory
 * @returns {{ manifest: any, faces: { id: string, technology: string, path: string, bytes: Uint8Array }[] }}
 */
export function loadFaces(dir = FIXTURE_DIR) {
    const base = pathToFileURL(/[\\/]$/.test(dir) ? dir : `${dir}/`);
    const manifest = JSON.parse(readFileSync(new URL('MANIFEST.json', base), 'utf8'));
    const faces = manifest.faces.map((f) => {
        const bytes = new Uint8Array(readFileSync(new URL(f.path, base)));
        if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new Error(`face ${f.id} differs from MANIFEST.json (${f.path})`);
        return { id: f.id, technology: f.technology, path: f.path, bytes };
    });
    return { manifest, faces };
}

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/**
 * Decode every COLR v1 paint graph of a COLR table.
 * @param {Uint8Array} colrBytes
 * @param {{ resolve(name: string): any }} rt
 * @returns {{ roots: number, layers: number, nodes: number, cycles: number, truncated: number, errors: number, firstError: string|null }}
 */
export function paintGraphs(colrBytes, rt) {
    const { parseColr, decodePaintGraph } = rt.resolve('tableColr');
    const colr = parseColr(colrBytes);
    const s = { roots: 0, layers: 0, nodes: 0, cycles: 0, truncated: 0, errors: 0, firstError: null };
    const count = (n) => {
        if (!n) return;
        if (n.cycle) { s.cycles++; return; }
        if (n.truncated) { s.truncated++; return; }
        s.nodes++;
        count(n.paint); count(n.paintSrc); count(n.paintDst);
    };
    const run = (offset) => {
        try { count(decodePaintGraph(colrBytes, offset)); } catch (e) {
            s.errors++;
            s.firstError = s.firstError || errorDetail(e);
        }
    };
    for (const r of colr.v1.baseGlyphPaintRecords || []) { s.roots++; run(colr.v1.baseGlyphListOffset + r.paintOffset); }
    const list = colr.v1.layerListOffset;
    if (list) {
        const n = u32(colrBytes, list);
        for (let i = 0; i < n; i++) { s.layers++; run(list + u32(colrBytes, list + 4 + 4 * i)); }
    }
    return s;
}

/**
 * Subset a `glyf` font to every code point it maps, read the subset back
 * and compare each code point's advance and outline.
 * @param {Uint8Array} bytes
 * @param {{ resolve(name: string): any }} rt
 * @returns {{ codePoints: number, glyphs: number, subsetGlyphs: number, missing: number, widthDiffs: number, pathDiffs: number, first: string|null }}
 */
export function subsetRoundTrip(bytes, rt) {
    const api = rt.resolve('fonts');
    const { subsetForPdf } = rt.resolve('embedSubsetForPdf');
    const font = api.read(bytes);
    const cps = [...font.unicodeMap.keys()].sort((a, b) => a - b);
    const back = api.read(subsetForPdf(font, new Set(cps)).subsetBytes);
    const r = { codePoints: cps.length, glyphs: font.numGlyphs, subsetGlyphs: back.numGlyphs, missing: 0, widthDiffs: 0, pathDiffs: 0, first: null };
    const svg = (g) => (g.path ? g.path.toSvgPath() : '');
    for (const cp of cps) {
        const u = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
        const gid = back.glyphIndexForCodePoint(cp, { strict: true });
        if (gid < 0) { r.missing++; r.first = r.first || `${u} not mapped`; continue; }
        const a = font.getGlyphByCodePoint(cp);
        const b = back.getGlyphByIndex(gid);
        if (a.advanceWidth !== b.advanceWidth) { r.widthDiffs++; r.first = r.first || `${u} advance ${a.advanceWidth} -> ${b.advanceWidth}`; }
        if (svg(a) !== svg(b)) { r.pathDiffs++; r.first = r.first || `${u} outline differs`; }
    }
    return r;
}

/**
 * The CharStrings count of a CFF or CFF2 face against `maxp.numGlyphs`;
 * `null` for a face with neither table.
 * @param {Record<string, Uint8Array>} tables
 * @param {{ resolve(name: string): any }} rt
 * @returns {string|null} a mismatch, or null
 */
function charStringsMismatch(tables, rt) {
    const numGlyphs = rt.resolve('tableMaxp').parseMaxp(tables.maxp).numGlyphs;
    let count = null;
    if (tables['CFF ']) count = rt.resolve('tableCff').parseCff(tables['CFF ']).fonts[0].charStringsIndex.count;
    else if (tables.CFF2) count = rt.resolve('tableCff2').parseCff2(tables.CFF2).charStringsIndex.count;
    return count === null || count === numGlyphs ? null : `CharStrings count ${count} vs numGlyphs ${numGlyphs}`;
}

/**
 * Run the measure over the faces.
 * @param {{ id: string, path: string, bytes: Uint8Array }[]} faces
 * @param {{ resolve(name: string): any }} [rt]
 * @returns {{ cases: { case: string, ok: boolean, detail?: string }[], skipped: { case: string, reason: string }[] }}
 */
export function measureFaces(faces, rt = fontsRuntime()) {
    const { parseSfnt } = rt.resolve('fontSfnt');
    const out = { cases: [], skipped: [] };
    for (const face of faces) {
        const ext = face.path.slice(face.path.lastIndexOf('.'));
        const parse = measure([{ path: `${face.id}${ext}`, bytes: face.bytes }], rt).fonts.cases[0];
        let tables = {};
        const fails = parse && !parse.ok ? [parse.detail] : [];
        try {
            tables = Object.fromEntries(Object.entries(parseSfnt(face.bytes).tables).map(([t, v]) => [t, v.bytes]));
            const cs = charStringsMismatch(tables, rt);
            if (cs) fails.push(cs);
        } catch (e) { fails.push(`charstrings: ${errorDetail(e)}`); }
        out.cases.push(fails.length ? { case: `${face.id} :: parse`, ok: false, detail: fails.join('; ') } : { case: `${face.id} :: parse`, ok: true });

        if (tables.COLR) {
            let version = null;
            try { version = rt.resolve('tableColr').parseColr(tables.COLR).version; } catch { /* reported by parse */ }
            if (version === 1) {
                const id = `${face.id} :: colr-v1 paints`;
                try {
                    const s = paintGraphs(tables.COLR, rt);
                    const bad = s.errors + s.cycles + s.truncated;
                    out.cases.push(bad === 0 ? { case: id, ok: true }
                        : { case: id, ok: false, detail: `${s.errors} errors, ${s.cycles} cycles, ${s.truncated} truncated${s.firstError ? `; first: ${s.firstError}` : ''}` });
                } catch (e) { out.cases.push({ case: id, ok: false, detail: errorDetail(e) }); }
            }
        }

        const id = `${face.id} :: subset round-trip`;
        if (!tables.glyf) { out.skipped.push({ case: id, reason: SUBSET_SKIP }); continue; }
        try {
            const r = subsetRoundTrip(face.bytes, rt);
            const bad = r.missing + r.widthDiffs + r.pathDiffs;
            out.cases.push(bad === 0 ? { case: id, ok: true }
                : { case: id, ok: false, detail: `${r.missing} unmapped, ${r.widthDiffs} advances, ${r.pathDiffs} outlines differ of ${r.codePoints}; first: ${r.first}` });
        } catch (e) { out.cases.push({ case: id, ok: false, detail: errorDetail(e) }); }
    }
    return out;
}
