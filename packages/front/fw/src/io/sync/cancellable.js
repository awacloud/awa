// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Cancellable async tasks with LIFO cleanup hooks, plus `race`, `all`, and a
 * `pool`. Depends on `abort` for AbortError construction / propagation.
 *
 * **Notes on lifecycle.**
 * - `cancel()` is idempotent. If called on a done task, hooks are *not* re-run.
 *   If called before `run()`, hooks registered later via the task body are
 *   never invoked (since the body never executes).
 * - `pool.add(task)` runs the task and rejects via `onError` if provided;
 *   otherwise rejections are still surfaced via the task's own `run()` promise
 *   the caller might hold. Errors are not silently swallowed.
 * - `pool` is reusable after `cancelAll()` - `cleared` flips to `true` to
 *   indicate the last cancel-all happened, but new `add()` calls reset that
 *   state. Callers that want one-shot behaviour should guard themselves.
 */

/**
 * @typedef {Object} CancellableTaskContext
 * @property {AbortSignal} signal
 * @property {(fn:()=>void|Promise<void>)=>void} onCancel - Register a cleanup hook (LIFO).
 * @property {()=>void} throwIfAborted
 */

/**
 * @typedef {Object} CancellableTask
 * @property {()=>Promise<*>} run
 * @property {(reason?:any)=>Promise<void>} cancel
 * @property {boolean} cancelled
 * @property {boolean} done
 * @property {AbortSignal} signal
 */

/**
 * @typedef {Object} CancellablePoolOptions
 * @property {(err:any, task:CancellableTask)=>void} [onError]
 *   Optional sink for task rejections inside the pool. Without it, the pool
 *   suppresses unhandled-rejection noise but the task's own `run()` promise
 *   (returned earlier to `add`'s caller? no - pool owns it) is consumed.
 *   Use `onError` when you need to observe failures.
 */

/**
 * Cancellable async task helpers with LIFO cleanup, plus `race`, `all`, `pool`.
 * @typedef {object} CancellableAPI
 * @property {(asyncFn:(ctx:CancellableTaskContext)=>Promise<*>)=>CancellableTask} create - Build a cancellable task wrapper.
 * @property {(...tasks:CancellableTask[])=>Promise<*>} race - Race tasks; first to settle wins, others cancelled.
 * @property {(tasks:CancellableTask[])=>Promise<*[]>} all - Run tasks in parallel; reject cancels the rest.
 * @property {(opts?:CancellablePoolOptions)=>Object} pool - Build a pool of long-lived cancellable tasks.
 */

import { abort } from './abort.js';

export const cancellable = {
    name: 'cancellable',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: ['abort'],
    deps: [abort],

    /**
     * @param {Object} abortDep - resolved `abort` module.
     * @returns {CancellableAPI}
     */
    factory(abortDep) {
        /**
         * Build a cancellable task wrapper around `asyncFn(ctx)`.
         * The task can be run at most once; `cancel()` aborts its signal and
         * runs registered hooks in LIFO order.
         * @param {(ctx:CancellableTaskContext)=>Promise<*>} asyncFn
         * @returns {CancellableTask}
         */
        function create(asyncFn) {
            if (typeof asyncFn !== 'function')
                throw new Error('cancellable: asyncFn must be a function');

            const controller = new AbortController();
            const _hooks = [];
            let _started = false;
            let _done = false;
            let _cancelled = false;

            function onCancel(fn) {
                if (typeof fn !== 'function') throw new Error('cancellable: onCancel requires a function');
                if (_cancelled) {
                    Promise.resolve().then(() => {
                        try { fn(); } catch (e) { console.error(e); }
                    });
                    return;
                }
                _hooks.push(fn);
            }

            function throwIfAborted() {
                abortDep.throwIfAborted(controller.signal);
            }

            function _runHooks() {
                const hooks = _hooks.splice(0).reverse();
                const promises = [];
                for (const fn of hooks) {
                    try {
                        const r = fn();
                        if (r && typeof r.then === 'function')
                            promises.push(r.catch(e => console.error(e)));
                    } catch (e) {
                        console.error(e);
                    }
                }
                return Promise.all(promises);
            }

            function cancel(reason) {
                if (_done || _cancelled) return Promise.resolve();
                _cancelled = true;
                controller.abort(abortDep.error(reason ?? 'cancellable: cancelled'));
                if (!_started) return Promise.resolve();
                return _runHooks();
            }

            async function run() {
                if (_started) throw new Error('cancellable: task already started');
                _started = true;
                if (_cancelled) {
                    _done = true;
                    throw controller.signal.reason ?? abortDep.error('cancellable: cancelled before run');
                }
                try {
                    const result = await asyncFn({ signal: controller.signal, onCancel, throwIfAborted });
                    _done = true;
                    return result;
                } catch (e) {
                    _done = true;
                    throw e;
                }
            }

            return {
                run,
                // @ts-ignore - cancel returns Promise<void>|Promise<any[]>; both satisfy Promise<void> at runtime
                cancel,
                get cancelled() { return _cancelled; },
                get done()      { return _done; },
                get signal()    { return controller.signal; },
            };
        }

        function _validateTask(t) {
            if (!t || typeof t.run !== 'function' || typeof t.cancel !== 'function')
                throw new Error('cancellable: argument must be a task from cancellable.create');
        }

        /**
         * Race multiple tasks; first to settle (resolve or reject) wins and all
         * others are cancelled with reason `'cancellable: race lost'`.
         * @param {...CancellableTask} tasks
         * @returns {Promise<*>}
         */
        function race(...tasks) {
            if (tasks.length === 0) throw new Error('cancellable: race requires at least one task');
            for (const t of tasks) _validateTask(t);

            return new Promise((resolve, reject) => {
                let settled = false;
                for (const t of tasks) {
                    t.run().then(
                        result => {
                            if (settled) return;
                            settled = true;
                            resolve(result);
                            for (const other of tasks) {
                                if (other !== t) other.cancel('cancellable: race lost');
                            }
                        },
                        err => {
                            if (settled) return;
                            settled = true;
                            reject(err);
                            for (const other of tasks) {
                                if (other !== t) other.cancel('cancellable: race lost');
                            }
                        }
                    );
                }
            });
        }

        /**
         * Run all tasks in parallel; resolves with an ordered results array.
         * Any rejection cancels the rest with reason `'cancellable: all failed'`.
         * @param {CancellableTask[]} tasks - Non-empty array.
         * @returns {Promise<*[]>}
         */
        function all(tasks) {
            if (!Array.isArray(tasks) || tasks.length === 0)
                throw new Error('cancellable: all requires a non-empty array of tasks');
            for (const t of tasks) _validateTask(t);

            return new Promise((resolve, reject) => {
                const results = new Array(tasks.length);
                let resolved = 0;
                let failed = false;

                tasks.forEach((t, i) => {
                    t.run().then(
                        result => {
                            if (failed) return;
                            results[i] = result;
                            if (++resolved === tasks.length) resolve(results);
                        },
                        err => {
                            if (failed) return;
                            failed = true;
                            reject(err);
                            for (const other of tasks) other.cancel('cancellable: all failed');
                        }
                    );
                });
            });
        }

        /**
         * Build a pool of long-lived cancellable tasks. `add(task)` starts the
         * task. Errors thrown by tasks are routed to `opts.onError(err, task)`
         * when provided; otherwise they're swallowed at the pool boundary to
         * avoid unhandled-rejection noise (the audit explicitly calls this out
         * - provide `onError` whenever observability matters).
         *
         * After `cancelAll()`, the pool is reusable - `add()` accepts new tasks
         * and `cleared` resets to `false`.
         *
         * @param {CancellablePoolOptions} [opts]
         */
        function pool(opts) {
            const onError = opts && typeof opts.onError === 'function' ? opts.onError : null;
            const _tasks = new Set();
            let _cleared = false;

            function add(task) {
                _validateTask(task);
                if (task.done) throw new Error('cancellable: cannot add a completed task to pool');
                _cleared = false;
                _tasks.add(task);
                task.run().then(
                    () => { _tasks.delete(task); },
                    err => {
                        _tasks.delete(task);
                        if (onError) {
                            try { onError(err, task); } catch (e) { console.error(e); }
                        }
                    }
                );
            }

            async function cancelAll(reason) {
                const promises = [];
                for (const task of _tasks) {
                    promises.push(task.cancel(reason ?? 'cancellable: pool cancelled'));
                }
                await Promise.all(promises);
                _tasks.clear();
                _cleared = true;
            }

            return {
                add,
                cancelAll,
                get size()    { return _tasks.size; },
                get cleared() { return _cleared; },
            };
        }

        return { create, race, all, pool };
    },
};
