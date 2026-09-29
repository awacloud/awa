// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { add } from './calc.js';

// bun-style auto-registration of the DOM, in-file (no environment: 'happy-dom').
try { GlobalRegistrator.register(); } catch { /* already registered */ }

describe('add', () => {
    test('additionne deux nombres', () => {
        expect(add(2, 3)).toBe(5);
    });

    test('gère le zéro', () => {
        expect(add(0, 41)).toBe(41);
    });
});

describe('DOM (happy-dom auto-registered)', () => {
    test('document est disponible sous environment: node', () => {
        const el = document.createElement('div');
        el.textContent = String(add(20, 22));
        expect(el.textContent).toBe('42');
    });
});
