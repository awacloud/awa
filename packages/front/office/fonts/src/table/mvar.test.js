// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableMvar } from './mvar.js';
import { testRuntime } from './_test-runtime.js';
const { parseMvar } = testRuntime.resolve('tableMvar');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableMvar', () => {
    test('module metadata', () => { expect(tableMvar.name).toBe('tableMvar'); });

    test('parses 1 record', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint16(0);
        w.writeUint16(8).writeUint16(1).writeUint16(0);
        w.writeTag('hasc').writeUint16(0).writeUint16(5);
        const m = parseMvar(w.finalize());
        expect(m.records[0].valueTag).toBe('hasc');
        expect(m.records[0].deltaSetInnerIndex).toBe(5);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(2).writeUint16(0).writeUint16(0).writeUint16(8).writeUint16(0).writeUint16(0);
        expect(() => parseMvar(w.finalize())).toThrow(ParseError);
    });
});
