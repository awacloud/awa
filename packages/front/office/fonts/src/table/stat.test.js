// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableStat } from './stat.js';
import { testRuntime } from './_test-runtime.js';
const { parseStat } = testRuntime.resolve('tableStat');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableStat', () => {
    test('module metadata', () => { expect(tableStat.name).toBe('tableStat'); });

    test('parses minimal v1.1 with one axis + one axis value', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(1);             // version 1.1
        w.writeUint16(8).writeUint16(1);             // designAxisSize, count
        const dAxesPos = w.pos; w.writeUint32(0);
        w.writeUint16(1);                             // axisValueCount
        const avOffsetsPos = w.pos; w.writeUint32(0);
        w.writeUint16(2);                             // elidedFallbackNameID
        // Design axis (8 bytes)
        const dAxisStart = w.pos;
        w.writeTag('wght').writeUint16(256).writeUint16(0);
        // Axis-value offsets array
        const avOffsetsStart = w.pos;
        w.writeUint16(2 + 4);                         // offset to first value record (from this array start)
        // Pad
        const avRecordStart = w.pos;
        w.writeUint16(1);                              // format 1
        w.writeUint16(0).writeUint16(0).writeUint16(257);
        w.writeFixed(400);
        const bytes = w.finalize();
        // Patch designAxesOffset + offsetToAxisValueOffsets
        bytes[dAxesPos]     = (dAxisStart >>> 24) & 0xFF;
        bytes[dAxesPos + 1] = (dAxisStart >>> 16) & 0xFF;
        bytes[dAxesPos + 2] = (dAxisStart >>>  8) & 0xFF;
        bytes[dAxesPos + 3] =  dAxisStart         & 0xFF;
        bytes[avOffsetsPos]     = (avOffsetsStart >>> 24) & 0xFF;
        bytes[avOffsetsPos + 1] = (avOffsetsStart >>> 16) & 0xFF;
        bytes[avOffsetsPos + 2] = (avOffsetsStart >>>  8) & 0xFF;
        bytes[avOffsetsPos + 3] =  avOffsetsStart         & 0xFF;
        // Patch the AV offset record to point to avRecordStart
        const offWithinTable = avRecordStart - avOffsetsStart;
        bytes[avOffsetsStart]     = (offWithinTable >>> 8) & 0xFF;
        bytes[avOffsetsStart + 1] =  offWithinTable        & 0xFF;

        const s = parseStat(bytes);
        expect(s.designAxes.length).toBe(1);
        expect(s.designAxes[0].axisTag).toBe('wght');
        expect(s.axisValues.length).toBe(1);
        expect(s.axisValues[0].format).toBe(1);
        expect(s.axisValues[0].value).toBe(400);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0).writeUint16(0).writeUint16(0).writeUint32(0).writeUint16(0).writeUint32(0);
        expect(() => parseStat(w.finalize())).toThrow(ParseError);
    });
});
