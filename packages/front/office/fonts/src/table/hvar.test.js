// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableHvar } from './hvar.js';
import { testRuntime } from './_test-runtime.js';
const { parseHvar } = testRuntime.resolve('tableHvar');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableHvar', () => {
    test('module metadata', () => { expect(tableHvar.name).toBe('tableHvar'); });

    test('parses header + offsets', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint32(20).writeUint32(0).writeUint32(0).writeUint32(0);
        // IVS bytes (any content)
        w.writeUint8(0xAB).writeUint8(0xCD);
        const h = parseHvar(w.finalize());
        expect(h.majorVersion).toBe(1);
        expect(h.itemVariationStoreOffset).toBe(20);
        expect(h.itemVariationStoreBytes[0]).toBe(0xAB);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint32(0).writeUint32(0).writeUint32(0).writeUint32(0);
        expect(() => parseHvar(w.finalize())).toThrow(ParseError);
    });
});
