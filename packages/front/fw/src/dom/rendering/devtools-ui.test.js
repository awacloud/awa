// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Unit tests for `devtoolsUI` (BATCH_26/05).
 *
 * happy-dom ownership: `GlobalRegistrator.register()` leaks DOM globals into
 * every sibling file of the same bun process (memory/types/fw, 2026-07-28), so
 * this file registers ONLY when no document exists yet and unregisters in
 * `afterAll` under that same ownership flag — never tearing down a realm a
 * sibling installed.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';

let _ownsDom = false;
if (typeof globalThis.document === 'undefined') {
    GlobalRegistrator.register();
    _ownsDom = true;
}

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { join } from 'path';

import { devtoolsUI } from './devtools-ui.js';
import { devtools } from './devtools.js';
import { clock } from '../../io/timing/clock.js';
import { signal } from '../../io/utils/signal.js';
import { ModuleRuntime } from '../../core/runtime.js';

import { uiSession } from './uiSession.js';
import { uiSessionCore } from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList } from './uiSession-list.js';
import { template } from './template.js';
import { render as renderMod } from './render.js';
import { parser } from './parser.js';
import { secPolicy } from './secPolicy.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

afterAll(async () => {
    if (_ownsDom) {
        _ownsDom = false;
        await GlobalRegistrator.unregister();
    }
});

let _seq = 0;

/**
 * Build a real `uiSession` mounted on `el` — same wiring devtools.test.js uses.
 * @param {string} name
 * @param {Element} el
 * @returns {object}
 */
function makeSession(name, el) {
    const sp = secPolicy.factory();
    const tpl = template.factory(sp);
    const rnd = renderMod.factory(sp);
    const prs = parser.factory(sp);
    const dm = dom.factory(sp);
    const ev = events.factory();
    tpl.init(name, { to: el, main: true });
    return uiSession.factory(
        uiSessionCore.factory(tpl, rnd, prs, dm, ev),
        uiSessionDirect.factory(dm, ev),
        uiSessionList.factory(tpl, rnd, dm),
    )(name);
}

/** @returns {{ runtime: ModuleRuntime }} A fresh registry holding two modules. */
function makeRegistry() {
    const rt = new ModuleRuntime();
    rt.register({
        name: 'fixtureLeaf',
        version: '1.0.0',
        type: 'fw.test.fixture',
        dependencies: [],
        factory: () => ({ ok: true }),
    });
    rt.register({
        name: 'fixtureRoot',
        version: '2.1.0',
        type: 'fw.test.fixture',
        dependencies: ['fixtureLeaf'],
        factory: () => ({ ok: true }),
    });
    return rt;
}

/**
 * @param {Element} root
 * @param {string} view
 * @returns {Element|null}
 */
function viewOf(root, view) {
    return root.querySelector(`[data-view="${view}"]`);
}

/**
 * @param {Element} scope
 * @returns {string[][]} Table body rows as cell-text arrays, all tables flattened.
 */
function rowsOf(scope) {
    return [...scope.querySelectorAll('tbody tr')]
        .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
}

describe('devtoolsUI module', () => {

    test('should have correct module metadata', () => {
        expect(devtoolsUI.name).toBe('devtoolsUI');
        expect(devtoolsUI.version).toBe('1.0.0');
        expect(devtoolsUI.type).toBe('fw.dom.rendering');
        expect(devtoolsUI.dependencies).toEqual(['devtools']);
        expect(devtoolsUI.deps).toEqual([devtools]);
        expect(typeof devtoolsUI.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with exactly the four render methods', () => {
            const ui = devtoolsUI.factory(devtools.factory(clock.factory()));
            expect(Object.keys(ui).sort())
                .toEqual(['render', 'renderGraph', 'renderRegistry', 'renderSession']);
            for (const k of Object.keys(ui)) expect(typeof ui[k]).toBe('function');
        });

        test('instantiation touches no DOM', () => {
            const before = document.body.childElementCount;
            devtoolsUI.factory(devtools.factory(clock.factory()));
            expect(document.body.childElementCount).toBe(before);
            expect(document.querySelectorAll('[data-fw-devtools-ui]')).toHaveLength(0);
        });

        test('resolves through the runtime with the devtools INSTANCE injected', () => {
            const rt = new ModuleRuntime();
            rt.registerAllDeep([devtoolsUI]);
            const ui = rt.resolve('devtoolsUI');
            expect(typeof ui.render).toBe('function');
            expect(typeof ui.renderSession).toBe('function');
        });
    });

    // ── Opt-in: nothing happens at import time ──────────────────────────────

    describe('opt-in contract', () => {
        test('importing the module into a fresh realm mounts nothing', () => {
            const HERE = import.meta.dir;
            const MOD = JSON.stringify(join(HERE, 'devtools-ui.js'));
            const probe = `
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();
import ${MOD};
const out = {
  bodyChildren: document.body.childElementCount,
  headChildren: document.head.childElementCount,
  bodyText: document.body.textContent,
  markers: document.querySelectorAll('[data-fw-devtools-ui]').length,
  htmlLength: document.documentElement.outerHTML.length,
};
process.stdout.write(JSON.stringify(out));
process.exit(0);
`;
            const proc = Bun.spawnSync(['bun', '-e', probe], { stdout: 'pipe', stderr: 'pipe' });
            const stdout = proc.stdout?.toString() ?? '';
            if (proc.exitCode !== 0)
                throw new Error(`probe failed (exit ${proc.exitCode})\n${stdout}\n${proc.stderr?.toString()}`);
            const out = JSON.parse(stdout);
            expect(out.bodyChildren).toBe(0);
            expect(out.headChildren).toBe(0);
            expect(out.bodyText).toBe('');
            expect(out.markers).toBe(0);
        });
    });

    // ── View 1 — session ────────────────────────────────────────────────────

    describe('renderSession', () => {
        let ui, dev, target, session, sessionHost;

        beforeEach(() => {
            dev = devtools.factory(clock.factory());
            ui = devtoolsUI.factory(dev);
            sessionHost = document.createElement('div');
            document.body.appendChild(sessionHost);
            session = makeSession(`ctx-${++_seq}`, sessionHost);
            target = document.createElement('div');
        });

        test('renders the inspect() snapshot of a known fixture session', () => {
            session.add([{
                id: 'panel',
                block: session.parse('<div id="root"><h1 id="title">x</h1><p id="body">y</p></div>'),
                data: {},
            }]);
            session.on('panel', 'click', () => {}, 'my-handler');

            const sec = ui.renderSession(target, session);

            expect(sec.getAttribute('data-view')).toBe('session');
            expect(target.contains(sec)).toBe(true);
            expect(sec.textContent).toContain('container:');
            expect(sec.textContent).toContain('summary: panel(');

            const rows = rowsOf(sec);
            expect(rows.some(r => r[0] === 'panel' && r[1].includes('title') && r[2] === 'no')).toBe(true);
            expect(rows.some(r => r[0] === 'panel' && r[2] === 'my-handler')).toBe(true);
            expect(rows.some(r => r[0] === 'blocks' && r[1] === '1')).toBe(true);
            expect(rows.some(r => r[0] === 'listeners' && r[1] === '1')).toBe(true);
        });

        test('reports a loop block as loop=yes', () => {
            session.add([{
                id: 'rows',
                block: session.parse('<li id="row">#{n}</li>'),
                data: [{ n: 1 }, { n: 2 }, { n: 3 }],
            }]);
            const sec = ui.renderSession(target, session);
            const rows = rowsOf(sec);
            const loopRow = rows.find(r => r[0] === 'rows');
            expect(loopRow[2]).toBe('yes');
            expect(loopRow[1].split(' | ')).toHaveLength(3);
        });

        test('renders empty labels for a fresh session', () => {
            const sec = ui.renderSession(target, session);
            expect(sec.textContent).toContain('no mounted block');
            expect(sec.textContent).toContain('no registered listener');
            expect(sec.textContent).toContain('no list');
        });

        test('escapes nothing as markup — values land in textContent only', () => {
            session.add([{
                id: '<img src=x>',
                block: session.parse('<p id="root">x</p>'),
                data: {},
            }]);
            const sec = ui.renderSession(target, session);
            expect(sec.querySelector('img')).toBeNull();
            expect(sec.textContent).toContain('<img src=x>');
        });

        test('throws on a non-element target', () => {
            expect(() => ui.renderSession(null, session)).toThrow(/target must be a DOM element/);
            expect(() => ui.renderSession({}, session)).toThrow(/target must be a DOM element/);
        });

        test('throws on a missing session (delegated to devtools.inspect)', () => {
            expect(() => ui.renderSession(target, null)).toThrow();
        });

        test('read-only: the session is unchanged by rendering', () => {
            session.add([{ id: 'panel', block: session.parse('<p id="root">x</p>'), data: {} }]);
            const before = JSON.stringify(dev.inspect(session));
            const hostBefore = sessionHost.innerHTML;

            ui.renderSession(target, session);

            expect(JSON.stringify(dev.inspect(session))).toBe(before);
            expect(sessionHost.innerHTML).toBe(hostBefore);
        });
    });

    // ── View 2 — module registry ────────────────────────────────────────────

    describe('renderRegistry', () => {
        let ui, target, rt;

        beforeEach(() => {
            ui = devtoolsUI.factory(devtools.factory(clock.factory()));
            target = document.createElement('div');
            rt = makeRegistry();
        });

        test('renders one row per registered version from a known fixture registry', () => {
            const sec = ui.renderRegistry(target, rt);
            expect(sec.getAttribute('data-view')).toBe('registry');
            expect(sec.textContent).toContain('2 registered version(s)');

            const rows = rowsOf(sec);
            expect(rows).toHaveLength(2);
            expect(rows).toContainEqual(['fixtureLeaf', '1.0.0', 'fw.test.fixture', '—', 'yes', 'no']);
            expect(rows).toContainEqual(['fixtureRoot', '2.1.0', 'fw.test.fixture', 'fixtureLeaf', 'yes', 'no']);
        });

        test('reports the instantiated flag without instantiating', () => {
            rt.resolve('fixtureRoot');
            const sec = ui.renderRegistry(target, rt);
            const rows = rowsOf(sec);
            expect(rows.find(r => r[0] === 'fixtureRoot')[5]).toBe('yes');
            expect(rows.find(r => r[0] === 'fixtureLeaf')[5]).toBe('yes');
        });

        test('honours the snapshot filter', () => {
            const sec = ui.renderRegistry(target, rt, { name: 'fixtureLeaf' });
            expect(rowsOf(sec)).toHaveLength(1);
            expect(sec.textContent).toContain('1 registered version(s)');
        });

        test('renders an empty label for an empty registry', () => {
            const sec = ui.renderRegistry(target, new ModuleRuntime());
            expect(sec.textContent).toContain('no registered module');
        });

        test('rejects a source without snapshot() — list() is not accepted', () => {
            expect(() => ui.renderRegistry(target, { list: () => [] }))
                .toThrow(/must expose snapshot\(\)/);
            expect(() => ui.renderRegistry(target, null)).toThrow(/must expose snapshot\(\)/);
        });

        test('throws on a non-element target', () => {
            expect(() => ui.renderRegistry(undefined, rt)).toThrow(/target must be a DOM element/);
        });

        test('read-only: rendering instantiates nothing and leaves the registry intact', () => {
            const before = JSON.stringify(rt.snapshot());
            const defBefore = JSON.stringify(rt.list().map(d => ({ n: d.name, d: d.dependencies })));
            expect(rt.instances.size).toBe(0);

            ui.renderRegistry(target, rt);

            expect(rt.instances.size).toBe(0);
            expect(JSON.stringify(rt.snapshot())).toBe(before);
            expect(JSON.stringify(rt.list().map(d => ({ n: d.name, d: d.dependencies })))).toBe(defBefore);
            expect(rt.modules.size).toBe(2);
        });
    });

    // ── View 3 — signal graph ───────────────────────────────────────────────

    describe('renderGraph', () => {
        let ui, target, api;

        beforeEach(() => {
            ui = devtoolsUI.factory(devtools.factory(clock.factory()));
            target = document.createElement('div');
            api = signal.factory();
        });

        test('renders effects, signals and edges from a known fixture graph', () => {
            const a = api.create(0);
            const b = api.create(0);
            api.effect(() => { a.get(); b.get(); });
            api.effect(() => { b.get(); });

            const sec = ui.renderGraph(target, api);
            expect(sec.getAttribute('data-view')).toBe('graph');
            expect(sec.textContent).toContain('2 signal(s) · 2 effect(s) · 3 edge(s)');

            const rows = rowsOf(sec);
            expect(rows).toContainEqual(['e1', '2']);
            expect(rows).toContainEqual(['e2', '1']);
            expect(rows).toContainEqual(['s1', 'signal']);
            expect(rows).toContainEqual(['s2', 'signal']);
            expect(rows).toContainEqual(['e1', 's1']);
            expect(rows).toContainEqual(['e1', 's2']);
            expect(rows).toContainEqual(['e2', 's2']);
        });

        test('reports a computed observed by an effect as kind=computed', () => {
            const a = api.create(1);
            const c = api.computed(() => a.peek() + 1);
            api.effect(() => { c.get(); });
            const sec = ui.renderGraph(target, api);
            expect(rowsOf(sec)).toContainEqual(['c2', 'computed']);
        });

        test('states the two documented limits instead of implying exhaustiveness', () => {
            api.create(42);                      // unobserved signal: not a node
            const sec = ui.renderGraph(target, api);
            const note = sec.querySelector('.fw-devtools-ui__note').textContent;
            expect(note).toContain('EFFECT dependency graph');
            expect(note).toContain('no live effect observes is not a node');
            expect(note).toContain('own sources of a computed');
            expect(sec.textContent).toContain('no observed signal');
        });

        test('renders empty labels for a graph with no live effect', () => {
            const sec = ui.renderGraph(target, api);
            expect(sec.textContent).toContain('0 signal(s) · 0 effect(s) · 0 edge(s)');
            expect(sec.textContent).toContain('no live effect');
            expect(sec.textContent).toContain('no edge');
        });

        test('rejects a source without inspectGraph()', () => {
            expect(() => ui.renderGraph(target, {})).toThrow(/inspectGraph\(\)/);
            expect(() => ui.renderGraph(target, signal)).toThrow(/inspectGraph\(\)/);
        });

        test('throws on a non-element target', () => {
            expect(() => ui.renderGraph('#nope', api)).toThrow(/target must be a DOM element/);
        });

        test('read-only: rendering adds no node, no edge and re-runs no effect', () => {
            const a = api.create(0);
            let runs = 0;
            api.effect(() => { runs++; a.get(); });
            expect(runs).toBe(1);
            const before = JSON.stringify(api.inspectGraph());

            ui.renderGraph(target, api);

            expect(JSON.stringify(api.inspectGraph())).toBe(before);
            expect(runs).toBe(1);
            a.set(1);
            expect(runs).toBe(2);
            expect(JSON.stringify(api.inspectGraph())).toBe(before);
        });
    });

    // ── Composite ───────────────────────────────────────────────────────────

    describe('render', () => {
        let ui, dev, target;

        beforeEach(() => {
            dev = devtools.factory(clock.factory());
            ui = devtoolsUI.factory(dev);
            target = document.createElement('div');
        });

        test('emits the three views in order for the three sources', () => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const session = makeSession(`ctx-${++_seq}`, host);
            const rt = makeRegistry();
            const api = signal.factory();
            const s = api.create(0);
            api.effect(() => { s.get(); });

            const root = ui.render(target, { session, runtime: rt, signal: api });

            expect(root.className).toBe('fw-devtools-ui');
            expect(root.hasAttribute('data-fw-devtools-ui')).toBe(true);
            expect(target.contains(root)).toBe(true);
            expect([...root.children].map(c => c.getAttribute('data-view')))
                .toEqual(['session', 'registry', 'graph']);
            expect(viewOf(root, 'registry').textContent).toContain('fixtureRoot');
            expect(viewOf(root, 'graph').textContent).toContain('1 signal(s)');
        });

        test('emits only the views whose source is supplied', () => {
            const root = ui.render(target, { runtime: makeRegistry() });
            expect([...root.children].map(c => c.getAttribute('data-view'))).toEqual(['registry']);
            expect(viewOf(root, 'session')).toBeNull();
            expect(viewOf(root, 'graph')).toBeNull();
        });

        test('passes the filter through to the registry view', () => {
            const root = ui.render(target, { runtime: makeRegistry(), filter: { name: 'fixtureLeaf' } });
            expect(rowsOf(viewOf(root, 'registry'))).toHaveLength(1);
        });

        test('renders an empty root when no source is given', () => {
            const root = ui.render(target);
            expect(root.childElementCount).toBe(1);
            expect(root.textContent).toBe('no source provided');
        });

        test('appends a new root per call and never clears the target', () => {
            const marker = document.createElement('span');
            marker.textContent = 'keep me';
            target.appendChild(marker);

            ui.render(target, { runtime: makeRegistry() });
            ui.render(target, { runtime: makeRegistry() });

            expect(target.querySelectorAll('[data-fw-devtools-ui]')).toHaveLength(2);
            expect(target.firstElementChild).toBe(marker);
        });

        test('throws on a non-element target', () => {
            expect(() => ui.render(null)).toThrow(/target must be a DOM element/);
        });
    });
});
