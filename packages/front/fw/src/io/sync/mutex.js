// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Async FIFO binary lock, intra-context. Not re-entrant.
 * Worker-compatible - no DOM dependency.
 *
 * @example
 * const mutex = registry.resolve('mutex');
 * const m = mutex.create();
 * await m.acquire();
 * try { criticalSection(); } finally { m.release(); }
 */

/**
 * @typedef {Object} MutexAcquireOptions
 * @property {AbortSignal} [signal] - Optional abort signal - cancels a pending
 *   acquire; the returned Promise rejects with the signal's reason.
 */

/**
 * @typedef {Object} Mutex
 * @property {(opts?:MutexAcquireOptions)=>Promise<void>} acquire
 * @property {()=>void}    release
 * @property {()=>boolean} tryAcquire
 * @property {<T>(fn:()=>T|Promise<T>, opts?:MutexAcquireOptions)=>Promise<T>} runExclusive
 * @property {boolean}     locked
 */

/**
 * Async FIFO binary lock factory surface.
 * @typedef {object} MutexAPI
 * @property {()=>Mutex} create - Build a fresh mutex.
 */

export const mutex = {
    name: 'mutex',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: [],

    /**
     * @returns {MutexAPI}
     */
    factory() {
        /**
         * Build a fresh mutex.
         * @returns {Mutex}
         */
        function create() {
            let _locked = false;
            /** @type {Array<{resolve:Function, reject:Function, signal?:AbortSignal, onAbort?:Function}>} */
            const _waiters = [];

            /**
             * Acquire the lock. Resolves immediately when free, otherwise queues
             * FIFO. With `{ signal }`, the pending acquire can be cancelled - the
             * returned Promise rejects with the signal's reason and the waiter is
             * removed from the queue.
             * @param {MutexAcquireOptions} [opts]
             * @returns {Promise<void>}
             */
            function acquire(opts) {
                const signal = opts && opts.signal;
                if (signal && signal.aborted) {
                    return Promise.reject(signal.reason ?? new Error('mutex: acquire aborted'));
                }
                if (!_locked) {
                    _locked = true;
                    return Promise.resolve();
                }
                return new Promise((resolve, reject) => {
                    const waiter = { resolve, reject };
                    if (signal) {
                        const onAbort = () => {
                            const idx = _waiters.indexOf(waiter);
                            if (idx !== -1) _waiters.splice(idx, 1);
                            reject(signal.reason ?? new Error('mutex: acquire aborted'));
                        };
                        waiter.signal = signal;
                        waiter.onAbort = onAbort;
                        signal.addEventListener('abort', onAbort, { once: true });
                        // Wrap resolve so the listener is cleaned up on hand-off.
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
             * Release the lock; hands off to the next waiter (FIFO).
             * @returns {void}
             * @throws {Error} when called on an unlocked mutex.
             */
            function release() {
                if (!_locked) throw new Error('mutex: release on unlocked');
                if (_waiters.length > 0) {
                    const next = _waiters.shift();
                    next.resolve();
                } else {
                    _locked = false;
                }
            }

            /**
             * Non-blocking acquire attempt.
             * @returns {boolean} true if the lock was taken.
             */
            function tryAcquire() {
                if (_locked) return false;
                _locked = true;
                return true;
            }

            /**
             * Acquire, run `fn`, then release - even when `fn` throws.
             * @template T
             * @param {()=>T|Promise<T>} fn
             * @param {MutexAcquireOptions} [opts]
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
                get locked() { return _locked; }
            };
        }

        return { create };
    }
};
