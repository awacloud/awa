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
