// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }
import { keybindings } from './keybindings.js';

// ── Stubs ─────────────────────────────────────────────────────────────────────

/**
 * Minimal stub for `events` (not used directly in the impl, but declared as dep).
 */
const eventsStub = {};

/**
 * Minimal stub for `eventBus`: creates a real in-memory bus.
 * We import the real implementation from its module so that
 * keybindings:matched is verifiable.
 */
const eventBusStub = {
    create() {
        const subs = new Map();
        return {
            on(topic, fn) {
                if (!subs.has(topic)) subs.set(topic, []);
                subs.get(topic).push(fn);
                return () => {
                    const arr = subs.get(topic) || [];
                    const idx = arr.indexOf(fn);
                    if (idx !== -1) arr.splice(idx, 1);
                };
            },
            emit(topic, data) {
                const arr = subs.get(topic) || [];
                for (const fn of [...arr]) fn(data);
            },
        };
    },
};

/**
 * Creates a synthetic KeyboardEvent compatible with bun (native EventTarget present).
 * @param {string} code - e.g. 'KeyS', 'Escape'
 * @param {Object} [mods]
 * @param {boolean} [repeat]
 */
function makeKeyEvent(code, mods = {}, repeat = false) {
    const key = resolveKey(code);
    return new KeyboardEvent('keydown', {
        key,
        code,
        ctrlKey:  mods.ctrl  || false,
        shiftKey: mods.shift || false,
        altKey:   mods.alt   || false,
        metaKey:  mods.meta  || false,
        repeat,
        bubbles:  true,
        cancelable: true,
    });
}

/** Derives event.key from code. */
function resolveKey(code) {
    if (code === 'Escape')     return 'Escape';
    if (code === 'Tab')        return 'Tab';
    if (code === 'Enter')      return 'Enter';
    if (code === 'Space')      return ' ';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);      // 'KeyS' → 'S'
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);    // 'Digit1' → '1'
    if (/^F\d+$/.test(code))   return code;                 // 'F1' → 'F1'
    return code;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('keybindings module', () => {

    // ── 1. Metadata ───────────────────────────────────────────────────────────

    test('has correct module metadata', () => {
        expect(keybindings.name).toBe('keybindings');
        expect(keybindings.version).toBe('1.0.0');
        expect(keybindings.type).toBe('fw.dom.utils');
        expect(keybindings.dependencies).toEqual(['events', 'eventBus']);
        expect(typeof keybindings.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns object with expected API', () => {
            const inst = keybindings.factory(eventsStub, eventBusStub);
            expect(typeof inst.create).toBe('function');
            expect(typeof inst.parse).toBe('function');
        });
    });

    // ── 2. parse ──────────────────────────────────────────────────────────────

    describe('parse', () => {
        let api;
        beforeEach(() => { api = keybindings.factory(eventsStub, eventBusStub); });

        test('simple combo - Ctrl+S', () => {
            const r = api.parse('Ctrl+S');
            expect(r.modifiers).toEqual({ ctrl: true, shift: false, alt: false, meta: false });
            expect(r.key).toBe('s');
        });

        test('Ctrl+Shift+P', () => {
            const r = api.parse('Ctrl+Shift+P');
            expect(r.modifiers).toEqual({ ctrl: true, shift: true, alt: false, meta: false });
            expect(r.key).toBe('p');
        });

        test('named key Escape', () => {
            const r = api.parse('Escape');
            expect(r.key).toBe('Escape');
        });

        test('Esc alias', () => {
            const r = api.parse('Esc');
            expect(r.key).toBe('Escape');
        });

        test('Meta/Cmd/Super alias', () => {
            expect(api.parse('Meta+S').modifiers.meta).toBe(true);
            expect(api.parse('Cmd+S').modifiers.meta).toBe(true);
            expect(api.parse('Super+S').modifiers.meta).toBe(true);
        });

        test('chord - Ctrl+K Ctrl+P returns array', () => {
            const r = api.parse('Ctrl+K Ctrl+P');
            expect(Array.isArray(r)).toBe(true);
            expect(r).toHaveLength(2);
            expect(r[0].key).toBe('k');
            expect(r[1].key).toBe('p');
            expect(r[0].modifiers.ctrl).toBe(true);
            expect(r[1].modifiers.ctrl).toBe(true);
        });

        test('throws on empty combo', () => {
            expect(() => api.parse('')).toThrow();
        });

        test('throws on Ctrl++ (double +)', () => {
            expect(() => api.parse('Ctrl++')).toThrow();
        });

        test('throws on unknown key', () => {
            expect(() => api.parse('Ctrl+NotAKey')).toThrow();
        });

        test('throws on non-string', () => {
            expect(() => api.parse(null)).toThrow(TypeError);
        });
    });

    // ── 3. bind / unbind ──────────────────────────────────────────────────────

    describe('bind / unbind', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('bind returns unbind function', () => {
            const unbind = kb.bind('Ctrl+S', () => {});
            expect(typeof unbind).toBe('function');
        });

        test('registered binding appears in list()', () => {
            const fn = () => {};
            kb.bind('Ctrl+A', fn);
            const entries = kb.list();
            expect(entries.some(e => e.combo === 'Ctrl+A' && e.fn === fn)).toBe(true);
        });

        test('unbind via returned fn removes binding', () => {
            const fn = () => {};
            const ub = kb.bind('Ctrl+Z', fn);
            ub();
            expect(kb.list().some(e => e.combo === 'Ctrl+Z')).toBe(false);
        });

        test('unbind(combo) removes all fns for combo', () => {
            kb.bind('Ctrl+X', () => {});
            kb.bind('Ctrl+X', () => {});
            kb.unbind('Ctrl+X');
            expect(kb.list().filter(e => e.combo === 'Ctrl+X')).toHaveLength(0);
        });

        test('unbind(combo, fn) removes only that fn', () => {
            const fn1 = () => {};
            const fn2 = () => {};
            kb.bind('Ctrl+Y', fn1);
            kb.bind('Ctrl+Y', fn2);
            kb.unbind('Ctrl+Y', fn1);
            const remaining = kb.list().filter(e => e.combo === 'Ctrl+Y');
            expect(remaining).toHaveLength(1);
            expect(remaining[0].fn).toBe(fn2);
        });
    });

    // ── 4. match - handler called on KeyboardEvent ───────────────────────────

    describe('match + handler', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('handler is called on matching key', () => {
            const called = [];
            kb.bind('Ctrl+S', (e) => called.push('save'));
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(called).toEqual(['save']);
        });

        test('handler is NOT called on non-matching key', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('save'));
            target.dispatchEvent(makeKeyEvent('KeyA', { ctrl: true }));
            expect(called).toHaveLength(0);
        });

        test('match() returns matching bindings', () => {
            const fn = () => {};
            kb.bind('Ctrl+K', fn);
            const event = makeKeyEvent('KeyK', { ctrl: true });
            const results = kb.match(event);
            expect(results.some(r => r.combo === 'Ctrl+K' && r.fn === fn)).toBe(true);
        });

        test('match() returns empty array when no match', () => {
            kb.bind('Ctrl+S', () => {});
            const event = makeKeyEvent('KeyA');
            expect(kb.match(event)).toHaveLength(0);
        });

        // ── AltGr (Windows/Firefox): Ctrl+Alt merged into AltGr ───────────────
        // Firefox then reports getModifierState('AltGraph')===true with
        // ctrlKey/altKey at false. A Ctrl+Alt+X combo must match; a combo
        // requiring only one of the two modifiers must NOT match.

        test('AltGr keypress triggers a Ctrl+Alt combo (Firefox/Windows)', () => {
            const called = [];
            kb.bind('Ctrl+Alt+2', () => called.push('palette'));
            const ev = makeKeyEvent('Digit2');          // ctrl/alt = false
            ev.getModifierState = (m) => m === 'AltGraph';
            target.dispatchEvent(ev);
            expect(called).toEqual(['palette']);
        });

        test('AltGr keypress does NOT falsely trigger a Ctrl-only combo', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('save'));
            const ev = makeKeyEvent('KeyS');            // ctrl/alt = false
            ev.getModifierState = (m) => m === 'AltGraph';
            target.dispatchEvent(ev);
            expect(called).toHaveLength(0);
        });

        test('legacy ctrl+alt (Chrome) still triggers a Ctrl+Alt combo', () => {
            const called = [];
            kb.bind('Ctrl+Alt+1', () => called.push('taskmgr'));
            target.dispatchEvent(makeKeyEvent('Digit1', { ctrl: true, alt: true }));
            expect(called).toEqual(['taskmgr']);
        });
    });

    // ── 5. preventDefault: false ──────────────────────────────────────────────

    describe('preventDefault option', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('preventDefault: true (default) calls event.preventDefault', () => {
            let prevented = false;
            kb.bind('Ctrl+P', () => {});
            const ev = makeKeyEvent('KeyP', { ctrl: true });
            Object.defineProperty(ev, 'preventDefault', {
                value: () => { prevented = true; },
                writable: true,
            });
            target.dispatchEvent(ev);
            expect(prevented).toBe(true);
        });

        test('preventDefault: false does NOT call event.preventDefault', () => {
            let prevented = false;
            kb.bind('Ctrl+Q', () => {}, { preventDefault: false });
            const ev = makeKeyEvent('KeyQ', { ctrl: true });
            Object.defineProperty(ev, 'preventDefault', {
                value: () => { prevented = true; },
                writable: true,
            });
            target.dispatchEvent(ev);
            expect(prevented).toBe(false);
        });
    });

    // ── 6. Chord ──────────────────────────────────────────────────────────────

    describe('chord', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            // very short timeout for delay tests
            kb = api.create({ target, chordTimeout: 50 });
            kb.attach();
        });

        test('first key alone does not trigger chord handler', () => {
            const called = [];
            kb.bind('Ctrl+K Ctrl+P', () => called.push('palette'));
            target.dispatchEvent(makeKeyEvent('KeyK', { ctrl: true }));
            expect(called).toHaveLength(0);
        });

        test('second key within timeout triggers handler', async () => {
            const called = [];
            kb.bind('Ctrl+K Ctrl+P', () => called.push('palette'));
            target.dispatchEvent(makeKeyEvent('KeyK', { ctrl: true }));
            target.dispatchEvent(makeKeyEvent('KeyP', { ctrl: true }));
            expect(called).toEqual(['palette']);
        });

        test('second key after timeout does not trigger', async () => {
            const called = [];
            kb.bind('Ctrl+K Ctrl+P', () => called.push('palette'), { chordTimeout: 10 });
            target.dispatchEvent(makeKeyEvent('KeyK', { ctrl: true }));
            await new Promise(r => setTimeout(r, 100));
            target.dispatchEvent(makeKeyEvent('KeyP', { ctrl: true }));
            expect(called).toHaveLength(0);
        });

        test('wrong second key cancels chord and does not trigger', () => {
            const called = [];
            kb.bind('Ctrl+K Ctrl+P', () => called.push('palette'));
            target.dispatchEvent(makeKeyEvent('KeyK', { ctrl: true }));
            target.dispatchEvent(makeKeyEvent('KeyX', { ctrl: true })); // wrong key
            expect(called).toHaveLength(0);
        });
    });

    // ── 7. Context ────────────────────────────────────────────────────────────

    describe('context', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('pushContext / currentContext', () => {
            kb.pushContext('modal');
            expect(kb.currentContext()).toEqual(['modal']);
        });

        test('popContext removes top context', () => {
            kb.pushContext('modal');
            kb.popContext();
            expect(kb.currentContext()).toHaveLength(0);
        });

        test('popContext() on empty stack throws RangeError', () => {
            const kb2 = api.create({ target: document });
            expect(() => kb2.popContext()).toThrow(/underflow/);
        });

        test('contextual binding is called when context matches', () => {
            const called = [];
            kb.bind('Escape', () => called.push('esc-modal'), { context: 'modal' });
            kb.pushContext('modal');
            target.dispatchEvent(makeKeyEvent('Escape'));
            expect(called).toEqual(['esc-modal']);
        });

        test('contextual binding is NOT called when no context active', () => {
            const called = [];
            kb.bind('Escape', () => called.push('esc-modal'), { context: 'modal' });
            target.dispatchEvent(makeKeyEvent('Escape'));
            expect(called).toHaveLength(0);
        });

        test('non-contextual binding is NOT called when context is active', () => {
            const called = [];
            kb.bind('Escape', () => called.push('esc-global')); // no context
            kb.pushContext('modal');
            target.dispatchEvent(makeKeyEvent('Escape'));
            expect(called).toHaveLength(0);
        });

        test('popContext restores normal bindings', () => {
            const called = [];
            kb.bind('Escape', () => called.push('esc-global'));
            kb.pushContext('modal');
            kb.popContext();
            target.dispatchEvent(makeKeyEvent('Escape'));
            expect(called).toEqual(['esc-global']);
        });
    });

    // ── 8. Priority ───────────────────────────────────────────────────────────

    describe('priority', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('highest priority wins', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('low'),  { priority: 0 });
            kb.bind('Ctrl+S', () => called.push('high'), { priority: 10 });
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(called).toEqual(['high']);
        });

        test('equal priority - both called', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('a'), { priority: 5 });
            kb.bind('Ctrl+S', () => called.push('b'), { priority: 5 });
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(called).toHaveLength(2);
        });
    });

    // ── 9. repeat: false ──────────────────────────────────────────────────────

    describe('repeat', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('repeat: false (default) - ignored when event.repeat=true', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('save')); // repeat: false by default
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }, true /* repeat */));
            expect(called).toHaveLength(0);
        });

        test('repeat: true - called even when event.repeat=true', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('save'), { repeat: true });
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }, true /* repeat */));
            expect(called).toEqual(['save']);
        });
    });

    // ── 10. detach ────────────────────────────────────────────────────────────

    describe('detach', () => {
        let api, kb, target;

        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = new EventTarget();
            kb = api.create({ target });
            kb.attach();
        });

        test('after detach, no handler is triggered', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('save'));
            kb.detach();
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(called).toHaveLength(0);
        });

        test('re-attach works after detach', () => {
            const called = [];
            kb.bind('Ctrl+S', () => called.push('save'));
            kb.detach();
            kb.attach();
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(called).toEqual(['save']);
        });
    });

    // ── 11. dispose ───────────────────────────────────────────────────────────

    describe('dispose', () => {
        test('clears all bindings and detaches', () => {
            const api = keybindings.factory(eventsStub, eventBusStub);
            const target = new EventTarget();
            const kb = api.create({ target });
            kb.attach();
            kb.bind('Ctrl+S', () => {});
            kb.dispose();
            expect(kb.list()).toHaveLength(0);
            // Re-dispatch must not trigger anything
            const called = [];
            kb.bind('Ctrl+S', () => called.push('x')); // re-bind after dispose, not re-attached
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(called).toHaveLength(0);
        });
    });

    // ── 12. eventBus emission ─────────────────────────────────────────────────

    describe('eventBus emission', () => {
        test('emits keybindings:matched on each triggered binding', () => {
            const bus = eventBusStub.create();
            const busFactory = { create: () => bus };
            const api = keybindings.factory(eventsStub, busFactory);
            const target = new EventTarget();
            const kb = api.create({ target });
            kb.attach();

            const emitted = [];
            bus.on('keybindings:matched', (data) => emitted.push(data));

            kb.bind('Ctrl+S', () => {});
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));

            expect(emitted).toHaveLength(1);
            expect(emitted[0].combo).toBe('Ctrl+S');
        });
    });

    // ── scope() - group cleanup for component/modal lifecycle ───────────────

    describe('scope()', () => {
        let api, kb, target;
        beforeEach(() => {
            api = keybindings.factory(eventsStub, eventBusStub);
            target = document.createElement('div');
            target.tabIndex = 0;
            document.body.appendChild(target);
            kb = api.create({ target });
            kb.attach();
        });

        test('scope.bind tracks bindings ; scope.clear unbinds them', () => {
            const sc = kb.scope();
            let count = 0;
            sc.bind('Ctrl+S', () => { count++; });

            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(count).toBe(1);

            sc.clear();
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(count).toBe(1);
        });

        test('scope.dispose is an alias of clear', () => {
            const sc = kb.scope();
            let count = 0;
            sc.bind('Ctrl+S', () => { count++; });
            sc.dispose();
            target.dispatchEvent(makeKeyEvent('KeyS', { ctrl: true }));
            expect(count).toBe(0);
        });

        test('clearing a scope does NOT dispose the parent instance', () => {
            let parentCount = 0;
            kb.bind('Ctrl+R', () => { parentCount++; });

            const sc = kb.scope();
            sc.bind('Ctrl+S', () => {});
            sc.clear();

            target.dispatchEvent(makeKeyEvent('KeyR', { ctrl: true }));
            expect(parentCount).toBe(1);
        });
    });
});
