// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.anim` — the whole-package aggregator: a single
 * capture-free fw module descriptor whose namespace is the frozen 14-module
 * `@awacloud/graphic-anim` core (`graphic.lerp` … `graphic.frames`, the plan-named
 * set — NOT the current 16-entry `graphicModules` registry, which also holds
 * the later `graphic.pageflip`/`graphic.hypertree` extensions).
 *
 * Ported from the packaging spike's draft with no changes to the descriptor
 * shape: every returned member
 * is a factory PARAMETER, so `factory.toString()` has zero free identifiers
 * and survives `ModuleRuntime.serialize()` / minification (Q4). Registered
 * topo-LAST in `graphicModules` (after `graphic.hypertree`) — a pure
 * registry addition, no new `dist/standalone` root (a packaging decision:
 * an aggregate standalone would duplicate the two existing surfaces and
 * cannot inline the DOM-bound members' fw deps without the fw-tools-P2
 * `fw_require` seam — see `docs/aggregator.md`).
 *
 * Type `fw.dom.graphic`: the aggregate transitively pulls DOM-bound members
 * (`svgApply`/`svgBuild`/`scene`/`frames`), so it is only PARTIALLY
 * Worker-safe, like `graphic.pageflip`/`graphic.hypertree`.
 *
 * @module graphic.anim
 */

import { lerpModule } from './math/scalar.js';
import { easingModule } from './math/easing.js';
import { unitsModule } from './math/units.js';
import { matrixModule } from './math/matrix.js';
import { colorModule } from './math/color.js';
import { scopedIdsModule } from './svg/scoped-ids.js';
import { interpolateModule } from './interpolate/index.js';
import { svgApplyModule } from './svg/apply.js';
import { svgBuildModule } from './svg/build.js';
import { schedulerModule } from './anim/scheduler.js';
import { tweenModule } from './anim/tween.js';
import { timelineModule } from './anim/timeline.js';
import { sceneModule } from './scene/scene.js';
import { framesModule } from './frames/frames.js';

/**
 * The frozen 14 core module names, in topo order (deps before dependents).
 * Exactly `graphicModules.slice(0, 14)` — the plan-named core, NOT the
 * current 16-entry registry (`pageflip`/`hypertree` are excluded by design).
 *
 * @type {string[]}
 */
export const AGGREGATE_NAMES = [
    'graphic.lerp',
    'graphic.easing',
    'graphic.units',
    'graphic.matrix',
    'graphic.color',
    'graphic.scopedIds',
    'graphic.interpolate',
    'graphic.svgApply',
    'graphic.svgBuild',
    'graphic.scheduler',
    'graphic.tween',
    'graphic.timeline',
    'graphic.scene',
    'graphic.frames',
];

/**
 * `graphic.anim` module descriptor — whole-package resolve of the frozen
 * 14-module core.
 *
 * Factory returns the 14-key namespace `{ lerp, easing, units, matrix,
 * color, scopedIds, interpolate, svgApply, svgBuild, scheduler, tween,
 * timeline, scene, frames }`, one entry per resolved dependency, by REFERENCE
 * (no re-instantiation — resolving `graphic.anim` yields the SAME instances
 * as resolving each of the 14 core modules individually, since fw's
 * `ModuleRuntime` memoizes per-name resolution).
 *
 * Capture-free by construction: every returned member is a factory
 * PARAMETER, so `factory.toString()` references no module-scope binding
 * (`fw/no-factory-capture` clean, verified by the package-local ESLint
 * config over `src/**\/*.js`).
 *
 * `deps.map(d => d.name) === dependencies` (same order), mirroring the
 * `deps`/`dependencies` pairing convention of the other 17 descriptors.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: import('@awacloud/fw/core/runtime.js').ModuleDefinition[], factory(lerp: object, easing: object, units: object, matrix: object, color: object, scopedIds: object, interpolate: object, svgApply: object, svgBuild: object, scheduler: object, tween: object, timeline: object, scene: object, frames: object): { lerp: object, easing: object, units: object, matrix: object, color: object, scopedIds: object, interpolate: object, svgApply: object, svgBuild: object, scheduler: object, tween: object, timeline: object, scene: object, frames: object } }}
 */
export const animAggregatorModule = {
    name: 'graphic.anim',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [
        'graphic.lerp',
        'graphic.easing',
        'graphic.units',
        'graphic.matrix',
        'graphic.color',
        'graphic.scopedIds',
        'graphic.interpolate',
        'graphic.svgApply',
        'graphic.svgBuild',
        'graphic.scheduler',
        'graphic.tween',
        'graphic.timeline',
        'graphic.scene',
        'graphic.frames',
    ],
    deps: [
        lerpModule,
        easingModule,
        unitsModule,
        matrixModule,
        colorModule,
        scopedIdsModule,
        interpolateModule,
        svgApplyModule,
        svgBuildModule,
        schedulerModule,
        tweenModule,
        timelineModule,
        sceneModule,
        framesModule,
    ],

    /**
     * Build the whole-package namespace from the fourteen resolved core
     * dependencies. Every parameter is re-exported as-is (by reference) —
     * the aggregator performs no work of its own.
     *
     * @param {object} lerp Resolved `graphic.lerp`.
     * @param {object} easing Resolved `graphic.easing`.
     * @param {object} units Resolved `graphic.units`.
     * @param {object} matrix Resolved `graphic.matrix`.
     * @param {object} color Resolved `graphic.color`.
     * @param {object} scopedIds Resolved `graphic.scopedIds`.
     * @param {object} interpolate Resolved `graphic.interpolate`.
     * @param {object} svgApply Resolved `graphic.svgApply`.
     * @param {object} svgBuild Resolved `graphic.svgBuild`.
     * @param {object} scheduler Resolved `graphic.scheduler`.
     * @param {object} tween Resolved `graphic.tween`.
     * @param {object} timeline Resolved `graphic.timeline`.
     * @param {object} scene Resolved `graphic.scene`.
     * @param {object} frames Resolved `graphic.frames`.
     * @returns {{ lerp: object, easing: object, units: object, matrix: object, color: object, scopedIds: object, interpolate: object, svgApply: object, svgBuild: object, scheduler: object, tween: object, timeline: object, scene: object, frames: object }}
     */
    factory(
        lerp, easing, units, matrix, color, scopedIds, interpolate,
        svgApply, svgBuild, scheduler, tween, timeline, scene, frames,
    ) {
        return {
            lerp, easing, units, matrix, color, scopedIds, interpolate,
            svgApply, svgBuild, scheduler, tween, timeline, scene, frames,
        };
    },
};
