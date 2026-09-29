// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { form } from './form.js';
import { dom } from '../query/dom.js';
import { secPolicy } from '../rendering/secPolicy.js';
import { events } from '../query/events.js';

function makeForm() {
    return form.factory(dom.factory(secPolicy.factory()), events.factory());
}

describe('form module', () => {
    test('has correct module metadata', () => {
        expect(form.name).toBe('form');
        expect(form.version).toBe('1.1.0');
        expect(form.type).toBe('fw.dom.utils');
        expect(form.dependencies).toEqual(['dom', 'events']);
    });

    describe('bind (low-level)', () => {
        let api, input;
        beforeEach(() => {
            api = makeForm();
            input = document.createElement('input');
            document.body.appendChild(input);
        });

        test('initial getter populates element value', () => {
            let v = 'hello';
            api.bind('b1', input, () => v, (nv) => { v = nv; });
            expect(input.value).toBe('hello');
        });

        test('user input updates the setter', () => {
            let v = '';
            api.bind('b2', input, () => v, (nv) => { v = nv; });
            input.value = 'typed';
            input.dispatchEvent(new Event('input'));
            expect(v).toBe('typed');
        });

        test('refresh() re-syncs from getter', () => {
            let v = 'a';
            const h = api.bind('b3', input, () => v, () => {});
            v = 'b';
            h.refresh();
            expect(input.value).toBe('b');
        });

        test('destroy() detaches the listener', () => {
            let v = '';
            const h = api.bind('b4', input, () => v, (nv) => { v = nv; });
            h.destroy();
            input.value = 'x';
            input.dispatchEvent(new Event('input'));
            expect(v).toBe('');
        });

        test('checked mode binds element.checked', () => {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            document.body.appendChild(cb);
            let v = true;
            api.bind('b5', cb, () => v, (nv) => { v = nv; }, { checked: true, event: 'change' });
            expect(cb.checked).toBe(true);
            cb.checked = false;
            cb.dispatchEvent(new Event('change'));
            expect(v).toBe(false);
        });
    });

    describe('create (high-level form)', () => {
        let api;
        beforeEach(() => { api = makeForm(); });

        test('initial values from defaults', () => {
            const f = api.create({
                fields: { name: { default: 'Ada' }, age: { type: 'boolean', default: true } },
            });
            expect(f.values).toEqual({ name: 'Ada', age: true });
        });

        test('set() updates value, dirty, validation', () => {
            const f = api.create({
                fields: { name: { required: true } },
            });
            expect(f.errors.name).toBe('Required');
            f.set('name', 'Alice');
            expect(f.values.name).toBe('Alice');
            expect(f.dirty.name).toBe(true);
            expect(f.errors.name).toBeUndefined();
            expect(f.isValid).toBe(true);
        });

        test('per-field validate function', () => {
            const f = api.create({
                fields: {
                    age: { validate: (v) => Number(v) < 18 ? 'Too young' : null },
                },
            });
            f.set('age', '12');
            expect(f.errors.age).toBe('Too young');
            f.set('age', '25');
            expect(f.errors.age).toBeUndefined();
        });

        test('cross-field validate', () => {
            const f = api.create({
                fields: { pass: {}, confirm: {} },
                validate: (vals) => vals.pass !== vals.confirm ? { confirm: 'No match' } : {},
            });
            f.set('pass', 'abc');
            f.set('confirm', 'def');
            f.validate();
            expect(f.errors.confirm).toBe('No match');
            f.set('confirm', 'abc');
            f.validate();
            expect(f.errors.confirm).toBeUndefined();
        });

        test('touch flips touched flag', () => {
            const f = api.create({ fields: { x: {} } });
            expect(f.touched.x).toBe(false);
            f.touch('x');
            expect(f.touched.x).toBe(true);
        });

        test('attach + user input flows back into state', () => {
            const f = api.create({ fields: { name: {} } });
            const input = document.createElement('input');
            document.body.appendChild(input);
            f.attach('name', input);
            input.value = 'typed';
            input.dispatchEvent(new Event('input'));
            expect(f.values.name).toBe('typed');
        });

        test('attach + blur sets touched', () => {
            const f = api.create({ fields: { name: {} } });
            const input = document.createElement('input');
            document.body.appendChild(input);
            f.attach('name', input);
            input.dispatchEvent(new Event('blur'));
            expect(f.touched.name).toBe(true);
        });

        test('reset returns to defaults and clears dirty/touched', () => {
            const f = api.create({ fields: { x: { default: 'init' } } });
            f.set('x', 'changed');
            f.touch('x');
            f.reset();
            expect(f.values.x).toBe('init');
            expect(f.dirty.x).toBe(false);
            expect(f.touched.x).toBe(false);
        });

        test('reset accepts overrides', () => {
            const f = api.create({ fields: { x: { default: 'a' } } });
            f.reset({ x: 'override' });
            expect(f.values.x).toBe('override');
        });

        test('submit blocks on validation errors', async () => {
            let ran = false;
            const f = api.create({
                fields: { name: { required: true } },
                onSubmit: () => { ran = true; },
            });
            const ok = await f.submit();
            expect(ok).toBe(false);
            expect(ran).toBe(false);
            expect(f.touched.name).toBe(true);  // all fields marked touched
        });

        test('submit runs onSubmit when valid', async () => {
            let received = null;
            const f = api.create({
                fields: { name: { required: true } },
                onSubmit: (vals) => { received = vals; },
            });
            f.set('name', 'Ada');
            const ok = await f.submit();
            expect(ok).toBe(true);
            expect(received).toEqual({ name: 'Ada' });
        });

        test('subscribe receives state on changes', () => {
            const f = api.create({ fields: { x: { default: 'a' } } });
            const seen = [];
            const unsub = f.subscribe((s) => seen.push(s.values.x));
            f.set('x', 'b');
            f.set('x', 'c');
            unsub();
            f.set('x', 'd');
            expect(seen).toEqual(['b', 'c']);   // unsub stopped it
        });

        test('snapshot is independent of internal state', () => {
            const f = api.create({ fields: { x: { default: 'a' } } });
            const snap = f.snapshot();
            f.set('x', 'b');
            expect(snap.values.x).toBe('a');   // snapshot frozen
        });

        test('attach twice on different elements does not leak blur on the first', () => {
            const f = api.create({ fields: { name: {} } });
            const el1 = document.createElement('input');
            const el2 = document.createElement('input');
            document.body.appendChild(el1);
            document.body.appendChild(el2);
            f.attach('name', el1);
            f.attach('name', el2);
            // Blurring the OLD element must NOT flip touched anymore.
            el1.dispatchEvent(new Event('blur'));
            expect(f.touched.name).toBe(false);
            // The NEW element's blur still works.
            el2.dispatchEvent(new Event('blur'));
            expect(f.touched.name).toBe(true);
        });

        test('snapshot deep-clones array errors (caller cannot mutate state)', () => {
            const f = api.create({
                fields: {
                    emails: {
                        type: 'array',
                        default: () => ['bad', 'also-bad'],
                        itemValidate: (v) => v.includes('@') ? null : 'Invalid',
                    },
                },
            });
            f.validate();
            const snap = f.snapshot();
            expect(snap.errors.emails).toEqual(['Invalid', 'Invalid']);
            // Mutate the snapshot.
            snap.errors.emails[0] = 'TAMPERED';
            // Live state untouched.
            expect(f.errors.emails[0]).toBe('Invalid');
        });

        test('errors getter deep-clones array errors', () => {
            const f = api.create({
                fields: {
                    tags: {
                        type: 'array',
                        default: () => ['bad'],
                        itemValidate: (v) => v.includes('@') ? null : 'Invalid',
                    },
                },
            });
            f.validate();
            const e1 = f.errors;
            e1.tags[0] = 'mutated';
            // A fresh read returns the original message.
            expect(f.errors.tags[0]).toBe('Invalid');
        });

        test('detach removes all DOM bindings', () => {
            const f = api.create({ fields: { x: {} } });
            const input = document.createElement('input');
            document.body.appendChild(input);
            f.attach('x', input);
            f.detach();
            input.value = 'after-detach';
            input.dispatchEvent(new Event('input'));
            expect(f.values.x).toBe('');
        });
    });

    // ── Async validators ────────────────────────────────────────────────────

    describe('async validators', () => {
        test('sets validating[name] then settles to error/clear', async () => {
            const f = makeForm().create({
                fields: {
                    user: {
                        type: 'string',
                        validate: async (v) => v === 'taken' ? 'Already taken' : null,
                    },
                },
            });
            f.set('user', 'taken');
            expect(f.snapshot().validating.user).toBe(true);
            expect(f.isValid).toBe(false);              // conservative while pending
            await new Promise(r => setTimeout(r, 0));
            expect(f.errors.user).toBe('Already taken');
            expect(f.snapshot().validating.user).toBe(false);
        });

        test('async validator that resolves to null clears the error', async () => {
            const f = makeForm().create({
                fields: {
                    user: {
                        type: 'string',
                        validate: async () => null,
                    },
                },
            });
            f.set('user', 'ok');
            await new Promise(r => setTimeout(r, 0));
            expect(f.errors.user).toBeUndefined();
            expect(f.isValid).toBe(true);
        });

        test('stale async results are ignored (token cancels)', async () => {
            const f = makeForm().create({
                fields: {
                    user: {
                        type: 'string',
                        validate: (v) => new Promise(res => setTimeout(() =>
                            res(v === 'first' ? 'first-err' : null), 20)),
                    },
                },
            });
            f.set('user', 'first');     // slow
            f.set('user', 'second');    // supersedes
            await new Promise(r => setTimeout(r, 40));
            // Final result is from 'second' (null) ; 'first-err' was discarded.
            expect(f.errors.user).toBeUndefined();
        });

        test('validateAsync() awaits pending validations', async () => {
            const f = makeForm().create({
                fields: {
                    user: {
                        type: 'string',
                        validate: (v) => new Promise(res => setTimeout(() =>
                            res(v ? null : 'Required'), 10)),
                    },
                },
            });
            f.set('user', '');
            const ok = await f.validateAsync();
            expect(ok).toBe(false);
            expect(f.errors.user).toBe('Required');
        });

        test('submit() awaits pending async validation before deciding', async () => {
            let onSubmitCalled = false;
            const f = makeForm().create({
                fields: {
                    user: {
                        type: 'string',
                        default: 'ok',
                        validate: (v) => new Promise(res => setTimeout(() =>
                            res(v === 'ok' ? null : 'fail'), 10)),
                    },
                },
                onSubmit: () => { onSubmitCalled = true; },
            });
            const result = await f.submit();
            expect(result).toBe(true);
            expect(onSubmitCalled).toBe(true);
        });

        test('async validator throw → error message captured', async () => {
            const f = makeForm().create({
                fields: {
                    x: {
                        type: 'string',
                        validate: () => Promise.reject(new Error('network down')),
                    },
                },
            });
            f.set('x', 'anything');
            await new Promise(r => setTimeout(r, 0));
            expect(f.errors.x).toBe('network down');
        });
    });

    // ── Array fields ────────────────────────────────────────────────────────

    describe('array fields', () => {
        test('default array value is empty unless specified', () => {
            const f = makeForm().create({
                fields: {
                    emails: { type: 'array' },
                    tags:   { type: 'array', default: () => ['a', 'b'] },
                },
            });
            expect(f.values.emails).toEqual([]);
            expect(f.values.tags).toEqual(['a', 'b']);
        });

        test('array() throws on non-array fields', () => {
            const f = makeForm().create({
                fields: { x: { type: 'string' } },
            });
            expect(() => f.array('x')).toThrow(/not declared as type:'array'/);
        });

        test('push / remove / move / set / length', () => {
            const f = makeForm().create({
                fields: { items: { type: 'array' } },
            });
            const a = f.array('items');
            expect(a.length).toBe(0);
            a.push('A');
            a.push('B');
            a.push('C');
            expect(a.length).toBe(3);
            expect(a.values).toEqual(['A', 'B', 'C']);
            a.move(0, 2);
            expect(a.values).toEqual(['B', 'C', 'A']);
            a.set(1, 'X');
            expect(a.values).toEqual(['B', 'X', 'A']);
            a.remove(0);
            expect(a.values).toEqual(['X', 'A']);
        });

        test('itemValidate produces per-item error array', () => {
            const f = makeForm().create({
                fields: {
                    emails: {
                        type: 'array',
                        default: () => ['ok@x.com', 'bad'],
                        itemValidate: (v) => v.includes('@') ? null : 'Invalid email',
                    },
                },
            });
            f.validate();
            expect(f.errors.emails).toEqual([null, 'Invalid email']);
            expect(f.isValid).toBe(false);

            const a = f.array('emails');
            a.set(1, 'fixed@x.com');
            expect(f.errors.emails).toBeUndefined();
            expect(f.isValid).toBe(true);
        });

        test('required array → empty triggers Required', () => {
            const f = makeForm().create({
                fields: {
                    tags: { type: 'array', required: true },
                },
            });
            expect(f.errors.tags).toBe('Required');
            f.array('tags').push('first');
            expect(f.errors.tags).toBeUndefined();
        });

        test('array mutations mark field dirty + notify subscribers', () => {
            const f = makeForm().create({ fields: { xs: { type: 'array' } } });
            let calls = 0;
            f.subscribe(() => { calls++; });
            f.array('xs').push(1);
            expect(f.dirty.xs).toBe(true);
            expect(calls).toBe(1);
        });

        test('reset wipes the array back to default', () => {
            const f = makeForm().create({
                fields: { tags: { type: 'array', default: () => ['init'] } },
            });
            const a = f.array('tags');
            a.push('x');
            a.push('y');
            expect(a.length).toBe(3);
            f.reset();
            expect(f.array('tags').values).toEqual(['init']);
        });
    });
});
