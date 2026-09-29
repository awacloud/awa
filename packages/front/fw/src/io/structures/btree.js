// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * m-way B-tree (ordered map). O(log n) insert/get/delete, range queries,
 * ordered iteration. Uses the CLRS minimum-degree formulation
 * `t = ceil(order / 2)`; each node holds at most `2t - 1` keys.
 *
 * Performance note: `range(low, high, …)` currently walks the full in-order
 * sequence and filters - O(n) rather than O(log n + k). Acceptable for
 * small / medium maps; a seek-to-low optimization is a future improvement.
 */

/**
 * @typedef {Object} BTreeNode
 * @property {Array<*>} keys
 * @property {Array<*>} values
 * @property {Array<BTreeNode>} children - empty when `isLeaf === true`
 * @property {boolean} isLeaf
 */

/**
 * @typedef {Object} BTreeEntry
 * @property {*} key
 * @property {*} value
 */

/**
 * @typedef {Object} BTreeSnapshot
 * @property {number} order - must match the tree `order` on restore
 * @property {Array<Array<*>>} entries - all (key, value) pairs in sorted order
 */

/**
 * Options accepted by {@link BTreeApi.create}.
 * @typedef {Object} BTreeCreateOptions
 * @property {number} [order=5] - branching factor; integer >= 3
 * @property {(a: *, b: *) => number} [comparator] - key comparator (default natural order)
 * @property {BTreeSnapshot} [snapshot] - restore from a previous `snapshot()`
 */

/**
 * A B-tree (ordered map) instance, as returned by {@link BTreeApi.create}.
 * @typedef {Object} BTreeInstance
 * @property {(key: *, value: *) => void} insert
 * @property {(key: *) => *} get
 * @property {(key: *) => boolean} has
 * @property {(key: *) => boolean} delete
 * @property {(low: *, high: *, opts?: { includeLow?: boolean, includeHigh?: boolean }) => Generator<Array<*>, void, unknown>} range
 * @property {() => Generator<*, void, unknown>} keys
 * @property {() => Generator<*, void, unknown>} values
 * @property {() => Generator<Array<*>, void, unknown>} entries
 * @property {() => BTreeEntry|null} min
 * @property {() => BTreeEntry|null} max
 * @property {() => void} clear
 * @property {() => BTreeSnapshot} snapshot
 * @property {number} size - readonly; current number of entries
 */

/**
 * Object returned by `btree.factory()`.
 * @typedef {Object} BTreeApi
 * @property {(opts?: BTreeCreateOptions) => BTreeInstance} create
 */

export const btree = {
    name: 'btree',
    version: '1.0.0',
    type: 'fw.io.structures',
    dependencies: [],

    /** @returns {BTreeApi} */
    factory() {
        /**
         * Create a new B-tree instance.
         * @param {Object} [opts]
         * @param {number} [opts.order=5] - branching factor; integer >= 3
         * @param {(a: *, b: *) => number} [opts.comparator] - key comparator (default natural order)
         * @param {BTreeSnapshot} [opts.snapshot] - restore from a previous `snapshot()`
         * @returns {{
         *   insert: (key: *, value: *) => void,
         *   get: (key: *) => *,
         *   has: (key: *) => boolean,
         *   delete: (key: *) => boolean,
         *   range: (low: *, high: *, opts?: { includeLow?: boolean, includeHigh?: boolean }) => Generator<Array<*>, void, unknown>,
         *   keys: () => Generator<*, void, unknown>,
         *   values: () => Generator<*, void, unknown>,
         *   entries: () => Generator<Array<*>, void, unknown>,
         *   min: () => BTreeEntry|null,
         *   max: () => BTreeEntry|null,
         *   clear: () => void,
         *   snapshot: () => BTreeSnapshot,
         *   readonly size: number,
         * }}
         */
        function create({ order = 5, comparator, snapshot: snapshotData } = {}) {
            if (!Number.isInteger(order) || order < 3)
                throw new Error('btree: order must be an integer >= 3');

            const cmp = comparator ?? ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
            if (typeof cmp !== 'function') throw new Error('btree: comparator must be a function');

            const t = Math.ceil(order / 2); // minimum degree
            const maxKeys = 2 * t - 1;
            const minKeys = t - 1;

            function _node(isLeaf) {
                return { keys: [], values: [], children: [], isLeaf };
            }

            let root = _node(true);
            let _size = 0;

            // Split child at index i of parent (child must be full: maxKeys keys)
            function _splitChild(parent, i) {
                const child = parent.children[i];
                const mid = t - 1; // median index

                const right = _node(child.isLeaf);
                right.keys = child.keys.splice(mid + 1);
                right.values = child.values.splice(mid + 1);
                if (!child.isLeaf) right.children = child.children.splice(mid + 1);

                const midKey = child.keys.pop();
                const midVal = child.values.pop();

                parent.keys.splice(i, 0, midKey);
                parent.values.splice(i, 0, midVal);
                parent.children.splice(i + 1, 0, right);
            }

            // Insert key into a non-full node (pre-splitting on the way down)
            function _insertNonFull(node, key, value) {
                let i = node.keys.length - 1;

                if (node.isLeaf) {
                    // Find insertion position (left-to-right for exact-match check first)
                    let pos = 0;
                    while (pos < node.keys.length && cmp(key, node.keys[pos]) > 0) pos++;
                    if (pos < node.keys.length && cmp(key, node.keys[pos]) === 0) {
                        node.values[pos] = value;
                        return false;
                    }
                    node.keys.splice(pos, 0, key);
                    node.values.splice(pos, 0, value);
                    return true;
                }

                // Find child to descend
                while (i >= 0 && cmp(key, node.keys[i]) < 0) i--;
                // Exact match at internal node (update)
                if (i >= 0 && cmp(key, node.keys[i]) === 0) {
                    node.values[i] = value;
                    return false;
                }
                i++; // child index

                if (node.children[i].keys.length === maxKeys) {
                    _splitChild(node, i);
                    const c = cmp(key, node.keys[i]);
                    if (c === 0) { node.values[i] = value; return false; }
                    if (c > 0) i++;
                }
                return _insertNonFull(node.children[i], key, value);
            }

            function insert(key, value) {
                if (root.keys.length === maxKeys) {
                    const oldRoot = root;
                    root = _node(false);
                    root.children.push(oldRoot);
                    _splitChild(root, 0);
                }
                if (_insertNonFull(root, key, value)) _size++;
            }

            function _search(node, key) {
                let i = 0;
                while (i < node.keys.length && cmp(key, node.keys[i]) > 0) i++;
                if (i < node.keys.length && cmp(key, node.keys[i]) === 0)
                    return { node, i };
                if (node.isLeaf) return null;
                return _search(node.children[i], key);
            }

            function get(key) {
                const r = _search(root, key);
                return r ? r.node.values[r.i] : undefined;
            }

            function has(key) { return _search(root, key) !== null; }

            // Ensure node.children[i] has >= t keys (fill/borrow/merge)
            function _fill(parent, i) {
                if (i > 0 && parent.children[i - 1].keys.length > minKeys) {
                    // Borrow from left
                    const child = parent.children[i];
                    const left = parent.children[i - 1];
                    child.keys.unshift(parent.keys[i - 1]);
                    child.values.unshift(parent.values[i - 1]);
                    if (!child.isLeaf) child.children.unshift(left.children.pop());
                    parent.keys[i - 1] = left.keys.pop();
                    parent.values[i - 1] = left.values.pop();
                } else if (i < parent.children.length - 1 && parent.children[i + 1].keys.length > minKeys) {
                    // Borrow from right
                    const child = parent.children[i];
                    const right = parent.children[i + 1];
                    child.keys.push(parent.keys[i]);
                    child.values.push(parent.values[i]);
                    if (!child.isLeaf) child.children.push(right.children.shift());
                    parent.keys[i] = right.keys.shift();
                    parent.values[i] = right.values.shift();
                } else {
                    // Merge
                    if (i < parent.children.length - 1) {
                        _merge(parent, i);
                    } else {
                        _merge(parent, i - 1);
                        i--;
                    }
                }
                return i;
            }

            function _merge(parent, i) {
                const left = parent.children[i];
                const right = parent.children[i + 1];
                left.keys.push(parent.keys[i]);
                left.values.push(parent.values[i]);
                left.keys.push(...right.keys);
                left.values.push(...right.values);
                if (!left.isLeaf) left.children.push(...right.children);
                parent.keys.splice(i, 1);
                parent.values.splice(i, 1);
                parent.children.splice(i + 1, 1);
            }

            function _deleteFromNode(node, key) {
                let i = 0;
                while (i < node.keys.length && cmp(key, node.keys[i]) > 0) i++;

                if (i < node.keys.length && cmp(key, node.keys[i]) === 0) {
                    // Found in this node
                    if (node.isLeaf) {
                        node.keys.splice(i, 1);
                        node.values.splice(i, 1);
                        return true;
                    }
                    if (node.children[i].keys.length > minKeys) {
                        // Replace with predecessor
                        let pred = node.children[i];
                        while (!pred.isLeaf) pred = pred.children[pred.children.length - 1];
                        node.keys[i] = pred.keys[pred.keys.length - 1];
                        node.values[i] = pred.values[pred.values.length - 1];
                        _deleteFromNode(node.children[i], node.keys[i]);
                    } else if (node.children[i + 1].keys.length > minKeys) {
                        // Replace with successor
                        let succ = node.children[i + 1];
                        while (!succ.isLeaf) succ = succ.children[0];
                        node.keys[i] = succ.keys[0];
                        node.values[i] = succ.values[0];
                        _deleteFromNode(node.children[i + 1], node.keys[i]);
                    } else {
                        // Both children have minKeys: merge and delete from merged
                        _merge(node, i);
                        _deleteFromNode(node.children[i], key);
                    }
                    return true;
                }

                if (node.isLeaf) return false; // not found

                // Ensure child[i] has enough keys before descending
                if (node.children[i].keys.length <= minKeys) {
                    i = _fill(node, i);
                }
                return _deleteFromNode(node.children[i], key);
            }

            function del(key) {
                const found = _deleteFromNode(root, key);
                if (found) {
                    _size--;
                    if (root.keys.length === 0 && !root.isLeaf) root = root.children[0];
                }
                return found;
            }

            function* _inOrder(node) {
                if (node.isLeaf) {
                    for (let i = 0; i < node.keys.length; i++)
                        yield { key: node.keys[i], value: node.values[i] };
                } else {
                    for (let i = 0; i < node.keys.length; i++) {
                        yield* _inOrder(node.children[i]);
                        yield { key: node.keys[i], value: node.values[i] };
                    }
                    yield* _inOrder(node.children[node.keys.length]);
                }
            }

            function* keys() { for (const e of _inOrder(root)) yield e.key; }
            function* values() { for (const e of _inOrder(root)) yield e.value; }
            function* entries() { for (const e of _inOrder(root)) yield [e.key, e.value]; }

            function* range(low, high, { includeLow = true, includeHigh = false } = {}) {
                for (const e of _inOrder(root)) {
                    const lo = cmp(e.key, low);
                    const hi = cmp(e.key, high);
                    if ((includeLow ? lo >= 0 : lo > 0) && (includeHigh ? hi <= 0 : hi < 0))
                        yield [e.key, e.value];
                    if (hi > 0) break;
                }
            }

            function min() {
                if (!root.keys.length) return null;
                let n = root;
                while (!n.isLeaf) n = n.children[0];
                return { key: n.keys[0], value: n.values[0] };
            }

            function max() {
                if (!root.keys.length) return null;
                let n = root;
                while (!n.isLeaf) n = n.children[n.children.length - 1];
                return { key: n.keys[n.keys.length - 1], value: n.values[n.values.length - 1] };
            }

            function clear() { root = _node(true); _size = 0; }

            function snapshot() {
                return { order, entries: Array.from(entries()) };
            }

            // Restore from snapshot if provided
            if (snapshotData !== undefined) {
                if (!snapshotData || typeof snapshotData !== 'object')
                    throw new Error('btree: snapshot must be an object');
                if (snapshotData.order !== order)
                    throw new Error('btree: snapshot.order mismatch');
                for (const [k, v] of snapshotData.entries) insert(k, v);
            }

            return {
                insert, get, has, delete: del,
                range, keys, values, entries,
                min, max, clear, snapshot,
                get size() { return _size; },
            };
        }

        return { create };
    },
};
