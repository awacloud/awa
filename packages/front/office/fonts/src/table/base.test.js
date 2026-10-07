// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableBase } from './base.js';
import { testRuntime } from './_test-runtime.js';
const { parseBase } = testRuntime.resolve('tableBase');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableBase', () => {
    test('module metadata', () => { expect(tableBase.name).toBe('tableBase'); });

    test('parses v1.0 with horizAxis', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(8).writeUint16(0);
        // horizAxis at offset 8 : baseTagListOffset = 4, baseScriptListOffset = 0
        w.writeUint16(4).writeUint16(0);
        // baseTagList : count=2, ['romn','hang']
        w.writeUint16(2);
        w.writeTag('romn');
        w.writeTag('hang');
        const b = parseBase(w.finalize());
        expect(b.horizAxis.baselineTags).toEqual(['romn', 'hang']);
        expect(b.vertAxis).toBeNull();
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseBase(w.finalize())).toThrow(ParseError);
    });
});
