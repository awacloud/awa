// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { dom } from './dom.js';
import { secPolicy } from '../rendering/secPolicy.js';

describe('dom module', () => {

    test('has correct module metadata', () => {
        expect(dom.name).toBe('dom');
        expect(dom.dependencies).toEqual(['secPolicy']);
        expect(typeof dom.factory).toBe('function');
    });

    describe('factory', () => {
        let api;
        let root;

        beforeEach(() => {
            api = dom.factory(secPolicy.factory());
            root = document.createElement('div');
            document.body.appendChild(root);
        });

        test('returns an object with all expected methods', () => {
            const methods = [
                'queryAll', 'query',
                'attr', 'attrGet', 'attrRemove', 'attrHas',
                'data', 'dataGet', 'dataRemove', 'dataHas',
                'classAdd', 'classRemove', 'classHas', 'classToggle', 'classReplace',
                'style', 'styleGet', 'styleGetAll', 'styleRemove',
                'hide', 'show', 'toggleVisibility',
                'textGet', 'text',
                'rect', 'scrollPos', 'scrollTo',
                'reorder',
                'focus', 'blur',
                'val', 'valGet',
                'checked', 'checkedGet',
                'disabled', 'disabledGet',
                'fragment', 'bind'
            ];
            for (const m of methods) {
                expect(typeof api[m]).toBe('function');
            }
        });

        // ── query / queryAll ──────────────────────────────────────────────────────

        describe('query / queryAll', () => {
            test('query returns a matching element', () => {
                const child = document.createElement('span');
                child.className = 'target';
                root.appendChild(child);
                expect(api.query(root, '.target')).toBe(child);
            });

            test('query returns null when no match', () => {
                expect(api.query(root, '.nonexistent')).toBeNull();
            });

            test('query returns null for invalid inputs', () => {
                expect(api.query(null, '.x')).toBeNull();
                expect(api.query(root, 42)).toBeNull();
            });

            test('queryAll returns all matching descendants', () => {
                for (let i = 0; i < 3; i++) {
                    const el = document.createElement('li');
                    el.className = 'item';
                    root.appendChild(el);
                }
                expect(api.queryAll(root, '.item').length).toBe(3);
            });

            test('queryAll returns empty array for invalid inputs', () => {
                expect(api.queryAll(null, '.x').length).toBe(0);
            });
        });

        // ── attr ─────────────────────────────────────────────────────────────────

        describe('attributes', () => {
            test('attr sets an attribute on a single element', () => {
                api.attr(root, 'data-test', 'hello');
                expect(root.getAttribute('data-test')).toBe('hello');
            });

            test('attr sets on multiple elements (array)', () => {
                const a = document.createElement('div');
                const b = document.createElement('div');
                api.attr([a, b], 'role', 'button');
                expect(a.getAttribute('role')).toBe('button');
                expect(b.getAttribute('role')).toBe('button');
            });

            test('attrGet reads an attribute', () => {
                root.setAttribute('id', 'my-id');
                expect(api.attrGet(root, 'id')).toBe('my-id');
            });

            test('attrGet returns null for missing attribute', () => {
                expect(api.attrGet(root, 'missing')).toBeNull();
            });

            test('attrGet returns null for non-Element', () => {
                expect(api.attrGet(null, 'id')).toBeNull();
            });

            test('attrRemove removes an attribute', () => {
                root.setAttribute('title', 'test');
                api.attrRemove(root, 'title');
                expect(root.hasAttribute('title')).toBe(false);
            });

            test('attrHas returns true for existing attribute', () => {
                root.setAttribute('lang', 'en');
                expect(api.attrHas(root, 'lang')).toBe(true);
            });

            test('attrHas returns false for missing attribute', () => {
                expect(api.attrHas(root, 'nonexistent')).toBe(false);
            });

            test('attrHas returns false for non-Element', () => {
                expect(api.attrHas(null, 'id')).toBe(false);
            });
        });

        // ── dataset ──────────────────────────────────────────────────────────────

        describe('dataset', () => {
            test('data sets a data-* attribute', () => {
                api.data(root, 'userId', '42');
                expect(root.dataset.userId).toBe('42');
            });

            test('dataGet retrieves a data-* value', () => {
                root.dataset.count = '7';
                expect(api.dataGet(root, 'count')).toBe('7');
            });

            test('dataGet returns null for missing key', () => {
                expect(api.dataGet(root, 'missing')).toBeNull();
            });

            test('dataRemove deletes a data-* attribute', () => {
                root.dataset.temp = 'x';
                api.dataRemove(root, 'temp');
                expect('temp' in root.dataset).toBe(false);
            });

            test('dataHas returns true for existing key', () => {
                root.dataset.exists = '1';
                expect(api.dataHas(root, 'exists')).toBe(true);
            });

            test('dataHas returns false for missing key', () => {
                expect(api.dataHas(root, 'missing')).toBe(false);
            });
        });

        // ── class ────────────────────────────────────────────────────────────────

        describe('class manipulation', () => {
            test('classAdd adds a class', () => {
                api.classAdd(root, 'active');
                expect(root.classList.contains('active')).toBe(true);
            });

            test('classAdd adds multiple space-separated classes', () => {
                api.classAdd(root, 'a b c');
                expect(root.classList.contains('a')).toBe(true);
                expect(root.classList.contains('b')).toBe(true);
                expect(root.classList.contains('c')).toBe(true);
            });

            test('classRemove removes a class', () => {
                root.classList.add('remove-me');
                api.classRemove(root, 'remove-me');
                expect(root.classList.contains('remove-me')).toBe(false);
            });

            test('classHas returns true when class is present', () => {
                root.classList.add('present');
                expect(api.classHas(root, 'present')).toBe(true);
            });

            test('classHas returns false when class is absent', () => {
                expect(api.classHas(root, 'absent')).toBe(false);
            });

            test('classHas returns false for non-Element', () => {
                expect(api.classHas(null, 'x')).toBe(false);
            });

            test('classToggle adds class when absent', () => {
                api.classToggle(root, 'toggled');
                expect(root.classList.contains('toggled')).toBe(true);
            });

            test('classToggle removes class when present', () => {
                root.classList.add('toggled');
                api.classToggle(root, 'toggled');
                expect(root.classList.contains('toggled')).toBe(false);
            });

            test('classReplace replaces an existing class', () => {
                root.classList.add('old');
                api.classReplace(root, 'old', 'new');
                expect(root.classList.contains('old')).toBe(false);
                expect(root.classList.contains('new')).toBe(true);
            });
        });

        // ── style ────────────────────────────────────────────────────────────────

        describe('style', () => {
            test('style sets an inline CSS property', () => {
                api.style(root, 'color', 'red');
                expect(root.style.getPropertyValue('color')).toBe('red');
            });

            test('styleGet reads a computed CSS value', () => {
                api.style(root, 'display', 'block');
                expect(typeof api.styleGet(root, 'display')).toBe('string');
            });

            test('styleGet returns null for non-Element', () => {
                expect(api.styleGet(null, 'color')).toBeNull();
            });

            test('styleGetAll returns a CSSStyleDeclaration', () => {
                expect(api.styleGetAll(root)).toBeDefined();
            });

            test('styleGetAll returns null for non-Element', () => {
                expect(api.styleGetAll(null)).toBeNull();
            });

            test('styleRemove removes an inline CSS property', () => {
                root.style.setProperty('color', 'red');
                api.styleRemove(root, 'color');
                expect(root.style.getPropertyValue('color')).toBe('');
            });
        });

        // ── visibility ───────────────────────────────────────────────────────────

        describe('visibility', () => {
            test('hide sets display:none', () => {
                api.hide(root);
                expect(root.style.display).toBe('none');
            });

            test('show removes inline display (restores cascade)', () => {
                root.style.display = 'none';
                api.show(root);
                expect(root.style.display).toBe('');
            });

            test('show with explicit value sets that display value', () => {
                api.show(root, 'flex');
                expect(root.style.display).toBe('flex');
            });

            test('toggleVisibility hides a visible element', () => {
                root.style.removeProperty('display');
                api.toggleVisibility(root);
                expect(root.style.display).toBe('none');
            });

            test('toggleVisibility shows a hidden element', () => {
                root.style.display = 'none';
                api.toggleVisibility(root);
                expect(root.style.display).toBe('');
            });
        });

        // ── text ─────────────────────────────────────────────────────────────────

        describe('text', () => {
            test('text sets textContent', () => {
                api.text(root, 'Hello, World!');
                expect(root.textContent).toBe('Hello, World!');
            });

            test('textGet reads textContent', () => {
                root.textContent = 'test';
                expect(api.textGet(root)).toBe('test');
            });

            test('textGet returns null for non-Element', () => {
                expect(api.textGet(null)).toBeNull();
            });

            test('multi-fragment array builds text nodes', () => {
                api.text(root, [
                    { text: 'Hello, ' },
                    { text: 'World' },
                ]);
                expect(root.textContent).toBe('Hello, World');
                // Two text nodes, no <span> (no lang).
                expect(root.children.length).toBe(0);
            });

            test('multi-fragment with lang wraps in <span lang>', () => {
                api.text(root, [
                    { text: 'Bonjour ', lang: 'fr' },
                    { text: 'Hi',       lang: 'en' },
                ]);
                expect(root.children.length).toBe(2);
                expect(root.children[0].tagName).toBe('SPAN');
                expect(root.children[0].getAttribute('lang')).toBe('fr');
                expect(root.children[0].textContent).toBe('Bonjour ');
                expect(root.children[1].getAttribute('lang')).toBe('en');
            });

            test('multi-fragment supports dir attribute', () => {
                api.text(root, [{ text: 'שלום', lang: 'he', dir: 'rtl' }]);
                expect(root.children[0].getAttribute('dir')).toBe('rtl');
            });

            test('multi-fragment mixes lang and bare text', () => {
                api.text(root, [
                    { text: 'Welcome to ' },
                    { text: 'le café', lang: 'fr' },
                ]);
                expect(root.children.length).toBe(1);                 // only the FR span
                expect(root.textContent).toBe('Welcome to le café');
            });

            test('multi-fragment replaces previous content atomically', () => {
                root.innerHTML = '';
                root.textContent = 'old';
                api.text(root, [{ text: 'new1' }, { text: 'new2' }]);
                expect(root.textContent).toBe('new1new2');
            });
        });

        // ── geometry ─────────────────────────────────────────────────────────────

        describe('geometry', () => {
            test('rect returns a DOMRect', () => {
                const r = api.rect(root);
                expect(r).toBeDefined();
            });

            test('rect returns null for non-Element', () => {
                expect(api.rect(null)).toBeNull();
            });

            test('scrollPos returns { top, left } object', () => {
                root.scrollTop = 10;
                root.scrollLeft = 20;
                const pos = api.scrollPos(root);
                expect(pos).toEqual({ top: 10, left: 20 });
            });

            test('scrollPos returns null for non-Element', () => {
                expect(api.scrollPos(null)).toBeNull();
            });

            test('scrollTo sets scrollTop and scrollLeft', () => {
                api.scrollTo(root, 5, 15);
                expect(root.scrollTop).toBe(5);
                expect(root.scrollLeft).toBe(15);
            });

            test('scrollTo with only top does not change left', () => {
                root.scrollLeft = 100;
                api.scrollTo(root, 5, undefined);
                expect(root.scrollLeft).toBe(100);
            });
        });

        // ── reorder ──────────────────────────────────────────────────────────────

        describe('reorder', () => {
            test('reorders children to the given order', () => {
                const a = document.createElement('div');
                const b = document.createElement('div');
                const c = document.createElement('div');
                a.id = 'a'; b.id = 'b'; c.id = 'c';
                root.appendChild(a);
                root.appendChild(b);
                root.appendChild(c);

                api.reorder(root, [c, a, b]);

                const ids = [...root.children].map(el => el.id);
                expect(ids).toEqual(['c', 'a', 'b']);
            });

            test('is a no-op for non-Element parent', () => {
                expect(() => api.reorder(null, [])).not.toThrow();
            });
        });

        // ── reorder - minimal move (BL-390) ─────────────────────────────────────
        // happy-dom has no `Element.prototype.moveBefore` - the `insertBefore`
        // fallback is the path under test here.

        describe('reorder - minimal move (BL-390)', () => {
            let a, b, c;

            beforeEach(() => {
                a = document.createElement('div'); a.id = 'a';
                b = document.createElement('div'); b.id = 'b';
                c = document.createElement('div'); c.id = 'c';
                root.appendChild(a);
                root.appendChild(b);
                root.appendChild(c);
            });

            test('an already-ordered list performs zero DOM moves', () => {
                const insertBeforeSpy = spyOn(root, 'insertBefore');
                const appendChildSpy  = spyOn(root, 'appendChild');

                api.reorder(root, [a, b, c]);

                expect(insertBeforeSpy).not.toHaveBeenCalled();
                expect(appendChildSpy).not.toHaveBeenCalled();
                expect([...root.children].map(el => el.id)).toEqual(['a', 'b', 'c']);
            });

            test('one out-of-place node performs exactly one move', () => {
                const insertBeforeSpy = spyOn(root, 'insertBefore');

                api.reorder(root, [a, c, b]);

                expect(insertBeforeSpy).toHaveBeenCalledTimes(1);
                expect([...root.children].map(el => el.id)).toEqual(['a', 'c', 'b']);
            });

            test('a full reversal still uses the cursor-walk minimal-move count', () => {
                // a,b,c → c,b,a : only 'a' and 'c' need to move (b is already
                // in its final middle slot once c moves ahead of it).
                const insertBeforeSpy = spyOn(root, 'insertBefore');

                api.reorder(root, [c, b, a]);

                expect(insertBeforeSpy).toHaveBeenCalledTimes(2);
                expect([...root.children].map(el => el.id)).toEqual(['c', 'b', 'a']);
            });

            // Structural proxies for the Chromium-only focus-loss symptom (real
            // `document.activeElement` tracking is not reliably testable under
            // happy-dom - see the 2026-08-10 BL-390/391 real-browser memory
            // entry). What's checkable here: the node that WOULD hold focus is
            // never passed to insertBefore/appendChild when it doesn't move.
            test('a focused-candidate element already in place is never passed to insertBefore/appendChild', () => {
                b.tabIndex = 0;
                b.focus();

                const insertBeforeSpy = spyOn(root, 'insertBefore');
                const appendChildSpy  = spyOn(root, 'appendChild');
                api.reorder(root, [a, b, c]);   // already ordered - nothing moves

                expect(insertBeforeSpy).not.toHaveBeenCalled();
                expect(appendChildSpy).not.toHaveBeenCalled();
            });

            test('a focused-candidate element that stays in place is never touched while a sibling moves', () => {
                // b is already correctly positioned (index 1); only c needs to
                // move ahead of it - b's node itself must never be passed to
                // insertBefore/appendChild (the old implementation appendChild'd
                // every listed node, b included, on every reorder).
                b.tabIndex = 0;
                b.focus();

                const insertBeforeSpy = spyOn(root, 'insertBefore');
                const appendChildSpy  = spyOn(root, 'appendChild');
                api.reorder(root, [a, c, b]);

                // Boolean identity checks (not `.toBe(b)` on the node itself) -
                // a failing DOM-node equality assertion makes bun's diff printer
                // walk the whole (circular) document tree, which is extremely
                // slow.
                const touchedB = insertBeforeSpy.mock.calls.some(call => call[0] === b)
                    || appendChildSpy.mock.calls.some(call => call[0] === b);
                expect(touchedB).toBe(false);
            });
        });

        // ── focus / blur ──────────────────────────────────────────────────────────

        describe('focus / blur', () => {
            test('focus does not throw', () => {
                const input = document.createElement('input');
                document.body.appendChild(input);
                expect(() => api.focus(input)).not.toThrow();
            });

            test('blur does not throw', () => {
                const input = document.createElement('input');
                document.body.appendChild(input);
                expect(() => api.blur(input)).not.toThrow();
            });

            test('focus is a no-op for non-Element', () => {
                expect(() => api.focus(null)).not.toThrow();
            });
        });

        // ── form values ───────────────────────────────────────────────────────────

        describe('form values', () => {
            test('val sets the value property', () => {
                const input = document.createElement('input');
                api.val(input, 'test-value');
                expect(input.value).toBe('test-value');
            });

            test('valGet reads the value property', () => {
                const input = document.createElement('input');
                input.value = 'hello';
                expect(api.valGet(input)).toBe('hello');
            });

            test('valGet returns null for non-Element', () => {
                expect(api.valGet(null)).toBeNull();
            });

            test('checked sets the checked state', () => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                api.checked(checkbox, true);
                expect(checkbox.checked).toBe(true);
                api.checked(checkbox, false);
                expect(checkbox.checked).toBe(false);
            });

            test('checkedGet reads the checked state', () => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true;
                expect(api.checkedGet(checkbox)).toBe(true);
            });

            test('checkedGet returns null for non-Element', () => {
                expect(api.checkedGet(null)).toBeNull();
            });

            test('disabled sets the disabled state', () => {
                const button = document.createElement('button');
                api.disabled(button, true);
                expect(button.disabled).toBe(true);
                api.disabled(button, false);
                expect(button.disabled).toBe(false);
            });

            test('disabledGet reads the disabled state', () => {
                const button = document.createElement('button');
                button.disabled = true;
                expect(api.disabledGet(button)).toBe(true);
            });

            test('disabledGet returns null for non-Element', () => {
                expect(api.disabledGet(null)).toBeNull();
            });
        });

        // ── fragment ──────────────────────────────────────────────────────────────

        describe('fragment', () => {
            test('returns DocumentFragment with element children', () => {
                const a = document.createElement('a');
                const b = document.createElement('b');
                const frag = api.fragment([a, b]);
                expect(frag).toBeInstanceOf(DocumentFragment);
                expect(frag.children.length).toBe(2);
            });

            test('accepts NodeList', () => {
                root.innerHTML = '<i></i><i></i>';
                const frag = api.fragment(root.querySelectorAll('i'));
                expect(frag.children.length).toBe(2);
            });

            test('skips non-Node entries', () => {
                const a = document.createElement('a');
                const frag = api.fragment([a, null, undefined, 'text', a.cloneNode()]);
                expect(frag.children.length).toBe(2);
            });

            test('non-iterable input returns empty fragment', () => {
                const frag = api.fragment(null);
                expect(frag.children.length).toBe(0);
            });
        });

        // ── bind ──────────────────────────────────────────────────────────────────

        describe('bind', () => {
            test('refresh() syncs value from getter', () => {
                const input = document.createElement('input');
                document.body.appendChild(input);
                let v = 'a';
                const h = api.bind('t:bind1', input, () => v, () => {});
                expect(input.value).toBe('a');
                v = 'b'; h.refresh();
                expect(input.value).toBe('b');
                h.destroy();
            });

            test('setter receives user input', () => {
                const input = document.createElement('input');
                document.body.appendChild(input);
                let captured = null;
                const h = api.bind('t:bind2', input, () => '', v => { captured = v; });
                input.value = 'typed';
                input.dispatchEvent(new Event('input'));
                expect(captured).toBe('typed');
                h.destroy();
            });

            test('checked mode for checkboxes', () => {
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                document.body.appendChild(cb);
                let state = true;
                const h = api.bind('t:bind3', cb, () => state, v => { state = v; },
                                   { event: 'change', checked: true });
                expect(cb.checked).toBe(true);
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
                expect(state).toBe(false);
                h.destroy();
            });

            test('destroy is idempotent', () => {
                const input = document.createElement('input');
                document.body.appendChild(input);
                const h = api.bind('t:bind4', input, () => '', () => {});
                h.destroy();
                expect(() => h.destroy()).not.toThrow();
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const api2 = dom.factory(secPolicy.factory());
                expect(api).not.toBe(api2);
            });
        });

        // ── CSS safety filter ─────────────────────────────────────────────────────

        describe('style CSS safety', () => {
            test('drops expression(...) values', () => {
                const el = document.createElement('div');
                document.body.appendChild(el);
                api.style(el, 'width', 'expression(alert(1))');
                expect(el.style.getPropertyValue('width')).toBe('');
            });
            test('drops url(javascript:...) values', () => {
                const el = document.createElement('div');
                document.body.appendChild(el);
                api.style(el, 'background', 'url(javascript:alert(1))');
                expect(el.style.getPropertyValue('background')).toBe('');
            });
            test('drops behavior:url(...) values', () => {
                const el = document.createElement('div');
                document.body.appendChild(el);
                api.style(el, 'behavior', 'url(/htc/foo.htc)');
                expect(el.style.getPropertyValue('behavior')).toBe('');
            });
            test('drops obfuscated javascript: via whitespace', () => {
                const el = document.createElement('div');
                document.body.appendChild(el);
                api.style(el, 'cursor', 'url(  java\nscript:alert(1)  )');
                expect(el.style.getPropertyValue('cursor')).toBe('');
            });
            test('allows safe values', () => {
                const el = document.createElement('div');
                document.body.appendChild(el);
                api.style(el, 'color', 'red');
                api.style(el, 'background', 'url(/img/bg.png)');
                expect(el.style.getPropertyValue('color')).toBe('red');
                expect(el.style.getPropertyValue('background')).toContain('bg.png');
            });
        });

        // ── text / textGet ────────────────────────────────────────────────────────

        describe('text and textGet', () => {
            test('text sets textContent on a single element', () => {
                const el = document.createElement('p');
                document.body.appendChild(el);
                api.text(el, 'hello');
                expect(el.textContent).toBe('hello');
                document.body.removeChild(el);
            });
            test('text sets textContent on a list of elements', () => {
                const a = document.createElement('span');
                const b = document.createElement('span');
                document.body.appendChild(a); document.body.appendChild(b);
                api.text([a, b], 'X');
                expect(a.textContent).toBe('X');
                expect(b.textContent).toBe('X');
                document.body.removeChild(a); document.body.removeChild(b);
            });
            test('text coerces null/undefined to empty string', () => {
                const el = document.createElement('p');
                document.body.appendChild(el);
                el.textContent = 'will be wiped';
                api.text(el, null);
                expect(el.textContent).toBe('');
                api.text(el, undefined);
                expect(el.textContent).toBe('');
                document.body.removeChild(el);
            });
            test('text coerces non-string to string', () => {
                const el = document.createElement('p');
                document.body.appendChild(el);
                api.text(el, 42);
                expect(el.textContent).toBe('42');
                document.body.removeChild(el);
            });
            test('textGet returns the current textContent', () => {
                const el = document.createElement('p');
                el.textContent = 'read me';
                expect(api.textGet(el)).toBe('read me');
            });
            test('textGet returns null when input is not a Node', () => {
                expect(api.textGet(null)).toBeNull();
                expect(api.textGet('not a node')).toBeNull();
                expect(api.textGet({})).toBeNull();
            });
        });
    });
});
