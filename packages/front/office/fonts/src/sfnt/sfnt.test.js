// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontSfnt } from './sfnt.js';
import { testRuntime } from './_test-runtime.js';
const { parseSfnt, packSfnt, sfntSearchParams, SFNT_FLAVOR } = testRuntime.resolve('fontSfnt');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { ParseError } = testRuntime.resolve('fontErrors');

describe('fontSfnt', () => {
    test('module metadata', () => {
        expect(fontSfnt.name).toBe('fontSfnt');
        expect(typeof fontSfnt.factory).toBe('function');
    });

    test('sfntSearchParams', () => {
        // numTables=10 -> maxPow2=8, entrySelector=3
        expect(sfntSearchParams(10)).toEqual({ searchRange: 128, entrySelector: 3, rangeShift: 32 });
        expect(sfntSearchParams(1)).toEqual({ searchRange: 16, entrySelector: 0, rangeShift: 0 });
    });

    test('roundtrip empty-content tables', () => {
        const head = new Uint8Array(54); // typical head size
        head[0] = 0; head[1] = 1; head[2] = 0; head[3] = 0; // table version 1.0
        const cmap = new Uint8Array([0, 0, 0, 0]);
        const bytes = packSfnt({ flavor: SFNT_FLAVOR.TRUETYPE, tables: { head, cmap } });
        const parsed = parseSfnt(bytes);
        expect(parsed.flavor).toBe(SFNT_FLAVOR.TRUETYPE);
        expect(Object.keys(parsed.tables).sort()).toEqual(['cmap', 'head']);
        expect(parsed.tables.head.length).toBe(54);
        expect(parsed.tables.cmap.length).toBe(4);
    });

    test('parseSfnt rejects unknown sfntVersion', () => {
        const bad = new Uint8Array(12);
        bad[0] = 0xDE; bad[1] = 0xAD; bad[2] = 0xBE; bad[3] = 0xEF;
        expect(() => parseSfnt(bad)).toThrow(ParseError);
    });

    test('parseSfnt rejects truncated directory', () => {
        const bad = new Uint8Array(12);
        bad[0] = 0; bad[1] = 1; bad[2] = 0; bad[3] = 0;     // sfntVersion
        bad[4] = 0; bad[5] = 10;                              // numTables=10
        expect(() => parseSfnt(bad)).toThrow(ParseError);
    });

    test('packSfnt rejects empty', () => {
        expect(() => packSfnt({ tables: {} })).toThrow(ParseError);
    });

    test('packSfnt chooses opentype flavor when CFF present', () => {
        const bytes = packSfnt({ tables: { 'CFF ': new Uint8Array([1, 2, 3, 4]) } });
        const r = new BinaryReader(bytes);
        expect(r.readUint32()).toBe(0x4F54544F);  // 'OTTO'
    });

    test('packSfnt aligns tables to 4 bytes', () => {
        const t1 = new Uint8Array([1, 2, 3]);   // 3 bytes -> padded to 4
        const t2 = new Uint8Array([9, 9, 9, 9, 9]);
        const bytes = packSfnt({ tables: { aaaa: t1, bbbb: t2 } });
        const p = parseSfnt(bytes);
        expect(p.tables.aaaa.offset & 3).toBe(0);
        expect(p.tables.bbbb.offset & 3).toBe(0);
        expect(p.tables.aaaa.length).toBe(3);
        expect(p.tables.bbbb.length).toBe(5);
    });
});
