// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Event-based entropy harvesting for seeding a custom PRNG.
 *
 * Modern browsers provide `crypto.getRandomValues` for cryptographically
 * secure randomness. This collector is intended for applications that maintain
 * their own PRNG (e.g. SJCL) and need to feed it environmental entropy from
 * user interactions and sensor data.
 *
 * ## Timing security in restricted environments
 *
 * `performance.now()` is disabled in this environment. `Date.now()` is used
 * instead but is intentionally reduced to 100 ms precision:
 *
 * ```js
 * Object.defineProperty(Date, 'now', {
 *     value: () => Math.floor(originalNow() / 100) * 100,
 *     writable: false, configurable: false
 * });
 * ```
 *
 * A 100 ms timestamp alone carries only ~3 bits of entropy for typical
 * interaction windows. To compensate, every timing sample is XORed with a
 * word drawn from a **pre-allocated `Uint32Array(8)` crypto buffer** that is
 * refilled via `crypto.getRandomValues` every 8 uses. This makes each timing
 * sample cryptographically unpredictable regardless of timestamp precision.
 * The effective entropy contributed per timing sample is therefore 32 bits.
 *
 * The crypto buffer is allocated **once at factory initialisation** and shared
 * across all collector instances, keeping the overhead of `getRandomValues`
 * calls proportional to usage (one call per 8 timing events).
 *
 * ## Sources
 *
 * | Source | Event | Bits | Notes |
 * |---|---|---|---|
 * | Mouse movement | `mousemove` | 2 | `[clientX, clientY]`; throttled to 1 per 100 ms |
 * | Keyboard timing | `keydown` | 32* | Timing × crypto supplement |
 * | Touch movement | `touchmove` | 1 | `[clientX, clientY]` of first touch point |
 * | Accelerometer | `sensors.motion` | 32* | Acceleration via sensors.motion.watch() + timing supplement |
 * | Timing supplement | (per event) | 32* | Added to every event handler |
 *
 * `*` - 32 when `crypto.getRandomValues` is available, ~3 otherwise.
 *
 * ## iOS 13+ motion permission
 *
 * On iOS 13+, motion permission must be requested from within a user-gesture
 * handler before motion events are delivered. This is handled by delegating
 * to `sensors.requestPermission()`, which covers both motion and orientation.
 *
 * Pass the native `Event` to `start()` to signal that the call originates from
 * a user gesture. The collector will automatically request motion permission
 * and include or exclude motion data based on the outcome:
 *
 * ```js
 * // Automatic - pass the click Event to start()
 * button.addEventListener('click', e => collector.start(e));
 *
 * // Manual - request permission yourself, then start without the event
 * button.addEventListener('click', async () => {
 *     await collector.requestMotionPermission();
 *     collector.start();
 * });
 * ```
 *
 * On platforms where no permission is required `requestMotionPermission` is a
 * fast no-op that resolves to `true`, so the same code works everywhere.
 *
 * ## Note on `target` option and motion events
 *
 * The `target` option affects only DOM listeners for `mousemove`, `keydown`,
 * and `touchmove`. Motion data is collected via `sensors.motion.watch()`,
 * which always attaches to `window` internally - this is aligned with the
 * native constraint that `DeviceMotionEvent` is only delivered to `window`.
 *
 */


/**
 * A single entropy-collector instance returned by `create()`.
 * @typedef {object} EntropyCollector
 * @property {(event?: Event) => Promise<{ motionGranted: boolean | null }>} start
 *   Start collecting entropy. Passing a DOM `Event` enables automatic motion
 *   permission handling; `motionGranted` is `true`/`false` when a request was
 *   made, `null` when none was issued.
 * @property {() => void} stop Stop collecting and detach all listeners.
 * @property {boolean} isActive `true` while the collector is active (read-only getter).
 * @property {() => Promise<boolean>} requestMotionPermission
 *   Manually request motion permission on iOS 13+ (resolves `true` where not required).
 */

/**
 * Public surface returned by `entropyCollector.factory()`.
 * @typedef {object} EntropyCollectorAPI
 * @property {(onEntropy: (sample: number|Array<number>, bits: number, source: string) => void, options?: { target?: EventTarget }) => EntropyCollector} create
 *   Create a new entropy-collector instance.
 */

import { sensors } from '../sensors/sensors.js';

export const entropyCollector = {
    name: 'entropyCollector',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: ['sensors'],
    deps: [sensors],

    /** @returns {EntropyCollectorAPI} */
    factory(sensors) {

        const crypto    = globalThis.crypto;
        const hasCrypto = !!(crypto && typeof crypto.getRandomValues === 'function');

        // --- Shared crypto supplement buffer ---
        //
        // Allocated once at factory level, shared across all instances.
        // One getRandomValues call per 8 timing samples across all instances.

        const CRYPTO_BUF_SIZE = 8;
        const cryptoBuf       = hasCrypto ? new Uint32Array(CRYPTO_BUF_SIZE) : null;
        let   cryptoIdx       = CRYPTO_BUF_SIZE; // start "empty" → refills on first use

        /**
         * Return the next 32-bit crypto random word from the shared buffer,
         * refilling transparently when exhausted.
         *
         * @returns {number}
         */
        function cryptoWord() {
            if (cryptoIdx >= CRYPTO_BUF_SIZE) {
                crypto.getRandomValues(cryptoBuf);
                cryptoIdx = 0;
            }
            return cryptoBuf[cryptoIdx++];
        }

        /**
         * Return a secure timing sample.
         * XOR of `Date.now()` (100 ms precision) with a crypto word - the
         * result is unpredictable regardless of timestamp resolution.
         *
         * @returns {number}
         */
        function secureTiming() {
            if (hasCrypto) {
                return (Date.now() & 0xFFFF_FFFF) ^ cryptoWord();
            }
            return Date.now();
        }

        // Bits credited per timing sample.
        const TIMING_BITS = hasCrypto ? 32 : 3;

        // --- Motion permission helper ---

        /**
         * Request motion permission via sensors.requestPermission() on iOS 13+.
         * Resolves to `true` immediately on platforms that do not require it.
         * Must be called from within a user-gesture call stack.
         *
         * @returns {Promise<boolean>}
         */
        async function askMotionPermission() {
            const status = await sensors.requestPermission();
            return status === 'granted';
        }

        // --- Public API ---

        /**
         * Create a new entropy collector instance.
         *
         * @param {function(number|Array<number>, number, string): void} onEntropy
         *   Called for each entropy sample.
         *
         * @param {object}      [options={}]
         * @param {EventTarget} [options.target=window]
         *   DOM target to attach mousemove/keydown/touchmove listeners to.
         *   Note: motion events are always collected via sensors.motion.watch(),
         *   which attaches to window regardless of this option.
         *
         * @returns {EntropyCollector}
         */
        function create(onEntropy, { target = window } = {}) {

            let active        = false;
            let lastMouseTime = 0;

            // Sources actually registered during the last start() call.
            // Contains only the three direct DOM sources (mousemove, keydown, touchmove).
            let activeSources = [];

            // Unsubscribe function returned by sensors.motion.watch() - tracked separately.
            let motionUnsubscribe = null;

            // --- Event handlers ---

            function onMouseMove(e) {
                const t = Date.now();
                if (t - lastMouseTime < 100) return;
                lastMouseTime = t;

                const x = e.clientX ?? 0;
                const y = e.clientY ?? 0;
                if (x !== 0 || y !== 0) {
                    onEntropy([x, y], 2, 'mouse');
                }
                onEntropy(secureTiming(), TIMING_BITS, 'timing');
            }

            function onKeyDown() {
                onEntropy(secureTiming(), TIMING_BITS, 'keyboard');
            }

            function onTouchMove(e) {
                const touch = e.touches[0] ?? e.changedTouches[0];
                if (touch) {
                    const x = touch.clientX ?? touch.pageX ?? 0;
                    const y = touch.clientY ?? touch.pageY ?? 0;
                    onEntropy([x, y], 1, 'touch');
                }
                onEntropy(secureTiming(), TIMING_BITS, 'timing');
            }

            function onDeviceMotion({ accelerationIncludingGravity }) {
                const g  = accelerationIncludingGravity;
                const ac = g ? (g.x ?? g.y ?? g.z ?? null) : null;
                if (ac !== null) {
                    onEntropy(ac, 2, 'accelerometer');
                }
                onEntropy(secureTiming(), TIMING_BITS, 'timing');
            }

            const baseSources = [
                ['mousemove', onMouseMove],
                ['keydown',   onKeyDown],
                ['touchmove', onTouchMove]
            ];

            // --- Internal attach helper ---

            function attach(sources, withMotion) {
                activeSources = sources;
                for (const [event, fn] of activeSources) {
                    target.addEventListener(event, fn, { passive: true });
                }
                if (withMotion && sensors.motion.isSupported()) {
                    motionUnsubscribe = sensors.motion.watch(onDeviceMotion);
                }
                onEntropy(secureTiming(), TIMING_BITS, 'timing');
            }

            // --- Public surface ---

            return {

                /**
                 * Start collecting entropy.
                 *
                 * **Without argument** - attaches all sources immediately
                 * (synchronous path, no permission request).
                 *
                 * **With a DOM `Event`** - signals that the call originates
                 * from a user gesture. `sensors.requestPermission()` is called
                 * automatically on iOS 13+ before registering the motion
                 * listener. If permission is denied, the other three sources
                 * are still started. The returned Promise resolves once all
                 * listeners are attached.
                 *
                 * Re-calling while already active is a no-op.
                 *
                 * @param {Event} [event]
                 *   Pass the native DOM event (e.g. a `click` Event) to enable
                 *   automatic motion permission handling.
                 *
                 * @returns {Promise<{ motionGranted: boolean | null }>}
                 *   `motionGranted` is `true`/`false` when a permission request
                 *   was made, `null` when no request was issued.
                 */
                async start(event) {
                    if (active) return { motionGranted: null };
                    active = true;

                    if (event instanceof Event) {
                        const granted = await askMotionPermission();
                        attach(baseSources, granted);
                        return { motionGranted: granted };
                    }

                    attach(baseSources, true);
                    return { motionGranted: null };
                },

                /**
                 * Stop collecting and detach all registered listeners.
                 * No-op when already inactive.
                 */
                stop() {
                    if (!active) return;
                    active = false;
                    for (const [event, fn] of activeSources) {
                        // @ts-ignore - passive option is valid for addEventListener; not in EventListenerOptions in TS types
                        target.removeEventListener(event, fn, { passive: true });
                    }
                    activeSources = [];
                    if (motionUnsubscribe) {
                        motionUnsubscribe();
                        motionUnsubscribe = null;
                    }
                },

                /**
                 * `true` when the collector is currently active.
                 * @type {boolean}
                 */
                get isActive() {
                    return active;
                },

                /**
                 * Manually request motion permission on iOS 13+.
                 *
                 * Use this when you need explicit control over when the system
                 * dialog appears. Call from a user-gesture handler, then call
                 * `start()` (without event) afterward.
                 *
                 * On platforms where no permission is required the Promise
                 * resolves to `true` immediately.
                 *
                 * Delegates to `sensors.requestPermission()` which covers both
                 * motion and orientation in a single call.
                 *
                 * @returns {Promise<boolean>}
                 */
                requestMotionPermission: askMotionPermission
            };
        }

        return { create };
    }
};
