// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableGdef } from './gdef.js';
import { testRuntime } from './_test-runtime.js';
const { parseGdef, GDEF_CLASS } = testRuntime.resolve('tableGdef');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableGdef', () => {
    test('module metadata', () => { expect(tableGdef.name).toBe('tableGdef'); });

    test('parses v1.0 with glyphClassDef', () => {
        // GDEF header: version 1.0, glyphClassDef offset = 12, others 0
        // ClassDef format 2 at offset 12: 1 range, glyphs 10..15 -> class 1 (BASE)
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);                  // version 1.0
        w.writeUint16(12).writeUint16(0).writeUint16(0).writeUint16(0); // offsets
        // ClassDef
        w.writeUint16(2).writeUint16(1);                  // format 2, 1 range
        w.writeUint16(10).writeUint16(15).writeUint16(GDEF_CLASS.BASE);
        const g = parseGdef(w.finalize());
        expect(g.majorVersion).toBe(1);
        expect(g.glyphClassDef.lookup(12)).toBe(GDEF_CLASS.BASE);
        expect(g.glyphClassDef.lookup(99)).toBe(0);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0);
        w.writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseGdef(w.finalize())).toThrow(ParseError);
    });

    test('rejects short header', () => {
        expect(() => parseGdef(new Uint8Array(4))).toThrow(ParseError);
    });
});
