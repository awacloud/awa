// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatProp } from './prop.js';
import { testRuntime } from '../_test-runtime.js';
const { parseProp, PROP_BITS } = testRuntime.resolve('aatProp');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { fixedToInt32 } = testRuntime.resolve('fontFixed');

function writeProp({ version = 3, format, defaultProps, lookup }) {
    const w = new BinaryWriter();
    w.writeInt32(fixedToInt32(version));
    w.writeUint16(format);
    w.writeUint16(defaultProps);
    if (lookup) w.writeBytes(lookup);
    return w.finalize();
}

describe('aatProp', () => {
    test('module metadata', () => {
        expect(aatProp.name).toBe('aatProp');
        expect(aatProp.dependencies).toEqual(['fontErrors', 'fontReader']);
        expect(PROP_BITS.DIRECTION_MASK).toBe(0x1F);
    });

    test('parses format 0 (single default)', () => {
        const bytes = writeProp({ format: 0, defaultProps: 0x0001 });
        const p = parseProp(bytes);
        expect(p.version).toBe(3);
        expect(p.format).toBe(0);
        expect(p.defaultProps).toBe(1);
        expect(p.lookup(42)).toBe(1);
    });

    test('parses format 1 and surfaces lookup format', () => {
        // a 6-byte fake lookup region beginning with format = 2
        const lookup = new Uint8Array([0x00, 0x02, 0x00, 0x00, 0x00, 0x00]);
        const bytes = writeProp({ format: 1, defaultProps: 0x0000, lookup });
        const p = parseProp(bytes);
        expect(p.format).toBe(1);
        expect(p.lookupFormat).toBe(2);
        expect(p.lookupBytes).toBeInstanceOf(Uint8Array);
        expect(p.lookupBytes.length).toBe(6);
        expect(p.lookup(0)).toBe(0);    // stub fallback until L4
    });

    test('rejects short buffer', () => {
        expect(() => parseProp(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const bytes = writeProp({ version: 4, format: 0, defaultProps: 0 });
        expect(() => parseProp(bytes)).toThrow(ParseError);
    });

    test('rejects bad format', () => {
        const bytes = writeProp({ format: 9, defaultProps: 0 });
        expect(() => parseProp(bytes)).toThrow(ParseError);
    });
});
