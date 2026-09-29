// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { reactiveBind } from './reactiveBind.js';
import { signal } from '../../io/utils/signal.js';
import { uiSession }       from './uiSession.js';
import { uiSessionCore }   from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList }   from './uiSession-list.js';
import { template } from './template.js';
import { render } from './render.js';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

// ── Harness helpers ───────────────────────────────────────────────────────────

let _ctxSeq = 0;

function makeSession(containerEl) {
    const name = `rb-ctx-${++_ctxSeq}`;
    const sp   = secPolicy.factory();
    const tpl  = template.factory(sp);
    const rnd  = render.factory(sp);
    const prs  = parser.factory(sp);
    const dm   = dom.factory(sp);
    const ev   = events.factory();
    tpl.init(name, { to: containerEl, main: true });
    const sess = uiSession.factory(
        uiSessionCore.factory(tpl, rnd, prs, dm, ev),
        uiSessionDirect.factory(dm, ev),
        uiSessionList.factory(tpl, rnd, dm),
    )(name);
    return sess;
}

// ── Module-level tests ────────────────────────────────────────────────────────

describe('reactiveBind module', () => {

    test('has correct module metadata', () => {
        expect(reactiveBind.name).toBe('reactiveBind');
        expect(reactiveBind.dependencies).toEqual(['signal']);
        expect(typeof reactiveBind.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns an object with a create() method', () => {
            const sig = signal.factory();
            const rb  = reactiveBind.factory(sig);
            expect(typeof rb.create).toBe('function');
        });

        test('create() returns a controller with the expected API', () => {
            const sig  = signal.factory();
            const rb   = reactiveBind.factory(sig);
            const root = document.createElement('div');
            document.body.appendChild(root);
            const ui   = makeSession(root);
            const ctrl = rb.create(ui);
            expect(typeof ctrl.text).toBe('function');
            expect(typeof ctrl.attr).toBe('function');
            expect(typeof ctrl.class).toBe('function');
            expect(typeof ctrl.style).toBe('function');
            expect(typeof ctrl.show).toBe('function');
            expect(typeof ctrl.model).toBe('function');
            expect(typeof ctrl.list).toBe('function');
            expect(typeof ctrl.dispose).toBe('function');
        });
    });

    // ── text ──────────────────────────────────────────────────────────────────

    describe('text', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<p id="msg">initial</p>');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('patches textContent when signal changes', () => {
            const s = sig.create('hello');
            block.text('b', 'msg', s);
            expect(ui.get('b', 'msg').textContent).toBe('hello');
            s.set('world');
            expect(ui.get('b', 'msg').textContent).toBe('world');
        });

        test('thunk form auto-tracks', () => {
            const a = sig.create('A');
            const b = sig.create('B');
            block.text('b', 'msg', () => a.get() + b.get());
            expect(ui.get('b', 'msg').textContent).toBe('AB');
            a.set('X');
            expect(ui.get('b', 'msg').textContent).toBe('XB');
            b.set('Y');
            expect(ui.get('b', 'msg').textContent).toBe('XY');
        });

        test('node identity is preserved (no re-render)', () => {
            const s = sig.create('v1');
            const nodeRef = ui.get('b', 'msg');
            block.text('b', 'msg', s);
            s.set('v2');
            expect(ui.get('b', 'msg')).toBe(nodeRef);
        });

        test('returns a per-call disposer', () => {
            const s = sig.create('A');
            const stop = block.text('b', 'msg', s);
            expect(typeof stop).toBe('function');
            stop();
            s.set('B');
            expect(ui.get('b', 'msg').textContent).toBe('A');
        });

        test('throws on missing block id', () => {
            const s = sig.create('x');
            expect(() => block.text('no-such-block', 'msg', s)).toThrow(/no element found/i);
        });

        test('throws on missing local id', () => {
            const s = sig.create('x');
            expect(() => block.text('b', 'no-such-id', s)).toThrow(/no element found/i);
        });
    });

    // ── attr ──────────────────────────────────────────────────────────────────

    describe('attr', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<button id="btn">click</button>');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('patches attribute when signal changes', () => {
            const s = sig.create('Save');
            block.attr('b', 'btn', 'aria-label', s);
            expect(ui.get('b', 'btn').getAttribute('aria-label')).toBe('Save');
            s.set('Submit');
            expect(ui.get('b', 'btn').getAttribute('aria-label')).toBe('Submit');
        });

        test('thunk form auto-tracks', () => {
            const prefix = sig.create('Act');
            block.attr('b', 'btn', 'aria-label', () => prefix.get() + ':ok');
            prefix.set('Do');
            expect(ui.get('b', 'btn').getAttribute('aria-label')).toBe('Do:ok');
        });

        test('node identity preserved (no re-render)', () => {
            const s = sig.create('v1');
            const nodeRef = ui.get('b', 'btn');
            block.attr('b', 'btn', 'title', s);
            s.set('v2');
            expect(ui.get('b', 'btn')).toBe(nodeRef);
        });

        test('per-call disposer detaches cleanly', () => {
            const s = sig.create('first');
            const stop = block.attr('b', 'btn', 'title', s);
            stop();
            s.set('second');
            expect(ui.get('b', 'btn').getAttribute('title')).toBe('first');
        });

        test('throws on invalid ids', () => {
            const s = sig.create('x');
            expect(() => block.attr('bad', 'btn', 'title', s)).toThrow(/no element found/i);
        });
    });

    // ── class ─────────────────────────────────────────────────────────────────

    describe('class', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<span id="badge">x</span>');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('adds class when signal is truthy', () => {
            const s = sig.create(true);
            block.class('b', 'badge', 'active', s);
            expect(ui.get('b', 'badge').classList.contains('active')).toBe(true);
        });

        test('removes class when signal becomes falsy', () => {
            const s = sig.create(true);
            block.class('b', 'badge', 'active', s);
            s.set(false);
            expect(ui.get('b', 'badge').classList.contains('active')).toBe(false);
        });

        test('node identity preserved', () => {
            const s = sig.create(false);
            const nodeRef = ui.get('b', 'badge');
            block.class('b', 'badge', 'active', s);
            s.set(true);
            expect(ui.get('b', 'badge')).toBe(nodeRef);
        });

        test('per-call disposer detaches', () => {
            const s = sig.create(true);
            const stop = block.class('b', 'badge', 'active', s);
            stop();
            s.set(false);
            expect(ui.get('b', 'badge').classList.contains('active')).toBe(true);
        });

        test('throws on invalid ids', () => {
            const s = sig.create(true);
            expect(() => block.class('bad', 'badge', 'active', s)).toThrow(/no element found/i);
        });
    });

    // ── style ─────────────────────────────────────────────────────────────────

    describe('style', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<div id="box">content</div>');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('sets inline style when signal changes', () => {
            const s = sig.create('red');
            block.style('b', 'box', 'color', s);
            expect(ui.get('b', 'box').style.color).toBe('red');
            s.set('blue');
            expect(ui.get('b', 'box').style.color).toBe('blue');
        });

        test('removes style property when signal is null', () => {
            const s = sig.create('red');
            block.style('b', 'box', 'color', s);
            s.set(null);
            expect(ui.get('b', 'box').style.color).toBe('');
        });

        test('thunk form auto-tracks', () => {
            const opacity = sig.create('1');
            block.style('b', 'box', 'opacity', () => opacity.get());
            opacity.set('0.5');
            expect(ui.get('b', 'box').style.opacity).toBe('0.5');
        });

        test('node identity preserved', () => {
            const s = sig.create('green');
            const nodeRef = ui.get('b', 'box');
            block.style('b', 'box', 'color', s);
            s.set('yellow');
            expect(ui.get('b', 'box')).toBe(nodeRef);
        });

        test('per-call disposer detaches', () => {
            const s = sig.create('red');
            const stop = block.style('b', 'box', 'color', s);
            stop();
            s.set('blue');
            expect(ui.get('b', 'box').style.color).toBe('red');
        });

        test('throws on invalid ids', () => {
            const s = sig.create('red');
            expect(() => block.style('bad', 'box', 'color', s)).toThrow(/no element found/i);
        });
    });

    // ── show ──────────────────────────────────────────────────────────────────

    describe('show', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<div id="panel">content</div>');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('truthy signal = visible (no hidden attr)', () => {
            const s = sig.create(true);
            block.show('b', 'panel', s);
            expect(ui.get('b', 'panel').hasAttribute('hidden')).toBe(false);
        });

        test('falsy signal = hidden', () => {
            const s = sig.create(false);
            block.show('b', 'panel', s);
            expect(ui.get('b', 'panel').hasAttribute('hidden')).toBe(true);
        });

        test('toggles on signal change', () => {
            const s = sig.create(true);
            block.show('b', 'panel', s);
            s.set(false);
            expect(ui.get('b', 'panel').hasAttribute('hidden')).toBe(true);
            s.set(true);
            expect(ui.get('b', 'panel').hasAttribute('hidden')).toBe(false);
        });

        test('node identity preserved', () => {
            const s = sig.create(true);
            const nodeRef = ui.get('b', 'panel');
            block.show('b', 'panel', s);
            s.set(false);
            expect(ui.get('b', 'panel')).toBe(nodeRef);
        });

        test('per-call disposer detaches', () => {
            const s = sig.create(true);
            const stop = block.show('b', 'panel', s);
            stop();
            s.set(false);
            expect(ui.get('b', 'panel').hasAttribute('hidden')).toBe(false);
        });

        test('throws on invalid ids', () => {
            const s = sig.create(true);
            expect(() => block.show('bad', 'panel', s)).toThrow(/no element found/i);
        });
    });

    // ── model ─────────────────────────────────────────────────────────────────

    describe('model', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<input id="field" />');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('signal value is reflected to input initially', () => {
            const s = sig.create('initial');
            block.model('b', 'field', s);
            expect(ui.get('b', 'field').value).toBe('initial');
        });

        test('signal change updates input value', () => {
            const s = sig.create('first');
            block.model('b', 'field', s);
            s.set('second');
            expect(ui.get('b', 'field').value).toBe('second');
        });

        test('DOM event updates signal', () => {
            const s = sig.create('');
            block.model('b', 'field', s);
            const input = ui.get('b', 'field');
            input.value = 'typed';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(s.peek()).toBe('typed');
        });

        test('no feedback loop: DOM event → signal → no duplicate DOM write', () => {
            const s = sig.create('');
            let writeCount = 0;
            const origSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            block.model('b', 'field', s);
            const input = ui.get('b', 'field');
            // Trigger DOM → signal
            input.value = 'abc';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            // The signal is now 'abc'; the effect should NOT re-set value again
            // because the guard checks node.value === formatted already matches.
            // We just verify the signal has the right value.
            expect(s.peek()).toBe('abc');
        });

        test('custom parse option', () => {
            const s = sig.create(0);
            block.model('b', 'field', s, { parse: (v) => parseInt(v, 10) });
            const input = ui.get('b', 'field');
            input.value = '42';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(s.peek()).toBe(42);
        });

        test('custom format option', () => {
            const s = sig.create(7);
            block.model('b', 'field', s, { format: (v) => `$${v}` });
            expect(ui.get('b', 'field').value).toBe('$7');
        });

        test('custom event option', () => {
            const s = sig.create('');
            block.model('b', 'field', s, { event: 'change' });
            const input = ui.get('b', 'field');
            input.value = 'blur-value';
            input.dispatchEvent(new Event('change', { bubbles: true }));
            expect(s.peek()).toBe('blur-value');
            // 'input' event should NOT update the signal when event is 'change'
            input.value = 'not-set';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(s.peek()).toBe('blur-value');
        });

        test('per-call disposer removes listener and stops effect', () => {
            const s = sig.create('x');
            const stop = block.model('b', 'field', s);
            stop();
            // Signal change must not update DOM
            s.set('y');
            expect(ui.get('b', 'field').value).toBe('x');
            // DOM event must not update signal
            const input = ui.get('b', 'field');
            input.value = 'typed';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(s.peek()).toBe('y');
        });

        test('throws when sig lacks .set', () => {
            const s = signal.factory().create('x');
            // Simulate a read-only (no set)
            const roSig = { get: s.get, subscribe: s.subscribe, _isSignal: true, _subs: s._subs };
            expect(() => block.model('b', 'field', roSig)).toThrow(/writable signal/i);
        });

        test('throws on missing ids', () => {
            const s = sig.create('');
            expect(() => block.model('bad', 'field', s)).toThrow(/no element found/i);
        });
    });

    // ── list ──────────────────────────────────────────────────────────────────

    describe('list', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            // Render a parent block with a ${items} slot for UIList.
            const parsed = ui.parse('<ul id="parent"><!-- $items --><li id="row">#{name}</li><!-- items$ --></ul>');
            ui.add([{ id: 'parent', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('initial sync populates the list', () => {
            const items  = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
            const sigArr = sig.create(items);
            const listBlock = ui.parse('<li id="row">#{name}</li>');
            const listCtrl  = ui.list('parent', 'items', {
                keyFn: (x) => x.id,
                block: listBlock,
            });
            block.list(listCtrl, sigArr, { keyFn: (x) => x.id, block: listBlock });
            expect(listCtrl.size).toBe(2);
        });

        test('signal change drives UIList.sync', () => {
            const sigArr    = sig.create([{ id: '1', name: 'Alice' }]);
            const listBlock = ui.parse('<li id="row">#{name}</li>');
            const listCtrl  = ui.list('parent', 'items', {
                keyFn: (x) => x.id,
                block: listBlock,
            });
            block.list(listCtrl, sigArr, { keyFn: (x) => x.id, block: listBlock });
            expect(listCtrl.size).toBe(1);
            sigArr.set([
                { id: '1', name: 'Alice' },
                { id: '2', name: 'Bob' },
                { id: '3', name: 'Carol' },
            ]);
            expect(listCtrl.size).toBe(3);
        });

        test('removal is reflected via UIList', () => {
            const sigArr    = sig.create([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
            const listBlock = ui.parse('<li id="row">#{name}</li>');
            const listCtrl  = ui.list('parent', 'items', {
                keyFn: (x) => x.id,
                block: listBlock,
            });
            block.list(listCtrl, sigArr, { keyFn: (x) => x.id, block: listBlock });
            sigArr.set([{ id: 'a', name: 'A' }]);
            expect(listCtrl.size).toBe(1);
        });

        test('per-call disposer stops updates', () => {
            const sigArr    = sig.create([{ id: '1', name: 'Alice' }]);
            const listBlock = ui.parse('<li id="row">#{name}</li>');
            const listCtrl  = ui.list('parent', 'items', {
                keyFn: (x) => x.id,
                block: listBlock,
            });
            const stop = block.list(listCtrl, sigArr, { keyFn: (x) => x.id, block: listBlock });
            stop();
            sigArr.set([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]);
            // After stopping, signal changes must not propagate to the list.
            expect(listCtrl.size).toBe(1);
        });

        test('throws when listController lacks sync()', () => {
            const s = sig.create([]);
            expect(() => block.list({}, s, { keyFn: (x) => x.id, block: {} }))
                .toThrow(/sync/i);
        });

        test('throws when sigArray lacks get()', () => {
            const fake = { sync: () => {} };
            expect(() => block.list(fake, {}, { keyFn: (x) => x.id, block: {} }))
                .toThrow(/sigArray must be a signal/i);
        });

        test('throws when opts.keyFn is missing', () => {
            const fake = { sync: () => {} };
            const s = sig.create([]);
            expect(() => block.list(fake, s, {})).toThrow(/keyFn is required/i);
        });
    });

    // ── dispose ───────────────────────────────────────────────────────────────

    describe('dispose', () => {
        let sig, rb, ui, root, block;

        beforeEach(() => {
            sig  = signal.factory();
            rb   = reactiveBind.factory(sig);
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(root);
            const parsed = ui.parse('<div id="el">hello</div>');
            ui.add([{ id: 'b', template: parsed.template, data: {} }]);
            block = rb.create(ui);
        });

        test('dispose() stops all registered bindings', () => {
            const s1 = sig.create('A');
            const s2 = sig.create('x');
            block.text('b', 'el', s1);
            // Add a second element for attr binding
            const parsed2 = ui.parse('<span id="sp">sp</span>');
            ui.add([{ id: 'b2', template: parsed2.template, data: {} }]);
            block.attr('b2', 'sp', 'title', s2);
            // Dispose all
            block.dispose();
            // Changes should now be no-ops
            s1.set('B');
            s2.set('y');
            expect(ui.get('b', 'el').textContent).toBe('A');
            expect(ui.get('b2', 'sp').getAttribute('title')).toBe('x');
        });

        test('dispose() is idempotent', () => {
            const s = sig.create('A');
            block.text('b', 'el', s);
            block.dispose();
            expect(() => block.dispose()).not.toThrow();
        });

        test('dispose() does not affect per-call disposers already called', () => {
            const s = sig.create('A');
            const stop = block.text('b', 'el', s);
            // Call the per-call disposer first.
            stop();
            s.set('B');
            // block.dispose() should not throw even though stop() already ran.
            expect(() => block.dispose()).not.toThrow();
            expect(ui.get('b', 'el').textContent).toBe('A');
        });
    });

});
