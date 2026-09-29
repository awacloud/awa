// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Prefix tree for autocompletion and prefix-based lookup on string keys.
 * Unicode-safe - keys are iterated by code point, so multi-unit characters
 * (e.g. emoji, astral plane) are handled correctly.
 */

/**
 * @typedef {Object} TrieNode
 * @property {Map<string, TrieNode>} children - child nodes keyed by single code point
 * @property {*} value - value bound to this node (only meaningful when `isEnd === true`)
 * @property {boolean} isEnd - true if a complete key ends at this node
 */

/**
 * @typedef {Object} TrieSearchHit
 * @property {string} key
 * @property {*} value
 */

/**
 * @typedef {Object} TrieSnapshot
 * @property {Array<[string, *]>} entries - all (key, value) pairs in DFS order
 */

/**
 * Options accepted by {@link TrieApi.create}.
 * @typedef {Object} TrieCreateOptions
 * @property {TrieSnapshot} [snapshot] - restore from a previous `snapshot()`
 */

/**
 * A prefix-tree (trie) instance, as returned by {@link TrieApi.create}.
 * @typedef {Object} TrieInstance
 * @property {(key: string, value?: *) => void} insert
 * @property {(key: string) => boolean} has
 * @property {(key: string) => *} get
 * @property {(prefix: string) => boolean} hasPrefix
 * @property {(prefix: string, limit?: number) => TrieSearchHit[]} search
 * @property {(key: string) => boolean} delete
 * @property {() => IterableIterator<string>} keys
 * @property {() => void} clear
 * @property {() => TrieSnapshot} snapshot
 * @property {number} size - readonly; current number of keys
 */

/**
 * Object returned by `trie.factory()`.
 * @typedef {Object} TrieApi
 * @property {(opts?: TrieCreateOptions) => TrieInstance} create
 */

export const trie = {
    name: 'trie',
    version: '1.0.0',
    type: 'fw.io.structures',
    dependencies: [],

    /** @returns {TrieApi} */
    factory() {
        /**
         * Create a new trie instance.
         * @param {Object} [opts]
         * @param {TrieSnapshot} [opts.snapshot] - restore from a previous `snapshot()`
         * @returns {{
         *   insert: (key: string, value?: *) => void,
         *   has: (key: string) => boolean,
         *   get: (key: string) => *,
         *   hasPrefix: (prefix: string) => boolean,
         *   search: (prefix: string, limit?: number) => TrieSearchHit[],
         *   delete: (key: string) => boolean,
         *   keys: () => IterableIterator<string>,
         *   clear: () => void,
         *   snapshot: () => TrieSnapshot,
         *   readonly size: number,
         * }}
         */
        function create({ snapshot: _snapshotData } = {}) {
            /** @type {TrieNode} */
            const root = { children: new Map(), value: undefined, isEnd: false };
            let _size = 0;

            /**
             * Insert (or update) a key/value pair.
             *
             * Empty-string key (`''`) is a valid key - it sets `root.isEnd = true`
             * and binds the value at the root node, contributing 1 to `size`.
             * A second `insert('', v2)` updates the value without re-incrementing size.
             *
             * @param {string} key
             * @param {*} [value=true]
             */
            function insert(key, value = true) {
                let node = root;
                for (const char of key) { // Unicode code point iteration
                    if (!node.children.has(char)) {
                        node.children.set(char, { children: new Map(), value: undefined, isEnd: false });
                    }
                    node = node.children.get(char);
                }
                if (!node.isEnd) _size++;
                node.value = value;
                node.isEnd = true;
            }

            function _findNode(key) {
                let node = root;
                for (const char of key) {
                    if (!node.children.has(char)) return null;
                    node = node.children.get(char);
                }
                return node;
            }

            function has(key) {
                const node = _findNode(key);
                return node !== null && node.isEnd;
            }

            function get(key) {
                const node = _findNode(key);
                return (node && node.isEnd) ? node.value : undefined;
            }

            function hasPrefix(prefix) {
                return _findNode(prefix) !== null;
            }

            function search(prefix, limit = Infinity) {
                const node = _findNode(prefix);
                if (!node) return [];
                const results = [];

                function dfs(n, currentKey) {
                    if (results.length >= limit) return;
                    if (n.isEnd) results.push({ key: currentKey, value: n.value });
                    for (const [char, child] of n.children) {
                        if (results.length >= limit) return;
                        dfs(child, currentKey + char);
                    }
                }

                dfs(node, prefix);
                return results;
            }

            function del(key) {
                let found = false;
                const chars = [...key]; // Unicode-safe array

                function _del(node, depth) {
                    if (depth === chars.length) {
                        if (!node.isEnd) return false;
                        found = true;
                        node.isEnd = false;
                        node.value = undefined;
                        _size--;
                        return node.children.size === 0; // can be removed
                    }
                    const char = chars[depth];
                    const child = node.children.get(char);
                    if (!child) return false;
                    const shouldRemove = _del(child, depth + 1);
                    if (shouldRemove) node.children.delete(char);
                    return !node.isEnd && node.children.size === 0;
                }

                _del(root, 0);
                return found;
            }

            function* keys() {
                function* dfs(node, currentKey) {
                    if (node.isEnd) yield currentKey;
                    for (const [char, child] of node.children) {
                        yield* dfs(child, currentKey + char);
                    }
                }
                yield* dfs(root, '');
            }

            function clear() {
                root.children.clear();
                _size = 0;
            }

            function snapshot() {
                const entries = [];
                function dfs(node, currentKey) {
                    if (node.isEnd) entries.push([currentKey, node.value]);
                    for (const [char, child] of node.children) {
                        dfs(child, currentKey + char);
                    }
                }
                dfs(root, '');
                return { entries };
            }

            // Restore from snapshot if provided
            if (_snapshotData !== undefined && _snapshotData !== null) {
                for (const [k, v] of _snapshotData.entries) {
                    insert(k, v);
                }
            }

            return {
                insert, has, get, hasPrefix, search,
                delete: del, keys, clear, snapshot,
                get size() { return _size; },
            };
        }

        return { create };
    },
};
