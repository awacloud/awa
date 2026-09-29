// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Wrapper around the native `SharedWorker` API. Provides a single connection
 * shared across all tabs of the same origin, with bidirectional RPC via
 * `processRPC`.
 *
 * Out of scope: bootstrapping the fw runtime inside the SharedWorker itself
 * (handled by `worker-helper`).
 * Recommended fallback: use `leaderElection` when SharedWorker is unavailable
 * (Safari mobile, restricted configurations).
 *
 * @example
 * const sharedWorker = runtime.resolve('sharedWorker');
 * if (!sharedWorker.support().available) {
 *     // Fallback to leaderElection
 * }
 * const sw = sharedWorker.create({ url: '/shared.js', name: 'app' });
 * const { call } = sw.rpc({ ping: () => 'pong' });
 * const proxy = await call;
 * sw.onError((err) => console.error(err));
 */

/**
 * @typedef {Object} SharedWorkerRpc
 * @property {Promise<Object>} call - Resolves to the remote proxy: each property
 *   on the resolved value is a function calling into the SharedWorker side.
 * @property {{ close: () => void }} expose - Local-side exposed API control.
 *   `close()` tears down the local processRPC peer (does not cascade to the
 *   remote proxy; close the call-side separately if you opened both ends).
 */

/**
 * @typedef {Object} SharedWorkerHandle
 * @property {() => MessagePort} port - Native MessagePort.
 * @property {(api: Record<string, Function>) => SharedWorkerRpc} rpc - Start a bidirectional RPC.
 * @property {() => boolean} online - Best-effort connection status.
 * @property {(fn: (event: Event) => void) => (() => void)} onError - Register an error handler; returns a disposer.
 * @property {() => void} close - Close the port and detach handlers (idempotent).
 */

import { processRPC } from '../../process/rpc.js';

/**
 * SharedWorker helper surface returned by `factory()`.
 * @typedef {object} SharedWorkerAPI
 * @property {(opts: { url: string, name?: string, credentials?: string }) => SharedWorkerHandle} create - Create an instance connected to a SharedWorker (throws `SharedWorkerNotSupported` if the API is missing).
 * @property {() => { available: boolean, sharedWorker: boolean }} support - Detect availability of the SharedWorker API.
 */

export const sharedWorker = {
    name: 'sharedWorker',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: ['processRPC'],
    deps: [processRPC],

    /**
     * @param {Object} processRPC - Bidirectional RPC module.
     * @returns {SharedWorkerAPI}
     */
    factory(processRPC) {

        /**
         * Create an instance connected to a SharedWorker.
         * Throws `SharedWorkerNotSupported` if the API is missing.
         *
         * @param {{ url: string, name?: string, credentials?: string }} opts
         * @returns {SharedWorkerHandle}
         */
        function create(opts) {
            if (typeof SharedWorker === 'undefined') {
                const err = new Error('SharedWorker is not supported in this environment');
                err.name = 'SharedWorkerNotSupported';
                throw err;
            }

            const { url, name: workerName, credentials } = opts ?? {};
            const workerOpts = {};
            if (workerName !== undefined)   workerOpts.name        = workerName;
            if (credentials !== undefined)  workerOpts.credentials = credentials;

            // @ts-ignore - {name, credentials} is a valid WorkerOptions subset; TS WorkerOptions type is incomplete
            const worker = new SharedWorker(url, workerOpts);
            const _port  = worker.port;
            _port.start();

            let _connected = true;
            let _closed    = false;
            const _errorHandlers = [];

            worker.onerror = (event) => {
                if (_closed) return;
                _connected = false;
                _errorHandlers.forEach(fn => fn(event));
            };

            _port.onmessageerror = (event) => {
                if (_closed) return;
                _errorHandlers.forEach(fn => fn(event));
            };

            /**
             * Native MessagePort backing this connection.
             * @returns {MessagePort}
             */
            function port() {
                return _port;
            }

            /**
             * Bidirectional RPC via processRPC.
             * Exposes `api` on the tab side and returns `{ call, expose }`
             * where `call` is a Promise resolving to the remote proxy.
             *
             * Asymmetric close: `expose.close()` tears down the local peer
             * only. The remote proxy returned via `call` is opened on the
             * same port; if your processRPC implementation holds its own
             * resources, close it explicitly on the resolved proxy.
             *
             * @param {Record<string, Function>} api - Methods to expose to the SharedWorker.
             * @returns {SharedWorkerRpc}
             */
            function rpc(api) {
                // Expose the local (tab-side) api on the SharedWorker port.
                const { close: closeRpc } = processRPC.create(api);
                // Open the RPC proxy toward the SharedWorker on the same port.
                const callPromise = processRPC.open(_port);

                return {
                    call:   callPromise,
                    expose: { close: closeRpc },
                };
            }

            /**
             * Best-effort connection status. Flips to false on worker error,
             * message error, or `close()`. Does not detect remote `close()`
             * from the SharedWorker side or page unload.
             * @returns {boolean}
             */
            function online() {
                return _connected;
            }

            /**
             * Register an error handler.
             * @param {(event: Event) => void} fn
             * @returns {() => void} Disposer that removes this handler.
             */
            function onError(fn) {
                _errorHandlers.push(fn);
                return () => {
                    const i = _errorHandlers.indexOf(fn);
                    if (i >= 0) _errorHandlers.splice(i, 1);
                };
            }

            /**
             * Close the port (the worker stays alive while other tabs are
             * still connected). Detaches error handlers; idempotent.
             */
            function close() {
                if (_closed) return;
                _closed    = true;
                _connected = false;
                try { worker.onerror = null; } catch { /* ignore */ }
                try { _port.onmessageerror = null; } catch { /* ignore */ }
                _errorHandlers.length = 0;
                _port.close();
            }

            return { port, rpc, online, onError, close };
        }

        /**
         * Detect availability of the SharedWorker API.
         * @returns {{ available: boolean, sharedWorker: boolean }}
         *   Both keys carry the same value; `available` aligns with sibling
         *   modules' shape, `sharedWorker` is preserved for backward compat.
         */
        function support() {
            const available = typeof SharedWorker !== 'undefined';
            return { available, sharedWorker: available };
        }

        return { create, support };
    },
};
