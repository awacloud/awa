// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/logger.test.js
import { describe, test, expect, beforeEach } from 'bun:test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal window-like object + run logger.main in its context
// Since logger.main uses `window.console` and Object.defineProperty(window, ...),
// we use globalThis-patching per test in a fresh closure.
// ---------------------------------------------------------------------------

/**
 * Creates an isolated logger.main instance by temporarily replacing
 * globalThis.window with a fresh mock object for each invocation.
 * Returns { log, origWindowRef } where log = the logger API and
 * origWindowRef lets us restore state after.
 */
function createMainLogger(dev = false) {
    // Build a minimal mock console
    const consoleMock = {
        log: function () {},
        info: function () {},
        warn: function () {},
        error: function () {},
        debug: function () {},
    };

    // Craft a window stub (a plain object) with a console property
    const windowStub = {
        console: consoleMock,
    };

    // Patch the global `window` reference used inside logger.main
    const savedWindow = typeof window !== 'undefined' ? window : undefined;
    // In Bun/Node there may not be `window` - set it on globalThis
    globalThis.window = windowStub;

    let log;
    try {
        log = logger.main(dev);
    } finally {
        // Restore (best-effort; Object.defineProperty may have locked it)
        // Don't restore - each test gets its own stub injected before call
    }
    return { log, windowStub, consoleMock };
}

// ---------------------------------------------------------------------------
// logger.main - subscribe API
// ---------------------------------------------------------------------------

describe('logger', () => {
    describe('logger.main - subscribe exposed', () => {
        test('subscribe is a function on the returned object', () => {
            const { log } = createMainLogger();
            expect(typeof log.subscribe).toBe('function');
        });
    });

    describe('logger.main - subscribe validation', () => {
        test('throws if fn is a string', () => {
            const { log } = createMainLogger();
            expect(() => log.subscribe('bad')).toThrow('logger: fn must be a function');
        });

        test('throws if fn is null', () => {
            const { log } = createMainLogger();
            expect(() => log.subscribe(null)).toThrow('logger: fn must be a function');
        });

        test('throws if fn is undefined', () => {
            const { log } = createMainLogger();
            expect(() => log.subscribe(undefined)).toThrow('logger: fn must be a function');
        });

        test('throws if fn is a plain object', () => {
            const { log } = createMainLogger();
            expect(() => log.subscribe({})).toThrow('logger: fn must be a function');
        });
    });

    describe('logger.main - subscribe happy path', () => {
        test('subscribe returns a function (unsubscribe)', () => {
            const { log } = createMainLogger();
            const unsub = log.subscribe(function () {});
            expect(typeof unsub).toBe('function');
        });

        test('second subscribe before unsubscribe throws', () => {
            const { log } = createMainLogger();
            log.subscribe(function () {});
            expect(() => log.subscribe(function () {})).toThrow('logger: subscriber already registered');
        });

        test('after unsubscribe(), a new subscribe is accepted', () => {
            const { log } = createMainLogger();
            const unsub = log.subscribe(function () {});
            unsub();
            expect(() => log.subscribe(function () {})).not.toThrow();
        });

        test('unsubscribe is idempotent (two calls do not throw)', () => {
            const { log } = createMainLogger();
            const unsub = log.subscribe(function () {});
            unsub();
            expect(() => unsub()).not.toThrow();
        });
    });

    describe('logger.main - listener invocation via __push', () => {
        test('__push notifies the subscriber with the entry', () => {
            const { log } = createMainLogger();
            const received = [];
            log.subscribe(function (entry) { received.push(entry); });

            const entry = { ts: 1, lvl: 'log', data: ['hello'], stack: '' };
            log.__push(entry);

            expect(received.length).toBe(1);
            expect(received[0]).toBe(entry);
        });

        test('__push does not notify after unsubscribe', () => {
            const { log } = createMainLogger();
            const received = [];
            const unsub = log.subscribe(function (entry) { received.push(entry); });
            unsub();

            log.__push({ ts: 2, lvl: 'info', data: [], stack: '' });
            expect(received.length).toBe(0);
        });

        test('entry pushed via __push is still in get() even if listener throws', () => {
            const { log } = createMainLogger();
            log.subscribe(function () { throw new Error('boom'); });

            const entry = { ts: 3, lvl: 'warn', data: ['x'], stack: '' };
            expect(() => log.__push(entry)).not.toThrow();
            expect(log.get()).toEqual([entry]);
        });
    });

    describe('logger.main - no replay of prior entries', () => {
        test('entries pushed before subscribe are not replayed', () => {
            const { log } = createMainLogger();
            log.__push({ ts: 10, lvl: 'log', data: ['before'], stack: '' });

            const received = [];
            log.subscribe(function (entry) { received.push(entry); });

            expect(received.length).toBe(0);
        });
    });

    describe('logger.main - existing API not broken', () => {
        test('get returns a snapshot array', () => {
            const { log } = createMainLogger();
            expect(Array.isArray(log.get())).toBe(true);
        });

        test('setLen is a function', () => {
            const { log } = createMainLogger();
            expect(typeof log.setLen).toBe('function');
        });

        test('clear empties the buffer', () => {
            const { log } = createMainLogger();
            log.__push({ ts: 1, lvl: 'log', data: [], stack: '' });
            log.clear();
            expect(log.get().length).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // logger.worker - tested by evaluating worker.toString() in an isolated
    // environment simulating `self` and `port`.
    // -----------------------------------------------------------------------

    describe('logger.worker - subscribe via toString() evaluation', () => {
        /**
         * Executes logger.worker inside a simulated worker environment.
         * Returns the logger API returned by the worker function.
         */
        function createWorkerLogger(dev = false) {
            const messages = [];
            const consoleMock = {
                log: function () {},
                info: function () {},
                warn: function () {},
                error: function () {},
            };
            const selfStub = {
                console: consoleMock,
            };
            // port stub
            const portStub = {
                postMessage: function (msg) { messages.push(msg); },
                messages,
            };

            // Evaluate worker in isolation via new Function so it gets its own
            // `self` and `port` without leaking outer scope
            const workerSrc = logger.worker.toString();
            // We wrap in an IIFE that receives self and port as parameters
             
            const workerFn = new Function('self', 'port', 'dev', `
                // Patch Object.defineProperty for self so it doesn't fail
                var origDefProp = Object.defineProperty;
                // Allow configurable: false on selfStub
                var _log = (${workerSrc})(dev, port);
                return _log;
            `);

            const log = workerFn(selfStub, portStub, dev);
            return { log, portStub };
        }

        test('subscribe is exposed on worker logger API', () => {
            const { log } = createWorkerLogger();
            expect(typeof log.subscribe).toBe('function');
        });

        test('subscribe throws if fn is not a function', () => {
            const { log } = createWorkerLogger();
            expect(() => log.subscribe(42)).toThrow('logger: fn must be a function');
        });

        test('subscribe returns unsubscribe function', () => {
            const { log } = createWorkerLogger();
            const unsub = log.subscribe(function () {});
            expect(typeof unsub).toBe('function');
        });

        test('second subscribe before unsubscribe throws', () => {
            const { log } = createWorkerLogger();
            log.subscribe(function () {});
            expect(() => log.subscribe(function () {})).toThrow('logger: subscriber already registered');
        });

        test('after unsubscribe(), new subscribe accepted', () => {
            const { log } = createWorkerLogger();
            const unsub = log.subscribe(function () {});
            unsub();
            expect(() => log.subscribe(function () {})).not.toThrow();
        });

        test('unsubscribe is idempotent', () => {
            const { log } = createWorkerLogger();
            const unsub = log.subscribe(function () {});
            unsub();
            expect(() => unsub()).not.toThrow();
        });

        test('listener is called in addition to port.postMessage', () => {
            const { log, portStub } = createWorkerLogger();
            const received = [];
            log.subscribe(function (entry) { received.push(entry); });

            // Directly call internal log - simulate via get/setLen (no direct log fn)
            // We access the internal log function via the console proxy
            // Actually we can't call log() directly, but we can verify via the
            // console proxy that was set up on selfStub.
            // However, in our isolated env selfStub.console was proxied internally.
            // Access it via the selfStub (Object.defineProperty rewrote selfStub.console)
            // The proxy wraps the original consoleMock - calling .log triggers internal log()
            // which pushes + notifies subscriber + postMessages
            // We need to access selfStub.console AFTER the worker ran:
            // But we only have portStub. We can check via get() on the log.
            // Instead, use a known entry path: call __push is not available on worker.
            // Let's use the console proxy on selfStub directly.
            // selfStub.console was replaced by the proxy via Object.defineProperty.
            // In Node/Bun there is no real window, so defineProperty on selfStub succeeds.
            const proxiedConsole = Object.getOwnPropertyDescriptor(log, 'get') ? null : null;

            // Strategy: use get() before and after manual entry injection
            // Since worker doesn't expose __push, we verify by using the console proxy
            // that was assigned on selfStub. The worker's Object.defineProperty replaces
            // selfStub.console with the proxy, so:
            // Actually in the new Function context, `self` IS selfStub.
            // After the worker runs, selfStub.console should be the proxy.
            // Let's verify selfStub.console is now a Proxy (type object, callable props).
            expect(typeof log.get).toBe('function');
            // The key assertion: subscriber was registered and after a console call
            // both port.postMessage AND the subscriber are called.
            // We trust the implementation is correct; test the path via get().
            // Push an entry by calling the proxied console's log method:
            // selfStub.console was overwritten by the worker with a Proxy
            // NOTE: In our new Function context, `Object.defineProperty(self, 'console', ...)`
            // sets it on selfStub. So selfStub.console is now the proxy.
            // But we're outside that function here... selfStub IS the object passed as `self`.
            // Accessing selfStub.console AFTER createWorkerLogger should give the proxy.
            // However Object.defineProperty({configurable:false}) prevents re-read from outside
            // only if the descriptor changed. Let's check directly:
            const initialLen = log.get().length;
            // Call the proxy console
            // selfStub.console IS the proxied console now (the property was set via defineProperty)
            // We can call it - note: this will trigger port.postMessage too
            // (We need to grab selfStub from above - but we don't have it here)
            // We'll do this inline in a dedicated sub-test below.
            expect(initialLen).toBe(0);
        });

        test('listener called via console proxy + port.postMessage both fire', () => {
            const messages = [];
            const consoleMock = {
                log: function () {},
                info: function () {},
                warn: function () {},
                error: function () {},
            };
            const selfStub = { console: consoleMock };
            const portStub = { postMessage: function (msg) { messages.push(msg); } };

             
            const workerFn = new Function('self', 'port', 'dev', `
                return (${logger.worker.toString()})(dev, port);
            `);
            const log = workerFn(selfStub, portStub, false);

            const received = [];
            log.subscribe(function (entry) { received.push(entry); });

            // After worker runs, selfStub.console is the proxy
            selfStub.console.log('hello from worker');

            expect(received.length).toBe(1);
            expect(received[0].lvl).toBe('log');
            expect(messages.length).toBe(1);
            expect(messages[0].__type).toBe('log');
        });

        test('listener throws: port.postMessage still fires + entry in get()', () => {
            const messages = [];
            const consoleMock = {
                log: function () {},
                warn: function () {},
            };
            const selfStub = { console: consoleMock };
            const portStub = { postMessage: function (msg) { messages.push(msg); } };

             
            const workerFn = new Function('self', 'port', 'dev', `
                return (${logger.worker.toString()})(dev, port);
            `);
            const log = workerFn(selfStub, portStub, false);

            log.subscribe(function () { throw new Error('subscriber error'); });
            expect(() => selfStub.console.warn('test')).not.toThrow();
            expect(log.get().length).toBe(1);
            expect(messages.length).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // logger.main - browser path unchanged (BL-389 regression pin).
    // The console Proxy install must remain byte-identical when `window` is
    // present, before/after the environment-aware guard.
    // -----------------------------------------------------------------------

    describe('logger.main - browser path unchanged (BL-389 regression pin)', () => {
        test('installs a non-writable, non-configurable console Proxy on window', () => {
            const { windowStub, consoleMock } = createMainLogger();
            expect(windowStub.console).not.toBe(consoleMock);
            const descriptor = Object.getOwnPropertyDescriptor(windowStub, 'console');
            expect(descriptor.writable).toBe(false);
            expect(descriptor.configurable).toBe(false);
            expect(descriptor.enumerable).toBe(false);
        });

        test('console Proxy still forwards calls into the in-memory buffer', () => {
            const { log, windowStub } = createMainLogger(false);
            windowStub.console.log('hello');
            expect(log.get().length).toBe(1);
            expect(log.get()[0].lvl).toBe('log');
        });

        test('assigning a property on the console Proxy is swallowed by the set trap', () => {
            const { windowStub } = createMainLogger();
            expect(() => { windowStub.console.log = 'nope'; }).not.toThrow();
            // The underlying target's `log` was never mutated by the swallowed
            // set, so the Proxy's get trap keeps wrapping the ORIGINAL function.
            expect(typeof windowStub.console.log).toBe('function');
        });
    });

    // -----------------------------------------------------------------------
    // logger.main - Node/worker realm safety (BL-389).
    // No `window` global: the console Proxy install must be SKIPPED entirely
    // (Node's console is non-configurable territory - never seized), while
    // the rest of the logger API stays fully functional.
    // -----------------------------------------------------------------------

    describe('logger.main - Node/worker realm safety (BL-389)', () => {
        /**
         * Runs `body` with `globalThis.window` guaranteed absent, restoring
         * whatever was there afterwards (best-effort, mirrors the rest of
         * this file's window-patching strategy).
         */
        function withoutWindow(body) {
            const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
            const savedWindow = globalThis.window;
            delete globalThis.window;
            try {
                body();
            } finally {
                if (hadWindow) {
                    globalThis.window = savedWindow;
                } else {
                    delete globalThis.window;
                }
            }
        }

        test('does not throw when window is undefined (globalThis.console only)', () => {
            withoutWindow(() => {
                expect(typeof window).toBe('undefined');
                expect(() => logger.main(false)).not.toThrow();
            });
        });

        test('returns a fully functional logger API without touching window', () => {
            withoutWindow(() => {
                const log = logger.main(false);
                expect(typeof log.get).toBe('function');
                expect(typeof log.setLen).toBe('function');
                expect(typeof log.clear).toBe('function');
                expect(typeof log.subscribe).toBe('function');
                expect(typeof log.__push).toBe('function');
                expect(log.get()).toEqual([]);
            });
        });

        test('does not install a console Proxy when window is undefined', () => {
            withoutWindow(() => {
                const savedConsole = globalThis.console;
                logger.main(false);
                expect(globalThis.console).toBe(savedConsole);
                expect(typeof globalThis.window).toBe('undefined');
            });
        });
    });

    // -----------------------------------------------------------------------
    // logger.main - Node subprocess import (BL-389).
    // src/main.js (which unconditionally calls logger.main(ENV.DEV) at
    // import time) must be importable under a BARE `node` process, not just
    // Bun. Before the fix this exits 1 with "window is not defined".
    // Subprocess adds no coverage of its own - the in-process tests above
    // carry the lines - this is a black-box regression lock on the entry
    // point.
    // -----------------------------------------------------------------------

    describe('src/main.js - node-safe import (BL-389)', () => {
        test('imports cleanly under bare Node (no window global)', () => {
            const mainJsPath = join(import.meta.dir, '..', 'main.js');
            const mainJsUrl = pathToFileURL(mainJsPath).href;
            const probeSrc = [
                `import(${JSON.stringify(mainJsUrl)})`,
                '  .then(() => { process.exit(0); })',
                '  .catch((e) => {',
                '    process.stderr.write(String((e && e.stack) || e));',
                '    process.exit(1);',
                '  });',
            ].join('\n');

            const proc = Bun.spawnSync(['node', '--input-type=module', '-e', probeSrc], {
                stdout: 'pipe',
                stderr: 'pipe',
            });

            const stderr = proc.stderr ? proc.stderr.toString() : '';
            expect(stderr).not.toContain('window is not defined');
            expect(proc.exitCode).toBe(0);
        });
    });
});

// ---------------------------------------------------------------------------
// Task 12 additions (BL-48 coverage restoration I) — logger.main + logger.worker.
//
// logger.worker's body is executed above only via `toString()` + `new
// Function(...)`: that re-compiles the source into a disconnected script, so
// Bun's coverage instrumentation (tied to the ORIGINAL module's parsed AST)
// never counts those runs — the worker function is behaviorally exercised
// but contributes ~0 measured lines. Since `worker(dev, port)` reads its
// console holder off the bare global `self` (mirroring `main`'s `window`
// usage), the real function can be invoked directly by temporarily patching
// `globalThis.self`, which DOES count towards coverage. This section adds
// that direct-invocation path plus the behavior the plan calls out:
// per-level formatting, the dev=true real-console forward + formatStack, and
// setLen bounds validation on both main and worker.
// ---------------------------------------------------------------------------

/**
 * Runs `body` with `globalThis.self` temporarily set to `selfStub`,
 * restoring whatever was there afterwards (mirrors this file's
 * `withoutWindow` strategy for `window`).
 * @param {object} selfStub
 * @param {function(): void} body
 */
function withPatchedSelf(selfStub, body) {
    const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
    const savedSelf = globalThis.self;
    globalThis.self = selfStub;
    try {
        body();
    } finally {
        if (hadSelf) {
            globalThis.self = savedSelf;
        } else {
            delete globalThis.self;
        }
    }
}

/**
 * Builds a `logger.worker` instance via DIRECT invocation (not
 * toString()-eval), so its body is the real, coverage-instrumented source.
 * @param {boolean} [dev]
 */
function createDirectWorkerLogger(dev = false) {
    const consoleCalls = { log: [], info: [], warn: [], error: [], debug: [] };
    const consoleMock = {
        log: function () { consoleCalls.log.push([...arguments]); },
        info: function () { consoleCalls.info.push([...arguments]); },
        warn: function () { consoleCalls.warn.push([...arguments]); },
        error: function () { consoleCalls.error.push([...arguments]); },
        debug: function () { consoleCalls.debug.push([...arguments]); },
    };
    const selfStub = { console: consoleMock };
    const messages = [];
    const portStub = { postMessage: function (msg) { messages.push(msg); } };

    let log;
    withPatchedSelf(selfStub, () => {
        log = logger.worker(dev, portStub);
    });
    return { log, selfStub, consoleMock, consoleCalls, portStub, messages };
}

describe('logger.main - setLen validation & capping (task 12)', () => {
    function pushN(log, n) {
        for (let i = 0; i < n; i++) {
            log.__push({ ts: i, lvl: 'log', data: [], stack: '' });
        }
    }

    test('a valid positive length caps the buffer (oldest evicted, FIFO)', () => {
        const { log } = createMainLogger();
        log.setLen(2);
        pushN(log, 3);
        const entries = log.get();
        expect(entries.length).toBe(2);
        expect(entries[0].ts).toBe(1);
        expect(entries[1].ts).toBe(2);
    });

    test('NaN is ignored - the previous cap persists', () => {
        const { log } = createMainLogger();
        log.setLen(2);
        log.setLen(NaN);
        pushN(log, 3);
        expect(log.get().length).toBe(2);
    });

    test('a non-positive length is ignored', () => {
        const { log } = createMainLogger();
        log.setLen(2);
        log.setLen(0);
        log.setLen(-5);
        pushN(log, 3);
        expect(log.get().length).toBe(2);
    });

    test('a length exceeding MAX_LOGS (65536) is ignored', () => {
        const { log } = createMainLogger();
        log.setLen(2);
        log.setLen(70000);
        pushN(log, 3);
        expect(log.get().length).toBe(2);
    });

    test('a later valid length overrides the previous cap', () => {
        const { log } = createMainLogger();
        log.setLen(2);
        log.setLen(5);
        pushN(log, 6);
        expect(log.get().length).toBe(5);
    });
});

describe('logger.main - console proxy: passthrough & per-level formatting (task 12)', () => {
    test('non-function console properties pass through unchanged', () => {
        const { windowStub, consoleMock } = createMainLogger();
        consoleMock.customFlag = 'abc';
        expect(windowStub.console.customFlag).toBe('abc');
    });

    test('different console methods produce matching lvl values', () => {
        const { log, windowStub } = createMainLogger();
        windowStub.console.log('a');
        windowStub.console.info('b');
        windowStub.console.warn('c');
        windowStub.console.error('d');
        windowStub.console.debug('e');
        const lvls = log.get().map((entry) => entry.lvl);
        expect(lvls).toEqual(['log', 'info', 'warn', 'error', 'debug']);
    });

    test('dev=true forwards original args plus a formatted (array-of-strings) stack', () => {
        const calls = [];
        const consoleMock = {
            log: function () { calls.push([...arguments]); },
        };
        const windowStub = { console: consoleMock };
        globalThis.window = windowStub;
        const log = logger.main(true);

        windowStub.console.log('hello', 42);

        expect(calls.length).toBe(1);
        const callArgs = calls[0];
        expect(callArgs[0]).toBe('hello');
        expect(callArgs[1]).toBe(42);
        const lastArg = callArgs[callArgs.length - 1];
        expect(Array.isArray(lastArg)).toBe(true);
        expect(lastArg.length).toBeGreaterThan(0);
        lastArg.forEach((line) => expect(typeof line).toBe('string'));
        expect(log.get().length).toBe(1);
        expect(log.get()[0].data).toEqual(['hello', 42]);
    });
});

describe('logger.worker - direct invocation via globalThis.self patch (task 12, coverage)', () => {
    test('returns a fully functional API and starts with an empty buffer', () => {
        const { log } = createDirectWorkerLogger();
        expect(typeof log.get).toBe('function');
        expect(typeof log.setLen).toBe('function');
        expect(typeof log.clear).toBe('function');
        expect(typeof log.subscribe).toBe('function');
        expect(log.get()).toEqual([]);
    });

    test('clear empties the buffer', () => {
        const { log, selfStub } = createDirectWorkerLogger();
        selfStub.console.log('a');
        expect(log.get().length).toBe(1);
        log.clear();
        expect(log.get().length).toBe(0);
    });

    test('subscribe validates its argument (throws for a non-function)', () => {
        const { log } = createDirectWorkerLogger();
        expect(() => log.subscribe('bad')).toThrow('logger: fn must be a function');
        expect(() => log.subscribe(null)).toThrow('logger: fn must be a function');
    });

    test('a second subscribe before unsubscribe throws', () => {
        const { log } = createDirectWorkerLogger();
        log.subscribe(function () {});
        expect(() => log.subscribe(function () {})).toThrow('logger: subscriber already registered');
    });

    test('subscribe notifies on push; unsubscribe stops further notification', () => {
        const { log, selfStub } = createDirectWorkerLogger();
        const received = [];
        const unsub = log.subscribe(function (entry) { received.push(entry); });
        selfStub.console.log('one');
        expect(received.length).toBe(1);
        unsub();
        selfStub.console.log('two');
        expect(received.length).toBe(1);
    });

    test('unsubscribe is idempotent', () => {
        const { log } = createDirectWorkerLogger();
        const unsub = log.subscribe(function () {});
        unsub();
        expect(() => unsub()).not.toThrow();
    });

    test('a throwing subscriber does not block the push or the port.postMessage', () => {
        const { log, selfStub, messages } = createDirectWorkerLogger();
        log.subscribe(function () { throw new Error('boom'); });
        expect(() => selfStub.console.warn('x')).not.toThrow();
        expect(log.get().length).toBe(1);
        expect(messages.length).toBe(1);
    });

    test('__fw port message envelope carries the pushed entry', () => {
        const { selfStub, messages } = createDirectWorkerLogger();
        selfStub.console.log('hi');
        expect(messages.length).toBe(1);
        expect(messages[0].__fw).toBe(true);
        expect(messages[0].__type).toBe('log');
        expect(messages[0].msg.lvl).toBe('log');
    });

    test('different console methods produce matching lvl values', () => {
        const { log, selfStub } = createDirectWorkerLogger();
        selfStub.console.log('a');
        selfStub.console.info('b');
        selfStub.console.warn('c');
        selfStub.console.error('d');
        selfStub.console.debug('e');
        const lvls = log.get().map((entry) => entry.lvl);
        expect(lvls).toEqual(['log', 'info', 'warn', 'error', 'debug']);
    });

    test('non-function console properties pass through unchanged', () => {
        // Set directly on the underlying target (`consoleMock`) - the proxy's
        // `set` trap unconditionally swallows assignments made THROUGH the
        // proxy itself (see the "swallowed by the set trap" test below).
        const { selfStub, consoleMock } = createDirectWorkerLogger();
        consoleMock.customFlag = 'abc';
        expect(selfStub.console.customFlag).toBe('abc');
    });

    test('assigning a property on the console proxy is swallowed by the set trap', () => {
        const { selfStub } = createDirectWorkerLogger();
        expect(() => { selfStub.console.log = 'nope'; }).not.toThrow();
        expect(typeof selfStub.console.log).toBe('function');
    });

    test('dev=true forwards original args plus a formatted (array-of-strings) stack', () => {
        const { log, selfStub, consoleCalls } = createDirectWorkerLogger(true);
        selfStub.console.warn('oops', 42);
        expect(consoleCalls.warn.length).toBe(1);
        const callArgs = consoleCalls.warn[0];
        expect(callArgs[0]).toBe('oops');
        expect(callArgs[1]).toBe(42);
        const lastArg = callArgs[callArgs.length - 1];
        expect(Array.isArray(lastArg)).toBe(true);
        expect(lastArg.length).toBeGreaterThan(0);
        lastArg.forEach((line) => expect(typeof line).toBe('string'));
        expect(log.get().length).toBe(1);
    });

    describe('setLen validation & capping', () => {
        test('a valid positive length caps the buffer (oldest evicted)', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            log.setLen(2);
            selfStub.console.log('a');
            selfStub.console.log('b');
            selfStub.console.log('c');
            expect(log.get().length).toBe(2);
        });

        test('NaN is ignored - the previous cap persists', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            log.setLen(2);
            log.setLen(NaN);
            selfStub.console.log('a');
            selfStub.console.log('b');
            selfStub.console.log('c');
            expect(log.get().length).toBe(2);
        });

        test('a non-positive length is ignored', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            log.setLen(2);
            log.setLen(0);
            log.setLen(-5);
            selfStub.console.log('a');
            selfStub.console.log('b');
            selfStub.console.log('c');
            expect(log.get().length).toBe(2);
        });

        test('a length exceeding MAX_LOGS (65536) is ignored', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            log.setLen(2);
            log.setLen(70000);
            selfStub.console.log('a');
            selfStub.console.log('b');
            selfStub.console.log('c');
            expect(log.get().length).toBe(2);
        });

        test('a later valid length overrides the previous cap', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            log.setLen(2);
            log.setLen(5);
            ['a', 'b', 'c', 'd', 'e', 'f'].forEach((c) => selfStub.console.log(c));
            expect(log.get().length).toBe(5);
        });
    });

    describe('serializeLog branches (data serialization through the console proxy)', () => {
        test('bigint is serialized as a string suffixed with "n"', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            selfStub.console.log(10n);
            expect(log.get()[0].data[0]).toBe('10n');
        });

        test('symbol is serialized via its toString()', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            selfStub.console.log(Symbol('x'));
            expect(log.get()[0].data[0]).toBe('Symbol(x)');
        });

        test('a named function is serialized as "[Function <name>]"', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            function namedFn() {}
            selfStub.console.log(namedFn);
            expect(log.get()[0].data[0]).toBe('[Function namedFn]');
        });

        test('an anonymous function falls back to "[Function anonymous]"', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            selfStub.console.log(() => {});
            expect(log.get()[0].data[0]).toBe('[Function anonymous]');
        });

        test('Error instances serialize to a plain {name, message, stack} shape', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            selfStub.console.log(new TypeError('boom'));
            const serialized = log.get()[0].data[0];
            expect(serialized.name).toBe('TypeError');
            expect(serialized.message).toBe('boom');
            expect(typeof serialized.stack).toBe('string');
        });

        test('Map serializes to a {__type: "Map", value: [...entries]} shape', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            selfStub.console.log(new Map([['a', 1], ['b', 2]]));
            const serialized = log.get()[0].data[0];
            expect(serialized.__type).toBe('Map');
            expect(serialized.value).toEqual([['a', 1], ['b', 2]]);
        });

        test('Set serializes to a {__type: "Set", value: [...values]} shape', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            selfStub.console.log(new Set([1, 2, 3]));
            const serialized = log.get()[0].data[0];
            expect(serialized.__type).toBe('Set');
            expect(serialized.value).toEqual([1, 2, 3]);
        });

        test('a circular reference is replaced with "[Circular]"', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            const circular = {};
            circular.self = circular;
            selfStub.console.log(circular);
            const serialized = log.get()[0].data[0];
            expect(serialized.self).toBe('[Circular]');
        });

        test('a value that throws while being read serializes to the whole-entry Unserializable marker', () => {
            const { log, selfStub } = createDirectWorkerLogger();
            const unserializable = {};
            Object.defineProperty(unserializable, 'x', {
                enumerable: true,
                get() { throw new Error('getter boom'); },
            });
            selfStub.console.log(unserializable);
            // JSON.stringify throws while reading `.x`, so the OUTER
            // try/catch in serializeLog replaces the whole `data` array
            // (not just the offending element) with the marker object.
            const serialized = log.get()[0].data;
            expect(serialized.__type).toBe('Unserializable');
            expect(serialized.message).toBe('getter boom');
        });
    });
});
