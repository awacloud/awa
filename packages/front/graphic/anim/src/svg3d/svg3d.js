// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.svg3d` — a software-3D **terrain** viewer built on the
 * frozen graphic engine, as a capture-free fw module descriptor. Productized
 * from a measured de-risking spike.
 *
 * A {@link Svg3d} instance decodes a heightmap (via `svg3d.mesh`'s Canvas-free
 * contract), builds a static grid mesh with build-time precompute, then
 * projects and paints it every frame through one of two DOM strategies
 * (a measured decision):
 *
 *  - **default** — the bucketed path-`d` rewrite ({@link module:svg3d.apply}
 *    `createPathRig`), `buckets: 16` by default (opt up for shading fidelity —
 *    measured near-free: 1 vs 16 buckets is +4 % ms/frame). Default ceiling
 *    **8 192 triangles** (a measured decision, `maxTriangles` overridable up
 *    to the measured hard ceiling **~51 200** — going further is unmeasured
 *    territory and throws).
 *  - **opt-in** `mode: 'polygons'` — one `<polygon>` per face, restricted to
 *    **≤ 2 048 triangles** (throws above): 3.75×–5× more expensive per the
 *    spike, retained only for call sites that genuinely need per-face DOM
 *    identity.
 *
 * Construction goes through `graphic.svgBuild` + a FRESH `graphic.scopedIds`
 * scope with a DISTINCT per-instance prefix (so two terrains never collide —
 * (the per-instance id prefix rule); every attribute write routes
 * through `graphic.svgApply.svgAttr` (fw `parser` has no SVG namespace, so raw
 * `setAttribute` is never used).
 *
 * **Rotation rides the frozen engine**: a
 * `graphic.timeline` composes two `graphic.tween`s writing `camera.ry`
 * (yaw) / `camera.rx` (pitch); the timeline registers as ONE tickable, and a
 * SEPARATE render tickable is added to the SAME scheduler immediately AFTER
 * it — so within one tick the camera is fully updated (both angles) before
 * the frame is projected and painted. There is no second `requestAnimationFrame`
 * loop. `opts.scheduler` threads a manual clock through every test; the shared
 * production singleton (`graphic.scheduler`) is the default and is never
 * leaked into by a stray unscheduled instance.
 *
 * Colours come exclusively from the task-01 build-time LUT
 * (`mesh.colorLut`/`mesh.baseQ`/`mesh.shadeLevels`) — no colour string is ever
 * built per frame.
 *
 * **Triangles nearer than `camera.near` DROP whole** — see `svg3d.project`'s module header.
 * **Face colours** (opt-in `faceColors`, path mode) keep each face's altitude
 * colour, water and shading (`svg3d.apply`). **Pointer look** (opt-in `events`,
 * the resolved fw `dom/query/events` module): the legacy drag-to-look — a press
 * pauses the orbit, and a drag turns the camera by the drag distance (yaw from
 * x, pitch from y, clamped to ±π/2); `play()` resumes the orbit.
 * Near-plane clipping, texture/marker overlays,
 * multi-mesh scenes and a general 3D scene graph are explicit non-goals of
 * this build; so is any Canvas dependency (the heightmap arrives already
 * decoded — `svg3d.mesh`'s Canvas-free contract, a measured decision).
 *
 * **Worker-safe: NO** (this DOM/engine composition layer). The three pure
 * `svg3d.*` kernels it is built on (`vec3`, `mesh`, `project`) stay Worker-safe
 * by construction and are DI-injected, never captured.
 *
 * @module graphic.svg3d
 */

import { svg3dVec3Module } from './vec3.js';
import { svg3dMeshModule } from './mesh.js';
import { svg3dProjectModule } from './project.js';
import { svg3dApplyModule } from './apply.js';
import { svgBuildModule } from '../svg/build.js';
import { scopedIdsModule } from '../svg/scoped-ids.js';
import { timelineModule } from '../anim/timeline.js';
import { tweenModule } from '../anim/tween.js';
import { svgApplyModule } from '../svg/apply.js';
import { schedulerModule } from '../anim/scheduler.js';

/**
 * @typedef {Object} Svg3dOptions
 * @property {'path'|'polygons'} [mode='path'] DOM strategy. `'polygons'` is
 *   restricted to `<= 2048` triangles (throws above); `'path'` (default) is
 *   guarded at `maxTriangles` (default 8192, overridable up to ~51200).
 * @property {number} [maxTriangles] Path-mode ceiling override; throws if it
 *   exceeds the measured hard ceiling (~51200) or if the mesh exceeds it.
 * @property {number} [buckets=16] Path-mode bucket count (shading fidelity).
 * @property {boolean|{base?:number, shade?:number}} [faceColors=false] Path mode:
 *   per-face colour classes (altitude classes + water, × shade classes) instead
 *   of the slice-mean colour; `true` is `{ base: 6, shade: 6 }`.
 * @property {{ scope: Function }} [events] The resolved fw `dom/query/events`
 *   module: enables the pointer look (drag to turn the camera).
 * @property {number} [spacing] World spacing between adjacent grid samples
 *   (forwarded to `svg3d.mesh.buildGridMesh`).
 * @property {number} [heightScale] World height of a normalised sample of `1`
 *   (forwarded to `svg3d.mesh.buildGridMesh`).
 * @property {number} [width=1280] Viewport / SVG width (px).
 * @property {number} [height=800] Viewport / SVG height (px).
 * @property {object} [camera] Partial camera override merged over the spike's
 *   default (`rx=0.55`, `y=-900`, `depth=900`) via `svg3d.project.createCamera`.
 * @property {number} [duration=4000] Milliseconds for one full orbit cycle.
 * @property {number} [yawTurns=1] Yaw revolutions per cycle.
 * @property {number} [pitchSpan=0] Pitch delta (radians) per cycle; `0` keeps
 *   the pitch fixed at its starting value while still driving a (degenerate)
 *   second tween (the rotation rides the frozen engine).
 * @property {boolean} [loop=true] Whether a completed orbit cycle
 *   automatically starts the next one (continuing from the current angle).
 * @property {string} [prefix] Id-scope prefix; defaults to a DISTINCT
 *   per-instance `svg3d-<n>` value (the per-instance id prefix rule).
 * @property {object} [scheduler] Override the shared scheduler (tests / isolation).
 */

/**
 * `graphic.svg3d` module descriptor.
 *
 * Factory returns `{ Svg3d, createTerrain }`:
 * - `Svg3d` — the terrain-viewer class (builds the subtree, drives the orbit).
 * - `createTerrain` — convenience that builds a {@link Svg3d}.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [typeof svg3dVec3Module, typeof svg3dMeshModule, typeof svg3dProjectModule, typeof svg3dApplyModule, typeof svgBuildModule, typeof scopedIdsModule, typeof timelineModule, typeof tweenModule, typeof svgApplyModule, typeof schedulerModule], factory(vec3Api: object, meshApi: object, projectApi: object, applyApi: object, svgBuild: object, scopedIds: object, timelineMod: object, tweenMod: object, svgApply: object, schedulerMod: object): { Svg3d: Function, createTerrain: Function } }}
 */
export const svg3dModule = {
    name: 'graphic.svg3d',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [
        'svg3d.vec3',
        'svg3d.mesh',
        'svg3d.project',
        'svg3d.apply',
        'graphic.svgBuild',
        'graphic.scopedIds',
        'graphic.timeline',
        'graphic.tween',
        'graphic.svgApply',
        'graphic.scheduler',
    ],
    deps: [
        svg3dVec3Module,
        svg3dMeshModule,
        svg3dProjectModule,
        svg3dApplyModule,
        svgBuildModule,
        scopedIdsModule,
        timelineModule,
        tweenModule,
        svgApplyModule,
        schedulerModule,
    ],

    /**
     * Build the svg3d surface from the ten resolved dependencies. All wiring
     * is via parameters — the factory body never references a module-scope
     * binding. `vec3Api` is resolved (per the prescribed dependency tuple) but
     * not called directly here: rotation and projection route entirely through
     * `svg3d.project`, which already carries `svg3d.vec3` as its own DI dep.
     * `applyApi` (`svg3d.apply`) is the DOM rig-builder sibling kernel, injected
     * for the same capture-free reason `pageflip.fold`/`pageflip.compose` are
     * injected into `graphic.pageflip`.
     *
     * @param {{ dot3: Function, cross3: Function, length3: Function, rotationMatrix3: Function, applyMatrix3: Function }} vec3Api Resolved `svg3d.vec3`.
     * @param {{ decodeHeightmap: Function, buildGridMesh: Function }} meshApi Resolved `svg3d.mesh`.
     * @param {{ createCamera: Function, createFrameBuffers: Function, projectFrame: Function }} projectApi Resolved `svg3d.project`.
     * @param {{ createPolygonRig: Function, createPathRig: Function }} applyApi Resolved `svg3d.apply`.
     * @param {{ build: Function, SVG_TAGS: Set<string> }} svgBuild Resolved `graphic.svgBuild`.
     * @param {{ createScope: Function }} scopedIds Resolved `graphic.scopedIds`.
     * @param {{ Timeline: Function }} timelineMod Resolved `graphic.timeline`.
     * @param {{ Tween: Function, tween: Function }} tweenMod Resolved `graphic.tween`.
     * @param {{ SVG_NS: string, svgAttr: Function }} svgApply Resolved `graphic.svgApply`.
     * @param {{ Scheduler: Function, scheduler: object }} schedulerMod Resolved `graphic.scheduler`.
     * @returns {{ Svg3d: Function, createTerrain: Function }}
     */
    factory(vec3Api, meshApi, projectApi, applyApi, svgBuild, scopedIds, timelineMod, tweenMod, svgApply, schedulerMod) {
        const { Timeline } = timelineMod;
        const { Tween } = tweenMod;

        /** Path-mode default ceiling (a measured decision, recommended). */
        const DEFAULT_PATH_CEILING = 8192;
        /** Path-mode hard ceiling (measured). Above this
         *  is unmeasured territory — `maxTriangles` cannot override past it. */
        const HARD_PATH_CEILING = 51200;
        /** Polygon-mode fixed ceiling (a measured decision); not overridable. */
        const POLYGON_CEILING = 2048;
        /** Default path-mode bucket count. */
        const DEFAULT_BUCKETS = 16;
        /** Default viewport size (matches `svg3d.project.createCamera`'s own default). */
        const DEFAULT_WIDTH = 1280;
        const DEFAULT_HEIGHT = 800;
        /** Default orbit cycle duration, ms. */
        const DEFAULT_DURATION = 4000;
        const DEFAULT_YAW_TURNS = 1;
        const DEFAULT_PITCH_SPAN = 0;

        /**
         * Per-factory monotonic counter minting DISTINCT default prefixes so two
         * terrains built without an explicit `prefix` never mint colliding ids
         * (the per-instance id prefix rule). Defined in-factory (capture-free).
         * @type {number}
         */
        let _instanceSeq = 0;

        /**
         * A software-3D terrain viewer: a built SVG subtree + an orbiting camera
         * projected every frame onto one of the two DOM strategies.
         */
        class Svg3d {
            /**
             * @param {object} [host] Optional SVG/DOM container; when provided
             *   (and it exposes `appendChild`) `this.node` is appended into it
             *   immediately. When omitted the caller attaches `.node` itself.
             * @param {object} heightmap One of `svg3d.mesh`'s two accepted
             *   heightmap shapes (`{ side, heights }` or `{ data, width, height }`).
             * @param {Svg3dOptions} [opts]
             * @throws {TypeError} Propagated from `decodeHeightmap` on a malformed heightmap.
             * @throws {Error} `graphic.svg3d: …` when the mesh exceeds the active mode's ceiling.
             */
            constructor(host, heightmap, opts) {
                const o = opts || {};

                const decoded = meshApi.decodeHeightmap(heightmap);
                const cells = decoded.side - 1;
                if (!Number.isInteger(cells) || cells < 1) {
                    throw new Error(`graphic.svg3d: heightmap side ${decoded.side} is too small (needs >= 2)`);
                }
                const triangleCount = 2 * cells * cells;

                /** @type {'path'|'polygons'} */
                this.mode = o.mode === 'polygons' ? 'polygons' : 'path';

                if (this.mode === 'polygons') {
                    if (triangleCount > POLYGON_CEILING) {
                        throw new Error(
                            `graphic.svg3d: mode:'polygons' supports at most ${POLYGON_CEILING} `
                            + `triangles, got ${triangleCount} — use the default path mode instead`,
                        );
                    }
                } else {
                    const ceiling = o.maxTriangles === undefined ? DEFAULT_PATH_CEILING : o.maxTriangles;
                    if (ceiling > HARD_PATH_CEILING) {
                        throw new Error(
                            `graphic.svg3d: maxTriangles ${ceiling} exceeds the measured hard ceiling `
                            + `${HARD_PATH_CEILING} (unmeasured territory)`,
                        );
                    }
                    if (triangleCount > ceiling) {
                        throw new Error(
                            `graphic.svg3d: mesh has ${triangleCount} triangles, exceeds the `
                            + `${ceiling}-triangle ceiling (path mode; override via maxTriangles up to ${HARD_PATH_CEILING})`,
                        );
                    }
                }

                /** @type {object} The static precomputed mesh. */
                this.mesh = meshApi.buildGridMesh({
                    cells,
                    heights: decoded.heights,
                    spacing: o.spacing,
                    heightScale: o.heightScale,
                });

                const width = o.width > 0 ? o.width : DEFAULT_WIDTH;
                const height = o.height > 0 ? o.height : DEFAULT_HEIGHT;

                /** @type {object} The live camera state, mutated in place by the orbit tweens. */
                this.camera = projectApi.createCamera(Object.assign({ width, height }, o.camera));
                /** @type {object} Reusable per-frame projection buffers (allocated once). */
                this._buf = projectApi.createFrameBuffers(this.mesh);

                /** @type {string} DISTINCT per-instance prefix (never a shared constant). */
                this.prefix = o.prefix || `svg3d-${_instanceSeq++}`;
                /** @type {object} Fresh, isolated id scope. */
                this._scope = scopedIds.createScope(this.prefix);

                const rigOpts = {
                    svgBuild, svgApply, mesh: this.mesh, width, height, idScope: this._scope,
                };
                this._rig = this.mode === 'polygons'
                    ? applyApi.createPolygonRig(rigOpts)
                    : applyApi.createPathRig(Object.assign(rigOpts, {
                        buckets: o.buckets > 0 ? o.buckets : DEFAULT_BUCKETS,
                        faceColors: o.faceColors || false,
                    }));

                /** @type {SVGElement} The built root, appended into `host` when provided. */
                this.node = this._rig.root;
                if (host && typeof host.appendChild === 'function') host.appendChild(this.node);

                /** @type {object} The scheduler this instance drives (injected or shared). */
                this._scheduler = o.scheduler || schedulerMod.scheduler;
                this._duration = o.duration > 0 ? o.duration : DEFAULT_DURATION;
                this._yawTurns = o.yawTurns === undefined ? DEFAULT_YAW_TURNS : o.yawTurns;
                this._pitchSpan = o.pitchSpan === undefined ? DEFAULT_PITCH_SPAN : o.pitchSpan;
                this._loop = o.loop !== false;

                /** @type {object|null} The in-flight orbit `Timeline`, or `null` when paused/idle. */
                this._timeline = null;
                /** @type {boolean} */
                this._playing = false;
                /** @type {boolean} */
                this._disposed = false;

                // The render step: a SECOND tickable, added to the scheduler
                // immediately AFTER the timeline on every (re)start, so within
                // one tick both camera angles are updated before the frame is
                // projected and painted (structural finding 4). Defined once so
                // dispose()/pause() can remove the SAME reference.
                this._renderTickable = { _step: () => this._render() };

                /** @type {object|null} The fw `events` scope of the pointer look. */
                this._pointerScope = null;
                /** @type {{x:number,y:number,ry:number,rx:number}|null} The drag in progress. */
                this._drag = null;
                if (o.events && typeof o.events.scope === 'function') this._bindPointer(o.events, width, height);

                // Render the initial (rest) pose immediately.
                this._render();
            }

            /**
             * Bind the pointer look (the legacy drag-to-look) through a fresh fw
             * `events` scope on the built node: a press pauses the orbit; a move
             * with the press held sets `ry = ry₀ + (x₀ − x) / width · π` and
             * `rx = clamp(rx₀ − (y₀ − y) / height · π/2, −π/2, π/2)` — by the drag
             * distance, never accumulated per event — and renders.
             * @param {{ scope: Function }} events
             * @param {number} width
             * @param {number} height
             * @private
             */
            _bindPointer(events, width, height) {
                const scope = events.scope(`${this.prefix}-look`);
                const half = Math.PI / 2;
                // The whole viewport takes the press, sky included: an inner <svg>
                // only hit-tests painted content, so a transparent rect goes
                // behind the faces (the legacy page listened on the window).
                const hit = svgBuild.build({
                    tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: 'transparent' },
                });
                this.node.insertBefore(hit, this.node.firstChild);
                scope.on('down', this.node, 'pointerdown', (e) => {
                    if (this._disposed) return;
                    this.pause();
                    this._drag = { x: e.clientX, y: e.clientY, ry: this.camera.ry, rx: this.camera.rx };
                    e.preventDefault();
                    try { this.node.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
                });
                scope.on('move', this.node, 'pointermove', (e) => {
                    const d = this._drag;
                    if (this._disposed || !d) return;
                    this.camera.ry = d.ry + ((d.x - e.clientX) / width) * Math.PI;
                    const rx = d.rx - ((d.y - e.clientY) / height) * half;
                    this.camera.rx = rx > half ? half : (rx < -half ? -half : rx);
                    this._render();
                });
                const end = () => { this._drag = null; };
                scope.on('up', this.node, 'pointerup', end);
                scope.on('cancel', this.node, 'pointercancel', end);
                this._pointerScope = scope;
            }

            /**
             * Project the current camera + mesh and paint one frame through the
             * active rig. The sole per-tick DOM write path.
             * @private
             */
            _render() {
                const count = projectApi.projectFrame(this.mesh, this.camera, this._buf);
                this._rig.update(this._buf, count);
            }

            /**
             * Start (or restart) one orbit cycle from the camera's CURRENT angle:
             * a `Timeline` composing two `Tween`s writing `camera.ry`/`camera.rx`,
             * registered on the scheduler, followed by the render tickable
             * re-added AFTER it (removed first so re-adding always lands last —
             * `Set` insertion order is preserved across `add`/`remove`, not
             * refreshed by a redundant `add` on an already-present member).
             * @private
             */
            _startCycle() {
                const startRy = this.camera.ry;
                const startRx = this.camera.rx;

                const tl = new Timeline({
                    scheduler: this._scheduler,
                    onComplete: () => {
                        this._timeline = null;
                        if (this._loop && this._playing && !this._disposed) {
                            this._startCycle();
                        } else {
                            // No further cycle: unregister the render tickable
                            // too, so a non-looping orbit leaves the scheduler
                            // clean (self-stopping) rather than rendering an
                            // unchanging camera on every future tick forever.
                            this._playing = false;
                            this._scheduler.remove(this._renderTickable);
                        }
                    },
                });
                tl.add(new Tween({
                    target: this.camera,
                    property: 'ry',
                    from: startRy,
                    to: startRy + Math.PI * 2 * this._yawTurns,
                    duration: this._duration,
                    easing: 'linear',
                    scheduler: this._scheduler,
                    apply: (v, target) => { target.ry = Number(v); },
                }), 0);
                tl.add(new Tween({
                    target: this.camera,
                    property: 'rx',
                    from: startRx,
                    to: startRx + this._pitchSpan,
                    duration: this._duration,
                    easing: 'linear',
                    scheduler: this._scheduler,
                    apply: (v, target) => { target.rx = Number(v); },
                }), 0);

                this._timeline = tl;
                tl.play();

                // Re-add the render tickable AFTER the timeline every cycle.
                this._scheduler.remove(this._renderTickable);
                this._scheduler.add(this._renderTickable);
            }

            /**
             * Start (or resume) the orbit from the camera's current angle.
             * No-op when already playing or disposed.
             * @returns {this}
             */
            play() {
                if (this._disposed || this._playing) return this;
                this._playing = true;
                this._startCycle();
                return this;
            }

            /**
             * Pause the orbit: unregisters the in-flight timeline AND the render
             * tickable from the scheduler, leaving the camera at its current
             * angle. No-op when not playing or disposed.
             * @returns {this}
             */
            pause() {
                if (this._disposed || !this._playing) return this;
                this._playing = false;
                if (this._timeline) {
                    this._scheduler.remove(this._timeline);
                    this._timeline = null;
                }
                this._scheduler.remove(this._renderTickable);
                return this;
            }

            /**
             * Scrub to an absolute elapsed position (ms) within the (looping)
             * orbit cycle, bypassing the scheduler entirely: sets `camera.ry`/
             * `camera.rx` from a LINEAR fraction of `ms` (mod `duration`) and
             * renders immediately. Deliberately linear regardless of any
             * `Tween` easing configured for `play()` — scrubbing is inherently a
             * direct time-to-position mapping. Does not itself start or stop the
             * scheduler-driven orbit; call `play()` afterward to keep orbiting
             * from the new angle.
             * @param {number} ms Elapsed milliseconds into the cycle (may be
             *   negative or exceed `duration`; wrapped into `[0, duration)`).
             * @returns {this}
             */
            seek(ms) {
                if (this._disposed) return this;
                // The rest pose (t=0 reference) is captured on the FIRST seek —
                // whatever angle the camera held at that moment — so repeated
                // seeks are relative to a stable anchor rather than drifting.
                if (this._restRy === undefined) {
                    this._restRy = this.camera.ry;
                    this._restRx = this.camera.rx;
                }
                const duration = this._duration;
                const wrapped = ((ms % duration) + duration) % duration;
                const frac = wrapped / duration;
                this.camera.ry = this._restRy + Math.PI * 2 * this._yawTurns * frac;
                this.camera.rx = this._restRx + this._pitchSpan * frac;
                this._render();
                return this;
            }

            /**
             * Merge a partial camera override into the live camera state and
             * re-render immediately. No-op when disposed.
             * @param {object} partial Partial `Camera` fields to assign.
             * @returns {this}
             */
            setCamera(partial) {
                if (this._disposed) return this;
                Object.assign(this.camera, partial || {});
                this._render();
                return this;
            }

            /**
             * Unregister the in-flight timeline and the render tickable from the
             * scheduler, leaving it clean (no leaked tickables), unbind the pointer
             * look, and detach `node` from the host it was appended to (the
             * reference stays readable). Idempotent.
             */
            dispose() {
                if (this._disposed) return;
                if (this._pointerScope) this._pointerScope.clear();
                this._pointerScope = null;
                this._drag = null;
                if (this._timeline) this._scheduler.remove(this._timeline);
                this._scheduler.remove(this._renderTickable);
                this._playing = false;
                this._disposed = true;
                // Detach what the constructor appended; `this.node` stays readable.
                if (this.node && this.node.parentNode) this.node.parentNode.removeChild(this.node);
            }
        }

        /**
         * Build a {@link Svg3d} terrain viewer.
         * @param {object} [host] Optional SVG/DOM container to append into.
         * @param {object} heightmap One of `svg3d.mesh`'s two accepted heightmap shapes.
         * @param {Svg3dOptions} [opts]
         * @returns {Svg3d}
         */
        function createTerrain(host, heightmap, opts) {
            return new Svg3d(host, heightmap, opts);
        }

        return { Svg3d, createTerrain };
    },
};
