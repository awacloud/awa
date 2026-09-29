// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Frame-by-frame animation utility driven by `requestAnimationFrame`.
 *
 * The factory depends on the `easing` module and returns a single function that
 * starts a timed animation loop. On every frame the current eased value is
 * forwarded to a caller-supplied `progress` callback; an optional `onComplete`
 * callback fires once the full duration has elapsed.
 *
 * An animation can be cancelled at any time by returning `false` from the
 * `running` guard function.
 *
 * Input validation follows the fw "fail fast on bad inputs" policy: invalid
 * arguments throw `TypeError` synchronously rather than producing a confusing
 * native error from inside the rAF callback.
 *
 */

import { easing } from '../../io/calc/easing.js';

/**
 * The animation runner returned by `animate.factory()`.
 *
 * Starts a `requestAnimationFrame`-driven loop that forwards the current eased
 * value to `progress` on each frame and fires `onComplete` once the duration
 * elapses. Returns `void` (the loop is fire-and-forget; cancellation is via the
 * `running` guard).
 *
 * @typedef {(
 *   duration: number,
 *   easingName: string,
 *   prop: { init: number, end: number },
 *   progress: (value: number, running: () => boolean) => void,
 *   onComplete?: (() => void) | null,
 *   running?: () => boolean
 * ) => void} AnimateAPI
 */

export const animate = {
    name: 'animate',
    type: 'fw.dom.display',
    dependencies: ['easing'],
    deps: [easing],

    /**
     * @param {Object} easing - Injected easing map (fw/io/calc/easing module).
     * @returns {AnimateAPI}
     */
    factory(easing) {

        // --- Internal ---

        /**
         * Recursive rAF step.
         *
         * `start` is captured from the very first `requestAnimationFrame` timestamp
         * so that `elapsed` always reflects real wall-clock ms since the animation
         * began, regardless of when the browser schedules the first paint.
         *
         * Progress is intentionally skipped on the first frame (elapsed === 0)
         * because the easing value at t=0 equals `prop.init`, which is the state
         * the target already has before the animation starts.
         *
         * @param {number}   start     - Timestamp of the first frame (ms).
         * @param {number}   timestamp - Current rAF timestamp (ms).
         * @param {number}   duration  - Total animation duration (ms).
         * @param {function} easingFn  - Resolved easing function.
         * @param {{init: number, end: number}} prop - Start and end values.
         * @param {function(number, function): void} progress   - Per-frame callback.
         * @param {function|null}                    onComplete - End callback.
         * @param {function(): boolean}              running    - Cancellation guard.
         */
        function step(start, timestamp, duration, easingFn, prop, progress, onComplete, running) {
            if (!running()) return;

            const elapsed = Math.min(timestamp - start, duration);

            if (elapsed > 0) {
                progress(easingFn(elapsed, prop.init, prop.end - prop.init, duration), running);
            }

            if (elapsed < duration) {
                requestAnimationFrame(ts => step(start, ts, duration, easingFn, prop, progress, onComplete, running));
            } else if (onComplete !== null) {
                onComplete();
            }
        }

        // --- Public API ---

        /**
         * Start a timed animation loop.
         *
         * @param {number} duration
         *   Total duration of the animation in milliseconds. Must be a finite
         *   number > 0.
         *
         * @param {string} easingName
         *   Key of the easing function to use (e.g. `'easeInOutCubic'`).
         *   Must match a property on the injected `easing` object.
         *
         * @param {{ init: number, end: number }} prop
         *   Numeric range to animate over.
         *   `init` is the starting value, `end` is the final value.
         *   Both must be finite numbers.
         *
         * @param {function(number, function(): boolean): void} progress
         *   Called on every frame with the current interpolated value and the
         *   `running` guard, allowing the callback itself to inspect or cancel
         *   the animation.
         *
         * @param {function|null} [onComplete=null]
         *   Called once after the last frame. Pass `null` to omit.
         *
         * @param {function(): boolean} [running=() => true]
         *   Guard evaluated at the start of every frame. Return `false` to
         *   cancel the animation early.
         *
         * @throws {TypeError} When `duration` is not a finite positive number,
         *   `easingName` does not resolve to a function on the easing map,
         *   `prop` is missing `init`/`end` numbers, `progress` is not a
         *   function, or `onComplete`/`running` are of the wrong type.
         */
        return function animate(duration, easingName, prop, progress, onComplete = null, running = () => true) {
            if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
                throw new TypeError('animate: duration must be a finite positive number');
            }
            if (typeof easingName !== 'string' || typeof easing[easingName] !== 'function') {
                throw new TypeError(`animate: easingName '${easingName}' does not resolve to a function on the easing map`);
            }
            if (prop === null || typeof prop !== 'object'
                || typeof prop.init !== 'number' || !Number.isFinite(prop.init)
                || typeof prop.end !== 'number'  || !Number.isFinite(prop.end)) {
                throw new TypeError('animate: prop must be { init: number, end: number } with finite values');
            }
            if (typeof progress !== 'function') {
                throw new TypeError('animate: progress must be a function');
            }
            if (onComplete !== null && typeof onComplete !== 'function') {
                throw new TypeError('animate: onComplete must be a function or null');
            }
            if (typeof running !== 'function') {
                throw new TypeError('animate: running must be a function');
            }

            requestAnimationFrame(timestamp => {
                step(timestamp, timestamp, duration, easing[easingName], prop, progress, onComplete, running);
            });
        };
    }
};
