// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Module descriptor `graphic.scheduler` — main-thread animation
 * scheduler with ONE shared rAF loop.
 *
 * A {@link Scheduler} ticks ALL active tweens from a single `requestAnimationFrame`
 * loop. Active tweens live in a `Set`; the loop is self-stopping (it ends when the
 * set empties) and restarts on the next {@link Scheduler#add}. This single-loop
 * invariant is what the perf bet relies on — N concurrent tweens share ONE loop,
 * not N loops, and there is **no per-tick DOM lookup** anywhere.
 *
 * **NOT Worker-safe** by design: it drives the main thread (rAF + DOM writes
 * through reference-bound targets). The pure layers it consumes (`math`,
 * `interpolate`) stay DOM-free and Worker-safe; this engine does not offload to a
 * Worker by default (a measured Worker offload was ~2.6–3.0× slower).
 *
 * The clock is injectable for tests: pass `{ now, schedule, cancel }` so a run with
 * no real rAF clock can drive frames deterministically via {@link Scheduler#tick}.
 * The default `now` is fw's `clock.monotonic` (`io/timing/clock.js`), which
 * works under fw's sanity lockdown (where `performance.now` throws). The rAF
 * loop never reads it: every frame is ticked with rAF's own timestamp, so the
 * default `now` only serves a manual `tick()` with no timestamp — do not mix
 * the two timebases on one scheduler.
 *
 * `requestAnimationFrame` and `globalThis` are ambient globals — they are not
 * module-scope bindings and are therefore not captures under
 * `fw/no-factory-capture`.
 */

import { clock } from '@awacloud/fw/io/timing/clock.js';

/**
 * @typedef {Object} Clock
 * @property {() => number} [now] Returns a monotonic-ish ms timestamp.
 * @property {(cb: (t: number) => void) => number} [schedule] Schedule one frame.
 * @property {(id: number) => void} [cancel] Cancel a scheduled frame.
 */

/**
 * @typedef {Object} Tickable
 * @property {(ts: number) => void} _step Advance this tween to timestamp `ts`.
 */

/**
 * `graphic.scheduler` module descriptor.
 *
 * Factory returns `{ Scheduler, scheduler }`:
 * - `Scheduler` — the class (injectable clock, single self-stopping rAF loop)
 * - `scheduler` — the ONE shared singleton instance
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof clock], factory: (clockApi: { monotonic: () => number }) => { Scheduler: typeof Scheduler, scheduler: InstanceType<typeof Scheduler> } }}
 */
export const schedulerModule = {
    name: 'graphic.scheduler',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['clock'],
    deps: [clock],

    /**
     * @param {{ monotonic: () => number }} clockApi Resolved fw `clock`.
     */
    factory(clockApi) {
        /**
         * One scheduler ticks all active tweens from a single rAF loop. The loop
         * self-stops when {@link Scheduler#active} empties and restarts on the next
         * {@link Scheduler#add}. This is the single-scheduler invariant.
         */
        class Scheduler {
            /**
             * @param {Clock} [clock] Injectable timing; defaults to rAF + fw `clock.monotonic`.
             */
            constructor(clock) {
                /**
                 * Active tweens, ticked once per frame. A `Set` so a tween cannot be
                 * scheduled twice and removal on completion is O(1).
                 * @type {Set<Tickable>}
                 */
                this.active = new Set();
                /** @type {number} */
                this._raf = 0;
                /** @type {boolean} */
                this._running = false;
                const g = /** @type {any} */ (globalThis);
                this._now = (clock && clock.now) || clockApi.monotonic;
                this._schedule = (clock && clock.schedule)
                    || ((cb) => g.requestAnimationFrame(cb));
                this._cancel = (clock && clock.cancel)
                    || ((id) => { if (g.cancelAnimationFrame) g.cancelAnimationFrame(id); });
            }

            /**
             * @returns {number} A timestamp from the injected clock.
             */
            now() { return this._now(); }

            /**
             * Register a tween and start the single loop if it is idle.
             * @param {Tickable} tween
             */
            add(tween) {
                this.active.add(tween);
                if (!this._running) this._start();
            }

            /**
             * Unregister a tween. Does not stop the loop; the loop self-stops once the
             * active set empties at the end of the current frame.
             * @param {Tickable} tween
             */
            remove(tween) {
                this.active.delete(tween);
            }

            /**
             * Start the single self-stopping loop.
             * @private
             */
            _start() {
                this._running = true;
                const loop = (ts) => {
                    this.tick(ts);
                    if (this.active.size > 0) {
                        this._raf = this._schedule(loop);
                    } else {
                        this._running = false;
                    }
                };
                this._raf = this._schedule(loop);
            }

            /**
             * Advance every active tween to timestamp `ts`. Exposed so tests can drive
             * frames deterministically without a real rAF clock. Iterates a snapshot so a
             * tween may remove itself mid-tick on completion.
             * @param {number} [ts] Frame timestamp; defaults to the injected clock.
             */
            tick(ts) {
                const t = (ts == null) ? this._now() : ts;
                for (const tween of [...this.active]) {
                    tween._step(t);
                }
            }

            /**
             * Cancel the loop and clear all active tweens (teardown).
             */
            stop() {
                if (this._raf) this._cancel(this._raf);
                this._raf = 0;
                this._running = false;
                this.active.clear();
            }
        }

        /**
         * The ONE shared scheduler instance. All tweens default to it, so N concurrent
         * tweens share a single rAF loop. Use this — do not construct a second one for
         * production animations.
         * @type {Scheduler}
         */
        const scheduler = new Scheduler();

        return { Scheduler, scheduler };
    },
};
