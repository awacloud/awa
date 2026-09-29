// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Counting semaphore with N permits and a FIFO waiter queue.
 * A 1-permit semaphore is equivalent to a mutex - prefer `mutex` for clarity.
 *
 * @example
 * const semaphore = registry.resolve('semaphore');
 * const s = semaphore.create(3);
 * await s.acquire(); // -1 permit
 * s.release();       // +1 permit
 */

/**
 * @typedef {Object} SemaphoreAcquireOptions
 * @property {AbortSignal} [signal] - Optional abort signal - cancels a pending
 *   acquire; the returned Promise rejects with the signal's reason.
 */

/**
 * @typedef {Object} Semaphore
 * @property {(opts?:SemaphoreAcquireOptions)=>Promise<void>} acquire
 * @property {()=>void}    release
 * @property {()=>boolean} tryAcquire
 * @property {<T>(fn:()=>T|Promise<T>, opts?:SemaphoreAcquireOptions)=>Promise<T>} runExclusive
 * @property {number}      permits
 * @property {number}      capacity
 */

/**
 * Counting semaphore factory surface.
 * @typedef {object} SemaphoreAPI
 * @property {(n:number)=>Semaphore} create - Build a fresh semaphore with `n` permits.
 */

export const semaphore = {
    name: 'semaphore',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: [],

    /**
     * @returns {SemaphoreAPI}
     */
    factory() {
        /**
         * Build a fresh semaphore with `n` initial permits.
         * @param {number} n - Integer >= 1.
         * @returns {Semaphore}
         * @throws {Error} when `n` is not an integer >= 1.
         */
        function create(n) {
            if (!Number.isInteger(n) || n < 1)
                throw new Error('semaphore: capacity must be an integer >= 1');

            const _capacity = n;
            let _permits = n;
            /** @type {Array<{resolve:Function, reject:Function, signal?:AbortSignal, onAbort?:Function}>} */
            const _waiters = [];

            /**
             * Acquire one permit. Resolves immediately if available, otherwise
             * queues FIFO. With `{ signal }`, the pending acquire can be cancelled
             * - the returned Promise rejects with the signal's reason and the
             * waiter is removed from the queue.
             * @param {SemaphoreAcquireOptions} [opts]
             * @returns {Promise<void>}
             */
            function acquire(opts) {
                const signal = opts && opts.signal;
                if (signal && signal.aborted) {
                    return Promise.reject(signal.reason ?? new Error('semaphore: acquire aborted'));
                }
                if (_permits > 0) {
                    _permits--;
                    return Promise.resolve();
                }
                return new Promise((resolve, reject) => {
                    const waiter = { resolve, reject };
                    if (signal) {
                        const onAbort = () => {
                            const idx = _waiters.indexOf(waiter);
                            if (idx !== -1) _waiters.splice(idx, 1);
                            reject(signal.reason ?? new Error('semaphore: acquire aborted'));
                        };
                        waiter.signal = signal;
                        waiter.onAbort = onAbort;
                        signal.addEventListener('abort', onAbort, { once: true });
                        const origResolve = resolve;
                        waiter.resolve = () => {
                            signal.removeEventListener('abort', onAbort);
                            origResolve();
                        };
                    }
                    _waiters.push(waiter);
                });
            }

            /**
             * Release one permit. Hands off to the next FIFO waiter when present.
             * @returns {void}
             * @throws {Error} when releasing past `capacity` (no waiters and permits == capacity).
             */
            function release() {
                if (_permits >= _capacity)
                    throw new Error('semaphore: release exceeds capacity');
                if (_waiters.length > 0) {
                    const next = _waiters.shift();
                    next.resolve();
                } else {
                    _permits++;
                }
            }

            /**
             * Non-blocking acquire attempt.
             * @returns {boolean} true if a permit was taken.
             */
            function tryAcquire() {
                if (_permits <= 0) return false;
                _permits--;
                return true;
            }

            /**
             * Acquire, run `fn`, then release - even when `fn` throws.
             * @template T
             * @param {()=>T|Promise<T>} fn
             * @param {SemaphoreAcquireOptions} [opts]
             * @returns {Promise<T>}
             */
            async function runExclusive(fn, opts) {
                await acquire(opts);
                try {
                    return await fn();
                } finally {
                    release();
                }
            }

            return {
                acquire,
                release,
                tryAcquire,
                runExclusive,
                get permits() { return _permits; },
                get capacity() { return _capacity; }
            };
        }

        return { create };
    }
};
