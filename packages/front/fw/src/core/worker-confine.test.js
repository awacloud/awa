// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// `createWorker(fn, { revoke, lockdown })`: the worker's own realm is
// confined before the user function runs. `revoke` removes ambient globals
// from every owner on the global's prototype chain (Chrome keeps `fetch` on
// `WorkerGlobalScope.prototype`, so deleting the global's own slot is not
// enough) and fails closed; `lockdown` makes the worker a module worker that
// imports `sanity/lockdown.js` and freezes the realm. Live Bun workers; the
// Chromium leg is recorded in the lane's evidence.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime, runtimeSource } from './runtime.js';
import { createWorkerRuntime } from './worker-helper.js';

const mathModule = {
    name: 'math',
    version: '1.0.0',
    dependencies: [],
    factory: function factory() { return { mul: function(a, b) { return a * b; } }; },
};

function build() {
    const rt = new ModuleRuntime();
    rt.register(mathModule);
    return createWorkerRuntime({ LOG: false, DEV: false }, rt, runtimeSource, { __push: () => {} }, function noop() {}.toString());
}

/** Spawn a worker, post `ping` at once, resolve its first reply (or its error). */
function run(workerFn, options) {
    return new Promise((resolve, reject) => {
        let w;
        const timer = setTimeout(() => { try { w.terminate(); } catch (_e) { /* gone */ } reject(new Error('timeout')); }, 5000);
        w = build()(workerFn, options);
        w.onmessage = (e) => { clearTimeout(timer); w.terminate(); resolve(e.data); };
        w.onerror = (e) => { clearTimeout(timer); try { w.terminate(); } catch (_e) { /* gone */ } e.preventDefault?.(); resolve({ error: String(e.message || e) }); };
        w.postMessage('ping');
    });
}

/** The user function: report the realm it meets, then answer the first message. */
function probe(ctx) {
    let ev = 'callable';
    try { eval('1'); } catch (_e) { ev = 'blocked'; }
    const report = {
        fetch: typeof fetch,
        eval: ev,
        frozen: Object.isFrozen(Object.prototype),
        math: ctx.libs.math.mul(6, 7),
    };
    self.onmessage = (m) => self.postMessage({ ...report, echo: m.data });
}

describe('createWorker confinement', () => {
    test('without options nothing changes', async () => {
        const r = await run(probe, { dependencies: ['math'] });
        expect(r).toEqual({ fetch: 'function', eval: 'callable', frozen: false, math: 42, echo: 'ping' });
    });

    test('revoke removes fetch before the user function', async () => {
        const r = await run(probe, { dependencies: ['math'], revoke: ['fetch'] });
        expect(r).toMatchObject({ fetch: 'undefined', eval: 'callable', math: 42, echo: 'ping' });
    });

    test('lockdown freezes the realm before the user function; a message posted at once arrives', async () => {
        const r = await run(probe, { dependencies: ['math'], lockdown: true });
        expect(r).toEqual({ fetch: 'function', eval: 'blocked', frozen: true, math: 42, echo: 'ping' });
    });

    test('both: revoked and locked', async () => {
        const r = await run(probe, { dependencies: ['math'], lockdown: true, revoke: ['fetch', 'XMLHttpRequest', 'WebSocket'] });
        expect(r).toMatchObject({ fetch: 'undefined', eval: 'blocked', frozen: true, math: 42 });
    });

    test('a name that cannot be removed fails closed in the worker', async () => {
        const r = await run(probe, { dependencies: ['math'], revoke: ['undefined'] });   // a non-configurable global
        expect(r.error).toContain('could not revoke');
    });

    test('options are validated on the main thread', () => {
        const cw = build();
        expect(() => cw(probe, { revoke: ['fetch', 'not an identifier'] })).toThrow(TypeError);
        expect(() => cw(probe, { revoke: 'fetch' })).toThrow(TypeError);
        expect(() => cw(probe, { lockdown: { url: 'sanity/lockdown.js' } })).toThrow(TypeError);
    });
});
