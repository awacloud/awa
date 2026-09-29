// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Low-level wrapper around native `SharedArrayBuffer` and `Atomics`.
 * Provides creation helpers, atomic ops, `waitAsync` / `notify`, and a
 * minimal cross-worker lock.
 *
 * Requires a cross-origin isolated context in web environments (COOP + COEP).
 * On runtimes without `Atomics.waitAsync` the `sabLock.acquire()` falls back
 * to a `setTimeout`-based poll (not a bare microtask spin) so it does not
 * starve the event loop.
 */

/**
 * @typedef {Int32Array|Uint32Array|Uint16Array|Uint8Array} AtomicTypedArray
 */

/**
 * @typedef {Object} WaitAsyncResult
 * @property {boolean} async - `true` if `value` is a Promise.
 * @property {string|Promise<string>} value - 'ok' | 'not-equal' | 'timed-out'.
 */

/**
 * @typedef {Object} SabLock
 * @property {()=>Promise<void>} acquire
 * @property {()=>void}          release
 * @property {()=>boolean}       tryAcquire
 */

/**
 * Public shape returned by `atomics.factory()`.
 * @typedef {object} AtomicsAPI
 * @property {() => boolean} isSupported Whether `SharedArrayBuffer` + `Atomics` are available.
 * @property {(byteLength: number) => (SharedArrayBuffer|null)} shared Allocate a SharedArrayBuffer or null when unsupported.
 * @property {(sab: SharedArrayBuffer, byteOffset?: number, length?: number) => Int32Array} int32 View a SAB as an Int32Array.
 * @property {(sab: SharedArrayBuffer, byteOffset?: number, length?: number) => Uint32Array} uint32 View a SAB as a Uint32Array.
 * @property {(sab: SharedArrayBuffer, byteOffset?: number, length?: number) => Uint8Array} uint8 View a SAB as a Uint8Array.
 * @property {(sab: SharedArrayBuffer, byteOffset?: number, length?: number) => Uint16Array} uint16 View a SAB as a Uint16Array.
 * @property {(typed: AtomicTypedArray, index: number) => number} load Atomic load.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} store Atomic store; returns the stored value.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} add Atomic add; returns previous value.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} sub Atomic sub; returns previous value.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} and Atomic bitwise AND; returns previous value.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} or Atomic bitwise OR; returns previous value.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} xor Atomic bitwise XOR; returns previous value.
 * @property {(typed: AtomicTypedArray, index: number, value: number) => number} exchange Atomic exchange; returns previous value.
 * @property {(typed: AtomicTypedArray, index: number, expected: number, replacement: number) => number} compareExchange Atomic compare-and-exchange; returns previous value.
 * @property {(int32Array: Int32Array, index: number, expectedValue: number, timeoutMs?: number) => WaitAsyncResult} waitAsync Async wait on an Int32Array slot.
 * @property {(int32Array: Int32Array, index: number, count?: number) => number} notify Wake waiters; returns number woken.
 * @property {(int32Array: Int32Array, index: number) => SabLock} sabLock Minimal cross-worker spinlock on an Int32Array slot.
 */

export const atomics = {
    name: 'atomics',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: [],

    /** @returns {AtomicsAPI} */
    factory() {
        /**
         * Check whether `SharedArrayBuffer` + `Atomics` are available and (on
         * the web) that the document is cross-origin isolated.
         * @returns {boolean}
         */
        function isSupported() {
            if (typeof SharedArrayBuffer === 'undefined') return false;
            if (typeof Atomics === 'undefined') return false;
            // In non-web runtimes (bun, node), crossOriginIsolated is absent - skip check.
            if (typeof globalThis.crossOriginIsolated !== 'undefined' && !globalThis.crossOriginIsolated)
                return false;
            return true;
        }

        /**
         * Allocate a SharedArrayBuffer or return `null` when unsupported.
         * @param {number} byteLength - Non-negative integer.
         * @returns {SharedArrayBuffer|null}
         */
        function shared(byteLength) {
            if (!Number.isInteger(byteLength) || byteLength < 0)
                throw new Error('atomics: byteLength must be a non-negative integer');
            if (!isSupported()) return null;
            return new SharedArrayBuffer(byteLength);
        }

        function _assertSAB(sab) {
            if (!(sab instanceof SharedArrayBuffer))
                throw new Error('atomics: expected SharedArrayBuffer');
        }

        /**
         * @param {SharedArrayBuffer} sab
         * @param {number} [byteOffset=0]
         * @param {number} [length]
         * @returns {Int32Array}
         */
        function int32(sab, byteOffset = 0, length) {
            _assertSAB(sab);
            return length !== undefined ? new Int32Array(sab, byteOffset, length) : new Int32Array(sab, byteOffset);
        }

        /**
         * @param {SharedArrayBuffer} sab
         * @param {number} [byteOffset=0]
         * @param {number} [length]
         * @returns {Uint32Array}
         */
        function uint32(sab, byteOffset = 0, length) {
            _assertSAB(sab);
            return length !== undefined ? new Uint32Array(sab, byteOffset, length) : new Uint32Array(sab, byteOffset);
        }

        /**
         * @param {SharedArrayBuffer} sab
         * @param {number} [byteOffset=0]
         * @param {number} [length]
         * @returns {Uint16Array}
         */
        function uint16(sab, byteOffset = 0, length) {
            _assertSAB(sab);
            return length !== undefined ? new Uint16Array(sab, byteOffset, length) : new Uint16Array(sab, byteOffset);
        }

        /**
         * @param {SharedArrayBuffer} sab
         * @param {number} [byteOffset=0]
         * @param {number} [length]
         * @returns {Uint8Array}
         */
        function uint8(sab, byteOffset = 0, length) {
            _assertSAB(sab);
            return length !== undefined ? new Uint8Array(sab, byteOffset, length) : new Uint8Array(sab, byteOffset);
        }

        function _assertBounds(typed, index) {
            if (!Number.isInteger(index) || index < 0 || index >= typed.length)
                throw new RangeError('atomics: index out of bounds');
        }

        /**
         * Atomic load.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @returns {number}
         */
        function load(typed, index) {
            _assertBounds(typed, index);
            return Atomics.load(typed, index);
        }

        /**
         * Atomic store.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number} the stored value.
         */
        function store(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.store(typed, index, value);
        }

        /**
         * Atomic add, returns previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number}
         */
        function add(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.add(typed, index, value);
        }

        /**
         * Atomic sub, returns previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number}
         */
        function sub(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.sub(typed, index, value);
        }

        /**
         * Atomic bitwise AND, returns previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number}
         */
        function and(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.and(typed, index, value);
        }

        /**
         * Atomic bitwise OR, returns previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number}
         */
        function or(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.or(typed, index, value);
        }

        /**
         * Atomic bitwise XOR, returns previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number}
         */
        function xor(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.xor(typed, index, value);
        }

        /**
         * Atomic exchange, returns previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} value
         * @returns {number}
         */
        function exchange(typed, index, value) {
            _assertBounds(typed, index);
            return Atomics.exchange(typed, index, value);
        }

        /**
         * Atomic compare-and-exchange. Replaces slot only when its current value
         * equals `expected`; always returns the previous value.
         * @param {AtomicTypedArray} typed
         * @param {number} index
         * @param {number} expected
         * @param {number} replacement
         * @returns {number}
         */
        function compareExchange(typed, index, expected, replacement) {
            _assertBounds(typed, index);
            return Atomics.compareExchange(typed, index, expected, replacement);
        }

        /**
         * Async wait on an Int32Array slot. Uses native `Atomics.waitAsync` when
         * available; otherwise synchronously returns `{async:false, value:'not-equal'}`
         * - callers must treat that as "could not wait" and retry their own check.
         * @param {Int32Array} int32Array
         * @param {number} index
         * @param {number} expectedValue
         * @param {number} [timeoutMs]
         * @returns {WaitAsyncResult}
         */
        function waitAsync(int32Array, index, expectedValue, timeoutMs) {
            if (!(int32Array instanceof Int32Array))
                throw new Error('atomics: waitAsync requires an Int32Array on SharedArrayBuffer');
            if (typeof Atomics.waitAsync === 'function') {
                return timeoutMs !== undefined
                    ? Atomics.waitAsync(int32Array, index, expectedValue, timeoutMs)
                    : Atomics.waitAsync(int32Array, index, expectedValue);
            }
            return { async: false, value: 'not-equal' };
        }

        /**
         * Wake up `count` (default Infinity) waiters on `int32Array[index]`.
         * @param {Int32Array} int32Array
         * @param {number} index
         * @param {number} [count]
         * @returns {number} number of waiters woken.
         */
        function notify(int32Array, index, count) {
            if (!(int32Array instanceof Int32Array))
                throw new Error('atomics: notify requires an Int32Array on SharedArrayBuffer');
            return Atomics.notify(int32Array, index, count !== undefined ? count : Infinity);
        }

        /**
         * Minimal cross-worker spinlock on an Int32Array slot. 0 = free, 1 = held.
         *
         * When `Atomics.waitAsync` is not available, the fallback polls with
         * `setTimeout(0)` to avoid monopolizing the microtask queue. This is
         * suitable for low-contention coordination but is **not** intended as
         * a high-throughput primitive.
         *
         * @param {Int32Array} int32Array
         * @param {number} index
         * @returns {SabLock}
         */
        function sabLock(int32Array, index) {
            if (!(int32Array instanceof Int32Array))
                throw new Error('atomics: sabLock requires an Int32Array on SharedArrayBuffer');

            function tryAcquire() {
                return Atomics.compareExchange(int32Array, index, 0, 1) === 0;
            }

            async function acquire() {
                const hasWaitAsync = typeof Atomics.waitAsync === 'function';
                while (true) {
                    if (tryAcquire()) return;
                    if (hasWaitAsync) {
                        const result = Atomics.waitAsync(int32Array, index, 1);
                        if (result.async) await result.value;
                        // when sync 'not-equal', loop will retry tryAcquire immediately
                    } else {
                        // Fall back to a macrotask yield - `setTimeout(0)` gives the
                        // event loop a chance to run timers/IO without burning CPU
                        // in a tight microtask spin.
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
            }

            function release() {
                Atomics.store(int32Array, index, 0);
                Atomics.notify(int32Array, index, 1);
            }

            return { acquire, release, tryAcquire };
        }

        return {
            isSupported,
            shared,
            int32, uint32, uint8, uint16,
            load, store, add, sub, and, or, xor, exchange, compareExchange,
            waitAsync, notify,
            sabLock,
        };
    }
};
