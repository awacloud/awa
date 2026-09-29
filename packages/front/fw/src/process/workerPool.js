// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Homogeneous pool of N identical Web Workers. Distributes jobs through a FIFO queue.
 * Each job is cancellable (AbortSignal). On worker crash, the current job is rejected
 * and a replacement worker is spawned if `respawnOnCrash` is enabled.
 *
 * Out of MVP scope: heterogeneous workers, per-job prioritization.
 *
 * @example
 * const workerPool = runtime.resolve('workerPool');
 * const pool = workerPool.create({
 *     factory: () => fw.createWorker(taskFn, { dependencies: ['hex'] }),
 *     size: 4
 * });
 * const result = await pool.run({ data: [1, 2, 3] });
 * pool.terminate();
 */

/**
 * A live worker pool instance returned by `create()`.
 * @typedef {object} WorkerPool
 * @property {(job: any, runOpts?: { transfer?: Transferable[], signal?: AbortSignal }) => Promise<any>} run - Submit a job to the pool; resolves with the worker's result.
 * @property {() => number} size - Effective pool size (number of worker slots).
 * @property {() => number} idle - Number of idle workers.
 * @property {() => number} pending - Number of queued jobs.
 * @property {(n: number) => void} resize - Adjust the pool size (grow immediately, shrink lazily).
 * @property {() => void} terminate - Terminate all workers and reject queued jobs.
 */

/**
 * Worker-pool helper surface returned by `factory()`.
 * @typedef {object} WorkerPoolAPI
 * @property {(opts: { factory: Function, size?: number, maxQueue?: number, respawnOnCrash?: boolean }) => WorkerPool} create - Create a homogeneous pool of N identical Web Workers.
 */

export const workerPool = {
    name: 'workerPool',
    version: '1.0.0',
    type: 'fw.process',
    dependencies: [],

    /**
     * @returns {WorkerPoolAPI}
     */
    factory() {

        /**
         * Create a worker pool.
         * @param {Object} opts
         * @param {Function} opts.factory - () => Worker | WorkerLike
         * @param {number} [opts.size] - Number of workers (default: navigator.hardwareConcurrency || 4)
         * @param {number} [opts.maxQueue] - Max queued jobs (default: Infinity)
         * @param {boolean} [opts.respawnOnCrash] - Respawn after crash (default: true)
         * @returns {{ run, size, idle, pending, resize, terminate }}
         */
        function create(opts) {
            if (!opts || typeof opts.factory !== 'function') {
                throw new Error('workerPool: opts.factory must be a function');
            }

            const _factory = opts.factory;
            const _maxQueue = opts.maxQueue !== undefined ? opts.maxQueue : Infinity;
            const _respawnOnCrash = opts.respawnOnCrash !== false;

            let _targetSize = typeof opts.size === 'number' && opts.size >= 1
                ? Math.floor(opts.size)
                : (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;

            let _terminated = false;

            // Internal state for each worker slot:
            // { worker, busy, pendingJob }
            // pendingJob: { resolve, reject, job, transfer, signal } | null
            const _slots = [];

            // Pending queue: items = { job, transfer, signal, resolve, reject }
            const _jobQueue = [];

            // Initialize slots
            function _initSlots() {
                while (_slots.length < _targetSize) {
                    _slots.push(_createSlot());
                }
            }

            function _createSlot() {
                const slot = { worker: null, busy: false, pendingJob: null };
                slot.worker = _spawnWorker(slot);
                return slot;
            }

            function _spawnWorker(slot) {
                const w = _factory();

                w.onmessage = (event) => {
                    const pj = slot.pendingJob;
                    slot.pendingJob = null;
                    slot.busy = false;
                    if (pj) {
                        pj.resolve(event && event.data !== undefined ? event.data : event);
                    }
                    _drainQueue();
                };

                w.onerror = (err) => {
                    const pj = slot.pendingJob;
                    slot.pendingJob = null;
                    slot.busy = false;
                    if (pj) {
                        pj.reject(err instanceof Error ? err : new Error(String(err)));
                    }
                    if (_respawnOnCrash && !_terminated && _slots.includes(slot)) {
                        slot.worker = _spawnWorker(slot);
                    }
                    _drainQueue();
                };

                if (w.onmessageerror !== undefined) {
                    w.onmessageerror = (err) => {
                        const pj = slot.pendingJob;
                        slot.pendingJob = null;
                        slot.busy = false;
                        if (pj) {
                            pj.reject(new Error('workerPool: message error'));
                        }
                        if (_respawnOnCrash && !_terminated && _slots.includes(slot)) {
                            slot.worker = _spawnWorker(slot);
                        }
                        _drainQueue();
                    };
                }

                return w;
            }

            function _findIdleSlot() {
                for (const slot of _slots) {
                    if (!slot.busy) return slot;
                }
                return null;
            }

            function _dispatchTo(slot, item) {
                slot.busy = true;
                slot.pendingJob = item;

                // Handle abort if the signal is already aborted
                if (item.signal && item.signal.aborted) {
                    slot.busy = false;
                    slot.pendingJob = null;
                    const abortErr = new Error('AbortError');
                    abortErr.name = 'AbortError';
                    item.reject(abortErr);
                    // No need to drain here; caller will if needed.
                    return;
                }

                let abortHandler = null;
                if (item.signal) {
                    abortHandler = () => {
                        // Job in flight - terminate the worker
                        slot.busy = false;
                        slot.pendingJob = null;
                        try { slot.worker.terminate(); } catch (_) {}
                        if (_respawnOnCrash && !_terminated) {
                            slot.worker = _spawnWorker(slot);
                        }
                        const abortErr = new Error('AbortError');
                        abortErr.name = 'AbortError';
                        item.reject(abortErr);
                        _drainQueue();
                    };
                    item.signal.addEventListener('abort', abortHandler, { once: true });
                }

                // Wrapper to remove the abort listener on resolution/rejection
                const originalResolve = item.resolve;
                const originalReject = item.reject;
                item.resolve = (v) => {
                    if (abortHandler && item.signal) {
                        item.signal.removeEventListener('abort', abortHandler);
                    }
                    originalResolve(v);
                };
                item.reject = (e) => {
                    if (abortHandler && item.signal) {
                        item.signal.removeEventListener('abort', abortHandler);
                    }
                    originalReject(e);
                };
                // Refresh pendingJob with the wrappers
                slot.pendingJob = item;

                try {
                    if (item.transfer && item.transfer.length > 0) {
                        slot.worker.postMessage(item.job, item.transfer);
                    } else {
                        slot.worker.postMessage(item.job);
                    }
                } catch (e) {
                    slot.busy = false;
                    slot.pendingJob = null;
                    item.reject(e);
                }
            }

            function _drainQueue() {
                if (_terminated) return;
                while (_jobQueue.length > 0) {
                    const idleSlot = _findIdleSlot();
                    if (!idleSlot) break;
                    const item = _jobQueue.shift();
                    _dispatchTo(idleSlot, item);
                }
            }

            _initSlots();

            /**
             * Submit a job to the pool.
             * @param {any} job
             * @param {Object} [runOpts]
             * @param {Transferable[]} [runOpts.transfer]
             * @param {AbortSignal} [runOpts.signal]
             * @returns {Promise<any>}
             */
            function run(job, runOpts) {
                if (_terminated) {
                    return Promise.reject(new Error('workerPool: pool is terminated'));
                }

                const transfer = (runOpts && runOpts.transfer) || [];
                const signal = (runOpts && runOpts.signal) || null;

                // Reject immediately if signal is already aborted
                if (signal && signal.aborted) {
                    const abortErr = new Error('AbortError');
                    abortErr.name = 'AbortError';
                    return Promise.reject(abortErr);
                }

                // Check maxQueue
                if (_jobQueue.length >= _maxQueue) {
                    return Promise.reject(new Error('workerPool: queue is full (maxQueue=' + _maxQueue + ')'));
                }

                return new Promise((resolve, reject) => {
                    const item = { job, transfer, signal, resolve, reject };

                    // Handle abort while still queued
                    if (signal) {
                        const queueAbortHandler = () => {
                            const idx = _jobQueue.indexOf(item);
                            if (idx !== -1) {
                                _jobQueue.splice(idx, 1);
                                const abortErr = new Error('AbortError');
                                abortErr.name = 'AbortError';
                                reject(abortErr);
                            }
                        };
                        signal.addEventListener('abort', queueAbortHandler, { once: true });
                        // Override reject to drop the listener
                        const originalReject = item.reject;
                        item.reject = (e) => {
                            signal.removeEventListener('abort', queueAbortHandler);
                            originalReject(e);
                        };
                        const originalResolve = item.resolve;
                        item.resolve = (v) => {
                            signal.removeEventListener('abort', queueAbortHandler);
                            originalResolve(v);
                        };
                    }

                    const idleSlot = _findIdleSlot();
                    if (idleSlot) {
                        _dispatchTo(idleSlot, item);
                    } else {
                        _jobQueue.push(item);
                    }
                });
            }

            /** @returns {number} Effective pool size */
            function size() {
                return _slots.length;
            }

            /** @returns {number} Number of idle workers */
            function idle() {
                let count = 0;
                for (const slot of _slots) {
                    if (!slot.busy) count++;
                }
                return count;
            }

            /** @returns {number} Number of queued jobs */
            function pending() {
                return _jobQueue.length;
            }

            /**
             * Adjust the pool size.
             * Increase: new workers spawned immediately.
             * Decrease: surplus workers terminated after their current job.
             * @param {number} n
             */
            function resize(n) {
                if (typeof n !== 'number' || n < 1 || Math.floor(n) !== n) {
                    throw new Error('workerPool: size must be a positive integer');
                }
                if (_terminated) return;

                const current = _slots.length;
                _targetSize = n;

                if (n > current) {
                    // Add slots
                    for (let i = current; i < n; i++) {
                        _slots.push(_createSlot());
                    }
                    _drainQueue();
                } else if (n < current) {
                    // Remove surplus slots, starting with idle ones
                    let toRemove = current - n;
                    // First, idle slots
                    for (let i = _slots.length - 1; i >= 0 && toRemove > 0; i--) {
                        if (!_slots[i].busy) {
                            const slot = _slots.splice(i, 1)[0];
                            try { slot.worker.terminate(); } catch (_) {}
                            toRemove--;
                        }
                    }
                    // Then, busy slots (lazy: mark for removal after the current job)
                    for (let i = _slots.length - 1; i >= 0 && toRemove > 0; i--) {
                        const slot = _slots.splice(i, 1)[0];
                        // The worker will finish its current job, then be GC'd.
                        // Override onmessage/onerror so we do not respawn.
                        const pj = slot.pendingJob;
                        slot.worker.onmessage = (event) => {
                            if (pj) {
                                pj.resolve(event && event.data !== undefined ? event.data : event);
                            }
                            try { slot.worker.terminate(); } catch (_) {}
                        };
                        slot.worker.onerror = (err) => {
                            if (pj) {
                                pj.reject(err instanceof Error ? err : new Error(String(err)));
                            }
                            try { slot.worker.terminate(); } catch (_) {}
                        };
                        toRemove--;
                    }
                }
            }

            /**
             * Terminate all workers and reject queued jobs.
             */
            function terminate() {
                if (_terminated) return;
                _terminated = true;

                // Reject all queued jobs
                while (_jobQueue.length > 0) {
                    const item = _jobQueue.shift();
                    item.reject(new Error('workerPool: pool terminated'));
                }

                // Terminate every worker and reject in-flight jobs
                for (const slot of _slots) {
                    if (slot.pendingJob) {
                        const pj = slot.pendingJob;
                        slot.pendingJob = null;
                        pj.reject(new Error('workerPool: pool terminated'));
                    }
                    try { slot.worker.terminate(); } catch (_) {}
                }
                _slots.length = 0;
            }

            return { run, size, idle, pending, resize, terminate };
        }

        return { create };
    }
};
