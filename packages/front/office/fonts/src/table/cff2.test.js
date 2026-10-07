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
