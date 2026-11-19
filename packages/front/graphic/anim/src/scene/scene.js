// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.scene` — instance-scoped scene / named-event DSL, as a
 * capture-free fw module descriptor.
 *
 * A {@link Scene} pairs a JSON SVG template (built via `graphic.svgBuild` with a
 * fresh `graphic.scopedIds` scope) with a map of **named events** — declarative
 * animation specs compiled on demand into `graphic.timeline`/`graphic.tween`
 * instances that all register on the SHARED `graphic.scheduler` singleton. Targets
 * are resolved once from the built subtree and bound BY REFERENCE — there is no
 * per-tick `getElementById`/DOM lookup (the legacy `@anim-old` `compute.events`/
 * `loop` cost this rewrite removes).
 *
 * Capture-free: the five dependencies arrive ONLY as factory parameters
 * (`svgBuild`, `scopedIds`, `timelineMod`, `tweenMod`, `scheduler`). The `Scene`
 * class is defined INSIDE the factory body so it can reference the injected
 * `Timeline`/`Tween` constructors without any module-scope capture. The
 * top-of-file imports feed `deps[]` (the bundler mirror) and are never
 * referenced inside the factory.
 *
 * Single-scheduler invariant: every `Timeline`/`Tween` a scene compiles is either
 * constructed with the default (shared) scheduler or an explicit override — this
 * module never constructs a second `Scheduler`. `scene.on`/`scene.fire` always
 * produce a `Timeline` that registers itself on `scheduler.scheduler`.
 *
 * **NOT Worker-safe**: it drives a DOM-bound scene built via `svgBuild`.
 *
 * @module graphic.scene
 */

import { svgBuildModule } from '../svg/build.js';
import { scopedIdsModule } from '../svg/scoped-ids.js';
import { timelineModule } from '../anim/timeline.js';
import { tweenModule } from '../anim/tween.js';
import { schedulerModule } from '../anim/scheduler.js';

/**
 * @typedef {{ tag: string, attrs?: Record<string, string|number>, children?: (NodeDesc|string)[], text?: string|number }} NodeDesc
 */

/**
 * @typedef {Object} AnimSpec
 * @property {string} [target] Ref name resolved via `scene.el`; defaults to the
 *   owning `EventSpec.at`.
 * @property {string} property Attribute/property name to animate.
 * @property {string|number} from Start value (`t = 0`).
 * @property {string|number} to End value (`t = 1`).
 * @property {number} duration Duration in ms.
 * @property {((t: number) => number)|string} [easing] Curve fn or its name.
 */

/**
 * @typedef {Object} EventSpec
 * @property {string} at Default ref name for animations that omit `target`.
 * @property {AnimSpec[]} animations Animations compiled into the event's timeline.
 * @property {'sequence'|'parallel'|'stagger'} [mode] Composition mode; defaults to
 *   `'parallel'`.
 * @property {number} [stepMs] Per-child offset for `mode: 'stagger'`.
 * @property {boolean} [loop] When true, re-`fire` the same event on completion.
 */

/**
 * @typedef {Object} SceneSpec
 * @property {NodeDesc} template JSON SVG template built via `graphic.svgBuild`.
 * @property {string} [prefix] Id-scope prefix, used verbatim (`''` included);
 *   only an absent prefix takes the default, a DISTINCT
 *   per-instance `scene-<n>` — never a shared constant, so two
 *   default-constructed scenes never collide document-wide.
 * @property {Record<string, string>} [refs] Name → raw template id map, resolved
 *   to scoped ids via `graphic.scopedIds`.
 * @property {Record<string, EventSpec>} events Named event → animation spec map.
 */

/**
 * `graphic.scene` module descriptor.
 *
 * Factory returns `{ createScene }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof svgBuildModule, typeof scopedIdsModule, typeof timelineModule, typeof tweenModule, typeof schedulerModule], factory(svgBuild: object, scopedIds: object, timelineMod: object, tweenMod: object, scheduler: object): { createScene(spec: SceneSpec): object } }}
 */
export const sceneModule = {
    name: 'graphic.scene',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline', 'graphic.tween', 'graphic.scheduler'],
    deps: [svgBuildModule, scopedIdsModule, timelineModule, tweenModule, schedulerModule],

    /**
     * Build the scene surface from the five resolved dependencies. All wiring is
     * via parameters — the factory body never references a module-scope binding.
     *
     * @param {{ build: Function, SVG_TAGS: Set<string> }} svgBuild Resolved
     *   `graphic.svgBuild` — `{ build, SVG_TAGS }`.
     * @param {{ createScope: Function }} scopedIds Resolved `graphic.scopedIds` —
     *   `{ createScope }`.
     * @param {{ Timeline: Function }} timelineMod Resolved `graphic.timeline` —
     *   `{ Timeline }`.
     * @param {{ Tween: Function, tween: Function }} tweenMod Resolved
     *   `graphic.tween` — `{ Tween, tween }`.
     * @param {{ Scheduler: Function, scheduler: object }} scheduler Resolved
     *   `graphic.scheduler` — `{ Scheduler, scheduler }` (shared singleton).
     * @returns {{ createScene(spec: SceneSpec): object }}
     */
    factory(svgBuild, scopedIds, timelineMod, tweenMod, scheduler) {
        const { Timeline } = timelineMod; // frozen

        /**
         * Factory-scope monotonic counter minting DISTINCT default prefixes so
         * two scenes built without an explicit `prefix` never mint colliding
         * ids (`scene` was the last composed module still defaulting
         * to a bare shared `'scene'`; `hypertree`/`pageflip`/`svg3d` already
         * kept their own such counter). Defined in-factory (capture-free — a
         * module-scope binding would fail `fw/no-factory-capture` and would not
         * survive `runtime.serialize()`), never reset, no clock/randomness.
         * @type {number}
         */
        let _instanceSeq = 0;
        // tweenMod.Tween is not referenced directly here — Timeline#sequence/
        // parallel/stagger/add accept plain TweenOptions and construct their own
        // Tween internally, bound to the timeline's scheduler.

        /**
         * One scene instance: a built SVG subtree + compiled named events.
         */
        class Scene {
            /**
             * @param {SceneSpec} spec
             */
            constructor(spec) {
                const s = spec || {};
                /** @type {SceneSpec} */
                this._spec = s;
                /**
                 * Fresh per-instance id scope. An explicit `spec.prefix` is
                 * used verbatim (byte-identical to the earlier behavior) and
                 * short-circuits the counter; otherwise a DISTINCT
                 * `scene-<n>` is minted.
                 * @type {object}
                 */
                this._scope = scopedIds.createScope(s.prefix !== undefined ? s.prefix : `scene-${_instanceSeq++}`);
                /** @type {SVGElement} Built root, ids scoped, refs rewritten. */
                this.root = svgBuild.build(s.template, { idScope: this._scope });
                /** @type {Record<string, string>} Raw ref name → raw template id. */
                this._refs = s.refs || {};
                /** @type {Map<string, SVGElement>} Ref name → bound element (by reference). */
                this._elements = new Map();
                for (const name of Object.keys(this._refs)) {
                    const scopedId = this._scope.id(this._refs[name]);
                    const el = this.root.querySelector
                        ? (this.root.getAttribute && this.root.getAttribute('id') === scopedId
                            ? this.root
                            : this.root.querySelector(`#${scopedId}`))
                        : null;
                    this._elements.set(name, el || null);
                }
                /** @type {Record<string, EventSpec>} */
                this._events = s.events || {};
                /**
                 * Event name → the timelines {@link Scene#fire} started and that
                 * have not settled yet (a loop's re-fired cycles included).
                 * @type {Map<string, Set<object>>}
                 */
                this._fired = new Map();
                /** @type {Set<string>} Events whose loop must not continue. */
                this._halted = new Set();
                /** @type {boolean} */
                this._disposed = false;
            }

            /**
             * Resolve a `refs` name to its bound element.
             * @param {string} name
             * @returns {SVGElement}
             * @throws {Error} `scene: unknown ref "<name>"` when `name` is not in
             *   `spec.refs`, or when it could not be resolved in the built subtree.
             */
            el(name) {
                if (!this._elements.has(name) || !this._elements.get(name)) {
                    throw new Error(`scene: unknown ref "${name}"`);
                }
                return this._elements.get(name);
            }

            /**
             * Resolve an `AnimSpec` target name (or the event's default `at`) to a
             * bound element via {@link Scene#el}.
             * @param {AnimSpec} anim
             * @param {EventSpec} eventSpec
             * @returns {SVGElement}
             * @private
             */
            _resolveTarget(anim, eventSpec) {
                return this.el(anim.target || eventSpec.at);
            }

            /**
             * Compile one `AnimSpec` into a plain `TweenOptions` object (target
             * resolved to a bound element; the rest forwarded 1:1).
             * @param {AnimSpec} anim
             * @param {EventSpec} eventSpec
             * @returns {object}
             * @private
             */
            _toTweenOptions(anim, eventSpec) {
                return {
                    target: this._resolveTarget(anim, eventSpec),
                    property: anim.property,
                    from: anim.from,
                    to: anim.to,
                    duration: anim.duration,
                    easing: anim.easing,
                };
            }

            /**
             * Compile a named event into a fresh `Timeline` (does NOT auto-play).
             * @param {string} eventName
             * @returns {object} The compiled `Timeline`.
             * @throws {Error} `scene: unknown event "<name>"` when `eventName` is
             *   not in `spec.events`; `scene: disposed` after {@link Scene#dispose}.
             */
            on(eventName) {
                return this._compile(eventName, null);
            }

            /**
             * Compile a named event into a fresh `Timeline`. A looping event's
             * completion re-fires it unless {@link Scene#stop} or
             * {@link Scene#dispose} ended that event since — the continuation
             * checks the scene, not a captured timeline, so every cycle stays
             * stoppable. `onSettle`, when given, is the timeline's settle hook.
             * @param {string} eventName
             * @param {(() => void)|null} onSettle
             * @returns {object} The compiled `Timeline`.
             * @throws {Error} `scene: disposed` after {@link Scene#dispose};
             *   `scene: unknown event "<name>"` for a name not in `spec.events`.
             * @private
             */
            _compile(eventName, onSettle) {
                if (this._disposed) throw new Error('scene: disposed');
                const eventSpec = this._events[eventName];
                if (!eventSpec) {
                    throw new Error(`scene: unknown event "${eventName}"`);
                }
                const items = eventSpec.animations.map((anim) => this._toTweenOptions(anim, eventSpec));
                const opts = {};
                if (eventSpec.loop) {
                    opts.onComplete = () => {
                        if (!this._disposed && !this._halted.has(eventName)) this.fire(eventName);
                    };
                }
                if (onSettle) opts.onSettle = onSettle;
                const tl = new Timeline(opts);
                const mode = eventSpec.mode || 'parallel';
                if (mode === 'sequence') {
                    tl.sequence(items);
                } else if (mode === 'stagger') {
                    tl.stagger(items, eventSpec.stepMs);
                } else {
                    tl.parallel(items);
                }
                return tl;
            }

            /**
             * Compile and play a named event. The scene tracks the timeline until
             * it settles, so {@link Scene#stop} and {@link Scene#dispose} reach it
             * (and every re-fired cycle of a loop). Firing an event clears a
             * previous {@link Scene#stop} of it: the loop runs again.
             * @param {string} eventName
             * @returns {object} The playing `Timeline`.
             * @throws {Error} `scene: unknown event "<name>"` when `eventName` is
             *   not in `spec.events`; `scene: disposed` after {@link Scene#dispose}.
             */
            fire(eventName) {
                if (this._disposed) throw new Error('scene: disposed');
                this._halted.delete(eventName);
                let set = this._fired.get(eventName);
                if (!set) {
                    set = new Set();
                    this._fired.set(eventName, set);
                }
                const live = set;
                /** @type {object} */
                let tl = null;
                tl = this._compile(eventName, () => live.delete(tl));
                live.add(tl);
                return tl.play();
            }

            /**
             * Stop a named event: end its loop and stop every timeline
             * {@link Scene#fire} started for it. Without a name, every event. A
             * timeline obtained from {@link Scene#on} stays the caller's to stop,
             * but its loop continuation obeys this stop too.
             * @param {string} [eventName]
             * @returns {void}
             */
            stop(eventName) {
                const names = eventName === undefined ? Object.keys(this._events) : [eventName];
                for (const name of names) {
                    this._halted.add(name);
                    const set = this._fired.get(name);
                    if (!set) continue;
                    // `stop()` fires each timeline's settle hook, which deletes it
                    // from the live set: iterate a snapshot.
                    for (const tl of [...set]) tl.stop();
                    set.clear();
                }
            }

            /**
             * Stop every event (see {@link Scene#stop}) and detach `root` from its
             * parent; the reference stays readable. Idempotent. Afterwards
             * {@link Scene#on} and {@link Scene#fire} throw `scene: disposed`.
             * @returns {void}
             */
            dispose() {
                if (this._disposed) return;
                this.stop();
                this._disposed = true;
                if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
            }
        }

        /**
         * Build a {@link Scene} from a `SceneSpec`.
         * @param {SceneSpec} spec
         * @returns {Scene}
         */
        function createScene(spec) {
            return new Scene(spec);
        }

        return { createScene };
    },
};
