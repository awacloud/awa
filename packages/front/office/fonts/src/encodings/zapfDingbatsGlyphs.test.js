// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingZapfDingbatsGlyphs } from './zapfDingbatsGlyphs.js';
import { testRuntime } from './_test-runtime.js';
const { ZAPF_DINGBATS_GLYPHS, lookup } = testRuntime.resolve('encodingZapfDingbatsGlyphs');

// ZAPF_DINGBATS_GLYPHS is GENERATED from the vendored zapfdingbats.txt
// (adobe-type-tools/agl-aglfn @ 4036a9ca, BSD-3-Clause — see
// AGL-PROVENANCE.md). Regenerate with `bun tools/gen-agl-table.mjs`.
describe('encodingZapfDingbatsGlyphs', () => {
    test('module metadata', () => {
        expect(encodingZapfDingbatsGlyphs.name).toBe('encodingZapfDingbatsGlyphs');
        expect(encodingZapfDingbatsGlyphs.dependencies).toEqual([]);
    });
    test('the table is frozen and holds the vendored entry count', () => {
        expect(Object.isFrozen(ZAPF_DINGBATS_GLYPHS)).toBe(true);
        // 201 non-comment data lines in the vendored zapfdingbats.txt.
        expect(Object.keys(ZAPF_DINGBATS_GLYPHS).length).toBe(201);
    });
    test('lookup resolves Zapf Dingbats names to one code point each', () => {
        expect(lookup('a1')).toEqual([0x2701]);
        expect(lookup('a71')).toEqual([0x25CF]);
        expect(lookup('a73')).toEqual([0x25A0]);
        expect(lookup('a20')).toEqual([0x2714]);
        expect(Object.values(ZAPF_DINGBATS_GLYPHS).every((v) => v.length === 1)).toBe(true);
    });
    test('lookup returns undefined for any other name', () => {
        expect(lookup('space')).toBeUndefined();
        expect(lookup('a0')).toBeUndefined();
        expect(lookup('toString')).toBeUndefined();
    });
});
