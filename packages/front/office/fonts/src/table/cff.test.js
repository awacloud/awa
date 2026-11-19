// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCff } from './cff.js';
import { testRuntime } from './_test-runtime.js';
const { parseIndex, parseDict, decodeCharstring, subrBias } = testRuntime.resolve('tableCff');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

function buildIndex(items) {
    const w = new BinaryWriter();
    const count = items.length;
    w.writeUint16(count);
    if (count === 0) return w.finalize();
    let cur = 1;
    const offsets = [1];
    for (const it of items) { cur += it.length; offsets.push(cur); }
    // offSize: smallest representation
    const maxOff = offsets[offsets.length - 1];
    const offSize = maxOff <= 0xFF ? 1 : maxOff <= 0xFFFF ? 2 : 4;
    w.writeUint8(offSize);
    for (const o of offsets) {
        if (offSize === 1) w.writeUint8(o);
        else if (offSize === 2) w.writeUint16(o);
        else w.writeUint32(o);
    }
    for (const it of items) w.writeBytes(it);
    return w.finalize();
}

describe('tableCff', () => {
    test('module metadata', () => { expect(tableCff.name).toBe('tableCff'); });

    test('parseIndex empty', () => {
        const r = new BinaryReader(buildIndex([]));
        const idx = parseIndex(r);
        expect(idx.count).toBe(0);
    });

    test('parseIndex of three items', () => {
        const items = [new Uint8Array([1, 2, 3]), new Uint8Array([4]), new Uint8Array([5, 6])];
        const r = new BinaryReader(buildIndex(items));
        const idx = parseIndex(r);
        expect(idx.count).toBe(3);
        expect(idx.items.length).toBe(3);
        expect(Array.from(idx.items[0])).toEqual([1, 2, 3]);
        expect(Array.from(idx.items[1])).toEqual([4]);
        expect(Array.from(idx.items[2])).toEqual([5, 6]);
    });

    test('parseIndex rejects bad offSize', () => {
        const u = new Uint8Array([0, 1, 9, 1, 5]);
        expect(() => parseIndex(new BinaryReader(u))).toThrow(ParseError);
    });

    test('parseIndex refuses offsets that go backwards or past the data (typed, not a RangeError)', () => {
        const codeOf = (u) => { try { parseIndex(new BinaryReader(u)); } catch (e) { return e instanceof ParseError ? e.code : `untyped ${e.name}`; } return 'returned'; };
        // count 2, offSize 1, offsets [1, 4, 2]: item 1 would end before it starts.
        expect(codeOf(new Uint8Array([0, 2, 1, 1, 4, 2, 9, 9, 9]))).toBe('fonts/cff-index-bad-offset');
        // count 2, offSize 1, offsets [1, 9, 3]: item 0 ends past the last offset (the data length).
        expect(codeOf(new Uint8Array([0, 2, 1, 1, 9, 3, 9, 9, 9, 9, 9, 9, 9, 9]))).toBe('fonts/cff-index-bad-offset');
        // count 1, offSize 1, offsets [1, 0]: a data length of -1.
        expect(codeOf(new Uint8Array([0, 1, 1, 1, 0]))).toBe('fonts/cff-index-bad-offset');
        // Equal offsets (an empty item) stay valid.
        expect(codeOf(new Uint8Array([0, 2, 1, 1, 1, 2, 7]))).toBe('returned');
    });

    test('parseDict decodes integer operands', () => {
        // operand 100 (= 100+139=239 ... wait actually 100 = 139+(-39), but our encoding is b0-139 so 239 stays 100)
        // Encode `100` then op `0` (version)
        const u = new Uint8Array([100 + 139, 0]);  // operand 100, op 0
        const d = parseDict(u);
        expect(d.get(0)).toEqual([100]);
    });

    test('parseDict decodes 2-byte int (28)', () => {
        const u = new Uint8Array([28, 0x12, 0x34, 0]);
        const d = parseDict(u);
        expect(d.get(0)).toEqual([0x1234]);
    });

    test('parseDict decodes 4-byte int (29)', () => {
        const u = new Uint8Array([29, 0, 1, 0, 0, 0]);
        const d = parseDict(u);
        expect(d.get(0)).toEqual([0x10000]);
    });

    test('parseDict decodes two-byte operator (12 + sub)', () => {
        const u = new Uint8Array([139 + 5, 12, 2]);   // operand 5, op 0x0C02 ItalicAngle
        const d = parseDict(u);
        expect(d.get(0x0C02)).toEqual([5]);
    });

    test('parseDict decodes real number (30 ... 0xF)', () => {
        // "3.14" â†’ nibbles 3, A(.), 1, 4, F
        const u = new Uint8Array([30, 0x3A, 0x14, 0xFF, 0]);
        const d = parseDict(u);
        const v = d.get(0)[0];
        expect(v).toBeCloseTo(3.14, 2);
    });

    test('subrBias values per spec', () => {
        expect(subrBias(0)).toBe(107);
        expect(subrBias(1000)).toBe(107);
        expect(subrBias(2000)).toBe(1131);
        expect(subrBias(40000)).toBe(32768);
    });

    test('decodeCharstring basic rmoveto + rlineto + endchar', () => {
        // operands: 100 50, op 21 (rmoveto); 200 0, op 5 (rlineto); op 14 (endchar)
        const u = new Uint8Array([
            100 + 139, 50 + 139, 21,
            200 - 139 + 0xFF, /* won't work â€” use direct encoding */
            5,
            14
        ]);
        // Simpler: just operand 200 = 200+139 = needs 339, can't fit in single byte.
        // Use 28-encoded 200 instead:
        const u2 = new Uint8Array([
            100 + 139, 50 + 139, 21,    // rmoveto (100, 50)
            28, 0, 200, 28, 0, 0, 5,    // rlineto (200, 0)
            14                           // endchar
        ]);
        const r = decodeCharstring(u2);
        expect(r.commands[0]).toEqual({ type: 'M', x: 100, y: 50 });
        expect(r.commands[1]).toEqual({ type: 'L', x: 300, y: 50 });
    });

    test('decodeCharstring handles callsubr', () => {
        // Build a local subr that emits rlineto (10, 0) then return
        const subr = new Uint8Array([10 + 139, 0 + 139, 5, 11]);
        // Main: operands push 0 then callsubr (= -107 + bias 107 = 0)
        const main = new Uint8Array([
            100 + 139, 50 + 139, 21,    // rmoveto (100, 50)
            0 - 107 + 139, 10,           // operand 0, callsubr (op 10)
            14
        ]);
        // operand 0 encoding: 0+139 = 139; then op 10 = callsubr
        // Push -107 (encoding b0 = 32 maps to 32-139 = -107) so subrIndex
        // = -107 + bias(1) = -107 + 107 = 0.
        const main2 = new Uint8Array([
            100 + 139, 50 + 139, 21,
            32, 10,                       // push -107, callsubr
            14
        ]);
        const r = decodeCharstring(main2, { localSubrs: [subr], nominalWidthX: 0 });
        expect(r.commands[0]).toEqual({ type: 'M', x: 100, y: 50 });
        expect(r.commands[1]).toEqual({ type: 'L', x: 110, y: 50 });
    });
});

/** A charstring operand: one byte for -107..107, else the 28 short form. */
function num(v) {
    if (v >= -107 && v <= 107) return [v + 139];
    return [28, (v >> 8) & 0xff, v & 0xff];
}
/** A charstring from operand lists and operators: `cs([1, 2], 21, [3], 14)`. */
function cs(...parts) {
    const out = [];
    for (const p of parts) {
        if (Array.isArray(p)) for (const v of p) out.push(...num(v));
        else if (p >= 0x0c00) out.push(12, p & 0xff);
        else out.push(p);
    }
    return new Uint8Array(out);
}
const C = (x1, y1, x2, y2, x, y) => ({ type: 'C', x1, y1, x2, y2, x, y });

describe('decodeCharstring — line and curve operators (A67)', () => {
    test('rlinecurve: every pair but the last six is a line, then one curve', () => {
        const r = decodeCharstring(cs([0, 0], 21, [10, 0, 10, 10, 10, 10, 10, 0], 25, 14));
        expect(r.commands).toEqual([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, C(20, 10, 30, 20, 40, 20)]);
        const two = decodeCharstring(cs([0, 0], 21, [5, 0, 0, 5, 10, 10, 10, 10, 10, 0], 25, 14));
        expect(two.commands.map((c) => c.type)).toEqual(['M', 'L', 'L', 'C']);
        expect(two.commands[3]).toEqual(C(15, 15, 25, 25, 35, 25));
    });

    test('hvcurveto and vhcurveto: the optional last argument belongs to the last curve only', () => {
        const hv = decodeCharstring(cs([0, 0], 21, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 5], 31, 14));
        expect(hv.commands.slice(1)).toEqual([C(10, 0, 30, 30, 30, 70), C(30, 120, 90, 190, 170, 190), C(260, 190, 360, 300, 365, 420)]);
        const vh = decodeCharstring(cs([0, 0], 21, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 5], 30, 14));
        expect(vh.commands.slice(1)).toEqual([C(0, 10, 20, 40, 60, 40), C(110, 40, 170, 110, 170, 190), C(170, 280, 270, 390, 390, 395)]);
        const even = decodeCharstring(cs([0, 0], 21, [10, 20, 30, 40, 50, 60, 70, 80, 7], 31, 14));
        expect(even.commands.slice(1)).toEqual([C(10, 0, 30, 30, 30, 70), C(30, 120, 90, 190, 170, 197)]);
    });

    test('the four flex operators draw their two curves', () => {
        const flex = decodeCharstring(cs([0, 0], 21, [10, 10, 20, 20, 30, 0, 40, -10, 50, -20, 60, 0, 50], 0x0c23, 14));
        expect(flex.commands.slice(1)).toEqual([C(10, 10, 30, 30, 60, 30), C(100, 20, 150, 0, 210, 0)]);
        const hflex = decodeCharstring(cs([0, 0], 21, [10, 20, 30, 40, 50, 60, 70], 0x0c22, 14));
        expect(hflex.commands.slice(1)).toEqual([C(10, 0, 30, 30, 70, 30), C(120, 30, 180, 0, 250, 0)]);
        const hflex1 = decodeCharstring(cs([0, 0], 21, [10, 5, 20, 10, 30, 40, 50, -5, 60], 0x0c24, 14));
        expect(hflex1.commands.slice(1)).toEqual([C(10, 5, 30, 15, 60, 15), C(100, 15, 150, 10, 210, 0)]);
        const flex1 = decodeCharstring(cs([0, 0], 21, [10, 10, 20, 20, 30, 0, 40, -10, 50, -20, 60], 0x0c25, 14));
        expect(flex1.commands.slice(1)).toEqual([C(10, 10, 30, 30, 60, 30), C(100, 20, 150, 0, 210, 0)]);
        // flex1 with the larger vertical travel: the last argument is dy, dx returns to the start.
        const vflex1 = decodeCharstring(cs([0, 0], 21, [10, 10, 20, 20, 0, 30, -10, 40, -20, 50, 60], 0x0c25, 14));
        expect(vflex1.commands[2]).toEqual(C(20, 100, 0, 150, 0, 210));
    });
});

/** A CFF INDEX with 1-byte offsets (`count`, `offSize`, offsets, data). */
function index(items) {
    if (items.length === 0) return [0, 0];
    const out = [items.length >> 8, items.length & 0xff, 1];
    let at = 1;
    out.push(at);
    for (const it of items) { at += it.length; out.push(at); }
    for (const it of items) out.push(...it);
    return out;
}
/** A DICT operand as a 5-byte integer (op 29), so sizes never depend on values. */
const int5 = (v) => [29, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

describe('CID-keyed CFF — FDArray, FDSelect, privateForGlyph', () => {
    const { parseCff, privateForGlyph } = testRuntime.resolve('tableCff');

    const LINE = (dx) => [139, 139, 21, dx + 139, 139, 5, 11]; // 0 0 rmoveto, dx 0 rlineto, return
    const GLYPH = [32, 10, 14];                                // -107 callsubr (subr 0), endchar

    /**
     * A CID-keyed CFF of three glyphs and two Font DICTs; FD0's subr 0 draws
     * a 50-unit line, FD1's a 100-unit one. `fdSelect` is its raw table.
     */
    function cidCff(fdSelect, { fdArray = true } = {}) {
        const header = [1, 0, 4, 1];
        const name = index([[0x41]]);
        const strings = index([[0x41, 0x64], [0x49, 0x64]]); // 'Ad', 'Id'
        const gsubrs = index([]);
        const charStrings = index([GLYPH, GLYPH, GLYPH]);
        // Top DICT size is fixed: ROS (3 operands), CharStrings, FDArray, FDSelect.
        const topLen = 3 * 5 + 2 + 5 + 1 + 5 + 2 + 5 + 2;
        const topIndexLen = 2 + 1 + 2 + topLen;
        let at = header.length + name.length + topIndexLen + strings.length + gsubrs.length;
        const csAt = at; at += charStrings.length;
        const selAt = at; at += fdSelect.length;
        const subrIndexes = [LINE(50), LINE(100)].map((sub) => index([sub]));
        // Private DICT: `Subrs` (19) with one 5-byte operand, 6 bytes; its INDEX follows it.
        const privLen = 6;
        const fdItems = [];
        const privBlocks = [];
        const fdArrayLen = 2 + 1 + 3 + 2 * (5 + 5 + 1);
        const fdAt = at; at += fdArrayLen;
        for (const subrs of subrIndexes) {
            fdItems.push([...int5(privLen), ...int5(at), 18]);
            privBlocks.push(...int5(privLen), 19, ...subrs);
            at += privLen + subrs.length;
        }
        // Without an FDArray the same bytes hold CIDFontVersion (12 34), so every offset stays put.
        const top = [...int5(391), ...int5(392), ...int5(0), 12, 30, ...int5(csAt), 17,
            ...int5(fdAt), 12, fdArray ? 36 : 34, ...int5(selAt), 12, 37];
        const bytes = [...header, ...name, ...index([top]), ...strings, ...gsubrs, ...charStrings,
            ...fdSelect, ...index(fdItems), ...privBlocks];
        return new Uint8Array(bytes);
    }

    const FORMAT3 = [3, 0, 2, 0, 0, 0, 0, 1, 1, 0, 3]; // gid 0 → FD0, gids 1..2 → FD1, sentinel 3
    const FORMAT0 = [0, 1, 0, 1];                      // gid 0 → FD1, gid 1 → FD0, gid 2 → FD1
    const lineOf = (font, cff, gid) => {
        const p = privateForGlyph(font, gid);
        const cmds = decodeCharstring(font.charStringsIndex.items[gid], {
            globalSubrs: cff.globalSubrIndex.items, localSubrs: p.localSubrIndex ? p.localSubrIndex.items : []
        }).commands;
        return cmds.find((c) => c.type === 'L' || c.op === 'lineTo' || c[0] === 'L');
    };

    test('FDArray: one Font DICT per entry, with its Private DICT and local subroutines', () => {
        const cff = parseCff(cidCff(FORMAT3));
        const f = cff.fonts[0];
        expect(f.fdArray.length).toBe(2);
        for (const fd of f.fdArray) {
            expect(fd.fontDict).toBeInstanceOf(Map);
            expect(fd.privateDict.get(19)).toEqual([6]);
            expect(fd.localSubrIndex.count).toBe(1);
        }
    });

    test('FDSelect format 3 and format 0: the Font DICT of every glyph', () => {
        expect(Array.from(parseCff(cidCff(FORMAT3)).fonts[0].fdSelect)).toEqual([0, 1, 1]);
        expect(Array.from(parseCff(cidCff(FORMAT0)).fonts[0].fdSelect)).toEqual([1, 0, 1]);
    });

    test('privateForGlyph: each glyph decodes through its own Font DICT subroutine', () => {
        const cff = parseCff(cidCff(FORMAT3));
        const f = cff.fonts[0];
        expect(privateForGlyph(f, 0).localSubrIndex).toBe(f.fdArray[0].localSubrIndex);
        expect(privateForGlyph(f, 2).privateDict).toBe(f.fdArray[1].privateDict);
        expect(JSON.stringify(lineOf(f, cff, 0))).not.toBe(JSON.stringify(lineOf(f, cff, 1)));
        expect(JSON.stringify(lineOf(f, cff, 1))).toBe(JSON.stringify(lineOf(f, cff, 2)));
    });

    test('a name-keyed font: both fields null, privateForGlyph gives the Top DICT private', () => {
        const f = parseCff(cidCff(FORMAT3, { fdArray: false })).fonts[0];
        expect([f.fdArray, f.fdSelect]).toEqual([null, null]);
        expect(privateForGlyph(f, 1)).toEqual({ privateDict: f.privateDict, localSubrIndex: f.localSubrIndex });
    });

    test('malformed FDSelect gives null, never a throw; privateForGlyph falls back', () => {
        for (const sel of [[3, 0, 1, 0, 0, 5, 0, 3], [7, 0, 0, 0], [3, 0, 2, 0, 0], [3, 0, 1, 0, 1, 0, 0, 3]]) {
            const f = parseCff(cidCff(sel)).fonts[0];
            expect(f.fdSelect).toBe(null);
            expect(privateForGlyph(f, 0)).toEqual({ privateDict: f.privateDict, localSubrIndex: f.localSubrIndex });
        }
    });
});

describe('CFF charset and glyph names', () => {
    const { parseCff, CFF_STANDARD_STRINGS } = testRuntime.resolve('tableCff');
    const GLYPH = [14];
    /**
     * A one-font CFF of `n` glyphs whose Top DICT names `charset` at the
     * charset bytes (or the predefined `charsetOffset`), with `strings` in
     * its String INDEX and, with `cid`, a ROS making it CID-keyed.
     */
    function cffWith({ n, charset = [], charsetOffset = null, strings = [], cid = false }) {
        const header = [1, 0, 4, 1];
        const name = index([[0x41]]);
        const stringIndex = index(strings.map((t) => [...t].map((c) => c.charCodeAt(0))));
        const gsubrs = index([]);
        const charStrings = index(Array.from({ length: n }, () => GLYPH));
        const topLen = (cid ? 17 : 0) + 6 + 6;
        let at = header.length + name.length + (2 + 1 + 2 + topLen) + stringIndex.length + gsubrs.length;
        const csAt = at; at += charStrings.length;
        const csetAt = charsetOffset === null ? at : charsetOffset;
        const top = [...(cid ? [...int5(391), ...int5(392), ...int5(0), 12, 30] : []),
            ...int5(csAt), 17, ...int5(csetAt), 15];
        return new Uint8Array([...header, ...name, ...index([top]), ...stringIndex, ...gsubrs, ...charStrings, ...charset]);
    }
    const u16 = (v) => [v >> 8, v & 0xff];

    test('the 391 standard strings of the CFF specification, frozen', () => {
        expect(CFF_STANDARD_STRINGS.length).toBe(391);
        expect([CFF_STANDARD_STRINGS[0], CFF_STANDARD_STRINGS[34], CFF_STANDARD_STRINGS[390]]).toEqual(['.notdef', 'A', 'Semibold']);
        expect(Object.isFrozen(CFF_STANDARD_STRINGS)).toBe(true);
    });

    test('format 0: the SID of every glyph, names from both string pools', () => {
        const f = parseCff(cffWith({ n: 3, charset: [0, ...u16(34), ...u16(391)], strings: ['uni82A6_uE0100'] })).fonts[0];
        expect(Array.from(f.charset)).toEqual([0, 34, 391]);
        expect(f.glyphNames).toEqual(['.notdef', 'A', 'uni82A6_uE0100']);
    });

    test('formats 1 and 2: ranges', () => {
        const f1 = parseCff(cffWith({ n: 4, charset: [1, ...u16(34), 1, ...u16(391), 0], strings: ['x'] })).fonts[0];
        expect(f1.glyphNames).toEqual(['.notdef', 'A', 'B', 'x']);
        const f2 = parseCff(cffWith({ n: 4, charset: [2, ...u16(66), ...u16(2)] })).fonts[0];
        expect(f2.glyphNames).toEqual(['.notdef', 'a', 'b', 'c']);
    });

    test('the predefined ISOAdobe charset (offset 0)', () => {
        const f = parseCff(cffWith({ n: 3, charsetOffset: 0 })).fonts[0];
        expect(f.glyphNames).toEqual(['.notdef', 'space', 'exclam']);
    });

    test('a CID-keyed font: the CID of every glyph, no names', () => {
        const f = parseCff(cffWith({ n: 3, charset: [0, ...u16(7), ...u16(9)], cid: true })).fonts[0];
        expect(Array.from(f.charset)).toEqual([0, 7, 9]);
        expect(f.glyphNames).toBe(null);
    });

    test('the predefined Expert and ExpertSubset charsets (T17 b)', () => {
        expect(parseCff(cffWith({ n: 3, charsetOffset: 1 })).fonts[0].glyphNames).toEqual(['.notdef', 'space', 'exclamsmall']);
        expect(parseCff(cffWith({ n: 3, charsetOffset: 2 })).fonts[0].glyphNames).toEqual(['.notdef', 'space', 'dollaroldstyle']);
        expect(parseCff(cffWith({ n: 200, charsetOffset: 2 })).fonts[0].charset).toBe(null);
    });

    test('an unknown format, a truncated table or a missing string give null', () => {
        for (const opts of [{ n: 3, charset: [7, 0, 1] }, { n: 3, charset: [0, 0] },
            { n: 3, charset: [0, ...u16(34), ...u16(400)], strings: ['x'] }]) {
            expect(parseCff(cffWith(opts)).fonts[0].glyphNames).toBe(null);
        }
        expect(parseCff(cffWith({ n: 3, charset: [7, 0, 1] })).fonts[0].charset).toBe(null);
    });
});

describe('decodeCharstring — seac (an endchar with four or five operands)', () => {
    /** A Type 2 number (-107..1131), one or two bytes. */
    const num = (v) => (v >= -107 && v <= 107 ? [v + 139] : [247 + ((v - 108) >> 8), (v - 108) & 0xff]);
    const SEAC = (width) => [...(width === undefined ? [] : num(width)), ...num(100), ...num(200), ...num(65), ...num(193), 14];
    const BASE = [...num(0), ...num(0), 21, ...num(10), ...num(0), 5, 14];   // 0 0 rmoveto, 10 0 rlineto
    const ACCENT = [...num(0), ...num(0), 21, ...num(0), ...num(10), 5, 14]; // 0 0 rmoveto, 0 10 rlineto
    const glyphs = { 65: BASE, 193: ACCENT };

    test('five operands: the width first, then adx ady bchar achar', () => {
        const r = decodeCharstring(new Uint8Array(SEAC(500)), {});
        expect(r.width).toBe(500);
        expect(r.seac).toEqual({ adx: 100, ady: 200, bchar: 65, achar: 193 });
        expect(r.commands).toEqual([]);
    });

    test('four operands: no width', () => {
        const r = decodeCharstring(new Uint8Array(SEAC()), {});
        expect(r.width).toBe(undefined);
        expect(r.seac).toEqual({ adx: 100, ady: 200, bchar: 65, achar: 193 });
    });

    test('with seacGlyph: the base glyph, then the accent translated by (adx, ady)', () => {
        const r = decodeCharstring(new Uint8Array(SEAC(500)), { seacGlyph: (code) => (glyphs[code] ? new Uint8Array(glyphs[code]) : null) });
        expect(r.commands).toEqual([
            { type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 },
            { type: 'M', x: 100, y: 200 }, { type: 'L', x: 100, y: 210 }
        ]);
        expect(r.width).toBe(500);
    });

    test('a code seacGlyph cannot resolve: nothing composed, the seac still reported', () => {
        const r = decodeCharstring(new Uint8Array(SEAC(500)), { seacGlyph: (code) => (code === 65 ? new Uint8Array(BASE) : null) });
        expect(r.commands).toEqual([]);
        expect(r.seac.achar).toBe(193);
    });

    test('a one-operand endchar still reads its width; no seac', () => {
        const r = decodeCharstring(new Uint8Array([...num(300), 14]), {});
        expect(r.width).toBe(300);
        expect(r.seac).toBe(undefined);
    });
});
