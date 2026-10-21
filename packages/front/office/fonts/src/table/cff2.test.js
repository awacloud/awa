// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCff2 } from './cff2.js';
import { testRuntime } from './_test-runtime.js';
const { parseCff2, parseCff2Index } = testRuntime.resolve('tableCff2');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableCff2', () => {
    test('module metadata', () => { expect(tableCff2.name).toBe('tableCff2'); });

    test('parseCff2Index empty', () => {
        const u = new Uint8Array([0, 0, 0, 0]);     // count=0 (uint32)
        const r = new BinaryReader(u);
        const idx = parseCff2Index(r);
        expect(idx.count).toBe(0);
    });

    test('parseCff2Index with 2 items', () => {
        const w = new BinaryWriter();
        w.writeUint32(2).writeUint8(1).writeUint8(1).writeUint8(3).writeUint8(5);
        w.writeUint8(0xAA).writeUint8(0xBB).writeUint8(0xCC).writeUint8(0xDD);
        const r = new BinaryReader(w.finalize());
        const idx = parseCff2Index(r);
        expect(idx.count).toBe(2);
        expect(Array.from(idx.items[0])).toEqual([0xAA, 0xBB]);
        expect(Array.from(idx.items[1])).toEqual([0xCC, 0xDD]);
    });

    test('parseCff2Index refuses a count the bytes cannot hold, and offsets that go backwards (typed, not a RangeError)', () => {
        const codeOf = (u) => { try { parseCff2Index(new BinaryReader(u)); } catch (e) { return e instanceof ParseError ? e.code : `untyped ${e.name}`; } return 'returned'; };
        // count 0xFFFFFFFF, offSize 1, then a few bytes: no array of 2^32 slots is attempted.
        expect(codeOf(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 1, 1, 2, 3]))).toBe('fonts/cff2-index-truncated');
        // count 2, offSize 1, offsets [1, 4, 2].
        expect(codeOf(new Uint8Array([0, 0, 0, 2, 1, 1, 4, 2, 9, 9, 9]))).toBe('fonts/cff2-index-bad-offset');
        // count 1, offSize 1, offsets [1, 0]: a data length of -1.
        expect(codeOf(new Uint8Array([0, 0, 0, 1, 1, 1, 0]))).toBe('fonts/cff2-index-bad-offset');
        // An empty item stays valid.
        expect(codeOf(new Uint8Array([0, 0, 0, 2, 1, 1, 1, 2, 7]))).toBe('returned');
    });

    test('parses header + empty top DICT + empty global subrs', () => {
        const w = new BinaryWriter();
        w.writeUint8(2).writeUint8(0);     // major minor
        w.writeUint8(5);                    // headerSize
        w.writeUint16(0);                   // topDictLength = 0
        // Global Subr INDEX (count = 0)
        w.writeUint32(0);
        const c = parseCff2(w.finalize());
        expect(c.majorVersion).toBe(2);
        expect(c.globalSubrIndex.count).toBe(0);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint8(1).writeUint8(0).writeUint8(5).writeUint16(0);
        expect(() => parseCff2(w.finalize())).toThrow(ParseError);
    });
});

/**
 * A minimal variable CFF2 table, laid out by hand (offsets as 5-byte int
 * operands so the layout is fixed):
 *   header 5 · Top DICT 19 · Global Subr INDEX 4 (empty) ·
 *   CharStrings INDEX 8 @28 · FDArray INDEX 18 @36 · Private DICT 5 @54 ·
 *   VariationStore 14 @59 (uint16 length 12 + an empty Item Variation Store).
 */
function variableCff2() {
    const int32 = (v) => [29, (v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
    const u32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
    const top = [...int32(28), 17, ...int32(36), 12, 36, ...int32(59), 24];
    const fontDict = [...int32(5), ...int32(54), 18];
    const priv = [0x8B, 22, 0x8B, 0x8B, 6];                 // vsindex 0, BlueValues [0 0]
    const ivs = [0, 1, ...u32(8), 0, 0, 0, 0, 0, 0];         // format 1, regions @8, 0 data; 0 axes, 0 regions
    return new Uint8Array([
        2, 0, 5, 0, top.length, ...top,
        ...u32(0),                                           // Global Subr INDEX
        ...u32(1), 1, 1, 2, 0x8B,                            // CharStrings: one glyph
        ...u32(1), 1, 1, 1 + fontDict.length, ...fontDict,   // FDArray: one Font DICT
        ...priv,
        0, ivs.length, ...ivs,
    ]);
}

describe('tableCff2 — variable fonts (Top DICT operators, FDArray, vstore)', () => {
    const { CFF2_TOP_DICT_OPS } = testRuntime.resolve('tableCff2');

    test('the fixture is laid out as documented', () => {
        const b = variableCff2();
        expect(b.length).toBe(73);
        expect(b[54]).toBe(0x8B);
    });

    test('Top DICT operator labels follow the CFF2 spec', () => {
        expect(CFF2_TOP_DICT_OPS).toEqual({
            17: 'CharStrings', 24: 'vstore',
            0x0C07: 'FontMatrix', 0x0C24: 'FDArray', 0x0C25: 'FDSelect',
        });
    });

    test('a Top DICT with a vstore operator parses', () => {
        const c = parseCff2(variableCff2());
        expect(c.topDict.get(24)).toEqual([59]);
        expect(c.charStringsIndex.count).toBe(1);
    });

    test('vstore holds the Item Variation Store bytes and their declared length', () => {
        const c = parseCff2(variableCff2());
        expect(c.vstore.offset).toBe(59);
        expect(c.vstore.length).toBe(12);
        expect(Array.from(c.vstore.data)).toEqual([0, 1, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]);
        expect(c.vstoreOffset).toBe(59);
    });

    test('fdArray holds each Font DICT and its Private DICT range', () => {
        const c = parseCff2(variableCff2());
        expect(c.fdArray).toHaveLength(1);
        const fd = c.fdArray[0];
        expect(fd.fontDict.get(18)).toEqual([5, 54]);
        expect(fd.private.size).toBe(5);
        expect(fd.private.offset).toBe(54);
        expect(Array.from(fd.private.bytes)).toEqual([0x8B, 22, 0x8B, 0x8B, 6]);
        expect(fd.private.dict.get(22)).toEqual([0]);
        expect(fd.private.dict.get(6)).toEqual([0, 0]);
    });

    test('a vstore range past the table end is a typed error', () => {
        const b = variableCff2();
        b[59] = 0x40;                                        // declared length 16 KiB + 12
        expect(() => parseCff2(b)).toThrow(ParseError);
    });

    test('a CFF1 DICT still rejects the CFF2-only operator bytes', () => {
        const { parseDict } = testRuntime.resolve('tableCffDict');
        expect(() => parseDict(new Uint8Array([0x8B, 24]))).toThrow(ParseError);
        expect(parseDict(new Uint8Array([0x8B, 24]), { cff2: true }).get(24)).toEqual([0]);
    });
});
