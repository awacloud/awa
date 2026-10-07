// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tablePost } from './post.js';
import { testRuntime } from './_test-runtime.js';
const { parsePost, encodePost, MAC_GLYPH_NAMES } = testRuntime.resolve('tablePost');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tablePost', () => {
    test('module metadata', () => { expect(tablePost.name).toBe('tablePost'); });

    test('Mac standard 258 names', () => {
        expect(MAC_GLYPH_NAMES.length).toBe(258);
        expect(MAC_GLYPH_NAMES[0]).toBe('.notdef');
        expect(MAC_GLYPH_NAMES[3]).toBe('space');
        expect(MAC_GLYPH_NAMES[36]).toBe('A');
    });

    test('v3.0 header roundtrip', () => {
        const post = {
            version: 3.0, italicAngle: -10, underlinePosition: -100,
            underlineThickness: 50, isFixedPitch: 0,
            minMemType42: 0, maxMemType42: 0, minMemType1: 0, maxMemType1: 0
        };
        const dec = parsePost(encodePost(post));
        expect(dec.version).toBe(3.0);
        expect(dec.italicAngle).toBeCloseTo(-10, 4);
        expect(dec.underlinePosition).toBe(-100);
        expect(dec.underlineThickness).toBe(50);
    });

    test('v1.0 returns Mac names when numGlyphs given', () => {
        const post = { version: 1.0 };
        const buf = encodePost(post);
        // encodePost emits 3.0 by default since version field is overwritten;
        // but parsePost is what we test for v1.0 â€” craft v1.0 raw header instead.
        buf[0] = 0; buf[1] = 1; buf[2] = 0; buf[3] = 0;  // version 1.0
        const dec = parsePost(buf, 10);
        expect(dec.version).toBe(1.0);
        expect(dec.glyphNames.length).toBe(10);
        expect(dec.glyphNames[0]).toBe('.notdef');
    });

    test('rejects v2.5', () => {
        const buf = new Uint8Array(32);
        buf[0] = 0; buf[1] = 2; buf[2] = 0x80; buf[3] = 0x00;
        expect(() => parsePost(buf, 0)).toThrow(ParseError);
    });

    test('rejects short', () => {
        expect(() => parsePost(new Uint8Array(20))).toThrow(ParseError);
    });
});
