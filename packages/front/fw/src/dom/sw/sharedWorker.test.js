// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { sharedWorker } from './sharedWorker.js';

// ── Stubs ──────────────────────────────────────────────────────────────────

/** Port stub minimal (interface MessagePort). */
class StubPort {
    constructor() {
        this._started   = false;
        this._closed    = false;
        this._messages  = [];
        this.onmessage      = null;
        this.onmessageerror = null;
        this._listeners = {};
    }
    start()             { this._started = true; }
    close()             { this._closed  = true; }
    postMessage(data)   { this._messages.push(data); }
    addEventListener(type, fn) {
        (this._listeners[type] ??= []).push(fn);
    }
}

/** Worker stub minimal. */
class StubSharedWorker {
    constructor(url, opts) {
        this._url  = url;
        this._opts = opts;
        this.port  = new StubPort();
        this.onerror = null;
    }
}

/** Stub processRPC minimal (bidirectionnel synchrone). */
function makeProcessRPCStub() {
    return {
        create(api) {
            const ports = [new StubPort()];
            return {
                port: ports,
                close: () => {},
            };
        },
        open(port) {
            // Returns a resolved Promise toward a simple object that calls the local api.
            // For tests, we expose an object with the foo method.
            const remoteApi = {
                foo: (...args) => Promise.resolve(args[0] !== undefined ? args[0] + 1 : undefined),
            };
            return Promise.resolve(remoteApi);
        },
    };
}

// ── Setup / teardown ───────────────────────────────────────────────────────

let originalSharedWorker;

beforeEach(() => {
    originalSharedWorker = globalThis.SharedWorker;
    globalThis.SharedWorker = StubSharedWorker;
});

afterEach(() => {
    if (originalSharedWorker === undefined) {
        delete globalThis.SharedWorker;
    } else {
        globalThis.SharedWorker = originalSharedWorker;
    }
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('sharedWorker module', () => {

    test('metadata: name, version, type, dependencies, factory', () => {
        expect(sharedWorker.name).toBe('sharedWorker');
        expect(sharedWorker.version).toBe('1.0.0');
        expect(sharedWorker.type).toBe('fw.dom.sw');
        expect(sharedWorker.dependencies).toEqual(['processRPC']);
        expect(typeof sharedWorker.factory).toBe('function');
    });

    describe('factory', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('returns object with expected API', () => {
            expect(typeof inst.create).toBe('function');
            expect(typeof inst.support).toBe('function');
        });
    });

    describe('support', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('returns { available: true, sharedWorker: true } when stub present', () => {
            const result = inst.support();
            expect(result).toEqual({ available: true, sharedWorker: true });
        });

        test('returns { available: false, sharedWorker: false } when SharedWorker absent', () => {
            delete globalThis.SharedWorker;
            const result = inst.support();
            expect(result).toEqual({ available: false, sharedWorker: false });
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('returns handle with expected API', () => {
            const handle = inst.create({ url: '/worker.js' });
            expect(typeof handle.port).toBe('function');
            expect(typeof handle.rpc).toBe('function');
            expect(typeof handle.online).toBe('function');
            expect(typeof handle.onError).toBe('function');
            expect(typeof handle.close).toBe('function');
        });

        test('port() returns the stub port', () => {
            const handle = inst.create({ url: '/worker.js' });
            expect(handle.port()).toBeInstanceOf(StubPort);
        });

        test('port.start() is called automatically', () => {
            const handle = inst.create({ url: '/worker.js' });
            expect(handle.port()._started).toBe(true);
        });

        test('online() returns true initially', () => {
            const handle = inst.create({ url: '/worker.js' });
            expect(handle.online()).toBe(true);
        });

        test('close() closes the port', () => {
            const handle = inst.create({ url: '/worker.js' });
            handle.close();
            expect(handle.port()._closed).toBe(true);
            expect(handle.online()).toBe(false);
        });

        test('throws SharedWorkerNotSupported when API absent', () => {
            delete globalThis.SharedWorker;
            expect(() => inst.create({ url: '/worker.js' })).toThrow('SharedWorker is not supported');
        });

        test('thrown error has name SharedWorkerNotSupported', () => {
            delete globalThis.SharedWorker;
            let err;
            try { inst.create({ url: '/worker.js' }); } catch (e) { err = e; }
            expect(err.name).toBe('SharedWorkerNotSupported');
        });
    });

    describe('rpc', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('rpc() returns { call, expose }', () => {
            const handle = inst.create({ url: '/worker.js' });
            const result = handle.rpc({ foo: (x) => x + 1 });
            expect(result).toHaveProperty('call');
            expect(result).toHaveProperty('expose');
        });

        test('rpc call resolves to proxy, call.foo(2) resolves to 3 via stub', async () => {
            const handle = inst.create({ url: '/worker.js' });
            const { call } = handle.rpc({ foo: (x) => x + 1 });
            // call est une Promise<Proxy> - le stub retourne un proxy qui fait args[0]+1
            const proxy = await call;
            const result = await proxy.foo(2);
            expect(result).toBe(3);
        });
    });

    describe('onError', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('onError handler is called when worker fires onerror', () => {
            const errors = [];
            // Remplacer StubSharedWorker par une version qui stocke le onerror
            let capturedWorker;
            const PatchedWorker = class extends StubSharedWorker {
                constructor(...args) {
                    super(...args);
                    capturedWorker = this;
                }
            };
            globalThis.SharedWorker = PatchedWorker;

            const handle = inst.create({ url: '/worker.js' });
            handle.onError((e) => errors.push(e));

            // Simuler une erreur worker
            capturedWorker.onerror({ type: 'error', message: 'fail' });
            expect(errors).toHaveLength(1);
        });

        test('onError handler is called on port.onmessageerror', () => {
            const errors = [];
            const handle = inst.create({ url: '/worker.js' });
            handle.onError((e) => errors.push(e));

            // Simuler une erreur de message
            handle.port().onmessageerror({ type: 'messageerror' });
            expect(errors).toHaveLength(1);
        });
    });

    describe('support fallback - no SharedWorker', () => {
        test('support().sharedWorker === false when stub removed', () => {
            delete globalThis.SharedWorker;
            const inst2 = sharedWorker.factory(makeProcessRPCStub());
            expect(inst2.support().sharedWorker).toBe(false);
            expect(inst2.support().available).toBe(false);
        });
    });

    describe('onError disposer', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('disposer returned by onError removes the handler', () => {
            const errors = [];
            const handle = inst.create({ url: '/worker.js' });
            const dispose = inst === null ? null : handle.onError((e) => errors.push(e));

            // fire once with handler attached
            handle.port().onmessageerror({ type: 'messageerror' });
            expect(errors).toHaveLength(1);

            // detach
            dispose();
            handle.port().onmessageerror({ type: 'messageerror' });
            expect(errors).toHaveLength(1); // unchanged
        });
    });

    describe('close() lifecycle', () => {
        let inst;
        beforeEach(() => {
            inst = sharedWorker.factory(makeProcessRPCStub());
        });

        test('close() clears handlers and is idempotent', () => {
            const errors = [];
            const handle = inst.create({ url: '/worker.js' });
            handle.onError((e) => errors.push(e));

            handle.close();
            expect(handle.online()).toBe(false);
            expect(handle.port()._closed).toBe(true);

            // After close, port.onmessageerror was nulled out.
            expect(handle.port().onmessageerror).toBeNull();

            // calling close again is a no-op
            handle.close();
            expect(handle.port()._closed).toBe(true);
        });
    });
});
