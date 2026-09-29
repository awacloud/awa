// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Provides a comprehensive collection of easing functions for smooth animations and transitions.
 * All easing functions follow Robert Penner's easing equations convention.
 * Origin: the function bodies implement Robert Penner's published easing equations (elastic and back in the jQuery Easing v1.3 shape). See docs/dev/provenance.md.
 *
 * Common parameters for all easing functions:
 * - t: Current time (elapsed time)
 * - b: Begin value (start value)
 * - c: Change in value (end value - start value)
 * - d: Duration (total time)
 *
 * @example
 * const { easing } = registry.resolve('easing');
 * const value = easing.easeInQuad(50, 0, 100, 100); // Returns 50
 * const smoothValue = easing.easeInOutCubic(25, 0, 200, 100); // Returns 50
 */

/**
 * Penner easing signature: (t, b, c, d) => value.
 * @typedef {(t: number, b: number, c: number, d: number) => number} EaseFn
 */

/**
 * @typedef {object} EasingAPI
 * @property {EaseFn} linear
 * @property {EaseFn} easeInQuad
 * @property {EaseFn} easeOutQuad
 * @property {EaseFn} easeInOutQuad
 * @property {EaseFn} easeInCubic
 * @property {EaseFn} easeOutCubic
 * @property {EaseFn} easeInOutCubic
 * @property {EaseFn} easeInQuart
 * @property {EaseFn} easeOutQuart
 * @property {EaseFn} easeInOutQuart
 * @property {EaseFn} easeInQuint
 * @property {EaseFn} easeOutQuint
 * @property {EaseFn} easeInOutQuint
 * @property {EaseFn} easeInSine
 * @property {EaseFn} easeOutSine
 * @property {EaseFn} easeInOutSine
 * @property {EaseFn} easeInExpo
 * @property {EaseFn} easeOutExpo
 * @property {EaseFn} easeInOutExpo
 * @property {EaseFn} easeInCirc
 * @property {EaseFn} easeOutCirc
 * @property {EaseFn} easeInOutCirc
 * @property {EaseFn} easeInElastic
 * @property {EaseFn} easeOutElastic
 * @property {EaseFn} easeInOutElastic
 * @property {EaseFn} easeInBack
 * @property {EaseFn} easeOutBack
 * @property {EaseFn} easeInOutBack
 * @property {EaseFn} easeInBounce
 * @property {EaseFn} easeOutBounce
 * @property {EaseFn} easeInOutBounce
 */

export const easing = {
    name: 'easing',
    version: '1.0.0',
    type: 'fw.io.calc',
    dependencies: [],

    /**
     * Factory function that creates and returns an object containing all easing functions.
     * Each easing function calculates an interpolated value based on time progression.
     *
     * @returns {EasingAPI} Object containing all easing functions
     *
     * @example
     * const ease = easing.factory();
     * const position = ease.linear(currentTime, startPos, endPos - startPos, duration);
     */
    factory() {
        const ease = {};

        /**
         * Linear interpolation with no easing
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.linear = function (t, b, c, d) {
            return c * t / d + b;
        };

        /**
         * Quadratic ease-in: accelerating from zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInQuad = function (t, b, c, d) {
            return c * (t /= d) * t + b;
        };

        /**
         * Quadratic ease-out: decelerating to zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutQuad = function (t, b, c, d) {
            return -c * (t /= d) * (t - 2) + b;
        };

        /**
         * Quadratic ease-in-out: acceleration until halfway, then deceleration
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutQuad = function (t, b, c, d) {
            if ((t /= d / 2) < 1) return c / 2 * t * t + b;
            return -c / 2 * ((--t) * (t - 2) - 1) + b;
        };

        /**
         * Cubic ease-in: accelerating from zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInCubic = function (t, b, c, d) {
            return c * (t /= d) * t * t + b;
        };

        /**
         * Cubic ease-out: decelerating to zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutCubic = function (t, b, c, d) {
            return c * ((t = t / d - 1) * t * t + 1) + b;
        };

        /**
         * Cubic ease-in-out: acceleration until halfway, then deceleration
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutCubic = function (t, b, c, d) {
            if ((t /= d / 2) < 1) return c / 2 * t * t * t + b;
            return c / 2 * ((t -= 2) * t * t + 2) + b;
        };

        /**
         * Quartic ease-in: accelerating from zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInQuart = function (t, b, c, d) {
            return c * (t /= d) * t * t * t + b;
        };

        /**
         * Quartic ease-out: decelerating to zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutQuart = function (t, b, c, d) {
            return -c * ((t = t / d - 1) * t * t * t - 1) + b;
        };

        /**
         * Quartic ease-in-out: acceleration until halfway, then deceleration
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutQuart = function (t, b, c, d) {
            if ((t /= d / 2) < 1) return c / 2 * t * t * t * t + b;
            return -c / 2 * ((t -= 2) * t * t * t - 2) + b;
        };

        /**
         * Quintic ease-in: accelerating from zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInQuint = function (t, b, c, d) {
            return c * (t /= d) * t * t * t * t + b;
        };

        /**
         * Quintic ease-out: decelerating to zero velocity
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutQuint = function (t, b, c, d) {
            return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
        };

        /**
         * Quintic ease-in-out: acceleration until halfway, then deceleration
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutQuint = function (t, b, c, d) {
            if ((t /= d / 2) < 1) return c / 2 * t * t * t * t * t + b;
            return c / 2 * ((t -= 2) * t * t * t * t + 2) + b;
        };

        /**
         * Sinusoidal ease-in: accelerating using sine wave
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInSine = function (t, b, c, d) {
            return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
        };

        /**
         * Sinusoidal ease-out: decelerating using sine wave
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutSine = function (t, b, c, d) {
            return c * Math.sin(t / d * (Math.PI / 2)) + b;
        };

        /**
         * Sinusoidal ease-in-out: accelerating until halfway, then decelerating using sine wave
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutSine = function (t, b, c, d) {
            return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
        };

        /**
         * Exponential ease-in: accelerating using exponential function
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInExpo = function (t, b, c, d) {
            return (t === 0) ? b : c * Math.pow(2, 10 * (t / d - 1)) + b;
        };

        /**
         * Exponential ease-out: decelerating using exponential function
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutExpo = function (t, b, c, d) {
            return (t === d) ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
        };

        /**
         * Exponential ease-in-out: accelerating until halfway, then decelerating using exponential function
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutExpo = function (t, b, c, d) {
            if (t === 0) return b;
            if (t === d) return b + c;
            if ((t /= d / 2) < 1) return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
            return c / 2 * (-Math.pow(2, -10 * (t - 1)) + 2) + b;
        };

        /**
         * Circular ease-in: accelerating using circular function
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInCirc = function (t, b, c, d) {
            return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
        };

        /**
         * Circular ease-out: decelerating using circular function
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutCirc = function (t, b, c, d) {
            return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
        };

        /**
         * Circular ease-in-out: accelerating until halfway, then decelerating using circular function
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutCirc = function (t, b, c, d) {
            if ((t /= d / 2) < 1) return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
            return c / 2 * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
        };

        /**
         * Elastic ease-in: oscillating effect like a spring being stretched
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInElastic = function (t, b, c, d) {
            let s;
            let p = 0;
            let a = c;
            if (t === 0) return b;
            if ((t /= d) === 1) return b + c;
            if (!p) p = d * 0.3;
            if (a < Math.abs(c)) {
                a = c;
                s = p / 4;
            } else {
                s = p / (2 * Math.PI) * Math.asin(c / a);
            }
            return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
        };

        /**
         * Elastic ease-out: oscillating effect like a spring coming to rest
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutElastic = function (t, b, c, d) {
            let s;
            let p = 0;
            let a = c;
            if (t === 0) return b;
            if ((t /= d) === 1) return b + c;
            if (!p) p = d * 0.3;
            if (a < Math.abs(c)) {
                a = c;
                s = p / 4;
            } else {
                s = p / (2 * Math.PI) * Math.asin(c / a);
            }
            return a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p) + c + b;
        };

        /**
         * Elastic ease-in-out: oscillating effect both ways
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutElastic = function (t, b, c, d) {
            let s;
            let p = 0;
            let a = c;
            if (t === 0) return b;
            if ((t /= d / 2) === 2) return b + c;
            if (!p) p = d * (0.3 * 1.5);
            if (a < Math.abs(c)) {
                a = c;
                s = p / 4;
            } else {
                s = p / (2 * Math.PI) * Math.asin(c / a);
            }
            if (t < 1) return -0.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
            return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p) * 0.5 + c + b;
        };

        /**
         * Back ease-in: overshooting cubic easing (pulls back before going forward)
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInBack = function (t, b, c, d) {
            const s = 1.70158;
            return c * (t /= d) * t * ((s + 1) * t - s) + b;
        };

        /**
         * Back ease-out: overshooting cubic easing (goes past target then comes back)
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutBack = function (t, b, c, d) {
            const s = 1.70158;
            return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
        };

        /**
         * Back ease-in-out: overshooting cubic easing both ways
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutBack = function (t, b, c, d) {
            let s = 1.70158;
            if ((t /= d / 2) < 1) return c / 2 * (t * t * (((s *= (1.525)) + 1) * t - s)) + b;
            return c / 2 * ((t -= 2) * t * (((s *= (1.525)) + 1) * t + s) + 2) + b;
        };

        /**
         * Bounce ease-in: bouncing effect at the start
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInBounce = function (t, b, c, d) {
            return c - ease.easeOutBounce(d - t, 0, c, d) + b;
        };

        /**
         * Bounce ease-out: bouncing effect at the end
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeOutBounce = function (t, b, c, d) {
            if ((t /= d) < (1 / 2.75)) {
                return c * (7.5625 * t * t) + b;
            } else if (t < (2 / 2.75)) {
                return c * (7.5625 * (t -= (1.5 / 2.75)) * t + 0.75) + b;
            } else if (t < (2.5 / 2.75)) {
                return c * (7.5625 * (t -= (2.25 / 2.75)) * t + 0.9375) + b;
            } else {
                return c * (7.5625 * (t -= (2.625 / 2.75)) * t + 0.984375) + b;
            }
        };

        /**
         * Bounce ease-in-out: bouncing effect both at start and end
         * @param {number} t - Current time
         * @param {number} b - Begin value
         * @param {number} c - Change in value
         * @param {number} d - Duration
         * @returns {number} Interpolated value
         */
        ease.easeInOutBounce = function (t, b, c, d) {
            if (t < d / 2) return ease.easeInBounce(t * 2, 0, c, d) * 0.5 + b;
            return ease.easeOutBounce(t * 2 - d, 0, c, d) * 0.5 + c * 0.5 + b;
        };

        return ease;
    }
};
