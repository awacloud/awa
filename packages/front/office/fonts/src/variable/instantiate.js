// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A static instance of a variable TrueType font (module
 * `varInstantiate`).
 *
 * `instantiate(font, coords)` → `Uint8Array`, a static TrueType font at
 * the user coordinates `coords` (`{ tag: value }`, as `varGlyph` takes
 * them):
 *
 *  - `glyf` / `loca`: every glyph at the coordinates (`varGlyph`'s
 *    `outlineAt`), re-encoded. A simple glyph has its moved points, its
 *    flags with short vectors and its instructions; a composite its moved
 *    offsets (word arguments when they no longer fit a byte), its
 *    transform and its instructions. Each bounding box is recomputed.
 *  - `hmtx`: the advance at the coordinates, and the left side bearing
 *    that keeps the moved left side bearing point (`xMin − pp1`).
 *  - `head`: the font's bounding box and the `loca` format; `hhea`:
 *    `advanceWidthMax`, the side bearings, `xMaxExtent`.
 *  - `MVAR`: its rounded deltas at the coordinates added to the fields
 *    its tags name (`hasc`, `hdsc`, `hlgp`, `hcla`, `hcld`, `xhgt`,
 *    `cpht`, the sub- and superscript and strikeout fields of `OS/2`;
 *    `hcrs`, `hcrn`, `hcof` of `hhea`; `unds`, `undo` of `post`); an
 *    unknown tag is ignored.
 *  - Dropped: `fvar`, `gvar`, `avar`, `HVAR`, `VVAR`, `MVAR`, `cvar`,
 *    `STAT`. Every other table is kept as read; the layout tables'
 *    variation data (FeatureVariations, GPOS devices) are not baked into
 *    them.
 *
 * A font without `fvar` gives its default instance, re-encoded. A font
 * without `glyf` throws `fonts/var-glyf-only`; bad coordinates throw
 * `fonts/var-bad-coords`.
 *
 * Strict factory body, worker-safe.
 *
 * @module fonts/variable/instantiate
 */

import { fontErrors } from '../errors.js';
import { fontSfnt } from '../sfnt/sfnt.js';
import { tableHead } from '../table/head.js';
import { tableHhea } from '../table/hhea.js';
import { tableMaxp } from '../table/maxp.js';
import { tableHmtx } from '../table/hmtx.js';
import { tableLoca } from '../table/loca.js';
import { tableMvar } from '../table/mvar.js';
import { fontWriter } from '../primitives/writer.js';
import { fontCompositeResolve } from '../glyph/compositeResolve.js';
import { varGlyph } from './glyph.js';
import { varItemStore } from './itemVariationStore.js';

export const varInstantiate = {
    name: 'varInstantiate',
    dependencies: ['fontErrors', 'fontSfnt', 'tableHead', 'tableHhea', 'tableMaxp', 'tableHmtx', 'tableLoca', 'tableMvar', 'fontWriter',
        'fontCompositeResolve', 'varGlyph', 'varItemStore'],
    deps: [fontErrors, fontSfnt, tableHead, tableHhea, tableMaxp, tableHmtx, tableLoca, tableMvar, fontWriter,
        fontCompositeResolve, varGlyph, varItemStore],
    factory(errors, sfnt, head, hhea, maxp, hmtx, loca, mvarMod, writer, compositeMod, varGlyphMod, ivsMod) {
        const { ContractError } = errors;
        const { packSfnt, SFNT_FLAVOR } = sfnt;
        const { BinaryWriter } = writer;
        const DROPPED = new Set(['fvar', 'gvar', 'avar', 'HVAR', 'VVAR', 'MVAR', 'cvar', 'STAT']);
        /** MVAR tags of OS/2 fields: their byte offset and whether unsigned. */
        const OS2 = { sbxs: [10], sbys: [12], sbxo: [14], sbyo: [16], spxs: [18], spys: [20], spxo: [22], spyo: [24], strs: [26], stro: [28],
            hasc: [68], hdsc: [70], hlgp: [72], hcla: [74, true], hcld: [76, true], xhgt: [86], cpht: [88] };
        const HHEA = { hcrs: 'caretSlopeRise', hcrn: 'caretSlopeRun', hcof: 'caretOffset' };
        const POST = { undo: 8, unds: 10 };

        const i16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));

        /** A simple glyph's bytes (empty for no contour) and its box. */
        function encodeSimple(e) {
            const pts = e.points;
            if (!e.numberOfContours || !pts.length) return { bytes: new Uint8Array(0), box: null };
            const box = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
            for (const p of pts) {
                box.xMin = Math.min(box.xMin, p.x); box.yMin = Math.min(box.yMin, p.y);
                box.xMax = Math.max(box.xMax, p.x); box.yMax = Math.max(box.yMax, p.y);
            }
            const w = new BinaryWriter();
            w.writeInt16(e.endPtsOfContours.length);
            w.writeInt16(i16(box.xMin)).writeInt16(i16(box.yMin)).writeInt16(i16(box.xMax)).writeInt16(i16(box.yMax));
            for (const end of e.endPtsOfContours) w.writeUint16(end);
            const ins = e.instructions || new Uint8Array(0);
            w.writeUint16(ins.length);
            if (ins.length) w.writeBytes(ins);
            const flags = [], xs = [], ys = [];
            let px = 0, py = 0;
            for (const p of pts) {
                let f = p.onCurve ? 0x01 : 0;
                const dx = Math.round(p.x) - px, dy = Math.round(p.y) - py;
                px += dx; py += dy;
                if (dx === 0) f |= 0x10;
                else if (Math.abs(dx) < 256) { f |= 0x02; if (dx > 0) f |= 0x10; xs.push([1, Math.abs(dx)]); } else xs.push([2, dx]);
                if (dy === 0) f |= 0x20;
                else if (Math.abs(dy) < 256) { f |= 0x04; if (dy > 0) f |= 0x20; ys.push([1, Math.abs(dy)]); } else ys.push([2, dy]);
                flags.push(f);
            }
            for (const f of flags) w.writeUint8(f);
            for (const [n, v] of [...xs, ...ys]) { if (n === 1) w.writeUint8(v); else w.writeInt16(v); }
            return { bytes: w.finalize(), box };
        }

        /** A composite glyph's bytes, with `box` its recomputed bounding box. */
        function encodeComposite(e, box) {
            const w = new BinaryWriter();
            w.writeInt16(-1);
            w.writeInt16(i16(box.xMin)).writeInt16(i16(box.yMin)).writeInt16(i16(box.xMax)).writeInt16(i16(box.yMax));
            const ins = e.instructions || new Uint8Array(0);
            e.components.forEach((c, k) => {
                const last = k === e.components.length - 1;
                const a1 = Math.round(c.arg1 || 0), a2 = Math.round(c.arg2 || 0);
                const byte = c.xy ? (a1 >= -128 && a1 <= 127 && a2 >= -128 && a2 <= 127) : (a1 >= 0 && a1 <= 255 && a2 >= 0 && a2 <= 255);
                const t = c.transform || { a: 1, b: 0, c: 0, d: 1 };
                let f = (c.flags || 0) & (0x0004 | 0x0200 | 0x0400 | 0x0800 | 0x1000);
                if (c.xy) f |= 0x0002;
                if (!byte) f |= 0x0001;
                let scale;
                if (t.b === 0 && t.c === 0 && t.a === 1 && t.d === 1) scale = [];
                else if (t.b === 0 && t.c === 0 && t.a === t.d) { f |= 0x0008; scale = [t.a]; } else if (t.b === 0 && t.c === 0) { f |= 0x0040; scale = [t.a, t.d]; } else { f |= 0x0080; scale = [t.a, t.b, t.c, t.d]; }
                if (!last) f |= 0x0020;
                if (last && ins.length) f |= 0x0100;
                w.writeUint16(f).writeUint16(c.glyphIndex);
                if (byte) { if (c.xy) w.writeInt8(a1).writeInt8(a2); else w.writeUint8(a1).writeUint8(a2); } else if (c.xy) w.writeInt16(a1).writeInt16(a2); else w.writeUint16(a1).writeUint16(a2);
                for (const s of scale) w.writeInt16(i16(s * 16384));
            });
            if (ins.length) { w.writeUint16(ins.length); w.writeBytes(ins); }
            return w.finalize();
        }

        /** The box of a composite at the coordinates, from its resolved outline. */
        function compositeBox(glyphs, gid) {
            const path = compositeMod.resolveGlyphPath(glyphs, gid);
            const box = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
            for (const c of path.commands) {
                for (const [x, y] of [[c.x, c.y], [c.x1, c.y1], [c.x2, c.y2]]) {
                    if (x === undefined) continue;
                    box.xMin = Math.min(box.xMin, x); box.yMin = Math.min(box.yMin, y);
                    box.xMax = Math.max(box.xMax, x); box.yMax = Math.max(box.yMax, y);
                }
            }
            return box.xMin === Infinity ? null : { xMin: Math.floor(box.xMin), yMin: Math.floor(box.yMin), xMax: Math.ceil(box.xMax), yMax: Math.ceil(box.yMax) };
        }

        /**
         * A static instance of `font` at `coords` (module header).
         *
         * @param {object} font A `fonts.read` result.
         * @param {Object<string, number>} coords
         * @returns {Uint8Array}
         * @throws {ContractError} `fonts/var-glyf-only`, `fonts/var-bad-coords`.
         */
        function instantiate(font, coords) {
            if (!font || !Array.isArray(font.glyphTable) || !font.head)
                throw new ContractError('fonts/var-glyf-only', 'instantiate writes TrueType (glyf) fonts only');
            const vars = varGlyphMod.variations(font);
            const n = vars.normalise(coords);
            const count = font.glyphTable.length;
            const glyfWriter = new BinaryWriter();
            const offsets = new Uint32Array(count + 1);
            const metrics = [];
            const fontBox = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
            let minLsb = Infinity, minRsb = Infinity, maxExtent = -Infinity, maxAdvance = 0;
            for (let g = 0; g < count; g++) {
                offsets[g] = glyfWriter.length;
                const o = vars.outlineAt(g, coords);
                const e = o.glyphs[g];
                let bytes = new Uint8Array(0), box = null;
                if (e && e.kind === 'simple') ({ bytes, box } = encodeSimple(e));
                else if (e && e.kind === 'composite') { box = compositeBox(o.glyphs, g); if (box) bytes = encodeComposite(e, box); }
                if (bytes.length) { glyfWriter.writeBytes(bytes); glyfWriter.padTo(2); }
                const advanceWidth = Math.max(0, Math.round(o.advanceWidth));
                const lsb = box ? Math.round(box.xMin - o.pp1) : Math.round(-o.pp1);
                metrics.push({ advanceWidth, lsb });
                maxAdvance = Math.max(maxAdvance, advanceWidth);
                if (box) {
                    fontBox.xMin = Math.min(fontBox.xMin, box.xMin); fontBox.yMin = Math.min(fontBox.yMin, box.yMin);
                    fontBox.xMax = Math.max(fontBox.xMax, box.xMax); fontBox.yMax = Math.max(fontBox.yMax, box.yMax);
                    const width = box.xMax - box.xMin;
                    minLsb = Math.min(minLsb, lsb);
                    minRsb = Math.min(minRsb, advanceWidth - lsb - width);
                    maxExtent = Math.max(maxExtent, lsb + width);
                }
            }
            offsets[count] = glyfWriter.length;
            const locaEnc = loca.encodeLoca(offsets);
            const hmtxEnc = hmtx.encodeHmtx({ metrics });
            const known = fontBox.xMin !== Infinity;
            const raw = font.rawSfnt.tables;

            // MVAR's deltas at the coordinates.
            const mvar = {};
            if (raw.MVAR && vars.axes.length) {
                try {
                    const m = mvarMod.parseMvar(raw.MVAR.bytes);
                    const store = m.itemVariationStoreBytes ? ivsMod.parseItemVariationStore(m.itemVariationStoreBytes, 0) : null;
                    if (store) for (const r of m.records) mvar[r.valueTag] = Math.round(store.delta(r.deltaSetOuterIndex, r.deltaSetInnerIndex, n));
                } catch { /* an MVAR that does not parse is not applied */ }
            }
            const hheaFields = { ...font.hhea, numberOfHMetrics: hmtxEnc.numberOfHMetrics, advanceWidthMax: maxAdvance };
            if (known) Object.assign(hheaFields, { minLeftSideBearing: i16(minLsb), minRightSideBearing: i16(minRsb), xMaxExtent: i16(maxExtent) });
            for (const [tag, field] of Object.entries(HHEA)) if (mvar[tag]) hheaFields[field] = (hheaFields[field] || 0) + mvar[tag];

            const tables = {};
            for (const [tag, t] of Object.entries(raw)) {
                if (DROPPED.has(tag) || !t || !t.bytes) continue;
                tables[tag] = new Uint8Array(t.bytes);
            }
            const patch = (bytes, at, delta, unsigned) => {
                if (!bytes || !delta || at + 2 > bytes.length) return;
                let v = (bytes[at] << 8) | bytes[at + 1];
                if (!unsigned) v = (v << 16) >> 16;
                v += delta;
                v = unsigned ? Math.max(0, Math.min(65535, v)) : i16(v);
                bytes[at] = (v >> 8) & 0xFF;
                bytes[at + 1] = v & 0xFF;
            };
            for (const [tag, [at, unsigned]] of Object.entries(OS2)) patch(tables['OS/2'], at, mvar[tag], unsigned);
            for (const [tag, at] of Object.entries(POST)) patch(tables.post, at, mvar[tag]);

            Object.assign(tables, {
                head: head.encodeHead({
                    ...font.head, magicNumber: head.HEAD_MAGIC, checksumAdjustment: 0, indexToLocFormat: locaEnc.indexToLocFormat,
                    ...(known ? { xMin: i16(fontBox.xMin), yMin: i16(fontBox.yMin), xMax: i16(fontBox.xMax), yMax: i16(fontBox.yMax) } : {})
                }),
                hhea: hhea.encodeHhea(hheaFields),
                maxp: maxp.encodeMaxp({ ...font.maxp }),
                hmtx: hmtxEnc.bytes,
                loca: locaEnc.bytes,
                glyf: glyfWriter.finalize()
            });
            return packSfnt({ flavor: SFNT_FLAVOR.TRUETYPE, tables });
        }

        return { instantiate };
    }
};
