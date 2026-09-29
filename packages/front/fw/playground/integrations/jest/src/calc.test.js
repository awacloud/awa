// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { add } from './calc.js';

describe('add', () => {
    test('adds two numbers', () => {
        expect(add(1, 2)).toBe(3);
    });

    test('handles negatives', () => {
        expect(add(-4, 1)).toBe(-3);
    });
});
