// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { render } from './render.js';
import { secPolicy } from './secPolicy.js';

const sp = () => secPolicy.factory();

describe('render module', () => {

    test('has correct module metadata', () => {
        expect(render.name).toBe('render');
        expect(render.dependencies).toEqual(['secPolicy']);
        expect(typeof render.factory).toBe('function');
    });

    describe('factory', () => {
        let r;

        beforeEach(() => {
            r = render.factory(sp());
        });

        test('returns an object with all expected methods', () => {
            expect(typeof r.elms).toBe('function');
            expect(typeof r.rewrite).toBe('function');
            expect(typeof r.parts).toBe('function');
            expect(typeof r.loop).toBe('function');
            expect(typeof r.full).toBe('function');
        });

        // ── Helper: simple elm array fixture ─────────────────────────────────────

        function makeElm(id, tag, parent, text, map, data, attrs) {
            const elm = { id, tag };
            if (parent !== undefined) elm.parent = parent;
            if (text !== undefined) elm.text = text;
            if (map !== undefined) elm.map = map;
            if (data !== undefined) elm.data = data;
            if (attrs !== undefined) elm.attrs = attrs;
            return elm;
        }

        // ── elms ─────────────────────────────────────────────────────────────────

        describe('elms', () => {
            test('returns a new array without modifying the original', () => {
                const original = [makeElm('a', 'div', undefined, 'hello')];
                const result = r.elms(original, {});
                expect(result).not.toBe(original);
                expect(result[0]).not.toBe(original[0]);
            });

            test('full-replace variable binding sets elm.text', () => {
                const template = [makeElm('a', 'div', undefined, '', [{ name: 'msg', prop: 'text' }])];
                const result = r.elms(template, { msg: 'Hello' });
                expect(result[0].text).toBe('Hello');
            });

            test('append data binding appends to existing attribute value', () => {
                const template = [{
                    id: 'a', tag: 'div',
                    attrs: ['class'],
                    data: { class: 'base ' },
                    map: [{ name: 'extra', prop: 'class', data: true, append: true }]
                }];
                const result = r.elms(template, { extra: 'active' });
                expect(result[0].data.class).toBe('base active');
            });

            test('prepend data binding prepends to existing attribute value', () => {
                const template = [{
                    id: 'a', tag: 'div',
                    attrs: ['class'],
                    data: { class: '-suffix' },
                    map: [{ name: 'pre', prop: 'class', data: true, prepend: true }]
                }];
                const result = r.elms(template, { pre: 'prefix' });
                expect(result[0].data.class).toBe('prefix-suffix');
            });

            test('append + tail preserves both leading and trailing static runs', () => {
                // shape: "a:#{v};z" — prefix + var + suffix in one attribute value
                const template = [{
                    id: 'a', tag: 'div',
                    attrs: ['style'],
                    data: { style: 'a:' },
                    map: [{ name: 'v', prop: 'style', data: true, append: true, tail: ';z' }]
                }];
                const result = r.elms(template, { v: 'X' });
                expect(result[0].data.style).toBe('a:X;z');
            });

            test('interleaved static/var segments (a#{v1}b#{v2}c) render in order', () => {
                const template = [makeElm('a', 'div', undefined, 'a', [
                    { name: 'v1', prop: 'text', append: true, tail: 'b' },
                    { name: 'v2', prop: 'text', append: true, tail: 'c' },
                ])];
                const result = r.elms(template, { v1: '1', v2: '2' });
                expect(result[0].text).toBe('a1b2c');
            });

            test('attribute binding (data:true) sets elm.data[prop]', () => {
                const template = [{
                    id: 'a', tag: 'div',
                    attrs: ['class'],
                    data: { class: '' },
                    map: [{ name: 'cls', prop: 'class', data: true }]
                }];
                const result = r.elms(template, { cls: 'active' });
                expect(result[0].data.class).toBe('active');
            });

            test('missing variable uses map.default when provided', () => {
                const template = [makeElm('a', 'div', undefined, '',
                    [{ name: 'msg', prop: 'text', default: 'fallback' }])];
                const result = r.elms(template, {});
                expect(result[0].text).toBe('fallback');
            });

            test('missing variable with no default leaves field unchanged', () => {
                const template = [makeElm('a', 'div', undefined, 'original',
                    [{ name: 'missing', prop: 'text' }])];
                const result = r.elms(template, {});
                expect(result[0].text).toBe('original');
            });

            test('attach sets parent on root-level elements', () => {
                const template = [makeElm('child', 'span')];
                const result = r.elms(template, {}, 'parent-id');
                expect(result[0].parent).toBe('parent-id');
            });

            test('attach does not overwrite existing parent', () => {
                const template = [makeElm('child', 'span', 'original-parent')];
                const result = r.elms(template, {}, 'new-parent');
                expect(result[0].parent).toBe('original-parent');
            });
        });

        // ── rewrite ───────────────────────────────────────────────────────────────

        describe('rewrite', () => {
            test('returns an object with arr, map, content', () => {
                const template = [makeElm('a', 'div')];
                const result = r.rewrite(template);
                expect(Array.isArray(result.arr)).toBe(true);
                expect(result.map).toBeInstanceOf(Map);
                expect(result.content).toBeInstanceOf(Map);
            });

            test('all element IDs are rewritten to new unique values', () => {
                const template = [
                    makeElm('original', 'div'),
                    makeElm('child', 'span', 'original')
                ];
                const result = r.rewrite(template);
                expect(result.arr[0].id).not.toBe('original');
                expect(result.arr[1].id).not.toBe('child');
            });

            test('id_map maps old IDs to new IDs', () => {
                const template = [makeElm('original', 'div')];
                const result = r.rewrite(template);
                expect(result.map.has('original')).toBe(true);
                expect(result.map.get('original')).toBe(result.arr[0].id);
            });

            test('parent references are updated to new IDs', () => {
                const template = [
                    makeElm('parent', 'div'),
                    makeElm('child', 'span', 'parent')
                ];
                const result = r.rewrite(template);
                const newParentId = result.map.get('parent');
                expect(result.arr[1].parent).toBe(newParentId);
            });

            test('content map registers slot containers', () => {
                const template = [{ id: 'slot', tag: 'div', content: 'mySlot' }];
                const result = r.rewrite(template);
                expect(result.content.has('mySlot')).toBe(true);
                expect(result.content.get('mySlot')).toBe(result.arr[0].id);
            });

            test('two calls produce different IDs (collision-safe)', () => {
                const template = [makeElm('a', 'div')];
                const r1 = r.rewrite(template);
                const r2 = r.rewrite(template);
                expect(r1.arr[0].id).not.toBe(r2.arr[0].id);
            });
        });

        // ── parts ────────────────────────────────────────────────────────────────

        describe('parts', () => {
            test('equivalent to elms then rewrite', () => {
                const template = [makeElm('a', 'div', undefined, '',
                    [{ name: 'x', prop: 'text' }])];
                const result = r.parts(template, { x: 'val' });
                expect(result.arr[0].text).toBe('val');
                expect(result.arr[0].id).not.toBe('a');
            });

            test('accepts empty options', () => {
                const template = [makeElm('a', 'div')];
                const result = r.parts(template);
                expect(result.arr.length).toBe(1);
            });
        });

        // ── loop ─────────────────────────────────────────────────────────────────

        describe('loop', () => {
            test('returns one RenderResult per options entry', () => {
                const template = [makeElm('a', 'div')];
                const options = [{ x: 1 }, { x: 2 }, { x: 3 }];
                const results = r.loop(template, options);
                expect(results.length).toBe(3);
            });

            test('each result has independent IDs', () => {
                const template = [makeElm('a', 'div')];
                const results = r.loop(template, [{}, {}]);
                expect(results[0].arr[0].id).not.toBe(results[1].arr[0].id);
            });

            test('returns empty array for empty options', () => {
                const template = [makeElm('a', 'div')];
                expect(r.loop(template, []).length).toBe(0);
            });

            test('applies variable bindings per iteration', () => {
                const template = [makeElm('a', 'div', undefined, '',
                    [{ name: 'val', prop: 'text' }])];
                const results = r.loop(template, [{ val: 'first' }, { val: 'second' }]);
                expect(results[0].arr[0].text).toBe('first');
                expect(results[1].arr[0].text).toBe('second');
            });
        });

        // ── full ─────────────────────────────────────────────────────────────────

        describe('full', () => {
            test('returns arr, map, attach', () => {
                const result = r.full([{ template: [makeElm('a', 'div')], data: {} }]);
                expect(Array.isArray(result.arr)).toBe(true);
                expect(result.map).toBeInstanceOf(Map);
                expect(result.attach).toBeInstanceOf(Map);
            });

            test('single item with id is stored in map', () => {
                const result = r.full([{
                    id: 'block1',
                    template: [makeElm('a', 'div')],
                    data: {}
                }]);
                expect(result.map.has('block1')).toBe(true);
                expect(result.map.get('block1')).toBeInstanceOf(Map);
            });

            test('item with array data uses loop and stores array of maps', () => {
                const result = r.full([{
                    id: 'list',
                    template: [makeElm('item', 'li')],
                    data: [{}, {}, {}]
                }]);
                expect(result.map.has('list')).toBe(true);
                const maps = result.map.get('list');
                expect(Array.isArray(maps)).toBe(true);
                expect(maps.length).toBe(3);
            });

            test('item without id is rendered but not stored in map', () => {
                const result = r.full([{
                    template: [makeElm('a', 'div')],
                    data: {}
                }]);
                expect(result.arr.length).toBe(1);
                expect(result.map.size).toBe(0);
            });

            test('attach slot not found sets id_map entry to false', () => {
                // Build a pre-existing attach_map that has the elm but NOT the slot name.
                const prebuiltAttach = new Map();
                prebuiltAttach.set('host', { content: new Map([['realSlot', 'some-id']]) });

                const result = r.full([{
                    id: 'child',
                    template: [makeElm('a', 'div')],
                    data: {},
                    attach: { elm: 'host', name: 'wrongSlot' }
                }], prebuiltAttach);
                expect(result.map.get('child')).toBe(false);
            });

            test('item with content slot is stored in attach_map', () => {
                const template = [{ id: 'container', tag: 'div', content: 'mySlot' }];
                const result = r.full([{
                    id: 'parent',
                    template,
                    data: {}
                }]);
                expect(result.attach.has('parent')).toBe(true);
                expect(result.attach.get('parent').content.has('mySlot')).toBe(true);
            });

            test('chains results via attach_parent and id_parent', () => {
                const containerTemplate = [{ id: 'box', tag: 'div', content: 'slot' }];
                const r1 = r.full([{ id: 'parent', template: containerTemplate, data: {} }]);

                const childTemplate = [makeElm('x', 'span')];
                const r2 = r.full([{
                    id: 'child',
                    template: childTemplate,
                    data: {},
                    attach: { elm: 'parent', name: 'slot' }
                }], r1.attach, r1.map);

                expect(r2.map.has('child')).toBe(true);
                expect(r2.map.get('child')).not.toBe(false);
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const r1 = render.factory(sp());
                const r2 = render.factory(sp());
                expect(r1).not.toBe(r2);
            });
        });

        // ── computeBoundValue ─────────────────────────────────────────────────────

        describe('computeBoundValue', () => {
            let api;
            beforeEach(() => { api = render.factory(sp()); });

            test('full replace when neither append nor prepend', () => {
                const m = { name: 'x', prop: 'class' };
                expect(api.computeBoundValue(m, { x: 'foo' }, 'base')).toBe('foo');
            });
            test('append concatenates onto base', () => {
                const m = { name: 'x', prop: 'class', append: true };
                expect(api.computeBoundValue(m, { x: 'foo' }, 'base-')).toBe('base-foo');
            });
            test('prepend concatenates before base', () => {
                const m = { name: 'x', prop: 'class', prepend: true };
                expect(api.computeBoundValue(m, { x: 'foo' }, '-base')).toBe('foo-base');
            });
            test('uses default when var is missing from data', () => {
                const m = { name: 'x', prop: 'class', default: 'fallback' };
                expect(api.computeBoundValue(m, {}, 'base')).toBe('fallback');
            });
            test('returns base when no value and no default', () => {
                const m = { name: 'x', prop: 'class' };
                expect(api.computeBoundValue(m, {}, 'untouched')).toBe('untouched');
            });
            test('passes null/false/0/empty through unchanged', () => {
                const m = { name: 'x', prop: 'class' };
                expect(api.computeBoundValue(m, { x: null  }, 'b')).toBe(null);
                expect(api.computeBoundValue(m, { x: false }, 'b')).toBe(false);
                expect(api.computeBoundValue(m, { x: 0     }, 'b')).toBe(0);
                expect(api.computeBoundValue(m, { x: ''    }, 'b')).toBe('');
            });
            test('append + tail keeps both the base prefix and trailing run', () => {
                const m = { name: 'v', prop: 'style', append: true, tail: ';z' };
                expect(api.computeBoundValue(m, { v: 'X' }, 'a:')).toBe('a:X;z');
            });
            test('tail survives a missing value (static run preserved)', () => {
                const m = { name: 'v', prop: 'style', append: true, tail: ';z' };
                expect(api.computeBoundValue(m, {}, 'a:')).toBe('a:;z');
            });
        });

        // ── applyParsedElm ────────────────────────────────────────────────────────

        describe('applyParsedElm', () => {
            let api;
            beforeEach(() => { api = render.factory(sp()); });

            test('returns base values when elm has no map', () => {
                const elm = { id: 'a', tag: 'p', data: { class: 'foo' }, text: 'hi' };
                const out = api.applyParsedElm(elm, {});
                expect(out.data).toEqual({ class: 'foo' });
                expect(out.text).toBe('hi');
            });
            test('resolves a single text binding', () => {
                const elm = { id: 'a', tag: 'p', text: '', map: [{ name: 'msg', prop: 'text' }] };
                expect(api.applyParsedElm(elm, { msg: 'hello' }).text).toBe('hello');
            });
            test('resolves an attribute binding', () => {
                const elm = {
                    id: 'a', tag: 'div',
                    data: { class: '' },
                    map:  [{ name: 'cls', prop: 'class', data: true }],
                };
                expect(api.applyParsedElm(elm, { cls: 'active' }).data.class).toBe('active');
            });
            test('combines multiple bindings on same prop in order', () => {
                const elm = {
                    id: 'a', tag: 'div',
                    data: { class: 'base-' },
                    map: [
                        { name: 'a', prop: 'class', data: true, append: true },
                        { name: 'b', prop: 'class', data: true, append: true },
                    ],
                };
                expect(api.applyParsedElm(elm, { a: 'x', b: 'y' }).data.class).toBe('base-xy');
            });
            test('does not mutate the input elm', () => {
                const elm = {
                    id: 'a', tag: 'p',
                    data: { class: 'static' },
                    map:  [{ name: 'cls', prop: 'class', data: true }],
                };
                api.applyParsedElm(elm, { cls: 'dynamic' });
                expect(elm.data.class).toBe('static');
            });
            test('passes through null (conditional-attr semantics)', () => {
                const elm = {
                    id: 'a', tag: 'details',
                    data: { open: '' },
                    map:  [{ name: 'open', prop: 'open', data: true }],
                };
                expect(api.applyParsedElm(elm, { open: null }).data.open).toBe(null);
            });
        });
    });
});
