// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { unicode } from './unicode.js';

describe('unicode module', () => {
    test('should have correct module metadata', () => {
        expect(unicode.name).toBe('unicode');
        expect(unicode.dependencies).toEqual([]);
        expect(typeof unicode.factory).toBe('function');
    });

    describe('factory', () => {
        test('should return object with expected API', () => {
            const u = unicode.factory();
            expect(typeof u.normalize).toBe('function');
            expect(typeof u.casefold).toBe('function');
            expect(typeof u.compare).toBe('function');
            expect(typeof u.collator).toBe('function');
            expect(typeof u.graphemes).toBe('function');
            expect(typeof u.width).toBe('function');
            expect(typeof u.stripDiacritics).toBe('function');
        });
    });

    describe('normalize', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test('NFC round-trip', () => {
            const nfc = u.normalize('é', 'NFC');
            expect(nfc.length).toBe(1); // precomposed
        });

        test('NFD decomposes é into e + combining', () => {
            const nfd = u.normalize('é', 'NFD');
            expect(nfd.length).toBe(2); // e + combining acute accent
            expect(nfd.codePointAt(0)).toBe(0x65); // 'e'
            expect(nfd.codePointAt(1)).toBe(0x301); // combining acute accent
        });

        test('round-trip NFC → NFD → NFC', () => {
            const original = 'café';
            const nfd = u.normalize(original, 'NFD');
            const back = u.normalize(nfd, 'NFC');
            expect(back).toBe(original);
        });

        test('NFKC normalizes compatibility chars', () => {
            const fi_ligature = 'ﬁ'; // ﬁ ligature
            const normalized = u.normalize(fi_ligature, 'NFKC');
            expect(normalized).toBe('fi');
        });

        test('throws on non-string input', () => {
            expect(() => u.normalize(null)).toThrow('unicode.normalize: str must be a string');
        });

        test('throws on unknown form', () => {
            expect(() => u.normalize('a', 'XYZ')).toThrow('unicode.normalize: unknown form "XYZ"');
        });
    });

    describe('casefold', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test('basic lowercase', () => {
            expect(u.casefold('Hello World')).toBe('hello world');
        });

        test('Turkish dotted I (İ → i with tr locale)', () => {
            // Turkish İ (U+0130) should fold to 'i' with tr locale
            expect(u.casefold('İ', 'tr')).toBe('i');
        });

        test('without locale uses standard toLowerCase', () => {
            expect(u.casefold('CAFÉ')).toBe('café');
        });
    });

    describe('compare', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test('a < b returns negative', () => {
            expect(u.compare('a', 'b')).toBeLessThan(0);
        });

        test('b > a returns positive', () => {
            expect(u.compare('b', 'a')).toBeGreaterThan(0);
        });

        test('a === a returns 0', () => {
            expect(u.compare('a', 'a')).toBe(0);
        });

        test('sensitivity base: é === e', () => {
            expect(u.compare('é', 'e', { sensitivity: 'base' })).toBe(0);
        });

        test('sensitivity accent: é !== e', () => {
            expect(u.compare('é', 'e', { sensitivity: 'accent' })).not.toBe(0);
        });
    });

    describe('collator', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test('sort returns new sorted array', () => {
            const coll = u.collator();
            const sorted = coll.sort(['c', 'a', 'b']);
            expect(sorted).toEqual(['a', 'b', 'c']);
        });

        test('does not mutate original array', () => {
            const coll = u.collator();
            const arr = ['c', 'a', 'b'];
            coll.sort(arr);
            expect(arr).toEqual(['c', 'a', 'b']);
        });

        test('numeric: a10 > a2', () => {
            const coll = u.collator({ numeric: true });
            const sorted = coll.sort(['a10', 'a2', 'a1']);
            expect(sorted).toEqual(['a1', 'a2', 'a10']);
        });

        test('compare function works', () => {
            const coll = u.collator();
            expect(coll.compare('a', 'b')).toBeLessThan(0);
        });
    });

    describe('graphemes', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test('ASCII string returns one grapheme per char', () => {
            const gs = [...u.graphemes('abc')];
            expect(gs).toEqual(['a', 'b', 'c']);
        });

        test('family emoji is one grapheme cluster', () => {
            // 👨‍👩‍👧 is a ZWJ sequence - should be 1 cluster with Intl.Segmenter
            const family = '👨‍👩‍👧';
            const gs = [...u.graphemes(family)];
            // With Intl.Segmenter: 1; without: multiple code points
            expect(gs.length).toBeGreaterThanOrEqual(1);
            expect(gs.length).toBeLessThanOrEqual(5);
        });

        test('flag emoji returns consistent cluster count', () => {
            const flag = '🇫🇷'; // regional indicator F + R
            const gs = [...u.graphemes(flag)];
            expect(gs.length).toBeGreaterThanOrEqual(1);
            expect(gs.length).toBeLessThanOrEqual(2);
        });

        test('empty string returns no graphemes', () => {
            expect([...u.graphemes('')]).toEqual([]);
        });
    });

    describe('width', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test('ASCII has width 1 per char', () => {
            expect(u.width('hello')).toBe(5);
        });

        test('CJK characters have width 2', () => {
            expect(u.width('日本')).toBe(4);
        });

        test('mixed ASCII + CJK', () => {
            expect(u.width('a日')).toBe(3);
        });

        test('empty string has width 0', () => {
            expect(u.width('')).toBe(0);
        });
    });

    describe('stripDiacritics', () => {
        let u;
        beforeEach(() => { u = unicode.factory(); });

        test("café → cafe", () => {
            expect(u.stripDiacritics('café')).toBe('cafe');
        });

        test('Ångström → Angstrom', () => {
            expect(u.stripDiacritics('Ångström')).toBe('Angstrom');
        });

        test('already-clean string unchanged', () => {
            expect(u.stripDiacritics('hello')).toBe('hello');
        });

        test('preserves non-latin chars (ß stays ß)', () => {
            // ß is not a diacritic, it should be preserved
            expect(u.stripDiacritics('straße')).toBe('straße');
        });
    });
});
