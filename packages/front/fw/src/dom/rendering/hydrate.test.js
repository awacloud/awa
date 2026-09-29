// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Round-trip SSR → DOM mounted → uiSession.hydrate → mutations target
// existing nodes. Uses happy-dom (DOMParser available) to mount the
// SSR-generated HTML into the test document.
//
// The flow under test:
//   1. Render an HTML string via `render.toHTML(tpl, data, { idPrefix })`.
//   2. Mount that HTML into a container (innerHTML - sanity NOT loaded in tests).
//   3. Create a uiSession on that container ; call `ui.hydrate(items, …)`.
//   4. Assert that `ui.text/attr/on` operate on the EXISTING nodes (same
//      reference as before hydration), not on fresh clones.

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';
import { uiSession }       from './uiSession.js';
import { uiSessionCore }   from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList }   from './uiSession-list.js';
import { template }  from './template.js';
import { render }    from './render.js';
import { parser }    from './parser.js';
import { secPolicy } from './secPolicy.js';
import { dom }       from '../query/dom.js';
import { events }    from '../query/events.js';

function makeSession(containerName, containerEl) {
    const sp = secPolicy.factory();
    const tplInst = template.factory(sp);
    const rnd = render.factory(sp);
    const prs = parser.factory(sp);
    const dm  = dom.factory(sp);
    const ev  = events.factory();
    tplInst.init(containerName, { to: containerEl, main: true });
    return {
        ui: uiSession.factory(
            uiSessionCore.factory(tplInst, rnd, prs, dm, ev),
            uiSessionDirect.factory(dm, ev),
            uiSessionList.factory(tplInst, rnd, dm),
        )(containerName),
        renderApi: render.factory(sp),
        parserApi: parser.factory(sp),
        tplInst,
    };
}

describe('SSR round-trip + hydration', () => {

    let container;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('hydrates a simple block; existing nodes are reused', () => {
        // 1. SSR phase
        const ssrParser = parser.factory(secPolicy.factory());
        const ssrRender = render.factory(secPolicy.factory());
        const tpl = ssrParser.fromHTML('<article id="root"><h1 id="title">#{title}</h1></article>');
        const html = ssrRender.toHTML(tpl, { title: 'SSR Output' }, { idPrefix: 'app' });

        // 2. Mount as if delivered by the server
        container.innerHTML = html;
        const ssrArticle = container.querySelector('[data-fw-id="app:root"]');
        const ssrTitle   = container.querySelector('[data-fw-id="app:title"]');
        expect(ssrArticle).not.toBeNull();
        expect(ssrTitle).not.toBeNull();

        // 3. Client : create session + hydrate
        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML(
            '<article id="root"><h1 id="title">#{title}</h1></article>'
        );
        ui.hydrate([{ id: 'main', block: clientTpl, data: { title: 'SSR Output' } }],
                   { idPrefix: 'app' });

        // 4. ui.get returns the EXISTING DOM nodes (same reference).
        expect(ui.get('main')).toBe(ssrArticle);
        expect(ui.get('main', 'title')).toBe(ssrTitle);
    });

    test('ui.text after hydrate updates the existing node', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<p id="m">#{txt}</p>');
        const html = render.factory(secPolicy.factory()).toHTML(tpl, { txt: 'original' }, { idPrefix: 'k' });
        container.innerHTML = html;

        const node = container.querySelector('[data-fw-id="k:m"]');
        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<p id="m">#{txt}</p>');
        ui.hydrate([{ id: 'b', block: clientTpl, data: { txt: 'original' } }], { idPrefix: 'k' });

        ui.text('b', 'm', 'updated');
        expect(node.textContent).toBe('updated');
        // No new node was created - same reference.
        expect(ui.get('b', 'm')).toBe(node);
    });

    test('ui.attr after hydrate mutates the existing element', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<details id="d">x</details>');
        const html = render.factory(secPolicy.factory()).toHTML(tpl, {}, { idPrefix: 'k' });
        container.innerHTML = html;

        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<details id="d">x</details>');
        ui.hydrate([{ id: 'b', block: clientTpl, data: {} }], { idPrefix: 'k' });

        const node = ui.get('b', 'd');
        expect(node.hasAttribute('open')).toBe(false);
        ui.attr('b', 'd', 'open', '');
        expect(node.hasAttribute('open')).toBe(true);
        ui.attr('b', 'd', 'open', null);
        expect(node.hasAttribute('open')).toBe(false);
    });

    test('ui.on after hydrate attaches listener to existing node', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<button id="b">go</button>');
        const html = render.factory(secPolicy.factory()).toHTML(tpl, {}, { idPrefix: 'k' });
        container.innerHTML = html;

        const ssrButton = container.querySelector('[data-fw-id="k:b"]');
        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<button id="b">go</button>');
        ui.hydrate([{ id: 'btn', block: clientTpl, data: {} }], { idPrefix: 'k' });

        let n = 0;
        ui.on('btn', 'click', () => { n++; });
        ssrButton.click();
        expect(n).toBe(1);
    });

    test('hydrate is idempotent on the same nodes', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<p id="m">x</p>');
        container.innerHTML = render.factory(secPolicy.factory()).toHTML(tpl, {}, { idPrefix: 'k' });
        const node = container.querySelector('[data-fw-id="k:m"]');

        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<p id="m">x</p>');
        ui.hydrate([{ id: 'b', block: clientTpl, data: {} }], { idPrefix: 'k' });
        // Re-hydrate same - adoptNode is idempotent.
        ui.hydrate([{ id: 'b', block: clientTpl, data: {} }], { idPrefix: 'k' });
        expect(ui.get('b', 'm')).toBe(node);
    });

    test('hydrate throws on missing node with helpful message', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<p id="m">x</p>');
        container.innerHTML = '<div>not what we expected</div>';

        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<p id="m">x</p>');
        expect(() => ui.hydrate(
            [{ id: 'b', block: clientTpl, data: {} }],
            { idPrefix: 'k' },
        )).toThrow(/no DOM node found/);
    });

    test('hydrate + nested block via attach slot', () => {
        // SSR : layout with a slot, content block attached into it.
        const layoutTpl = parser.factory(secPolicy.factory()).fromHTML(
            '<div id="layout"><h1 id="title">#{title}</h1>${body}</div>'
        );
        // Render layout HTML with the slot filled by the body block's output.
        const bodyTpl = parser.factory(secPolicy.factory()).fromHTML('<p id="body">#{txt}</p>');
        const bodyHtml = render.factory(secPolicy.factory()).toHTML(bodyTpl, { txt: 'inside' }, { idPrefix: 'app' });
        const html = render.factory(secPolicy.factory()).toHTML(layoutTpl, { title: 'Page' },
            { idPrefix: 'app', slots: { body: bodyHtml } });
        container.innerHTML = html;

        // Client hydration : two items, second attaches into the first's slot.
        const { ui, parserApi } = makeSession('app', container);
        const cLayout = parserApi.fromHTML('<div id="layout"><h1 id="title">#{title}</h1>${body}</div>');
        const cBody   = parserApi.fromHTML('<p id="body">#{txt}</p>');
        ui.hydrate([
            { id: 'layout', block: cLayout, data: { title: 'Page' } },
            { id: 'body',   attach: { elm: 'layout', name: 'body' }, block: cBody, data: { txt: 'inside' } },
        ], { idPrefix: 'app' });

        expect(ui.get('layout', 'title').textContent).toBe('Page');
        expect(ui.get('body', 'body').textContent).toBe('inside');

        // ui.text on the inner body updates the existing node.
        ui.text('body', 'body', 'rewritten');
        expect(container.querySelector('[data-fw-id="app:body"]').textContent).toBe('rewritten');
    });

    test('hydrate without idPrefix works when SSR was rendered without prefix', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<h1 id="t">#{x}</h1>');
        const html = render.factory(secPolicy.factory()).toHTML(tpl, { x: 'A' });   // no idPrefix
        container.innerHTML = html;

        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<h1 id="t">#{x}</h1>');
        ui.hydrate([{ id: 'b', block: clientTpl, data: { x: 'A' } }]);

        ui.text('b', 't', 'B');
        expect(container.querySelector('[data-fw-id="t"]').textContent).toBe('B');
    });

    test('hydrate throws when container is not initialised', () => {
        const sp = secPolicy.factory();
        const tplInst = template.factory(sp);
        const rnd = render.factory(sp);
        const prs = parser.factory(sp);
        const dm  = dom.factory(sp);
        const ev  = events.factory();
        // No init('app', ...) - container is missing.
        const ui = uiSession.factory(
            uiSessionCore.factory(tplInst, rnd, prs, dm, ev),
            uiSessionDirect.factory(dm, ev),
            uiSessionList.factory(tplInst, rnd, dm),
        )('app');
        expect(() => ui.hydrate([])).toThrow(/container/);
    });

    test('hydrate then ui.remove(blockId) cleans the DOM', () => {
        const tpl = parser.factory(secPolicy.factory()).fromHTML('<div id="x">to remove</div>');
        container.innerHTML = render.factory(secPolicy.factory()).toHTML(tpl, {}, { idPrefix: 'k' });

        const { ui, parserApi } = makeSession('app', container);
        const clientTpl = parserApi.fromHTML('<div id="x">to remove</div>');
        ui.hydrate([{ id: 'b', block: clientTpl, data: {} }], { idPrefix: 'k' });

        expect(container.querySelector('[data-fw-id="k:x"]')).not.toBeNull();
        ui.clear('b');
        expect(container.querySelector('[data-fw-id="k:x"]')).toBeNull();
    });

    // ── list.adopt(items, { idPrefix }) ─────────────────────────────────────
    // Round-trip SSR with an iterate block. The server renders the rows,
    // the client adopts the parent + lets the list reuse the SSR rows
    // without rebuilding them. Verifies that DOM node identity is preserved
    // and that subsequent `sync()` reconciles correctly against the adopted
    // state.

    describe('list.adopt - SSR rows reuse', () => {

        function ssrPage(initialRows) {
            const ssrParser = parser.factory(secPolicy.factory());
            const ssrRender = render.factory(secPolicy.factory());
            const tpl = ssrParser.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            container.innerHTML = ssrRender.toHTML(tpl, {}, {
                iterates: { rows: initialRows },
                idPrefix: 'app',
            });
            return tpl;
        }

        test('adopts existing SSR rows ; ui.text mutates them in place', () => {
            const initial = [
                { id: 1, label: 'apple' },
                { id: 2, label: 'banana' },
                { id: 3, label: 'cherry' },
            ];
            ssrPage(initial);

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            ui.hydrate([{ id: 'panel', block: clientTpl, data: {} }], { idPrefix: 'app' });

            // Snapshot the SSR DOM nodes BEFORE adopting.
            const ssrNodes = Array.from(
                container.querySelectorAll('ul[data-fw-id="app:panel"] > li')
            );
            expect(ssrNodes).toHaveLength(3);
            const [n1, n2, n3] = ssrNodes;

            const rowTpl = parserApi.fromHTML('<li id="row">#{label}</li>');
            const list = ui.list('panel', 'rows', {
                keyFn: r => String(r.id),
                block: rowTpl,
            });
            list.adopt(initial, { idPrefix: 'app' });

            // Same DOM nodes referenced.
            expect(list.element('1')).toBe(n1);
            expect(list.element('2')).toBe(n2);
            expect(list.element('3')).toBe(n3);
            expect(list.size).toBe(3);
            expect([...list.keys()]).toEqual(['1', '2', '3']);

            // Mutate via list.text → SSR node is updated.
            list.text('2', 'BANANA');
            expect(n2.textContent.trim()).toBe('BANANA');
            // Other rows untouched.
            expect(n1.textContent.trim()).toBe('apple');
        });

        test('adopt then sync : unchanged rows keep their SSR DOM node', () => {
            const initial = [
                { id: 1, label: 'a' },
                { id: 2, label: 'b' },
            ];
            ssrPage(initial);

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            ui.hydrate([{ id: 'panel', block: clientTpl, data: {} }], { idPrefix: 'app' });

            const ssrNodes = Array.from(
                container.querySelectorAll('ul[data-fw-id="app:panel"] > li')
            );
            const [n1, n2] = ssrNodes;

            const rowTpl = parserApi.fromHTML('<li id="row">#{label}</li>');
            const list = ui.list('panel', 'rows', {
                keyFn: r => String(r.id),
                block: rowTpl,
                // Real apps typically re-fetch and ship fresh objects - use a
                // content-aware eq instead of the default Object.is so that
                // unchanged rows can be detected post-adopt.
                eqFn: (a, b) => a.id === b.id && a.label === b.label,
            });
            list.adopt(initial, { idPrefix: 'app' });

            // Now reconcile : keep #1, drop #2, add #3.
            const delta = list.sync([
                { id: 1, label: 'a' },          // kept (same id + label)
                { id: 3, label: 'c' },          // added
            ]);

            expect([...delta.kept]).toEqual(['1']);
            expect([...delta.removed]).toEqual(['2']);
            expect([...delta.added]).toEqual(['3']);

            // Row #1's DOM node identity is preserved.
            expect(list.element('1')).toBe(n1);
            // Row #2's DOM node was detached.
            expect(n2.parentNode).toBe(null);
        });

        test('adopt fires onMount for each row', () => {
            ssrPage([{ id: 1, label: 'x' }, { id: 2, label: 'y' }]);

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            ui.hydrate([{ id: 'panel', block: clientTpl, data: {} }], { idPrefix: 'app' });

            const mounts = [];
            const rowTpl = parserApi.fromHTML('<li id="row">#{label}</li>');
            const list = ui.list('panel', 'rows', {
                keyFn: r => String(r.id),
                block: rowTpl,
                onMount: (key, item) => mounts.push([key, item.label]),
            });
            list.adopt([{ id: 1, label: 'x' }, { id: 2, label: 'y' }], { idPrefix: 'app' });

            expect(mounts).toEqual([['1', 'x'], ['2', 'y']]);
        });

        test('adopt throws when row count mismatches', () => {
            ssrPage([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            ui.hydrate([{ id: 'panel', block: clientTpl, data: {} }], { idPrefix: 'app' });

            const rowTpl = parserApi.fromHTML('<li id="row">#{label}</li>');
            const list = ui.list('panel', 'rows', {
                keyFn: r => String(r.id),
                block: rowTpl,
            });

            expect(() => list.adopt(
                [{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }],
                { idPrefix: 'app' }
            )).toThrow(/row count mismatch/);
        });

        test('adopt refuses to run on a non-empty list', () => {
            ssrPage([{ id: 1, label: 'a' }]);

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            ui.hydrate([{ id: 'panel', block: clientTpl, data: {} }], { idPrefix: 'app' });

            const rowTpl = parserApi.fromHTML('<li id="row">#{label}</li>');
            const list = ui.list('panel', 'rows', {
                keyFn: r => String(r.id),
                block: rowTpl,
            });
            // Spuriously push something before adopt.
            list.push({ id: 99, label: 'pre-existing' });

            expect(() => list.adopt([{ id: 1, label: 'a' }], { idPrefix: 'app' }))
                .toThrow(/not empty/);
        });

        test('ui.clear(parent) cascades into adopted rows', () => {
            ssrPage([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML(`
                <ul id="panel">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            ui.hydrate([{ id: 'panel', block: clientTpl, data: {} }], { idPrefix: 'app' });

            const rowTpl = parserApi.fromHTML('<li id="row">#{label}</li>');
            const list = ui.list('panel', 'rows', {
                keyFn: r => String(r.id),
                block: rowTpl,
            });
            list.adopt([{ id: 1, label: 'a' }, { id: 2, label: 'b' }], { idPrefix: 'app' });

            expect(list.size).toBe(2);
            ui.clear('panel');
            // List is disposed, parent and rows removed.
            expect(container.querySelector('[data-fw-id="app:panel"]')).toBeNull();
        });
    });

    // ── hydrate({onMismatch}) - recovery policies ──────────────────────────

    describe('hydrate onMismatch policy', () => {

        test('default (throw) keeps strict behaviour', () => {
            const { ui, parserApi } = makeSession('app', container);
            // No SSR HTML at all → the expected node is missing.
            container.innerHTML = '<div data-fw-id="app:other">unrelated</div>';
            const tpl = parserApi.fromHTML('<p id="missing">x</p>');
            expect(() => ui.hydrate(
                [{ id: 'b', block: tpl, data: {} }],
                { idPrefix: 'app' },
            )).toThrow(/no DOM node found/);
        });

        test("'rebuild' falls back to ui.add for impacted items", () => {
            const { ui, parserApi } = makeSession('app', container);
            // Server never sent the right HTML : node is missing.
            const tpl = parserApi.fromHTML('<p id="root">#{txt}</p>');
            ui.hydrate(
                [{ id: 'b', block: tpl, data: { txt: 'fresh' } }],
                { idPrefix: 'app', onMismatch: 'rebuild' },
            );
            // The item was rebuilt by ui.add → present in the session map.
            expect(ui.get('b')).not.toBeNull();
            expect(ui.get('b').textContent).toContain('fresh');
        });

        test("'skip' drops the item silently", () => {
            const { ui, parserApi } = makeSession('app', container);
            const tpl = parserApi.fromHTML('<p id="root">x</p>');
            ui.hydrate(
                [{ id: 'b', block: tpl, data: {} }],
                { idPrefix: 'app', onMismatch: 'skip' },
            );
            expect(ui.get('b')).toBeNull();
            // Subsequent ui.text is a no-op (no throw).
            ui.text('b', 'no-effect');
        });

        test('function decision : per-item dispatch', () => {
            const { ui, parserApi } = makeSession('app', container);
            const tpl1 = parserApi.fromHTML('<p id="root">x</p>');
            const tpl2 = parserApi.fromHTML('<span id="root">y</span>');
            const seen = [];
            ui.hydrate(
                [
                    { id: 'a', block: tpl1, data: {} },
                    { id: 'b', block: tpl2, data: {} },
                ],
                {
                    idPrefix: 'app',
                    onMismatch: (info) => {
                        seen.push(info.blockId);
                        return info.blockId === 'a' ? 'rebuild' : 'skip';
                    },
                },
            );
            expect(seen).toEqual(['a', 'b']);
            expect(ui.get('a')).not.toBeNull();
            expect(ui.get('b')).toBeNull();
        });

        test("hydrate succeeds on matching items even when 'rebuild' is set", () => {
            const tpl = parser.factory(secPolicy.factory()).fromHTML('<h1 id="t">#{title}</h1>');
            const html = render.factory(secPolicy.factory()).toHTML(tpl, { title: 'X' }, { idPrefix: 'app' });
            container.innerHTML = html;

            const { ui, parserApi } = makeSession('app', container);
            const clientTpl = parserApi.fromHTML('<h1 id="t">#{title}</h1>');
            ui.hydrate(
                [{ id: 'block', block: clientTpl, data: { title: 'X' } }],
                { idPrefix: 'app', onMismatch: 'rebuild' },
            );
            // Adoption succeeded - no rebuild ran.
            const node = ui.get('block', 't');
            expect(node.textContent).toBe('X');
            expect(node).toBe(container.querySelector('[data-fw-id="app:t"]'));
        });
    });
});
