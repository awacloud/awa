// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/worker-helper.js
/**
 * @fileoverview Factory that creates a `workerRuntime` function for spawning
 * framework-aware Web Workers from inline code.
 *
 * **How it works:**
 * 1. The requested dependency modules are serialised by `runtime.serialize` into
 *    a self-contained JS string.
 * 2. An optional logger bootstrap (`logFn`) is prepended when `ENV.LOG` is active.
 * 3. The code string is turned into a Blob URL and passed to `new Worker(...)`.
 * 4. Framework-internal messages (flagged with `__fw: true`) are intercepted on
 *    the main-thread `message` event and never reach user handlers.
 * 5. `worker.terminate` is patched to perform cleanup (revoke the Blob URL,
 *    run the user-supplied `terminate` callback) before delegating to the native
 *    `terminate`.
 *
 * **Confinement** (`revoke`, `lockdown`): after `workerFw` has built the
 * context and before the user function runs, the named globals are removed
 * from every owner on the global's prototype chain, then `lockdown()` freezes
 * the worker's realm. What `workerFw` resolved is the explicit grant; the user
 * function meets the confined realm. `lockdown` makes the worker a MODULE
 * worker: a static `import` of `sanity/lockdown.js` runs before the body, so no
 * top-level await delays the message handler.
 */

/**
 * Options accepted by the `workerRuntime` function returned by
 * {@link createWorkerRuntime}.
 *
 * @typedef {Object} WorkerOptions
 * @property {string[]}  [dependencies=[]]  - Module names to serialise and register
 *   inside the worker. The transitive dependency graph is resolved automatically.
 * @property {Function}  [workerFw]         - Worker-side framework bootstrap function.
 *   Signature: `(runtime, modules, args) => context`. Called inside the worker
 *   after all modules are registered; its return value is assigned to
 *   `runtime.context` and passed as the sole argument to `workerFn`.
 *   Defaults to a function that resolves all modules into `libs` and returns
 *   `{ libs, process, args }`.
 * @property {*[]}       [args=[]]          - Serialisable arguments forwarded to
 *   `workerFw` as its third parameter. Must be JSON-serialisable.
 * @property {Function}  [terminate]        - Callback invoked during cleanup, just
 *   before the native `Worker.terminate()` call. Defaults to a no-op.
 * @property {string[]}  [revoke]           - Global names to remove inside the
 *   worker before `workerFn` runs (e.g. `['fetch', 'XMLHttpRequest',
 *   'WebSocket']`), from every object of the global's prototype chain that owns
 *   them. A name still reachable afterwards throws in the worker (its `error`
 *   event): confinement fails closed.
 * @property {boolean|{url: string}} [lockdown] - Run `lockdown()` inside the
 *   worker before `workerFn` (after `revoke`). `true` imports the
 *   `sanity/lockdown.js` that sits next to this file; `{ url }` names it by an
 *   absolute URL (a bundled or re-hosted build). The worker becomes a module
 *   worker, where `importScripts` does not exist.
 */

/**
 * @typedef {Object} ModuleRuntime
 * @property {function(string[]): Object} resolveAll - Resolve a list of module names.
 * @property {function(string[]): {content: string, list: string[]}} serialize    - Serialize module(s) by name array.
 * @property {*} [context]                           - Worker-side resolved context.
 */

/**
 * @typedef {function(Function, WorkerOptions=): Worker} workerRuntime
 */

/**
 * A framework-internal message sent from the worker to the main thread.
 * These messages are intercepted and never forwarded to user listeners.
 *
 * @typedef {Object} FwMessage
 * @property {true}   __fw    - Framework flag; always `true`.
 * @property {string} __type  - Message sub-type (e.g. `'log'`).
 * @property {*}      [msg]   - Payload (type-dependent).
 */

/**
 * Create a `workerRuntime` function bound to the given environment and runtime.
 *
 * Separating construction from invocation allows `createWorkerRuntime` to be
 * called once at application startup while `workerRuntime` is called each time
 * a new Worker is needed.
 *
 * @param {Object}        ENV           - Environment configuration object.
 * @param {boolean}       ENV.LOG       - When `true`, the log-forwarding handler is
 *   installed and the logger bootstrap is prepended to the worker code.
 * @param {boolean}       [ENV.DEV]     - Passed to the logger bootstrap when `ENV.LOG`
 *   is active.
 * @param {ModuleRuntime} runtime       - The main-thread runtime instance used to
 *   serialise modules for the worker.
 * @param {string}        runtimeSource - Self-contained source code of the runtime
 *   (constants + private helpers + `ModuleRuntime` class), exported by
 *   `runtime.js` as `runtimeSource`. Embedded as-is at the top of the worker
 *   code so the class can reference its private helpers (`semverCompare`,
 *   `parseSpec`, `canonical`, etc.) once instantiated worker-side.
 * @param {Object}        log           - Main-thread log service. Must expose a
 *   `__push(msg)` method when `ENV.LOG` is `true`.
 * @param {Function}      logFn         - Logger initialisation function; its source is
 *   stringified and prepended to the worker code when `ENV.LOG` is `true`.
 * @returns {workerRuntime} A configured worker-spawn function.
 */
export function createWorkerRuntime(ENV, runtime, runtimeSource, log, logFn) {

    const FW_FLAG = '__fw';
    const FW_TYPE_LOG = 'log';

    const DEFAULT_WORKER_MODULES = [];

    /** A global name `revoke` accepts. */
    const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

    /**
     * Worker-side: remove each name from every owner on the global's
     * prototype chain, then require it to be gone. Stringified into the worker
     * code, so it is self-contained.
     *
     * @param {string[]} names
     * @returns {void}
     */
    const REVOKE_GLOBALS = function(names) {
        for (const name of names) {
            for (let o = globalThis; o; o = Object.getPrototypeOf(o)) {
                if (Object.prototype.hasOwnProperty.call(o, name)) {
                    try { delete o[name]; } catch (_e) { /* reported below */ }
                }
            }
            if (name in globalThis) throw new Error('createWorker: could not revoke "' + name + '"');
        }
    };

    /**
     * Validate the confinement options on the main thread.
     *
     * @param {Object} opts - The caller's options.
     * @returns {{revoke: string[], lockdownUrl: (string|null)}}
     * @throws {TypeError} on a malformed `revoke` or `lockdown`.
     */
    const confinementOf = function(opts) {
        let revoke = [];
        if (opts.revoke !== undefined) {
            if (!Array.isArray(opts.revoke) || !opts.revoke.every((n) => typeof n === 'string' && IDENT_RE.test(n))) {
                throw new TypeError('createWorker: revoke must be an array of global names');
            }
            revoke = opts.revoke.slice();
        }
        let lockdownUrl = null;
        const l = opts.lockdown;
        if (l === true) {
            lockdownUrl = new URL('../sanity/lockdown.js', import.meta.url).href;
        } else if (l && typeof l === 'object') {
            try {
                lockdownUrl = new URL(String(l.url)).href;
            } catch (e) {
                throw new TypeError('createWorker: lockdown.url must be an absolute URL', { cause: e });
            }
        } else if (l !== undefined && l !== false) {
            throw new TypeError('createWorker: lockdown must be true, false or { url }');
        }
        return { revoke, lockdownUrl };
    };

    /**
     * Default worker-side framework bootstrap.
     *
     * Resolves all requested modules via `runtime.resolveAll` and returns a
     * context object `{ libs, process, args }` that is assigned to
     * `runtime.context` inside the worker.
     *
     * @param {ModuleRuntime} runtime - The worker's own runtime instance.
     * @param {string[]}      modules - Module names to resolve.
     * @param {*[]}           args    - Arguments forwarded from the main thread.
     * @returns {{ libs: Object.<string,*>, process: Object, args: *[] }}
     */
    const DEFAULT_WORKER_FRAMEWORK = function(runtime, modules, args) {
        const libs = runtime.resolveAll(modules);
        const process = {};
        return {libs, process, args};
    };

    /**
     * Determine whether a worker `MessageEvent` carries a framework-internal
     * message (flagged with `__fw: true`).
     *
     * @param {*} data - The `event.data` value from a `MessageEvent`.
     * @returns {boolean} `true` when the message is framework-internal.
     */
    const isFwMessage = function (data) {
        return !!(data && data[FW_FLAG] === true);
    };

    /**
     * Build the main-thread `message` event handler for a worker.
     *
     * When `ENV.LOG` is active, the handler additionally pushes `'log'`-typed
     * framework messages to the main-thread log service via `log.__push`.
     * In all cases, framework-internal messages are stopped from propagating
     * further with `stopImmediatePropagation`.
     *
     * @returns {function(MessageEvent): void} The `message` event handler.
     */
    const messageHandlerBuilder = function() {
        if (ENV.LOG) {
            return function (event) {
                if (isFwMessage(event.data)) {
                    event.stopImmediatePropagation();

                    if (event.data.__type === FW_TYPE_LOG) {
                        log.__push(event.data.msg);
                    }

                }
            }
        } else {
            return function (event) {
                if (isFwMessage(event.data)) {
                    event.stopImmediatePropagation();
                }
            }
        }
    };

    /**
     * Spawn a framework-aware Web Worker from an inline function.
     *
     * The worker is built as follows:
     * 1. An optional logger bootstrap is prepended (`ENV.LOG` only).
     * 2. A new `ModuleRuntime` instance is created inside the worker.
     * 3. All serialised modules are registered on it.
     * 4. `workerFw` is called to build `runtime.context`.
     * 5. `workerFn` is called with `runtime.context`.
     *
     * The Blob URL is revoked and `options.terminate` is called when
     * `worker.terminate()` is invoked. Subsequent calls to the patched
     * `terminate` are no-ops.
     *
     * @param {Function}     workerFn         - Entry-point function executed inside
     *   the worker. Receives `runtime.context` as its sole argument.
     *   Its source is stringified, so it must be self-contained (no closures
     *   over main-thread variables).
     * @param {WorkerOptions} [options={}]    - Worker configuration options.
     * @throws {Error} When `new Worker(blobUrl)` fails (re-throws after revoking
     *   the Blob URL to prevent leaks).
     * @returns {Worker} The live `Worker` instance with a patched `terminate`
     *   method that performs cleanup before calling the native terminate.
     */
    return function workerRuntime(workerFn, options = {}) {
        const safeOptions = (options && typeof options === 'object') ? options : {};
        const normalizedOptions = {
            dependencies: Array.isArray(safeOptions.dependencies) ? safeOptions.dependencies : DEFAULT_WORKER_MODULES,
            workerFw: typeof safeOptions.workerFw === 'function' ? safeOptions.workerFw : DEFAULT_WORKER_FRAMEWORK,
            args: Array.isArray(safeOptions.args) ? safeOptions.args : [],
            terminate: typeof safeOptions.terminate === 'function' ? safeOptions.terminate : function(){},
        };
        const confine = confinementOf(safeOptions);

        const serialized = runtime.serialize(normalizedOptions.dependencies);
        const argsRaw = JSON.stringify(normalizedOptions.args);
        const logger = ENV.LOG ? `(${logFn})(${ENV.DEV === true}, self);` : ``;

        // Specs exposed to workerFw: use the user's **original** specs
        // (`normalizedOptions.dependencies`) rather than `serialized.list`,
        // which contains the canonical names of the ENTIRE graph (entry + transitives).
        // This aligns worker behaviour with the main thread:
        //   `resolveAll(['hex'])` → `{ hex: <hex> }` (not `{ 'hex@0.0.0': ... }`).
        // `serialized.content` remains the source of modules to register (full
        // graph, including transitive dependencies) so that resolution
        // on the worker side works correctly.
        const exposedSpecsLiteral = JSON.stringify(normalizedOptions.dependencies);

        const lockImport = confine.lockdownUrl
            ? `import { lockdown as __fwLockdown } from ${JSON.stringify(confine.lockdownUrl)};\n`
            : '';
        const confineCode = (confine.revoke.length ? `(${REVOKE_GLOBALS.toString()})(${JSON.stringify(confine.revoke)});` : '')
            + (confine.lockdownUrl ? '__fwLockdown();' : '');

        const code = lockImport + logger + `
            ${runtimeSource}

            const runtime = new ModuleRuntime();

            ${serialized.content}.forEach(m => {
                runtime.register(m);
            });

            runtime.context = (${normalizedOptions.workerFw.toString()})(runtime, ${exposedSpecsLiteral}, ${argsRaw});

            ${confineCode}

            (${workerFn.toString()})( runtime.context );
        `;

        const blobUrl = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
        let worker;
        try {
            worker = confine.lockdownUrl ? new Worker(blobUrl, { type: 'module' }) : new Worker(blobUrl);
        } catch (err) {
            URL.revokeObjectURL(blobUrl);
            throw err;
        }

        const messageHandler = messageHandlerBuilder();
        worker.addEventListener('message', messageHandler);

        const terminateBase = worker.terminate.bind(worker);
        let isTerminated = false;

        /**
         * Release all resources associated with this worker instance:
         * removes the `message` handler, revokes the Blob URL, and calls
         * `options.terminate`. Idempotent - returns `false` on subsequent calls.
         *
         * @returns {boolean} `true` on the first (effective) cleanup; `false`
         *   when the worker was already terminated.
         */
        const cleanup = function () {
            if (isTerminated) {
                return false;
            }
            isTerminated = true;
            worker.removeEventListener('message', messageHandler);
            URL.revokeObjectURL(blobUrl);
            normalizedOptions.terminate();
            return true;
        };

        /**
         * Patched `terminate`: runs {@link cleanup} then delegates to the native
         * `Worker.terminate`.
         */
        worker.terminate = function () {
            cleanup();
            terminateBase();
        };

        return worker;
    };
}
