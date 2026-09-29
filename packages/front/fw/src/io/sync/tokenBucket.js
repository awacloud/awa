// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Token bucket rate limiter with lazy refill (no background timer).
 * `tryTake` / `take` are O(1). Composable with `channel` for backpressure.
 *
 * **Clock.** `Date.now()` is used and clamped against the previous timestamp
 * via `max(prev, now)` so backward NTP jumps cannot make `elapsed` negative
 * and drain the bucket. (`performance.now` is intentionally avoided - fw
 * sanity rules block it.)
 *
 * **Timers.** Pending `setTimeout(_drain, …)` calls are coalesced into a
 * single timer (`_pendingTimerId`) so a queue of waiters cannot accumulate
 * timers. The timer is cleared in `cancel()` and on each schedule.
 *
 * **`cancel()` vs `reset()`.**
 * - `cancel()` rejects all pending waiters and marks the bucket terminal -
 *   future `take()` calls reject immediately. `reset()` does **not** un-cancel.
 * - `reset()` refills tokens to `capacity` and re-drains existing waiters.
 *   Use it on a live bucket; do not rely on it to revive a cancelled one.
 */

/**
 * @typedef {Object} TokenBucketOptions
 * @property {number} capacity        - Integer >= 1, max tokens.
 * @property {number} refillRate      - Tokens added per `refillInterval` (>= 0; 0 = fixed bucket).
 * @property {number} [refillInterval=1000] - Interval in ms.
 * @property {number} [initial]       - Initial tokens (defaults to `capacity`).
 */

/**
 * @typedef {Object} TokenBucket
 * @property {(n?:number)=>boolean}        tryTake
 * @property {(n?:number)=>Promise<void>}  take
 * @property {()=>void}                    reset
 * @property {()=>void}                    cancel
 * @property {number} available
 * @property {number} capacity
 * @property {number} refillRate
 * @property {number} refillInterval
 */

/**
 * Token bucket rate limiter factory surface.
 * @typedef {object} TokenBucketAPI
 * @property {(opts:TokenBucketOptions)=>TokenBucket} create - Build a fresh token bucket.
 */

export const tokenBucket = {
    name: 'tokenBucket',
    version: '1.0.0',
    type: 'fw.io.sync',
    dependencies: [],

    /**
     * @returns {TokenBucketAPI}
     */
    factory() {
        /**
         * Build a fresh token bucket.
         * @param {TokenBucketOptions} opts
         * @returns {TokenBucket}
         */
        // @ts-ignore - default {} satisfies runtime guard; TS requires all fields upfront
        function create({ capacity, refillRate, refillInterval = 1000, initial } = {}) {
            if (!Number.isInteger(capacity) || capacity < 1)
                throw new Error('tokenBucket: capacity must be an integer >= 1');
            if (typeof refillRate !== 'number' || refillRate < 0)
                throw new Error('tokenBucket: refillRate must be a number >= 0');

            const _initial = initial !== undefined ? initial : capacity;
            let _tokens = _initial;

            // Monotonic clamp around Date.now() - guards against backward clock jumps.
            function _monotonicNow() {
                const now = Date.now();
                if (now < _lastUpdate) return _lastUpdate;
                return now;
            }
            let _lastUpdate = Date.now();

            let _cancelled = false;
            /** @type {ReturnType<typeof setTimeout>|null} */
            let _pendingTimerId = null;

            // Lazy refill: calculate tokens accrued since last update.
            function _refill() {
                if (refillRate === 0) return;
                const now = _monotonicNow();
                const elapsed = now - _lastUpdate;
                if (elapsed <= 0) { _lastUpdate = now; return; }
                const accrued = (elapsed / refillInterval) * refillRate;
                _tokens = Math.min(capacity, _tokens + accrued);
                _lastUpdate = now;
            }

            // FIFO waiters queue: [{n, resolve, reject}]
            const _waiters = [];

            function _scheduleDrain(delayMs) {
                if (_pendingTimerId !== null) return;
                _pendingTimerId = setTimeout(() => {
                    _pendingTimerId = null;
                    _drain();
                }, Math.max(1, Math.ceil(delayMs)));
            }

            function _drain() {
                while (_waiters.length > 0) {
                    _refill();
                    const { n, resolve } = _waiters[0];
                    if (_tokens >= n) {
                        _tokens -= n;
                        _waiters.shift();
                        resolve();
                    } else {
                        if (refillRate > 0) {
                            const needed = ((n - _tokens) / refillRate) * refillInterval;
                            _scheduleDrain(needed);
                        }
                        break;
                    }
                }
            }

            /**
             * Non-blocking take.
             * @param {number} [n=1]
             * @returns {boolean} true if tokens were taken.
             */
            function tryTake(n = 1) {
                _refill();
                if (_tokens >= n) {
                    _tokens -= n;
                    return true;
                }
                return false;
            }

            /**
             * Take `n` tokens; awaits refill if necessary. Rejects when:
             *   - `n > capacity` - immediate.
             *   - bucket is cancelled - immediate.
             *   - `cancel()` is called while waiting.
             * Waiters are served in strict FIFO order; head-of-line blocking is
             * intentional (fairness over throughput).
             * @param {number} [n=1]
             * @returns {Promise<void>}
             */
            function take(n = 1) {
                if (n > capacity) return Promise.reject(new Error(`tokenBucket: n (${n}) exceeds capacity (${capacity})`));
                if (_cancelled) return Promise.reject(new Error('tokenBucket: cancelled'));
                _refill();
                if (_tokens >= n && _waiters.length === 0) {
                    _tokens -= n;
                    return Promise.resolve();
                }
                return new Promise((resolve, reject) => {
                    _waiters.push({ n, resolve, reject });
                    if (refillRate > 0) {
                        const timeUntilAvailable = ((n - _tokens) / refillRate) * refillInterval;
                        _scheduleDrain(Math.max(0, timeUntilAvailable));
                    }
                });
            }

            /**
             * Refill the bucket to `capacity` and re-attempt pending waiters.
             * Does **not** clear the cancelled flag.
             * @returns {void}
             */
            function reset() {
                _tokens = capacity;
                _lastUpdate = Date.now();
                _drain();
            }

            /**
             * Terminal: rejects all pending waiters and prevents new `take()` calls
             * from queueing. Clears any pending refill timer.
             * @returns {void}
             */
            function cancel() {
                _cancelled = true;
                if (_pendingTimerId !== null) {
                    clearTimeout(_pendingTimerId);
                    _pendingTimerId = null;
                }
                const err = new Error('tokenBucket: cancelled');
                const waiting = _waiters.splice(0);
                for (const { reject } of waiting) reject(err);
            }

            return {
                tryTake, take, reset, cancel,
                get available() { _refill(); return Math.floor(_tokens); },
                get capacity() { return capacity; },
                get refillRate() { return refillRate; },
                get refillInterval() { return refillInterval; },
            };
        }

        return { create };
    },
};
