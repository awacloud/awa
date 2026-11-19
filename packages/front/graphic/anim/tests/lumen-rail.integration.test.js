// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * The Lumen Rail demo (`demos/lumen-rail/`): every sprite comes from a pool
 * built once at `run()`, so a full scripted run creates no DOM node; the
 * autopilot flies the run to its end; the keys move the ship; `dispose()`
 * leaves the shared scheduler as it was. The game advances in fixed steps
 * through `handle.advance(ms)`, so the run is the same on every machine.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

import { describe, test, expect } from 'bun:test';

async function start() {
    const { boot } = await import('../demos/_boot.js');
    const { anim, variant } = await boot('standalone');
    const { run } = await import('../demos/lumen-rail/main.js');
    const mount = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(mount);
    const before = anim.scheduler.scheduler.active.size;
    const handle = await run({ mount, anim, variant, autoplay: false });
    return { anim, mount, handle, before };
}

function finish({ mount, handle }) {
    handle.dispose();
    document.body.removeChild(mount);
}

/** Count DOM node creations while `fn` runs. */
function countCreations(fn) {
    const doc = /** @type {any} */ (document);
    const proto = /** @type {any} */ (globalThis.Node && globalThis.Node.prototype);
    const saved = { ns: doc.createElementNS, el: doc.createElement, tx: doc.createTextNode, cl: proto && proto.cloneNode };
    let n = 0;
    doc.createElementNS = function (...a) { n += 1; return saved.ns.apply(this, a); };
    doc.createElement = function (...a) { n += 1; return saved.el.apply(this, a); };
    doc.createTextNode = function (...a) { n += 1; return saved.tx.apply(this, a); };
    if (proto) proto.cloneNode = function (...a) { n += 1; return saved.cl.apply(this, a); };
    try { fn(); } finally {
        doc.createElementNS = saved.ns;
        doc.createElement = saved.el;
        doc.createTextNode = saved.tx;
        if (proto) proto.cloneNode = saved.cl;
    }
    return n;
}

describe('lumen-rail: pooled sprites, scripted run', () => {
    test('a full autopilot run creates no DOM node and clears the run', async () => {
        const ctx = await start();
        const { handle, mount } = ctx;
        const nodes = mount.querySelectorAll('*').length;
        handle.start({ autopilot: true });
        const created = countCreations(() => {
            for (let t = 0; t < 90000 && handle.state === 'flying'; t += 250) handle.advance(250);
        });
        expect(created).toBe(0);
        expect(mount.querySelectorAll('*').length).toBe(nodes);
        expect(handle.reachedBoss).toBe(true);
        expect(handle.state).toBe('clear');
        expect(handle.time).toBeGreaterThan(45000);
        expect(handle.time).toBeLessThan(90000);
        expect(handle.score).toBeGreaterThan(0);
        finish(ctx);
    });

    test('the keys move the ship', async () => {
        const ctx = await start();
        const { handle } = ctx;
        handle.start({ autopilot: false });
        handle.advance(200);
        const x0 = handle.ship.x;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        handle.advance(400);
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
        expect(handle.ship.x).toBeLessThan(x0 - 50);
        const x1 = handle.ship.x;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
        handle.advance(400);
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
        expect(handle.ship.x).toBeGreaterThan(x1 + 50);
        finish(ctx);
    });

    test('a ship that never steers loses its shield and the run ends', async () => {
        const ctx = await start();
        const { handle } = ctx;
        handle.start({ autopilot: false });
        for (let t = 0; t < 90000 && handle.state === 'flying'; t += 250) handle.advance(250);
        expect(handle.state).toBe('down');
        expect(handle.shield).toBe(0);
        finish(ctx);
    });

    test('dispose leaves none of the demo on the shared scheduler', async () => {
        const ctx = await start();
        ctx.handle.start({ autopilot: true });
        ctx.handle.play();
        expect(ctx.anim.scheduler.scheduler.active.size).toBeGreaterThan(ctx.before);
        finish(ctx);
        expect(ctx.anim.scheduler.scheduler.active.size).toBe(ctx.before);
    });
});
