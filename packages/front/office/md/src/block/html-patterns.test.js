// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./html-patterns.js — HTML tag / block regexes.
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime } from './_test-runtime.js';

const {
    OPENTAG, CLOSETAG, reHtmlBlockOpen, reHtmlBlockClose
} = testRuntime.resolve('mdBlockHtmlPatterns');

describe('html-patterns module', () => {
    test('OPENTAG / CLOSETAG export valid regex source strings', () => {
        expect(typeof OPENTAG).toBe('string');
        expect(typeof CLOSETAG).toBe('string');
        expect(() => new RegExp(OPENTAG)).not.toThrow();
        expect(() => new RegExp(CLOSETAG)).not.toThrow();
    });

    test('block type 1 matches <script>', () => {
        expect(reHtmlBlockOpen[1].test('<script>')).toBe(true);
        expect(reHtmlBlockOpen[1].test('<pre>')).toBe(true);
        expect(reHtmlBlockOpen[1].test('<div>')).toBe(false);
    });

    test('block type 2 matches an HTML comment opener', () => {
        expect(reHtmlBlockOpen[2].test('<!-- hi')).toBe(true);
    });

    test('block type 6 matches a paragraph-level HTML container', () => {
        expect(reHtmlBlockOpen[6].test('<div>')).toBe(true);
        expect(reHtmlBlockOpen[6].test('</p>')).toBe(true);
        expect(reHtmlBlockOpen[6].test('<random>')).toBe(false);
    });

    test('reHtmlBlockClose[2] matches an HTML comment closer', () => {
        expect(reHtmlBlockClose[2].test('foo -->')).toBe(true);
    });
});
