// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableGasp } from './gasp.js';
import { testRuntime } from './_test-runtime.js';
const { parseGasp, GASP_FLAG } = testRuntime.resolve('tableGasp');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableGasp', () => {
    test('module metadata', () => { expect(tableGasp.name).toBe('tableGasp'); });

    test('parses ranges', () => {
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint16(2);
        w.writeUint16(8).writeUint16(GASP_FLAG.DOGRAY);
        w.writeUint16(0xFFFF).writeUint16(GASP_FLAG.GRIDFIT | GASP_FLAG.DOGRAY);
        const g = parseGasp(w.finalize());
        expect(g.ranges.length).toBe(2);
        expect(g.ranges[0].rangeMaxPPEM).toBe(8);
        expect(g.ranges[1].rangeGaspBehavior).toBe(GASP_FLAG.GRIDFIT | GASP_FLAG.DOGRAY);
    });

    test('rejects bad version', () => {
        expect(() => parseGasp(new Uint8Array([0, 9, 0, 0]))).toThrow(ParseError);
    });

    test('rejects truncated', () => {
        expect(() => parseGasp(new Uint8Array([0, 0, 0, 5]))).toThrow(ParseError);
    });
});
