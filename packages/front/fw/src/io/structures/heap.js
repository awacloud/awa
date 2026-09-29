// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Binary heap (priority queue). Min-heap by default. O(log n) push/pop, O(1) peek.
 * Supports persistence via `snapshot()` and an external Array/TypedArray backing store.
 */

/** @typedef {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|BigInt64Array|BigUint64Array|Float32Array|Float64Array} TypedArray */



/**
 * @typedef {Object} HeapSnapshot
 * @property {Array<*>} data - the heap's internal array, already in valid
 *   heap order. Must be the round-trip output of `snapshot()` (no re-heapify
 *   is performed on restore); passing an arbitrary array would corrupt the heap.
 */

/**
 * Options accepted by {@link HeapApi.create}.
 * @typedef {Object} HeapCreateOptions
 * @property {(a: *, b: *) => number} [comparator] - default is natural-order min-heap
 * @property {Array<*>} [initial] - initial values; heapified in O(n) via Floyd's algorithm
 * @property {Array|TypedArray} [storage] - external backing store (requires `maxSize`)
 * @property {number} [maxSize] - bounded mode capacity; integer >= 1
 * @property {HeapSnapshot} [snapshot] - restore from a previous `snapshot()`. Mutually exclusive with `initial`.
 */

/**
 * A binary-heap (priority queue) instance, as returned by {@link HeapApi.create}.
 * @typedef {Object} HeapInstance
 * @property {(value: *) => void} push
 * @property {() => *} pop
 * @property {() => *} peek
 * @property {(value: *, equals?: (a: *, b: *) => boolean) => boolean} has
 * @property {() => Array<*>} toArray
 * @property {() => Array<*>} drain
 * @property {() => void} clear
 * @property {() => HeapSnapshot} snapshot
 * @property {number} size - readonly; current number of entries
 * @property {boolean} isEmpty - readonly
 */

/**
 * Object returned by `heap.factory()`.
 * @typedef {Object} HeapApi
 * @property {(opts?: HeapCreateOptions) => HeapInstance} create
 */

export const heap = {
    name: 'heap',
    version: '1.0.0',
    type: 'fw.io.structures',
    dependencies: [],

    /** @returns {HeapApi} */
    factory() {
        /**
         * Create a new heap instance.
         * @param {Object} [opts]
         * @param {(a: *, b: *) => number} [opts.comparator] - default is natural-order min-heap
         * @param {Array<*>} [opts.initial] - initial values; heapified in O(n) via Floyd's algorithm
         * @param {Array|TypedArray} [opts.storage] - external backing store (requires `maxSize`)
         * @param {number} [opts.maxSize] - bounded mode capacity; integer >= 1
         * @param {HeapSnapshot} [opts.snapshot] - restore from a previous `snapshot()`. Mutually exclusive with `initial`.
         * @returns {{
         *   push: (value: *) => void,
         *   pop: () => *,
         *   peek: () => *,
         *   has: (value: *, equals?: (a: *, b: *) => boolean) => boolean,
         *   toArray: () => Array<*>,
         *   drain: () => Array<*>,
         *   clear: () => void,
         *   snapshot: () => HeapSnapshot,
         *   readonly size: number,
         *   readonly isEmpty: boolean,
         * }}
         */
        function create({ comparator, initial, storage, maxSize, snapshot } = {}) {
            const cmp = comparator ?? ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
            if (typeof cmp !== 'function') throw new Error('heap: comparator must be a function');

            // Validate storage
            if (storage !== undefined) {
                const isTA = ArrayBuffer.isView(storage) && !(storage instanceof DataView);
                if (!Array.isArray(storage) && !isTA) {
                    throw new Error('heap: storage must be Array or TypedArray');
                }
                if (maxSize === undefined) {
                    throw new Error('heap: maxSize required when storage provided');
                }
                if (storage.length < maxSize) {
                    throw new Error('heap: storage length must be >= maxSize');
                }
            }

            // Validate maxSize if provided alone
            if (maxSize !== undefined && (!Number.isInteger(maxSize) || maxSize < 1)) {
                throw new Error('heap: maxSize must be an integer >= 1');
            }

            // Validate mutual exclusivity
            if (initial !== undefined && snapshot !== undefined) {
                throw new Error('heap: initial and snapshot are mutually exclusive');
            }

            // Backing mode:
            // - unbounded: data = [], _size tracked via data.length (push/pop)
            // - bounded (storage provided OR maxSize alone): use index-based writes, _size tracked manually
            const bounded = storage !== undefined;
            const data = storage ?? [];
            let _size = 0; // for bounded mode

            function _len() {
                return bounded ? _size : data.length;
            }

            function _push(v) {
                if (bounded) {
                    data[_size] = v;
                    _size++;
                } else {
                    // @ts-ignore - data is any[] when unbounded; TypedArray case is handled by bounded check above
                    data.push(v);
                }
            }

            function _popLast() {
                if (bounded) {
                    _size--;
                    return data[_size];
                } else {
                    // @ts-ignore - data is any[] when unbounded; TypedArray case is handled by bounded check above
                    return data.pop();
                }
            }

            function _siftUp(i) {
                while (i > 0) {
                    const parent = (i - 1) >> 1;
                    if (cmp(data[i], data[parent]) < 0) {
                        const tmp = data[i]; data[i] = data[parent]; data[parent] = tmp;
                        i = parent;
                    } else break;
                }
            }

            function _siftDown(i) {
                const n = _len();
                while (true) {
                    let best = i;
                    const l = 2 * i + 1, r = 2 * i + 2;
                    if (l < n && cmp(data[l], data[best]) < 0) best = l;
                    if (r < n && cmp(data[r], data[best]) < 0) best = r;
                    if (best === i) break;
                    const tmp = data[i]; data[i] = data[best]; data[best] = tmp;
                    i = best;
                }
            }

            // Initialize from snapshot
            if (snapshot !== undefined) {
                const snapData = snapshot.data;
                if (!Array.isArray(snapData)) {
                    throw new Error('heap: snapshot.data must be an Array');
                }
                if (maxSize !== undefined && snapData.length > maxSize) {
                    throw new Error('heap: snapshot exceeds maxSize');
                }
                if (bounded) {
                    for (let i = 0; i < snapData.length; i++) {
                        data[i] = snapData[i];
                    }
                    _size = snapData.length;
                } else {
                    // @ts-ignore - data is any[] when unbounded; TypedArray never reached in this branch
                    data.push(...snapData);
                }
                // Snapshot already in heap-array order - no heapify needed
            } else if (Array.isArray(initial)) {
                // Floyd's O(n) heapify
                for (const v of initial) _push(v);
                for (let i = (_len() >> 1) - 1; i >= 0; i--) _siftDown(i);
            }

            function push(value) {
                if (maxSize !== undefined && _len() >= maxSize) {
                    throw new Error('heap: maxSize exceeded');
                }
                _push(value);
                _siftUp(_len() - 1);
            }

            function pop() {
                if (_len() === 0) return undefined;
                const top = data[0];
                const last = _popLast();
                if (_len() > 0) { data[0] = last; _siftDown(0); }
                return top;
            }

            function peek() { return _len() > 0 ? data[0] : undefined; }

            function toArray() {
                return Array.from({ length: _len() }, (_, i) => data[i]);
            }

            function drain() {
                const r = [];
                while (_len() > 0) r.push(pop());
                return r;
            }

            function clear() {
                if (bounded) {
                    _size = 0;
                } else {
                    // @ts-ignore - data is any[] when unbounded; TypedArray case is handled by bounded check above
                    data.length = 0;
                }
            }

            function has(value, equals) {
                const eq = equals ?? ((a, b) => a === b);
                const n = _len();
                for (let i = 0; i < n; i++) {
                    if (eq(data[i], value)) return true;
                }
                return false;
            }

            function snapshot_() {
                return { data: Array.from({ length: _len() }, (_, i) => data[i]) };
            }

            return {
                push, pop, peek, has, toArray, drain, clear,
                snapshot: snapshot_,
                get size() { return _len(); },
                get isEmpty() { return _len() === 0; },
            };
        }

        return { create };
    },
};
