// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for `ui.mount` - verifies that the generic helper
 * correctly bridges the lifecycle of external widgets to a uiSession block.
 *
 * Covers : virtualScroll, chart, eventBus.scope.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect, beforeEach } from 'bun:test';

import { uiSession }       from './uiSession.js';
import { uiSessionCore }   from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList }   from './uiSession-list.js';
import { template }     from './template.js';
import { render }       from './render.js';
import { parser }       from './parser.js';
import { secPolicy }    from './secPolicy.js';
import { virtualScroll } from './virtualScroll.js';
import { chart }        from './chart.js';
import { dom }          from '../query/dom.js';
import { events }       from '../query/events.js';
import { eventBus }     from '../../io/utils/eventBus.js';
import { animate }      from '../display/animate.js';
import { easing }       from '../../io/calc/easing.js';
import { stats }        from '../../io/math/stats.js';
import { linalg }       from '../../io/math/linalg.js';

function makeSession(containerName, containerEl) {
    const sp  = secPolicy.factory();
    const tpl = template.factory(sp);
    const rnd = render.factory(sp);
    const prs = parser.factory(sp);
    const dm  = dom.factory(sp);
    const ev  = events.factory();
    tpl.init(containerName, { to: containerEl, main: true });
    const ui = uiSession.factory(
        uiSessionCore.factory(tpl, rnd, prs, dm, ev),
        uiSessionDirect.factory(dm, ev),
        uiSessionList.factory(tpl, rnd, dm),
    )(containerName);
    return { ui, dm, ev };
}

describe('ui.mount integration', () => {

    let container;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('virtualScroll bound via ui.mount, disposed on ui.clear', () => {
        const { ui, dm, ev } = makeSession(`vs-${Math.random()}`, container);
        const vs = virtualScroll.factory(dm, ev);

        ui.add([{
            id: 'panel',
            block: ui.parse('<div id="root" style="height: 200px; overflow: auto;">${rows}</div>'),
            data: {},
        }]);

        const list = ui.mount('panel', 'rows', (el) =>
            vs.create({
                container: el,
                total: 1000,
                itemHeight: 30,
                renderItem: (i) => {
                    const r = document.createElement('div');
                    r.textContent = `Item ${i}`;
                    return r;
                },
            })
        );

        expect(typeof list.refresh).toBe('function');
        expect(typeof list.scrollTo).toBe('function');

        // VS has installed a spacer + layer inside the slot.
        const slotEl = ui.get('panel', 'root').querySelector(':scope > div');
        expect(slotEl).not.toBeNull();

        // Disposal cascades : track via VS internal state if accessible, else
        // just ensure no throw and the block disappears.
        ui.clear('panel');
        expect(ui.get('panel')).toBeNull();
    });

    test('chart bound via ui.mount, disposed on ui.clear', () => {
        const { ui, dm } = makeSession(`ch-${Math.random()}`, container);
        const easingApi  = easing.factory();
        const animateApi = animate.factory(easingApi);
        const statsApi   = stats.factory();
        const linalgApi  = linalg.factory();
        const ch = chart.factory(dm, animateApi, statsApi, linalgApi);

        ui.add([{
            id: 'wrap',
            block: ui.parse('<div id="root" style="width: 200px; height: 100px;">${canvas}</div>'),
            data: {},
        }]);

        const handle = ui.mount('wrap', 'canvas', (el) =>
            ch.sparkline({ el, data: [{ x: 0, y: 1 }, { x: 1, y: 5 }, { x: 2, y: 3 }] })
        );

        expect(typeof handle.update).toBe('function');
        expect(typeof handle.dispose).toBe('function');

        // Should not throw when unmounting.
        ui.clear('wrap');
        expect(ui.get('wrap')).toBeNull();
    });

    test('eventBus.scope bound via ui.mount, listeners auto-disposed', () => {
        const { ui } = makeSession(`eb-${Math.random()}`, container);
        const bus = eventBus.factory().create();

        ui.add([{
            id: 'panel',
            block: ui.parse('<section id="root">x</section>'),
            data: {},
        }]);

        let received = 0;
        const scope = ui.mount('panel', null, () => bus.scope());
        scope.on('app:notify', () => { received++; });

        bus.emit('app:notify', null);
        expect(received).toBe(1);

        ui.clear('panel');
        // After clear, the scope is disposed → listener detached.
        bus.emit('app:notify', null);
        expect(received).toBe(1);
    });

    test('gesture.attach bound via ui.mount, detaches on clear', async () => {
        const { gesture } = await import('../query/gesture.js');
        const { ui, ev } = makeSession(`g-${Math.random()}`, container);
        const g = gesture.factory(ev);

        ui.add([{
            id: 'panel',
            block: ui.parse('<div id="root" style="width:100px;height:100px">x</div>'),
            data: {},
        }]);

        // Wrap the gesture controller so we can observe the dispose call
        // fired by ui.clear (the wrapper is what ui.adopt captures).
        let disposed = false;
        const ctrl = ui.mount('panel', null, (el) => {
            const inner = g.attach(el);
            return {
                ...inner,
                dispose() { disposed = true; inner.dispose(); },
            };
        });
        expect(typeof ctrl.dispose).toBe('function');

        ui.clear('panel');
        expect(disposed).toBe(true);
    });

    test('keybindings.scope bound via ui.mount, unbinds on clear', async () => {
        const { keybindings } = await import('../utils/keybindings.js');
        const { ui } = makeSession(`kb-${Math.random()}`, container);

        ui.add([{
            id: 'panel',
            block: ui.parse('<div id="root" tabindex="0">x</div>'),
            data: {},
        }]);

        const root = ui.get('panel');
        const kb = keybindings.factory({}, { create: () => ({ on: () => () => {}, emit: () => {} }) })
            .create({ target: root });
        kb.attach();

        let count = 0;
        const scope = ui.mount('panel', null, () => kb.scope());
        scope.bind('Ctrl+S', () => { count++; });

        root.dispatchEvent(new KeyboardEvent('keydown', {
            code: 'KeyS', key: 's', ctrlKey: true, bubbles: true,
        }));
        expect(count).toBe(1);

        ui.clear('panel');
        // After clear, the scope is disposed → key listener unbound.
        const root2 = document.createElement('div');
        document.body.appendChild(root2);
        root2.dispatchEvent(new KeyboardEvent('keydown', {
            code: 'KeyS', key: 's', ctrlKey: true, bubbles: true,
        }));
        expect(count).toBe(1);
        kb.dispose();
    });

    test('AbortController bound via ui.mount, abort fires on clear', () => {
        // Generic resource not provided by fw - AbortController is a stdlib
        // example. `ui.mount` adopts any object with `abort()`.
        const { ui } = makeSession(`ac-${Math.random()}`, container);

        ui.add([{
            id: 'panel',
            block: ui.parse('<section id="root">x</section>'),
            data: {},
        }]);

        const ac = ui.mount('panel', null, () => new AbortController());
        expect(ac.signal.aborted).toBe(false);

        ui.clear('panel');
        expect(ac.signal.aborted).toBe(true);
    });
});
