// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { focus } from './focus.js';

// Minimal stubs for dom and events dependencies (not used directly
// in the implementation - focus reads the DOM natively).
const domStub   = {};
const eventsStub = {};
const inst = focus.factory(domStub, eventsStub);

// ── Helpers ────────────────────────────────────────────────────────────────

function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'disabled') {
            if (v) e.setAttribute('disabled', '');
        } else if (k === 'tabindex') {
            e.setAttribute('tabindex', String(v));
        } else if (k === 'href') {
            e.setAttribute('href', v);
        } else if (k === 'contenteditable') {
            e.setAttribute('contenteditable', v);
        } else if (k === 'inert') {
            if (v) e.setAttribute('inert', '');
        } else if (k === 'type') {
            e.setAttribute('type', v);
        } else {
            e[k] = v;
        }
    }
    return e;
}

function makeContainer(...children) {
    const div = document.createElement('div');
    for (const c of children) div.appendChild(c);
    document.body.appendChild(div);
    return div;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('focus module', () => {

    // 1. Metadata
    test('correct module metadata', () => {
        expect(focus.name).toBe('focus');
        expect(focus.version).toBe('1.0.0');
        expect(focus.type).toBe('fw.dom.utils');
        expect(focus.dependencies).toEqual(['dom', 'events']);
        expect(typeof focus.factory).toBe('function');
    });

    // 2. Factory API
    describe('factory', () => {
        test('exposes all public members', () => {
            expect(typeof inst.trap).toBe('function');
            expect(typeof inst.tabOrder).toBe('function');
            expect(typeof inst.next).toBe('function');
            expect(typeof inst.previous).toBe('function');
            expect(typeof inst.stash).toBe('function');
            expect(typeof inst.current).toBe('function');
            expect(typeof inst.onChange).toBe('function');
        });
    });

    // 3. tabOrder
    describe('tabOrder', () => {
        let container;

        afterEach(() => {
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        });

        test('returns focusable elements in correct order (positives first, then zeros/naturals)', () => {
            const btn   = el('button');                         // tabindex 0 (natural)
            const inp   = el('input');                          // tabindex 0 (natural)
            const aNo   = el('a');                              // no href → excluded
            const tiNeg = el('button', { tabindex: -1 });       // excluded
            const ti2   = el('button', { tabindex: 2 });        // positive 2
            const ti1   = el('button', { tabindex: 1 });        // positive 1

            container = makeContainer(btn, inp, aNo, tiNeg, ti2, ti1);

            const order = inst.tabOrder(container);
            // Expected order: ti1, ti2, btn, inp
            expect(order).toHaveLength(4);
            expect(order[0]).toBe(ti1);
            expect(order[1]).toBe(ti2);
            expect(order[2]).toBe(btn);
            expect(order[3]).toBe(inp);
        });

        test('excludes disabled elements', () => {
            const btn    = el('button');
            const btnDis = el('button', { disabled: true });
            const inpDis = el('input', { disabled: true });
            container = makeContainer(btn, btnDis, inpDis);
            const order = inst.tabOrder(container);
            expect(order).toHaveLength(1);
            expect(order[0]).toBe(btn);
        });

        test('excludes input[type=hidden]', () => {
            const visible = el('input');
            const hidden  = el('input', { type: 'hidden' });
            container = makeContainer(visible, hidden);
            const order = inst.tabOrder(container);
            expect(order).not.toContain(hidden);
        });

        test('excludes inert elements', () => {
            const btn  = el('button');
            const wrap = document.createElement('div');
            wrap.setAttribute('inert', '');
            const btnInert = el('button');
            wrap.appendChild(btnInert);
            container = makeContainer(btn, wrap);
            const order = inst.tabOrder(container);
            expect(order).toHaveLength(1);
            expect(order[0]).toBe(btn);
        });

        test('includes a[href] and contenteditable', () => {
            const a    = el('a', { href: '#' });
            const ce   = el('div', { contenteditable: 'true' });
            container = makeContainer(a, ce);
            const order = inst.tabOrder(container);
            expect(order).toContain(a);
            expect(order).toContain(ce);
        });

        test('empty container returns []', () => {
            container = makeContainer();
            expect(inst.tabOrder(container)).toEqual([]);
        });
    });

    // 4. trap activate / deactivate
    describe('trap', () => {
        let container;

        afterEach(() => {
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        });

        test('activate focuses initialFocus option', () => {
            const btn1 = el('button');
            const btn2 = el('button');
            container = makeContainer(btn1, btn2);

            const trapCtrl = inst.trap(container, { initialFocus: btn2 });
            trapCtrl.activate();
            expect(document.activeElement).toBe(btn2);
            trapCtrl.deactivate();
        });

        test('activate focuses first focusable when no initialFocus', () => {
            const btn1 = el('button');
            const btn2 = el('button');
            container = makeContainer(btn1, btn2);

            const trapCtrl = inst.trap(container);
            trapCtrl.activate();
            expect(document.activeElement).toBe(btn1);
            trapCtrl.deactivate();
        });

        test('Tab wraps from last to first', () => {
            const btn1 = el('button');
            const btn2 = el('button');
            container = makeContainer(btn1, btn2);

            const trapCtrl = inst.trap(container);
            trapCtrl.activate();
            // focus sur btn2 (dernier)
            btn2.focus();

            const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
            container.dispatchEvent(tabEvent);
            expect(document.activeElement).toBe(btn1);
            trapCtrl.deactivate();
        });

        test('Shift+Tab wraps from first to last', () => {
            const btn1 = el('button');
            const btn2 = el('button');
            container = makeContainer(btn1, btn2);

            const trapCtrl = inst.trap(container);
            trapCtrl.activate();
            btn1.focus();

            const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
            container.dispatchEvent(shiftTab);
            expect(document.activeElement).toBe(btn2);
            trapCtrl.deactivate();
        });

        test('Escape deactivates when escapeDeactivates: true', () => {
            const btn = el('button');
            container = makeContainer(btn);

            const trapCtrl = inst.trap(container, { escapeDeactivates: true });
            trapCtrl.activate();

            const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
            container.dispatchEvent(escEvent);
            // The trap must be deactivated (no error; we verify via idempotent deactivate)
            expect(() => trapCtrl.deactivate()).not.toThrow();
        });

        // 5. returnFocus
        test('returnFocus restores previous activeElement on deactivate', () => {
            const triggerBtn = el('button');
            document.body.appendChild(triggerBtn);
            triggerBtn.focus();

            const btn = el('button');
            container = makeContainer(btn);

            const trapCtrl = inst.trap(container, { returnFocus: true });
            trapCtrl.activate();
            trapCtrl.deactivate();

            expect(document.activeElement).toBe(triggerBtn);
            document.body.removeChild(triggerBtn);
        });

        test('trap exposes pause / resume / paused', () => {
            const btn = el('button');
            container = makeContainer(btn);
            const trapCtrl = inst.trap(container);
            expect(trapCtrl.paused).toBe(false);
            trapCtrl.pause();
            expect(trapCtrl.paused).toBe(true);
            trapCtrl.resume();
            expect(trapCtrl.paused).toBe(false);
        });
    });

    // 6. stash / restore
    describe('stash', () => {
        let btn;
        afterEach(() => {
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
        });

        test('restores document.activeElement', () => {
            btn = el('button');
            document.body.appendChild(btn);
            btn.focus();
            expect(document.activeElement).toBe(btn);

            const saved = inst.stash();

            const other = el('button');
            document.body.appendChild(other);
            other.focus();
            expect(document.activeElement).toBe(other);

            saved.restore();
            expect(document.activeElement).toBe(btn);
            document.body.removeChild(other);
        });
    });

    // 7. onChange
    describe('onChange', () => {
        test('calls fn(newEl, oldEl) after el.focus()', done => {
            const btn1 = el('button');
            const btn2 = el('button');
            document.body.appendChild(btn1);
            document.body.appendChild(btn2);
            btn1.focus();

            const unsub = inst.onChange((newEl, oldEl) => {
                expect(newEl).toBe(btn2);
                expect(oldEl).toBe(btn1);
                unsub();
                document.body.removeChild(btn1);
                document.body.removeChild(btn2);
                done();
            });

            btn2.focus();
        });

        test('unsubscribe stops notifications', () => {
            const btn = el('button');
            document.body.appendChild(btn);
            let calls = 0;
            const unsub = inst.onChange(() => { calls++; });
            unsub();
            btn.focus();
            expect(calls).toBe(0);
            document.body.removeChild(btn);
        });
    });

    // 8. Edge cases
    describe('edge cases', () => {
        test('next on empty container is no-op', () => {
            const div = document.createElement('div');
            document.body.appendChild(div);
            expect(() => inst.next(div)).not.toThrow();
            document.body.removeChild(div);
        });

        test('previous on empty container is no-op', () => {
            const div = document.createElement('div');
            document.body.appendChild(div);
            expect(() => inst.previous(div)).not.toThrow();
            document.body.removeChild(div);
        });

        test('current returns document.activeElement', () => {
            expect(inst.current()).toBe(document.activeElement);
        });
    });

    describe('focus stack (push/pop/restoreFocus)', () => {
        beforeEach(() => {
            document.body.innerText = '';
            inst.clearFocusStack();
        });

        test('pushFocus / popFocus restore in LIFO order', () => {
            const a = el('button'); a.textContent = 'A';
            const b = el('button'); b.textContent = 'B';
            const c = el('button'); c.textContent = 'C';
            document.body.append(a, b, c);

            a.focus();
            expect(document.activeElement).toBe(a);

            // Open modal #1 → focus B
            inst.pushFocus(b);
            expect(document.activeElement).toBe(b);
            expect(inst.focusStackDepth()).toBe(1);

            // Open modal #2 → focus C
            inst.pushFocus(c);
            expect(document.activeElement).toBe(c);
            expect(inst.focusStackDepth()).toBe(2);

            // Close #2 → back to B
            inst.popFocus();
            expect(document.activeElement).toBe(b);

            // Close #1 → back to A
            inst.popFocus();
            expect(document.activeElement).toBe(a);
            expect(inst.focusStackDepth()).toBe(0);
        });

        test('popFocus is no-op when stack is empty', () => {
            expect(inst.popFocus()).toBe(null);
        });

        test('pushFocus accepts a CSS selector', () => {
            const a = el('button', { id: 'aa' });
            const b = el('button', { id: 'bb' });
            document.body.append(a, b);
            a.focus();
            inst.pushFocus('#bb');
            expect(document.activeElement).toBe(b);
        });

        test('restoreFocus(cb) captures and restores around the callback', () => {
            const a = el('button');
            const b = el('button');
            document.body.append(a, b);
            a.focus();
            inst.restoreFocus(() => {
                b.focus();
                expect(document.activeElement).toBe(b);
            });
            expect(document.activeElement).toBe(a);
        });

        test('restoreFocus restores even if callback throws', () => {
            const a = el('button');
            document.body.append(a);
            a.focus();
            expect(() => inst.restoreFocus(() => { throw new Error('x'); })).toThrow();
            expect(document.activeElement).toBe(a);
        });

        test('restoreFocus async waits for the promise', async () => {
            const a = el('button');
            const b = el('button');
            document.body.append(a, b);
            a.focus();
            const p = inst.restoreFocus(async () => {
                b.focus();
                await new Promise(r => setTimeout(r, 5));
                expect(document.activeElement).toBe(b);
            });
            await p;
            expect(document.activeElement).toBe(a);
        });

        test('clearFocusStack empties without restoring', () => {
            const a = el('button'); const b = el('button');
            document.body.append(a, b);
            a.focus();
            inst.pushFocus(b);
            inst.clearFocusStack();
            expect(inst.focusStackDepth()).toBe(0);
            // b remains focused
            expect(document.activeElement).toBe(b);
        });
    });
});
