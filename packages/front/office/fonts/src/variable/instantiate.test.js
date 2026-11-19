// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// office-coverage-3 T14 (c), D39: a static instance of a variable font.
// The variations are injected into a read Liberation Sans (fvar, gvar,
// MVAR built here byte by byte); the instance is read back.

import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { varInstantiate } from './instantiate.js';

let instantiate, fonts, subsetForPdf, ContractError, base;
const LIB = new URL('../../../oconv-fonts/vendor/liberation/LiberationSans-Regular.ttf', import.meta.url);
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ instantiate } = rt.resolve('varInstantiate'));
    fonts = rt.resolve('fonts');
    ({ subsetForPdf } = rt.resolve('embedSubsetForPdf'));
    ({ ContractError } = rt.resolve('fontErrors'));
    base = fonts.read(new Uint8Array(readFileSync(LIB)));
});

const be16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const be32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const f2 = (v) => be16(Math.round(v * 16384) & 0xFFFF);
const fixed = (v) => be32(Math.round(v * 65536) >>> 0);
const tag = (t) => [...t.padEnd(4, ' ')].map((c) => c.charCodeAt(0));
const A = 36, E_ACUTE = 171;

const FVAR = new Uint8Array([...be16(1), ...be16(0), ...be16(16), ...be16(2), ...be16(1), ...be16(20), ...be16(0), ...be16(0),
    ...tag('wght'), ...fixed(100), ...fixed(400), ...fixed(900), ...be16(0), ...be16(256)]);
const words = (ds) => [0x40 | (ds.length - 1), ...ds.flatMap((d) => be16(d & 0xFFFF))];
/** gvar over `count` glyphs; `glyphs[gid]` = one all-points tuple at wght's max: [dx[], dy[]]. */
function gvar(count, glyphs) {
    const datas = [];
    for (let g = 0; g < count; g++) {
        const t = glyphs[g];
        if (!t) { datas.push([]); continue; }
        const body = [0, ...words(t[0]), ...words(t[1])];
        datas.push([...be16(1), ...be16(4 + 6), ...be16(body.length), ...be16(0xA000), ...f2(1), ...body]);
    }
    const offsets = [0];
    for (const d of datas) offsets.push(offsets[offsets.length - 1] + d.length);
    return new Uint8Array([...be16(1), ...be16(0), ...be16(1), ...be16(0), ...be32(0), ...be16(count), ...be16(1), ...be32(20 + 4 * (count + 1)),
        ...offsets.flatMap(be32), ...datas.flat()]);
}
/** MVAR: `records` [tag, delta at wght's max], one item each. */
function mvar(records) {
    const regionList = [...be16(1), ...be16(1), ...f2(0), ...f2(1), ...f2(1)];
    const data = [...be16(records.length), ...be16(1), ...be16(1), ...be16(0), ...records.flatMap(([, d]) => be16(d & 0xFFFF))];
    const ivs = [...be16(1), ...be32(12), ...be16(1), ...be32(12 + regionList.length), ...regionList, ...data];
    const head = 12 + 8 * records.length;
    return new Uint8Array([...be16(1), ...be16(0), ...be16(0), ...be16(8), ...be16(records.length), ...be16(head),
        ...records.flatMap(([t], k) => [...tag(t), ...be16(0), ...be16(k)]), ...ivs]);
}
/** `base` with variation tables added. */
function variable(extra) {
    return { ...base, rawSfnt: { ...base.rawSfnt, tables: { ...base.rawSfnt.tables, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { bytes: v }])) } } };
}
function varied() {
    const n = base.glyphTable[A].points.length;
    return variable({
        fvar: FVAR,
        gvar: gvar(base.glyphTable.length, {
            [A]: [[...Array(n).fill(10), 0, 50, 0, 0], [...Array(n).fill(0), 0, 0, 0, 0]],
            [E_ACUTE]: [[300, 0, 0, 0, 0, 0], [0, 40, 0, 0, 0, 0]]
        }),
        MVAR: mvar([['hasc', 100], ['undo', -20], ['zzzz', 7]])
    });
}
const i16 = (b, o) => (((b[o] << 8) | b[o + 1]) << 16) >> 16;

describe('varInstantiate — descriptor', () => {
    test('a strict factory descriptor, registered in the modules', () => {
        expect(varInstantiate.name).toBe('varInstantiate');
        expect(modules).toContain(varInstantiate);
    });
});

describe('varInstantiate — instantiate', () => {
    test('a simple glyph at the coordinates, re-encoded: points, advance, side bearing, bounding box', () => {
        const inst = fonts.read(instantiate(varied(), { wght: 900 }));
        const g = inst.glyphTable[A], o = base.glyphTable[A];
        expect(g.points.map((p) => [p.x, p.y, p.onCurve])).toEqual(o.points.map((p) => [p.x + 10, p.y, p.onCurve]));
        expect(g.instructions).toEqual(o.instructions);
        expect([inst.hmtx.metrics[A].advanceWidth, inst.hmtx.metrics[A].lsb]).toEqual([1416, 14]);
        expect(g.bbox).toEqual({ xMin: 14, yMin: 0, xMax: 1372, yMax: 1409 });
    });
    test('halfway, half the deltas', () => {
        const inst = fonts.read(instantiate(varied(), { wght: 650 }));
        expect(inst.glyphTable[A].points[0].x).toBe(base.glyphTable[A].points[0].x + 5);
        expect(inst.hmtx.metrics[A].advanceWidth).toBe(1391);
    });
    test("a composite's offsets moved, words when they no longer fit a byte; its bounding box recomputed", () => {
        const inst = fonts.read(instantiate(varied(), { wght: 900 }));
        const c = inst.glyphTable[E_ACUTE];
        expect(c.components.map((x) => [x.glyphIndex, x.arg1, x.arg2])).toEqual([[72, 300, 0], [118, 368, 40]]);
        expect(c.components[0].flags & 1).toBe(1);
        expect(c.bbox.xMin).toBe(base.glyphTable[E_ACUTE].bbox.xMin + 300);
    });
    test('MVAR on OS/2 and post; an unknown tag ignored; the variation tables dropped, the others kept', () => {
        const bytes = instantiate(varied(), { wght: 900 });
        const inst = fonts.read(bytes);
        const os2 = inst.rawSfnt.tables['OS/2'].bytes, src = base.rawSfnt.tables['OS/2'].bytes;
        expect(i16(os2, 68) - i16(src, 68)).toBe(100);
        expect(i16(inst.rawSfnt.tables.post.bytes, 8) - i16(base.rawSfnt.tables.post.bytes, 8)).toBe(-20);
        for (const t of ['fvar', 'gvar', 'MVAR']) expect(inst.rawSfnt.tables[t]).toBeUndefined();
        for (const t of ['GSUB', 'GPOS', 'cmap', 'name', 'fpgm', 'prep']) expect(inst.rawSfnt.tables[t]).toBeDefined();
    });
    test("head and hhea extents follow the glyphs", () => {
        const inst = fonts.read(instantiate(varied(), { wght: 900 }));
        expect(inst.hhea.advanceWidthMax).toBeGreaterThanOrEqual(1416);
        expect(inst.head.xMax).toBeGreaterThanOrEqual(1372);
        expect(inst.hhea.numberOfHMetrics).toBeGreaterThan(0);
    });
    test('a font without fvar gives its default instance, re-encoded', () => {
        const inst = fonts.read(instantiate(base, { wght: 900 }));
        expect(inst.glyphTable[A].points).toEqual(base.glyphTable[A].points);
        expect(inst.hmtx.metrics.slice(0, 200)).toEqual(base.hmtx.metrics.slice(0, 200));
        expect(inst.glyphTable[E_ACUTE].components.map((x) => [x.arg1, x.arg2])).toEqual([[0, 0], [368, 0]]);
    });
    test("subsetForPdf takes the instance as any font: its widths are the instance's", () => {
        const inst = fonts.read(instantiate(varied(), { wght: 900 }));
        const sub = subsetForPdf(inst, [0x41]);
        expect(sub.widths).toContain(1416);
    });
    test('a font without glyf throws fonts/var-glyf-only; bad coordinates fonts/var-bad-coords', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e instanceof ContractError, e.code]; } return null; };
        expect(code(() => instantiate({ ...base, glyphTable: null }, {}))).toEqual([true, 'fonts/var-glyf-only']);
        expect(code(() => instantiate(null, {}))).toEqual([true, 'fonts/var-glyf-only']);
        expect(code(() => instantiate(varied(), { wght: 'bold' }))).toEqual([true, 'fonts/var-bad-coords']);
    });
});
