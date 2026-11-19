// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Co-located tests of the core session methods (lookup, render, lifecycle,
// listeners, portals), on a session composed exactly as `uiSession` composes
// it. `uiSession.test.js` and `hydrate.test.js` cover the composed facade and
// the SSR round trip; this file pins the core methods one by one.

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { uiSession } from './uiSession.js';
import { uiSessionCore } from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList } from './uiSession-list.js';
import { template } from './template.js';
import { render } from './render.js';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

function makeSession(name, container) {
    const sp = secPolicy.factory();
    const tpl = template.factory(sp);
    const rnd = render.factory(sp);
    const prs = parser.factory(sp);
    const dm = dom.factory(sp);
    const ev = events.factory();
    tpl.init(name, { to: container, main: true });
    const make = uiSession.factory(
        uiSessionCore.factory(tpl, rnd, prs, dm, ev),
        uiSessionDirect.factory(dm, ev),
        uiSessionList.factory(tpl, rnd, dm),
    );
    return { ui: make(name), tpl, ev };
}

const CARD = '<div id="card"><h2 id="title">#{title}</h2><p id="body" class="t">#{text}</p></div>';

describe('uiSessionCore', () => {
    test('descriptor: dependencies and deps agree', () => {
        expect(uiSessionCore.name).toBe('uiSessionCore');
        expect(uiSessionCore.dependencies).toEqual(['template', 'render', 'parser', 'dom', 'events']);
        expect(uiSessionCore.deps.map((d) => d.name)).toEqual(uiSessionCore.dependencies);
    });

    let container, ui, ev, n = 0;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        ({ ui, ev } = makeSession('core-' + (n++), container));
    });
    afterEach(() => { container.remove(); });

    describe('render and lookup', () => {
        test('add renders a block; get, exists, query, queryAll and iterate address it', () => {
            const tplCard = ui.parse(CARD);
            expect(Array.isArray(tplCard.template)).toBe(true);
            expect(ui.add([{ id: 'c1', block: tplCard, data: { title: 'Hello', text: 'World' } }])).toBe(ui);

            expect(ui.exists('c1')).toBe(true);
            expect(ui.exists('c1', 'title')).toBe(true);
            expect(ui.exists('c1', 'nope')).toBe(false);
            expect(ui.exists('nope')).toBe(false);

            expect(ui.get('c1').tagName).toBe('DIV');
            expect(ui.get('c1', 'title').textContent).toBe('Hello');
            expect(ui.get('c1', 'nope')).toBeNull();
            expect(ui.get('nope')).toBeNull();

            expect(ui.query('c1', 'card', '.t').textContent).toBe('World');
            expect(ui.queryAll('c1', 'card', 'h2, p')).toHaveLength(2);
            expect(ui.queryAll('nope', 'card', 'p')).toEqual([]);

            expect([...ui.iterate('c1')].map(([lid]) => lid).sort()).toEqual(['body', 'card', 'title']);
        });

        test('prepend renders before the existing blocks', () => {
            const t = ui.parse('<p id="p">#{v}</p>');
            ui.add([{ id: 'second', block: t, data: { v: '2' } }]);
            ui.prepend([{ id: 'first', block: t, data: { v: '1' } }]);
            expect([...container.children].map((e) => e.textContent)).toEqual(['1', '2']);
        });

        test('prepend keeps the items in order, children under their parents', () => {
            const t = ui.parse('<p id="p"><b id="in">#{v}</b></p>');
            ui.add([{ id: 'z', block: t, data: { v: 'z' } }]);
            ui.prepend([
                { id: 'a', block: t, data: { v: 'a' } },
                { id: 'b', block: t, data: { v: 'b' } },
            ]);
            expect([...container.children].map((e) => e.textContent)).toEqual(['a', 'b', 'z']);
            expect(ui.get('a', 'in').parentNode).toBe(ui.get('a', 'p'));
        });

        test('add with prepend: true on an item prepends that item only', () => {
            const t = ui.parse('<p id="p">#{v}</p>');
            ui.add([{ id: 'x', block: t, data: { v: 'x' } }]);
            ui.add([{ id: 'y', block: t, data: { v: 'y' }, prepend: true }, { id: 'w', block: t, data: { v: 'w' } }]);
            expect([...container.children].map((e) => e.textContent)).toEqual(['y', 'x', 'w']);
        });

        test("prepend into a slot goes before the slot's existing children", () => {
            ui.add([{ id: 'panel', block: ui.parse('<ul id="list">${rows}</ul>'), data: {} }]);
            const row = ui.parse('<li id="r">#{v}</li>');
            ui.add([{ id: 'r1', block: row, data: { v: '1' }, attach: { elm: 'panel', name: 'rows' } }]);
            ui.prepend([{ id: 'r0', block: row, data: { v: '0' }, attach: { elm: 'panel', name: 'rows' } }]);
            const slot = ui.get('r1', 'r').parentNode;
            expect([...slot.children].map((e) => e.textContent)).toEqual(['0', '1']);
        });

        test('remove deletes one descendant; the last one unmounts the block', () => {
            let unmounted = 0;
            ui.add([{ id: 'c', block: ui.parse('<div id="r"><b id="x">x</b></div>'), data: {} }]);
            ui.onUnmount('c', () => { unmounted++; });
            ui.remove('c', 'x');
            expect(ui.get('c', 'x')).toBeNull();
            expect(ui.exists('c')).toBe(true);
            ui.remove('c', 'r');
            expect(ui.exists('c')).toBe(false);
            expect(unmounted).toBe(1);
        });

        test('replace clears a block then adds the new items', () => {
            const t = ui.parse('<p id="p">#{v}</p>');
            ui.add([{ id: 'b', block: t, data: { v: 'old' } }]);
            ui.replace('b', [{ id: 'b', block: t, data: { v: 'new' } }]);
            expect(container.textContent).toBe('new');
        });

        test('move re-parents a node inside the session', () => {
            ui.add([{ id: 'b', block: ui.parse('<div id="r"><i id="a">a</i><section id="dst"></section></div>'), data: {} }]);
            ui.move('b', 'a', 'b', 'dst');
            expect(ui.get('b', 'a').parentNode).toBe(ui.get('b', 'dst'));
        });
    });

    describe('lifecycle', () => {
        test('onMount before add fires once at add; after add it fires at once', () => {
            const calls = [];
            ui.onMount('b', () => calls.push('queued'));
            ui.add([{ id: 'b', block: ui.parse('<p id="p">x</p>'), data: {} }]);
            ui.onMount('b', () => calls.push('immediate'));
            ui.add([{ id: 'b2', block: ui.parse('<p id="p">y</p>'), data: {} }]);
            expect(calls).toEqual(['queued', 'immediate']);
        });

        test('adopt chains cleanups (latest first) and clear(block) runs them once', () => {
            const order = [];
            ui.add([{ id: 'b', block: ui.parse('<p id="p">x</p>'), data: {} }]);
            ui.adopt('b', () => order.push('fn'));
            ui.adopt('b', { dispose() { order.push('dispose'); } });
            ui.clear('b');
            ui.clear('b');
            expect(order).toEqual(['dispose', 'fn']);
            expect(ui.exists('b')).toBe(false);
            expect(container.children).toHaveLength(0);
        });

        test('adopt refuses a resource without a cleanup method', () => {
            expect(() => ui.adopt('b', {})).toThrow('uiSession.adopt: resource must be a function');
        });

        test('mount hands the block root to the factory and adopts a disposable controller', () => {
            let disposed = 0;
            ui.add([{ id: 'b', block: ui.parse('<div id="r">x</div>'), data: {} }]);
            const ctrl = ui.mount('b', null, (el, blockId) => ({ el, blockId, dispose() { disposed++; } }));
            expect(ctrl.el).toBe(ui.get('b'));
            expect(ctrl.blockId).toBe('b');
            ui.clear('b');
            expect(disposed).toBe(1);
        });

        test('mount refuses a missing root and a non-function factory', () => {
            expect(() => ui.mount('nope', null, () => null)).toThrow("uiSession.mount: no root resolved for block 'nope'");
            expect(() => ui.mount('nope', null, null)).toThrow('uiSession.mount: factory must be a function');
        });

        test('clear() with no argument unmounts every block and empties the container', () => {
            let a = 0, b = 0;
            const t = ui.parse('<p id="p">x</p>');
            ui.add([{ id: 'a', block: t, data: {} }, { id: 'b', block: t, data: {} }]);
            ui.onUnmount('a', () => { a++; });
            ui.onUnmount('b', () => { b++; });
            ui.clear();
            expect([a, b]).toEqual([1, 1]);
            expect(container.children).toHaveLength(0);
            expect(ui.exists('a')).toBe(false);
        });
    });

    describe('listeners', () => {
        test('off removes a managed listener by name; clear(block) removes the rest', () => {
            let n1 = 0, n2 = 0;
            ui.add([{ id: 'b', block: ui.parse('<button id="btn">x</button>'), data: {} }]);
            const first = ui.on('b', 'click', () => { n1++; });
            ui.on('b', 'btn', 'click', () => { n2++; }, 'second');
            expect(ui.off(first)).toBe(ui);
            expect(ev.has(first)).toBe(false);
            ui.get('b', 'btn').dispatchEvent(new Event('click'));
            expect([n1, n2]).toEqual([0, 1]);
            ui.clear('b');
            expect(ev.has('second')).toBe(false);
        });
    });

    describe('portals', () => {
        test('portal renders into its own target and closePortal empties it', () => {
            const target = document.createElement('div');
            document.body.appendChild(target);
            const p = ui.portal('modal', { to: target });
            expect(ui.portal('modal', { to: target })).toBe(p);
            p.add([{ id: 'm', block: p.parse('<div id="dlg">hi</div>'), data: {} }]);
            expect(target.textContent).toBe('hi');
            // rendered into a host the portal owns
            const host = target.querySelector('[data-fw-portal="modal"]');
            expect(host).not.toBeNull();
            expect(host.parentNode).toBe(target);
            expect(ui.get('m')).toBeNull();
            expect(p.get('m').parentNode).toBe(host);
            expect(ui.closePortal('modal')).toBe(ui);
            expect(target.textContent).toBe('');
            expect(target.querySelector('[data-fw-portal]')).toBeNull();
            expect(target.parentNode).toBe(document.body);
            target.remove();
        });

        test("portal.clear() empties the portal, never the target's own children", () => {
            const target = document.createElement('div');
            const own = document.createElement('nav');
            target.appendChild(own);
            document.body.appendChild(target);
            const p = ui.portal('side', { to: target });
            p.add([{ id: 's', block: p.parse('<div id="x">side</div>'), data: {} }]);
            p.clear();
            expect(own.parentNode).toBe(target);
            expect(target.textContent).toBe('');
            const again = ui.portal('side', { to: target });
            expect(again).toBe(p);
            ui.closePortal('side');
            expect(own.parentNode).toBe(target);
            // reopening makes a fresh portal and a fresh host
            const fresh = ui.portal('side', { to: target });
            expect(fresh).not.toBe(p);
            expect(target.querySelectorAll('[data-fw-portal="side"]')).toHaveLength(1);
            ui.closePortal('side');
            target.remove();
        });

        test('closing a portal on document.body (the default target) leaves body in place', () => {
            const sentinel = document.createElement('aside');
            document.body.appendChild(sentinel);
            const p = ui.portal('toast');
            p.add([{ id: 't', block: p.parse('<div id="msg">saved</div>'), data: {} }]);
            ui.closePortal('toast');
            expect(document.body).not.toBeNull();
            expect(document.body.parentNode).toBe(document.documentElement);
            // the portal's own nodes are gone, the page's own nodes stay
            expect(document.body.textContent).not.toContain('saved');
            expect(sentinel.parentNode).toBe(document.body);
            expect(container.parentNode).toBe(document.body);
            sentinel.remove();
        });
    });
});
