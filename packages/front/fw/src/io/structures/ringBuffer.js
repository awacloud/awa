// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Bounded FIFO circular buffer. O(1) push/shift/pop. Overwrites the
 * oldest value when full.
 * Supports persistence via `snapshot()` and the `{ snapshot, storage }`
 * options on `create()`.
 */

/** @typedef {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|BigInt64Array|BigUint64Array|Float32Array|Float64Array} TypedArray */



/**
 * @typedef {Object} RingBufferSnapshot
 * @property {number} capacity - must match the buffer `capacity` on restore
 * @property {number} size     - number of live entries; must satisfy `size <= capacity`
 * @property {Array<*>} data   - live entries in FIFO order (length must be >= `size`)
 */

/**
 * Options accepted by {@link RingBufferApi.create}.
 * @typedef {Object} RingBufferCreateOptions
 * @property {number} capacity - maximum number of entries; integer >= 1
 * @property {Array|TypedArray} [storage] - external backing store; must have length >= `capacity`
 * @property {RingBufferSnapshot} [snapshot] - restore from a previous `snapshot()`
 */

/**
 * A bounded FIFO circular buffer instance, as returned by {@link RingBufferApi.create}.
 * @typedef {Object} RingBufferInstance
 * @property {(value: *) => void} push
 * @property {() => *} shift
 * @property {() => *} pop
 * @property {() => *} peek
 * @property {() => *} peekLast
 * @property {(i: number) => *} peekAt
 * @property {() => Array<*>} toArray
 * @property {() => void} clear
 * @property {() => RingBufferSnapshot} snapshot
 * @property {number} size - readonly; current number of entries
 * @property {number} capacity - readonly; configured capacity
 * @property {boolean} isFull - readonly
 * @property {boolean} isEmpty - readonly
 */

/**
 * Object returned by `ringBuffer.factory()`.
 * @typedef {Object} RingBufferApi
 * @property {(opts: RingBufferCreateOptions) => RingBufferInstance} create
 */

export const ringBuffer = {
    name: 'ringBuffer',
    version: '1.0.0',
    type: 'fw.io.structures',
    dependencies: [],

    /** @returns {RingBufferApi} */
    factory() {
        /**
         * Create a new ring buffer instance.
         * @param {Object} opts
         * @param {number} opts.capacity - maximum number of entries; integer >= 1
         * @param {Array|TypedArray} [opts.storage] - external backing store; must have length >= `capacity`
         * @param {RingBufferSnapshot} [opts.snapshot] - restore from a previous `snapshot()`
         * @returns {{
         *   push: (value: *) => void,
         *   shift: () => *,
         *   pop: () => *,
         *   peek: () => *,
         *   peekLast: () => *,
         *   peekAt: (i: number) => *,
         *   toArray: () => Array<*>,
         *   clear: () => void,
         *   snapshot: () => RingBufferSnapshot,
         *   readonly size: number,
         *   readonly capacity: number,
         *   readonly isFull: boolean,
         *   readonly isEmpty: boolean,
         * }}
         */
        // @ts-ignore - default {} satisfies runtime guard; TS requires all fields upfront
        function create({ capacity, storage, snapshot: snap } = {}) {
            if (!Number.isInteger(capacity) || capacity < 1)
                throw new Error('ringBuffer: capacity must be an integer >= 1');

            // Validate storage if provided
            if (storage !== undefined) {
                const isArray = Array.isArray(storage);
                const isTypedArray = ArrayBuffer.isView(storage) && !(storage instanceof DataView);
                if (!isArray && !isTypedArray)
                    throw new Error('ringBuffer: storage must be Array or TypedArray');
                if (storage.length < capacity)
                    throw new Error('ringBuffer: storage length must be >= capacity');
            }

            // Validate snapshot if provided
            if (snap !== undefined) {
                if (snap.capacity !== capacity)
                    throw new Error('ringBuffer: snapshot.capacity mismatch');
                if (!Number.isInteger(snap.size) || snap.size < 0)
                    throw new Error('ringBuffer: snapshot.size must be a non-negative integer');
                if (snap.size > capacity)
                    throw new Error('ringBuffer: snapshot.size exceeds capacity');
                if (!Array.isArray(snap.data) || snap.data.length < snap.size)
                    throw new Error('ringBuffer: snapshot.data length must be >= snapshot.size');
            }

            const data = storage !== undefined ? storage : new Array(capacity);
            let head = 0;
            let _size = 0;

            // Restore from snapshot
            if (snap !== undefined) {
                _size = snap.size;
                head = 0;
                for (let i = 0; i < _size; i++) {
                    data[i] = snap.data[i];
                }
            }

            function push(value) {
                const idx = (head + _size) % capacity;
                data[idx] = value;
                if (_size < capacity) {
                    _size++;
                } else {
                    // Overwrite oldest: advance head
                    head = (head + 1) % capacity;
                }
            }

            function shift() {
                if (_size === 0) return undefined;
                const value = data[head];
                if (Array.isArray(data)) {
                    data[head] = undefined; // help GC
                } else {
                    data[head] = 0;
                }
                head = (head + 1) % capacity;
                _size--;
                return value;
            }

            function pop() {
                if (_size === 0) return undefined;
                const idx = (head + _size - 1) % capacity;
                const value = data[idx];
                if (Array.isArray(data)) {
                    data[idx] = undefined;
                } else {
                    data[idx] = 0;
                }
                _size--;
                return value;
            }

            function peek() { return _size === 0 ? undefined : data[head]; }
            function peekLast() { return _size === 0 ? undefined : data[(head + _size - 1) % capacity]; }
            function peekAt(i) {
                if (i < 0 || i >= _size) return undefined;
                return data[(head + i) % capacity];
            }

            function toArray() {
                const result = [];
                for (let i = 0; i < _size; i++) result.push(data[(head + i) % capacity]);
                return result;
            }

            function clear() {
                head = 0;
                _size = 0;
                if (Array.isArray(data)) {
                    data.fill(undefined);
                } else {
                    // @ts-ignore - data is TypedArray when not Array; fill(0) is valid at runtime
                    data.fill(0);
                }
            }

            function snapshot() {
                const result = [];
                for (let i = 0; i < _size; i++) result.push(data[(head + i) % capacity]);
                return {
                    capacity,
                    size: _size,
                    data: result,
                };
            }

            return {
                push, shift, pop, peek, peekLast, peekAt, toArray, clear, snapshot,
                get size() { return _size; },
                get capacity() { return capacity; },
                get isFull() { return _size === capacity; },
                get isEmpty() { return _size === 0; },
            };
        }

        return { create };
    },
};
