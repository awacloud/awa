// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingAgl } from './agl.js';
import { testRuntime } from './_test-runtime.js';
const { glyphNameToUnicode, dingbatsNameToUnicode } = testRuntime.resolve('encodingAgl');

describe('encodingAgl module', () => {
    test('should have correct module metadata', () => {
        expect(encodingAgl.name).toBe('encodingAgl');
        expect(encodingAgl.dependencies).toEqual(['encodingAglTable', 'encodingZapfDingbatsGlyphs']);
        expect(typeof encodingAgl.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            expect(typeof glyphNameToUnicode).toBe('function');
        });
    });

    describe('glyphNameToUnicode — uniXXXX heuristic (AGL spec heuristic 2)', () => {
        test('single 4-hex-digit group', () => {
            expect(glyphNameToUnicode('uni0041')).toEqual([0x0041]);
        });
        test('multi-group sequence (uniXXXXXXXX, 8 hex digits = 2 code points)', () => {
            expect(glyphNameToUnicode('uni00410042')).toEqual([0x0041, 0x0042]);
        });
        test('3-group sequence', () => {
            expect(glyphNameToUnicode('uni004100420043')).toEqual([0x0041, 0x0042, 0x0043]);
        });
        test('accepts lowercase hex digits (documented deviation)', () => {
            expect(glyphNameToUnicode('uniface')).toEqual([0xFACE]);
        });
        test('rejects a surrogate code point group', () => {
            expect(glyphNameToUnicode('uniD800')).toBeNull();
        });
        test('rejects a non-multiple-of-4 hex length', () => {
            expect(glyphNameToUnicode('uni123')).toBeNull();
        });
        test('rejects non-hex characters', () => {
            expect(glyphNameToUnicode('uniZZZZ')).toBeNull();
        });
    });

    describe('glyphNameToUnicode — uXXXX[XX] heuristic (AGL spec heuristic 3)', () => {
        test('4-hex-digit form', () => {
            expect(glyphNameToUnicode('u2E9D')).toEqual([0x2E9D]);
        });
        test('5-hex-digit form (astral plane, e.g. emoji)', () => {
            expect(glyphNameToUnicode('u1F600')).toEqual([0x1F600]);
        });
        test('5-hex-digit form (spec example)', () => {
            expect(glyphNameToUnicode('u1040C')).toEqual([0x1040C]);
        });
        test('6-hex-digit form (max valid code point U+10FFFF)', () => {
            expect(glyphNameToUnicode('u10FFFF')).toEqual([0x10FFFF]);
        });
        test('rejects fewer than 4 hex digits', () => {
            expect(glyphNameToUnicode('u123')).toBeNull();
        });
        test('rejects more than 6 hex digits', () => {
            expect(glyphNameToUnicode('u01F60FF')).toBeNull();
        });
        test('rejects a value above U+10FFFF', () => {
            expect(glyphNameToUnicode('u110000')).toBeNull();
        });
        test('rejects a surrogate code point', () => {
            expect(glyphNameToUnicode('uDFFF')).toBeNull();
        });
    });

    describe('glyphNameToUnicode — malformed / unknown names', () => {
        test('empty string', () => { expect(glyphNameToUnicode('')).toBeNull(); });
        test('non-string input never throws, returns null', () => {
            expect(glyphNameToUnicode(null)).toBeNull();
            expect(glyphNameToUnicode(undefined)).toBeNull();
            expect(glyphNameToUnicode(42)).toBeNull();
        });
        test('a well-formed PostScript name with no table entry and no uni/u form', () => {
            expect(glyphNameToUnicode('not-a-known-glyph')).toBeNull();
        });
        test('"u" alone is not a uXXXX form, but IS a verbatim AGL glyph name (table wins)', () => {
            // `u;0075` is a real AGL entry, so heuristic 1 (table lookup)
            // resolves it before the uXXXX form is considered.
            expect(glyphNameToUnicode('u')).toEqual([0x0075]);
        });
        test('"uni" alone (no hex digits, not an AGL name) is null', () => {
            expect(glyphNameToUnicode('uni')).toBeNull();
        });
    });

    // AGL table-lookup heuristic 1 (verbatim glyph names). Resolved from
    // the vendored glyphlist.txt (adobe-type-tools/agl-aglfn @ 4036a9ca,
    // BSD-3-Clause — see AGL-PROVENANCE.md).
    describe('glyphNameToUnicode — table-lookup heuristic (AGL spec heuristic 1)', () => {
        test('named Latin glyphs resolve to their code points', () => {
            expect(glyphNameToUnicode('Agrave')).toEqual([0x00C0]);
            expect(glyphNameToUnicode('bullet')).toEqual([0x2022]);
            expect(glyphNameToUnicode('Euro')).toEqual([0x20AC]);
            expect(glyphNameToUnicode('space')).toEqual([0x0020]);
        });
        test('ligature glyphs resolve to a single precomposed code point', () => {
            expect(glyphNameToUnicode('fi')).toEqual([0xFB01]);
            expect(glyphNameToUnicode('ffi')).toEqual([0xFB03]);
        });
        test('a name absent from the table and not a uni/u form is null', () => {
            expect(glyphNameToUnicode('not-a-known-glyph')).toBeNull();
        });
    });
});

// T25 (f) — the names of the Zapf Dingbats font, read from the vendored
// ITC Zapf Dingbats Glyph List when the caller says the font is one.
describe('encodingAgl — dingbatsNameToUnicode', () => {
    test('a Zapf Dingbats name reads through the ITC Zapf Dingbats Glyph List', () => {
        expect(dingbatsNameToUnicode('a73')).toEqual([0x25A0]);
        expect(dingbatsNameToUnicode('a24')).toEqual([0x2718]);
        expect(dingbatsNameToUnicode('a206')).toEqual([0x2770]);
    });

    test('glyphNameToUnicode does not read Zapf Dingbats names', () => {
        expect(glyphNameToUnicode('a73')).toBeNull();
    });

    test('any other name reads as glyphNameToUnicode does; nothing resolves to null', () => {
        for (const n of ['space', 'bullet', 'uni2022', 'u1F600', 'a']) {
            expect(dingbatsNameToUnicode(n)).toEqual(glyphNameToUnicode(n));
        }
        expect(dingbatsNameToUnicode('a207')).toBeNull();
        expect(dingbatsNameToUnicode('')).toBeNull();
        expect(dingbatsNameToUnicode(null)).toBeNull();
    });
});

// T74 — the AGL specification's own steps (§ 2): everything from the first
// full stop dropped, the rest split at underscores, each component read.
describe('encodingAgl — the full stop and the underscores (T74)', () => {
    test('a suffixed name reads as its stem', () => {
        expect(glyphNameToUnicode('one.SP')).toEqual([0x31]);
        expect(glyphNameToUnicode('zero.ST')).toEqual([0x30]);
        expect(glyphNameToUnicode('uni0031.sups')).toEqual([0x31]);
        expect(glyphNameToUnicode('one.osf.alt')).toEqual([0x31]);
    });

    test('a ligature name reads as its components, concatenated', () => {
        expect(glyphNameToUnicode('f_f_i')).toEqual([0x66, 0x66, 0x69]);
        expect(glyphNameToUnicode('f_i.alt')).toEqual([0x66, 0x69]);
        expect(glyphNameToUnicode('uni0041_B')).toEqual([0x41, 0x42]);
    });

    test('a component nothing reads maps to nothing; all of them, null', () => {
        expect(glyphNameToUnicode('one_foo')).toEqual([0x31]);
        expect(glyphNameToUnicode('foo.bar')).toBeNull();
        expect(glyphNameToUnicode('foo_qux')).toBeNull();
        expect(glyphNameToUnicode('foo_bar')).toEqual([0x7C]); // `bar` is an AGL name
        expect(glyphNameToUnicode('.notdef')).toBeNull();
        expect(glyphNameToUnicode('C0')).toBeNull();
        expect(glyphNameToUnicode('_')).toBeNull();
    });

    test('a name the table reads whole is read as before', () => {
        expect(glyphNameToUnicode('Lcommaaccent')).toEqual([0x013B]);
        expect(glyphNameToUnicode('uni20AC')).toEqual([0x20AC]);
    });
});
