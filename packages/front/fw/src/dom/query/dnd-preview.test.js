// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// dnd's default preview keeps the source's rendered size (it is appended to
// <body> with position: fixed, where it would shrink to its intrinsic width),
// and text selection is off while a drag is active, restored afterwards.

import { describe, test, expect } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { dnd } from './dnd.js';

function source(w, h) {
    const el = document.createElement('div');
    el.textContent = 'a card with some text';
    document.body.appendChild(el);
    el.setPointerCapture = () => {};
    el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON() {} });
    return el;
}

function ptr(target, type, x, y) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0 }));
}

describe('dnd default preview', () => {
    test('the clone carries the source\'s width and height, border-box', () => {
        const d = dnd.factory();
        const el = source(256, 48);
        const h = d.draggable(el, { threshold: 2 });
        ptr(el, 'pointerdown', 10, 10);
        ptr(document, 'pointermove', 40, 10);
        const pv = d.active().preview;
        expect(pv.style.width).toBe('256px');
        expect(pv.style.height).toBe('48px');
        expect(pv.style.boxSizing).toBe('border-box');
        expect(pv.parentNode).toBe(document.body);
        ptr(document, 'pointerup', 40, 10);
        h.dispose();
    });

    test('an app-supplied preview keeps its own size', () => {
        const d = dnd.factory();
        const el = source(256, 48);
        const custom = document.createElement('span');
        const h = d.draggable(el, { threshold: 2, preview: () => custom });
        ptr(el, 'pointerdown', 10, 10);
        ptr(document, 'pointermove', 40, 10);
        expect(d.active().preview).toBe(custom);
        expect(custom.style.width).toBe('');
        expect(custom.style.height).toBe('');
        ptr(document, 'pointerup', 40, 10);
        h.dispose();
    });
});

describe('dnd text selection', () => {
    const us = () => document.documentElement.style.userSelect;

    test('user-select is none during a drag and restored on end', () => {
        document.documentElement.style.userSelect = 'text';
        const d = dnd.factory();
        const el = source(100, 20);
        const h = d.draggable(el, { threshold: 2 });
        ptr(el, 'pointerdown', 0, 0);
        expect(us()).toBe('text');                 // a click alone changes nothing
        ptr(document, 'pointermove', 20, 0);
        expect(us()).toBe('none');
        ptr(document, 'pointerup', 20, 0);
        expect(us()).toBe('text');
        document.documentElement.style.userSelect = '';
        h.dispose();
    });

    test('restored on cancel and on a mid-drag dispose', () => {
        const d = dnd.factory();
        const el = source(100, 20);
        let h = d.draggable(el, { threshold: 2 });
        ptr(el, 'pointerdown', 0, 0);
        ptr(document, 'pointermove', 20, 0);
        expect(us()).toBe('none');
        document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
        expect(us()).toBe('');
        h.dispose();

        h = d.draggable(el, { threshold: 2 });
        ptr(el, 'pointerdown', 0, 0);
        ptr(document, 'pointermove', 20, 0);
        expect(us()).toBe('none');
        h.dispose();
        expect(us()).toBe('');
    });
});
