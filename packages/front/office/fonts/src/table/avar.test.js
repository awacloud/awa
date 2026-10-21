// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableAvar } from './avar.js';
import { testRuntime } from './_test-runtime.js';
const { parseAvar, applyAvarSegment } = testRuntime.resolve('tableAvar');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableAvar', () => {
    test('module metadata', () => { expect(tableAvar.name).toBe('tableAvar'); });

    test('parses single-axis segment map', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(0).writeUint16(1);
        // 3 positions: (-1,-1), (0, 0), (1, 1)
        w.writeUint16(3);
        w.writeF2Dot14(-1).writeF2Dot14(-1);
        w.writeF2Dot14(0).writeF2Dot14(0);
        w.writeF2Dot14(1).writeF2Dot14(1);
        const a = parseAvar(w.finalize());
        expect(a.segmentMaps.length).toBe(1);
        expect(a.segmentMaps[0].length).toBe(3);
        // Identity map â†’ applyAvarSegment is identity
        expect(applyAvarSegment(a.segmentMaps[0], 0.5)).toBeCloseTo(0.5, 4);
    });

    test('non-linear segment remaps the midpoint', () => {
        const map = [
            { fromCoord: 0, toCoord: 0 },
            { fromCoord: 1, toCoord: 0.25 }   // weight 700 maps to 25 % of weight range
        ];
        expect(applyAvarSegment(map, 0.5)).toBeCloseTo(0.125, 3);
    });

    test('empty map is identity', () => {
        expect(applyAvarSegment([], 0.42)).toBe(0.42);
    });

    test('rejects a major version other than 1 or 2', () => {
        for (const major of [0, 3]) {
            const w = new BinaryWriter();
            w.writeUint16(major).writeUint16(0).writeUint16(0).writeUint16(0);
            expect(() => parseAvar(w.finalize())).toThrow(expect.objectContaining({ code: 'fonts/avar-version' }));
        }
    });

    /** An avar table: header, one segment map per axis, then (version 2) the two offsets. */
    function avarBytes(major, maps, offsets, extra = 0) {
        const w = new BinaryWriter();
        w.writeUint16(major).writeUint16(0).writeUint16(0).writeUint16(maps.length);
        for (const m of maps) {
            w.writeUint16(m.length);
            for (const [from, to] of m) w.writeF2Dot14(from).writeF2Dot14(to);
        }
        if (offsets) w.writeUint32(offsets[0]).writeUint32(offsets[1]);
        for (let i = 0; i < extra; i++) w.writeUint8(0);
        return w.finalize();
    }
    const MAP = [[-1, -1], [0, 0], [0.5, 0.25], [1, 1]];

    test('version 2 (OpenType 1.9.1): the segment maps as in version 1, and the two offsets', () => {
        // 8 header + 2 + 16 segment map + 8 offsets = 34 bytes, then 6 bytes of payload
        const a = parseAvar(avarBytes(2, [MAP], [34, 37], 6));
        expect(a.majorVersion).toBe(2);
        expect(a.segmentMaps).toEqual([MAP.map(([fromCoord, toCoord]) => ({ fromCoord, toCoord }))]);
        expect(a.axisIndexMapOffset).toBe(34);
        expect(a.varStoreOffset).toBe(37);
        expect(applyAvarSegment(a.segmentMaps[0], 0.5)).toBeCloseTo(0.25, 4);
    });

    test('version 2: a null offset is 0; an offset past the table or a missing offset field is typed', () => {
        expect(parseAvar(avarBytes(2, [MAP], [0, 0])).varStoreOffset).toBe(0);
        expect(() => parseAvar(avarBytes(2, [MAP], [0, 34]))).toThrow(expect.objectContaining({ code: 'fonts/avar-bad-offset' }));
        expect(() => parseAvar(avarBytes(2, [MAP], null))).toThrow(expect.objectContaining({ code: 'fonts/avar-short' }));
        expect(() => parseAvar(avarBytes(2, [MAP], null))).toThrow(ParseError);
    });

    test('version 1 output is unchanged: no offset fields', () => {
        const a = parseAvar(avarBytes(1, [MAP], null));
        expect(Object.keys(a)).toEqual(['majorVersion', 'minorVersion', 'segmentMaps']);
    });
});
