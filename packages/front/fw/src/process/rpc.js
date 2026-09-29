// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal RPC system that proxies an object across a Worker boundary
 * (or an in-memory sync channel) via a single MessageChannel.
 *
 * Main thread:  processRPC.create(targetObj)  → { port, close }
 * Worker side:  processRPC.open(port, opts?)  → Promise<Proxy>
 *
 * The object descriptor is sent automatically through the channel -
 * the caller never handles it.
 */

/**
 * Public API returned by `processRPC.factory()`.
 *
 * @typedef {object} ProcessRPCAPI
 * @property {(target: object) => { port: MessagePort[], close: () => void }} create
 *   Expose `target` for RPC; returns the transferable port(s) and a `close` disposer.
 * @property {(port: MessagePort, options?: { timeout?: number }) => Promise<any>} open
 *   Open an RPC channel and resolve to a nested Proxy whose calls/value-gets return Promises.
 */
export const processRPC = {
    name: 'processRPC',
    version: '1.0.0',
    type: 'fw.process',
    dependencies: [],

    /** @returns {ProcessRPCAPI} */
    factory() {
        const MAX_DEPTH       = 8;
        const LEAF_FN         = 'fn';
        const LEAF_VAL        = 'val';
        const RPC_INIT        = '__rpc_init';
        const DEFAULT_TIMEOUT = 30000;

        /** Property names that must never be exposed or traversed. */
        const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

        /**
         * Properties that JS engines may probe automatically (await,
         * JSON.stringify, console.log …).  Must return undefined, not throw.
         */
        const JS_INTERNAL = new Set([
            'then', 'toJSON', 'valueOf', 'toString',
            'inspect', 'nodeType', 'asymmetricMatch',
        ]);

        // ── Introspection ──────────────────────────────────────────────────

        /**
         * Recursively builds a serializable descriptor mirroring the shape
         * of `obj`. Leaves are tagged 'fn' or 'val'; sub-objects become
         * nested descriptors (namespaces).
         *
         * @param {object} obj
         * @param {number} depth
         * @returns {RPCDescriptor|null}
         */
        const introspect = (obj, depth = 0) => {
            if (depth > MAX_DEPTH || obj === null || typeof obj !== 'object') return null;

            const desc = Object.create(null);
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN.has(key)) continue;
                const val = obj[key];
                if (typeof val === 'function') {
                    desc[key] = LEAF_FN;
                } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                    const sub = introspect(val, depth + 1);
                    if (sub) desc[key] = sub;
                } else {
                    desc[key] = LEAF_VAL;
                }
            }
            return desc;
        };

        // ── Path resolution ────────────────────────────────────────────────

        /**
         * Safely traverses `target` along `path`.
         * Returns `{ ok: true, value }` on success, `{ ok: false }` when any
         * segment is missing, forbidden, or leads through a non-object.
         *
         * @param {object} target
         * @param {string[]} path
         * @returns {{ ok: boolean, value?: any }}
         */
        const resolve = (target, path) => {
            let node = target;
            for (const key of path) {
                if (typeof key !== 'string' || FORBIDDEN.has(key)) return { ok: false };
                if (node === null || typeof node !== 'object')      return { ok: false };
                if (!Object.prototype.hasOwnProperty.call(node, key)) return { ok: false };
                node = node[key];
            }
            return { ok: true, value: node };
        };

        // ── create() - host / main-thread side ────────────────────────────

        /**
         * Exposes `target` for RPC. The object descriptor is pushed through
         * the channel automatically - the consumer just calls `open(port)`.
         *
         * @param {object} target The object to expose.
         * @returns {{ port: MessagePort[], close: function(): void }}
         */
        const create = (target) => {
            const info    = introspect(target);
            const channel = new MessageChannel();

            // Push descriptor through the channel.
            // It is queued until port2 is started (onmessage assignment).
            channel.port1.postMessage({ [RPC_INIT]: true, desc: info });

            channel.port1.onmessage = async (event) => {
                const msg = event.data;

                // Validate request shape
                if (
                    msg === null   || typeof msg !== 'object' ||
                    typeof msg.id !== 'number' || !Array.isArray(msg.path)
                ) return;

                const { id, path, args } = msg;

                try {
                    const ref = resolve(target, path);
                    if (!ref.ok) {
                        channel.port1.postMessage({ id, error: 'Path not found: ' + path.join('.') });
                        return;
                    }

                    const result = typeof ref.value === 'function'
                        ? await ref.value(...(Array.isArray(args) ? args : []))
                        : ref.value;

                    channel.port1.postMessage({ id, result });
                } catch (err) {
                    channel.port1.postMessage({ id, error: String(err) });
                }
            };

            return {
                port:  [channel.port2],
                close: () => { channel.port1.close(); },
            };
        };

        // ── open() - consumer / worker side ────────────────────────────────

        /**
         * Opens an RPC channel. Waits for the descriptor sent by `create()`,
         * then returns a nested Proxy whose every call/value access is
         * forwarded as an RPC request and returns a Promise.
         *
         * @param {MessagePort} port The transferred port.
         * @param {object} [options]
         * @param {number} [options.timeout=30000] ms before a call or
         *   the initial handshake is considered failed.
         * @returns {Promise<Proxy>}
         */
        const open = (port, options = {}) => {
            const timeout = typeof options.timeout === 'number' && options.timeout > 0
                ? options.timeout
                : DEFAULT_TIMEOUT;

            const pending = new Map();
            let nextId = 0;

            // ── response handler (set after handshake) ────────────────────

            const onResponse = (event) => {
                const { id, result, error } = event.data;
                const entry = pending.get(id);
                if (!entry) return;
                pending.delete(id);
                clearTimeout(entry.timer);

                if (error !== undefined) {
                    entry.reject(new Error(error));
                } else {
                    entry.resolve(result);
                }
            };

            // ── call helper ───────────────────────────────────────────────

            /**
             * Sends an RPC request and returns a Promise.
             * Rejects with a timeout error if no response arrives in time.
             *
             * @param {string[]} path
             * @param {any[]} args
             * @returns {Promise<any>}
             */
            const call = (path, args) => {
                const id = nextId++;
                if (nextId > 0xFFFFFFFF) nextId = 0;

                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        pending.delete(id);
                        reject(new Error('RPC timeout: ' + path.join('.')));
                    }, timeout);

                    pending.set(id, { resolve, reject, timer });
                    port.postMessage({ id, path, args });
                });
            };

            // ── proxy builder ─────────────────────────────────────────────

            /**
             * Recursively builds a Proxy that mirrors the descriptor tree.
             *  - 'fn'       -> returns (...args) => Promise
             *  - 'val'      -> property-get returns Promise
             *  - namespace  -> returns a deeper Proxy
             *  - unknown    -> throws (endpoint not found)
             *
             * @param {RPCDescriptor} desc
             * @param {string[]} path
             * @returns {Proxy}
             */
            const buildProxy = (desc, path) => {
                return new Proxy(Object.create(null), {
                    get(_, key) {
                        if (typeof key === 'symbol') return undefined;
                        if (FORBIDDEN.has(key))      return undefined;

                        const node = desc[key];
                        if (node === undefined) {
                            // Let JS-internal probes pass silently
                            if (JS_INTERNAL.has(key)) return undefined;
                            throw new Error('RPC endpoint not found: ' + [...path, key].join('.'));
                        }

                        if (node === LEAF_FN) {
                            return (...args) => call([...path, key], args);
                        }
                        if (node === LEAF_VAL) {
                            return call([...path, key], []);
                        }

                        // namespace → sub-proxy
                        return buildProxy(node, [...path, key]);
                    },
                    set() { return false; },
                    has(_, key) {
                        if (typeof key === 'symbol') return false;
                        return key in desc;
                    },
                });
            };

            // ── handshake: wait for descriptor ────────────────────────────

            return new Promise((resolve, reject) => {
                const initTimer = setTimeout(() => {
                    port.onmessage = null;
                    reject(new Error('RPC open timeout: descriptor not received'));
                }, timeout);

                port.onmessage = (event) => {
                    const msg = event.data;
                    if (msg && msg[RPC_INIT] === true && msg.desc) {
                        clearTimeout(initTimer);
                        port.onmessage = onResponse;
                        resolve(buildProxy(msg.desc, []));
                    }
                };
            });
        };

        return { create, open };
    },
};

/**
 * @typedef {object} RPCDescriptor
 * @property {string|RPCDescriptor} [key]
 */
