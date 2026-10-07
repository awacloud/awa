// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableName } from './name.js';
import { testRuntime } from './_test-runtime.js';
const { parseName, encodeName, getNameString, NAME_ID, PLATFORM } = testRuntime.resolve('tableName');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('tableName', () => {
    test('module metadata', () => { expect(tableName.name).toBe('tableName'); });

    test('roundtrip simple Windows record', () => {
        const records = [
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409,
              nameID: NAME_ID.FONT_FAMILY, string: 'Roboto' },
            { platformID: PLATFORM.WINDOWS, encodingID: 1, languageID: 0x0409,
              nameID: NAME_ID.FONT_SUBFAMILY, string: 'Regular' }
        ];
        const enc = encodeName({ records });
        const dec = parseName(enc);
        expect(dec.format).toBe(0);
        expect(dec.records[0].nameID).toBe(NAME_ID.FONT_FAMILY);
        expect(dec.records[0].string).toBe('Roboto');
        expect(dec.records[1].string).toBe('Regular');
        expect(getNameString(dec, NAME_ID.FONT_FAMILY)).toBe('Roboto');
    });

    test('roundtrip Mac Roman', () => {
        const records = [{ platformID: PLATFORM.MAC, encodingID: 0, languageID: 0,
                           nameID: NAME_ID.COPYRIGHT, string: 'Copyright (c)' }];
        const enc = encodeName({ records });
        const dec = parseName(enc);
        expect(dec.records[0].string).toBe('Copyright (c)');
    });

    test('parse rejects bad format', () => {
        const u = new Uint8Array(10);
        u[1] = 5;
        expect(() => parseName(u)).toThrow(ParseError);
    });

    test('parse rejects short', () => {
        expect(() => parseName(new Uint8Array(3))).toThrow(ParseError);
    });

    test('getNameString returns undefined for missing', () => {
        expect(getNameString({ records: [] }, 0)).toBeUndefined();
    });

    test('string storage is deduplicated', () => {
        const records = [
            { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, string: 'X' },
            { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 4, string: 'X' }
        ];
        const enc = encodeName({ records });
        const dec = parseName(enc);
        expect(dec.records[0].offset).toBe(dec.records[1].offset);
    });
});
