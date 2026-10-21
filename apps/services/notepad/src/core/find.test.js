// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Literal find and replace: no pattern ever leaks through,
 * case matching, both directions, wrap-around.
 *
 * @module notepad/core/find.test
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { str } from '@awacloud/fw/io/text/str.js';
import { createFinder } from './find.js';

const rt = new ModuleRuntime();
rt.registerDeep(str);
const { findAll, findNext, replaceAll, isMatch } = createFinder(rt.resolve('str'));

describe('find', () => {
    const text = 'Cat cat CAT (cat).';
    test('case-insensitive by default, exact with matchCase', () => {
        expect(findAll(text, 'cat').length).toBe(4);
        expect(findAll(text, 'cat', { matchCase: true }).map((m) => m.start)).toEqual([4, 13]);
    });
    test('the query is literal', () => {
        expect(findAll(text, '(cat)')).toEqual([{ start: 12, end: 17 }]);
        expect(findAll('a.b axb', '.')).toEqual([{ start: 1, end: 2 }]);
        expect(findAll(text, '')).toEqual([]);
    });
    test('forward and backward from the caret, wrapping', () => {
        expect(findNext(text, 'cat', 1)).toEqual({ start: 4, end: 7 });
        expect(findNext(text, 'cat', 17)).toEqual({ start: 0, end: 3 });
        expect(findNext(text, 'cat', 17, { wrap: false })).toBe(null);
        expect(findNext(text, 'cat', 7, { backwards: true })).toEqual({ start: 4, end: 7 });
        expect(findNext(text, 'cat', 2, { backwards: true })).toEqual({ start: 13, end: 16 });
        expect(findNext(text, 'dog', 0)).toBe(null);
    });
    test('replace all is literal on both sides', () => {
        expect(replaceAll(text, 'cat', '$&!')).toEqual({ text: '$&! $&! $&! ($&!).', count: 4 });
        expect(replaceAll(text, 'cat', 'dog', { matchCase: true })).toEqual({ text: 'Cat dog CAT (dog).', count: 2 });
        expect(replaceAll(text, '', 'x')).toEqual({ text, count: 0 });
    });
    test('isMatch: the selection is exactly one match', () => {
        expect(isMatch(text, 0, 3, 'cat')).toBe(true);
        expect(isMatch(text, 0, 3, 'cat', { matchCase: true })).toBe(false);
        expect(isMatch(text, 0, 4, 'cat')).toBe(false);
        expect(isMatch(text, 2, 2, 'cat')).toBe(false);
    });
});
