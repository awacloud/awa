// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingMacRoman } from './macRoman.js';
import { testRuntime } from './_test-runtime.js';
const { MAC_ROMAN, lookup } = testRuntime.resolve('encodingMacRoman');

describe('encodingMacRoman', () => {
    test('module metadata', () => { expect(encodingMacRoman.name).toBe('encodingMacRoman'); });
    test('256 entries', () => { expect(MAC_ROMAN.length).toBe(256); });
    test('ASCII', () => {
        expect(MAC_ROMAN[0x41]).toBe('A');
        expect(MAC_ROMAN[0x60]).toBe('grave');
    });
    test('high range', () => {
        expect(MAC_ROMAN[0x80]).toBe('Adieresis');
        expect(MAC_ROMAN[0xA9]).toBe('copyright');
    });
    test('0xE5-0xFF as ISO 32000-2 Annex D codes them (apple at 0xF0)', () => {
        const names = ['Acircumflex', 'Ecircumflex', 'Aacute', 'Edieresis', 'Egrave', 'Iacute', 'Icircumflex',
            'Idieresis', 'Igrave', 'Oacute', 'Ocircumflex', 'apple', 'Ograve', 'Uacute', 'Ucircumflex', 'Ugrave',
            'dotlessi', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent', 'ring', 'cedilla', 'hungarumlaut',
            'ogonek', 'caron'];
        expect(MAC_ROMAN.slice(0xE5, 0x100)).toEqual(names);
        expect(MAC_ROMAN.filter((n) => n === 'Eacute').length).toBe(1);
    });
    test('factory lookup', () => {
        expect(lookup(0x41)).toBe('A');
    });
});
