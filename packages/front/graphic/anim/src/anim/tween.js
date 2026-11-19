// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.tween` — reference-bound single-property tween
 * (main-thread), as a capture-free fw module descriptor (FROZEN CONTRACT, `docs/CONTRACT.md`).
 *
 * A {@link Tween} animates ONE property of ONE target over a duration, driven by
 * the shared scheduler. The target is bound **by reference once** at construction
 * — there is no per-tick `getElementById`/DOM lookup (the legacy O(n)/frame cost
 * the rewrite removes). Each tick the eased, clamped progress is fed to an
 * interpolator built once from `from`→`to`, and written via the `apply` writer
 * (default routes through the injected `svgApply.svgAttr`).
 *
 * Capture-free: the four dependencies arrive ONLY as factory parameters
 * (`scheduler`, `easing`, `interpolate`, `svgApply`). The `Tween` class is
 * defined INSIDE the factory body so it can reference those parameters without
 * any module-scope capture. The top-of-file imports feed `deps[]` (the bundler
 * mirror) and are never referenced inside the factory.
 *
 * **NOT Worker-safe**: the default writer mutates a DOM target. The pure layers it
 * consumes (`easing`, `interpolate`) stay Worker-safe.
 *
 * @module graphic.tween
 */

import { schedulerModule } from './scheduler.js';
import { easingModule } from '../math/easing.js';
import { interpolateModule } from '../interpolate/index.js';
import { svgApplyModule } from '../svg/apply.js';

/**
 * @typedef {Object} TweenOptions
 * @property {object} target The element/object to mutate, bound BY REFERENCE once.
 * @property {string} property The attribute/property name to animate.
 * @property {string|number} from Start value (`t = 0`).
 * @property {string|number} to End value (`t = 1`).
 * @property {number} duration Duration in ms (clamped to a positive minimum).
 * @property {((t: number) => number)|string} [easing] An easing spec (see
 *   `resolveEasing`): a curve fn, a name in the easing table, or a CSS timing
 *   function (`cubic-bezier(…)`, `steps(…)`, `ease`, `ease-in`, `ease-out`,
 *   `ease-in-out`, `step-start`, `step-end`); defaults to `linear`. Anything
 *   else throws.
 * @property {(value: (string|number), target: object) => void} [apply] Writer;
 *   defaults to `svgApply.svgAttr(target, property, value)`.
 * @property {(value: (string|number)) => void} [onUpdate] Fired every tick.
 * @property {() => void} [onComplete] Fired once when progress reaches 1.
 * @property {object} [scheduler] Override the shared scheduler instance
 *   (tests / isolated timelines).
 */

/**
 * `graphic.tween` module descriptor.
 *
 * Factory returns `{ Tween, tween, resolveEasing }`:
 * - `Tween` — the reference-bound single-property tween class.
 * - `tween` — convenience that builds a {@link Tween} and plays it on the shared
 *   scheduler.
 * - `resolveEasing` — turns an easing spec into a curve `(t) => number`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof schedulerModule, typeof easingModule, typeof interpolateModule, typeof svgApplyModule], factory(scheduler: { Scheduler: Function, scheduler: object }, easing: Object<string, (t: number) => number>, interpolate: { interpolator: Function }, svgApply: { SVG_NS: string, svgAttr: Function }): { Tween: Function, tween: Function, resolveEasing: (spec?: ((t: number) => number)|string|null) => ((t: number) => number) } }}
 */
export const tweenModule = {
    name: 'graphic.tween',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.scheduler', 'graphic.easing', 'graphic.interpolate', 'graphic.svgApply'],
    deps: [schedulerModule, easingModule, interpolateModule, svgApplyModule],

    /**
     * Build the tween surface from the four resolved dependencies. All wiring is
     * via parameters — the factory body never references a module-scope binding.
     *
     * @param {{ Scheduler: Function, scheduler: object }} scheduler Resolved
     *   `graphic.scheduler` — `{ Scheduler, scheduler }` (shared singleton).
     * @param {Object<string, (t: number) => number>} easing Resolved
     *   `graphic.easing` — the normalized easing-curve table.
     * @param {{ interpolator: Function }} interpolate Resolved `graphic.interpolate`
     *   — `{ detect, interpolator, parseTransform, parsePath }`.
     * @param {{ SVG_NS: string, svgAttr: Function }} svgApply Resolved
     *   `graphic.svgApply` — `{ SVG_NS, svgAttr }`.
     * @returns {{ Tween: Function, tween: Function, resolveEasing: Function }}
     */
    factory(scheduler, easing, interpolate, svgApply) {
        /**
         * A CSS `cubic-bezier(x1, y1, x2, y2)` timing curve: solve `x(s) = t`
         * for the curve parameter `s` (Newton, then bisection), return `y(s)`.
         * @param {number} x1
         * @param {number} y1
         * @param {number} x2
         * @param {number} y2
         * @returns {(t: number) => number}
         */
        function cubicBezier(x1, y1, x2, y2) {
            const cx = 3 * x1;
            const bx = 3 * (x2 - x1) - cx;
            const ax = 1 - cx - bx;
            const cy = 3 * y1;
            const by = 3 * (y2 - y1) - cy;
            const ay = 1 - cy - by;
            const sampleX = (s) => ((ax * s + bx) * s + cx) * s;
            const slopeX = (s) => (3 * ax * s + 2 * bx) * s + cx;
            const solve = (t) => {
                let s = t;
                for (let i = 0; i < 8; i += 1) {
                    const err = sampleX(s) - t;
                    if (Math.abs(err) < 1e-10) return s;
                    const d = slopeX(s);
                    if (Math.abs(d) < 1e-7) break;
                    s -= err / d;
                }
                let lo = 0;
                let hi = 1;
                s = t;
                for (let i = 0; i < 60; i += 1) {
                    const x = sampleX(s);
                    if (Math.abs(x - t) < 1e-10) return s;
                    if (x < t) lo = s; else hi = s;
                    s = (lo + hi) / 2;
                }
                return s;
            };
            return (t) => {
                if (t <= 0) return 0;
                if (t >= 1) return 1;
                const s = solve(t);
                return ((ay * s + by) * s + cy) * s;
            };
        }

        /**
         * A CSS `steps(n, position)` timing curve.
         * @param {number} n Step count.
         * @param {string} position `jump-start`, `jump-end`, `jump-none` or `jump-both`.
         * @returns {(t: number) => number}
         */
        function steps(n, position) {
            const jumps = position === 'jump-none' ? n - 1 : position === 'jump-both' ? n + 1 : n;
            const lead = position === 'jump-start' || position === 'jump-both' ? 1 : 0;
            return (t) => {
                let k = Math.floor(t * n) + lead;
                if (k < 0) k = 0;
                if (k > jumps) k = jumps;
                return k / jumps;
            };
        }

        /** @type {Object<string, [number, number, number, number]>} */
        const CSS_BEZIERS = {
            'ease': [0.25, 0.1, 0.25, 1],
            'ease-in': [0.42, 0, 1, 1],
            'ease-out': [0, 0, 0.58, 1],
            'ease-in-out': [0.42, 0, 0.58, 1],
        };
        /** @type {Object<string, string>} */
        const STEP_POSITIONS = {
            'start': 'jump-start', 'end': 'jump-end', 'jump-start': 'jump-start',
            'jump-end': 'jump-end', 'jump-none': 'jump-none', 'jump-both': 'jump-both',
        };

        /**
         * Turn an easing spec into a curve `(t) => number` over `t ∈ [0, 1]`.
         * In order: a function is returned as is; `undefined`/`null` is
         * `linear`; a name in the easing table maps to its curve (the table keeps
         * priority); then the CSS timing functions `cubic-bezier(x1, y1, x2, y2)`,
         * `steps(n[, jump-start|jump-end|jump-none|jump-both|start|end])` and the
         * keywords `ease`, `ease-in`, `ease-out`, `ease-in-out`, `step-start`,
         * `step-end`.
         * @param {((t: number) => number)|string|null} [spec]
         * @returns {(t: number) => number}
         * @throws {Error} `Tween: unknown easing "<spec>"` for anything else;
         *   `Tween: cubic-bezier x1 and x2 must be in [0, 1]`;
         *   `Tween: steps() needs …` for a count that is not a positive integer
         *   (at least 2 with `jump-none`).
         */
        function resolveEasing(spec) {
            if (typeof spec === 'function') return spec;
            if (spec === undefined || spec === null) return easing.linear;
            const name = String(spec).trim();
            if (Object.prototype.hasOwnProperty.call(easing, name) && typeof easing[name] === 'function') return easing[name];
            if (CSS_BEZIERS[name]) return cubicBezier(...CSS_BEZIERS[name]);
            if (name === 'step-start') return steps(1, 'jump-start');
            if (name === 'step-end') return steps(1, 'jump-end');
            const unknown = () => new Error(`Tween: unknown easing "${spec}"`);
            const bez = /^cubic-bezier\(([^,()]+),([^,()]+),([^,()]+),([^,()]+)\)$/.exec(name.replace(/\s+/g, ''));
            if (bez) {
                const p = bez.slice(1).map(Number);
                if (!p.every(Number.isFinite)) throw unknown();
                if (p[0] < 0 || p[0] > 1 || p[2] < 0 || p[2] > 1) {
                    throw new Error('Tween: cubic-bezier x1 and x2 must be in [0, 1]');
                }
                return cubicBezier(p[0], p[1], p[2], p[3]);
            }
            const st = /^steps\(([^,()]+)(?:,([a-z-]+))?\)$/.exec(name.replace(/\s+/g, ''));
            if (st) {
                const position = st[2] === undefined ? 'jump-end' : STEP_POSITIONS[st[2]];
                if (!position) throw unknown();
                const n = Number(st[1]);
                if (!Number.isInteger(n) || n < 1) throw new Error(`Tween: steps() needs a positive integer count, got "${st[1]}"`);
                if (position === 'jump-none' && n < 2) throw new Error('Tween: steps() with jump-none needs at least 2 steps');
                return steps(n, position);
            }
            throw unknown();
        }

        /**
         * Reference-bound property tween driven by the shared scheduler.
         */
        class Tween {
            /**
             * @param {TweenOptions} opts
             * @throws {Error} `Tween: target is required` without `opts.target`;
             *   what `resolveEasing` throws for an easing spec it does not know;
             *   and what `graphic.interpolate`'s `interpolator` throws for
             *   `from`/`to` it cannot interpolate.
             */
            constructor(opts) {
                if (!opts || !opts.target) throw new Error('Tween: target is required');
                // Bind the target by reference ONCE — no per-tick lookup.
                /** @type {object} */
                this.target = opts.target;
                /** @type {string} */
                this.property = opts.property;
                /** @type {number} Duration in ms; coerced to a positive minimum. */
                this.duration = opts.duration > 0 ? opts.duration : 1;
                /** @type {(t: number) => number} Resolved easing curve. */
                this.ease = resolveEasing(opts.easing);
                /** @type {(t: number) => (string|number)} Interpolator built once. */
                this._interp = interpolate.interpolator(opts.from, opts.to);
                /** @type {(value: (string|number), target: object) => void} */
                this._apply = opts.apply || ((v, target) => svgApply.svgAttr(target, this.property, v));
                this._onUpdate = opts.onUpdate || null;
                this._onComplete = opts.onComplete || null;
                /** @type {object} The scheduler instance this tween registers on. */
                this._scheduler = opts.scheduler || scheduler.scheduler;
                this._startTs = 0;
                this._started = false;
                /** @type {boolean} True once progress has reached 1. */
                this.done = false;
                /** @type {string|number} Last interpolated value written. */
                this.value = opts.from;
            }

            /**
             * Begin the tween: register it with the scheduler (which starts the shared
             * loop if idle). Resets internal state so a tween can be replayed.
             * @returns {this}
             */
            play() {
                this._started = false;
                this.done = false;
                this._scheduler.add(this);
                return this;
            }

            /**
             * Advance to the given timestamp. Called by the scheduler each tick. The first
             * tick fixes the start time so duration is measured from first frame, not from
             * `play()`. Progress is clamped to `[0, 1]`.
             * @param {number} ts Frame timestamp.
             * @private
             */
            _step(ts) {
                if (this.done) return;
                if (!this._started) { this._startTs = ts; this._started = true; }
                const raw = this._renderAt(ts - this._startTs);
                if (raw >= 1) {
                    this.done = true;
                    this._scheduler.remove(this);
                    if (this._onComplete) this._onComplete();
                }
            }

            /**
             * Write the value at `elapsed` ms from the start: clamped progress,
             * eased, interpolated, then `apply` and `onUpdate`. No completion
             * side effect: the timeline's `seek` renders through it.
             * @param {number} elapsed Milliseconds since the tween's start.
             * @returns {number} The clamped raw progress written.
             * @private
             */
            _renderAt(elapsed) {
                let raw = elapsed / this.duration;
                if (raw < 0) raw = 0;
                if (raw > 1) raw = 1;
                const eased = this.ease(raw);
                const v = this._interp(eased);
                this.value = v;
                this._apply(v, this.target);
                if (this._onUpdate) this._onUpdate(v);
                return raw;
            }
        }

        /**
         * Convenience: build a {@link Tween} and play it on the shared scheduler.
         * @param {TweenOptions} opts
         * @returns {Tween} The playing tween.
         */
        function tween(opts) {
            return new Tween(opts).play();
        }

        return { Tween, tween, resolveEasing };
    },
};
