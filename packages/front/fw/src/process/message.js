// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Messaging helpers used to route framework and user messages across worker
 * boundaries or in-memory sync channels.
 */

/**
 * Process-message helper surface returned by `factory()`.
 * @typedef {object} ProcessMessageAPI
 * @property {() => { process: Proxy, manager: MessageStore }} sync - Create a synchronous in-memory channel between a process proxy and a manager store.
 * @property {() => Proxy} worker - Create a process proxy bound to the real Worker global (`self`).
 * @property {(workerRef: WorkerLike) => Proxy} workerCommand - Create a command-sender proxy that posts fw/cmd messages to a worker.
 * @property {(runtime: RuntimeLike, modules: string[], args: any) => { libs: object, process: Proxy, args: any }} workerFramework - Resolve modules and prepare a worker process for framework usage.
 */

export const processMessage = {
    name: 'processMessage',
    version: '1.0.0',
    type: 'fw.process',
    dependencies: [],

    /**
     * Builds the process-message helpers.
     * @returns {ProcessMessageAPI}
     */
    factory() {
        const FW_FLAG    = '__fw';
        const FW_TYPE_CMD = 'cmd';


        const RESERVED = new Set(['postMessage', 'onmessage', 'addEventListener', 'removeEventListener']);

        const noop = () => {};


        /**
         * Checks whether the message is a framework-internal message.
         * @param {any} data
         * @returns {boolean}
         */
        const isFwMessage = (data) =>
            data !== null && typeof data === 'object' && data[FW_FLAG] === true;

        /**
         * Dispatches a message to a store:
         *  - fw/cmd message -> handler from store.handlers
         *  - regular message -> listeners + onmessage
         * @param {MessageStore} store
         * @param {MessageEventLike} event
         */
        const dispatch = (store, event) => {
            const { data, ports } = event;
            if (isFwMessage(data)) {
                if (data.__type === FW_TYPE_CMD) {
                    if (typeof data.name === 'string') {
                        const handler = store.handlers.get(data.name);
                        if (handler) return handler(data.msg, ports);
                    }
                }
                return;
            }

            for (const fn of store.listeners) fn(event);
            store.onmessage(event);
        };

        /**
         * Wires add/removeEventListener to the store's listener list.
         * @param {MessageStore} store
         */
        const wireListeners = (store) => {
            store.addEventListener = (name, fn) => {
                if (name === 'message' && typeof fn === 'function')
                    store.listeners.push(fn);
            };
            store.removeEventListener = (name, fn) => {
                if (name === 'message')
                    store.listeners = store.listeners.filter(l => l !== fn);
            };
        };

        /**
         * Creates a proxy that maps function assignments to command handlers.
         * @param {MessageStore} store
         * @returns {Proxy}
         */
        const createProcessProxy = (store) => {
            const reserved = {
                // @ts-ignore - spread forwarding of variadic args; types are guaranteed by MessageStore
                postMessage:       (...args) => store.postMessage(...args),
                // @ts-ignore - spread forwarding of variadic args; types are guaranteed by MessageStore
                addEventListener:  (...args) => store.addEventListener(...args),
                // @ts-ignore - spread forwarding of variadic args; types are guaranteed by MessageStore
                removeEventListener: (...args) => store.removeEventListener(...args),
            };

            // @ts-ignore - Proxy wraps MessageStore; return type is the proxied store interface, not ProxyConstructor
            return new Proxy(store, {
                set(target, name, value) {
                    if (typeof value === 'function') {
                        // @ts-ignore - name is string|symbol; Map.set accepts both at runtime
                        if (!RESERVED.has(name)) {
                            target.handlers.set(name, value);
                        } else if (name === 'onmessage') {
                            store.onmessage = value;
                        }
                        return true;
                    }
                    if (value === false) {
                        // @ts-ignore - name is string|symbol; RESERVED Set contains strings, runtime comparison is valid
                        if (!RESERVED.has(name)) {
                            target.handlers.delete(name);
                        } else if (name === 'onmessage') {
                            store.onmessage = () => {};
                        }
                        return true;
                    }
                    return false;
                },
                get(target, name) {
                    // @ts-ignore - name is string|symbol; Map.has/get accepts both at runtime
                    if (target.handlers.has(name)) return target.handlers.get(name);
                    // @ts-ignore - name is string|symbol; RESERVED Set.has accepts string, runtime comparison is valid
                    if (RESERVED.has(name))         return reserved[/** @type {string} */ (name)] ?? false;
                    return false;
                },
            });
        };

        // ── worker() ───────────────────────────────────────────────────────────

        /**
         * Creates a process proxy bound to a real Worker global.
         * @returns {Proxy}
         */
        const worker = () => {
            const store = {
                handlers:          new Map(),
                onmessage:         () => {},
                // @ts-ignore - spread forwarding of worker postMessage args; types are valid at runtime
                postMessage:       (...args) => self.postMessage(...args),
                addEventListener:  noop,
                removeEventListener: noop,
                listeners:         /** @type {Array<function(*):void>} */ ([]),
            };

            const process = createProcessProxy(store);
            wireListeners(store);

            self.addEventListener('message', (event) => {
                if (event && event.data !== undefined) {
                    if (isFwMessage(event.data)) event.stopImmediatePropagation();
                    dispatch(store, event);
                }
            });

            return process;
        };

        // ── workerCommand() ────────────────────────────────────────────────────

        /**
         * Creates a command-sender proxy to a worker.
         * @param {WorkerLike} workerRef
         * @returns {Proxy}
         */
        const workerCommand = (workerRef) => {
            // @ts-ignore - Proxy wraps empty frozen object; return type is the command dispatcher, not ProxyConstructor
            return new Proxy(Object.freeze({}), {
                set: () => false,
                get: (_t, name) =>
                    (message, transferList = []) =>
                        workerRef.postMessage(
                            {[FW_FLAG]: true, __type: FW_TYPE_CMD, name, msg: message},
                            transferList,
                        ),
            });
        };

        /**
         * Resolves modules and prepares a worker process for framework usage.
         * @param {RuntimeLike} runtime
         * @param {string[]} modules
         * @param {any} args
         * @returns {{ libs: object, process: Proxy, args: any }}
         */
        const workerFramework = (runtime, modules, args) => {
            const libs    = runtime.resolveAll(modules);
            const process = libs.processMessage.worker();
            return { libs, process, args };
        };



        /**
         * Creates a synchronous in-memory channel between process and manager.
         * @returns {{ process: Proxy, manager: MessageStore }}
         */
        const sync = () => {


            const makeStore = () => ({
                handlers:          new Map(),
                onmessage:         noop,
                postMessage:       noop,
                addEventListener:  noop,
                removeEventListener: noop,
                listeners:         [],
            });

            const syncStore    = makeStore();
            const managerStore = makeStore();

            syncStore.postMessage = (data, ports) =>
                dispatch(managerStore, { data, ports });
            wireListeners(syncStore);

            managerStore.postMessage = (data, ports) =>
                dispatch(syncStore, { data, ports });
            wireListeners(managerStore);

            return {
                process: createProcessProxy(syncStore),
                manager: managerStore,
            };
        };

        return { sync, worker, workerCommand, workerFramework };
    }
}

/**
 * @typedef {object} MessageEventLike
 * @property {any} [data]
 * @property {any} [ports]
 * @property {function():void} [stopImmediatePropagation]
 */
/**
 * @typedef {object} MessageStore
 * @property {Map<any, any>} handlers
 * @property {function(MessageEventLike):void} onmessage
 * @property {function(any, any=):void} postMessage
 * @property {function(string, function(MessageEventLike):void):void} addEventListener
 * @property {function(string, function(MessageEventLike):void):void} removeEventListener
 * @property {Array<function(MessageEventLike):void>} listeners
 */
/**
 * @typedef {object} WorkerLike
 * @property {function(any, any=):void} postMessage
 */
/**
 * @typedef {object} RuntimeLike
 * @property {function(string[]):object} resolveAll
 */
