// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./regex.js — verify a handful of regex
 * shapes that the inline parser relies on.
 */

import { describe, test, expect } from 'bun:test';
import { runtime } from '../../tests/_helpers/build.js';

const {
    C_TILDE, rePunctuation, reTicksHere, reEmailAutolink, reAutolink,
    reLinkLabel, reEscapable, reSpaceAtEndOfLine
} = runtime.resolve('mdInlineRegex');

describe('regex module', () => {
    test('C_TILDE is the tilde code point', () => {
        expect(C_TILDE).toBe('~'.charCodeAt(0));
    });

    test('rePunctuation matches ASCII punctuation', () => {
        expect(rePunctuation.test('.')).toBe(true);
        expect(rePunctuation.test('!')).toBe(true);
        expect(rePunctuation.test('a')).toBe(false);
    });

    test('reTicksHere matches a run of backticks at start', () => {
        const m = '```hello'.match(reTicksHere);
        expect(m && m[0]).toBe('```');
        expect('xhello'.match(reTicksHere)).toBeNull();
    });

    test('reEmailAutolink matches <user@host>', () => {
        expect(reEmailAutolink.test('<foo@bar.com>')).toBe(true);
        expect(reEmailAutolink.test('<not-email>')).toBe(false);
    });

    test('reAutolink matches <scheme:rest>', () => {
        expect(reAutolink.test('<http://x.com>')).toBe(true);
        expect(reAutolink.test('<no-scheme>')).toBe(false);
    });

    test('reLinkLabel matches [...] up to 1000 chars', () => {
        const m = '[label] rest'.match(reLinkLabel);
        expect(m && m[0]).toBe('[label]');
    });

    test('reEscapable matches escapable punctuation', () => {
        expect(reEscapable.test('!')).toBe(true);
        expect(reEscapable.test('a')).toBe(false);
    });

    test('reSpaceAtEndOfLine matches blank-up-to-end', () => {
        expect(reSpaceAtEndOfLine.test('   \n')).toBe(true);
        expect(reSpaceAtEndOfLine.test('  x')).toBe(false);
    });
});
