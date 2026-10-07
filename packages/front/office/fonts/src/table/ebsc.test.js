// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableEbsc } from './ebsc.js';
import { testRuntime } from './_test-runtime.js';
const { parseEbsc } = testRuntime.resolve('tableEbsc');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableEbsc', () => {
    test('module metadata', () => { expect(tableEbsc.name).toBe('tableEbsc'); });

    test('parses v2 with 1 scaled strike', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0);
        w.writeUint32(1);
        for (let i = 0; i < 12; i++) w.writeUint8(0);  // hori
        for (let i = 0; i < 12; i++) w.writeUint8(0);  // vert
        w.writeUint8(24).writeUint8(24).writeUint8(12).writeUint8(12);
        const e = parseEbsc(w.finalize());
        expect(e.sizes.length).toBe(1);
        expect(e.sizes[0].ppemX).toBe(24);
        expect(e.sizes[0].substitutePpemX).toBe(12);
        expect(e.sizes[0].substitutePpemY).toBe(12);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint32(0);
        expect(() => parseEbsc(w.finalize())).toThrow(ParseError);
    });

    test('rejects truncated header', () => {
        expect(() => parseEbsc(new Uint8Array([0, 2, 0]))).toThrow(ParseError);
    });
});
