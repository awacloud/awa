// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Bounded LRU (Least Recently Used) cache. O(1) get/set/has/delete via
 * a Map combined with a doubly-linked list using sentinel head/tail nodes.
 *
 * Supports persistence via `snapshot()` and restoration through the
 * `snapshot` option to `create()`.
 */

/**
 * @typedef {Object} LruEntry
 * @property {*} key   - entry key (any value Map can use as key)
 * @property {*} value - entry value
 * @property {LruEntry|null} prev - previous node in the MRU→LRU chain
 * @property {LruEntry|null} next - next node in the MRU→LRU chain
 */

/**
 * @typedef {Object} LruSnapshot
 * @property {number} maxSize - must match the cache `maxSize` on restore
 * @property {Array<Array<*>>} entries - entries in MRU→LRU order
 */

/**
 * Options accepted by {@link LruCacheApi.create}.
 * @typedef {Object} LruCacheCreateOptions
 * @property {number} maxSize - maximum number of entries; integer >= 1
 * @property {(key: *, value: *) => void} [onEvict] - called when an entry is evicted, deleted, or cleared
 * @property {LruSnapshot} [snapshot] - restore state from a previous `snapshot()`
 */

/**
 * A bounded LRU cache instance, as returned by {@link LruCacheApi.create}.
 * @typedef {Object} LruCacheInstance
 * @property {(key: *) => *} get
 * @property {(key: *, value: *) => void} set
 * @property {(key: *) => boolean} has
 * @property {(key: *) => *} peek
 * @property {(key: *) => boolean} delete
 * @property {() => void} clear
 * @property {() => Generator<*, void, unknown>} keys
 * @property {() => Generator<*, void, unknown>} values
 * @property {() => Generator<Array<*>, void, unknown>} entries
 * @property {() => LruSnapshot} snapshot
 * @property {number} size - readonly; current number of entries
 * @property {number} maxSize - readonly; configured capacity
 */

/**
 * Object returned by `lruCache.factory()`.
 * @typedef {Object} LruCacheApi
 * @property {(opts: LruCacheCreateOptions) => LruCacheInstance} create
 */

export const lruCache = {
    name: 'lruCache',
    version: '1.0.0',
    type: 'fw.io.structures',
    dependencies: [],

    /** @returns {LruCacheApi} */
    factory() {
        /**
         * Create a new LRU cache instance.
         * @param {Object} opts
         * @param {number} opts.maxSize - maximum number of entries; integer >= 1
         * @param {(key: *, value: *) => void} [opts.onEvict] - called when an entry is evicted, deleted, or cleared
         * @param {LruSnapshot} [opts.snapshot] - restore state from a previous `snapshot()`
         * @returns {{
         *   get: (key: *) => *,
         *   set: (key: *, value: *) => void,
         *   has: (key: *) => boolean,
         *   peek: (key: *) => *,
         *   delete: (key: *) => boolean,
         *   clear: () => void,
         *   keys: () => Generator<*, void, unknown>,
         *   values: () => Generator<*, void, unknown>,
         *   entries: () => Generator<Array<*>, void, unknown>,
         *   snapshot: () => LruSnapshot,
         *   readonly size: number,
         *   readonly maxSize: number,
         * }}
         */
        // @ts-ignore - default {} satisfies runtime guard; TS requires all fields upfront
        function create({ maxSize, onEvict, snapshot: snapshotData } = {}) {
            if (!Number.isInteger(maxSize) || maxSize < 1)
                throw new Error('lruCache: maxSize must be an integer >= 1');

            // Sentinel nodes: head <-> [MRU] <-> ... <-> [LRU] <-> tail
            const head = { key: null, value: null, prev: null, next: null };
            const tail = { key: null, value: null, prev: null, next: null };
            head.next = tail;
            tail.prev = head;

            const map = new Map();

            function _remove(node) {
                node.prev.next = node.next;
                node.next.prev = node.prev;
            }

            function _prepend(node) {
                node.next = head.next;
                node.prev = head;
                head.next.prev = node;
                head.next = node;
            }

            function _evict() {
                const lru = tail.prev;
                _remove(lru);
                map.delete(lru.key);
                if (typeof onEvict === 'function') onEvict(lru.key, lru.value);
            }

            function get(key) {
                const node = map.get(key);
                if (!node) return undefined;
                _remove(node);
                _prepend(node);
                return node.value;
            }

            function set(key, value) {
                if (map.has(key)) {
                    const node = map.get(key);
                    node.value = value;
                    _remove(node);
                    _prepend(node);
                    return;
                }
                const node = { key, value, prev: null, next: null };
                map.set(key, node);
                _prepend(node);
                if (map.size > maxSize) _evict();
            }

            function has(key) { return map.has(key); }
            function peek(key) { return map.get(key)?.value; }

            function del(key) {
                const node = map.get(key);
                if (!node) return false;
                _remove(node);
                map.delete(key);
                if (typeof onEvict === 'function') onEvict(key, node.value);
                return true;
            }

            function clear() {
                if (typeof onEvict === 'function') {
                    let node = head.next;
                    while (node !== tail) {
                        onEvict(node.key, node.value);
                        node = node.next;
                    }
                }
                head.next = tail;
                tail.prev = head;
                map.clear();
            }

            function* keys() {
                let node = head.next;
                while (node !== tail) { yield node.key; node = node.next; }
            }

            function* values() {
                let node = head.next;
                while (node !== tail) { yield node.value; node = node.next; }
            }

            function* entries() {
                let node = head.next;
                while (node !== tail) { yield [node.key, node.value]; node = node.next; }
            }

            function snapshot() {
                const result = [];
                let node = head.next;
                while (node !== tail) {
                    result.push([node.key, node.value]);
                    node = node.next;
                }
                return { maxSize, entries: result };
            }

            // Restore from snapshot if provided
            if (snapshotData !== undefined) {
                if (snapshotData.maxSize !== maxSize)
                    throw new Error('lruCache: snapshot.maxSize mismatch');
                if (snapshotData.entries.length > maxSize)
                    throw new Error('lruCache: snapshot exceeds maxSize');
                // Insert in reverse order (LRU→MRU) so first snapshot entry ends as MRU
                for (let i = snapshotData.entries.length - 1; i >= 0; i--) {
                    const [k, v] = snapshotData.entries[i];
                    const node = { key: k, value: v, prev: null, next: null };
                    map.set(k, node);
                    _prepend(node);
                }
            }

            return {
                get, set, has, peek,
                delete: del,
                clear, keys, values, entries,
                snapshot,
                get size() { return map.size; },
                get maxSize() { return maxSize; },
            };
        }

        return { create };
    },
};
