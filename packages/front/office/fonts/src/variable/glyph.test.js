// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T14 (a), D39: a glyf glyph at variation coordinates. The fvar, avar,
// gvar and HVAR tables are built here byte by byte, on a minimal font
// object (the raw tables, the parsed glyf entries, hmtx's advance and
// left side bearing are all the module reads).

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { varGlyph } from './glyph.js';

let glyphAt, normalise, variations, ContractError;
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ glyphAt, normalise, variations } = rt.resolve('varGlyph'));
    ({ ContractError } = rt.resolve('fontErrors'));
});

const be16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const be32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const f2 = (v) => be16(Math.round(v * 16384) & 0xFFFF);
const fixed = (v) => be32(Math.round(v * 65536) >>> 0);
const tag = (t) => [...t.padEnd(4, ' ')].map((c) => c.charCodeAt(0));

/** fvar with `axes` as [tag, min, default, max]. */
const fvar = (axes) => new Uint8Array([...be16(1), ...be16(0), ...be16(16), ...be16(2), ...be16(axes.length), ...be16(20), ...be16(0), ...be16(0),
    ...axes.flatMap(([t, mn, df, mx]) => [...tag(t), ...fixed(mn), ...fixed(df), ...fixed(mx), ...be16(0), ...be16(256)])]);
/** avar v1: per axis its [from, to] pairs. */
const avar = (maps) => new Uint8Array([...be16(1), ...be16(0), ...be16(0), ...be16(maps.length),
    ...maps.flatMap((m) => [...be16(m.length), ...m.flatMap(([a, b]) => [...f2(a), ...f2(b)])])]);

/** Packed point numbers (all points when `pts` is null). */
const packPoints = (pts) => {
    if (!pts) return [0];
    let last = 0;
    return [pts.length, (pts.length - 1) & 0x7F, ...pts.map((p) => { const d = p - last; last = p; return d; })];
};
/** Packed deltas, as one run of words. */
const packDeltas = (ds) => [0x40 | (ds.length - 1), ...ds.flatMap((d) => be16(d & 0xFFFF))];

/**
 * gvar for `glyphCount` glyphs; `glyphs[gid]` is { shared?, tuples: [{ peak,
 * start?, end?, points? (private, or null for all), dx, dy }] }.
 */
function gvar(axisCount, glyphCount, glyphs) {
    const datas = [];
    for (let g = 0; g < glyphCount; g++) {
        const gd = glyphs[g];
        if (!gd) { datas.push([]); continue; }
        const headers = [], ser = [];
        if (gd.shared !== undefined) ser.push(...packPoints(gd.shared));
        for (const t of gd.tuples) {
            const body = [...(t.points !== undefined ? packPoints(t.points) : []), ...packDeltas(t.dx), ...packDeltas(t.dy)];
            const flags = 0x8000 | (t.start ? 0x4000 : 0) | (t.points !== undefined ? 0x2000 : 0);
            headers.push(...be16(body.length), ...be16(flags), ...t.peak.flatMap(f2), ...(t.start ? [...t.start.flatMap(f2), ...t.end.flatMap(f2)] : []));
            ser.push(...body);
        }
        const head = 4 + headers.length;
        datas.push([...be16((gd.shared !== undefined ? 0x8000 : 0) | gd.tuples.length), ...be16(head), ...headers, ...ser]);
    }
    const offsets = [0];
    for (const d of datas) offsets.push(offsets[offsets.length - 1] + d.length);
    const arrayOff = 20 + 4 * (glyphCount + 1);
    return new Uint8Array([...be16(1), ...be16(0), ...be16(axisCount), ...be16(0), ...be32(0), ...be16(glyphCount), ...be16(1), ...be32(arrayOff),
        ...offsets.flatMap(be32), ...datas.flat()]);
}

/** HVAR: a one-axis store of `rows` (one delta each, region [0, 1, 1]) and an optional 1-byte advance map. */
function hvar(rows, map) {
    const regionList = [...be16(1), ...be16(1), ...f2(0), ...f2(1), ...f2(1)];
    const data = [...be16(rows.length), ...be16(1), ...be16(1), ...be16(0), ...rows.flatMap((v) => be16(v & 0xFFFF))];
    const ivs = [...be16(1), ...be32(12), ...be16(1), ...be32(12 + regionList.length), ...regionList, ...data];
    const mapBytes = map ? [0, 0x07, ...be16(map.length), ...map] : [];
    return new Uint8Array([...be16(1), ...be16(0), ...be32(20), ...be32(map ? 20 + ivs.length : 0), ...be32(0), ...be32(0), ...ivs, ...mapBytes]);
}

/** A square simple glyph: 4 on-curve points (0,0) (100,0) (100,100) (0,100), bbox xMin 0. */
const square = () => ({ kind: 'simple', bbox: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 }, numberOfContours: 1, endPtsOfContours: [3],
    points: [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => ({ x, y, onCurve: true })) });

function font({ glyphs = [square()], tables = {}, adv = 500, lsb = 0 } = {}) {
    const t = {};
    for (const [k, v] of Object.entries(tables)) if (v) t[k] = { bytes: v };
    return { rawSfnt: { tables: t }, glyphTable: glyphs, advanceWidth: () => adv, leftSideBearing: () => lsb };
}
const pts = (r) => r.path.commands.filter((c) => c.x !== undefined).map((c) => [c.x, c.y]);
const WGHT = fvar([['wght', 100, 400, 900]]);

describe('varGlyph — descriptor', () => {
    test('a strict factory descriptor, registered in the modules', () => {
        expect(varGlyph.name).toBe('varGlyph');
        expect(varGlyph.dependencies).toEqual(['fontErrors', 'tableFvar', 'tableAvar', 'tableGvar', 'tableHvar', 'varCoordsConvert', 'varInstance', 'varItemStore', 'fontCompositeResolve',
            'fontPath', 'tableCff', 'tableCff2']);
        expect(modules).toContain(varGlyph);
    });
});

describe('varGlyph — normalise', () => {
    test("user coordinates to fvar's normalised ones: the range, the default, a clamp", () => {
        const f = font({ tables: { fvar: fvar([['wght', 100, 400, 900], ['wdth', 50, 100, 100]]) } });
        expect(normalise(f, { wght: 900, wdth: 75 })).toEqual([1, -0.5]);
        expect(normalise(f, { wght: 650 })).toEqual([0.5, 0]);
        expect(normalise(f, { wght: 2000, wdth: 0 })).toEqual([1, -1]);
    });
    test("avar's segment maps; a tag may leave out its padding", () => {
        const f = font({ tables: { fvar: fvar([['HV', -1, 0, 1]]), avar: avar([[[-1, -1], [0, 0], [0.5, 0.25], [1, 1]]]) } });
        expect(normalise(f, { HV: 0.5 })).toEqual([0.25]);
        expect(normalise(f, { 'HV  ': 1 })).toEqual([1]);
    });
    test('bad coordinates throw fonts/var-bad-coords', () => {
        for (const c of [null, [], { wght: '400' }, { wght: NaN }]) {
            let err = null;
            try { normalise(font({ tables: { fvar: WGHT } }), c); } catch (e) { err = e; }
            expect([err instanceof ContractError, err && err.code]).toEqual([true, 'fonts/var-bad-coords']);
        }
    });
});

describe('varGlyph — glyphAt, the gvar tuples', () => {
    test('a tuple over all points (the 4 phantom ones included), scaled and rounded half up', () => {
        const g = gvar(1, 1, { 0: { tuples: [{ peak: [1], points: null, dx: [10, 10, 10, 10, 0, 20, 0, 0], dy: [0, 0, 5, 5, 0, 0, 0, 0] }] } });
        const f = font({ tables: { fvar: WGHT, gvar: g } });
        const r = glyphAt(f, 0, { wght: 650 });
        expect(pts(r)).toEqual([[5, 0], [105, 0], [105, 103], [5, 103]]);
        expect(r.advanceWidth).toBe(510);
        expect(pts(glyphAt(f, 0, { wght: 400 }))).toEqual([[0, 0], [100, 0], [100, 100], [0, 100]]);
    });
    test('private points: the untouched ones by IUP, interpolated inside the range and shifted outside it', () => {
        // Points 0 (0,0) and 2 (100,100) touched: 1 (100,0) takes x from 2, y from 0; 3 (0,100) the reverse.
        const g = gvar(1, 1, { 0: { tuples: [{ peak: [1], points: [0, 2], dx: [10, 30], dy: [-10, 50] }] } });
        expect(pts(glyphAt(font({ tables: { fvar: WGHT, gvar: g } }), 0, { wght: 900 }))).toEqual([[10, -10], [130, -10], [130, 150], [10, 150]]);
    });
    test('IUP between two neighbours at one coordinate: their delta when equal, else 0', () => {
        // Points 0 (0,0) and 1 (100,0) touched, both at y 0, with y deltas 20 and 40: 2 and 3 take y 0 + their shifts in x only.
        const g = gvar(1, 1, { 0: { tuples: [{ peak: [1], points: [0, 1], dx: [0, 0], dy: [20, 40] }] } });
        expect(pts(glyphAt(font({ tables: { fvar: WGHT, gvar: g } }), 0, { wght: 900 }))).toEqual([[0, 20], [100, 40], [100, 100], [0, 100]]);
        const h = gvar(1, 1, { 0: { tuples: [{ peak: [1], points: [0, 1], dx: [0, 0], dy: [30, 30] }] } });
        expect(pts(glyphAt(font({ tables: { fvar: WGHT, gvar: h } }), 0, { wght: 900 }))).toEqual([[0, 30], [100, 30], [100, 130], [0, 130]]);
    });
    test('one touched point shifts its whole contour; shared points serve the tuples without their own', () => {
        const g = gvar(1, 1, { 0: { shared: [2], tuples: [{ peak: [1], dx: [7], dy: [-3] }] } });
        expect(pts(glyphAt(font({ tables: { fvar: WGHT, gvar: g } }), 0, { wght: 900 }))).toEqual([[7, -3], [107, -3], [107, 97], [7, 97]]);
    });
    test('an intermediate region; a tuple whose scalar is 0 adds nothing', () => {
        const g = gvar(1, 1, { 0: { tuples: [{ peak: [0.5], start: [0], end: [1], points: [0], dx: [40], dy: [0] }] } });
        const f = font({ tables: { fvar: WGHT, gvar: g } });
        expect(pts(glyphAt(f, 0, { wght: 650 }))[0]).toEqual([40, 0]);
        expect(pts(glyphAt(f, 0, { wght: 775 }))[0]).toEqual([20, 0]);
        expect(pts(glyphAt(f, 0, { wght: 200 }))[0]).toEqual([0, 0]);
    });
    test("a composite's deltas move its components' offsets; each component is taken at the coordinates too", () => {
        const comp = { kind: 'composite', bbox: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 }, components: [{ glyphIndex: 0, arg1: 0, arg2: 0, xy: true, transform: { a: 1, b: 0, c: 0, d: 1 } }] };
        const g = gvar(1, 2, {
            0: { tuples: [{ peak: [1], points: [0], dx: [5], dy: [0] }] },
            1: { tuples: [{ peak: [1], points: [0], dx: [100], dy: [50] }] }
        });
        const r = glyphAt(font({ glyphs: [square(), comp], tables: { fvar: WGHT, gvar: g } }), 1, { wght: 900 });
        expect(pts(r)).toEqual([[105, 50], [205, 50], [205, 150], [105, 150]]);
    });
});

describe('varGlyph — glyphAt, the advances and the origin', () => {
    test("HVAR's delta replaces the phantom points: through its map, else the glyph index", () => {
        const g = gvar(1, 2, { 0: { tuples: [{ peak: [1], points: null, dx: [0, 0, 0, 0, 0, 99, 0, 0], dy: [0, 0, 0, 0, 0, 0, 0, 0] }] } });
        expect(glyphAt(font({ glyphs: [square(), square()], tables: { fvar: WGHT, gvar: g, HVAR: hvar([30, -40]) } }), 1, { wght: 650 }).advanceWidth).toBe(480);
        expect(glyphAt(font({ glyphs: [square(), square()], tables: { fvar: WGHT, gvar: g, HVAR: hvar([30, -40], [1, 1]) } }), 0, { wght: 900 }).advanceWidth).toBe(460);
    });
    test('the outline is shifted so that the left side bearing point sits at x = 0', () => {
        const g = gvar(1, 1, { 0: { tuples: [{ peak: [1], points: null, dx: [0, 0, 0, 0, 12, 12, 0, 0], dy: [0, 0, 0, 0, 0, 0, 0, 0] }] } });
        const r = glyphAt(font({ tables: { fvar: WGHT, gvar: g } }), 0, { wght: 900 });
        expect([pts(r)[0], r.advanceWidth]).toEqual([[-12, 0], 500]);
        expect(pts(glyphAt(font({ lsb: 10 }), 0, {}))[0]).toEqual([10, 0]);
    });
});

describe('varGlyph — fonts without variations, errors', () => {
    test('without fvar or gvar the default glyph; a gvar or HVAR that does not parse is not applied', () => {
        expect(pts(glyphAt(font(), 0, { wght: 900 }))).toEqual([[0, 0], [100, 0], [100, 100], [0, 100]]);
        const broken = font({ tables: { fvar: WGHT, gvar: new Uint8Array([0, 9]), HVAR: new Uint8Array([0, 1]) } });
        expect([pts(glyphAt(broken, 0, { wght: 900 }))[1], glyphAt(broken, 0, { wght: 900 }).advanceWidth]).toEqual([[100, 0], 500]);
        expect(variations(font({ tables: { fvar: WGHT } })).axes.map((a) => a.tag)).toEqual(['wght']);
    });
    test('a font with neither glyf nor CFF2 throws fonts/var-glyf-only', () => {
        let err = null;
        try { glyphAt({ rawSfnt: { tables: {} }, glyphTable: null, advanceWidth: () => 0 }, 0, {}); } catch (e) { err = e; }
        expect(err && err.code).toBe('fonts/var-glyf-only');
    });
});

// T14 (b), D39: a CFF2 glyph at coordinates, its blends through the font's variation store.
describe('varGlyph — glyphAt on a CFF2 font (T14 b)', () => {
    const op = (v) => v + 139;
    /** A one-axis store, one region [0, 1, 1], one item variation data over it (no rows). */
    const vstore = () => {
        const regionList = [...be16(1), ...be16(1), ...f2(0), ...f2(1), ...f2(1)];
        const data = [...be16(0), ...be16(0), ...be16(1), ...be16(0)];
        return [...be16(1), ...be32(12), ...be16(1), ...be32(12 + regionList.length), ...regionList, ...data];
    };
    /** CFF2: 0 0 rmoveto; 100 (+50) 1 blend 0 rlineto. `fds` empty Font DICTs (0: no FDArray). */
    function cff2({ fds = 0 } = {}) {
        const cs = [op(0), op(0), 21, op(100), op(50), op(1), 16, op(0), 5];
        const vs = vstore();
        const top = (csOff, vsOff, fdOff) => [28, ...be16(csOff), 17, 28, ...be16(vsOff), 24, ...(fds ? [28, ...be16(fdOff), 12, 36] : [])];
        const topLen = top(0, 0, 0).length;
        const head = 5 + topLen + 4;
        const charStrings = [...be32(1), 1, 1, 1 + cs.length, ...cs];
        const vsOff = head + charStrings.length;
        const fdOff = vsOff + 2 + vs.length;
        const fdArray = fds ? [...be32(fds), 1, ...Array(fds + 1).fill(1)] : [];
        return new Uint8Array([2, 0, 5, ...be16(topLen), ...top(head, vsOff, fdOff), ...be32(0), ...charStrings, ...be16(vs.length), ...vs, ...fdArray]);
    }
    const cffFont = (extra = {}) => ({ rawSfnt: { tables: { CFF2: { bytes: cff2(extra) }, fvar: { bytes: WGHT } } }, glyphTable: null, advanceWidth: () => 500 });

    test('the blend at the coordinates, the default without them', () => {
        expect(pts(glyphAt(cffFont(), 0, { wght: 900 }))).toEqual([[0, 0], [150, 0]]);
        expect(pts(glyphAt(cffFont(), 0, { wght: 650 }))).toEqual([[0, 0], [125, 0]]);
        expect(pts(glyphAt(cffFont(), 0, {}))).toEqual([[0, 0], [100, 0]]);
        expect(glyphAt(cffFont(), 0, { wght: 900 }).advanceWidth).toBe(500);
    });
    test("the advance from HVAR; a glyph the font lacks draws nothing", () => {
        const f = cffFont();
        f.rawSfnt.tables.HVAR = { bytes: hvar([30]) };
        expect(glyphAt(f, 0, { wght: 900 }).advanceWidth).toBe(530);
        expect(pts(glyphAt(cffFont(), 7, { wght: 900 }))).toEqual([]);
    });
    test('a CFF2 font with several Font DICTs throws fonts/var-cff2-fds; one is read', () => {
        let err = null;
        try { glyphAt(cffFont({ fds: 2 }), 0, {}); } catch (e) { err = e; }
        expect(err && err.code).toBe('fonts/var-cff2-fds');
        expect(pts(glyphAt(cffFont({ fds: 1 }), 0, { wght: 900 }))).toEqual([[0, 0], [150, 0]]);
    });
});
