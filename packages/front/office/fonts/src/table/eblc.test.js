// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableEblc } from './eblc.js';
import { testRuntime } from './_test-runtime.js';
const { parseEblc } = testRuntime.resolve('tableEblc');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableEblc', () => {
    test('module metadata', () => { expect(tableEblc.name).toBe('tableEblc'); });

    test('parses v2 with 1 strike (bitDepth=1)', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0);
        w.writeUint32(1);
        w.writeUint32(0).writeUint32(0).writeUint32(0).writeUint32(0);
        for (let i = 0; i < 12; i++) w.writeUint8(0);
        for (let i = 0; i < 12; i++) w.writeUint8(0);
        w.writeUint16(0).writeUint16(50);
        w.writeUint8(12).writeUint8(12).writeUint8(1).writeUint8(0);
        const c = parseEblc(w.finalize());
        expect(c.sizes.length).toBe(1);
        expect(c.sizes[0].ppemX).toBe(12);
        expect(c.sizes[0].bitDepth).toBe(1);
        expect(c.sizes[0].endGlyphIndex).toBe(50);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint32(0);
        expect(() => parseEblc(w.finalize())).toThrow(ParseError);
    });

    test('rejects truncated header', () => {
        expect(() => parseEblc(new Uint8Array([0, 2, 0]))).toThrow(ParseError);
    });
});
