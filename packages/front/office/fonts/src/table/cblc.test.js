// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCblc } from './cblc.js';
import { testRuntime } from './_test-runtime.js';
const { parseCblc } = testRuntime.resolve('tableCblc');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableCblc', () => {
    test('module metadata', () => { expect(tableCblc.name).toBe('tableCblc'); });

    test('parses v3 with 1 strike', () => {
        const w = new BinaryWriter();
        w.writeUint16(3).writeUint16(0);
        w.writeUint32(1);
        w.writeUint32(0).writeUint32(0).writeUint32(0).writeUint32(0);  // sub-table offsets
        for (let i = 0; i < 12; i++) w.writeUint8(0);    // hori (12 bytes int8)
        for (let i = 0; i < 12; i++) w.writeUint8(0);    // vert
        w.writeUint16(0).writeUint16(100);
        w.writeUint8(20).writeUint8(20).writeUint8(32).writeUint8(0);
        const c = parseCblc(w.finalize());
        expect(c.sizes.length).toBe(1);
        expect(c.sizes[0].ppemX).toBe(20);
        expect(c.sizes[0].bitDepth).toBe(32);
        expect(c.sizes[0].endGlyphIndex).toBe(100);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint32(0);
        expect(() => parseCblc(w.finalize())).toThrow(ParseError);
    });
});
