// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { component } from './component.js';
import { reactiveBind } from './reactiveBind.js';
import { uiSession }       from './uiSession.js';
import { uiSessionCore }   from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList }   from './uiSession-list.js';
import { template } from './template.js';
import { render } from './render.js';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';
import { signal } from '../../io/utils/signal.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

/**
 * Shared signal factory instance. All tests that use signals and reactiveBind
 * must use this same instance so that signal.effect subscriptions wire to the
 * same tracking stack.
 */
const sigInst = signal.factory();
/** Wired reactiveBind instance sharing the same signal factory. */
const rb = reactiveBind.factory(sigInst);

function makeSession(name, el) {
    const sp = secPolicy.factory();
    const tplInst = template.factory(sp);
    const rnd = render.factory(sp);
    const prs = parser.factory(sp);
    const dm  = dom.factory(sp);
    const ev  = events.factory();
    tplInst.init(name, { to: el, main: true });
    return uiSession.factory(
        uiSessionCore.factory(tplInst, rnd, prs, dm, ev),
        uiSessionDirect.factory(dm, ev),
        uiSessionList.factory(tplInst, rnd, dm),
    )(name);
}

/** Create a wired component factory (passing reactiveBind dependency). */
function makeComp() { return component.factory(rb); }

describe('component module', () => {
    test('has correct module metadata', () => {
        expect(component.name).toBe('component');
        expect(component.version).toBe('1.3.0');
        expect(component.type).toBe('fw.dom.rendering');
        expect(component.dependencies).toEqual(['reactiveBind']);
    });

    describe('define + create', () => {
        let comp, ui, root;

        beforeEach(() => {
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession('cx', root);
            comp = makeComp();
        });

        test('define throws when template is missing', () => {
            expect(() => comp.define({})).toThrow(/template/);
        });

        test('create renders the initial template with props', () => {
            const Card = comp.define({
                template: ui.parse('<div id="root"><h3 id="t">#{title}</h3></div>'),
            });
            const c = Card({ ui, props: { title: 'Hello' } });
            expect(c.get('t').textContent).toBe('Hello');
        });

        test('mount hook fires once after creation', () => {
            let mounted = 0;
            const Card = comp.define({
                template: ui.parse('<div id="root"></div>'),
                mount: () => { mounted++; },
            });
            Card({ ui, props: {} });
            expect(mounted).toBe(1);
        });

        test('update hook fires with previous props', () => {
            let received = null;
            const Card = comp.define({
                template: ui.parse('<div id="root">#{x}</div>'),
                update: (self, prev) => { received = { props: self.props, prev }; },
            });
            const c = Card({ ui, props: { x: 1 } });
            c.update({ x: 2 });
            expect(received).toEqual({ props: { x: 2 }, prev: { x: 1 } });
        });

        test('unmount hook fires on destroy()', () => {
            let unmounted = 0;
            const Card = comp.define({
                template: ui.parse('<div id="root"></div>'),
                unmount: () => { unmounted++; },
            });
            const c = Card({ ui, props: {} });
            c.destroy();
            expect(unmounted).toBe(1);
        });

        test('unmount hook fires when parent is cleared externally', () => {
            let unmounted = 0;
            const layout = ui.parse('<div id="layout">${slot}</div>');
            ui.add([{ id: 'layout', block: layout, data: {} }]);

            const Card = comp.define({
                template: ui.parse('<div id="root">card</div>'),
                unmount: () => { unmounted++; },
            });
            Card({ ui, parent: 'layout', slot: 'slot', props: {} });
            ui.clear('layout');
            expect(unmounted).toBe(1);
        });

        test('self.on listener fires on click and is auto-removed at destroy', () => {
            let n = 0;
            const Card = comp.define({
                template: ui.parse('<button id="root">go</button>'),
                mount: (self) => { self.on('click', () => { n++; }); },
            });
            const c = Card({ ui, props: {} });
            const btn = c.get();
            btn.click();
            expect(n).toBe(1);
            c.destroy();
            btn.click();
            expect(n).toBe(1);
        });

        test('self.state persists across updates', () => {
            const Card = comp.define({
                template: ui.parse('<div id="root">#{v}</div>'),
                mount:  (self) => { self.state.counter = 0; },
                update: (self) => { self.state.counter++; },
            });
            const c = Card({ ui, props: { v: 'a' } });
            c.update({ v: 'b' });
            c.update({ v: 'c' });
            expect(c.state.counter).toBe(2);
        });

        test('destroy is idempotent', () => {
            let unmounted = 0;
            const Card = comp.define({
                template: ui.parse('<div id="root"></div>'),
                unmount: () => { unmounted++; },
            });
            const c = Card({ ui, props: {} });
            c.destroy();
            c.destroy();
            expect(unmounted).toBe(1);
        });

        test('propsFn transforms raw props before binding', () => {
            const Card = comp.define({
                template: ui.parse('<div id="root">#{label}</div>'),
                propsFn:  (p) => ({ label: `${p.first} ${p.last}` }),
            });
            const c = Card({ ui, props: { first: 'Ada', last: 'Lovelace' } });
            expect(c.get().textContent).toBe('Ada Lovelace');
        });

        test('blockId is exposed and stable', () => {
            const Card = comp.define({ template: ui.parse('<div id="root"></div>') });
            const c = Card({ ui, id: 'explicit', props: {} });
            expect(c.blockId).toBe('explicit');
            expect(ui.exists('explicit')).toBe(true);
        });

        test('throws when opts.ui is missing', () => {
            const Card = comp.define({ template: ui.parse('<div id="root"></div>') });
            expect(() => Card({ props: {} })).toThrow(/UISession/);
        });
    });

    // ── Props validation ────────────────────────────────────────────────────

    describe('props schema', () => {
        let comp, ui, root;
        beforeEach(() => {
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(`cx-${Math.random()}`, root);
            comp = makeComp();
        });

        test('required prop missing → throws', () => {
            const Card = comp.define({
                name: 'Card',
                template: ui.parse('<h1 id="root">#{title}</h1>'),
                props: { title: { type: 'string', required: true } },
            });
            expect(() => Card({ ui, id: 'c', props: {} })).toThrow(/required prop 'title'/);
        });

        test('wrong type → throws with detail', () => {
            const Card = comp.define({
                name: 'Card',
                template: ui.parse('<h1 id="root">#{title}</h1>'),
                props: { title: { type: 'string' } },
            });
            expect(() => Card({ ui, id: 'c', props: { title: 42 } }))
                .toThrow(/prop 'title' expected string, got number/);
        });

        test('array type accepted', () => {
            const Card = comp.define({
                template: ui.parse('<ul id="root"></ul>'),
                props: { items: { type: 'array' } },
            });
            const c = Card({ ui, id: 'c', props: { items: [1, 2] } });
            expect(c.props.items).toEqual([1, 2]);
        });

        test('defaults applied when prop omitted', () => {
            const Card = comp.define({
                template: ui.parse('<p id="root">#{count}</p>'),
                props: {
                    count: { type: 'number', default: 7 },
                    items: { type: 'array', default: () => [] },  // factory form
                },
            });
            const c = Card({ ui, id: 'c', props: {} });
            expect(c.props.count).toBe(7);
            expect(c.props.items).toEqual([]);
            // Two instances get independent default arrays (factory called twice).
            const c2 = Card({ ui, id: 'c2', props: {} });
            c.props.items.push('a');
            expect(c2.props.items).toEqual([]);
        });

        test('custom validator', () => {
            const Card = comp.define({
                template: ui.parse('<p id="root">#{n}</p>'),
                props: { n: { type: 'number', validator: v => v >= 0 } },
            });
            expect(() => Card({ ui, id: 'c', props: { n: -1 } })).toThrow(/failed validator/);
            expect(() => Card({ ui, id: 'c2', props: { n: 0 } })).not.toThrow();
        });

        test('update() re-validates', () => {
            const Card = comp.define({
                template: ui.parse('<p id="root">#{title}</p>'),
                props: { title: { type: 'string', required: true } },
            });
            const c = Card({ ui, id: 'c', props: { title: 'ok' } });
            expect(() => c.update({ title: 123 })).toThrow(/expected string/);
        });

        test('extra props passed through (lenient)', () => {
            const Card = comp.define({
                template: ui.parse('<p id="root">#{a}#{b}</p>'),
                props: { a: { type: 'string' } },
            });
            const c = Card({ ui, id: 'c', props: { a: 'x', b: 'y' } });
            expect(c.props.a).toBe('x');
            expect(c.props.b).toBe('y');
        });
    });

    // ── Scoped CSS ──────────────────────────────────────────────────────────

    describe('scoped CSS', () => {
        let comp, ui, root;
        beforeEach(() => {
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(`cx-${Math.random()}`, root);
            comp = makeComp();
        });

        test('injects <style> once per define()', () => {
            const before = document.querySelectorAll('style[data-fw-component]').length;
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '& { color: red; }',
            });
            const after = document.querySelectorAll('style[data-fw-component]').length;
            expect(after).toBe(before + 1);
        });

        test('& is rewritten to scope class', () => {
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '& { color: red; } & .child { padding: 1rem; }',
            });
            const styleEl = Array.from(document.querySelectorAll('style[data-fw-component]')).pop();
            expect(styleEl.textContent).toMatch(/\.fw-comp-\d+ \{ color: red; \}/);
            expect(styleEl.textContent).toMatch(/\.fw-comp-\d+ \.child \{ padding: 1rem; \}/);
        });

        test('instance root gets scope class', () => {
            const Card = comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '& { color: red; }',
            });
            const c = Card({ ui, id: 'c' });
            const rootEl = c.get();
            expect(rootEl.classList.contains(c.scopeClass)).toBe(true);
            expect(c.scopeClass).toMatch(/^fw-comp-\d+$/);
        });

        test('multiple instances share the same scope class (one <style>)', () => {
            const Card = comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '& { color: red; }',
            });
            const a = Card({ ui, id: 'a' });
            const b = Card({ ui, id: 'b' });
            expect(a.scopeClass).toBe(b.scopeClass);
        });

        test('no css → no scope class', () => {
            const Plain = comp.define({ template: ui.parse('<div id="root">x</div>') });
            const c = Plain({ ui, id: 'c' });
            expect(c.scopeClass).toBe(null);
        });
    });

    // ── Extended scoped CSS ─────────────────────────────────────────────────

    describe('extended scoped CSS', () => {
        let comp, ui, root;
        beforeEach(() => {
            // Clean previous component <style> tags for isolation.
            document.head.querySelectorAll('style[data-fw-component]').forEach(n => n.remove());
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(`cx-ext-${Math.random()}`, root);
            comp = makeComp();
        });

        test('nested & chains resolve to flat scope selectors', () => {
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '& .a { color: blue; } & .a .b { color: green; }',
            });
            const styleEl = document.head.querySelector('style[data-fw-component]');
            // After & expansion, no & characters should remain.
            expect(styleEl.textContent).not.toContain('&');
            // Flat selectors appear verbatim.
            expect(styleEl.textContent).toMatch(/\.fw-comp-\d+ \.a \{ color: blue; \}/);
            expect(styleEl.textContent).toMatch(/\.fw-comp-\d+ \.a \.b \{ color: green; \}/);
        });

        test(':global(sel) emits sel unscoped', () => {
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: ':global(body) { margin: 0; } & { color: red; }',
            });
            const styleEl = document.head.querySelector('style[data-fw-component]');
            // :global(body) → body (no scope class prefix)
            expect(styleEl.textContent).toContain('body { margin: 0; }');
            // Regular & still scoped
            expect(styleEl.textContent).toMatch(/\.fw-comp-\d+ \{ color: red; \}/);
        });

        test('@keyframes name is rewritten to a unique per-blueprint id', () => {
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } & { animation: spin 1s linear; }',
            });
            const styleEl = document.head.querySelector('style[data-fw-component]');
            // The keyframe declaration is renamed.
            expect(styleEl.textContent).toMatch(/@keyframes fw-comp-\d+-spin/);
            // The original name 'spin' does not appear as a declaration.
            expect(styleEl.textContent).not.toMatch(/@keyframes spin\b/);
            // The animation reference is also rewritten.
            expect(styleEl.textContent).toMatch(/animation: fw-comp-\d+-spin 1s linear/);
        });

        test('two components with @keyframes of the same name get distinct identifiers', () => {
            // Each define() call produces its own unique scope class.
            comp.define({
                template: ui.parse('<div id="root-a">a</div>'),
                css: '@keyframes spin { to { transform: rotate(360deg); } } & { animation-name: spin; }',
            });
            comp.define({
                template: ui.parse('<div id="root-b">b</div>'),
                css: '@keyframes spin { to { transform: rotate(360deg); } } & { animation-name: spin; }',
            });
            const styles = document.head.querySelectorAll('style[data-fw-component]');
            expect(styles.length).toBe(2);
            // Both should have had their 'spin' renamed to different unique ids.
            const kfNames = [];
            for (const s of styles) {
                const m = s.textContent.match(/@keyframes ([\w-]+)/);
                if (m) kfNames.push(m[1]);
            }
            expect(kfNames.length).toBe(2);
            expect(kfNames[0]).not.toBe('spin');
            expect(kfNames[1]).not.toBe('spin');
            expect(kfNames[0]).not.toBe(kfNames[1]);
        });

        test('@keyframes animation-name reference is rewritten', () => {
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '@keyframes fade { from { opacity: 1; } to { opacity: 0; } } & { animation-name: fade; }',
            });
            const styleEl = document.head.querySelector('style[data-fw-component]');
            expect(styleEl.textContent).toMatch(/animation-name: fw-comp-\d+-fade/);
            expect(styleEl.textContent).not.toMatch(/animation-name: fade\b/);
        });

        test('injection remains once-per-blueprint (dedup)', () => {
            // Verify dedup still works with extended CSS.
            const before = document.head.querySelectorAll('style[data-fw-component]').length;
            comp.define({
                template: ui.parse('<div id="root">x</div>'),
                css: '@keyframes bounce { from { top: 0; } } & { animation: bounce 0.5s; }',
            });
            const after = document.head.querySelectorAll('style[data-fw-component]').length;
            expect(after).toBe(before + 1);
        });
    });

    // ── self.bind integration ───────────────────────────────────────────────

    describe('self.bind', () => {
        let comp, ui, root;
        beforeEach(() => {
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession(`cx-bind-${Math.random()}`, root);
            comp = makeComp();
        });

        test('self.bind is lazily created (not set before first access)', () => {
            let bindRef;
            const Card = comp.define({
                template: ui.parse('<div id="root"><span id="t">x</span></div>'),
                mount(self) { bindRef = self.bind; },
            });
            Card({ ui, props: {} });
            expect(bindRef).toBeDefined();
            expect(typeof bindRef.text).toBe('function');
            expect(typeof bindRef.dispose).toBe('function');
        });

        test('self.bind.text wires a signal to a node and patches on change', () => {
            const name = sigInst.create('Alice');
            let bindRef;
            const Card = comp.define({
                template: ui.parse('<div id="root"><span id="label">x</span></div>'),
                mount(self) {
                    bindRef = self.bind;
                    self.bind.text(self.blockId, 'label', name);
                },
            });
            const c = Card({ ui, id: 'sb', props: {} });
            const span = c.get('label');
            expect(span.textContent).toBe('Alice');
            name.set('Bob');
            expect(span.textContent).toBe('Bob');
        });

        test('self.bind.dispose() runs automatically on unmount (destroy)', () => {
            const name = sigInst.create('Alice');
            let patchCount = 0;
            const Card = comp.define({
                template: ui.parse('<div id="root"><span id="label">x</span></div>'),
                mount(self) {
                    // Custom counter: track patches via a signal effect wrapping bind.text
                    self.bind.text(self.blockId, 'label', () => { patchCount++; return name.get(); });
                },
            });
            const c = Card({ ui, id: 'sb2', props: {} });
            // One patch happened on mount (effect runs eagerly).
            const after_mount = patchCount;
            c.destroy();
            // After destroy, signal changes must be no-ops.
            name.set('Bob');
            expect(patchCount).toBe(after_mount); // no additional patches
        });

        test('self.bind is undefined after unmount (not recreated)', () => {
            let selfRef;
            const Card = comp.define({
                template: ui.parse('<div id="root">x</div>'),
                mount(self) { selfRef = self; },
            });
            const c = Card({ ui, id: 'sb3', props: {} });
            // Ensure bind was touched before unmount.
            const _ = selfRef.bind;
            c.destroy();
            // After unmount, accessing self.bind must return undefined.
            expect(selfRef.bind).toBeUndefined();
        });

        test('self.bind not accessed → no controller created, dispose is safe', () => {
            // Verify no error when destroying a component whose bind was never accessed.
            const Card = comp.define({
                template: ui.parse('<div id="root">x</div>'),
            });
            const c = Card({ ui, id: 'sb4', props: {} });
            expect(() => c.destroy()).not.toThrow();
        });
    });

    // ── Audit fix : propsFn re-applied on update + shape consistency ────────

    describe('propsFn shape consistency (audit fix)', () => {
        let comp, ui, root;
        beforeEach(() => {
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession('cx-pf', root);
            comp = makeComp();
        });

        test('propsFn is re-applied on update() (was a bug - only ran at create-time)', () => {
            let calls = 0;
            let seenInHook = null;
            const Card = comp.define({
                template: ui.parse('<div id="r"><h3 id="t">#{title}</h3></div>'),
                propsFn: (p) => {
                    calls++;
                    return { ...p, title: (p.title || '').toUpperCase() };
                },
                update(self) {
                    // Hook reads self.props : must reflect the transformed shape
                    // for the latest update, not stale data from create-time.
                    seenInHook = self.props;
                },
            });
            const c = Card({ ui, props: { title: 'hi' } });
            const after1 = calls;
            c.update({ title: 'bye' });
            // propsFn ran a second time on update.
            expect(calls).toBeGreaterThan(after1);
            // self.props in the update hook holds the transformed shape.
            expect(seenInHook).toEqual({ title: 'BYE' });
            // Public accessor agrees.
            expect(c.props).toEqual({ title: 'BYE' });
        });

        test('self.props holds the transformed shape consistently across create() and update()', () => {
            const Card = comp.define({
                template: ui.parse('<div id="r"><span id="t">#{label}</span></div>'),
                propsFn: (p) => ({ label: `${p.first} ${p.last}` }),
            });
            const c = Card({ ui, props: { first: 'A', last: 'B' } });
            // After create : transformed shape on self.props ; raw on self.rawProps.
            expect(c.props).toEqual({ label: 'A B' });
            c.update({ first: 'C', last: 'D' });
            // After update : same shape contract - transformed stays transformed.
            expect(c.props).toEqual({ label: 'C D' });
        });
    });

    // ── Audit fix : CSS dedup on repeated define() calls ────────────────────

    describe('CSS dedup (audit fix)', () => {
        let comp, ui, root;
        beforeEach(() => {
            // Clean previous component <style> tags so the assertion below is local.
            document.head.querySelectorAll('style[data-fw-component]').forEach(n => n.remove());
            root = document.createElement('div');
            document.body.appendChild(root);
            ui   = makeSession('cx-css', root);
            comp = makeComp();
        });

        test('repeated define() of distinct CSS blueprints produces one <style> each', () => {
            comp.define({
                template: ui.parse('<div id="r">a</div>'),
                css: '& { color: red; }',
            });
            comp.define({
                template: ui.parse('<div id="r">b</div>'),
                css: '& { color: blue; }',
            });
            const styles = document.head.querySelectorAll('style[data-fw-component]');
            // Two distinct scope classes → exactly two <style> tags.
            expect(styles.length).toBe(2);
            const scopes = new Set();
            for (const s of styles) scopes.add(s.getAttribute('data-fw-component'));
            expect(scopes.size).toBe(2);
        });
    });
});
