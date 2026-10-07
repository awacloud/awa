// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontsShared } from './index.js';

describe('fontsShared module', () => {
    test('module metadata', () => {
        expect(fontsShared.name).toBe('fontsShared');
        expect(fontsShared.dependencies).toEqual([]);
        expect(typeof fontsShared.factory).toBe('function');
    });

    test('factory exposes expected API', () => {
        const s = fontsShared.factory();
        // magic numbers
        expect(typeof s.SFNT_TT_OUTLINES).toBe('number');
        expect(typeof s.SFNT_CFF_OUTLINES).toBe('number');
        expect(typeof s.SFNT_APPLE_TRUE).toBe('number');
        expect(typeof s.SFNT_APPLE_TYP1).toBe('number');
        expect(typeof s.TTC_MAGIC).toBe('number');
        expect(typeof s.WOFF_MAGIC).toBe('number');
        expect(typeof s.WOFF2_MAGIC).toBe('number');
        expect(typeof s.CHECKSUM_MAGIC).toBe('number');
        // flavor
        expect(typeof s.SFNT_FLAVOR).toBe('object');
        expect(typeof s.flavorFromVersion).toBe('function');
        expect(typeof s.versionFromFlavor).toBe('function');
        // helpers
        expect(typeof s.sfntSearchParams).toBe('function');
    });

    describe('magic constants', () => {
        const s = fontsShared.factory();
        test('SFNT_TT_OUTLINES is 0x00010000', () => {
            expect(s.SFNT_TT_OUTLINES).toBe(0x00010000);
        });
        test("SFNT_CFF_OUTLINES is 'OTTO'", () => {
            expect(s.SFNT_CFF_OUTLINES).toBe(0x4F54544F);
        });
        test("SFNT_APPLE_TRUE is 'true'", () => {
            expect(s.SFNT_APPLE_TRUE).toBe(0x74727565);
        });
        test("SFNT_APPLE_TYP1 is 'typ1'", () => {
            expect(s.SFNT_APPLE_TYP1).toBe(0x74797031);
        });
        test("TTC_MAGIC is 'ttcf'", () => {
            expect(s.TTC_MAGIC).toBe(0x74746366);
        });
        test("WOFF_MAGIC is 'wOFF'", () => {
            expect(s.WOFF_MAGIC).toBe(0x774F4646);
        });
        test("WOFF2_MAGIC is 'wOF2'", () => {
            expect(s.WOFF2_MAGIC).toBe(0x774F4632);
        });
        test('CHECKSUM_MAGIC is 0xB1B0AFBA', () => {
            expect(s.CHECKSUM_MAGIC).toBe(0xB1B0AFBA);
        });
    });

    describe('SFNT_FLAVOR', () => {
        const s = fontsShared.factory();
        test('exposes the 4 canonical flavors', () => {
            expect(s.SFNT_FLAVOR.TRUETYPE).toBe('truetype');
            expect(s.SFNT_FLAVOR.OPENTYPE).toBe('opentype');
            expect(s.SFNT_FLAVOR.APPLE_TRUE).toBe('apple-true');
            expect(s.SFNT_FLAVOR.APPLE_TYP1).toBe('apple-typ1');
        });
        test('is frozen', () => {
            expect(Object.isFrozen(s.SFNT_FLAVOR)).toBe(true);
        });
    });

    describe('flavorFromVersion / versionFromFlavor', () => {
        const s = fontsShared.factory();
        test('flavorFromVersion maps each magic to its flavor', () => {
            expect(s.flavorFromVersion(0x00010000)).toBe('truetype');
            expect(s.flavorFromVersion(0x4F54544F)).toBe('opentype');
            expect(s.flavorFromVersion(0x74727565)).toBe('apple-true');
            expect(s.flavorFromVersion(0x74797031)).toBe('apple-typ1');
        });
        test('flavorFromVersion returns null for unknown', () => {
            expect(s.flavorFromVersion(0xDEADBEEF)).toBe(null);
            expect(s.flavorFromVersion(0)).toBe(null);
        });
        test('versionFromFlavor inverts flavorFromVersion', () => {
            expect(s.versionFromFlavor('truetype')).toBe(0x00010000);
            expect(s.versionFromFlavor('opentype')).toBe(0x4F54544F);
            expect(s.versionFromFlavor('apple-true')).toBe(0x74727565);
            expect(s.versionFromFlavor('apple-typ1')).toBe(0x74797031);
        });
        test('versionFromFlavor defaults to TT outlines on unknown', () => {
            expect(s.versionFromFlavor('nope')).toBe(0x00010000);
        });
        test('round-trips', () => {
            for (const v of [0x00010000, 0x4F54544F, 0x74727565, 0x74797031]) {
                expect(s.versionFromFlavor(s.flavorFromVersion(v))).toBe(v);
            }
        });
    });

    describe('sfntSearchParams', () => {
        const s = fontsShared.factory();
        test('numTables = 1 → searchRange 16, entrySelector 0', () => {
            expect(s.sfntSearchParams(1)).toEqual({
                searchRange: 16, entrySelector: 0, rangeShift: 0
            });
        });
        test('numTables = 16 → searchRange 256, entrySelector 4', () => {
            expect(s.sfntSearchParams(16)).toEqual({
                searchRange: 256, entrySelector: 4, rangeShift: 0
            });
        });
        test('numTables = 17 → max pow2 16, rangeShift 16', () => {
            // maxPow2 = 16, searchRange = 256, rangeShift = 17*16 - 256 = 16
            expect(s.sfntSearchParams(17)).toEqual({
                searchRange: 256, entrySelector: 4, rangeShift: 16
            });
        });
        test('numTables = 30 → max pow2 16', () => {
            expect(s.sfntSearchParams(30)).toEqual({
                searchRange: 256, entrySelector: 4, rangeShift: 30 * 16 - 256
            });
        });
        test('numTables = 32 → searchRange 512, entrySelector 5', () => {
            expect(s.sfntSearchParams(32)).toEqual({
                searchRange: 512, entrySelector: 5, rangeShift: 0
            });
        });
    });

    test('factory is pure (two calls produce equivalent values)', () => {
        const a = fontsShared.factory();
        const b = fontsShared.factory();
        expect(a.SFNT_TT_OUTLINES).toBe(b.SFNT_TT_OUTLINES);
        expect(a.sfntSearchParams(10)).toEqual(b.sfntSearchParams(10));
    });
});
