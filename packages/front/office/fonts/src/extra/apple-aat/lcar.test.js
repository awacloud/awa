// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatLcar } from './lcar.js';
import { testRuntime } from '../_test-runtime.js';
const { parseLcar, readCaretBlock } = testRuntime.resolve('aatLcar');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { fixedToInt32 } = testRuntime.resolve('fontFixed');

describe('aatLcar', () => {
    test('module metadata', () => {
        expect(aatLcar.name).toBe('aatLcar');
        expect(aatLcar.dependencies).toEqual(['fontErrors', 'fontReader']);
    });

    test('parses header (format 0, em-unit carets) and reads a caret block', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(1));
        w.writeUint16(0);                // format
        // lookup stub : format 6 (single-table lookup) marker, then unused payload
        w.writeUint16(6).writeUint16(0).writeUint16(0).writeUint16(0);
        // caret block at the end of buffer
        const blockOff = w.pos;
        w.writeUint16(3).writeInt16(100).writeInt16(200).writeInt16(300);
        const bytes = w.finalize();

        const l = parseLcar(bytes);
        expect(l.version).toBe(1);
        expect(l.format).toBe(0);
        expect(l.lookupFormat).toBe(6);
        expect(l.lookupBytes.length).toBeGreaterThan(0);

        const carets = readCaretBlock(bytes, blockOff);
        expect(carets).toEqual([100, 200, 300]);
    });

    test('accepts format 1 (control-point carets)', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(1)).writeUint16(1).writeUint16(0).writeUint16(0);
        const l = parseLcar(w.finalize());
        expect(l.format).toBe(1);
    });

    test('rejects short buffer', () => {
        expect(() => parseLcar(new Uint8Array(2))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(2)).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseLcar(w.finalize())).toThrow(ParseError);
    });

    test('rejects bad format', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(1)).writeUint16(9).writeUint16(0).writeUint16(0);
        expect(() => parseLcar(w.finalize())).toThrow(ParseError);
    });
});
