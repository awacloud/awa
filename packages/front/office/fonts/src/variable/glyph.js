// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A glyph at variation coordinates (module `varGlyph`), as
 * FreeType draws it: a `glyf` glyph through `gvar`, or a CFF2 glyph
 * through its `blend`s.
 *
 *  - `normalise(font, coords)` maps user coordinates `{ tag: value }` to
 *    the normalised ones in `fvar` axis order: clamped to each axis's
 *    range, the default for a missing tag, then `avar`'s segment maps. A
 *    tag may leave out the spaces that pad it to four characters (`HV`
 *    for `'HV  '`).
 *  - `glyphAt(font, gid, coords)` gives `{ path, advanceWidth }`:
 *    - every `gvar` tuple whose scalar at the coordinates is not 0 adds
 *      its deltas, scaled; its points are its private point numbers, else
 *      the glyph's shared ones, else all of them (the glyph's points or
 *      components, then the four phantom points);
 *    - a simple glyph's untouched points are inferred by IUP, contour by
 *      contour and axis by axis: between two touched neighbours, the
 *      linear interpolation inside their range and the nearer one's delta
 *      outside it (two neighbours at one coordinate with different deltas
 *      give 0); one touched point shifts the whole contour;
 *    - a composite glyph's deltas move its components' offsets, and each
 *      component is itself taken at the coordinates;
 *    - each point's summed delta is rounded to the nearest unit (half up);
 *    - the outline is shifted so that the first phantom point (the left
 *      side bearing point) is at x = 0;
 *    - the advance is `hmtx`'s plus `HVAR`'s rounded delta (through its
 *      advance map, else the glyph index) when the font has `HVAR`, else
 *      the distance between the moved first two phantom points.
 *  - On a CFF2 font (a `CFF2` table and no `glyf`), `glyphAt` decodes the
 *    glyph's charstring with every `blend` at the coordinates (its region
 *    scalars from the font's variation store, through `varItemStore`),
 *    and the advance is `hmtx`'s plus `HVAR`'s. A CFF2 font with several
 *    Font DICTs throws `fonts/var-cff2-fds`, as `subsetForPdf` rejects it.
 *  - `variations(font)` gives `{ axes, normalise(coords), glyphAt(gid,
 *    coords), outlineAt(gid, coords) }`, the tables parsed once, for
 *    several glyphs. `outlineAt` (a `glyf` font) gives `{ glyphs,
 *    advanceWidth, pp1 }`: the glyph table with the glyph and its
 *    components at the coordinates (unshifted), the advance, and the x of
 *    the moved left side bearing point; `varInstantiate` writes them.
 *
 * `cvar` is not applied: it varies the `cvt` values, which only hinting
 * reads, and these outlines are unhinted. A font without `fvar` or `gvar`
 * gives the default glyph (shifted as above); a `gvar`, `avar` or `HVAR`
 * that does not parse is not applied. Bad coordinates throw
 * `fonts/var-bad-coords`; a font with neither `glyf` nor `CFF2`,
 * `fonts/var-glyf-only`.
 *
 * Strict factory body, capture-free, worker-safe.
 *
 * @module fonts/variable/glyph
 */

import { fontErrors } from '../errors.js';
import { tableFvar } from '../table/fvar.js';
import { tableAvar } from '../table/avar.js';
import { tableGvar } from '../table/gvar.js';
import { tableHvar } from '../table/hvar.js';
import { varCoordsConvert } from './coordsConvert.js';
import { varInstance } from './instance.js';
import { varItemStore } from './itemVariationStore.js';
import { fontCompositeResolve } from '../glyph/compositeResolve.js';
import { fontPath } from '../glyph/path.js';
import { tableCff } from '../table/cff.js';
import { tableCff2 } from '../table/cff2.js';

export const varGlyph = {
    name: 'varGlyph',
    dependencies: ['fontErrors', 'tableFvar', 'tableAvar', 'tableGvar', 'tableHvar', 'varCoordsConvert', 'varInstance', 'varItemStore', 'fontCompositeResolve',
        'fontPath', 'tableCff', 'tableCff2'],
    deps: [fontErrors, tableFvar, tableAvar, tableGvar, tableHvar, varCoordsConvert, varInstance, varItemStore, fontCompositeResolve,
        fontPath, tableCff, tableCff2],
    factory(errors, fvarMod, avarMod, gvarMod, hvarMod, coordsMod, instanceMod, ivsMod, compositeMod, pathMod, cffMod, cff2Mod) {
        const { ContractError } = errors;
        const round = (v) => Math.floor(v + 0.5);

        function checkCoords(coords) {
            const ok = coords !== null && typeof coords === 'object' && !Array.isArray(coords)
                && Object.entries(coords).every(([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v));
            if (!ok) throw new ContractError('fonts/var-bad-coords', 'coords must be { tag: finite number }');
        }

        /** Parse a table, or null when it is absent or does not parse. */
        function table(font, tag, fn) {
            const t = font.rawSfnt && font.rawSfnt.tables && font.rawSfnt.tables[tag];
            if (!t || !t.bytes) return null;
            try { return fn(t.bytes); } catch { return null; }
        }

        /** IUP of one tuple's deltas over a simple glyph's contours (in place on dx, dy). */
        function iup(points, endPts, dx, dy, touched) {
            const infer = (p, c1, c2, d1, d2) => {
                if (c1 === c2) return d1 === d2 ? d1 : 0;
                if (c1 > c2) { [c1, c2] = [c2, c1]; [d1, d2] = [d2, d1]; }
                if (p <= c1) return d1;
                if (p >= c2) return d2;
                return d1 + (p - c1) * (d2 - d1) / (c2 - c1);
            };
            let start = 0;
            for (const end of endPts) {
                const marks = [];
                for (let i = start; i <= end; i++) if (touched[i]) marks.push(i);
                if (marks.length === 1) {
                    const t = marks[0];
                    for (let i = start; i <= end; i++) if (!touched[i]) { dx[i] = dx[t]; dy[i] = dy[t]; }
                } else if (marks.length > 1) {
                    const len = end - start + 1;
                    for (let m = 0; m < marks.length; m++) {
                        const t1 = marks[m], t2 = marks[(m + 1) % marks.length];
                        for (let i = (t1 - start + 1) % len + start; i !== t2; i = (i - start + 1) % len + start) {
                            dx[i] = infer(points[i].x, points[t1].x, points[t2].x, dx[t1], dx[t2]);
                            dy[i] = infer(points[i].y, points[t1].y, points[t2].y, dy[t1], dy[t2]);
                        }
                    }
                }
                start = end + 1;
            }
        }

        /** The rounded deltas `[dx, dy]` of glyph `gid` (its points or components, then the 4 phantom points) at `coords`. */
        function glyphDeltas(gvar, gid, entry, coords) {
            const simple = entry && entry.kind === 'simple';
            const n = !entry ? 0 : simple ? entry.points.length : entry.components.length;
            const total = n + 4;
            const sx = new Array(total).fill(0), sy = new Array(total).fill(0);
            const raw = gvar && gvar.getGlyphVariationData(gid);
            if (!raw || raw.length < 4) return [sx, sy];
            let data;
            try { data = gvar.parseGlyphVariations(gid); } catch { return [sx, sy]; }
            const ser = data.serialisedData;
            let off = 0;
            let shared = null;
            if (raw[0] & 0x80) {
                const sp = gvarMod.unpackPointNumbers(ser, 0);
                shared = sp.points;
                off = sp.bytesConsumed;
            }
            for (const h of data.headers) {
                const begin = off;
                let pts = shared || [];
                if (h.privatePts) {
                    const pp = gvarMod.unpackPointNumbers(ser, off);
                    pts = pp.points;
                    off += pp.bytesConsumed;
                }
                const count = pts.length ? pts.length : total;
                const ux = gvarMod.unpackDeltas(ser, off, count);
                off += ux.bytesConsumed;
                const uy = gvarMod.unpackDeltas(ser, off, count);
                off = begin + h.variationDataSize;
                if (!h.peak) continue;
                let scalar;
                try { scalar = instanceMod.tupleScalar(h.peak, coords, h.intermediateStart, h.intermediateEnd); } catch { scalar = 0; }
                if (!scalar) continue;
                const dx = new Array(total).fill(0), dy = new Array(total).fill(0);
                if (!pts.length) {
                    for (let i = 0; i < total; i++) { dx[i] = ux.deltas[i] || 0; dy[i] = uy.deltas[i] || 0; }
                } else {
                    const touched = new Array(total).fill(false);
                    for (let k = 0; k < pts.length; k++) {
                        const p = pts[k];
                        if (p >= total) continue;
                        dx[p] += ux.deltas[k] || 0;
                        dy[p] += uy.deltas[k] || 0;
                        touched[p] = true;
                    }
                    if (simple) iup(entry.points, entry.endPtsOfContours, dx, dy, touched);
                }
                for (let i = 0; i < total; i++) { sx[i] += dx[i] * scalar; sy[i] += dy[i] * scalar; }
            }
            return [sx.map(round), sy.map(round)];
        }

        /**
         * The variation context of a font (module header).
         *
         * @param {object} font A `fonts.read` result.
         * @returns {{axes: object[], normalise: (coords: object) => number[], glyphAt: (gid: number, coords: object) => {path: object, advanceWidth: number}}}
         */
        function variations(font) {
            const fvar = table(font, 'fvar', fvarMod.parseFvar);
            const axes = fvar ? fvar.axes : [];
            const avar = table(font, 'avar', avarMod.parseAvar);
            const gvar = table(font, 'gvar', gvarMod.parseGvar);
            const hvarBytes = font.rawSfnt && font.rawSfnt.tables && font.rawSfnt.tables.HVAR && font.rawSfnt.tables.HVAR.bytes;
            let hvar = null;
            if (hvarBytes) {
                try {
                    const h = hvarMod.parseHvar(hvarBytes);
                    hvar = {
                        store: ivsMod.parseItemVariationStore(hvarBytes, h.itemVariationStoreOffset),
                        map: h.advanceWidthMappingOffset ? ivsMod.parseDeltaSetIndexMap(hvarBytes, h.advanceWidthMappingOffset) : null
                    };
                } catch { hvar = null; }
            }

            function normalise(coords) {
                checkCoords(coords);
                const maps = avar && avar.segmentMaps && avar.segmentMaps.length === axes.length ? avar.segmentMaps : undefined;
                const byTag = {};
                for (const a of axes) {
                    const v = coords[a.tag] !== undefined ? coords[a.tag] : coords[a.tag.replace(/ +$/, '')];
                    if (v !== undefined) byTag[a.tag] = v;
                }
                return coordsMod.normaliseAxesCoords(byTag, axes, maps);
            }

            const hvarAdvance = (gid, n) => {
                const m = hvar.map ? hvar.map.get(gid) : { outer: 0, inner: gid };
                return round(hvar.store.delta(m.outer, m.inner, n));
            };
            let cff2 = null;

            /** A CFF2 glyph at normalised coordinates `n`. */
            function cff2GlyphAt(gid, n) {
                if (cff2 === null) {
                    const t = table(font, 'CFF2', cff2Mod.parseCff2);
                    if (!t) throw new ContractError('fonts/var-glyf-only', 'glyphAt draws glyf or CFF2 outlines only');
                    if (t.fdArray && t.fdArray.length > 1)
                        throw new ContractError('fonts/var-cff2-fds', 'glyphAt reads a CFF2 font with one Font DICT');
                    const data = t.vstore ? t.vstore.data : null;
                    const store = data ? ivsMod.parseItemVariationStore(data, 0) : null;
                    cff2 = { t, store, regionCounts: data ? cff2Mod.regionCounts(data) : [] };
                }
                const { t, store, regionCounts } = cff2;
                const priv = t.fdArray && t.fdArray[0] ? t.fdArray[0].private : null;
                const cs = t.charStringsIndex && t.charStringsIndex.items[gid];
                const path = new pathMod.Path();
                if (cs) {
                    const scalars = regionCounts.map((_, i) => store.scalars(i, n));
                    path.commands.push(...cffMod.decodeCharstring(cs, {
                        globalSubrs: t.globalSubrIndex ? t.globalSubrIndex.items : [],
                        localSubrs: priv && priv.localSubrIndex ? priv.localSubrIndex.items : [],
                        cff2: { regionCounts, vsindex: priv ? priv.vsindex : 0, scalars }
                    }).commands);
                }
                const base = font.advanceWidth(gid);
                return { path, advanceWidth: hvar ? base + hvarAdvance(gid, n) : base };
            }

            /** A `glyf` glyph at normalised coordinates `n`: the varied table, the advance, the moved pp1. */
            function outlineAtNormal(gid, n, varied) {
                const glyphs = font.glyphTable;
                const useGvar = fvar && gvar && axes.length > 0;
                let phantom = [0, 0, 0, 0];
                const seen = new Set();
                const vary = (g, top) => {
                    if (seen.has(g) || g < 0 || g >= glyphs.length) return;
                    seen.add(g);
                    const entry = glyphs[g];
                    const [dx, dy] = useGvar ? glyphDeltas(gvar, g, entry, n) : [null, null];
                    const k = !entry ? 0 : entry.kind === 'simple' ? entry.points.length : entry.components.length;
                    if (top && dx) phantom = [dx[k], dx[k + 1], dy[k], dy[k + 1]];
                    if (entry && entry.kind === 'simple' && dx) {
                        varied[g] = { ...entry, points: entry.points.map((p, i) => ({ x: p.x + dx[i], y: p.y + dy[i], onCurve: p.onCurve })) };
                    } else if (entry && entry.kind === 'composite') {
                        if (dx) varied[g] = { ...entry, components: entry.components.map((c, i) => (c.xy ? { ...c, arg1: (c.arg1 || 0) + dx[i], arg2: (c.arg2 || 0) + dy[i] } : c)) };
                        for (const c of entry.components) vary(c.glyphIndex, false);
                    }
                };
                vary(gid, true);
                const entry = glyphs[gid];
                const lsb = font.leftSideBearing ? font.leftSideBearing(gid) : 0;
                const pp1 = ((entry && entry.bbox) ? entry.bbox.xMin : 0) - lsb + phantom[0];
                const base = font.advanceWidth(gid);
                let advanceWidth = base + phantom[1] - phantom[0];
                if (hvar) advanceWidth = base + hvarAdvance(gid, n);
                return { glyphs: varied, advanceWidth, pp1 };
            }

            function glyphAt(gid, coords) {
                const n = normalise(coords);
                if (!Array.isArray(font.glyphTable)) return cff2GlyphAt(gid, n);
                const o = outlineAtNormal(gid, n, font.glyphTable.slice());
                const path = compositeMod.resolveGlyphPath(o.glyphs, gid);
                if (o.pp1) path.transform({ a: 1, b: 0, c: 0, d: 1, e: -o.pp1, f: 0 });
                return { path, advanceWidth: o.advanceWidth };
            }

            function outlineAt(gid, coords) {
                const n = normalise(coords);
                if (!Array.isArray(font.glyphTable))
                    throw new ContractError('fonts/var-glyf-only', 'outlineAt reads glyf outlines only');
                return outlineAtNormal(gid, n, font.glyphTable.slice());
            }

            return { axes, normalise, glyphAt, outlineAt };
        }

        /** `normalise` of a font (module header). */
        function normalise(font, coords) { return variations(font).normalise(coords); }
        /** `glyphAt` of a font (module header). */
        function glyphAt(font, gid, coords) { return variations(font).glyphAt(gid, coords); }

        return { variations, normalise, glyphAt };
    }
};
