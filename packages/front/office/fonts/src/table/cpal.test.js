// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableCpal } from './cpal.js';
import { testRuntime } from './_test-runtime.js';
const { parseCpal } = testRuntime.resolve('tableCpal');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableCpal', () => {
    test('module metadata', () => { expect(tableCpal.name).toBe('tableCpal'); });

    test('parses v0 with 1 palette of 2 colors', () => {
        const w = new BinaryWriter();
        w.writeUint16(0).writeUint16(2).writeUint16(1).writeUint16(2);
        w.writeUint32(14);                       // colorRecordsArrayOffset = 14
        w.writeUint16(0);                        // colorRecordIndices[0] = 0
        // Color records BGRA: red opaque, green semi
        w.writeUint8(0).writeUint8(0).writeUint8(255).writeUint8(255);   // red
        w.writeUint8(0).writeUint8(255).writeUint8(0).writeUint8(128);   // green semi
        const c = parseCpal(w.finalize());
        expect(c.version).toBe(0);
        expect(c.palettes.length).toBe(1);
        expect(c.palettes[0]).toEqual([
            { r: 255, g: 0, b: 0, a: 255 },
            { r: 0, g: 255, b: 0, a: 128 }
        ]);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint16(0).writeUint16(0).writeUint32(0);
        expect(() => parseCpal(w.finalize())).toThrow(ParseError);
    });

    test('rejects short', () => {
        expect(() => parseCpal(new Uint8Array(8))).toThrow(ParseError);
    });
});
