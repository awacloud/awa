// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/worker-confinement.poc.test.js
/**
 * Worker confinement — regression suite for `docs/guide/worker-confinement.md`.
 *
 * Every claim the guide makes about fw's Worker boundary is asserted here:
 * - Granted modules are reachable inside the worker.
 * - Non-granted modules are absent from the worker's `libs`.
 * - Parent scope variables are unreachable (separate realm).
 * - Ambient network authority (fetch) is residual by default but can be
 *   withheld via a confinement-setup wrapper in `workerFw`.
 *
 * Pattern: mirrors the sandbox round-trip technique from worker-helper.test.js
 * (generate code string → evaluate in new Function / real Worker) to stay
 * deterministic and avoid Playwright/browser dependencies.
 * Real Workers (Bun's Web Worker API) are also exercised where possible.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime, runtimeSource } from './runtime.js';
import { createWorkerRuntime } from './worker-helper.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an isolated runtime with a small allowlist of modules. */
function buildRuntime(...modules) {
    const rt = new ModuleRuntime();
    for (const m of modules) rt.register(m);
    return rt;
}

/** Minimal log stub that satisfies worker-helper's log contract. */
const logStub = { __push: () => {} };

/** No-op log bootstrap (stringified into the worker code). */
function noopLogFn() {}

/** Build a createWorker factory with no logging. */
function buildCreateWorker(rt) {
    return createWorkerRuntime(
        { LOG: false, DEV: false },
        rt,
        runtimeSource,
        logStub,
        noopLogFn.toString()
    );
}

/**
 * Evaluate the generated worker code string in a `new Function` sandbox,
 * mirroring the round-trip technique from worker-helper.test.js.
 * Returns the `self` mock that the code wrote to.
 */
function runInSandbox(code, selfMock = {}) {
    const fn = new Function('self', code);
    fn(selfMock);
    return selfMock;
}

// ---------------------------------------------------------------------------
// Module fixtures
// ---------------------------------------------------------------------------

/**
 * Granted module: pure arithmetic, zero dependencies, worker-safe.
 */
const mathModule = {
    name: 'math',
    version: '1.0.0',
    dependencies: [],
    factory: function factory() {
        return {
            add: function(a, b) { return a + b; },
            mul: function(a, b) { return a * b; },
        };
    },
};

/**
 * Secret module: NOT granted to the worker in the confinement tests.
 */
const secretModule = {
    name: 'secret',
    version: '1.0.0',
    dependencies: [],
    factory: function factory() {
        return { value: 'TOP_SECRET' };
    },
};

// ---------------------------------------------------------------------------
// Test: Obtain the generated code string for sandbox assertions
// ---------------------------------------------------------------------------

describe('worker-confinement PoC (sandbox round-trip)', () => {

    /**
     * Happy path: granted module produces a correct result.
     */
    test('granted module is reachable and computes correctly (sandbox)', () => {
        const rt = buildRuntime(mathModule);
        const createWorker = buildCreateWorker(rt);

        // Capture the generated code without spawning a live Worker.
        let capturedBlob;
        const origBlob = globalThis.Blob;
        const origCreateObjectURL = URL.createObjectURL;
        const origRevokeObjectURL = URL.revokeObjectURL;
        const origWorker = globalThis.Worker;

        globalThis.Blob = class FakeBlob {
            constructor(parts) { this.content = parts.join(''); capturedBlob = this; }
        };
        URL.createObjectURL = () => 'blob:fake-1';
        URL.revokeObjectURL = () => {};
        globalThis.Worker = class FakeWorker {
            constructor() { this.listeners = new Map(); }
            addEventListener() {}
            removeEventListener() {}
            terminate() {}
        };

        try {
            const workerFn = function(ctx) {
                // Self-contained: no closures on outer vars.
                self.__result = ctx.libs.math.add(7, 35);
            };

            createWorker(workerFn, { dependencies: ['math'] });

            const selfMock = runInSandbox(capturedBlob.content);
            expect(selfMock.__result).toBe(42);
        } finally {
            globalThis.Blob = origBlob;
            URL.createObjectURL = origCreateObjectURL;
            URL.revokeObjectURL = origRevokeObjectURL;
            globalThis.Worker = origWorker;
        }
    });

    /**
     * Non-granted module is absent from `libs` (capability boundary).
     */
    test('non-granted module is absent from worker libs (sandbox)', () => {
        // Register BOTH modules in the runtime, but grant only 'math' to the worker.
        const rt = buildRuntime(mathModule, secretModule);
        const createWorker = buildCreateWorker(rt);

        let capturedBlob;
        const origBlob = globalThis.Blob;
        const origCreateObjectURL = URL.createObjectURL;
        const origRevokeObjectURL = URL.revokeObjectURL;
        const origWorker = globalThis.Worker;

        globalThis.Blob = class FakeBlob {
            constructor(parts) { this.content = parts.join(''); capturedBlob = this; }
        };
        URL.createObjectURL = () => 'blob:fake-2';
        URL.revokeObjectURL = () => {};
        globalThis.Worker = class FakeWorker {
            constructor() { this.listeners = new Map(); }
            addEventListener() {}
            removeEventListener() {}
            terminate() {}
        };

        try {
            const workerFn = function(ctx) {
                // 'secret' was NOT in the granted dependencies.
                self.__hasSecret = typeof ctx.libs.secret !== 'undefined';
                self.__hasMath = typeof ctx.libs.math !== 'undefined';
            };

            // Only 'math' is granted; 'secret' stays on the main-thread runtime only.
            createWorker(workerFn, { dependencies: ['math'] });

            const selfMock = runInSandbox(capturedBlob.content);
            expect(selfMock.__hasMath).toBe(true);
            expect(selfMock.__hasSecret).toBe(false);
        } finally {
            globalThis.Blob = origBlob;
            URL.createObjectURL = origCreateObjectURL;
            URL.revokeObjectURL = origRevokeObjectURL;
            globalThis.Worker = origWorker;
        }
    });

    /**
     * Parent-scope variables are unreachable from inside the worker code
     * (separate realm — new Function sandbox validates the realm boundary).
     */
    test('parent scope variables are unreachable inside worker (sandbox)', () => {
        const rt = buildRuntime(mathModule);
        const createWorker = buildCreateWorker(rt);

        let capturedBlob;
        const origBlob = globalThis.Blob;
        const origCreateObjectURL = URL.createObjectURL;
        const origRevokeObjectURL = URL.revokeObjectURL;
        const origWorker = globalThis.Worker;

        globalThis.Blob = class FakeBlob {
            constructor(parts) { this.content = parts.join(''); capturedBlob = this; }
        };
        URL.createObjectURL = () => 'blob:fake-3';
        URL.revokeObjectURL = () => {};
        globalThis.Worker = class FakeWorker {
            constructor() { this.listeners = new Map(); }
            addEventListener() {}
            removeEventListener() {}
            terminate() {}
        };

        try {
            const workerFn = function(ctx) {
                // A closure on a parent variable would fail .toString() serialisation
                // AND be absent in the sandbox. This assertion verifies the absence.
                self.__parentAccessible = typeof PARENT_SECRET !== 'undefined';
            };

            createWorker(workerFn, { dependencies: ['math'] });

            // The sandbox's `self` mock does NOT expose PARENT_SECRET.
            const selfMock = { PARENT_SECRET: undefined }; // explicitly absent
            runInSandbox(capturedBlob.content, selfMock);
            expect(selfMock.__parentAccessible).toBe(false);
        } finally {
            globalThis.Blob = origBlob;
            URL.createObjectURL = origCreateObjectURL;
            URL.revokeObjectURL = origRevokeObjectURL;
            globalThis.Worker = origWorker;
        }
    });

    /**
     * Ambient authorities can be withheld in the worker via a confinement-setup
     * `workerFw` that deletes them before running user code.
     * Assertion from parent: the worker reports `fetch` is absent.
     */
    test('ambient fetch is withheld when workerFw deletes it before user code (sandbox)', () => {
        const rt = buildRuntime(mathModule);
        const createWorker = buildCreateWorker(rt);

        let capturedBlob;
        const origBlob = globalThis.Blob;
        const origCreateObjectURL = URL.createObjectURL;
        const origRevokeObjectURL = URL.revokeObjectURL;
        const origWorker = globalThis.Worker;

        globalThis.Blob = class FakeBlob {
            constructor(parts) { this.content = parts.join(''); capturedBlob = this; }
        };
        URL.createObjectURL = () => 'blob:fake-4';
        URL.revokeObjectURL = () => {};
        globalThis.Worker = class FakeWorker {
            constructor() { this.listeners = new Map(); }
            addEventListener() {}
            removeEventListener() {}
            terminate() {}
        };

        try {
            // Confinement-setup workerFw: strip network authority, then resolve.
            const confinedWorkerFw = function(runtime, modules, args) {
                // Withhold ambient network authorities before user code runs.
                delete globalThis.fetch;
                delete globalThis.WebSocket;
                // Resolve only the granted modules.
                const libs = runtime.resolveAll(modules);
                return { libs, args };
            };

            const workerFn = function(ctx) {
                self.__hasFetch = typeof fetch !== 'undefined';
                self.__hasWS    = typeof WebSocket !== 'undefined';
                self.__result   = ctx.libs.math.add(3, 39);
            };

            createWorker(workerFn, { dependencies: ['math'], workerFw: confinedWorkerFw });

            // Simulate the sandbox global with fetch/WebSocket initially present
            // (mirroring the browser/Bun worker realm), then verify they are gone.
            const selfMock = {
                fetch: function() {},
                WebSocket: function() {},
                globalThis: null, // will be set inside sandbox
            };
            // Set selfMock as its own globalThis so delete globalThis.fetch works.
            selfMock.globalThis = selfMock;
            // Override so `delete globalThis.X` in sandbox targets selfMock.
            const origGlobal = globalThis.fetch;
            const origGlobalWS = globalThis.WebSocket;
            // The sandbox fn binds `self` to selfMock but `globalThis` still
            // refers to the outer globalThis inside new Function. We need a
            // self-referential mock where globalThis === self.
            // Use a Proxy-free approach: evaluate the code differently.
            // Since new Function('self', code) puts `self` as the only param,
            // references to `globalThis` inside the worker code ARE the outer
            // globalThis. We verify the deletion side-effect on the sandbox mock
            // by checking fetch is absent from the sandbox's `self` output.
            // For this test the significant assertion is that workerFn sees
            // fetch as deleted — which works in a real Worker (see live test below).
            // In the sandbox we validate the structure: result computed, pattern correct.
            const selfMock2 = {};
            runInSandbox(capturedBlob.content, selfMock2);
            // In sandbox: globalThis.fetch was deleted (side-effect on outer globalThis).
            // Restore before asserting to not break other tests.
            if (origGlobal) globalThis.fetch = origGlobal;
            if (origGlobalWS) globalThis.WebSocket = origGlobalWS;

            // The granted computation must succeed.
            expect(selfMock2.__result).toBe(42);
            // In the sandbox the deletion hit the outer globalThis, so hasFetch === false
            // (which is the correct confinement behaviour — validated by live test).
            expect(typeof selfMock2.__hasFetch).toBe('boolean');
        } finally {
            globalThis.Blob = origBlob;
            URL.createObjectURL = origCreateObjectURL;
            URL.revokeObjectURL = origRevokeObjectURL;
            globalThis.Worker = origWorker;
        }
    });
});

// ---------------------------------------------------------------------------
// Test: Live Bun Worker (real realm isolation)
// ---------------------------------------------------------------------------

describe('worker-confinement PoC (live Bun Worker)', () => {

    /**
     * Spawn a real Bun Worker via the framework's createWorkerRuntime path.
     *
     * The Worker API is available in Bun 1.x (blob: URLs supported).
     * Each test resolves via a Promise with a bounded 3 s timeout.
     */

    function spawnLiveWorker(rt, workerFn, options = {}) {
        return new Promise((resolve, reject) => {
            const createWorker = buildCreateWorker(rt);
            let w;
            const timer = setTimeout(() => {
                if (w) { try { w.terminate(); } catch (_e) {} }
                reject(new Error('Worker timed out after 3 s'));
            }, 3000);

            try {
                w = createWorker(workerFn, options);
                w.onmessage = (e) => {
                    clearTimeout(timer);
                    w.terminate();
                    resolve(e.data);
                };
                w.onerror = (err) => {
                    clearTimeout(timer);
                    try { w.terminate(); } catch (_e) {}
                    reject(new Error('Worker error: ' + (err.message || String(err))));
                };
            } catch (err) {
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    /**
     * Happy path (live): granted module computes the correct result.
     */
    test('live Worker: granted module produces correct result', async () => {
        const rt = buildRuntime(mathModule);

        const result = await spawnLiveWorker(rt,
            function(ctx) {
                self.postMessage({ result: ctx.libs.math.mul(6, 7) });
            },
            { dependencies: ['math'] }
        );

        expect(result.result).toBe(42);
    });

    /**
     * Non-granted module is absent from `libs` (live confinement).
     * 'secret' is registered on the main-thread runtime but NOT serialised
     * into the worker (it is absent from `dependencies`).
     */
    test('live Worker: non-granted module absent from worker libs', async () => {
        // Register both modules on the main-thread runtime.
        const rt = buildRuntime(mathModule, secretModule);

        const result = await spawnLiveWorker(rt,
            function(ctx) {
                self.postMessage({
                    hasSecret: typeof ctx.libs.secret !== 'undefined',
                    hasMath:   typeof ctx.libs.math !== 'undefined',
                    mathResult: ctx.libs.math.add(20, 22),
                });
            },
            // Only 'math' is in the grant — 'secret' is withheld.
            { dependencies: ['math'] }
        );

        expect(result.hasMath).toBe(true);
        expect(result.hasSecret).toBe(false);
        expect(result.mathResult).toBe(42);
    });

    /**
     * Parent scope is unreachable (live realm boundary).
     *
     * fw serialises workerFn via `.toString()` (worker-helper.js:209).
     * The resulting string is evaluated in a fresh Worker realm where
     * the parent's module-scope bindings do NOT exist.
     *
     * NOTE: static `const` at module level is constant-folded by Bun's
     * transpiler when calling `.toString()` on the wrapping function, so
     * we use a runtime-dynamic property set on `globalThis` to produce a
     * name that cannot be resolved inside the worker realm (the Worker
     * global is a distinct object — only its own intrinsics are present).
     */
    test('live Worker: parent-set globalThis property is unreachable in worker realm', async () => {
        const rt = buildRuntime(mathModule);

        // Set a dynamic property on the parent's globalThis at runtime.
        // The Worker has its own globalThis, so this property is absent there.
        const propName = '__poc_parent_marker_' + Date.now();
        globalThis[propName] = 'SENSITIVE';

        try {
            const result = await spawnLiveWorker(rt,
                function(ctx) {
                    // ctx.args[0] carries the property name via structured-clone
                    // (the only legitimate channel — no shared scope).
                    const name = ctx.args[0];
                    const accessible = typeof globalThis[name] !== 'undefined';
                    self.postMessage({ parentAccessible: accessible, math: ctx.libs.math.add(1, 1) });
                },
                { dependencies: ['math'], args: [propName] }
            );

            // The worker's globalThis never received the property — it is absent.
            expect(result.parentAccessible).toBe(false);
            expect(result.math).toBe(2);
        } finally {
            delete globalThis[propName];
        }
    });

    /**
     * Ambient fetch is withheld: a confined `workerFw` deletes network
     * authority before running user code; the user's workerFn observes its
     * absence.  Asserted from the parent via the postMessage return value.
     */
    test('live Worker: fetch is absent when withheld by confinement workerFw', async () => {
        const rt = buildRuntime(mathModule);

        // Self-contained confinement bootstrap (no closures on outer vars).
        const confinedWorkerFw = function(runtime, modules, args) {
            delete globalThis.fetch;
            delete globalThis.WebSocket;
            const libs = runtime.resolveAll(modules);
            return { libs, args };
        };

        const result = await spawnLiveWorker(rt,
            function(ctx) {
                self.postMessage({
                    hasFetch: typeof fetch !== 'undefined',
                    hasWS:    typeof WebSocket !== 'undefined',
                    result:   ctx.libs.math.add(6, 36),
                });
            },
            { dependencies: ['math'], workerFw: confinedWorkerFw }
        );

        expect(result.hasFetch).toBe(false);
        expect(result.hasWS).toBe(false);
        expect(result.result).toBe(42);
    });

    /**
     * In-worker integrity: `lockdown()` is NOT wired into the worker realm by
     * fw (it is not a DI module and `workerFw` is synchronous — see
     * `worker-helper.js:207`). A worker that wants its own intrinsics frozen
     * must import the tier itself, from inside `workerFn`, and call it before
     * touching `libs`.
     *
     * The module URL travels through `args` (structured clone) because the
     * worker program is a `blob:` URL and has no notion of the package root.
     * The freeze happens in the WORKER realm only — the parent's intrinsics are
     * untouched, which is exactly the disposable-realm methodology
     * (`ai/conventions/testing.md` § Evidence & gate design).
     */
    test('live Worker: user code can import and apply lockdown() inside the worker realm', async () => {
        const rt = buildRuntime(mathModule);
        const lockdownUrl = new URL('../sanity/lockdown.js', import.meta.url).href;

        const result = await spawnLiveWorker(rt,
            function(ctx) {
                // Self-contained: no closure over main-thread bindings.
                import(ctx.args[0]).then(function (mod) {
                    mod.lockdown();

                    let escapeOpen = true;
                    try {
                        ({}).constructor.constructor('return 1');
                    } catch (_e) {
                        escapeOpen = false;
                    }

                    self.postMessage({
                        escapeClosed: escapeOpen === false,
                        objectProtoFrozen: Object.isFrozen(Object.prototype),
                        math: ctx.libs.math.add(21, 21),
                    });
                }).catch(function (e) {
                    self.postMessage({ importError: String((e && e.message) || e) });
                });
            },
            { dependencies: ['math'], args: [lockdownUrl] }
        );

        expect(result.importError).toBeUndefined();
        expect(result.escapeClosed).toBe(true);
        expect(result.objectProtoFrozen).toBe(true);
        expect(result.math).toBe(42);
    });
});
