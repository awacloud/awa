// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingStandard } from './standard.js';
import { testRuntime } from './_test-runtime.js';
const { STANDARD } = testRuntime.resolve('encodingStandard');

describe('encodingStandard', () => {
    test('module metadata', () => { expect(encodingStandard.name).toBe('encodingStandard'); });
    test('256 entries', () => { expect(STANDARD.length).toBe(256); });
    test('ASCII', () => {
        expect(STANDARD[0x41]).toBe('A');
        expect(STANDARD[0x27]).toBe('quoteright');   // Adobe std maps quote at 0x27
    });
    test('the whole high half, as ISO 32000-2 Annex D.2 lists it (STD column; 0xD0 emdash included)', () => {
        const hi = {
            0xA1: 'exclamdown', 0xA2: 'cent', 0xA3: 'sterling', 0xA4: 'fraction', 0xA5: 'yen', 0xA6: 'florin', 0xA7: 'section',
            0xA8: 'currency', 0xA9: 'quotesingle', 0xAA: 'quotedblleft', 0xAB: 'guillemotleft', 0xAC: 'guilsinglleft',
            0xAD: 'guilsinglright', 0xAE: 'fi', 0xAF: 'fl', 0xB1: 'endash', 0xB2: 'dagger', 0xB3: 'daggerdbl',
            0xB4: 'periodcentered', 0xB6: 'paragraph', 0xB7: 'bullet', 0xB8: 'quotesinglbase', 0xB9: 'quotedblbase',
            0xBA: 'quotedblright', 0xBB: 'guillemotright', 0xBC: 'ellipsis', 0xBD: 'perthousand', 0xBF: 'questiondown',
            0xC1: 'grave', 0xC2: 'acute', 0xC3: 'circumflex', 0xC4: 'tilde', 0xC5: 'macron', 0xC6: 'breve',
            0xC7: 'dotaccent', 0xC8: 'dieresis', 0xCA: 'ring', 0xCB: 'cedilla', 0xCD: 'hungarumlaut', 0xCE: 'ogonek',
            0xCF: 'caron', 0xD0: 'emdash', 0xE1: 'AE', 0xE3: 'ordfeminine', 0xE8: 'Lslash', 0xE9: 'Oslash', 0xEA: 'OE',
            0xEB: 'ordmasculine', 0xF1: 'ae', 0xF5: 'dotlessi', 0xF8: 'lslash', 0xF9: 'oslash', 0xFA: 'oe', 0xFB: 'germandbls'
        };
        for (let c = 0x80; c < 0x100; c++) expect([c, STANDARD[c]]).toEqual([c, hi[c] ?? '.notdef']);
    });
    test('Adobe std high range', () => {
        expect(STANDARD[0xA1]).toBe('exclamdown');
        expect(STANDARD[0xFB]).toBe('germandbls');
        expect(STANDARD[0xAE]).toBe('fi');
    });
});
