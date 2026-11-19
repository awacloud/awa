// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for the pure `hypertree.measure` word-wrap kernel.
 */

import { describe, test, expect } from 'bun:test';
import { hypertreeMeasureModule } from './measure.js';

const { wrapLabel } = hypertreeMeasureModule.factory();

describe('hypertreeMeasureModule descriptor', () => {
    test('is a pure, Worker-safe leaf descriptor', () => {
        expect(hypertreeMeasureModule.name).toBe('hypertree.measure');
        expect(hypertreeMeasureModule.type).toBe('lib.graphic.hypertree');
        expect(hypertreeMeasureModule.dependencies).toEqual([]);
        expect(hypertreeMeasureModule.deps).toEqual([]);
    });
});

describe('wrapLabel — word-wrap at a character budget', () => {
    test('wraps at word boundaries within maxLabel', () => {
        expect(wrapLabel('a b c d', 3)).toEqual(['a b', 'c d']);
    });

    test('keeps a label that fits on one line', () => {
        expect(wrapLabel('hello', 16)).toEqual(['hello']);
    });

    test('empty / whitespace / nullish label yields no lines', () => {
        expect(wrapLabel('', 8)).toEqual([]);
        expect(wrapLabel('   ', 8)).toEqual([]);
        expect(wrapLabel(null, 8)).toEqual([]);
        expect(wrapLabel(undefined, 8)).toEqual([]);
    });

    test('hard-breaks a single word longer than maxLabel', () => {
        expect(wrapLabel('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
    });

    test('maxLabel <= 0 disables wrapping (single collapsed line)', () => {
        expect(wrapLabel('a   b   c', 0)).toEqual(['a b c']);
    });

    test('collapses internal whitespace runs to single spaces', () => {
        expect(wrapLabel('foo    bar', 16)).toEqual(['foo bar']);
    });

    test('coerces a non-string label', () => {
        expect(wrapLabel(42, 16)).toEqual(['42']);
    });
});
