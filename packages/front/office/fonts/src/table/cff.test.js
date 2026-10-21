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
