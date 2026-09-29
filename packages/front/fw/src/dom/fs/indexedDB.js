// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @typedef {Object} IDBStoreAccessor
 * @property {function(IDBValidKey): Promise<*>} get
 * @property {function(IDBValidKey, *): Promise<IDBValidKey>} set
 * @property {function(IDBValidKey): Promise<boolean>} has
 * @property {function(IDBValidKey): Promise<void>} del
 * @property {function(): Promise<void>} clear
 * @property {function(function(*, IDBValidKey): boolean|void): Promise<void>} each
 * @property {function(IDBValidKey|IDBKeyRange=): Promise<number>} count
 * @property {function(IDBValidKey|IDBKeyRange=, number=): Promise<*[]>} getAll
 * @property {function(IDBValidKey|IDBKeyRange=, number=): Promise<IDBValidKey[]>} getAllKeys
 */

/**
 * @typedef {Object} DB
 * @property {string} name
 * @property {number} version
 * @property {string[]} storeNames
 * @property {function(string): IDBStoreAccessor} store
 * @property {function(): void} close
 * @property {{add: function(string, function): void, del: function(string): void}} listen
 */

/**
 * @fileoverview Promise-based IndexedDB service providing a clean, modern API
 * over the native IDBRequest/IDBTransaction event model.
 *
 * The factory returns an object with two entry points:
 *   - `open(name, version, upgrade, options)` - open (or create/upgrade) a database and
 *     receive a `DB` handle with per-store accessors.
 *   - `drop(name)` - permanently delete a database.
 *
 * Every store method returns a `Promise` so callers can use `async/await` or
 * chain `.then()/.catch()` without managing IDBRequest events directly.
 *
 * ## Cross-tab change notification
 *
 * Each `DB` handle exposes a named callback registry (`listen.add` / `listen.del`)
 * that fires after every mutating store operation (`set`, `del`, `clear`).
 * Callbacks run immediately in the **same tab** and are also broadcast to all
 * **other tabs** of the same origin via the `broadcastChannel` module (Chrome 54+,
 * Firefox 38+, Safari 15.4+). Cross-tab events carry `cross: true`.
 *
 * Options passed to `open`:
 *   - `crossTab` (boolean, default `true`) - set to `false` to opt-out of cross-tab
 *     notifications entirely (same-tab only).
 *   - `namespace` (string, default `''`) - prefix added to the channel name to isolate
 *     events between concurrent user sessions in the same browser.
 *
 * Callbacks receive:
 * `{ type: 'set'|'del'|'clear', store: string, key: IDBValidKey|null, cross: boolean }`
 *
 */

/**
 * Object returned by `indexedDB.factory()`.
 *
 * @typedef {Object} IndexedDBAPI
 * @property {() => boolean} isSupported `true` when IndexedDB is available in this environment.
 * @property {(name: string, version: number, upgrade?: function(IDBDatabase, number, number): void, options?: { crossTab?: boolean, namespace?: string }) => Promise<DB>} open Open (or create/upgrade) a database and resolve with a `DB` handle.
 * @property {(name: string) => Promise<void>} drop Permanently delete the named database.
 */

import { broadcastChannel } from '../net/broadcastChannel.js';

export const indexedDB = {
    name: 'indexedDB',
    version: '1.0.0',
    type: 'fw.dom.fs',
    dependencies: ['broadcastChannel'],
    deps: [broadcastChannel],

    /** @returns {IndexedDBAPI} */
    factory(broadcastChannel) {

        const idb = globalThis.indexedDB;

        // --- Internal helpers ---

        /**
         * Wrap an `IDBRequest` in a `Promise`.
         * Resolves with `request.result`; rejects with `request.error`.
         *
         * @template T
         * @param {IDBRequest<T>} req
         * @returns {Promise<T>}
         */
        function fromRequest(req) {
            return new Promise((resolve, reject) => {
                req.onsuccess = () => resolve(req.result);
                req.onerror   = () => reject(req.error);
            });
        }

        /**
         * Open a single-store transaction, execute `fn` synchronously on the
         * object store, and return a Promise wrapping both the transaction error
         * and the IDBRequest outcome.
         *
         * `fromRequest` handles the IDBRequest events; the outer Promise adds
         * transaction-level error interception.
         *
         * @template T
         * @param {IDBDatabase}            db
         * @param {string}                 storeName
         * @param {'readonly'|'readwrite'} mode
         * @param {function(IDBObjectStore): IDBRequest<T>} fn
         * @returns {Promise<T>}
         */
        function run(db, storeName, mode, fn) {
            return new Promise((resolve, reject) => {
                let tx;
                try {
                    tx = db.transaction(storeName, mode);
                } catch (err) {
                    return reject(err);
                }
                tx.onerror = () => reject(tx.error);
                fromRequest(fn(tx.objectStore(storeName))).then(resolve, reject);
            });
        }

        /**
         * Build the per-store accessor object.
         *
         * `notify` is injected by the DB handle so that successful mutations
         * can dispatch change events both locally and cross-tab.
         *
         * @param {IDBDatabase}  db
         * @param {string}       storeName
         * @param {function(string, IDBValidKey|null): void} notify
         * @returns {IDBStoreAccessor}
         */
        function createStoreAccessor(db, storeName, notify) {
            return {

                /**
                 * Retrieve the value stored under `key`.
                 * Resolves with `undefined` when the key does not exist.
                 *
                 * @param {IDBValidKey} key
                 * @returns {Promise<*>}
                 */
                get(key) {
                    return run(db, storeName, 'readonly', s => s.get(key));
                },

                /**
                 * Store `value` under `key` (insert or overwrite).
                 * Dispatches a `'set'` change notification on success.
                 *
                 * @param {IDBValidKey} key
                 * @param {*}           value
                 * @returns {Promise<IDBValidKey>} The stored key.
                 */
                set(key, value) {
                    return run(db, storeName, 'readwrite', s => s.put(value, key))
                        .then(result => { notify('set', key); return result; });
                },

                /**
                 * Delete the entry identified by `key`.
                 * No-op when the key does not exist.
                 * Dispatches a `'del'` change notification on success.
                 *
                 * @param {IDBValidKey} key
                 * @returns {Promise<void>}
                 */
                del(key) {
                    return run(db, storeName, 'readwrite', s => s.delete(key))
                        .then(result => { notify('del', key); return result; });
                },

                /**
                 * Return `true` when `key` exists in the store.
                 *
                 * @param {IDBValidKey} key
                 * @returns {Promise<boolean>}
                 */
                has(key) {
                    return run(db, storeName, 'readonly', s => s.count(key))
                        .then(n => n > 0);
                },

                /**
                 * Remove all records from the store.
                 * Dispatches a `'clear'` change notification on success.
                 *
                 * @returns {Promise<void>}
                 */
                clear() {
                    return run(db, storeName, 'readwrite', s => s.clear())
                        .then(result => { notify('clear', null); return result; });
                },

                /**
                 * Return the number of records, optionally filtered by `query`.
                 *
                 * @param {IDBValidKey | IDBKeyRange} [query]
                 * @returns {Promise<number>}
                 */
                count(query) {
                    return run(db, storeName, 'readonly', s => s.count(query));
                },

                /**
                 * Return all records, optionally filtered by `query` and
                 * limited to `count` results.
                 *
                 * @param {IDBValidKey | IDBKeyRange} [query]
                 * @param {number}                    [count]
                 * @returns {Promise<*[]>}
                 */
                getAll(query, count) {
                    return run(db, storeName, 'readonly', s => s.getAll(query, count));
                },

                /**
                 * Return all keys, optionally filtered by `query` and
                 * limited to `count` results.
                 *
                 * @param {IDBValidKey | IDBKeyRange} [query]
                 * @param {number}                    [count]
                 * @returns {Promise<IDBValidKey[]>}
                 */
                getAllKeys(query, count) {
                    return run(db, storeName, 'readonly', s => s.getAllKeys(query, count));
                },

                /**
                 * Iterate over all records using a cursor.
                 *
                 * `callback` is called synchronously for each record with
                 * `(value, key)`. Return `false` from the callback to stop early.
                 *
                 * @param {function(*, IDBValidKey): boolean | void} callback
                 * @returns {Promise<void>}
                 */
                each(callback) {
                    return new Promise((resolve, reject) => {
                        let tx;
                        try {
                            tx = db.transaction(storeName, 'readonly');
                        } catch (err) {
                            return reject(err);
                        }
                        tx.onerror = () => reject(tx.error);

                        const req = tx.objectStore(storeName).openCursor();
                        req.onsuccess = () => {
                            const cursor = req.result;
                            if (cursor && callback(cursor.value, cursor.key) !== false) {
                                cursor.continue();
                            } else {
                                resolve();
                            }
                        };
                        req.onerror = () => reject(req.error);
                    });
                }
            };
        }

        // --- Public API ---

        return {

            /**
             * Return `true` when IndexedDB is available in this environment.
             * @returns {boolean}
             */
            isSupported() {
                return !!idb;
            },

            /**
             * Open (or create / upgrade) an IndexedDB database.
             *
             * The `upgrade` callback fires inside `onupgradeneeded` when the
             * database is new or `version` is higher than the stored version.
             * Use it to create object stores and indexes via the `IDBDatabase` API.
             *
             * Version-change events from other tabs are handled automatically:
             * the connection is closed gracefully to unblock the pending upgrade.
             *
             * @param {string}  name    - Database name.
             * @param {number}  version - Schema version (positive integer ≥ 1).
             * @param {function(IDBDatabase, number, number): void} [upgrade]
             * @param {{ crossTab?: boolean, namespace?: string }} [options]
             * @returns {Promise<DB>}
             */
            open(name, version, upgrade, options) {
                if (!idb) return Promise.reject(new Error('IndexedDB is not supported in this environment'));

                // Validate options
                const crossTab = (options && options.crossTab !== undefined) ? options.crossTab : true;
                const namespace = (options && options.namespace !== undefined) ? options.namespace : '';

                if (typeof crossTab !== 'boolean') {
                    return Promise.reject(new Error('indexedDB: crossTab must be a boolean'));
                }
                if (typeof namespace !== 'string' || namespace.includes(':')) {
                    return Promise.reject(new Error('indexedDB: namespace must be a string without ":"'));
                }

                const channelName = namespace
                    ? `idb:${namespace}:${name}`
                    : `idb:${name}`;

                return new Promise((resolve, reject) => {
                    const req = idb.open(name, version);

                    req.onerror = () => reject(req.error);

                    req.onupgradeneeded = event => {
                        if (typeof upgrade === 'function') {
                            upgrade(req.result, event.oldVersion, event.newVersion);
                        }
                    };

                    req.onsuccess = () => {
                        const db = req.result;

                        // Gracefully close when another tab requests a version upgrade
                        db.onversionchange = () => db.close();

                        // broadcastChannel module for cross-tab change notifications
                        const channel = (crossTab && broadcastChannel.isSupported())
                            ? broadcastChannel.create(channelName)
                            : null;

                        // Named callback registry
                        const callbacks = {
                            map:  [],
                            list: {}
                        };

                        function dispatch(evt) {
                            for (let i = 0; i < callbacks.map.length; i++) {
                                callbacks.list[callbacks.map[i]](evt);
                            }
                        }

                        // Receive cross-tab events from other tabs
                        if (channel) {
                            channel.on(data => dispatch({ ...data, cross: true }));
                        }

                        /**
                         * Called by store accessors after a successful mutation.
                         * Dispatches immediately in the current tab and posts to
                         * the broadcastChannel for all other tabs.
                         *
                         * @param {string}           type      - `'set'`, `'del'`, or `'clear'`.
                         * @param {string}           storeName - Object store that changed.
                         * @param {IDBValidKey|null}  key       - Affected key (`null` for `clear`).
                         */
                        function notify(type, storeName, key) {
                            const evt = { type, store: storeName, key, cross: false };
                            dispatch(evt);
                            if (channel) channel.post({ type, store: storeName, key });
                        }

                        resolve({
                            /**
                             * Return an accessor for the named object store.
                             *
                             * @param {string} storeName
                             * @returns {IDBStoreAccessor}
                             */
                            store(storeName) {
                                return createStoreAccessor(db, storeName, (type, key) => notify(type, storeName, key));
                            },

                            /**
                             * Close the database connection and the broadcastChannel wrapper.
                             * Outstanding Promises will still settle normally.
                             */
                            close() {
                                if (channel) channel.close();
                                db.close();
                            },

                            /** @type {string} */
                            get name()       { return db.name; },

                            /** @type {number} */
                            get version()    { return db.version; },

                            /** @type {string[]} */
                            get storeNames() { return Array.from(db.objectStoreNames); },

                            /**
                             * Named change-callback registry.
                             *
                             * Callbacks fire after every `set`, `del`, and `clear` on
                             * any store of this database - both in the current tab
                             * (immediately) and in other tabs of the same origin
                             * (via `BroadcastChannel`, `cross: true`).
                             *
                             * Each callback receives:
                             * `{ type: 'set'|'del'|'clear', store: string, key: IDBValidKey|null, cross: boolean }`
                             */
                            listen: {
                                /**
                                 * Register a named change callback.
                                 * Re-registering the same `name` replaces its function.
                                 *
                                 * @param {string}   name
                                 * @param {function({ type, store, key, cross }): void} fn
                                 */
                                add(name, fn) {
                                    if (callbacks.map.indexOf(name) < 0) {
                                        callbacks.map.push(name);
                                    }
                                    callbacks.list[name] = fn;
                                },

                                /**
                                 * Remove a named change callback.
                                 * No-op when `name` is not registered.
                                 *
                                 * @param {string} name
                                 */
                                del(name) {
                                    const idx = callbacks.map.indexOf(name);
                                    if (idx > -1) {
                                        callbacks.map.splice(idx, 1);
                                        delete callbacks.list[name];
                                    }
                                }
                            }
                        });
                    };
                });
            },

            /**
             * Permanently delete the database identified by `name`.
             *
             * Rejects when other connections are open and block the deletion.
             *
             * @param {string} name
             * @returns {Promise<void>}
             */
            drop(name) {
                if (!idb) return Promise.reject(new Error('IndexedDB is not supported in this environment'));

                return new Promise((resolve, reject) => {
                    const req = idb.deleteDatabase(name);
                    req.onsuccess = () => resolve();
                    req.onerror   = () => reject(req.error);
                    req.onblocked = () => reject(new Error(
                        `Cannot delete "${name}": other connections are still open. ` +
                        'Close all tabs using this database and retry.'
                    ));
                });
            }
        };
    }
};
