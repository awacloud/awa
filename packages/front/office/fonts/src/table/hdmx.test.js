// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableHdmx } from './hdmx.js';
import { testRuntime } from './_test-runtime.js';
const { parseHdmx } = testRuntime.resolve('tableHdmx');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableHdmx', () => {
    test('module metadata', () => { expect(tableHdmx.name).toBe('tableHdmx'); });

    test('parses one record', () => {
        const numGlyphs = 3;
        const sizeDev = 2 + numGlyphs;
        const padded = (sizeDev + 3) & ~3;
        const w = new BinaryWriter();
        w.writeUint16(0).writeInt16(1).writeInt32(padded);
        // Record
        w.writeUint8(12).writeUint8(50);
        w.writeUint8(10).writeUint8(20).writeUint8(15);
        while (w.pos < 8 + padded) w.writeUint8(0);
        const h = parseHdmx(w.finalize(), numGlyphs);
        expect(h.records[0].pixelSize).toBe(12);
        expect(h.records[0].maxWidth).toBe(50);
        expect(Array.from(h.records[0].widths)).toEqual([10, 20, 15]);
    });

    test('rejects short', () => {
        expect(() => parseHdmx(new Uint8Array(2), 3)).toThrow(ParseError);
    });
});
