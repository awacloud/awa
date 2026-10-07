// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingAglTable } from './aglTable.js';
import { testRuntime } from './_test-runtime.js';
const { AGL_TABLE, lookup } = testRuntime.resolve('encodingAglTable');

// AGL_TABLE is GENERATED from the vendored glyphlist.txt
// (adobe-type-tools/agl-aglfn @ 4036a9ca, BSD-3-Clause — see
// AGL-PROVENANCE.md). Regenerate with `bun tools/gen-agl-table.mjs`.
describe('encodingAglTable', () => {
    test('module metadata', () => { expect(encodingAglTable.name).toBe('encodingAglTable'); });
    test('AGL_TABLE is a frozen plain object', () => {
        expect(Object.isFrozen(AGL_TABLE)).toBe(true);
        expect(typeof AGL_TABLE).toBe('object');
    });
    test('AGL_TABLE holds the full vendored entry count (glyphlist.txt @ 4036a9ca)', () => {
        // 4281 non-comment data lines in the vendored glyphlist.txt.
        expect(Object.keys(AGL_TABLE).length).toBe(4281);
    });
    test('lookup resolves known named glyphs to their code points', () => {
        expect(lookup('A')).toEqual([0x0041]);
        expect(lookup('AE')).toEqual([0x00C6]);
        expect(lookup('Agrave')).toEqual([0x00C0]);
        expect(lookup('space')).toEqual([0x0020]);
        expect(lookup('bullet')).toEqual([0x2022]);
        expect(lookup('Euro')).toEqual([0x20AC]);
        expect(lookup('zcaron')).toEqual([0x017E]);
    });
    test('lookup resolves ligature glyphs (single precomposed code point)', () => {
        expect(lookup('fi')).toEqual([0xFB01]);
        expect(lookup('fl')).toEqual([0xFB02]);
        expect(lookup('ffi')).toEqual([0xFB03]);
    });
    test('lookup returns undefined for an unknown name', () => {
        expect(lookup('not-a-real-glyph-name')).toBeUndefined();
        expect(lookup('')).toBeUndefined();
    });
});
