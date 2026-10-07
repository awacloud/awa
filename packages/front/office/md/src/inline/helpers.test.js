// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./helpers.js — inline parser utility helpers.
 */

import { describe, test, expect } from 'bun:test';
import { runtime } from '../../tests/_helpers/build.js';

const {
    makeText, fromCodePoint, normalizeReference, trim, isSpace
} = runtime.resolve('mdInlineHelpers');

describe('helpers module', () => {
    test('exports are functions', () => {
        expect(typeof makeText).toBe('function');
        expect(typeof fromCodePoint).toBe('function');
        expect(typeof normalizeReference).toBe('function');
        expect(typeof trim).toBe('function');
        expect(typeof isSpace).toBe('function');
    });

    test('makeText builds a text node with literal', () => {
        const n = makeText('hello');
        expect(n.type).toBe('text');
        expect(n.literal).toBe('hello');
    });

    test('fromCodePoint resolves ascii and unicode', () => {
        expect(fromCodePoint(65)).toBe('A');
        expect(fromCodePoint(0x1f600)).toBe('😀');
    });

    test('fromCodePoint falls back to U+FFFD on invalid input', () => {
        expect(fromCodePoint(-1)).toBe('�');
    });

    test('normalizeReference case-folds and collapses spaces', () => {
        expect(normalizeReference('[Foo Bar]')).toBe('FOO BAR');
        expect(normalizeReference('[  foo\t bar  ]')).toBe('FOO BAR');
        expect(normalizeReference('[ß]')).toBe('SS');
    });

    test('trim strips ASCII whitespace from both ends', () => {
        expect(trim('  foo  ')).toBe('foo');
        expect(trim('\t\nfoo\r\n')).toBe('foo');
        expect(trim('foo')).toBe('foo');
    });

    test('isSpace returns true for space / tab / LF / CR only', () => {
        expect(isSpace(0x20)).toBe(true);
        expect(isSpace(0x09)).toBe(true);
        expect(isSpace(0x0a)).toBe(true);
        expect(isSpace(0x0d)).toBe(true);
        expect(isSpace(0x41)).toBe(false);
    });
});
