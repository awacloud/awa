// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableVdmx } from './vdmx.js';
import { testRuntime } from './_test-runtime.js';
const { parseVdmx } = testRuntime.resolve('tableVdmx');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableVdmx', () => {
    test('module metadata', () => { expect(tableVdmx.name).toBe('tableVdmx'); });

    test('parses header + ratios', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint16(1);
        w.writeUint8(1).writeUint8(1).writeUint8(1).writeUint8(1);
        w.writeUint16(0);
        const v = parseVdmx(w.finalize());
        expect(v.numRatios).toBe(1);
        expect(v.ratRanges[0]).toEqual({ bCharSet: 1, xRatio: 1, yStartRatio: 1, yEndRatio: 1 });
    });

    test('rejects short', () => {
        expect(() => parseVdmx(new Uint8Array(3))).toThrow(ParseError);
    });
});
