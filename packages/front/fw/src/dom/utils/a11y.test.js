// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { a11y } from './a11y.js';

describe('a11y module', () => {

    test('metadata', () => {
        expect(a11y.name).toBe('a11y');
        expect(a11y.version).toBe('1.0.0');
        expect(a11y.type).toBe('fw.dom.utils');
        expect(a11y.dependencies).toEqual([]);
    });

    let api;
    beforeEach(() => {
        api = a11y.factory();
        // Clean up live regions between tests.
        document.body.innerHTML = '';
    });

    describe('announce', () => {
        test('creates a polite aria-live region on first call', async () => {
            api.announce('Hello');
            const region = document.querySelector('[data-fw-a11y="polite"]');
            expect(region).not.toBeNull();
            expect(region.getAttribute('aria-live')).toBe('polite');
            expect(region.getAttribute('role')).toBe('status');
            await Promise.resolve();
            expect(region.textContent).toBe('Hello');
        });

        test('creates a separate assertive region', async () => {
            api.announce('Error', 'assertive');
            const region = document.querySelector('[data-fw-a11y="assertive"]');
            expect(region.getAttribute('aria-live')).toBe('assertive');
            expect(region.getAttribute('role')).toBe('alert');
            await Promise.resolve();
            expect(region.textContent).toBe('Error');
        });

        test('reuses the existing region across calls', async () => {
            api.announce('First');
            await Promise.resolve();
            const before = document.querySelector('[data-fw-a11y="polite"]');
            api.announce('Second');
            const after = document.querySelector('[data-fw-a11y="polite"]');
            expect(before).toBe(after);
        });

        test('clearAnnouncements wipes the regions', async () => {
            api.announce('x');
            api.announce('y', 'assertive');
            await Promise.resolve();
            api.clearAnnouncements();
            expect(document.querySelector('[data-fw-a11y="polite"]').textContent).toBe('');
            expect(document.querySelector('[data-fw-a11y="assertive"]').textContent).toBe('');
        });
    });

    describe('aria()', () => {
        test('sets aria-* attributes from a map', () => {
            const el = document.createElement('button');
            api.aria(el, { label: 'Close', pressed: 'true', expanded: 'false' });
            expect(el.getAttribute('aria-label')).toBe('Close');
            expect(el.getAttribute('aria-pressed')).toBe('true');
            expect(el.getAttribute('aria-expanded')).toBe('false');
        });

        test('null/false/undefined remove the attribute', () => {
            const el = document.createElement('button');
            el.setAttribute('aria-hidden', 'true');
            api.aria(el, { hidden: null });
            expect(el.hasAttribute('aria-hidden')).toBe(false);
            el.setAttribute('aria-disabled', 'true');
            api.aria(el, { disabled: false });
            expect(el.hasAttribute('aria-disabled')).toBe(false);
        });

        test('accepts already-prefixed keys', () => {
            const el = document.createElement('input');
            api.aria(el, { 'aria-invalid': 'true' });
            expect(el.getAttribute('aria-invalid')).toBe('true');
        });

        test('aria() with null/undefined element returns silently', () => {
            expect(() => api.aria(null, { label: 'x' })).not.toThrow();
            expect(() => api.aria(undefined, { label: 'x' })).not.toThrow();
            expect(() => api.aria(null, null)).not.toThrow();
        });
    });

    describe('labelledBy / describedBy', () => {
        test('accepts a single id string', () => {
            const el = document.createElement('input');
            api.labelledBy(el, 'lbl-1');
            expect(el.getAttribute('aria-labelledby')).toBe('lbl-1');
        });

        test('accepts an Element with id', () => {
            const el = document.createElement('input');
            const label = document.createElement('label');
            label.id = 'lbl';
            api.labelledBy(el, label);
            expect(el.getAttribute('aria-labelledby')).toBe('lbl');
        });

        test('accepts an array (joined with space)', () => {
            const el = document.createElement('input');
            api.labelledBy(el, ['a', 'b', 'c']);
            expect(el.getAttribute('aria-labelledby')).toBe('a b c');
        });

        test('describedBy works the same', () => {
            const el = document.createElement('input');
            api.describedBy(el, ['help', 'err']);
            expect(el.getAttribute('aria-describedby')).toBe('help err');
        });

        test('empty list removes the attribute', () => {
            const el = document.createElement('input');
            el.setAttribute('aria-labelledby', 'old');
            api.labelledBy(el, []);
            expect(el.hasAttribute('aria-labelledby')).toBe(false);
        });

        test('labelledBy/describedBy skip null/undefined entries in arrays', () => {
            const el = document.createElement('input');
            const lbl = document.createElement('label');
            lbl.id = 'real';
            api.labelledBy(el, [null, 'a', undefined, lbl, 'b']);
            expect(el.getAttribute('aria-labelledby')).toBe('a real b');

            const el2 = document.createElement('input');
            api.describedBy(el2, [null, undefined, 'help']);
            expect(el2.getAttribute('aria-describedby')).toBe('help');
        });
    });

    describe('setRole / removeRole', () => {
        test('sets and removes role', () => {
            const el = document.createElement('div');
            api.setRole(el, 'dialog');
            expect(el.getAttribute('role')).toBe('dialog');
            api.removeRole(el);
            expect(el.hasAttribute('role')).toBe(false);
        });

        test('setRole(null) also removes', () => {
            const el = document.createElement('div');
            el.setAttribute('role', 'button');
            api.setRole(el, null);
            expect(el.hasAttribute('role')).toBe(false);
        });
    });

    describe('prefersReducedMotion', () => {
        test('returns boolean (matches whatever happy-dom reports)', () => {
            const v = api.prefersReducedMotion();
            expect(typeof v).toBe('boolean');
        });
    });
});
