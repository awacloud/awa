// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
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
import { devtools }     from './devtools.js';
import { clock }        from '../../io/timing/clock.js';
import { ModuleRuntime } from '../../core/runtime.js';
import { uiSession }    from './uiSession.js';
import { uiSessionCore }   from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList }   from './uiSession-list.js';
import { template }     from './template.js';
import { render }       from './render.js';
import { parser }       from './parser.js';
import { secPolicy }    from './secPolicy.js';
import { dom }          from '../query/dom.js';
import { events }       from '../query/events.js';

afterAll(async () => {
    if (_ownsDom) {
        _ownsDom = false;
        await GlobalRegistrator.unregister();
    }
});

function makeSession(name, el) {
    const sp = secPolicy.factory();
    const tpl = template.factory(sp);
    const rnd = render.factory(sp);
    const prs = parser.factory(sp);
    const dm  = dom.factory(sp);
    const ev  = events.factory();
    tpl.init(name, { to: el, main: true });
    return uiSession.factory(
        uiSessionCore.factory(tpl, rnd, prs, dm, ev),
        uiSessionDirect.factory(dm, ev),
        uiSessionList.factory(tpl, rnd, dm),
    )(name);
}

describe('devtools module', () => {

    test('metadata', () => {
        expect(devtools.name).toBe('devtools');
        expect(devtools.version).toBe('1.0.0');
        expect(devtools.type).toBe('fw.dom.rendering');
        expect(devtools.dependencies).toEqual(['clock']);
    });

    let dev, container, ui;
    beforeEach(() => {
        // devtools.factory() takes the clock INSTANCE, not the module
        // descriptor (BL-466) — mirror what runtime.resolve() injects.
        dev = devtools.factory(clock.factory());
        container = document.createElement('div');
        document.body.appendChild(container);
        ui = makeSession(`ctx-${Math.random()}`, container);
    });

    // ── inspect ────────────────────────────────────────────────────────────

    describe('inspect', () => {
        test('returns container + empty arrays for a fresh session', () => {
            const snap = dev.inspect(ui);
            expect(typeof snap.container).toBe('string');
            expect(snap.blocks).toEqual([]);
            expect(snap.attaches).toEqual([]);
            expect(snap.listeners).toEqual([]);
            expect(snap.lists).toEqual([]);
            expect(snap.portals).toEqual([]);
        });

        test('lists blocks + logical IDs after add', () => {
            ui.add([{
                id: 'panel',
                block: ui.parse('<div id="root"><h1 id="title">x</h1><p id="body">y</p></div>'),
                data: {},
            }]);
            const snap = dev.inspect(ui);
            expect(snap.blocks).toHaveLength(1);
            expect(snap.blocks[0].id).toBe('panel');
            expect(snap.blocks[0].logicalIds).toEqual(expect.arrayContaining(['root', 'title', 'body']));
            expect(snap.blocks[0].isLoop).toBe(false);
        });

        test('reflects loop-rendered blocks with isLoop:true', () => {
            ui.add([{
                id: 'rows',
                block: ui.parse('<li id="row">#{n}</li>'),
                data: [{ n: 1 }, { n: 2 }, { n: 3 }],
            }]);
            const snap = dev.inspect(ui);
            const entry = snap.blocks.find(b => b.id === 'rows');
            expect(entry.isLoop).toBe(true);
            expect(entry.logicalIds).toHaveLength(3);
        });

        test('listeners are tracked after ui.on', () => {
            ui.add([{ id: 'p', block: ui.parse('<button id="root">x</button>'), data: {} }]);
            ui.on('p', 'click', () => {}, 'my-handler');
            const snap = dev.inspect(ui);
            expect(snap.listeners).toHaveLength(1);
            expect(snap.listeners[0].blockId).toBe('p');
            expect(snap.listeners[0].names).toContain('my-handler');
        });

        test('lists & portals are reported', () => {
            ui.add([{ id: 'panel', block: ui.parse('<ul id="root">${items}</ul>'), data: {} }]);
            const list = ui.list('panel', 'items', {
                keyFn: x => x.id,
                block: ui.parse('<li id="row">#{label}</li>'),
            });
            list.push({ id: 1, label: 'A' });

            const portal = ui.portal('modal', { to: document.body });
            // Force portal map to exist with at least the registration.
            const snap = dev.inspect(ui);
            expect(snap.lists).toHaveLength(1);
            expect(snap.lists[0].parent).toBe('panel');
            expect(snap.lists[0].size).toBe(1);
            expect(snap.portals.find(p => p.name === 'modal')).toBeDefined();
            portal.clear();
        });

        test('summarize returns one-line per block', () => {
            ui.add([{ id: 'a', block: ui.parse('<p id="root">x</p>'), data: {} }]);
            ui.add([{ id: 'b', block: ui.parse('<p id="root">y</p>'), data: {} }]);
            const s = dev.summarize(ui);
            expect(s).toContain('a(');
            expect(s).toContain('b(');
        });
    });

    // ── dumpTemplate ───────────────────────────────────────────────────────

    describe('dumpTemplate', () => {
        test('produces a tree with tag + id', () => {
            const tpl = ui.parse('<div id="root"><h1 id="t">#{title}</h1></div>');
            const out = dev.dumpTemplate(tpl);
            expect(out).toContain('<div#root>');
            expect(out).toContain('<h1#t>');
            expect(out).toContain('map=');
        });

        test('handles ParseResult and bare elm-array', () => {
            const tpl = ui.parse('<p id="x">${slot}</p>');
            const fromPR  = dev.dumpTemplate(tpl);
            const fromArr = dev.dumpTemplate(tpl.template);
            expect(fromPR).toContain('slot="slot"');
            expect(fromArr).toContain('slot="slot"');
        });

        test('inlines iterate sub-templates', () => {
            const tpl = ui.parse(`
                <ul id="root">
                    <!-- $rows -->
                    <li id="row">#{label}</li>
                    <!-- rows$ -->
                </ul>
            `);
            const out = dev.dumpTemplate(tpl);
            expect(out).toContain('iterate: rows');
            expect(out).toContain('<li#row>');
        });
    });

    // ── profile / profileAsync / timer ──────────────────────────────────────

    describe('profile', () => {
        test('returns result + durationMs', () => {
            const { result, durationMs } = dev.profile(() => 1 + 2);
            expect(result).toBe(3);
            expect(typeof durationMs).toBe('number');
            expect(durationMs).toBeGreaterThanOrEqual(0);
        });

        test('profileAsync awaits the promise', async () => {
            const { result, durationMs } = await dev.profileAsync(async () => {
                await new Promise(r => setTimeout(r, 5));
                return 42;
            });
            expect(result).toBe(42);
            expect(durationMs).toBeGreaterThanOrEqual(0);
        });

        test('timer produces segments + total', () => {
            const t = dev.timer();
            t.mark('a');
            t.mark('b');
            const { total, segments } = t.end();
            expect(typeof total).toBe('number');
            expect(segments).toHaveLength(2);
            expect(segments[0].name).toBe('a');
            expect(segments[1].name).toBe('b');
            expect(typeof segments[0].durationMs).toBe('number');
        });

        test('timer.end() with no marks returns empty segments + total', () => {
            const t = dev.timer();
            const { total, segments } = t.end();
            expect(typeof total).toBe('number');
            expect(total).toBeGreaterThanOrEqual(0);
            expect(segments).toEqual([]);
        });

        test('timer with a single mark produces one closed segment', () => {
            const t = dev.timer();
            t.mark('solo');
            const { total, segments } = t.end();
            expect(segments).toHaveLength(1);
            expect(segments[0].name).toBe('solo');
            expect(typeof segments[0].durationMs).toBe('number');
            expect(segments[0]._startedAt).toBeUndefined();
            expect(total).toBeGreaterThanOrEqual(segments[0].durationMs);
        });
    });

    // ── resolve() path (BL-466) ───────────────────────────────────────────
    //
    // `runtime.resolve()` calls `def.factory.apply({}, deps)` with ALREADY
    // -INSTANTIATED dependency instances (`ModuleRuntime.resolve`,
    // `src/core/runtime.js`), not raw module descriptors. Before the BL-466
    // fix, `devtools.factory()` called `.factory()` AGAIN on the injected
    // clock instance, which has no such method: `profile`/`profileAsync`/
    // `timer` TypeError'd on this canonical path (sde-core's taskmgr
    // consumes `devtools` exactly this way).
    describe('resolve() path (BL-466)', () => {
        test('devtools obtained via runtime.resolve() exposes a working profiler', async () => {
            const rt = new ModuleRuntime();
            rt.registerAllDeep([devtools]);
            const resolved = rt.resolve('devtools');

            const sync = resolved.profile(() => 1 + 2);
            expect(sync.result).toBe(3);
            expect(typeof sync.durationMs).toBe('number');
            expect(sync.durationMs).toBeGreaterThanOrEqual(0);

            const async_ = await resolved.profileAsync(async () => {
                await new Promise(r => setTimeout(r, 5));
                return 42;
            });
            expect(async_.result).toBe(42);
            expect(async_.durationMs).toBeGreaterThanOrEqual(0);

            const t = resolved.timer();
            t.mark('a');
            t.mark('b');
            const { total, segments } = t.end();
            expect(typeof total).toBe('number');
            expect(segments).toHaveLength(2);
            expect(segments[0].name).toBe('a');
            expect(segments[1].name).toBe('b');
        });
    });
});
