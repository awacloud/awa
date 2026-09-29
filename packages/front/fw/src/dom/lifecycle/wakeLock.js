// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Screen Wake Lock factory.
 *
 * Thin wrapper around `navigator.wakeLock.request('screen')` that exposes a
 * stable handle (`{released, onRelease, release}`) and, optionally, transparent
 * re-acquisition when the tab returns to the foreground. The native sentinel
 * is auto-released by the browser whenever the page becomes hidden; this
 * module bridges that behaviour back to the caller and, when configured to do
 * so, re-requests a fresh sentinel as soon as the visibility module reports
 * the tab is visible again.
 *
 * Release-notification contract:
 *   - `onRelease` listeners are invoked synchronously, exactly once, the first
 *     time the lock transitions to released. This happens on `release()`
 *     **and** on every sentinel auto-release (tab hidden), regardless of the
 *     `reacquireOnVisible` setting. With `reacquireOnVisible: true`, the
 *     module will additionally try to re-acquire a sentinel the next time the
 *     tab becomes visible - but the original handle is already terminal at
 *     that point.
 *   - Native sentinel `release()` is awaited but its errors are swallowed:
 *     the public `release()` resolves cleanly after listeners are notified.
 *
 */

/**
 * @typedef {Object} WakeLockHandle
 * @property {boolean} released
 *   `true` once the lock has been released (by the caller, by the browser
 *   auto-releasing on hide, or by an explicit `release()` call).
 * @property {(callback: () => void) => () => void} onRelease
 *   Subscribe to the (single) release notification. Returns an unsubscribe
 *   function. Subscribing after the lock has already been released is a no-op:
 *   the callback will not fire retroactively.
 * @property {() => Promise<void>} release
 *   Explicitly release the lock. Idempotent; resolves once listeners have run
 *   and the underlying sentinel release has settled (errors swallowed).
 */

/**
 * @typedef {Object} WakeLockAcquireOptions
 * @property {boolean} [reacquireOnVisible=true]
 *   When `true`, the module re-requests a fresh sentinel each time the tab
 *   returns to `visible`, as long as the handle has not been explicitly
 *   released. The original handle is still considered released as soon as the
 *   first sentinel goes away - callers wanting to follow re-acquisitions
 *   should call `acquire()` again from their `onRelease` callback if needed.
 */

/**
 * Public surface returned by the wakeLock factory.
 * @typedef {Object} WakeLockAPI
 * @property {() => boolean} isSupported - `true` if the current environment exposes the Screen Wake Lock API.
 * @property {(opts?: WakeLockAcquireOptions) => Promise<WakeLockHandle>} acquire - Acquire a screen wake lock, resolving with a handle; rejects if unsupported or if the initial request fails.
 */

import { visibility } from './visibility.js';

export const wakeLock = {
    name: 'wakeLock',
    version: '1.0.0',
    type: 'fw.dom.lifecycle',
    dependencies: ['visibility'],
    deps: [visibility],
    worker: false,

    /**
     * @param {import('./visibility.js').visibility extends { factory: (...a:any[]) => infer R } ? R : any} visibility
     *   Resolved visibility module (provides `onVisible`).
     * @returns {WakeLockAPI}
     */
    factory(visibility) {
        /**
         * Whether the current environment exposes the Screen Wake Lock API.
         * @returns {boolean}
         */
        function isSupported() {
            return 'wakeLock' in navigator;
        }

        /**
         * Acquire a screen wake lock.
         *
         * @param {WakeLockAcquireOptions} [opts]
         * @returns {Promise<WakeLockHandle>}
         * @throws {Error} If the Wake Lock API is not supported, or if the
         *   initial `navigator.wakeLock.request('screen')` rejects.
         */
        async function acquire({ reacquireOnVisible = true } = {}) {
            if (!isSupported()) throw new Error('wakeLock: unsupported');

            /** @type {WakeLockSentinel|null} */
            let _sentinel = null;
            let _released = false;
            /** @type {Set<() => void>} */
            const _releaseListeners = new Set();
            /** @type {(() => void)|null} */
            let _stopVisibility = null;

            /** Request a fresh sentinel and wire its release event. */
            async function _request() {
                _sentinel = await navigator.wakeLock.request('screen');
                _sentinel.addEventListener('release', _onSentinelRelease);
            }

            /**
             * Handler for the native sentinel `release` event. Fires whenever
             * the browser drops the lock (typically on tab-hide) or when our
             * own `release()` triggers it.
             *
             * Notifies `onRelease` listeners on the first transition - even
             * when `reacquireOnVisible` is true. Re-acquisition (if enabled)
             * is then attempted independently the next time the tab becomes
             * visible; it does not resurrect this handle.
             */
            function _onSentinelRelease() {
                _sentinel = null;
                if (_released) return;
                _released = true;
                _notify();
                _releaseListeners.clear();
            }

            /** Fire every registered release listener (synchronously). */
            function _notify() {
                _releaseListeners.forEach(fn => {
                    try { fn(); } catch { /* listener errors must not break others */ }
                });
            }

            await _request();

            if (reacquireOnVisible) {
                _stopVisibility = visibility.onVisible(async () => {
                    // Re-acquire even after the handle was marked released by
                    // an auto-release: the module-level intent ("keep the
                    // screen awake while the tab lives") outlives the
                    // individual sentinel. The original handle stays in its
                    // released state; this is purely best-effort upkeep.
                    if (_sentinel === null) {
                        try { await _request(); } catch { /* tab not fully visible yet */ }
                    }
                });
            }

            return {
                get released() { return _released; },

                onRelease(callback) {
                    if (_released) return () => {};
                    _releaseListeners.add(callback);
                    return () => _releaseListeners.delete(callback);
                },

                async release() {
                    // Always tear down the visibility hook so an explicit
                    // release() stops any future re-acquire attempts, even if
                    // the sentinel had already auto-released earlier.
                    if (_stopVisibility) { _stopVisibility(); _stopVisibility = null; }

                    if (_released) {
                        // Sentinel may still be alive if release() races a
                        // synchronous re-entry; fall through to native release.
                    } else {
                        _released = true;
                        // Listeners fire synchronously; native release is
                        // effectively fire-and-forget below.
                        _notify();
                        _releaseListeners.clear();
                    }

                    if (_sentinel) {
                        const s = _sentinel;
                        _sentinel = null;
                        s.removeEventListener('release', _onSentinelRelease);
                        try { await s.release(); } catch { /* swallow: handle already released */ }
                    }
                },
            };
        }

        return { isSupported, acquire };
    },
};
