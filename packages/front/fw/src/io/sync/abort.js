// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Helpers around the native AbortController / AbortSignal.
 * Provides auto-aborting timeouts, signal composition (`any`), and
 * Promise integration (`wait`, `race`).
 * No polyfill - AbortController is assumed native (modern workers and browsers).
 *
 * @example
 * const abort = registry.resolve('abort');
 * const { signal } = abort.timeout(5000);
 * const data = await abort.race(fetch(url, { signal }), signal);
 */

/**
 * @typedef {Object} AbortTimeoutHandle
 * @property {AbortSignal}      signal     - The auto-aborting signal.
 * @property {AbortController}  controller - The underlying controller.
 * @property {(reason?:any)=>void} abort   - Manual abort + timer clear.
 */

/**
 * Helpers around the native AbortController / AbortSignal.
 * @typedef {object} AbortAPI
 * @property {(ms:number)=>AbortTimeoutHandle} timeout - Create a controller that auto-aborts after `ms`.
 * @property {(...signals:AbortSignal[])=>AbortSignal} any - Combine signals into one that aborts when any source aborts.
 * @property {(signal:AbortSignal)=>Promise<never>} wait - Promise that rejects when the signal aborts.
 * @property {<T>(promise:Promise<T>, signal?:AbortSignal|null)=>Promise<T>} race - Race a promise against a signal aborting.
 * @property {(signal?:AbortSignal|null)=>void} throwIfAborted - Throw the signal's reason if it is aborted.
 * @property {(reason?:any)=>Error} error - Build an AbortError.
 */

export const abort = {
    name: 'abort',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: [],

    /**
     * @returns {AbortAPI}
     */
    factory() {

        /**
         * Build an AbortError (DOMException when available, plain Error otherwise).
         * @param {any} [reason]
         * @returns {Error}
         */
        function error(reason) {
            const message = typeof reason === 'string' ? reason : 'The operation was aborted';
            if (typeof DOMException !== 'undefined') {
                return new DOMException(message, 'AbortError');
            }
            const err = new Error(message);
            err.name = 'AbortError';
            return err;
        }

        /**
         * Create an AbortController that aborts itself after `ms` milliseconds.
         * The returned `abort()` callback clears the timer and aborts manually.
         * @param {number} ms - Positive integer ms.
         * @returns {AbortTimeoutHandle}
         * @throws {Error} when `ms` is not a positive number.
         */
        function timeout(ms) {
            if (typeof ms !== 'number' || isNaN(ms) || ms <= 0)
                throw new Error('abort: ms must be a positive number');

            const controller = new AbortController();
            const timerId = setTimeout(() => controller.abort(error()), ms);

            function abortFn(reason) {
                clearTimeout(timerId);
                controller.abort(reason !== undefined ? reason : error());
            }

            controller.signal.addEventListener('abort', () => clearTimeout(timerId), { once: true });

            return { signal: controller.signal, controller, abort: abortFn };
        }

        /**
         * Combine multiple AbortSignals into one that aborts when any source aborts.
         * Uses native `AbortSignal.any` when present; otherwise a small polyfill.
         * @param {...AbortSignal} signals
         * @returns {AbortSignal}
         * @throws {Error} when called with no signals or with a non-AbortSignal value.
         */
        function any(...signals) {
            if (signals.length === 0) throw new Error('abort: any() requires at least one signal');
            for (const s of signals) {
                if (!(s instanceof AbortSignal))
                    throw new Error('abort: any() arguments must be AbortSignal instances');
            }

            if (typeof AbortSignal.any === 'function') {
                return AbortSignal.any(signals);
            }

            // Polyfill
            const already = signals.find(s => s.aborted);
            if (already) {
                const c = new AbortController();
                c.abort(already.reason);
                return c.signal;
            }

            const controller = new AbortController();
            const handlers = [];

            function onAbort(evt) {
                if (!controller.signal.aborted) {
                    controller.abort(evt.target.reason);
                }
                cleanup();
            }

            function cleanup() {
                for (const [s, h] of handlers) s.removeEventListener('abort', h);
                handlers.length = 0;
            }

            for (const s of signals) {
                const h = (evt) => onAbort(evt);
                handlers.push([s, h]);
                s.addEventListener('abort', h, { once: true });
            }

            return controller.signal;
        }

        /**
         * Return a Promise that rejects with the signal's reason (or an AbortError)
         * when the signal aborts. Rejects immediately if already aborted.
         * @param {AbortSignal} signal
         * @returns {Promise<never>}
         * @throws {Error} when `signal` is not an AbortSignal.
         */
        function wait(signal) {
            if (!(signal instanceof AbortSignal))
                throw new Error('abort: wait() requires an AbortSignal');

            if (signal.aborted) {
                return Promise.reject(signal.reason !== undefined ? signal.reason : error());
            }

            return new Promise((_resolve, reject) => {
                // `{ once: true }` removes the listener automatically - no manual cleanup needed.
                signal.addEventListener('abort', () => {
                    reject(signal.reason !== undefined ? signal.reason : error());
                }, { once: true });
            });
        }

        /**
         * Race `promise` against `signal` aborting. When signal is null/undefined,
         * returns `promise` unchanged.
         * @template T
         * @param {Promise<T>} promise
         * @param {AbortSignal|null} [signal]
         * @returns {Promise<T>}
         */
        function race(promise, signal) {
            if (signal === undefined || signal === null) return promise;

            if (!(signal instanceof AbortSignal))
                throw new Error('abort: race() second argument must be an AbortSignal or null/undefined');

            if (signal.aborted) {
                return Promise.reject(signal.reason !== undefined ? signal.reason : error());
            }

            return Promise.race([promise, wait(signal)]);
        }

        /**
         * Throw the signal's reason (or an AbortError) if it is aborted.
         * No-op for null/undefined signals.
         * @param {AbortSignal|null} [signal]
         * @returns {void}
         * @throws {Error} the signal's reason or a generic AbortError.
         */
        function throwIfAborted(signal) {
            if (signal === undefined || signal === null) return;
            if (signal.aborted) {
                throw signal.reason !== undefined ? signal.reason : error();
            }
        }

        return { timeout, any, wait, race, throwIfAborted, error };
    }
};
