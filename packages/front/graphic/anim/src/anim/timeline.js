// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.timeline` — compose tweens with computed start offsets,
 * as a capture-free fw module descriptor (FROZEN CONTRACT, `docs/CONTRACT.md`).
 *
 * A {@link Timeline} sequences, parallelizes or staggers child tweens. Crucially
 * it schedules its children on the **shared** scheduler (or an injected one) by
 * registering ITSELF as a single tickable — it does **not** open a second rAF
 * loop, so the single-scheduler invariant holds. Each tick it maps the frame
 * timestamp to a timeline-relative clock and feeds each child a shifted timestamp
 * once that child's offset window has opened. The timeline completes when every
 * child is `done`.
 *
 * **Terminal lifecycle**: a play cycle ends either by natural completion or by
 * {@link Timeline#stop}. `onComplete` keeps its completion-ONLY contract (it is
 * skipped by `stop()`); the additive `onSettle` hook fires on BOTH terminal
 * transitions, exactly once per play cycle, after the timeline has left the
 * scheduler. Owners whose state must be released whatever ended the animation
 * (re-entrancy guards, in-flight sets) hang it on `onSettle`, not `onComplete`.
 *
 * Capture-free: the two dependencies arrive ONLY as factory parameters
 * (`scheduler`, `tweenMod`). The `Timeline` class is defined INSIDE the factory
 * body so it can reference the injected `Tween` constructor and shared scheduler
 * without any module-scope capture. The top-of-file imports feed `deps[]` (the
 * bundler mirror) and are never referenced inside the factory.
 *
 * **NOT Worker-safe**: it drives `Tween`s, whose default writer mutates a DOM
 * target.
 *
 * @module graphic.timeline
 */

import { schedulerModule } from './scheduler.js';
import { tweenModule } from './tween.js';

/**
 * @typedef {Object} TimelineOptions
 * @property {object} [scheduler] Override the shared scheduler instance.
 * @property {() => void} [onComplete] Fired once when every child is done —
 *   **completion only**, never on {@link Timeline#stop}.
 * @property {() => void} [onSettle] Fired once on EVERY terminal transition of a
 *   play cycle — natural completion **and** `stop()`. The cleanup channel for
 *   owner-side state that must be released whatever ended the timeline. It runs
 *   after the timeline has been unregistered from its scheduler and, on the
 *   completion path, BEFORE `onComplete`. Never fires for a timeline that was
 *   never played.
 */

/**
 * `graphic.timeline` module descriptor.
 *
 * Factory returns `{ Timeline }`: the class that composes child tweens on the
 * SHARED scheduler with computed offsets (sequence/parallel/stagger).
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof schedulerModule, typeof tweenModule], factory(scheduler: { Scheduler: Function, scheduler: object }, tweenMod: { Tween: Function, tween: Function }): { Timeline: Function } }}
 */
export const timelineModule = {
    name: 'graphic.timeline',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.scheduler', 'graphic.tween'],
    deps: [schedulerModule, tweenModule],

    /**
     * Build the timeline surface from the resolved scheduler + tween modules. All
     * wiring is via parameters — the factory body never references a module-scope
     * binding.
     *
     * @param {{ Scheduler: Function, scheduler: object }} scheduler Resolved
     *   `graphic.scheduler` — `{ Scheduler, scheduler }` (shared singleton).
     * @param {{ Tween: Function, tween: Function }} tweenMod Resolved
     *   `graphic.tween` — `{ Tween, tween }`.
     * @returns {{ Timeline: Function }}
     */
    factory(scheduler, tweenMod) {
        const { Tween } = tweenMod;

        /**
         * @typedef {Object} TimelineChild
         * @property {Tween} tween The child tween.
         * @property {number} offset Start offset in ms, relative to timeline start.
         */

        /**
         * Compose child tweens on the shared scheduler with computed start offsets.
         * Children are {@link Tween} instances or plain `TweenOptions` the timeline
         * constructs (bound to the timeline's scheduler).
         */
        class Timeline {
            /**
             * @param {TimelineOptions} [opts]
             */
            constructor(opts) {
                const o = opts || {};
                /** @type {object} The scheduler instance the timeline registers on. */
                this._scheduler = o.scheduler || scheduler.scheduler;
                /** @type {TimelineChild[]} */
                this._children = [];
                this._onComplete = o.onComplete || null;
                this._onSettle = o.onSettle || null;
                this._startTs = 0;
                this._started = false;
                /**
                 * True between {@link Timeline#play} and the play cycle's terminal
                 * transition (natural completion or {@link Timeline#stop}). It is the
                 * one-shot latch behind `onSettle`: a timeline that never went live
                 * never settles, and a settled one never re-settles until replayed.
                 * @type {boolean}
                 * @private
                 */
                this._live = false;
                /** @type {boolean} True once every child has completed. */
                this.done = false;
                /**
                 * The timeline's own clock, in ms from its start. Each frame maps
                 * to `_base + (ts - _anchorTs) * _scale`; play, resume, seek and a
                 * time-scale change re-anchor it (`_anchorTs = null` anchors on the
                 * next frame).
                 * @private
                 */
                this._time = 0;
                /** @private */
                this._base = 0;
                /** @type {number|null} @private */
                this._anchorTs = null;
                /** @private */
                this._lastTs = 0;
                /** @private */
                this._scale = 1;
                /** @private */
                this._paused = false;
            }

            /**
             * Current position in ms from the timeline start: the last frame's,
             * or the last {@link Timeline#seek} target.
             * @type {number}
             */
            get time() { return this._time; }

            /**
             * Total length in ms: the latest end (`offset + duration`) of any
             * child; 0 for an empty timeline.
             * @type {number}
             */
            get duration() {
                let end = 0;
                for (const c of this._children) end = Math.max(end, c.offset + c.tween.duration);
                return end;
            }

            /**
             * True between {@link Timeline#pause} and the next
             * {@link Timeline#resume}, {@link Timeline#play} or
             * {@link Timeline#stop}.
             * @type {boolean}
             */
            get paused() { return this._paused; }

            /**
             * Playback rate: 1 is real time, 0.5 half speed, 0 frozen. A change
             * while playing keeps the position continuous.
             * @type {number}
             * @throws {Error} `Timeline: timeScale must be a finite number >= 0`.
             */
            get timeScale() { return this._scale; }

            set timeScale(v) {
                if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
                    throw new Error('Timeline: timeScale must be a finite number >= 0');
                }
                if (this._anchorTs !== null) {
                    this._base = this._time;
                    this._anchorTs = this._lastTs;
                }
                this._scale = v;
            }

            /**
             * Render the state of the whole timeline at `ms` (clamped to
             * `[0, duration]`) and move its clock there. Every child whose window
             * has opened is written at its progress; a child that has not started
             * writes its `from`, so a track holds its first child's start value
             * until it begins. The write order follows live play: children that
             * have not started first (the earliest last), then the others by the
             * time they last wrote (their end, or now when still running), in
             * insertion order on a tie.
             *
             * Seek fires each child's `apply` and `onUpdate`, never an
             * `onComplete` (a child's or the timeline's), and leaves the scheduler
             * as it was: a playing timeline continues from `ms` on the next frame,
             * a paused or idle one stays put until {@link Timeline#resume}.
             * @param {number} ms Target position in ms.
             * @returns {this}
             * @throws {Error} `Timeline: seek needs a finite time in ms`.
             */
            seek(ms) {
                if (typeof ms !== 'number' || !Number.isFinite(ms)) {
                    throw new Error('Timeline: seek needs a finite time in ms');
                }
                const t = Math.min(Math.max(ms, 0), this.duration);
                const pending = [];
                const opened = [];
                this._children.forEach((c, i) => {
                    const end = c.offset + c.tween.duration;
                    if (t < c.offset) {
                        pending.push({ c, i });
                        c.tween._started = false;
                        c.tween.done = false;
                    } else {
                        opened.push({ c, i, last: Math.min(t, end) });
                        c.tween._started = true;
                        c.tween._startTs = c.offset;
                        c.tween.done = t >= end;
                    }
                });
                pending.sort((a, b) => (b.c.offset - a.c.offset) || (b.i - a.i));
                opened.sort((a, b) => (a.last - b.last) || (a.i - b.i));
                for (const p of pending) p.c.tween._renderAt(0);
                for (const o of opened) o.c.tween._renderAt(t - o.c.offset);
                this._time = t;
                this._base = t;
                this._anchorTs = null;
                return this;
            }

            /**
             * Hold the timeline at its current position: it leaves the scheduler
             * but stays live (no `onSettle`). {@link Timeline#resume} continues.
             * No-op unless the timeline is playing.
             * @returns {this}
             */
            pause() {
                if (!this._live || this._paused) return this;
                this._scheduler.remove(this);
                this._paused = true;
                this._base = this._time;
                this._anchorTs = null;
                return this;
            }

            /**
             * Continue from the current position. On a paused timeline this
             * re-registers it; on one that is not playing (never played, stopped,
             * completed, or only seeked) it starts a play cycle from `time`
             * instead of from 0 ({@link Timeline#play} restarts at 0). No-op on a
             * timeline that is already playing.
             * @returns {this}
             */
            resume() {
                if (this._live && !this._paused) return this;
                if (!this._live) {
                    this._live = true;
                    this.done = false;
                    this._started = true;
                }
                this._paused = false;
                this._base = this._time;
                this._anchorTs = null;
                this._scheduler.add(this);
                return this;
            }

            /**
             * Terminal transition: clear the live latch and fire `onSettle` once.
             * Called from BOTH terminal paths (natural completion in `_step` and
             * {@link Timeline#stop}) AFTER the timeline has been unregistered, so the
             * hook always observes an already-detached timeline. No-op when the
             * timeline is not live (never played, or already settled).
             * @returns {boolean} True when this call performed the transition.
             * @private
             */
            _settle() {
                if (!this._live) return false;
                this._live = false;
                if (this._onSettle) this._onSettle();
                return true;
            }

            /**
             * Coerce a child argument into a {@link Tween} bound to this timeline's
             * scheduler. A `Tween` is rebound; plain options are constructed.
             * @param {Tween|object} item
             * @returns {Tween}
             * @private
             */
            _toTween(item) {
                const t = (item instanceof Tween)
                    ? item
                    : new Tween(/** @type {any} */ ({ ...item, scheduler: this._scheduler }));
                // Children are driven by the timeline, not registered on the scheduler
                // directly — bind them to the timeline's scheduler for consistency.
                t._scheduler = this._scheduler;
                return t;
            }

            /**
             * Place a child at an absolute offset (ms) from the timeline start.
             * @param {Tween|object} tweenOrOptions
             * @param {number} [atMs] Absolute offset; defaults to 0.
             * @returns {this}
             */
            add(tweenOrOptions, atMs) {
                this._children.push({
                    tween: this._toTween(tweenOrOptions),
                    offset: atMs > 0 ? atMs : 0,
                });
                return this;
            }

            /**
             * Append children back-to-back: each starts when the previous one ends
             * (offset = cumulative durations).
             * @param {Array<Tween|object>} items
             * @returns {this}
             */
            sequence(items) {
                let cursor = 0;
                for (const item of items) {
                    const t = this._toTween(item);
                    this._children.push({ tween: t, offset: cursor });
                    cursor += t.duration;
                }
                return this;
            }

            /**
             * Add children that all start together (offset = 0).
             * @param {Array<Tween|object>} items
             * @returns {this}
             */
            parallel(items) {
                for (const item of items) {
                    this._children.push({ tween: this._toTween(item), offset: 0 });
                }
                return this;
            }

            /**
             * Add children offset from one another. With a number, child `i`
             * starts at `i * stepMs`. With an options object:
             * - `each` — ms between two neighbours (default 0);
             * - `from` — where the wave starts: `'start'` (default), `'end'`,
             *   `'center'`, `'edges'`, or an item index;
             * - `ease` — an easing spec (see `graphic.tween`'s `resolveEasing`)
             *   that redistributes the offsets over the same span;
             * - `at` — a base offset in ms added to every child (default 0).
             * @param {Array<Tween|object>} items
             * @param {number|{ each?: number, from?: ('start'|'end'|'center'|'edges'|number), ease?: ((t: number) => number)|string, at?: number }} stepMs
             * @returns {this}
             * @throws {Error} `Timeline: stagger from …` for an unknown origin or
             *   an index outside the items; what `resolveEasing` throws for `ease`.
             */
            stagger(items, stepMs) {
                if (stepMs === null || typeof stepMs !== 'object') {
                    const step = stepMs > 0 ? stepMs : 0;
                    items.forEach((item, i) => {
                        this._children.push({ tween: this._toTween(item), offset: i * step });
                    });
                    return this;
                }
                const o = stepMs;
                const each = o.each > 0 ? o.each : 0;
                const at = o.at > 0 ? o.at : 0;
                const n = items.length;
                const from = o.from === undefined ? 'start' : o.from;
                const mid = (n - 1) / 2;
                /** @type {(i: number) => number} */
                let dist;
                if (from === 'start') dist = (i) => i;
                else if (from === 'end') dist = (i) => n - 1 - i;
                else if (from === 'center') dist = (i) => Math.abs(i - mid);
                else if (from === 'edges') dist = (i) => mid - Math.abs(i - mid);
                else if (Number.isInteger(from) && from >= 0 && from < n) dist = (i) => Math.abs(i - /** @type {number} */ (from));
                else {
                    throw new Error(`Timeline: stagger from must be 'start', 'end', 'center', 'edges' or an index in [0, ${n}), got ${JSON.stringify(from)}`);
                }
                let maxD = 0;
                for (let i = 0; i < n; i += 1) maxD = Math.max(maxD, dist(i));
                const ease = o.ease === undefined || o.ease === null ? null
                    : typeof o.ease === 'function' ? o.ease : tweenMod.resolveEasing(o.ease);
                items.forEach((item, i) => {
                    const d = dist(i);
                    const span = ease && maxD > 0 ? ease(d / maxD) * maxD : d;
                    this._children.push({ tween: this._toTween(item), offset: at + span * each });
                });
                return this;
            }

            /**
             * Start the timeline: register IT (not each child) on the scheduler. Children
             * begin progressing as their offset windows open. The scheduler's single loop
             * drives everything. Re-arms the `onSettle` latch: each play cycle settles
             * exactly once.
             * @returns {this}
             */
            play() {
                this._started = false;
                this.done = false;
                this._live = true;
                this._paused = false;
                this._time = 0;
                this._base = 0;
                this._anchorTs = null;
                for (const c of this._children) {
                    c.tween._started = false;
                    c.tween.done = false;
                }
                this._scheduler.add(this);
                return this;
            }

            /**
             * Cancel a still-in-flight timeline: unregister it from ITS OWN scheduler
             * (the instance captured at construction — the shared default, or
             * `opts.scheduler`). This is the caller's only handle to cancel a turn when
             * the timeline was left on the SHARED scheduler.
             *
             * Idempotent: a no-op before {@link Timeline#play} (never registered) and
             * after natural completion (already removed by `_step`) — `Scheduler#remove`
             * is a `Set.delete`, safe on an absent tickable. Does **not** invoke
             * `onComplete`; `done` is left as-is (a stopped timeline did not "complete").
             * After `stop()` the timeline is unregistered from the scheduler exactly as
             * after natural completion.
             *
             * It DOES fire `onSettle` — the terminal-transition hook — once, and only
             * when the timeline was actually live (played and not already terminal).
             * That is the seam an owner uses to release completion-driven state
             * (guards, in-flight sets) on a cancellation the `onComplete` contract
             * deliberately skips.
             * @returns {this}
             */
            stop() {
                this._scheduler.remove(this);
                this._paused = false;
                this._anchorTs = null;
                this._settle();
                return this;
            }

            /**
             * Advance the timeline to timestamp `ts`. Drives each child with a shifted
             * timestamp (`ts - offset`) once its offset window has opened, completing the
             * timeline when every child is done. Called by the scheduler each tick.
             * @param {number} ts Frame timestamp.
             * @private
             */
            _step(ts) {
                if (this.done) return;
                if (!this._started) { this._startTs = ts; this._started = true; }
                if (this._anchorTs === null) this._anchorTs = ts;
                this._lastTs = ts;
                const elapsed = this._base + (ts - this._anchorTs) * this._scale;
                this._time = elapsed;
                let allDone = true;
                for (const c of this._children) {
                    if (c.tween.done) continue;
                    if (elapsed >= c.offset) {
                        // Anchor the child's start at its offset on the timeline's own
                        // clock on its first open tick, so progress is measured from the
                        // offset, not from the frame the window happened to open on. Then
                        // drive it with the timeline time.
                        if (!c.tween._started) {
                            c.tween._startTs = c.offset;
                            c.tween._started = true;
                        }
                        c.tween._step(elapsed);
                    }
                    if (!c.tween.done) allDone = false;
                }
                if (allDone && this._children.length > 0) {
                    this.done = true;
                    this._scheduler.remove(this);
                    // Cleanup first (owner-side state release), then the
                    // completion-only observer.
                    this._settle();
                    if (this._onComplete) this._onComplete();
                }
            }
        }

        return { Timeline };
    },
};
