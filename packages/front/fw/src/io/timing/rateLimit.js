// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Debounce and throttle primitives (lodash-compatible semantics).
 * Supports leading/trailing edges, maxWait, cancel, flush, pending.
 * Uses only setTimeout/clearTimeout - worker-safe.
 *
 * @example
 * const rateLimit = registry.resolve('rateLimit');
 * const debouncedSearch = rateLimit.debounce(search, 300);
 * const throttledScroll = rateLimit.throttle(onScroll, 100);
 */

/**
 * A debounced callable wrapping the original `fn`.
 * @typedef {Function} DebouncedFn
 * @property {(...args: any[]) => any} [self] Invoke with the latest args; may return the last result on a leading/maxWait edge.
 * @property {() => void} cancel Cancel any pending invocation and clear timers.
 * @property {() => any} flush Immediately invoke any pending call and return the last result.
 * @property {() => boolean} pending Whether a call is currently scheduled.
 */

/**
 * A throttled callable wrapping the original `fn`. Same shape as {@link DebouncedFn}.
 * @typedef {Function} ThrottledFn
 * @property {() => void} cancel Cancel any pending invocation and clear timers.
 * @property {() => any} flush Immediately invoke any pending call and return the last result.
 * @property {() => boolean} pending Whether a call is currently scheduled.
 */

/**
 * Public API returned by `rateLimit.factory()`.
 * @typedef {object} RateLimitAPI
 * @property {(fn: Function, delay: number, options?: { leading?: boolean, trailing?: boolean, maxWait?: number }) => DebouncedFn} debounce Create a debounced version of `fn`.
 * @property {(fn: Function, interval: number, options?: { leading?: boolean, trailing?: boolean }) => ThrottledFn} throttle Create a throttled version of `fn`.
 */
export const rateLimit = {
    name: 'rateLimit',
    dependencies: [],

    /** @returns {RateLimitAPI} */
    factory() {

        /**
         * Create a debounced version of `fn` that delays invocation until
         * `delay` ms have elapsed since the last call.
         * @param {Function} fn - The function to debounce.
         * @param {number} delay - Wait time in milliseconds (must be > 0).
         * @param {Object} [options]
         * @param {boolean} [options.leading=false] - Invoke on the leading edge.
         * @param {boolean} [options.trailing=true] - Invoke on the trailing edge.
         * @param {number} [options.maxWait] - Maximum time `fn` is allowed to be delayed.
         * @returns {Function} Debounced function with `.cancel()`, `.flush()`, `.pending()`.
         */
        function debounce(fn, delay, options) {
            if (typeof fn !== 'function') throw new Error('rateLimit: fn must be a function');
            if (typeof delay !== 'number' || isNaN(delay) || delay <= 0)
                throw new Error('rateLimit: delay must be a positive number');

            const leading  = options && options.leading  !== undefined ? !!options.leading  : false;
            const trailing = options && options.trailing !== undefined ? !!options.trailing : true;
            const maxWait  = options && options.maxWait  !== undefined ? options.maxWait   : undefined;

            if (maxWait !== undefined && (typeof maxWait !== 'number' || isNaN(maxWait) || maxWait <= 0))
                throw new Error('rateLimit: maxWait must be a positive number');

            let timerId    = null;
            let maxTimerId = null;
            let lastArgs   = null;
            let lastThis   = null;
            let lastResult;
            let lastCallTime;
            let lastInvokeTime = 0;
            let isPending = false;

            /** Invoke `fn` with the most recent args/this and record the time. */
            function invoke(time) {
                lastInvokeTime = time;
                isPending = false;
                lastResult = fn.apply(lastThis, lastArgs);
                lastThis = null;
                lastArgs = null;
                return lastResult;
            }

            /** Schedule the trailing-edge timer after `wait` ms. */
            function startTimer(wait) {
                timerId = setTimeout(timerExpired, wait);
            }

            /** Clear the maxWait timer if it is scheduled. */
            function cancelMaxWait() {
                if (maxTimerId !== null) {
                    clearTimeout(maxTimerId);
                    maxTimerId = null;
                }
            }

            /** Timer tick: either invoke trailing edge or reschedule. */
            function timerExpired() {
                const time = Date.now();
                if (shouldInvoke(time)) {
                    return trailingEdge(time);
                }
                const remaining = remainingWait(time);
                timerId = setTimeout(timerExpired, remaining);
            }

            /** Resolve the trailing edge: invoke if needed, otherwise reset state. */
            function trailingEdge(time) {
                timerId = null;
                cancelMaxWait();
                if (trailing && lastArgs !== null) {
                    return invoke(time);
                }
                lastArgs = null;
                lastThis = null;
                isPending = false;
            }

            /** Compute remaining wait time, honoring `maxWait` when set. */
            function remainingWait(time) {
                const timeSinceLastCall   = time - lastCallTime;
                const timeSinceLastInvoke = time - lastInvokeTime;
                const timeWaiting         = delay - timeSinceLastCall;
                return maxWait !== undefined
                    ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
                    : timeWaiting;
            }

            /** Return `true` when the trailing edge should fire at `time`. */
            function shouldInvoke(time) {
                const timeSinceLastCall   = time - lastCallTime;
                const timeSinceLastInvoke = time - lastInvokeTime;
                return (
                    lastCallTime === undefined ||
                    timeSinceLastCall >= delay ||
                    timeSinceLastCall < 0 ||
                    (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
                );
            }

            /** Resolve the leading edge: start the timer and optionally invoke. */
            function leadingEdge(time) {
                lastInvokeTime = time;
                startTimer(delay);
                isPending = true;
                if (leading) {
                    return invoke(time);
                }
            }

            /** The debounced callable returned to user code. */
            function debounced(...args) {
                const time = Date.now();
                const isInvoking = shouldInvoke(time);

                lastArgs     = args;
                lastThis     = this;
                lastCallTime = time;
                isPending    = true;

                if (isInvoking) {
                    if (timerId === null) {
                        return leadingEdge(time);
                    }
                    if (maxWait !== undefined) {
                        if (timerId !== null) {
                            clearTimeout(timerId);
                        }
                        timerId = setTimeout(timerExpired, delay);
                        return invoke(time);
                    }
                }

                if (timerId === null) {
                    startTimer(delay);
                }

                if (maxWait !== undefined && maxTimerId === null) {
                    maxTimerId = setTimeout(() => {
                        maxTimerId = null;
                        if (lastArgs !== null) {
                            const t = Date.now();
                            lastInvokeTime = t;
                            isPending = false;
                            lastResult = fn.apply(lastThis, lastArgs);
                            lastThis = null;
                            lastArgs = null;
                        }
                    }, maxWait);
                }

                return undefined;
            }

            /** Cancel any pending invocation and clear timers. */
            debounced.cancel = function () {
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                cancelMaxWait();
                lastArgs = null;
                lastThis = null;
                isPending = false;
            };

            /** Immediately invoke any pending call and return the last result. */
            debounced.flush = function () {
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                cancelMaxWait();
                if (lastArgs !== null) {
                    const time = Date.now();
                    isPending = false;
                    lastResult = fn.apply(lastThis, lastArgs);
                    lastThis = null;
                    lastArgs = null;
                    lastInvokeTime = time;
                }
                return lastResult;
            };

            /** Whether a call is currently scheduled. */
            debounced.pending = function () {
                return isPending;
            };

            return debounced;
        }

        /**
         * Create a throttled version of `fn` that invokes at most once per
         * `interval` ms. Implemented as a debounce with `maxWait === interval`.
         * @param {Function} fn - The function to throttle.
         * @param {number} interval - Throttle window in milliseconds (must be > 0).
         * @param {Object} [options]
         * @param {boolean} [options.leading=true] - Invoke on the leading edge.
         * @param {boolean} [options.trailing=true] - Invoke on the trailing edge.
         * @returns {Function} Throttled function with `.cancel()`, `.flush()`, `.pending()`.
         */
        function throttle(fn, interval, options) {
            if (typeof fn !== 'function') throw new Error('rateLimit: fn must be a function');
            if (typeof interval !== 'number' || isNaN(interval) || interval <= 0)
                throw new Error('rateLimit: interval must be a positive number');

            const leading  = options && options.leading  !== undefined ? !!options.leading  : true;
            const trailing = options && options.trailing !== undefined ? !!options.trailing : true;

            if (!leading && !trailing)
                throw new Error('rateLimit: throttle options leading and trailing cannot both be false');

            return debounce(fn, interval, { leading, trailing, maxWait: interval });
        }

        return { debounce, throttle };
    }
};
