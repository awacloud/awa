// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Co-located unit tests of the direct DOM mutators. The methods are mixed onto
// a UISession; here they run against a minimal session (the fields they read:
// `get`, `_container`, `_lseq`, `_listeners`, `_unmount`) so each overload is
// pinned on its own, without the core lifecycle.

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { uiSessionDirect } from './uiSession-direct.js';
import { secPolicy } from './secPolicy.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';
import { signal } from '../../io/utils/signal.js';

/** A session stand-in: block `b` with a root node and one descendant `lbl`. */
function makeSession() {
    const ev = events.factory();
    const { methods } = uiSessionDirect.factory(dom.factory(secPolicy.factory()), ev);
    const root = document.createElement('div');
    const lbl = document.createElement('span');
    root.appendChild(lbl);
    const nodes = new Map([['b', root], ['b\x1flbl', lbl]]);
    const session = {
        _container: 'ctx',
        _lseq: 0,
        _listeners: new Map(),
        _unmount: new Map(),
        get(blockId, logicalId) {
            return nodes.get(logicalId === undefined ? blockId : blockId + '\x1f' + logicalId) || null;
        },
        ...methods,
    };
    return { session, root, lbl, ev };
}

describe('uiSessionDirect', () => {
    test('descriptor: a worker-safe module over dom and events', () => {
        expect(uiSessionDirect.name).toBe('uiSessionDirect');
        expect(uiSessionDirect.dependencies).toEqual(['dom', 'events']);
        expect(uiSessionDirect.deps.map((d) => d.name)).toEqual(['dom', 'events']);
        const { methods } = uiSessionDirect.factory(dom.factory(secPolicy.factory()), events.factory());
        expect(Object.keys(methods).sort()).toEqual(['attr', 'bind', 'on', 'text']);
    });

    let s, root, lbl, ev;
    beforeEach(() => { ({ session: s, root, lbl, ev } = makeSession()); });

    describe('text', () => {
        test('two arguments target the root, three a descendant; chainable', () => {
            expect(s.text('b', 'root text')).toBe(s);
            expect(s.text('b', 'lbl', 'label')).toBe(s);
            expect(lbl.textContent).toBe('label');
            expect(root.firstChild.nodeType).toBe(3);
            expect(root.firstChild.textContent).toBe('root text');
        });

        test('a missing node is a no-op', () => {
            expect(() => s.text('nope', 'x')).not.toThrow();
            expect(() => s.text('b', 'nope', 'x')).not.toThrow();
        });
    });

    describe('attr', () => {
        test('three arguments target the root, four a descendant', () => {
            s.attr('b', 'data-x', '1');
            s.attr('b', 'lbl', 'title', 'hi');
            expect(root.getAttribute('data-x')).toBe('1');
            expect(lbl.getAttribute('title')).toBe('hi');
        });

        test('null, false and undefined remove the attribute', () => {
            for (const v of [null, false, undefined]) {
                s.attr('b', 'lbl', 'title', 'hi');
                s.attr('b', 'lbl', 'title', v);
                expect(lbl.hasAttribute('title')).toBe(false);
            }
        });
    });

    describe('on', () => {
        test('the root form returns a generated name and tracks it under the block', () => {
            let n = 0;
            const name = s.on('b', 'click', () => { n++; });
            expect(name).toBe('fw:ui:ctx:1');
            root.dispatchEvent(new Event('click'));
            expect(n).toBe(1);
            expect([...s._listeners.get('b').get('b')]).toEqual([name]);
            expect(ev.has(name)).toBe(true);
        });

        test('the descendant form takes an explicit name and is tracked under its logical id', () => {
            let n = 0;
            const name = s.on('b', 'lbl', 'click', () => { n++; }, 'my-click');
            expect(name).toBe('my-click');
            lbl.dispatchEvent(new Event('click'));
            expect(n).toBe(1);
            expect([...s._listeners.get('b').get('lbl')]).toEqual(['my-click']);
        });

        test('a missing node returns null and registers nothing', () => {
            expect(s.on('nope', 'click', () => {})).toBeNull();
            expect(s._listeners.size).toBe(0);
        });
    });

    describe('bind', () => {
        let sig;
        beforeEach(() => { sig = signal.factory(); });

        test('refuses a non-signal', () => {
            expect(() => s.bind({}, 'b', 'text')).toThrow('uiSession.bind: first arg must be a signal');
        });

        test('text on the root (default), then each update', () => {
            const v = sig.create('a');
            s.bind(v, 'b');
            expect(root.textContent).toBe('a');
            v.set('b');
            expect(root.textContent).toBe('b');
        });

        test('class: the value is the class name; a falsy value clears it', () => {
            const v = sig.create('on');
            s.bind(v, 'b', 'lbl', 'class');
            expect(lbl.className).toBe('on');
            v.set('off');
            expect(lbl.className).toBe('off');
            v.set(null);
            expect(lbl.className).toBe('');
        });

        test('class:NAME toggles a fixed class', () => {
            const v = sig.create(true);
            s.bind(v, 'b', 'lbl', 'class:active');
            expect(lbl.classList.contains('active')).toBe(true);
            v.set(false);
            expect(lbl.classList.contains('active')).toBe(false);
        });

        test('style:PROP sets and clears an inline property, filtered by secPolicy', () => {
            const v = sig.create('red');
            s.bind(v, 'b', 'lbl', 'style:color');
            expect(lbl.style.color).toBe('red');
            v.set(null);
            expect(lbl.style.color).toBe('');
            const bg = sig.create('url(javascript:alert(1))');
            s.bind(bg, 'b', 'lbl', 'style:background');
            expect(lbl.style.background).not.toContain('javascript');
        });

        test('prop:NAME sets the DOM property', () => {
            const input = document.createElement('input');
            root.appendChild(input);
            const v = sig.create('typed');
            s.get = (blockId, logicalId) => (logicalId === 'in' ? input : null);
            s.bind(v, 'b', 'in', 'prop:value');
            expect(input.value).toBe('typed');
        });

        test('any other target is a conditional attribute; opts.transform maps the value', () => {
            const v = sig.create(3);
            s.bind(v, 'b', 'data-count', { transform: (x) => (x > 0 ? String(x) : null) });
            expect(root.getAttribute('data-count')).toBe('3');
            v.set(0);
            expect(root.hasAttribute('data-count')).toBe(false);
        });

        test('the returned unsubscribe stops updates, and so does the unmount chain', () => {
            const a = sig.create('1');
            const unsub = s.bind(a, 'b', 'lbl', 'text');
            unsub();
            a.set('2');
            expect(lbl.textContent).toBe('1');

            const b = sig.create('x');
            s.bind(b, 'b', 'text');
            s._unmount.get('b')();
            b.set('y');
            expect(root.textContent).toBe('x');
        });
    });
});
