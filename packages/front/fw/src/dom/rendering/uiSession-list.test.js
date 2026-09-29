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

// ── Test helpers ────────────────────────────────────────────────────────────
// Focused coverage for `uiSessionList`'s module surface and the replace/reorder
// contract (BL-391). Broader `list()` behaviour (push/upsert/adopt/hooks/eqFn
// presets/...) is already covered in the sibling `uiSession.test.js`.

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

describe('uiSessionList module', () => {

    test('has correct module metadata', () => {
        expect(uiSessionList.name).toBe('uiSessionList');
        expect(uiSessionList.dependencies).toEqual(['template', 'render', 'dom']);
        expect(typeof uiSessionList.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns the UIList class and the list() methods mixin', () => {
            const sp = secPolicy.factory();
            const inst = uiSessionList.factory(
                template.factory(sp), render.factory(sp), dom.factory(sp),
            );
            expect(typeof inst.UIList).toBe('function');
            expect(typeof inst.methods.list).toBe('function');
        });
    });

    describe('replace/reorder contract (BL-391)', () => {
        let session, container;

        function mountParent(s, slotName = 'items') {
            const parentBlock = s.parse(`<ul id="parent">\${${slotName}}</ul>`);
            s.add([{ id: 'parent', block: parentBlock, data: {} }]);
        }
        const itemBlock = (s) => s.parse('<li id="row"><span id="label">#{text}</span></li>');
        const domOrderOf = (list) => {
            const parentEl = list.element('a').parentNode;
            return [...parentEl.children].map(el => el.querySelector('span').textContent);
        };

        beforeEach(() => {
            container = document.createElement('div');
            document.body.appendChild(container);
            session = makeSession('bl391-ctx', container);
        });

        // RED test (b): before the fix, a mid-sequence data-changed sync()
        // routes the changed key through _replaceItem → _removeItem +
        // _addItem(key, item, false), which appends the fresh row at the
        // slot's end - phase 3 only compares key sequences, and the key
        // sequence here is unchanged, so `needsReorder` stayed false and the
        // replaced row was stranded last instead of staying at index 1.
        test('a data-changed sync() keeps DOM order equal to keys()', () => {
            mountParent(session);
            const list = session.list('parent', 'items', {
                keyFn: x => x.id, block: itemBlock(session),
            });
            // Keep `a`/`c` reference-identical across the sync (default eqFn
            // is Object.is) so ONLY `b` is replaced - a fresh object literal
            // for every key would replace all three in iteration order and
            // incidentally mask the bug (each landing back at the "end" in
            // the same order it was processed).
            const aItem = { id: 'a', text: 'A' };
            const bItem = { id: 'b', text: 'B' };
            const cItem = { id: 'c', text: 'C' };
            list.push(aItem);
            list.push(bItem);
            list.push(cItem);

            list.sync([aItem, { id: 'b', text: 'B2' }, cItem]);

            expect(domOrderOf(list)).toEqual(['A', 'B2', 'C']);
            expect([...list.keys()]).toEqual(['a', 'b', 'c']);
        });

        test('sync() delta.reordered is true when a mid-sequence replace forces reordering', () => {
            mountParent(session);
            const list = session.list('parent', 'items', {
                keyFn: x => x.id, block: itemBlock(session),
            });
            const aItem = { id: 'a', text: 'A' };
            const bItem = { id: 'b', text: 'B' };
            const cItem = { id: 'c', text: 'C' };
            list.push(aItem);
            list.push(bItem);
            list.push(cItem);

            const delta = list.sync([aItem, { id: 'b', text: 'B2' }, cItem]);

            expect(delta.reordered).toBe(true);
            expect([...delta.updated]).toEqual(['b']);
        });

        // Pin: the same 'replaced lands at the end' defect exists in upsert()
        // and update() (they call the same _replaceItem, but never called
        // _reorderDom at all) - both must restore the row's position too.
        test('pin: replace-then-order also holds for upsert()', () => {
            mountParent(session);
            const list = session.list('parent', 'items', {
                keyFn: x => x.id, block: itemBlock(session),
            });
            list.push({ id: 'a', text: 'A' });
            list.push({ id: 'b', text: 'B' });
            list.push({ id: 'c', text: 'C' });

            expect(list.upsert({ id: 'b', text: 'B2' })).toBe('updated');

            expect(domOrderOf(list)).toEqual(['A', 'B2', 'C']);
        });

        test('pin: replace-then-order also holds for update()', () => {
            mountParent(session);
            const list = session.list('parent', 'items', {
                keyFn: x => x.id, block: itemBlock(session),
            });
            list.push({ id: 'a', text: 'A' });
            list.push({ id: 'b', text: 'B' });
            list.push({ id: 'c', text: 'C' });

            expect(list.update('b', { id: 'b', text: 'B2' })).toBe('updated');

            expect(domOrderOf(list)).toEqual(['A', 'B2', 'C']);
        });

        // Pin: 'patch' mode never moves the node (in-place attr/text rebind),
        // so it must NOT force a reorder pass - only 'replace' does.
        test('pin: onUpdate "patch" does not trigger a spurious reorder', () => {
            mountParent(session);
            const list = session.list('parent', 'items', {
                keyFn: x => x.id, block: itemBlock(session),
                onUpdate: 'patch',
            });
            const aItem = { id: 'a', text: 'A' };
            const bItem = { id: 'b', text: 'B' };
            const cItem = { id: 'c', text: 'C' };
            list.push(aItem);
            list.push(bItem);
            list.push(cItem);
            const elB = list.element('b');

            const delta = list.sync([aItem, { id: 'b', text: 'B2' }, cItem]);

            expect(delta.reordered).toBe(false);
            expect(list.element('b')).toBe(elB);   // same node, patched in place
            expect(domOrderOf(list)).toEqual(['A', 'B2', 'C']);
        });
    });
});
