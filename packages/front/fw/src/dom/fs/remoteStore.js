// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Remote key-value store with pluggable transport (HTTP or WebSocket).
 *
 * In HTTP mode (default), each operation is an independent request:
 *   GET /{key}, PUT /{key}, DELETE /{key}, GET / (list), POST /batch.
 * A single automatic retry is performed on transient network errors;
 * HTTP errors (4xx/5xx) are forwarded directly to the caller.
 *
 * In WebSocket mode, operations are sent as lightweight JSON-RPC messages
 * (shape `{ id, op, key, value? }`). Initial authentication is sent as the
 * first message (`{ op: 'auth', token }`). Exponential reconnection
 * (capped at 30s) is handled automatically; each attempt emits
 * `eventBus.emit('remoteStore:reconnect', { endpoint, attempt })`, where
 * `attempt: N` denotes the attempt being scheduled.
 *
 * `watch(pattern, fn)` is WS-only; a pattern such as `'sess:*'` matches
 * changes whose key starts with `'sess:'`.
 *
 * Out of MVP scope: conflict resolution (handled by `sde_task_sync`),
 * CBOR serialisation (`encoding: 'cbor'` option reserved, MVP = JSON only).
 *
 * @example
 * const remoteStore = runtime.resolve('remoteStore');
 * const store = remoteStore.create({ endpoint: 'https://api.example.com/store', auth: 'my-token' });
 * await store.set('user:1', { name: 'Alice' });
 * const user = await store.get('user:1');
 * store.close();
 */

/**
 * @typedef {Object} RemoteStoreInstance
 * @property {function(string): Promise<*>} get
 * @property {function(string, *): Promise<void>} set
 * @property {function(string): Promise<void>} [del]
 * @property {function(string): Promise<void>} delete
 * @property {function(Object=): Promise<{keys: string[], cursor?: string}>} list
 * @property {function(Object): Promise<Object>} batch
 * @property {function(string, function): function} watch
 * @property {function(): void} close
 * @property {function(): boolean} [connected]
 */

/**
 * Public surface returned by the remoteStore factory.
 * @typedef {object} RemoteStoreAPI
 * @property {(opts: { endpoint: string, auth?: string, transport?: 'http'|'ws', headers?: object }) => RemoteStoreInstance} create - Create a remote key-value store instance over the chosen transport.
 */

import { ajax } from '../net/ajax.js';
import { ws } from '../net/ws.js';
import { eventBus } from '../../io/utils/eventBus.js';

export const remoteStore = {
    name: 'remoteStore',
    version: '1.0.0',
    type: 'fw.dom.fs',
    dependencies: ['ajax', 'ws', 'eventBus'],
    deps: [ajax, ws, eventBus],

    /**
     * @param {object} ajaxFactory - The ajax module (returns a create function).
     * @param {object} wsFactory   - The ws module (returns a create function).
     * @param {object} eventBus    - The eventBus module.
     * @returns {RemoteStoreAPI}
     */
    factory(ajaxFactory, wsFactory, eventBus) {

        // --- Internal helpers ---

        /**
         * Simple glob pattern match (`prefix:*`) against a key.
         * Only the `*` wildcard (matches anything) is supported client-side.
         *
         * @param {string} pattern
         * @param {string} key
         * @returns {boolean}
         */
        function matchPattern(pattern, key) {
            if (pattern === '*') return true;
            if (!pattern.includes('*')) return pattern === key;
            // Translate the pattern to a RegExp: 'sess:*' -> /^sess:.*$/
            const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            return new RegExp('^' + escaped + '$').test(key);
        }

        /**
         * Returns true if `err` looks like a transient fetch network error
         * (the only case we want to retry). A network failure from `fetch`
         * surfaces as a `TypeError` with no `status` property; HttpErrors
         * carry a numeric `status`, and JSON-serialisation `TypeError`s
         * thrown by callers carry neither a fetch-style message nor `status`
         * but also do not match our message hint.
         *
         * @param {*} err
         * @returns {boolean}
         */
        function _isTransientNetworkError(err) {
            if (!(err instanceof TypeError)) return false;
            // @ts-ignore - Error.status is a non-standard but common extension on HTTP errors
            if (err.status !== undefined) return false;
            // fetch network failures: 'Failed to fetch', 'NetworkError when…',
            // 'Load failed', or anything containing 'fetch' / 'network'.
            const msg = (err.message || '').toLowerCase();
            return msg.includes('fetch') || msg.includes('network') || msg.includes('load failed');
        }

        /**
         * Creates a remote store instance.
         *
         * @param {object}  opts
         * @param {string}  opts.endpoint           - Base URL (HTTP) or WS URL.
         * @param {string}  [opts.auth]              - Bearer token / WS auth token.
         * @param {'http'|'ws'} [opts.transport='http'] - Transport to use.
         * @param {object}  [opts.headers]           - Additional HTTP headers.
         * @returns {RemoteStoreInstance}
         */
        function create(opts) {
            if (!opts || typeof opts.endpoint !== 'string') {
                throw new Error('remoteStore.create: opts.endpoint (string) is required');
            }

            const transport = opts.transport || 'http';
            const endpoint  = opts.endpoint;
            const auth      = opts.auth || null;
            const extraHeaders = opts.headers || {};

            if (transport !== 'http' && transport !== 'ws') {
                throw new Error('remoteStore.create: transport must be "http" or "ws"');
            }

            // ----------------------------------------------------------------
            // HTTP transport
            // ----------------------------------------------------------------
            if (transport === 'http') {
                const headers = { ...extraHeaders };
                if (auth) headers['Authorization'] = 'Bearer ' + auth;

                const http = ajaxFactory(endpoint, { headers });

                /**
                 * Executes an HTTP call with 1 retry on transient network errors.
                 *
                 * @param {function(): Promise<*>} fn
                 * @returns {Promise<*>}
                 */
                async function withRetry(fn) {
                    try {
                        return await fn();
                    } catch (err) {
                        // Retry only on transient fetch network errors.
                        // HttpErrors (with `status`) and unrelated TypeErrors
                        // (e.g. JSON serialisation bugs) are not retried.
                        if (_isTransientNetworkError(err)) {
                            return fn();
                        }
                        throw err;
                    }
                }

                return {
                    /**
                     * Reads the value bound to `key`.
                     * Resolves with `null` if the key does not exist (404).
                     *
                     * @param {string} key
                     * @returns {Promise<*>}
                     */
                    async get(key) {
                        try {
                            return await withRetry(() => http.get(key));
                        } catch (err) {
                            if (err && err.status === 404) return null;
                            throw err;
                        }
                    },

                    /**
                     * Writes `value` under `key` (PUT).
                     *
                     * @param {string} key
                     * @param {*}      value
                     * @returns {Promise<void>}
                     */
                    set(key, value) {
                        return withRetry(() => http.put(key, value));
                    },

                    /**
                     * Deletes the key `key` (DELETE).
                     *
                     * @param {string} key
                     * @returns {Promise<void>}
                     */
                    delete(key) {
                        return withRetry(() => http.del(key));
                    },

                    /**
                     * Lists keys with cursor-based pagination.
                     *
                     * @note When `params` is omitted, the call targets `'/'`
                     *   (server should treat this as the list root).
                     * @param {{ prefix?: string, limit?: number, cursor?: string }} [params]
                     * @returns {Promise<{ keys: string[], cursor?: string }>}
                     */
                    list(params) {
                        const qs = [];
                        if (params) {
                            if (params.prefix !== undefined) qs.push('prefix=' + encodeURIComponent(params.prefix));
                            if (params.limit  !== undefined) qs.push('limit='  + encodeURIComponent(params.limit));
                            if (params.cursor !== undefined) qs.push('cursor=' + encodeURIComponent(params.cursor));
                        }
                        const queryString = qs.length ? '?' + qs.join('&') : '';
                        return withRetry(() => http.get(queryString || '/'));
                    },

                    /**
                     * Executes a batch of operations (best-effort sequential in HTTP).
                     * Each operation is `{ op: 'set'|'delete', key, value? }`.
                     *
                     * HTTP semantics: operations are sent sequentially via a
                     * POST /batch. No server-side atomicity is guaranteed in HTTP -
                     * use the WS transport for atomic semantics.
                     *
                     * @param {Array<{ op: string, key: string, value?: * }>} ops
                     * @returns {Promise<void>}
                     */
                    batch(ops) {
                        return withRetry(() => http.post('batch', { ops }));
                    },

                    /**
                     * Not supported in HTTP mode.
                     * @returns {function} No-op off function.
                     */
                    watch(_pattern, _fn) {
                        // watch requires WS - no-op in HTTP
                        return function off() {};
                    },

                    /**
                     * Always `true` in HTTP (no persistent connection).
                     * @returns {boolean}
                     */
                    connected() {
                        return true;
                    },

                    /**
                     * No-op in HTTP.
                     */
                    close() {}
                };
            }

            // ----------------------------------------------------------------
            // WebSocket transport
            // ----------------------------------------------------------------

            let _connected  = false;
            let _terminated = false;
            let _attempt    = 0;
            let _retryTimer = null;

            // Pending RPC calls: Map<id, { resolve, reject }>
            const _pending = new Map();
            // Watch handlers: Array<{ pattern, fn }>
            const _watchers = [];
            // Counter for RPC message ids
            let _idCounter = 0;

            let _socket = null;

            function _nextId() {
                _idCounter = (_idCounter + 1) % 2147483647;
                return _idCounter;
            }

            function _connect() {
                if (_terminated) return;

                const conn = wsFactory(endpoint);
                _socket = conn;

                conn.on('open', () => {
                    _connected = true;
                    _attempt = 0;
                    // Initial auth if token provided
                    if (auth) {
                        conn.send(JSON.stringify({ op: 'auth', token: auth }));
                    }
                });

                conn.on('message', (data) => {
                    let msg;
                    try {
                        msg = JSON.parse(typeof data === 'string' ? data : String(data));
                    } catch {
                        return;
                    }

                    // Response to a pending RPC
                    if (msg.id !== undefined && _pending.has(msg.id)) {
                        const { resolve, reject } = _pending.get(msg.id);
                        _pending.delete(msg.id);
                        if (msg.error) {
                            reject(new Error(msg.error));
                        } else {
                            resolve(msg.result !== undefined ? msg.result : null);
                        }
                        return;
                    }

                    // Change notification (watch)
                    if (msg.op === 'change' && msg.key !== undefined) {
                        for (const { pattern, fn } of _watchers) {
                            if (matchPattern(pattern, msg.key)) {
                                fn(msg);
                            }
                        }
                    }
                });

                conn.on('close', () => {
                    _connected = false;
                    _socket = null;

                    // Reject all pending RPCs
                    for (const [id, { reject }] of _pending) {
                        _pending.delete(id);
                        reject(new Error('remoteStore: WebSocket connection closed'));
                    }

                    if (!_terminated) {
                        // Exponential reconnect (max 30s). `_attempt` is
                        // pre-incremented so the emitted value matches the
                        // attempt whose delay was just scheduled: first
                        // close -> attempt: 1, delay = 500 * 2^0 = 500ms.
                        _attempt++;
                        const delay = Math.min(30000, 500 * Math.pow(2, _attempt - 1));
                        eventBus.emit('remoteStore:reconnect', { endpoint, attempt: _attempt });
                        _retryTimer = setTimeout(_connect, delay);
                    }
                });

                conn.on('error', () => {
                    // Errors are followed by a close - handled in onclose
                });
            }

            _connect();

            /**
             * Sends an RPC message and waits for the response.
             *
             * @param {object} msg - Message without `id` (added here).
             * @returns {Promise<*>}
             */
            function _rpc(msg) {
                return new Promise((resolve, reject) => {
                    if (_terminated) {
                        return reject(new Error('remoteStore: store is closed'));
                    }
                    if (!_connected || !_socket) {
                        return reject(new Error('remoteStore: not connected'));
                    }
                    const id = _nextId();
                    _pending.set(id, { resolve, reject });
                    _socket.send(JSON.stringify({ ...msg, id }));
                });
            }

            return {
                /**
                 * Reads the value bound to `key` via WS RPC `get`.
                 *
                 * @param {string} key
                 * @returns {Promise<*>}
                 */
                get(key) {
                    return _rpc({ op: 'get', key });
                },

                /**
                 * Writes `value` under `key` via WS RPC `set`.
                 *
                 * @param {string} key
                 * @param {*}      value
                 * @returns {Promise<void>}
                 */
                set(key, value) {
                    return _rpc({ op: 'set', key, value });
                },

                /**
                 * Deletes the key `key` via WS RPC `delete`.
                 *
                 * @param {string} key
                 * @returns {Promise<void>}
                 */
                delete(key) {
                    return _rpc({ op: 'delete', key });
                },

                /**
                 * Lists keys via WS RPC `list`.
                 *
                 * @param {{ prefix?: string, limit?: number, cursor?: string }} [params]
                 * @returns {Promise<{ keys: string[], cursor?: string }>}
                 */
                list(params) {
                    return _rpc({ op: 'list', ...params });
                },

                /**
                 * Executes an atomic batch of operations via WS RPC `batch`.
                 *
                 * WS semantics: operations are sent in a single
                 * `{ op: 'batch', ops: [...] }` message. Atomicity is
                 * guaranteed server-side.
                 *
                 * @param {Array<{ op: string, key: string, value?: * }>} ops
                 * @returns {Promise<void>}
                 */
                batch(ops) {
                    return _rpc({ op: 'batch', ops });
                },

                /**
                 * Subscribes `fn` to changes whose key matches `pattern`.
                 * Pattern `'sess:*'` matches every key starting with `'sess:'`.
                 * Returns an `off()` function to unsubscribe.
                 *
                 * @param {string}   pattern
                 * @param {function} fn
                 * @returns {function} off
                 */
                watch(pattern, fn) {
                    const entry = { pattern, fn };
                    _watchers.push(entry);
                    return function off() {
                        const idx = _watchers.indexOf(entry);
                        if (idx > -1) _watchers.splice(idx, 1);
                    };
                },

                /**
                 * Reports whether the WS connection is active.
                 * @returns {boolean}
                 */
                connected() {
                    return _connected;
                },

                /**
                 * Permanently closes the store: cancels reconnection,
                 * flushes pending RPCs, and closes the socket.
                 */
                close() {
                    _terminated = true;
                    clearTimeout(_retryTimer);
                    // Reject remaining pending RPCs
                    for (const [id, { reject }] of _pending) {
                        _pending.delete(id);
                        reject(new Error('remoteStore: store closed'));
                    }
                    _watchers.length = 0;
                    if (_socket) {
                        _socket.close();
                        _socket = null;
                    }
                    _connected = false;
                }
            };
        }

        return { create };
    }
};
