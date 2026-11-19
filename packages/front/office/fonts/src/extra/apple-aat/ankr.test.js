// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatAnkr } from './ankr.js';
import { testRuntime } from '../_test-runtime.js';
import { be16, be32, lookup6 } from './_test-aat.js';
const { parseAnkr, readAnchorBlock } = testRuntime.resolve('aatAnkr');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('aatAnkr', () => {
    test('module metadata', () => {
        expect(aatAnkr.name).toBe('aatAnkr');
        expect(aatAnkr.dependencies).toEqual(['fontErrors', 'fontReader', 'aatLookup']);
    });

    test('parses header and slices regions', () => {
        const w = new BinaryWriter();
        // header
        w.writeUint16(0).writeUint16(0);
        const lookupOffPos = w.pos; w.writeUint32(0);
        const dataOffPos   = w.pos; w.writeUint32(0);

        // lookup region â€” format 0 stub
        const lookupOff = w.pos;
        w.writeUint16(0);                      // format 0 marker
        w.writeUint16(0).writeUint16(0);       // arbitrary lookup payload

        // glyph data region â€” one block with 2 anchors
        const dataOff = w.pos;
        w.writeUint32(2);
        w.writeInt16(100).writeInt16(-50);
        w.writeInt16(200).writeInt16(75);

        const out = w.finalize();
        // patch offsets
        const writeU32 = (pos, v) => {
            out[pos]     = (v >>> 24) & 0xFF;
            out[pos + 1] = (v >>> 16) & 0xFF;
            out[pos + 2] = (v >>>  8) & 0xFF;
            out[pos + 3] =  v         & 0xFF;
        };
        writeU32(lookupOffPos, lookupOff);
        writeU32(dataOffPos,   dataOff);

        const a = parseAnkr(out);
        expect(a.version).toBe(0);
        expect(a.lookupFormat).toBe(0);
        expect(a.lookupBytes.length).toBe(dataOff - lookupOff);
        expect(a.glyphDataBytes.length).toBe(out.length - dataOff);

        const anchors = readAnchorBlock(a.glyphDataBytes, 0);
        expect(anchors).toEqual([{ x: 100, y: -50 }, { x: 200, y: 75 }]);
    });

    test('rejects short buffer', () => {
        expect(() => parseAnkr(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint32(12).writeUint32(12);
        expect(() => parseAnkr(w.finalize())).toThrow(ParseError);
    });
});

// T15 (c), D38: a glyph's anchors through the lookup.
describe('aatAnkr — anchors (T15 c)', () => {
    const ankr = (map, blocks) => {
        const lk = lookup6(map);
        const data = blocks.flatMap((pts) => [...be32(pts.length), ...pts.flatMap(([x, y]) => [...be16(x & 0xFFFF), ...be16(y & 0xFFFF)])]);
        return new Uint8Array([...be16(0), ...be16(0), ...be32(12), ...be32(12 + lk.length), ...lk, ...data]);
    };
    test("anchors(glyph): the block at the glyph's lookup value; [] without one", () => {
        const a = parseAnkr(ankr({ 3: 0, 4: 12 }, [[[10, -20], [30, 40]], [[5, 6]]]));
        expect(a.anchors(3)).toEqual([{ x: 10, y: -20 }, { x: 30, y: 40 }]);
        expect(a.anchors(4)).toEqual([{ x: 5, y: 6 }]);
        expect(a.anchors(5)).toEqual([]);
    });
    test('a block or a lookup that does not decode gives []', () => {
        expect(parseAnkr(ankr({ 3: 400 }, [[[1, 1]]])).anchors(3)).toEqual([]);
        const bad = new Uint8Array([...be16(0), ...be16(0), ...be32(12), ...be32(16), 0, 3, 0, 0, 0, 0, 0, 0]);
        expect(parseAnkr(bad).anchors(1)).toEqual([]);
    });
});
