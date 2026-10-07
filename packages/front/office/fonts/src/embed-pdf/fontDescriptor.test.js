// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { embedFontDescriptor } from './fontDescriptor.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError } = testRuntime.resolve('fontErrors');
const { buildFontDescriptor, PDF_FONT_FLAG } = testRuntime.resolve('embedFontDescriptor');

describe('embedFontDescriptor', () => {
    test('module metadata', () => { expect(embedFontDescriptor.name).toBe('embedFontDescriptor'); });

    test('builds descriptor from a minimal Font shape', () => {
        const font = {
            flavor: 'truetype',
            head: { xMin: -100, yMin: -200, xMax: 1100, yMax: 900, macStyle: 0 },
            hhea: { ascender: 1900, descender: -500 },
            os2: { sFamilyClass: 0x0200, sTypoAscender: 1900, sTypoDescender: -500, sCapHeight: 1456 },
            post: { italicAngle: 0 },
            names: { family: 'Roboto', postScriptName: 'Roboto-Regular' }
        };
        const fd = buildFontDescriptor(font, { namePrefix: 'ABCDEF', subsetBytes: new Uint8Array([1, 2, 3]) });
        expect(fd.FontName).toBe('ABCDEF+Roboto-Regular');
        expect(fd.Flags & PDF_FONT_FLAG.SERIF).toBe(PDF_FONT_FLAG.SERIF);
        expect(fd.Flags & PDF_FONT_FLAG.NONSYMBOLIC).toBe(PDF_FONT_FLAG.NONSYMBOLIC);
        expect(fd.FontBBox).toEqual([-100, -200, 1100, 900]);
        expect(fd.FontFile2).toBeInstanceOf(Uint8Array);
        expect(fd.FontFile3).toBeUndefined();
    });

    test('uses FontFile3 for CFF flavor', () => {
        const fd = buildFontDescriptor(
            { flavor: 'opentype', head: {}, hhea: {}, os2: {}, post: {}, names: { family: 'X' } },
            { subsetBytes: new Uint8Array([1]) }
        );
        expect(fd.FontFile3).toBeInstanceOf(Uint8Array);
        expect(fd.FontFile2).toBeUndefined();
    });

    test('italic flag set when italicAngle non-zero', () => {
        const fd = buildFontDescriptor(
            { head: {}, hhea: {}, os2: {}, post: { italicAngle: -12 }, names: { family: 'X' } }
        );
        expect(fd.Flags & PDF_FONT_FLAG.ITALIC).toBe(PDF_FONT_FLAG.ITALIC);
    });

    test('rejects null font', () => {
        expect(() => buildFontDescriptor(null)).toThrow(ContractError);
    });
});
