// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for `styleSheet`.
 *
 * happy-dom ownership: register ONLY when no document exists yet and
 * unregister in `afterAll` under that same flag (idiom of devtools-ui.test.js).
 * Probed on happy-dom 20.x: `styleEl.sheet` is non-null once connected,
 * `document.adoptedStyleSheets` exists and `CSSStyleSheet.prototype.replaceSync`
 * exists, so the adopted-mode tests use the real objects.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';

let _ownsDom = false;
if (typeof globalThis.document === 'undefined') {
    GlobalRegistrator.register();
    _ownsDom = true;
}

import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { styleSheet } from './styleSheet.js';

afterAll(async () => {
    if (_ownsDom) {
        _ownsDom = false;
        await GlobalRegistrator.unregister();
    }
});

const _handles = [];
let _inst;
function track(h) { _handles.push(h); return h; }

beforeEach(() => {
    _inst = styleSheet.factory();
});

afterEach(() => {
    for (const h of _handles.splice(0)) h.detach();
    for (const el of Array.from(document.querySelectorAll('style'))) el.remove();
    for (const el of Array.from(document.querySelectorAll('meta[name="csp-nonce"]'))) el.remove();
    document.adoptedStyleSheets = [];
});

describe('styleSheet module', () => {
    test('should have correct module metadata', () => {
        expect(styleSheet.name).toBe('styleSheet');
        expect(styleSheet.version).toBe('1.0.0');
        expect(styleSheet.type).toBe('fw.dom.rendering');
        expect(styleSheet.dependencies).toEqual([]);
        expect(typeof styleSheet.factory).toBe('function');
    });

    describe('factory', () => {
        test('should expose exactly the four public members', () => {
            expect(typeof _inst.support).toBe('function');
            expect(typeof _inst.mode).toBe('function');
            expect(typeof _inst.attach).toBe('function');
            expect(Object.keys(_inst).sort()).toEqual(['attach', 'mode', 'support']);
        });
    });

    describe('support', () => {
        test('reports constructable support shape', () => {
            const s = _inst.support();
            expect(typeof s.constructable).toBe('boolean');
            expect(s.constructable).toBe(true);
        });

        test('is false when CSSStyleSheet is deleted', () => {
            const saved = globalThis.CSSStyleSheet;
            try {
                delete globalThis.CSSStyleSheet;
                expect(_inst.support().constructable).toBe(false);
            } finally {
                globalThis.CSSStyleSheet = saved;
            }
            expect(_inst.support().constructable).toBe(true);
        });
    });

    describe('mode', () => {
        test('defaults to element', () => {
            expect(_inst.mode()).toBe('element');
        });

        test('set and get', () => {
            expect(_inst.mode('adopted')).toBeUndefined();
            expect(_inst.mode()).toBe('adopted');
            _inst.mode('element');
            expect(_inst.mode()).toBe('element');
        });

        test('throws on unknown value', () => {
            expect(() => _inst.mode('bogus')).toThrow(TypeError);
            expect(() => _inst.mode('bogus')).toThrow("styleSheet: unknown mode 'bogus'");
            expect(_inst.mode()).toBe('element');
        });

        test('two instances do not share the mode', () => {
            const other = styleSheet.factory();
            _inst.mode('adopted');
            expect(other.mode()).toBe('element');
        });
    });

    describe('attach - element mode', () => {
        test('creates one <style> in head with the text', () => {
            const h = track(_inst.attach('a{color:red}'));
            const els = document.head.querySelectorAll('style');
            expect(els.length).toBe(1);
            expect(els[0].textContent).toBe('a{color:red}');
            expect(h.mode).toBe('element');
            expect(h.element === els[0]).toBe(true);
            expect(h.sheet).toBeNull();
            expect(h.id).toBeNull();
        });

        test('sets id and attrs', () => {
            const h = track(_inst.attach('a{}', { id: 'x1', attrs: { 'data-k': 'v', media: 'all' } }));
            expect(h.id).toBe('x1');
            expect(h.element.id).toBe('x1');
            expect(h.element.getAttribute('data-k')).toBe('v');
            expect(h.element.getAttribute('media')).toBe('all');
        });

        test('attribute order is id, attrs, nonce', () => {
            const h = track(_inst.attach('a{}', { id: 'x', attrs: { 'data-a': '1' }, nonce: 'n1' }));
            const names = Array.from(h.element.attributes).map((a) => a.name);
            expect(names).toEqual(['id', 'data-a', 'nonce']);
        });

        test('nonce from opts', () => {
            const h = track(_inst.attach('a{}', { nonce: 'abc' }));
            expect(h.element.getAttribute('nonce')).toBe('abc');
        });

        test('nonce from a csp-nonce meta present at factory time', () => {
            const meta = document.createElement('meta');
            meta.setAttribute('name', 'csp-nonce');
            meta.setAttribute('content', 'meta-nonce');
            document.head.appendChild(meta);
            const inst = styleSheet.factory();
            const h = track(inst.attach('a{}'));
            expect(h.element.getAttribute('nonce')).toBe('meta-nonce');
            // explicit opts.nonce wins; '' means none
            const h2 = track(inst.attach('b{}', { nonce: '' }));
            expect(h2.element.hasAttribute('nonce')).toBe(false);
            const h3 = track(inst.attach('c{}', { nonce: 'own' }));
            expect(h3.element.getAttribute('nonce')).toBe('own');
        });

        test('no nonce attribute by default and for the empty string', () => {
            const h = track(_inst.attach('a{}'));
            expect(h.element.hasAttribute('nonce')).toBe(false);
            const h2 = track(_inst.attach('a{}', { nonce: '' }));
            expect(h2.element.hasAttribute('nonce')).toBe(false);
        });

        test('opts.head is honoured', () => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            try {
                const h = track(_inst.attach('a{}', { head: host }));
                expect(h.element.parentNode === host).toBe(true);
                expect(document.head.querySelectorAll('style').length).toBe(0);
            } finally {
                host.remove();
            }
        });
    });

    describe('handle - element mode', () => {
        test('set rewrites the text', () => {
            const h = track(_inst.attach('a{}'));
            h.set('b{}');
            expect(h.element.textContent).toBe('b{}');
        });

        test('set after a manual remove re-appends', () => {
            const h = track(_inst.attach('a{}'));
            h.element.remove();
            expect(h.element.isConnected).toBe(false);
            h.set('c{}');
            expect(h.element.isConnected).toBe(true);
            expect(h.element.parentNode === document.head).toBe(true);
            expect(h.element.textContent).toBe('c{}');
        });

        test('detach removes and is idempotent', () => {
            const h = _inst.attach('a{}');
            h.detach();
            expect(document.head.querySelectorAll('style').length).toBe(0);
            expect(() => h.detach()).not.toThrow();
        });

        test('set after detach is a no-op', () => {
            const h = _inst.attach('a{}');
            h.detach();
            h.set('z{}');
            expect(h.element.isConnected).toBe(false);
            expect(h.element.textContent).toBe('a{}');
            expect(document.head.querySelectorAll('style').length).toBe(0);
        });
    });

    describe('attach - adopted mode', () => {
        test('creates no <style> and appends a sheet keeping earlier entries', () => {
            const Ctor = document.defaultView.CSSStyleSheet;
            const earlier = new Ctor();
            document.adoptedStyleSheets = [earlier];
            _inst.mode('adopted');
            const h = track(_inst.attach('a{color:red}', { id: 'ad1' }));
            expect(h.mode).toBe('adopted');
            expect(h.id).toBe('ad1');
            expect(h.element).toBeNull();
            expect(h.sheet).toBeTruthy();
            expect(document.head.querySelectorAll('style').length).toBe(0);
            expect(document.adoptedStyleSheets.length).toBe(2);
            expect(document.adoptedStyleSheets[0] === earlier).toBe(true);
            expect(document.adoptedStyleSheets[1] === h.sheet).toBe(true);
        });

        test('set calls replaceSync', () => {
            const h = track(_inst.attach('a{}', { mode: 'adopted' }));
            const calls = [];
            const orig = h.sheet.replaceSync.bind(h.sheet);
            h.sheet.replaceSync = (t) => { calls.push(t); return orig(t); };
            h.set('b{color:blue}');
            expect(calls).toEqual(['b{color:blue}']);
        });

        test('detach removes only its own sheet and is idempotent', () => {
            const h1 = track(_inst.attach('a{}', { mode: 'adopted' }));
            const h2 = track(_inst.attach('b{}', { mode: 'adopted' }));
            expect(document.adoptedStyleSheets.length).toBe(2);
            h1.detach();
            expect(document.adoptedStyleSheets.length).toBe(1);
            expect(document.adoptedStyleSheets[0] === h2.sheet).toBe(true);
            expect(() => h1.detach()).not.toThrow();
            expect(document.adoptedStyleSheets.length).toBe(1);
        });

        test('set after detach is a no-op', () => {
            const h = _inst.attach('a{}', { mode: 'adopted' });
            h.detach();
            const calls = [];
            h.sheet.replaceSync = (t) => { calls.push(t); };
            h.set('z{}');
            expect(calls).toEqual([]);
        });

        test('works with a recording stand-in (reassignment, no push)', () => {
            const savedCtor = globalThis.CSSStyleSheet;
            const savedDefault = document.defaultView.CSSStyleSheet;
            const savedAdopted = document.adoptedStyleSheets;
            const frozenList = Object.freeze([]);
            const log = [];
            class FakeSheet { replaceSync(t) { log.push(t); } }
            try {
                globalThis.CSSStyleSheet = FakeSheet;
                document.defaultView.CSSStyleSheet = FakeSheet;
                document.adoptedStyleSheets = frozenList;
                const h = _inst.attach('x{}', { mode: 'adopted' });
                expect(h.mode).toBe('adopted');
                expect(h.sheet instanceof FakeSheet).toBe(true);
                h.set('y{}');
                expect(log).toEqual(['x{}', 'y{}']);
                h.detach();
            } finally {
                globalThis.CSSStyleSheet = savedCtor;
                document.defaultView.CSSStyleSheet = savedDefault;
                document.adoptedStyleSheets = savedAdopted;
            }
        });
    });

    describe('adopted requested but unsupported', () => {
        test('falls back to element mode', () => {
            const savedCtor = globalThis.CSSStyleSheet;
            try {
                delete globalThis.CSSStyleSheet;
                expect(document.defaultView.CSSStyleSheet).toBeUndefined();
                _inst.mode('adopted');
                const h = track(_inst.attach('a{}'));
                expect(h.mode).toBe('element');
                expect(h.element.isConnected).toBe(true);
                expect(document.adoptedStyleSheets.length).toBe(0);
            } finally {
                globalThis.CSSStyleSheet = savedCtor;
            }
        });
    });

    describe('opts.mode', () => {
        test('overrides the instance mode for that call only', () => {
            _inst.mode('adopted');
            const hEl = track(_inst.attach('a{}', { mode: 'element' }));
            expect(hEl.mode).toBe('element');
            const hAd = track(_inst.attach('b{}'));
            expect(hAd.mode).toBe('adopted');
            expect(_inst.mode()).toBe('adopted');
        });

        test('unknown per-call mode throws', () => {
            expect(() => _inst.attach('a{}', { mode: 'nope' })).toThrow(TypeError);
        });
    });

    describe('errors', () => {
        test('attach with a non-string throws TypeError', () => {
            expect(() => _inst.attach(123)).toThrow(TypeError);
            expect(() => _inst.attach(123)).toThrow('styleSheet: css must be a string');
        });

        test('handle.set with a non-string throws TypeError', () => {
            const h = track(_inst.attach('a{}'));
            expect(() => h.set(null)).toThrow(TypeError);
            const h2 = track(_inst.attach('a{}', { mode: 'adopted' }));
            expect(() => h2.set(null)).toThrow('styleSheet: css must be a string');
        });
    });

    describe('no document', () => {
        test('returns the inert handle without throwing', () => {
            const savedDoc = globalThis.document;
            try {
                delete globalThis.document;
                expect(typeof globalThis.document).toBe('undefined');
                const inst = styleSheet.factory();
                expect(inst.support().constructable).toBe(false);
                const h = inst.attach('a{}', { id: 'q' });
                expect(h.mode).toBe('none');
                expect(h.id).toBe('q');
                expect(h.element).toBeNull();
                expect(h.sheet).toBeNull();
                expect(() => { h.set('b{}'); h.detach(); }).not.toThrow();
            } finally {
                globalThis.document = savedDoc;
            }
        });
    });
});
