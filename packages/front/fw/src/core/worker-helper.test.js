// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/worker-helper.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

import { createWorkerRuntime } from './worker-helper.js';
import { ModuleRuntime, runtimeSource } from './runtime.js';

// ─── Mocks globaux (Blob / URL.createObjectURL / URL.revokeObjectURL / Worker) ─

const originals = {};

function installMocks() {
    const captured = {
        blobs: [],
        urls: [],
        revokedUrls: [],
        workers: [],
    };

    originals.Blob = globalThis.Blob;
    originals.createObjectURL = URL.createObjectURL;
    originals.revokeObjectURL = URL.revokeObjectURL;
    originals.Worker = globalThis.Worker;

    globalThis.Blob = class FakeBlob {
        constructor(parts, opts) {
            this.parts = parts;
            this.opts = opts;
            this.content = parts.join('');
            captured.blobs.push(this);
        }
    };

    let urlCounter = 0;
    URL.createObjectURL = function (blob) {
        const url = `blob:fake-${++urlCounter}`;
        captured.urls.push({ url, blob });
        return url;
    };
    URL.revokeObjectURL = function (url) {
        captured.revokedUrls.push(url);
    };

    globalThis.Worker = class FakeWorker {
        constructor(url) {
            this.url = url;
            this.terminated = false;
            this.listeners = new Map();
            this.terminate = () => { this.terminated = true; };
            captured.workers.push(this);
        }
        addEventListener(type, listener) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(listener);
        }
        removeEventListener(type, listener) {
            this.listeners.get(type)?.delete(listener);
        }
        // Test helper: triggers a synthetic message event.
        _fireMessage(data) {
            const ls = this.listeners.get('message');
            if (!ls) return;
            const event = {
                data,
                stoppedPropagation: false,
                stopImmediatePropagation() { event.stoppedPropagation = true; },
            };
            for (const l of ls) l(event);
            return event;
        }
    };

    return captured;
}

function restoreMocks() {
    if (originals.Blob !== undefined) globalThis.Blob = originals.Blob;
    if (originals.createObjectURL !== undefined) URL.createObjectURL = originals.createObjectURL;
    if (originals.revokeObjectURL !== undefined) URL.revokeObjectURL = originals.revokeObjectURL;
    if (originals.Worker !== undefined) globalThis.Worker = originals.Worker;
    Object.keys(originals).forEach((k) => delete originals[k]);
}

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeRuntime(...modules) {
    const rt = new ModuleRuntime();
    for (const m of modules) rt.register(m);
    return rt;
}

function buildEnv(overrides = {}) {
    return { LOG: false, DEV: false, ...overrides };
}

function makeLogStub() {
    const pushed = [];
    return { __push: (msg) => pushed.push(msg), pushed };
}

// `logFn` used when ENV.LOG=true. Minimal stub - will be stringified and inserted
// into worker code. Must be self-contained (no scope capture).
function logFnStub(dev, self) {
    self.__loggerInstalled = { dev };
}

describe('worker-helper - createWorkerRuntime', () => {
    let captured;

    beforeEach(() => { captured = installMocks(); });
    afterEach(restoreMocks);

    describe('signature & instanciation', () => {
        test('returns a `workerRuntime` function', () => {
            const rt = makeRuntime();
            const fn = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            expect(typeof fn).toBe('function');
        });

        test('workerRuntime() returns a Worker (FakeWorker in tests)', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            const w = workerRuntime(function () {});
            expect(w).toBeInstanceOf(globalThis.Worker);
            expect(captured.workers).toHaveLength(1);
            expect(captured.urls).toHaveLength(1);
            expect(w.url).toBe(captured.urls[0].url);
        });
    });

    describe('worker code generation', () => {
        function getCode(opts = {}, env = buildEnv()) {
            const rt = makeRuntime(
                { name: 'hex', version: '0.0.0', dependencies: [], factory: () => ({ kind: 'hex' }) },
                { name: 'utf8', version: '1.0.0', dependencies: [], factory: () => ({ kind: 'utf8' }) }
            );
            const workerRuntime = createWorkerRuntime(env, rt, runtimeSource, makeLogStub(), logFnStub.toString());
            workerRuntime(opts.workerFn ?? function () {}, opts.options);
            return captured.blobs.at(-1).content;
        }

        test('contains runtimeSource (helpers + class)', () => {
            const code = getCode();
            expect(code).toContain('class ModuleRuntime');
            expect(code).toContain('SEMVER_RE');
            expect(code).toContain('parseSpec');
            expect(code).toContain('canonical');
        });

        test('instantiates ModuleRuntime and registers serialized graph', () => {
            const code = getCode({
                options: { dependencies: ['hex'] },
            });
            expect(code).toContain('new ModuleRuntime()');
            expect(code).toContain('runtime.register(m)');
        });

        test('exposes original user specs (not canonical names)', () => {
            // Regression workerFw: libs must be keyed by 'hex', not 'hex@0.0.0'.
            const code = getCode({
                options: { dependencies: ['hex', 'utf8@1.0.0'] },
            });
            // The array passed to workerFw must be exact JSON of user specs.
            expect(code).toContain(JSON.stringify(['hex', 'utf8@1.0.0']));
        });

        test('args serialized to JSON', () => {
            const code = getCode({
                options: { dependencies: [], args: ['url', 42, { x: true }] },
            });
            expect(code).toContain(JSON.stringify(['url', 42, { x: true }]));
        });

        test('logger bootstrap absent when ENV.LOG=false', () => {
            const code = getCode({}, buildEnv({ LOG: false }));
            expect(code).not.toContain('__loggerInstalled');
        });

        test('logger bootstrap present when ENV.LOG=true', () => {
            const code = getCode({}, buildEnv({ LOG: true, DEV: true }));
            expect(code).toContain('__loggerInstalled');
        });
    });

    describe('worker code sandbox execution (round-trip without real Worker)', () => {
        // Evaluates the generated string in an isolated `new Function` to verify
        // that everything executes without ReferenceError and that workerFn receives
        // the correct `runtime.context`.

        function runInSandbox(code, selfMock = {}) {
            const fn = new Function('self', code);
            fn(selfMock);
            return selfMock;
        }

        test('default workerFw: libs keyed by user specs, args propagated', () => {
            const rt = makeRuntime(
                { name: 'hex', version: '0.0.0', dependencies: [], factory: () => ({ kind: 'hex' }) },
                { name: 'utf8', version: '1.0.0', dependencies: [], factory: () => ({ kind: 'utf8' }) }
            );
            const workerRuntime = createWorkerRuntime(
                buildEnv(),
                rt,
                runtimeSource,
                makeLogStub(),
                logFnStub.toString()
            );

            // workerFn must be self-contained (no closure).
            const workerFn = function (ctx) {
                self.__capture = {
                    libsKeys: Object.keys(ctx.libs).sort(),
                    hexKind: ctx.libs.hex && ctx.libs.hex.kind,
                    utf8Kind: ctx.libs['utf8@1.0.0'] && ctx.libs['utf8@1.0.0'].kind,
                    args: ctx.args,
                    hasProcess: typeof ctx.process === 'object',
                };
            };

            workerRuntime(workerFn, {
                dependencies: ['hex', 'utf8@1.0.0'],
                args: ['hello', 42],
            });

            const code = captured.blobs.at(-1).content;
            const selfMock = runInSandbox(code);

            expect(selfMock.__capture.libsKeys).toEqual(['hex', 'utf8@1.0.0']);
            expect(selfMock.__capture.hexKind).toBe('hex');
            expect(selfMock.__capture.utf8Kind).toBe('utf8');
            expect(selfMock.__capture.args).toEqual(['hello', 42]);
            expect(selfMock.__capture.hasProcess).toBe(true);
            // Safeguard against regression - no canonicalized keys.
            expect(selfMock.__capture.libsKeys).not.toContain('hex@0.0.0');
        });

        test('custom workerFw replaces default resolution', () => {
            const rt = makeRuntime(
                { name: 'hex', version: '0.0.0', dependencies: [], factory: () => ({ kind: 'hex' }) }
            );
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());

            const customWorkerFw = function (runtime, modules, args) {
                return { custom: true, count: modules.length, firstArg: args[0] };
            };
            const workerFn = function (ctx) {
                self.__capture = ctx;
            };

            workerRuntime(workerFn, {
                dependencies: ['hex'],
                workerFw: customWorkerFw,
                args: ['ARG'],
            });

            const code = captured.blobs.at(-1).content;
            const selfMock = runInSandbox(code);
            expect(selfMock.__capture).toEqual({ custom: true, count: 1, firstArg: 'ARG' });
        });

        test('no dependencies → empty libs', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            workerRuntime(function (ctx) {
                self.__capture = Object.keys(ctx.libs);
            });
            const code = captured.blobs.at(-1).content;
            const selfMock = runInSandbox(code);
            expect(selfMock.__capture).toEqual([]);
        });

        test('ENV.LOG=true executes logFn with self', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(
                buildEnv({ LOG: true, DEV: true }),
                rt,
                runtimeSource,
                makeLogStub(),
                logFnStub.toString()
            );
            workerRuntime(function () {});
            const code = captured.blobs.at(-1).content;
            const selfMock = runInSandbox(code);
            expect(selfMock.__loggerInstalled).toEqual({ dev: true });
        });
    });

    describe('options.dependencies - validation defensive', () => {
        function getCallArgs(opts) {
            const rt = makeRuntime(
                { name: 'hex', version: '0.0.0', dependencies: [], factory: () => null }
            );
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            workerRuntime(function () {}, opts);
            return captured.blobs.at(-1).content;
        }

        test('non-object options → defaults', () => {
            const code = getCallArgs(null);
            // No throw, generated code valid (default resolution = no modules).
            expect(code).toContain('new ModuleRuntime()');
        });

        test('non-array dependencies → fallback []', () => {
            const code = getCallArgs({ dependencies: 'not-an-array' });
            expect(code).toContain(JSON.stringify([])); // exposed specs
        });

        test('non-array args → fallback []', () => {
            const code = getCallArgs({ dependencies: [], args: 'oops' });
            expect(code).toContain('[]');
        });

        test('non-function terminate → fallback no-op (no throw)', () => {
            expect(() => getCallArgs({ dependencies: [], terminate: 'oops' })).not.toThrow();
        });
    });

    describe('terminate() patched - cleanup', () => {
        test('revokeObjectURL called', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            const w = workerRuntime(function () {});
            const blobUrl = w.url;
            w.terminate();
            expect(captured.revokedUrls).toContain(blobUrl);
        });

        test('options.terminate callback called', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            let userTerminateCalls = 0;
            const w = workerRuntime(function () {}, {
                terminate: () => { userTerminateCalls++; },
            });
            w.terminate();
            expect(userTerminateCalls).toBe(1);
        });

        test('native worker.terminate called after cleanup', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            const w = workerRuntime(function () {});
            w.terminate();
            expect(w.terminated).toBe(true);
        });

        test('idempotent - second call does not reinvoke cleanup', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            let userTerminateCalls = 0;
            const w = workerRuntime(function () {}, {
                terminate: () => { userTerminateCalls++; },
            });
            w.terminate();
            w.terminate();
            w.terminate();
            expect(userTerminateCalls).toBe(1);
            // revokeObjectURL called ONCE only (first terminate).
            const revokeCount = captured.revokedUrls.filter((u) => u === w.url).length;
            expect(revokeCount).toBe(1);
        });

        test('message listener removed at cleanup', () => {
            const rt = makeRuntime();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
            const w = workerRuntime(function () {});
            expect(w.listeners.get('message')?.size ?? 0).toBe(1);
            w.terminate();
            expect(w.listeners.get('message')?.size ?? 0).toBe(0);
        });
    });

    describe('cleanup on new Worker(...) failure', () => {
        test('URL revoked before rethrow if Worker constructor throws', () => {
            // Replace Worker with a constructor that throws.
            const original = globalThis.Worker;
            globalThis.Worker = class FailingWorker {
                constructor() { throw new Error('cannot create worker'); }
            };
            try {
                const rt = makeRuntime();
                const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, makeLogStub(), logFnStub.toString());
                expect(() => workerRuntime(function () {})).toThrow('cannot create worker');
                // The Blob URL was created then immediately revoked.
                expect(captured.urls).toHaveLength(1);
                expect(captured.revokedUrls).toContain(captured.urls[0].url);
            } finally {
                globalThis.Worker = original;
            }
        });
    });

    describe('handler des messages framework (__fw)', () => {
        test('__fw=true → stopImmediatePropagation triggered', () => {
            const rt = makeRuntime();
            const log = makeLogStub();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, log, logFnStub.toString());
            const w = workerRuntime(function () {});
            const ev = w._fireMessage({ __fw: true, __type: 'log', msg: 'hello' });
            expect(ev.stoppedPropagation).toBe(true);
        });

        test('user messages (not __fw) do not trigger stopImmediatePropagation', () => {
            const rt = makeRuntime();
            const log = makeLogStub();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, log, logFnStub.toString());
            const w = workerRuntime(function () {});
            const ev = w._fireMessage({ kind: 'user', value: 42 });
            expect(ev.stoppedPropagation).toBe(false);
        });

        test('ENV.LOG=true: __fw __type=log pushed to main-thread log', () => {
            const rt = makeRuntime();
            const log = makeLogStub();
            const workerRuntime = createWorkerRuntime(
                buildEnv({ LOG: true, DEV: false }),
                rt,
                runtimeSource,
                log,
                logFnStub.toString()
            );
            const w = workerRuntime(function () {});
            w._fireMessage({ __fw: true, __type: 'log', msg: { level: 'info', text: 'hi' } });
            expect(log.pushed).toEqual([{ level: 'info', text: 'hi' }]);
        });

        test('ENV.LOG=true: __fw __type !== log is not pushed', () => {
            const rt = makeRuntime();
            const log = makeLogStub();
            const workerRuntime = createWorkerRuntime(
                buildEnv({ LOG: true }),
                rt,
                runtimeSource,
                log,
                logFnStub.toString()
            );
            const w = workerRuntime(function () {});
            w._fireMessage({ __fw: true, __type: 'metric', value: 99 });
            expect(log.pushed).toEqual([]);
        });

        test('ENV.LOG=false: __fw messages stopped but not pushed', () => {
            const rt = makeRuntime();
            const log = makeLogStub();
            const workerRuntime = createWorkerRuntime(
                buildEnv({ LOG: false }),
                rt,
                runtimeSource,
                log,
                logFnStub.toString()
            );
            const w = workerRuntime(function () {});
            const ev = w._fireMessage({ __fw: true, __type: 'log', msg: 'ignored' });
            expect(ev.stoppedPropagation).toBe(true);
            expect(log.pushed).toEqual([]);
        });

        test('falsy or non-object data is not considered __fw', () => {
            const rt = makeRuntime();
            const log = makeLogStub();
            const workerRuntime = createWorkerRuntime(buildEnv(), rt, runtimeSource, log, logFnStub.toString());
            const w = workerRuntime(function () {});
            for (const data of [null, undefined, 0, '', false]) {
                const ev = w._fireMessage(data);
                expect(ev.stoppedPropagation).toBe(false);
            }
        });
    });
});
