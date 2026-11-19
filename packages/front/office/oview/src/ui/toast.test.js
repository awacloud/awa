// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The short-lived card: shown, replaced, timed out, silent for
 * screen readers (the live region speaks the same words).
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { createToast, TOAST_MS } from './toast.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('oview toast', () => {
    test('starts hidden and silent', () => {
        const toast = createToast({ id: 'v' });
        expect(toast.element.hidden).toBe(true);
        expect(toast.element.getAttribute('aria-hidden')).toBe('true');
        expect(toast.element.id).toBe('v-toast');
    });

    test('a busy message stays; a settled one replaces it and times out', async () => {
        const toast = createToast({ id: 'v', ms: { done: 20, error: 40 } });
        toast.show('Copying…', 'busy');
        expect(toast.element.hidden).toBe(false);
        expect(toast.element.dataset.tone).toBe('busy');
        await wait(30);
        expect(toast.element.hidden).toBe(false);
        toast.show('Document copied.', 'done');
        expect(toast.element.textContent).toBe('Document copied.');
        expect(toast.element.dataset.tone).toBe('done');
        await wait(40);
        expect(toast.element.hidden).toBe(true);
    });

    test('a new message restarts the timer', async () => {
        const toast = createToast({ id: 'v', ms: { done: 30, error: 30 } });
        toast.show('one', 'done');
        await wait(20);
        toast.show('two', 'error');
        await wait(20);
        expect(toast.element.hidden).toBe(false);
        expect(toast.element.textContent).toBe('two');
        await wait(30);
        expect(toast.element.hidden).toBe(true);
    });

    test('an error stays longer than a success', () => {
        expect(TOAST_MS.error).toBeGreaterThan(TOAST_MS.done);
    });

    test('destroy removes the card and its timer', async () => {
        const toast = createToast({ id: 'v', ms: { done: 10, error: 10 } });
        document.body.append(toast.element);
        toast.show('x', 'done');
        toast.destroy();
        expect(toast.element.isConnected).toBe(false);
        await wait(20);
        expect(toast.element.hidden).toBe(true);
    });
});
