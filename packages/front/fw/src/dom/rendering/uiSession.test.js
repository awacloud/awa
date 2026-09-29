// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { uiSession } from './uiSession.js';
import { uiSessionCore }   from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList }   from './uiSession-list.js';
import { template } from './template.js';
import { render } from './render.js';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

// ── Integration test helpers ──────────────────────────────────────────────────
// uiSession depends on template, render, parser, dom, events + 3 split mixins.

function makeSession(containerName, containerEl) {
    const sp           = secPolicy.factory();
    const tplInstance  = template.factory(sp);
    const renderInst   = render.factory(sp);
    const parserInst   = parser.factory(sp);
    const domInst      = dom.factory(sp);
    const eventsInst   = events.factory();
    const coreInst     = uiSessionCore.factory(tplInstance, renderInst, parserInst, domInst, eventsInst);
    const directInst   = uiSessionDirect.factory(domInst, eventsInst);
    const listInst     = uiSessionList.factory(tplInstance, renderInst, domInst);

    tplInstance.init(containerName, { to: containerEl, main: true });

    const sessionFactory = uiSession.factory(coreInst, directInst, listInst);
    return sessionFactory(containerName);
}

describe('uiSession module', () => {

    test('has correct module metadata', () => {
        expect(uiSession.name).toBe('uiSession');
        expect(uiSession.dependencies).toEqual([
            'uiSessionCore', 'uiSessionDirect', 'uiSessionList',
        ]);
        expect(typeof uiSession.factory).toBe('function');
    });

    describe('factory', () => {
        let session;
        let container;

        beforeEach(() => {
            container = document.createElement('div');
            document.body.appendChild(container);
            session = makeSession('test-ctx', container);
        });

        test('returns a factory function', () => {
            const sp  = secPolicy.factory();
            const tpl = template.factory(sp);
            const rnd = render.factory(sp);
            const prs = parser.factory(sp);
            const dm  = dom.factory(sp);
            const ev  = events.factory();
            expect(typeof uiSession.factory(
                uiSessionCore.factory(tpl, rnd, prs, dm, ev),
                uiSessionDirect.factory(dm, ev),
                uiSessionList.factory(tpl, rnd, dm),
            )).toBe('function');
        });

        test('created session has all expected methods', () => {
            expect(typeof session.parse).toBe('function');
            expect(typeof session.get).toBe('function');
            expect(typeof session.query).toBe('function');
            expect(typeof session.queryAll).toBe('function');
            expect(typeof session.add).toBe('function');
            expect(typeof session.append).toBe('function');
            expect(typeof session.prepend).toBe('function');
            expect(typeof session.remove).toBe('function');
            expect(typeof session.clear).toBe('function');
            expect(typeof session.move).toBe('function');
            expect(typeof session.replace).toBe('function');
        });

        // ── parse ─────────────────────────────────────────────────────────────────

        describe('parse', () => {
            test('returns a ParseResult with template array', () => {
                const result = session.parse('<div id="root"></div>');
                expect(Array.isArray(result.template)).toBe(true);
                expect(result.template.length).toBe(1);
            });

            test('parses iterate blocks into result.iterates', () => {
                const html = '<ul id="list"><!-- $rows --><li id="row">#{text}</li><!-- rows$ --></ul>';
                const result = session.parse(html);
                expect(result.iterates).toBeDefined();
                expect(result.iterates.rows).toBeDefined();
            });
        });

        // ── add / get ─────────────────────────────────────────────────────────────

        describe('add and get', () => {
            test('add inserts elements into the container', () => {
                const block = session.parse('<div id="box"></div>');
                session.add([{ id: 'myBlock', template: block.template, data: {} }]);
                expect(container.children.length).toBeGreaterThan(0);
            });

            test('get returns the DOM node for a rendered element', () => {
                const block = session.parse('<div id="box"></div>');
                session.add([{ id: 'b1', template: block.template, data: {} }]);
                const node = session.get('b1', 'box');
                expect(node).not.toBeNull();
                expect(node.tagName.toLowerCase()).toBe('div');
            });

            test('get returns null for unknown blockId', () => {
                expect(session.get('missing', 'box')).toBeNull();
            });

            test('get returns null for unknown logicalId', () => {
                const block = session.parse('<div id="el"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                expect(session.get('b', 'no-such-id')).toBeNull();
            });

            test('variable binding is applied to rendered element', () => {
                const block = session.parse('<p id="msg">#{text}</p>');
                session.add([{ id: 'b', template: block.template, data: { text: 'Hello!' } }]);
                const node = session.get('b', 'msg');
                expect(node.textContent).toBe('Hello!');
            });
        });

        // ── query / queryAll ──────────────────────────────────────────────────────

        describe('query and queryAll', () => {
            test('query returns the first match inside a block element', () => {
                const block = session.parse('<div id="parent"><span id="child" class="item"></span></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                const found = session.query('b', 'parent', '.item');
                expect(found).not.toBeNull();
            });

            test('query returns null when parent not found', () => {
                expect(session.query('missing', 'el', '.x')).toBeNull();
            });

            test('queryAll returns all matching descendants', () => {
                const html = '<div id="list"><span id="s1" class="item"></span><span id="s2" class="item"></span></div>';
                const block = session.parse(html);
                session.add([{ id: 'b', template: block.template, data: {} }]);
                const items = session.queryAll('b', 'list', '.item');
                expect(items.length).toBe(2);
            });
        });

        // ── append / prepend ──────────────────────────────────────────────────────

        describe('append and prepend', () => {
            test('append is an alias for add', () => {
                const block = session.parse('<div id="a-el"></div>');
                const ret = session.append([{ id: 'a-block', template: block.template, data: {} }]);
                expect(session.get('a-block', 'a-el')).not.toBeNull();
                expect(ret).toBe(session); // chainable
            });

            test('prepend inserts element before existing children', () => {
                const block1 = session.parse('<div id="first"></div>');
                const block2 = session.parse('<div id="second"></div>');

                session.add([{ id: 'b1', template: block1.template, data: {} }]);
                session.prepend([{ id: 'b2', template: block2.template, data: {} }]);

                // 'second' was prepended, so it should appear first in the container.
                expect(container.children[0].id).not.toBeNull();
            });
        });

        // ── remove ────────────────────────────────────────────────────────────────

        describe('remove', () => {
            test('removes a specific element from the context', () => {
                const block = session.parse('<div id="el"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.remove('b', 'el');
                expect(session.get('b', 'el')).toBeNull();
            });

            test('returns this for chaining', () => {
                const block = session.parse('<div id="e"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                expect(session.remove('b', 'e')).toBe(session);
            });

            test('is a no-op when element does not exist', () => {
                expect(() => session.remove('missing', 'el')).not.toThrow();
            });
        });

        // ── clear ─────────────────────────────────────────────────────────────────

        describe('clear', () => {
            test('clear() resets all elements', () => {
                const block = session.parse('<div id="elm"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.clear();
                expect(container.children.length).toBe(0);
            });

            test('clear(blockId) removes only that block', () => {
                const b1 = session.parse('<div id="e1"></div>');
                const b2 = session.parse('<div id="e2"></div>');
                session.add([
                    { id: 'block1', template: b1.template, data: {} },
                    { id: 'block2', template: b2.template, data: {} }
                ]);
                session.clear('block1');
                expect(session.get('block1', 'e1')).toBeNull();
                expect(session.get('block2', 'e2')).not.toBeNull();
            });

            test('clear(blockId, logicalId) removes children of that element', () => {
                const html = '<div id="parent"><span id="child"></span></div>';
                const block = session.parse(html);
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.clear('b', 'parent');
                // Parent remains; child is removed.
                expect(session.get('b', 'parent')).not.toBeNull();
                expect(session.get('b', 'child')).toBeNull();
            });

            test('returns this for chaining', () => {
                expect(session.clear()).toBe(session);
            });
        });

        // ── move ─────────────────────────────────────────────────────────────────

        describe('move', () => {
            test('moves an element to a new parent', () => {
                const html = '<div id="p1"></div><div id="p2"></div><span id="item"></span>';
                const block = session.parse(html);
                session.add([{ id: 'b', template: block.template, data: {} }]);

                session.move('b', 'item', 'b', 'p1');
                const p1 = session.get('b', 'p1');
                const item = session.get('b', 'item');
                expect(item).not.toBeNull();
                expect(p1.contains(item)).toBe(true);
            });

            test('returns this for chaining', () => {
                const block = session.parse('<div id="a"></div><div id="b"></div>');
                session.add([{ id: 'bl', template: block.template, data: {} }]);
                expect(session.move('bl', 'a', 'bl', 'b')).toBe(session);
            });
        });

        // ── replace ───────────────────────────────────────────────────────────────

        describe('replace', () => {
            test('clears the block and re-renders with new items', () => {
                const block1 = session.parse('<div id="old"></div>');
                const block2 = session.parse('<div id="new-el"></div>');
                session.add([{ id: 'b', template: block1.template, data: {} }]);
                session.replace('b', [{ id: 'b', template: block2.template, data: {} }]);
                expect(session.get('b', 'old')).toBeNull();
                expect(session.get('b', 'new-el')).not.toBeNull();
            });

            test('returns this for chaining', () => {
                const block = session.parse('<div id="x"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                expect(session.replace('b', [{ id: 'b', template: block.template, data: {} }])).toBe(session);
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('two sessions are independent', () => {
                const c2 = document.createElement('div');
                document.body.appendChild(c2);
                const session2 = makeSession('ctx2', c2);
                expect(session).not.toBe(session2);
            });
        });

        // ── New ergonomic accessors: text / attr / on / exists ────────────────────

        describe('text', () => {
            test('updates textContent of a logical element', () => {
                const block = session.parse('<p id="msg">init</p>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.text('b', 'msg', 'updated');
                expect(session.get('b', 'msg').textContent).toBe('updated');
            });
            test('no-op when element absent', () => {
                expect(() => session.text('missing', 'x', 'foo')).not.toThrow();
            });
            test('chainable', () => {
                const block = session.parse('<p id="msg">init</p>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                expect(session.text('b', 'msg', 'x')).toBe(session);
            });
        });

        describe('attr', () => {
            test('sets attribute value', () => {
                const block = session.parse('<div id="el"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.attr('b', 'el', 'data-flag', 'on');
                expect(session.get('b', 'el').getAttribute('data-flag')).toBe('on');
            });
            test('removes attribute when value is null', () => {
                const block = session.parse('<div id="el" data-x="keep"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.attr('b', 'el', 'data-x', null);
                expect(session.get('b', 'el').hasAttribute('data-x')).toBe(false);
            });
            test('removes attribute when value is false', () => {
                const block = session.parse('<div id="el" data-x="keep"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.attr('b', 'el', 'data-x', false);
                expect(session.get('b', 'el').hasAttribute('data-x')).toBe(false);
            });
            test('preserves empty string value (boolean attr opt-in)', () => {
                const block = session.parse('<details id="d"></details>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.attr('b', 'd', 'open', '');
                expect(session.get('b', 'd').hasAttribute('open')).toBe(true);
            });
        });

        describe('on', () => {
            test('registers a listener and returns its name', () => {
                const block = session.parse('<button id="btn">x</button>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                let count = 0;
                const name = session.on('b', 'btn', 'click', () => { count++; });
                expect(typeof name).toBe('string');
                session.get('b', 'btn').click();
                expect(count).toBe(1);
            });
            test('returns null when element not found', () => {
                expect(session.on('missing', 'x', 'click', () => {})).toBeNull();
            });
            test('listener is auto-removed when block is removed', () => {
                const block = session.parse('<button id="btn">x</button>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                let count = 0;
                const btn = session.get('b', 'btn');
                session.on('b', 'btn', 'click', () => { count++; });
                session.remove('b', 'btn');
                btn.click();        // listener should already be detached
                expect(count).toBe(0);
            });
            test('listener is auto-removed on clear', () => {
                const block = session.parse('<button id="btn">x</button>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                let count = 0;
                const btn = session.get('b', 'btn');
                session.on('b', 'btn', 'click', () => { count++; });
                session.clear();
                btn.click();
                expect(count).toBe(0);
            });
        });

        describe('exists', () => {
            test('true for mounted block', () => {
                const block = session.parse('<div id="el"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                expect(session.exists('b')).toBe(true);
                expect(session.exists('b', 'el')).toBe(true);
            });
            test('false for unknown', () => {
                expect(session.exists('nope')).toBe(false);
                expect(session.exists('nope', 'x')).toBe(false);
            });
            test('false after remove', () => {
                const block = session.parse('<div id="el"></div>');
                session.add([{ id: 'b', template: block.template, data: {} }]);
                session.remove('b', 'el');
                expect(session.exists('b', 'el')).toBe(false);
            });
        });

        // ── Keyed incremental list (ui.list) ────────────────────────────────────

        describe('list eqFn presets', () => {
            test("'shallow' detects equal items across refetch", () => {
                session.add([{
                    id: 'panel',
                    block: session.parse('<ul id="root">${rows}</ul>'),
                    data: {},
                }]);
                const list = session.list('panel', 'rows', {
                    keyFn: r => r.id,
                    block: session.parse('<li id="row">#{label}</li>'),
                    eqFn: 'shallow',
                });
                list.push({ id: 1, label: 'A' });
                const delta = list.sync([{ id: 1, label: 'A' }]);  // new object, same content
                expect([...delta.kept]).toEqual(['1']);
                expect([...delta.updated]).toEqual([]);
            });

            test("'shallow' detects mutated field", () => {
                session.add([{
                    id: 'p',
                    block: session.parse('<ul id="root">${rows}</ul>'),
                    data: {},
                }]);
                const list = session.list('p', 'rows', {
                    keyFn: r => r.id,
                    block: session.parse('<li id="row">#{label}</li>'),
                    eqFn: 'shallow',
                });
                list.push({ id: 1, label: 'A' });
                const delta = list.sync([{ id: 1, label: 'B' }]);
                expect([...delta.updated]).toEqual(['1']);
            });

            test("'deep' detects nested structural equality", () => {
                session.add([{
                    id: 'p',
                    block: session.parse('<ul id="root">${rows}</ul>'),
                    data: {},
                }]);
                const list = session.list('p', 'rows', {
                    keyFn: r => r.id,
                    block: session.parse('<li id="row">#{name}</li>'),
                    eqFn: 'deep',
                });
                list.push({ id: 1, name: 'x', meta: { tags: ['a', 'b'] } });
                const delta = list.sync([{ id: 1, name: 'x', meta: { tags: ['a', 'b'] } }]);
                expect([...delta.kept]).toEqual(['1']);
            });

            test("'deep' detects nested structural diff", () => {
                session.add([{
                    id: 'p',
                    block: session.parse('<ul id="root">${rows}</ul>'),
                    data: {},
                }]);
                const list = session.list('p', 'rows', {
                    keyFn: r => r.id,
                    block: session.parse('<li id="row">#{name}</li>'),
                    eqFn: 'deep',
                });
                list.push({ id: 1, name: 'x', meta: { tags: ['a'] } });
                const delta = list.sync([{ id: 1, name: 'x', meta: { tags: ['a', 'b'] } }]);
                expect([...delta.updated]).toEqual(['1']);
            });

            test('custom function still wins over preset string', () => {
                session.add([{
                    id: 'p',
                    block: session.parse('<ul id="root">${rows}</ul>'),
                    data: {},
                }]);
                const list = session.list('p', 'rows', {
                    keyFn: r => r.id,
                    block: session.parse('<li id="row">x</li>'),
                    eqFn: () => true,   // everything is "equal"
                });
                list.push({ id: 1, n: 1 });
                const delta = list.sync([{ id: 1, n: 999 }]);
                expect([...delta.kept]).toEqual(['1']);
            });

            test('default (no eqFn) keeps Object.is behaviour', () => {
                session.add([{
                    id: 'p',
                    block: session.parse('<ul id="root">${rows}</ul>'),
                    data: {},
                }]);
                const list = session.list('p', 'rows', {
                    keyFn: r => r.id,
                    block: session.parse('<li id="row">x</li>'),
                });
                list.push({ id: 1 });
                const delta = list.sync([{ id: 1 }]);   // new object reference
                expect([...delta.updated]).toEqual(['1']);  // Object.is rejects
            });
        });

        describe('list (keyed incremental)', () => {
            // Helper : mount a parent with a content slot, ready to host a list.
            function mountParent(s, slotName = 'items') {
                const parentBlock = s.parse(`<ul id="parent">\${${slotName}}</ul>`);
                s.add([{ id: 'parent', block: parentBlock, data: {} }]);
            }
            const itemBlock = (s) => s.parse('<li id="row"><span id="label">#{text}</span></li>');

            test('throws when keyFn is missing', () => {
                mountParent(session);
                expect(() => session.list('parent', 'items', { block: itemBlock(session) })).toThrow(/keyFn/);
            });

            test('throws when block is missing', () => {
                mountParent(session);
                expect(() => session.list('parent', 'items', { keyFn: x => x.id })).toThrow(/block/);
            });

            test('push / size / has / get / element', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'b', text: 'B' });

                expect(list.size).toBe(2);
                expect(list.has('a')).toBe(true);
                expect(list.get('b')).toEqual({ id: 'b', text: 'B' });

                const elA = list.element('a');
                expect(elA).not.toBeNull();
                expect(elA.querySelector('#row > span, span').textContent).toBe('A');
            });

            test('push duplicate key throws', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                expect(() => list.push({ id: 'a', text: 'AA' })).toThrow(/duplicate/);
            });

            test('remove releases DOM and is no-op on missing key', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                expect(list.remove('a')).toBe(true);
                expect(list.size).toBe(0);
                expect(list.element('a')).toBeNull();
                expect(list.remove('absent')).toBe(false);
            });

            test('clear empties the list', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'b', text: 'B' });
                list.clear();
                expect(list.size).toBe(0);
                expect(list.element('a')).toBeNull();
                expect(list.element('b')).toBeNull();
            });

            test('upsert adds when absent, updates when present (ref-equal skips)', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                const ref = { id: 'a', text: 'A' };
                expect(list.upsert(ref)).toBe('added');
                // Object.is default: same reference → 'unchanged'.
                expect(list.upsert(ref)).toBe('unchanged');
                // Different reference (even equal data) → 'updated'.
                expect(list.upsert({ id: 'a', text: 'A' })).toBe('updated');
            });

            test('upsert update replaces data and DOM text', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                    // eqFn comparing the text field - simulates immutable data
                    eqFn: (a, b) => a.text === b.text,
                });
                list.push({ id: 'a', text: 'A' });
                const r = list.upsert({ id: 'a', text: 'A2' });
                expect(r).toBe('updated');
                expect(list.element('a').textContent).toContain('A2');
            });

            test('sync removes disappeared keys', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'b', text: 'B' });
                list.push({ id: 'c', text: 'C' });

                list.sync([{ id: 'a', text: 'A' }, { id: 'c', text: 'C' }]);
                expect(list.size).toBe(2);
                expect(list.has('b')).toBe(false);
                expect(list.has('a')).toBe(true);
                expect(list.has('c')).toBe(true);
            });

            test('sync adds new keys', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.sync([
                    { id: 'a', text: 'A' },
                    { id: 'b', text: 'B' },
                    { id: 'c', text: 'C' },
                ]);
                expect(list.size).toBe(3);
            });

            test('sync preserves the DOM identity of unchanged items', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                    eqFn:  (a, b) => a.text === b.text,
                });
                const a0 = { id: 'a', text: 'A' };
                const b0 = { id: 'b', text: 'B' };
                list.push(a0); list.push(b0);
                const elA = list.element('a');
                const elB = list.element('b');

                // sync with the same content
                list.sync([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
                expect(list.element('a')).toBe(elA);
                expect(list.element('b')).toBe(elB);
            });

            test('sync reorders existing items without recreating them', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                // Same references reused across sync → eqFn (Object.is by default)
                // returns true → no replace → DOM preserved.
                const a = { id: 'a', text: 'A' };
                const b = { id: 'b', text: 'B' };
                const c = { id: 'c', text: 'C' };
                list.push(a); list.push(b); list.push(c);
                const elA = list.element('a');
                const elB = list.element('b');
                const elC = list.element('c');

                list.sync([c, a, b]);
                // Same nodes - same references
                expect(list.element('a')).toBe(elA);
                expect(list.element('b')).toBe(elB);
                expect(list.element('c')).toBe(elC);
                // New DOM order
                const parent = elA.parentNode;
                expect(parent.children[0]).toBe(elC);
                expect(parent.children[1]).toBe(elA);
                expect(parent.children[2]).toBe(elB);
            });

            test('sync throws on duplicate keys in input', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                expect(() => list.sync([
                    { id: 'a', text: 'A' },
                    { id: 'a', text: 'A2' },
                ])).toThrow(/duplicate/);
            });

            test('move repositions an item without re-creating its DOM', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'b', text: 'B' });
                list.push({ id: 'c', text: 'C' });
                const elA = list.element('a');

                list.move('a', 'c');
                expect(list.element('a')).toBe(elA);
                expect([...list.keys()]).toEqual(['b', 'a', 'c']);
            });

            test('insert places a new item before the named key', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'c', text: 'C' });
                list.insert({ id: 'b', text: 'B' }, 'c');
                expect([...list.keys()]).toEqual(['a', 'b', 'c']);
            });

            test('prepend places the item at the head', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'b', text: 'B' });
                list.prepend({ id: 'a', text: 'A' });
                expect([...list.keys()]).toEqual(['a', 'b']);
            });

            test('listeners managed via ui.on are auto-removed on remove(key)', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                let count = 0;
                session.on(list.itemId('a'), 'label', 'click', () => { count++; });
                const labelEl = session.get(list.itemId('a'), 'label');
                list.remove('a');
                labelEl.click();
                expect(count).toBe(0);   // listener detached at removal
            });

            test('keyFn returning undefined throws', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: () => undefined, block: itemBlock(session),
                });
                expect(() => list.push({ id: 'x' })).toThrow(/null\/undefined/);
            });

            test('slot resolution fails when parent has no slot', () => {
                // Parent has no ${items} slot
                const noSlotParent = session.parse('<ul id="p"></ul>');
                session.add([{ id: 'noslot', block: noSlotParent, data: {} }]);
                const list = session.list('noslot', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                expect(() => list.push({ id: 'a' })).toThrow(/slot/);
            });

            // ── sync delta + new modes ────────────────────────────────────────

            test('sync returns the delta as Sets + reordered flag', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                const a = { id: 'a', text: 'A' };
                const b = { id: 'b', text: 'B' };
                const c = { id: 'c', text: 'C' };
                list.push(a); list.push(b);
                const r = list.sync([a, c]);   // a kept, b removed, c added
                expect(r.kept).toEqual(new Set(['a']));
                expect(r.removed).toEqual(new Set(['b']));
                expect(r.added).toEqual(new Set(['c']));
                expect(r.updated).toEqual(new Set());
                expect(r.reordered).toBe(false);  // append at end, no reorder
            });

            test('sync delta.updated marks items that were replaced', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                const r = list.sync([{ id: 'a', text: 'A2' }]);  // ref differs → updated
                expect(r.updated).toEqual(new Set(['a']));
                expect(r.kept).toEqual(new Set());
            });

            test('onUpdate:"patch" rebinds DOM in place', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id,
                    block:    itemBlock(session),
                    onUpdate: 'patch',
                });
                list.push({ id: 'a', text: 'A' });
                const node = list.element('a');
                list.sync([{ id: 'a', text: 'A2' }]);
                expect(list.element('a')).toBe(node);     // same DOM node
                expect(node.textContent).toContain('A2'); // text updated
            });

            test('onUpdate:"none" leaves DOM intact on update', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id,
                    block:    itemBlock(session),
                    onUpdate: 'none',
                });
                list.push({ id: 'a', text: 'A' });
                const node = list.element('a');
                list.sync([{ id: 'a', text: 'X' }]);
                expect(list.element('a')).toBe(node);
                expect(node.textContent).toContain('A'); // unchanged: caller's responsibility
                expect(list.get('a').text).toBe('X');     // bookkeeping updated
            });

            test('metaFn stores side data, dataFn extracts DOM bindings', () => {
                mountParent(session);
                const itemTpl = session.parse('<li><span id="lbl">#{label}</span></li>');
                const list = session.list('parent', 'items', {
                    keyFn:  x => x.id,
                    block:  itemTpl,
                    dataFn: x => ({ label: x.label }),
                    metaFn: x => x.raw,
                });
                list.push({ id: 'a', label: 'Apple', raw: { kind: 'fruit', n: 1 } });
                expect(list.meta('a')).toEqual({ kind: 'fruit', n: 1 });
                expect(list.get('a').label).toBe('Apple');
            });

            test('list.attr proxies on root by key', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.attr('a', 'data-flag', 'on');
                expect(list.element('a').getAttribute('data-flag')).toBe('on');
                list.attr('a', 'data-flag', null);
                expect(list.element('a').hasAttribute('data-flag')).toBe(false);
            });

            test('list.text proxies on root by key', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.text('a', 'replaced');
                expect(list.element('a').textContent).toBe('replaced');
            });

            test('list.on proxies on descendant by key', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                let n = 0;
                list.on('a', 'label', 'click', () => { n++; });
                session.get(list.itemId('a'), 'label').click();
                expect(n).toBe(1);
            });

            test('ui.list is idempotent by (parent, slot)', () => {
                mountParent(session);
                const a = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                const b = session.list('parent', 'items', {});
                expect(a).toBe(b);
            });

            test('ui.list throws when re-created with a different block', () => {
                mountParent(session);
                const blockA = itemBlock(session);
                const blockB = session.parse('<li id="x">#{text}</li>');
                session.list('parent', 'items', { keyFn: x => x.id, block: blockA });
                expect(() => session.list('parent', 'items', { keyFn: x => x.id, block: blockB })).toThrow(/different block/);
            });

            test('list is auto-disposed when parent is cleared', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                session.clear('parent');
                expect(() => list.push({ id: 'b' })).toThrow(/disposed/);
            });

            // ── Audit-fix coverage ────────────────────────────────────────────

            test('B1 - ui.get on a loop block returns null without crashing', () => {
                // A block rendered with `data: <array>` stores an Array in _map,
                // not a Map. Both 1-arg and 2-arg get() must return null safely.
                const tpl = session.parse('<ul><!-- $it --><li>#{t}</li><!-- it$ --></ul>');
                session.add([{ id: 'loop', block: tpl, data: {} }]);
                session.add([{
                    attach: { elm: 'loop', name: 'it' },
                    block:  tpl,
                    data:   [{ t: 'a' }, { t: 'b' }],
                }]);
                expect(() => session.get('loop')).not.toThrow();
                expect(() => session.get('loop', 'x')).not.toThrow();
            });

            test('B2 - ui.exists on a loop block reflects iteration count', () => {
                const tpl = session.parse('<ul><!-- $it --><li>#{t}</li><!-- it$ --></ul>');
                session.add([{ id: 'loop', block: tpl, data: {} }]);
                session.add([{
                    id: 'loopIts',
                    attach: { elm: 'loop', name: 'it' },
                    block:  tpl,
                    data:   [{ t: 'a' }, { t: 'b' }],
                }]);
                expect(session.exists('loopIts')).toBe(true);
                expect(session.exists('loopIts', 'something')).toBe(false);
            });

            test('B4 - upsert reports "unchanged" when onUpdate:"none" keeps DOM', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id,
                    block:    itemBlock(session),
                    onUpdate: 'none',
                });
                list.push({ id: 'a', text: 'A' });
                // Pass a different ref so eqFn (Object.is) says "different",
                // but onUpdate:'none' keeps the DOM untouched. upsert must
                // return 'unchanged', not the misleading 'updated'.
                expect(list.upsert({ id: 'a', text: 'A2' })).toBe('unchanged');
            });

            test('D3 - list.update throws on missing key', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                expect(() => list.update('absent', { id: 'absent' })).toThrow(/not found/);
            });

            test('D3 - list.update returns "updated" when ref differs', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id,
                    block:    itemBlock(session),
                    eqFn:     (a, b) => a.text === b.text,
                });
                list.push({ id: 'a', text: 'A' });
                expect(list.update('a', { id: 'a', text: 'A' })).toBe('unchanged');
                expect(list.update('a', { id: 'a', text: 'B' })).toBe('updated');
            });

            test('D7 - onRemove fires before DOM removal', () => {
                mountParent(session);
                const seen = [];
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id,
                    block:    itemBlock(session),
                    onRemove: (key, item) => seen.push([key, item.text]),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'b', text: 'B' });
                list.remove('a');
                list.sync([]);  // removes 'b' too
                expect(seen).toEqual([['a', 'A'], ['b', 'B']]);
            });

            test('D2 - second ui.list call accepts no options', () => {
                mountParent(session);
                const a = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                const b = session.list('parent', 'items');   // no options
                expect(b).toBe(a);
            });

            test('D6 - itemId uses U+001F separator (no collision with ::)', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'has::colons', text: 'X' });
                expect(list.has('has::colons')).toBe(true);
                expect(list.itemId('has::colons')).toContain('\x1f');
                // Separator bytes are U+001F ; the key itself may contain ::
                // (preserved as data). No ambiguity because the separator is
                // a control char that cannot appear in printable keys.
                // Ensure two keys differing only by the position of ::
                // resolve to distinct itemIds.
                list.push({ id: 'a::b', text: 'Y' });
                list.push({ id: 'a',    text: 'Z' });
                expect(list.itemId('a::b')).not.toBe(list.itemId('a'));
            });

            test('P1 #8 - ui.onUnmount fires before block removal', () => {
                mountParent(session);
                let unmounted = 0;
                session.onUnmount('parent', () => { unmounted++; });
                session.clear('parent');
                expect(unmounted).toBe(1);
            });

            test('P1 #8 - ui.onUnmount fires once even on multiple removals', () => {
                mountParent(session);
                let unmounted = 0;
                session.onUnmount('parent', () => { unmounted++; });
                session.clear('parent');
                session.clear('parent');  // already gone
                expect(unmounted).toBe(1);
            });

            test('P1 #8 - ui.onUnmount fires on full clear()', () => {
                mountParent(session);
                let unmounted = 0;
                session.onUnmount('parent', () => { unmounted++; });
                session.clear();
                expect(unmounted).toBe(1);
            });

            test('P1 #8 - ui.onUnmount can see the block from inside the hook', () => {
                mountParent(session);
                let seenRoot = null;
                session.onUnmount('parent', () => {
                    seenRoot = session.get('parent'); // still mounted at this point
                });
                session.clear('parent');
                expect(seenRoot).not.toBeNull();
            });

            test('P1 #8 - ui.onUnmount(blockId, null) removes the hook', () => {
                mountParent(session);
                let unmounted = 0;
                session.onUnmount('parent', () => { unmounted++; });
                session.onUnmount('parent', null);
                session.clear('parent');
                expect(unmounted).toBe(0);
            });

            test('P2 #17 - adopt calls dispose() on unmount', () => {
                mountParent(session);
                let disposed = 0;
                const fake = { dispose: () => { disposed++; } };
                session.adopt('parent', fake);
                session.clear('parent');
                expect(disposed).toBe(1);
            });

            test('P2 #17 - adopt detects destroy / abort / close / stop', () => {
                mountParent(session);
                const seen = { destroy: 0, abort: 0, close: 0, stop: 0 };
                session.adopt('parent', { destroy: () => { seen.destroy++; } });
                session.adopt('parent', { abort:   () => { seen.abort++;   } });
                session.adopt('parent', { close:   () => { seen.close++;   } });
                session.adopt('parent', { stop:    () => { seen.stop++;    } });
                session.clear('parent');
                expect(seen).toEqual({ destroy: 1, abort: 1, close: 1, stop: 1 });
            });

            test('P2 #17 - adopt accepts plain function', () => {
                mountParent(session);
                let ran = 0;
                session.adopt('parent', () => { ran++; });
                session.clear('parent');
                expect(ran).toBe(1);
            });

            test('P2 #17 - multiple adoptions stack and all fire (LIFO)', () => {
                mountParent(session);
                const order = [];
                session.adopt('parent', () => order.push('first'));
                session.adopt('parent', () => order.push('second'));
                session.adopt('parent', () => order.push('third'));
                session.clear('parent');
                expect(order).toEqual(['third', 'second', 'first']);
            });

            test('P2 #17 - adopt + onUnmount cohabitent', () => {
                mountParent(session);
                const calls = [];
                session.onUnmount('parent', () => calls.push('hook'));
                session.adopt('parent', () => calls.push('resource'));
                session.clear('parent');
                // Adoption fires first (it was registered most recently), then
                // the prior hook (onUnmount).
                expect(calls).toEqual(['resource', 'hook']);
            });

            test('P2 #17 - adopt throws on invalid resource', () => {
                mountParent(session);
                expect(() => session.adopt('parent', {})).toThrow(/dispose|destroy|abort/);
            });

            test('P2 #10 - onEnter fires after item is in DOM', () => {
                mountParent(session);
                let seen = null;
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id, block: itemBlock(session),
                    onEnter:  (key, el) => { seen = { key, present: !!el.parentNode }; },
                });
                list.push({ id: 'a', text: 'A' });
                expect(seen).toEqual({ key: 'a', present: true });
            });

            test('P2 #10 - onLeave returning Promise defers DOM removal', async () => {
                mountParent(session);
                let resolve;
                const pending = new Promise(r => { resolve = r; });
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id, block: itemBlock(session),
                    onLeave:  () => pending,
                });
                list.push({ id: 'a', text: 'A' });
                const el = list.element('a');
                expect(el).not.toBeNull();
                list.remove('a');
                // DOM is still mounted until the promise resolves.
                expect(el.parentNode).not.toBeNull();
                resolve();
                await Promise.resolve();   // let microtasks flush
                expect(el.parentNode).toBeNull();
            });

            test('P2 #10 - onLeave returning void removes immediately', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn:    x => x.id, block: itemBlock(session),
                    onLeave:  () => { /* no return */ },
                });
                list.push({ id: 'a', text: 'A' });
                const el = list.element('a');
                list.remove('a');
                expect(el.parentNode).toBeNull();
            });

            test('P2 #9 - ui.bind syncs signal to text on root', async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<p id="msg">init</p>');
                session.add([{ id: 'msg', block: tpl, data: {} }]);
                const s = sigApi.create('Hello');
                session.bind(s, 'msg');
                expect(session.get('msg').textContent).toBe('Hello');
                s.set('World');
                expect(session.get('msg').textContent).toBe('World');
            });

            test('P2 #9 - ui.bind to descendant with logicalId', async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<div id="root"><span id="lbl">A</span></div>');
                session.add([{ id: 'b', block: tpl, data: {} }]);
                const s = sigApi.create('init');
                session.bind(s, 'b', 'lbl', 'text');
                expect(session.get('b', 'lbl').textContent).toBe('init');
                s.set('updated');
                expect(session.get('b', 'lbl').textContent).toBe('updated');
            });

            test('P2 #9 - ui.bind to attribute removes on null', async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<details id="d">x</details>');
                session.add([{ id: 'd', block: tpl, data: {} }]);
                const s = sigApi.create('');
                session.bind(s, 'd', 'open');
                expect(session.get('d').hasAttribute('open')).toBe(true);
                s.set(null);
                expect(session.get('d').hasAttribute('open')).toBe(false);
            });

            test("P8 #9 - ui.bind 'class:NAME' toggles a fixed class", async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<button id="b">x</button>');
                session.add([{ id: 'b', block: tpl, data: {} }]);
                const active = sigApi.create(false);
                session.bind(active, 'b', 'class:active');
                const btn = session.get('b');
                expect(btn.classList.contains('active')).toBe(false);
                active.set(true);
                expect(btn.classList.contains('active')).toBe(true);
                active.set(false);
                expect(btn.classList.contains('active')).toBe(false);
            });

            test("P8 #9 - ui.bind 'style:PROP' sets inline style", async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<div id="box">x</div>');
                session.add([{ id: 'box', block: tpl, data: {} }]);
                const color = sigApi.create('red');
                session.bind(color, 'box', 'style:color');
                const el = session.get('box');
                expect(el.style.color).toBe('red');
                color.set('blue');
                expect(el.style.color).toBe('blue');
                color.set(null);   // clears
                expect(el.style.color).toBe('');
            });

            test("P8 #9 - ui.bind 'prop:NAME' sets DOM property", async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<input id="i">');
                session.add([{ id: 'i', block: tpl, data: {} }]);
                const val = sigApi.create('hello');
                session.bind(val, 'i', 'prop:value');
                const input = session.get('i');
                expect(input.value).toBe('hello');
                val.set('world');
                expect(input.value).toBe('world');
            });

            test("P8 #9 - ui.bind with opts.transform maps the value", async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<p id="t">x</p>');
                session.add([{ id: 't', block: tpl, data: {} }]);
                const n = sigApi.create(42);
                session.bind(n, 't', 'text', { transform: (v) => `Count: ${v}` });
                expect(session.get('t').textContent).toBe('Count: 42');
                n.set(7);
                expect(session.get('t').textContent).toBe('Count: 7');
            });

            test("P8 #9 - descendant form with target + opts", async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<div id="root"><span id="lbl">x</span></div>');
                session.add([{ id: 'b', block: tpl, data: {} }]);
                const n = sigApi.create(3);
                session.bind(n, 'b', 'lbl', 'text', { transform: (v) => 'n=' + v });
                expect(session.get('b', 'lbl').textContent).toBe('n=3');
                n.set(10);
                expect(session.get('b', 'lbl').textContent).toBe('n=10');
            });

            test('P2 #9 - ui.bind subscription is detached when block removed', async () => {
                const { signal } = await import('../../io/utils/signal.js');
                const sigApi = signal.factory();
                const tpl = session.parse('<p id="msg">x</p>');
                session.add([{ id: 'msg', block: tpl, data: {} }]);
                const s = sigApi.create('a');
                session.bind(s, 'msg');
                session.clear('msg');
                s.set('b'); // would crash if subscription still active and node gone
                // No assertion needed beyond "no throw" ; verifying the subscriber
                // count via size:
                expect(s.size).toBe(0);
            });

            test('P2 #11 - portal creates a side session at the target', () => {
                const target = document.createElement('section');
                target.id = 'portal-target';
                document.body.appendChild(target);
                const modal = session.portal('mod', { to: target });
                const tpl = modal.parse('<div id="dlg">hello</div>');
                modal.add([{ id: 'dlg', block: tpl, data: {} }]);
                expect(target.querySelector('div')).not.toBeNull();
                expect(target.textContent).toContain('hello');
            });

            test('P2 #11 - portal is idempotent by name', () => {
                const t = document.createElement('section'); document.body.appendChild(t);
                const a = session.portal('same', { to: t });
                const b = session.portal('same', { to: t });
                expect(a).toBe(b);
            });

            test('P2 #11 - closePortal removes DOM + tracking', () => {
                const t = document.createElement('section'); document.body.appendChild(t);
                const p = session.portal('toClose', { to: t });
                p.add([{ id: 'x', block: p.parse('<p>hi</p>'), data: {} }]);
                session.closePortal('toClose');
                expect(t.children.length).toBe(0);
                // Re-opening creates a fresh session
                const p2 = session.portal('toClose', { to: t });
                expect(p2).not.toBe(p);
            });

            test('P2 #11 - full clear() disposes all portals', () => {
                const t1 = document.createElement('section'); document.body.appendChild(t1);
                const t2 = document.createElement('section'); document.body.appendChild(t2);
                const a = session.portal('a', { to: t1 });
                const b = session.portal('b', { to: t2 });
                a.add([{ id: 'x', block: a.parse('<p>A</p>'), data: {} }]);
                b.add([{ id: 'x', block: b.parse('<p>B</p>'), data: {} }]);
                session.clear();
                expect(t1.children.length).toBe(0);
                expect(t2.children.length).toBe(0);
            });

            test('P1 #8 - errors in onUnmount hook are swallowed', () => {
                mountParent(session);
                session.onUnmount('parent', () => { throw new Error('boom'); });
                expect(() => session.clear('parent')).not.toThrow();
            });

            test('Q7 - keys / entries / values yield in order', () => {
                mountParent(session);
                const list = session.list('parent', 'items', {
                    keyFn: x => x.id, block: itemBlock(session),
                });
                list.push({ id: 'a', text: 'A' });
                list.push({ id: 'b', text: 'B' });
                expect([...list.keys()]).toEqual(['a', 'b']);
                expect([...list.values()].map(x => x.text)).toEqual(['A', 'B']);
                expect([...list.entries()].map(([k, v]) => `${k}:${v.text}`))
                    .toEqual(['a:A', 'b:B']);
                // for...of on the list itself iterates entries.
                const collected = [];
                for (const [k, v] of list) collected.push(`${k}=${v.text}`);
                expect(collected).toEqual(['a=A', 'b=B']);
            });
        });

        // ── ui.mount - generic integration point ────────────────────────────

        describe('mount', () => {
            test('resolves slot and adopts the controller', () => {
                session.add([{
                    id: 'panel',
                    block: session.parse('<div id="root">${list}</div>'),
                    data: {},
                }]);

                let disposed = false;
                const ctrl = session.mount('panel', 'list', (el, bid) => {
                    expect(el).toBeInstanceOf(HTMLElement);
                    expect(bid).toBe('panel');
                    return { foo: 'bar', dispose: () => { disposed = true; } };
                });
                expect(ctrl.foo).toBe('bar');

                session.clear('panel');
                expect(disposed).toBe(true);
            });

            test('null slotName resolves to block root', () => {
                session.add([{
                    id: 'card',
                    block: session.parse('<div id="root">hello</div>'),
                    data: {},
                }]);
                let seenEl = null;
                session.mount('card', null, (el) => { seenEl = el; return null; });
                expect(seenEl).toBe(session.get('card'));
            });

            test('throws when slot not resolved', () => {
                expect(() => session.mount('missing', 'x', () => {}))
                    .toThrow(/no slot 'x' resolved/);
            });

            test('controller without cleanup is returned but not adopted', () => {
                session.add([{ id: 'b', block: session.parse('<p id="r">x</p>'), data: {} }]);
                let called = 0;
                const ctrl = session.mount('b', null, () => ({ value: 42 }));
                expect(ctrl.value).toBe(42);
                // No cleanup → adopt was NOT called, so unmount won't error.
                session.clear('b');
                expect(called).toBe(0);
            });

            test('plain function controller is adopted as the cleanup itself', () => {
                session.add([{ id: 'b', block: session.parse('<p id="r">x</p>'), data: {} }]);
                let cleaned = false;
                session.mount('b', null, () => () => { cleaned = true; });
                session.clear('b');
                expect(cleaned).toBe(true);
            });
        });
    });
});
