// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.frames` — reference-bound frame-sequence primitive
 * (discrete SVG frame elements OR a sprite-sheet viewBox window) driven by the
 * shared scheduler, as a capture-free fw module descriptor.
 *
 * A {@link Frames} steps through a fixed set of frames at a fixed `fps`. In
 * **discrete** mode it shows one of an array of frame elements and hides the
 * rest; in **sprite** mode it retargets a single element's `viewBox` to the
 * window of frame `i` in a `cols × rows` sheet. Timing is measured against the
 * shared scheduler clock and the current frame index is a **pure, DOM-free
 * function** of elapsed time — Worker-safe. Only the `apply` writer touches DOM.
 *
 * The target(s) are bound **by reference once** at construction — there is no
 * per-tick `getElementById`/DOM lookup (the legacy O(n)/frame cost the rewrite
 * removes). {@link Frames} is a *tickable* (`_step(ts)`) registered on the
 * shared scheduler exactly like `graphic.tween` — it NEVER calls
 * `requestAnimationFrame` directly and NEVER constructs its own production
 * `Scheduler` (an `opts.scheduler` override exists only for tests / isolated
 * timelines).
 *
 * Capture-free: the two dependencies arrive ONLY as factory parameters
 * (`scheduler`, `svgApply`). The `Frames` class AND every shared constant/table
 * are defined INSIDE the factory body so they reference those parameters
 * without any module-scope capture (`fw/no-factory-capture` clean). The
 * top-of-file imports feed `deps[]` (the bundler mirror) and are never
 * referenced inside the factory.
 *
 * **NOT Worker-safe** as a whole: the default writer mutates a DOM target. The
 * frame-index/timing layer it consumes stays pure and Worker-safe.
 *
 * This is a frame primitive — distinct from `graphic.pageflip` (the page-turn
 * book, a separate module).
 *
 * @module graphic.frames
 */

import { schedulerModule } from '../anim/scheduler.js';
import { svgApplyModule } from '../svg/apply.js';

/**
 * @typedef {Object} SpriteSpec
 * @property {object} target The single element whose `viewBox` window is stepped.
 * @property {number} cols Columns in the sprite sheet.
 * @property {number} rows Rows in the sprite sheet.
 * @property {number} frameW Width of one frame cell (viewBox units).
 * @property {number} frameH Height of one frame cell (viewBox units).
 */

/**
 * @typedef {Object} FramesOptions
 * @property {object[]} [frames] Discrete-mode frame elements, bound BY REFERENCE
 *   once. Mutually exclusive with `sprite`.
 * @property {SpriteSpec} [sprite] Sprite-sheet spec. Mutually exclusive with `frames`.
 * @property {number} [fps=12] Frames per second (coerced to a positive minimum).
 * @property {boolean} [loop=true] Wrap last→first indefinitely.
 * @property {boolean} [pingPong=false] Bounce `0..N-1..1` instead of wrapping.
 * @property {(index: number, api: { frames?: object[], sprite?: SpriteSpec, svgApply: object, window: (i: number) => string }) => void} [apply]
 *   Writer; discrete default = show frame `i` / hide others, sprite default =
 *   `svgApply.svgAttr(target, 'viewBox', window(i))`.
 * @property {(index: number) => void} [onFrame] Fired whenever the frame changes.
 * @property {() => void} [onComplete] Fired once at the end of a non-looping run.
 * @property {object} [scheduler] Override the shared scheduler instance
 *   (tests / isolated timelines).
 */

/**
 * `graphic.frames` module descriptor.
 *
 * Factory returns `{ Frames, frames }`:
 * - `Frames` — the reference-bound frame-sequence class (tickable).
 * - `frames` — convenience that builds a {@link Frames} (does NOT auto-play).
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof schedulerModule, typeof svgApplyModule], factory(scheduler: { Scheduler: Function, scheduler: object }, svgApply: { SVG_NS: string, svgAttr: Function }): { Frames: Function, frames: Function } }}
 */
export const framesModule = {
    name: 'graphic.frames',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.scheduler', 'graphic.svgApply'],
    deps: [schedulerModule, svgApplyModule],

    /**
     * Build the frames surface from the two resolved dependencies. All wiring is
     * via parameters — the factory body never references a module-scope binding.
     *
     * @param {{ Scheduler: Function, scheduler: object }} scheduler Resolved
     *   `graphic.scheduler` — `{ Scheduler, scheduler }` (shared singleton).
     * @param {{ SVG_NS: string, svgAttr: Function }} svgApply Resolved
     *   `graphic.svgApply` — `{ SVG_NS, svgAttr }`.
     * @returns {{ Frames: Function, frames: Function }}
     */
    factory(scheduler, svgApply) {
        /**
         * Map a raw, monotonically-increasing tick count to a displayed frame
         * index, honouring `loop`/`pingPong`. **Pure and DOM-free** (Worker-safe):
         * takes only numbers, returns a number. For `frameCount === 1` it is
         * always `0`.
         *
         * - loop off:  clamp `raw` to `[0, frameCount-1]` (the caller detects the
         *   end and stops).
         * - loop on, no ping-pong: `raw % frameCount` — wraps last→first.
         * - ping-pong: bounce over a period of `2*(frameCount-1)` so the sequence
         *   is `0,1,…,N-1,N-2,…,1` with NO duplicated endpoint frame.
         *
         * @param {number} raw Non-negative tick count (`floor(elapsed*fps/1000)`).
         * @param {number} frameCount Total frames (≥ 1).
         * @param {boolean} loop
         * @param {boolean} pingPong
         * @returns {number} Displayed frame index in `[0, frameCount-1]`.
         */
        function frameIndexOf(raw, frameCount, loop, pingPong) {
            if (frameCount <= 1) return 0;
            if (raw < 0) raw = 0;
            if (pingPong) {
                const period = 2 * (frameCount - 1);
                const pos = loop ? (raw % period) : Math.min(raw, period);
                return pos < frameCount ? pos : period - pos;
            }
            if (loop) return raw % frameCount;
            return raw < frameCount ? raw : frameCount - 1;
        }

        /**
         * True once the (non-looping) sequence has displayed its final frame,
         * i.e. `raw` has reached the last displayable position. Pure/Worker-safe.
         *
         * @param {number} raw
         * @param {number} frameCount
         * @param {boolean} pingPong
         * @returns {boolean}
         */
        function isFinished(raw, frameCount, pingPong) {
            if (frameCount <= 1) return raw >= 0;
            const last = pingPong ? 2 * (frameCount - 1) : frameCount - 1;
            return raw >= last;
        }

        /**
         * Reference-bound frame-sequence animator driven by the shared scheduler.
         */
        class Frames {
            /**
             * @param {FramesOptions} opts
             * @throws {Error} If neither `frames` nor `sprite` is given, or `frames` is empty.
             */
            constructor(opts) {
                if (!opts || (!opts.frames && !opts.sprite)) {
                    throw new Error('Frames: frames or sprite is required');
                }
                if (opts.frames && opts.sprite) {
                    throw new Error('Frames: frames and sprite are mutually exclusive');
                }

                /** @type {object[]|null} Discrete frame targets, bound BY REFERENCE. */
                this._frames = opts.frames || null;
                /** @type {SpriteSpec|null} Sprite-sheet spec, target bound BY REFERENCE. */
                this._sprite = opts.sprite || null;

                if (this._frames && this._frames.length === 0) {
                    throw new Error('Frames: frames must not be empty');
                }

                /** @type {number} Total frames in the sequence. */
                this.frameCount = this._frames
                    ? this._frames.length
                    : (this._sprite.cols * this._sprite.rows);

                /** @type {number} Frames per second; coerced to a positive minimum. */
                this.fps = opts.fps > 0 ? opts.fps : 12;
                /** @type {boolean} */
                this.loop = opts.loop !== undefined ? !!opts.loop : true;
                /** @type {boolean} */
                this.pingPong = !!opts.pingPong;

                this._onFrame = opts.onFrame || null;
                this._onComplete = opts.onComplete || null;

                /**
                 * Default writer. Discrete: show frame `i`, hide the others via the
                 * `display` attribute. Sprite: retarget `viewBox` to the window of
                 * frame `i` through the injected `svgApply.svgAttr`.
                 * @type {(index: number, api: object) => void}
                 */
                this._apply = opts.apply || ((index, api) => {
                    if (api.frames) {
                        for (let i = 0; i < api.frames.length; i += 1) {
                            api.svgApply.svgAttr(api.frames[i], 'display', i === index ? 'inline' : 'none');
                        }
                    } else {
                        api.svgApply.svgAttr(api.sprite.target, 'viewBox', api.window(index));
                    }
                });

                /** @type {object} The scheduler instance this animator registers on. */
                this._scheduler = opts.scheduler || scheduler.scheduler;

                this._startTs = 0;
                this._started = false;
                /** @type {boolean} True while registered on the scheduler. */
                this.playing = false;
                /** @type {boolean} True once a non-looping run has completed. */
                this.done = false;
                /** @type {number} Currently displayed frame index. */
                this.frame = 0;
                /** @type {number} Last displayed index, so `apply` fires only on change. */
                this._lastIndex = -1;
            }

            /**
             * Compute the sprite `viewBox` string for frame `i` in a row-major sheet.
             * Pure/Worker-safe (numeric only). Only meaningful in sprite mode.
             * @param {number} i Frame index.
             * @returns {string} `"minX minY frameW frameH"`.
             */
            _window(i) {
                const s = this._sprite;
                const col = i % s.cols;
                const row = Math.floor(i / s.cols);
                return `${col * s.frameW} ${row * s.frameH} ${s.frameW} ${s.frameH}`;
            }

            /**
             * Apply frame `index` through the writer with the reference-bound
             * targets. NEVER performs a DOM query — the targets were captured once.
             * @param {number} index
             * @private
             */
            _render(index) {
                this._apply(index, {
                    frames: this._frames || undefined,
                    sprite: this._sprite || undefined,
                    svgApply,
                    window: (i) => this._window(i),
                });
            }

            /**
             * Begin playback: register with the scheduler (which starts the shared
             * loop if idle) and reset the start time so a run can be replayed.
             * @returns {this}
             */
            play() {
                this._started = false;
                this.done = false;
                this.playing = true;
                this._scheduler.add(this);
                return this;
            }

            /**
             * Pause playback: unregister from the scheduler and freeze on the current
             * frame. A subsequent {@link Frames#play} restarts timing from that frame's
             * boundary (start time re-fixed on the next tick).
             * @returns {this}
             */
            pause() {
                this.playing = false;
                this._scheduler.remove(this);
                return this;
            }

            /**
             * Jump to `index` (clamped to `[0, frameCount-1]`), apply it immediately and
             * fire `onFrame`. Does NOT auto-play and does NOT throw on an out-of-range
             * index.
             * @param {number} index
             * @returns {this}
             */
            seek(index) {
                let i = Math.floor(index);
                if (i < 0) i = 0;
                if (i > this.frameCount - 1) i = this.frameCount - 1;
                this.frame = i;
                this._lastIndex = i;
                this._render(i);
                if (this._onFrame) this._onFrame(i);
                return this;
            }

            /**
             * Advance to timestamp `ts`. Called by the scheduler each tick. The first
             * tick fixes the start time so timing is measured from the first frame, not
             * from `play()`. The displayed frame is a pure function of elapsed time; the
             * writer runs ONLY when the index changes.
             * @param {number} ts Frame timestamp.
             * @private
             */
            _step(ts) {
                if (this.done) return;
                if (!this._started) { this._startTs = ts; this._started = true; }
                const elapsed = ts - this._startTs;
                const raw = Math.floor((elapsed > 0 ? elapsed : 0) * this.fps / 1000);
                const index = frameIndexOf(raw, this.frameCount, this.loop, this.pingPong);
                if (index !== this._lastIndex) {
                    this._lastIndex = index;
                    this.frame = index;
                    this._render(index);
                    if (this._onFrame) this._onFrame(index);
                }
                if (!this.loop && isFinished(raw, this.frameCount, this.pingPong)) {
                    this.done = true;
                    this.playing = false;
                    this._scheduler.remove(this);
                    if (this._onComplete) this._onComplete();
                }
            }
        }

        /**
         * Convenience: build a {@link Frames}. Does NOT auto-play (call `.play()`).
         * @param {FramesOptions} opts
         * @returns {Frames}
         */
        function frames(opts) {
            return new Frames(opts);
        }

        return { Frames, frames };
    },
};
