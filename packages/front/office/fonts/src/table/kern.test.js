// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableKern } from './kern.js';
import { testRuntime } from './_test-runtime.js';
const { parseKern } = testRuntime.resolve('tableKern');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

function buildMsKernFormat0(pairs) {
    const w = new BinaryWriter();
    // Top header
    w.writeUint16(0);                  // version
    w.writeUint16(1);                  // nTables
    // Subtable header
    w.writeUint16(0);                  // subtable version
    const lenPos = w.pos; w.writeUint16(0);   // length placeholder
    w.writeUint16(0 << 8);             // coverage: format=0 horizontal
    // Format 0 body
    w.writeUint16(pairs.length);
    w.writeUint16(0); w.writeUint16(0); w.writeUint16(0); // search/entry/range
    for (const p of pairs) {
        w.writeUint16(p.left); w.writeUint16(p.right); w.writeInt16(p.value);
    }
    const out = w.finalize();
    // Patch length (subtable size, including the 6 header bytes)
    const subLen = out.length - 4;     // total - top header
    out[lenPos] = (subLen >>> 8) & 0xFF;
    out[lenPos + 1] = subLen & 0xFF;
    return out;
}

describe('tableKern', () => {
    test('module metadata', () => { expect(tableKern.name).toBe('tableKern'); });

    test('parses MS format 0', () => {
        const bytes = buildMsKernFormat0([
            { left: 1, right: 2, value: -50 },
            { left: 1, right: 3, value: -30 }
        ]);
        const k = parseKern(bytes);
        expect(k.version).toBe(0);
        expect(k.tables[0].format).toBe(0);
        expect(k.tables[0].pairs).toHaveLength(2);
        expect(k.tables[0].kern(1, 2)).toBe(-50);
        expect(k.tables[0].kern(1, 3)).toBe(-30);
        expect(k.tables[0].kern(99, 99)).toBe(0);
    });

    test('rejects short', () => {
        expect(() => parseKern(new Uint8Array(2))).toThrow(ParseError);
    });
});
