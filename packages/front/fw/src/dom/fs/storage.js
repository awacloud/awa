// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Web Storage service wrapping `localStorage` and `sessionStorage`
 * with JSON serialisation, existence checks, key enumeration, a named
 * change-callback registry, and optional cross-tab diffusion via BroadcastChannel.
 *
 * Each namespace (`local`, `session`) is `null` when the corresponding backend
 * is unavailable or blocked (e.g. private browsing, sandboxed iframe, quota
 * exceeded on probe).
 *
 * ## Change notification
 *
 * Every mutation (`set`, `del`, `clear`) dispatches a normalised event to all
 * registered callbacks **in the same tab immediately**.
 *
 * For `localStorage`, cross-tab diffusion is handled via **BroadcastChannel**
 * (when supported and `crossTab !== false`).  A native `storage` DOM event
 * fallback is used only when BroadcastChannel is not available in the
 * environment.
 *
 * `sessionStorage` never uses BroadcastChannel nor the native `storage` event
 * (each tab has its own isolated session by design).
 *
 * Callbacks receive: `{ type: 'set'|'del'|'clear', key: string|null, value: *, cross: boolean }`
 * where `cross: true` indicates the change originated in another tab.
 *
 * ## Configuration
 *
 * Call `storage.configure({ crossTab, namespace })` **before** the first
 * `listen.add` to customise cross-tab behaviour:
 *
 * - `crossTab: boolean` (default `true`) - set to `false` to disable all
 *   cross-tab diffusion.
 * - `namespace: string` (default `''`) - prefixes the BroadcastChannel name to
 *   isolate diffusion between authenticated user sessions sharing the same
 *   browser origin.
 *
 */

/**
 * @typedef {Object} StorageNamespace
 * @property {function(string): *} get
 * @property {function(string, *): void} set
 * @property {function(string): void} del
 * @property {function(): void} clear
 * @property {function(): string[]} keys
 * @property {function(string): boolean} has
 * @property {function(string, function): function} [on]
 * @property {function(string): void} [off]
 * @property {number} length
 * @property {Object} listen
 */

/**
 * Object returned by `storage.factory()`.
 *
 * @typedef {Object} StorageAPI
 * @property {StorageNamespace|null} local Persistent storage backed by `localStorage`; `null` when unavailable.
 * @property {StorageNamespace|null} session Session-scoped storage backed by `sessionStorage`; `null` when unavailable.
 * @property {() => boolean} isSupported `true` when at least one storage backend is available.
 * @property {(opts?: { crossTab?: boolean, namespace?: string }) => void} configure Configure cross-tab diffusion (must be called before any `local.listen.add`).
 */

import { broadcastChannel } from '../net/broadcastChannel.js';

export const storage = {
    name: 'storage',
    version: '1.0.0',
    type: 'fw.dom.fs',
    dependencies: ['broadcastChannel'],
    deps: [broadcastChannel],

    /** @returns {StorageAPI} */
    factory(broadcastChannel) {

        // --- Shared configuration state ---

        const _config = { crossTab: true, namespace: '' };

        /**
         * Configure cross-tab diffusion options.
         * Must be called before any `listen.add` on `local`.
         *
         * @param {{ crossTab?: boolean, namespace?: string }} opts
         */
        function configure({ crossTab, namespace } = {}) {
            if (_localCallbackCount() > 0) {
                throw new Error('storage: configure must be called before any listen.add');
            }
            if (namespace !== undefined) {
                if (typeof namespace !== 'string' || namespace.includes(':')) {
                    throw new Error('storage: namespace must be a string without ":"');
                }
                _config.namespace = namespace;
            }
            if (crossTab !== undefined) {
                if (typeof crossTab !== 'boolean') {
                    throw new Error('storage: crossTab must be a boolean');
                }
                _config.crossTab = crossTab;
            }
        }

        // --- Internal ---

        /**
         * Attempt a write/remove cycle to verify that a Storage backend is
         * accessible. Returns `false` on `SecurityError` (private browsing),
         * `QuotaExceededError`, or any other exception.
         *
         * @param {Storage} store
         * @returns {boolean}
         */
        function probe(store) {
            try {
                const k = '__probe__';
                store.setItem(k, k);
                store.removeItem(k);
                return true;
            } catch {
                return false;
            }
        }

        /**
         * Deserialise a raw storage string.
         * Returns the original string when it is not valid JSON so that
         * pre-serialisation data is never silently lost.
         *
         * @param {string} raw
         * @returns {*}
         */
        function tryParse(raw) {
            try { return JSON.parse(raw); } catch { return raw; }
        }

        // Track the local instance's callback count for configure() guard.
        let _localCallbacksRef = null;
        function _localCallbackCount() {
            if (!_localCallbacksRef) return 0;
            return _localCallbacksRef.map.length;
        }

        /**
         * Wrap a native `Storage` object with an enhanced API including a
         * named change-callback registry.
         *
         * @param {Storage} store
         * @param {'local'|'session'} kind
         * @returns {StorageNamespace}
         */
        function wrap(store, kind) {

            // Named callback registry - same structure as fullscreen.js
            const callbacks = {
                map:  [],  // insertion-ordered names
                list: {}   // name → fn
            };

            // For 'local' kind, expose callback registry ref to configure() guard.
            if (kind === 'local') {
                _localCallbacksRef = callbacks;
            }

            let nativeListenerActive = false;
            let _bc = null;

            /**
             * Dispatch a normalised change event to all registered callbacks.
             *
             * @param {'set'|'del'|'clear'} type
             * @param {string|null}         key
             * @param {*}                   value - Already deserialised.
             * @param {boolean}             cross - `true` when from another tab.
             */
            function dispatch(type, key, value, cross) {
                const evt = { type, key, value, cross };
                for (let i = 0; i < callbacks.map.length; i++) {
                    callbacks.list[callbacks.map[i]](evt);
                }
            }

            /**
             * Native `storage` event handler (fallback when BC is not supported).
             * Filters by `storageArea` so the correct namespace receives the event
             * even when both `localStorage` and `sessionStorage` have listeners.
             *
             * @param {StorageEvent} e
             */
            function onStorageEvent(e) {
                if (e.storageArea !== store) return;
                if (e.key === null) {
                    dispatch('clear', null, null, true);
                } else if (e.newValue === null) {
                    dispatch('del', e.key, null, true);
                } else {
                    dispatch('set', e.key, tryParse(e.newValue), true);
                }
            }

            /**
             * Build the BroadcastChannel name for local storage.
             * @returns {string}
             */
            function channelName() {
                return _config.namespace
                    ? `storage:${_config.namespace}:local`
                    : 'storage:local';
            }

            /**
             * Activate cross-tab transport on the first listen.add (local only).
             */
            function activateCrossTab() {
                if (kind !== 'local') return;
                if (!_config.crossTab) return;

                if (broadcastChannel.isSupported()) {
                    // Use BroadcastChannel - do NOT activate native storage event.
                    _bc = broadcastChannel.create(channelName());
                    _bc.on(data => dispatch(data.type, data.key, data.value, true));
                } else {
                    // Fallback: native storage event.
                    window.addEventListener('storage', onStorageEvent, false);
                    nativeListenerActive = true;
                }
            }

            /**
             * Deactivate cross-tab transport when the last listener is removed (local only).
             */
            function deactivateCrossTab() {
                if (kind !== 'local') return;

                if (_bc) {
                    _bc.close();
                    _bc = null;
                } else if (nativeListenerActive) {
                    window.removeEventListener('storage', onStorageEvent, false);
                    nativeListenerActive = false;
                }
            }

            /**
             * Post a mutation to the BroadcastChannel (local only, when BC active).
             *
             * @param {'set'|'del'|'clear'} type
             * @param {string|null} key
             * @param {*} value
             */
            function postMutation(type, key, value) {
                if (kind === 'local' && _bc) {
                    _bc.post({ type, key, value });
                }
                // When native storage event is the fallback, the write already
                // triggers the event in other tabs automatically - no explicit post needed.
            }

            return {

                /**
                 * Persist `value` under `key`.
                 * Any JSON-serialisable value is accepted.
                 * Dispatches a `'set'` change event to all registered callbacks.
                 *
                 * @param {string} key
                 * @param {*}      value
                 */
                set(key, value) {
                    store.setItem(key, JSON.stringify(value));
                    dispatch('set', key, value, false);
                    postMutation('set', key, value);
                },

                /**
                 * Retrieve the value stored under `key`.
                 * Returns `null` when the key is absent.
                 * Returns the raw string when the stored value is not valid JSON.
                 *
                 * @param {string} key
                 * @returns {* | null}
                 */
                get(key) {
                    const raw = store.getItem(key);
                    return raw === null ? null : tryParse(raw);
                },

                /**
                 * Return `true` when `key` is present in this storage.
                 *
                 * @param {string} key
                 * @returns {boolean}
                 */
                has(key) {
                    return store.getItem(key) !== null;
                },

                /**
                 * Remove the entry identified by `key`.
                 * No-op when the key does not exist.
                 * Dispatches a `'del'` change event.
                 *
                 * @param {string} key
                 */
                del(key) {
                    store.removeItem(key);
                    dispatch('del', key, null, false);
                    postMutation('del', key, null);
                },

                /**
                 * Remove all entries from this storage namespace.
                 * Dispatches a `'clear'` change event.
                 */
                clear() {
                    store.clear();
                    dispatch('clear', null, null, false);
                    postMutation('clear', null, null);
                },

                /**
                 * Return an array of all stored keys in insertion order.
                 *
                 * @returns {string[]}
                 */
                keys() {
                    const result = [];
                    for (let i = 0; i < store.length; i++) {
                        result.push(store.key(i));
                    }
                    return result;
                },

                /**
                 * Number of entries currently stored.
                 * @type {number}
                 */
                get length() {
                    return store.length;
                },

                /**
                 * Named change-callback registry.
                 *
                 * Callbacks fire after every `set`, `del`, and `clear` call in
                 * the **same tab** and, for `localStorage`, also when another
                 * tab mutates the same origin's storage (`cross: true`).
                 *
                 * Note: `sessionStorage` changes never fire cross-tab (each tab
                 * has its own isolated session); `cross` will always be `false`
                 * for `session` namespace callbacks.
                 *
                 * Each callback receives:
                 * `{ type: 'set'|'del'|'clear', key: string|null, value: *, cross: boolean }`
                 */
                listen: {

                    /**
                     * Register a named change callback.
                     * Re-registering the same `name` replaces its function.
                     * For `local`: activates cross-tab transport on the first call
                     * (BroadcastChannel when supported, native `storage` event as fallback).
                     *
                     * @param {string}   name
                     * @param {function({ type, key, value, cross }): void} fn
                     */
                    add(name, fn) {
                        const wasEmpty = callbacks.map.length === 0;
                        if (callbacks.map.indexOf(name) < 0) {
                            callbacks.map.push(name);
                        }
                        callbacks.list[name] = fn;
                        if (wasEmpty && callbacks.map.length === 1) {
                            activateCrossTab();
                        }
                    },

                    /**
                     * Remove a named change callback.
                     * For `local`: closes BC or removes native listener when no callbacks remain.
                     * No-op when `name` is not registered.
                     *
                     * @param {string} name
                     */
                    del(name) {
                        const idx = callbacks.map.indexOf(name);
                        if (idx > -1) {
                            callbacks.map.splice(idx, 1);
                            delete callbacks.list[name];
                            if (callbacks.map.length === 0) {
                                deactivateCrossTab();
                            }
                        }
                    }
                }
            };
        }

        // --- Public API ---

        const local = (typeof localStorage !== 'undefined' && probe(localStorage))
            ? wrap(localStorage, 'local')
            : null;

        const session = (typeof sessionStorage !== 'undefined' && probe(sessionStorage))
            ? wrap(sessionStorage, 'session')
            : null;

        return {
            /** Persistent storage backed by `localStorage`. `null` when unavailable. */
            local,

            /** Session-scoped storage backed by `sessionStorage`. `null` when unavailable. */
            session,

            /**
             * Return `true` when at least one storage backend is available.
             * @returns {boolean}
             */
            isSupported() {
                return local !== null || session !== null;
            },

            /**
             * Configure cross-tab diffusion options.
             * Must be called before any `listen.add` on `local`.
             * Affects only `storage.local`; `storage.session` is always same-tab only.
             *
             * @param {{ crossTab?: boolean, namespace?: string }} opts
             * @param {boolean} [opts.crossTab=true]   - Set `false` to disable all cross-tab diffusion.
             * @param {string}  [opts.namespace='']    - BroadcastChannel name prefix (no `:` allowed).
             * @throws {Error} if called after listen.add or with invalid options.
             */
            configure
        };
    }
};
