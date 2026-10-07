// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableGvar } from './gvar.js';
import { testRuntime } from './_test-runtime.js';
const { unpackPointNumbers, unpackDeltas, parseGvar } = testRuntime.resolve('tableGvar');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableGvar', () => {
    test('module metadata', () => { expect(tableGvar.name).toBe('tableGvar'); });

    test('unpackPointNumbers all points (0)', () => {
        const { points, bytesConsumed } = unpackPointNumbers(new Uint8Array([0]), 0);
        expect(points).toEqual([]);
        expect(bytesConsumed).toBe(1);
    });

    test('unpackPointNumbers short count + bytes deltas', () => {
        // count = 3, then control byte 0x02 (3 bytes, 8-bit deltas), 3 bytes : 5, 2, 7
        const u = new Uint8Array([3, 0x02, 5, 2, 7]);
        const { points, bytesConsumed } = unpackPointNumbers(u, 0);
        expect(points).toEqual([5, 7, 14]);
        expect(bytesConsumed).toBe(5);
    });

    test('unpackDeltas zero run + byte run', () => {
        // 2 zeros, then 2 byte values 10, 20
        const u = new Uint8Array([0x81, 0x01, 10, 20]);   // 0x80|0x01 = 2 zeros ; 0x01 = 2 bytes
        const { deltas, bytesConsumed } = unpackDeltas(u, 0, 4);
        expect(deltas).toEqual([0, 0, 10, 20]);
        expect(bytesConsumed).toBe(4);
    });

    test('parseGvar header', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);             // version
        w.writeUint16(1);                              // axisCount
        w.writeUint16(0);                              // sharedTupleCount
        w.writeUint32(0);                              // sharedTuplesOffset
        w.writeUint16(2);                              // glyphCount
        w.writeUint16(0);                              // flags (short offsets)
        w.writeUint32(40);                              // glyphVariationDataArrayOffset
        // Short offsets: 3 entries (gid 0, 1, end)
        w.writeUint16(0).writeUint16(0).writeUint16(0);
        const g = parseGvar(w.finalize());
        expect(g.glyphCount).toBe(2);
        expect(g.axisCount).toBe(1);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0); for (let i = 0; i < 9; i++) w.writeUint16(0);
        expect(() => parseGvar(w.finalize())).toThrow(ParseError);
    });
});
