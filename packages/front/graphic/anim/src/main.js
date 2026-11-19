// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `@awacloud/graphic-anim` — public entry point.
 *
 * This file serves two roles:
 *
 *   1. **Generator contract** (`fw_require`, `modules`, `extras`, `bundle`) —
 *      consumed by `@awacloud/tool-prebuild-generator` to produce `dist/build/` and
 *      `dist/standalone/` bundles. The shape mirrors `@awacloud/ooxml`'s `src/main.js`.
 *
 *   2. **fw-mode barrel** — re-exports `graphicModules` (the canonical
 *      registration array), each individual descriptor const, and the two
 *      constructible helpers `createPageflip`/`createHypertree`. fw's
 *      `secPolicy`/`dom` are not re-exported: they only sit in `fw_require`,
 *      and `registerAllDeep(graphicModules)` pulls them through `deps`.
 *
 * No code runs at import — this file contains only re-exports and plain-object
 * literals. `sideEffects: false` in `package.json` is accurate.
 *
 * @module @awacloud/graphic-anim
 */

// ── fw dependencies (inlined by standalone generator, injected by fw DI) ─────
//
// secPolicy and dom are the fw closure that DOM-bound bundles inline; interp,
// easing and clock are the fw `io` modules graphic.lerp, graphic.easing and
// graphic.scheduler are built on (pure, DOM-free).
// They are NOT graphic module descriptors — they live in fw_require, not modules.
// dom depends on secPolicy; registerAllDeep(graphicModules) pulls both automatically
// because graphic.svgApply has deps:[dom] and dom has deps:[secPolicy].

import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';
import { dom }       from '@awacloud/fw/dom/query/dom.js';
import { interp }    from '@awacloud/fw/io/math/interp.js';
import { easing }    from '@awacloud/fw/io/calc/easing.js';
import { clock }     from '@awacloud/fw/io/timing/clock.js';

// ── Graphic module descriptor imports (the 18 of `graphicModules`) ─────────────

import { lerpModule }         from './math/scalar.js';
import { easingModule }       from './math/easing.js';
import { unitsModule }        from './math/units.js';
import { matrixModule }       from './math/matrix.js';
import { colorModule }        from './math/color.js';
import { scopedIdsModule }    from './svg/scoped-ids.js';
import { interpolateModule }  from './interpolate/index.js';
import { svgApplyModule }     from './svg/apply.js';
import { svgBuildModule }     from './svg/build.js';
import { schedulerModule }    from './anim/scheduler.js';
import { tweenModule }        from './anim/tween.js';
import { timelineModule }     from './anim/timeline.js';
import { sceneModule }        from './scene/scene.js';
import { framesModule }       from './frames/frames.js';
import { pageflipModule }     from './pageflip/pageflip.js';
import { hypertreeModule }    from './hypertree/hypertree.js';
import { animAggregatorModule } from './aggregator.js';
import { svg3dModule }        from './svg3d/svg3d.js';

// ── graphicModules — canonical registration order (deps before dependents) ───

/**
 * All eighteen graphic module descriptors in topological registration order.
 *
 * Pass to `new ModuleRuntime().registerAllDeep(graphicModules)`: the `deps`
 * reference on `svgApplyModule` causes `dom` and its transitive dependency
 * `secPolicy` to be pulled and registered automatically.
 *
 * The order of the original ten is frozen (see `docs/CONTRACT.md`); the scene
 * layer extends it as a strict superset without reordering the frozen ten:
 * `graphic.scopedIds` (pure Worker-safe leaf), `graphic.svgBuild` (after
 * `svgApply`, its write-path dep) and `graphic.scene` (topo-last, depends on
 * svgBuild/scopedIds/timeline/tween/scheduler). P2 appends `graphic.frames`
 * topo-last (a frame-sequence primitive on scheduler + svgApply), then
 * `graphic.pageflip` topo-last (the page-turn book on svgBuild/scopedIds/
 * timeline/tween/svgApply; its pure `pageflip.fold`/`pageflip.compose` kernels
 * are injected via DI, not registry members). Finally `graphic.hypertree` is
 * appended topo-last (a radial/hyperbolic tree on svgBuild/scopedIds/timeline/
 * tween/svgApply/scheduler; its pure `hypertree.layout`/`hypertree.measure`
 * kernels are injected via DI, not registry members). `graphic.anim` is
 * appended topo-last: the whole-package aggregator whose namespace is the frozen 14-module core (`graphic.lerp` …
 * `graphic.frames`) — a pure registry addition, no new `dist/standalone` root
 * (see `docs/aggregator.md`). Last, `graphic.svg3d` is appended topo-last: the
 * software-3D terrain viewer on svgBuild/
 * scopedIds/timeline/tween/svgApply/scheduler; its pure `svg3d.vec3`/
 * `svg3d.mesh`/`svg3d.project` kernels and its DOM `svg3d.apply` rig-builder
 * are injected via DI, not registry members. None of pageflip, hypertree,
 * svg3d or the aggregator has an entry in this file's `bundle` export; the
 * bundle driver (`tools/generate-bundles.mjs`) gives the three extensions
 * their own `dist/standalone` and `dist/build` roots, and the aggregator its
 * `dist/build` pair.
 *
 * @type {import('@awacloud/fw/core/runtime.js').ModuleDefinition[]}
 */
export const graphicModules = [
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
    pageflipModule,
    hypertreeModule,
    animAggregatorModule,
    svg3dModule,
];

// ── Generator contract ────────────────────────────────────────────────────────
//
// Consumed by `@awacloud/tool-prebuild-generator` via:
//
//   import * as packageMain from '@awacloud/graphic-anim';
//   generatePrebuilds({ packageMain, outDir, packageLabel: 'graphic-anim' });
//
// Field semantics (mirroring @awacloud/ooxml/src/main.js):
//
//   fw_require  — fw factory descriptors to inline (standalone) or inject (package).
//                 secPolicy first (dom's dep), dom (svgApply's dep), then the
//                 io modules interp, easing and clock (no dependency).
//   modules     — core local descriptors in topo order.
//   extras      — opt-in extras (none for this package).
//   bundle      — one bare-core Bundle descriptor per public resolution root.
//                 `dependencies[0]` = the core name; no extras (they are empty).
//                 Name MUST end in `Bundle` (generator contract, index.mjs:13).

/**
 * fw factory descriptors inlined into standalone bundles (or injected by DI
 * in the package variant). secPolicy precedes dom because dom depends on it;
 * the three `io` modules have no dependency.
 *
 * @type {import('@awacloud/fw/core/runtime.js').ModuleDefinition[]}
 */
export const fw_require = [secPolicy, dom, interp, easing, clock];

/**
 * Core graphic module descriptors — same reference as `graphicModules`.
 * Named `modules` to match the `@awacloud/tool-prebuild-generator` input contract.
 *
 * @type {import('@awacloud/fw/core/runtime.js').ModuleDefinition[]}
 */
export const modules = graphicModules;

/**
 * Opt-in extra descriptors. Empty; reserved for later use.
 *
 * @type {import('@awacloud/fw/core/runtime.js').ModuleDefinition[]}
 */
export const extras = [];

/**
 * Bundle descriptors — one bare-core entry per public resolution root.
 *
 * Each entry has a single dependency (the core module name) and a trivial
 * pass-through factory because there are no extras to layer on top.
 *
 * The generator derives the output file id by stripping the `Bundle` suffix
 * and applying kebab-case (`graphic.timelineBundle` → `graphic-timeline`).
 * The bundle driver (`tools/generate-bundles.mjs`) asks it for the
 * `bundled` variant only, so each entry writes one file:
 *
 *   dist/standalone/graphic-timeline-bundled.js — every reachable fw and
 *   local factory inlined (`dependencies: []`)
 *
 * Registration order here matches the topological order so the generator's
 * `seenCores` pass always encounters the leaf cores first.
 *
 * @type {{ name: string, dependencies: string[], factory: Function }[]}
 */
export const bundle = [
    // Pure-math leaves (Worker-safe) — no fw inlining needed for pure-leaf bundles.
    { name: 'graphic.lerpBundle',        dependencies: ['graphic.lerp'],        factory(m) { return m; } },
    { name: 'graphic.easingBundle',      dependencies: ['graphic.easing'],      factory(m) { return m; } },
    { name: 'graphic.unitsBundle',       dependencies: ['graphic.units'],       factory(m) { return m; } },
    { name: 'graphic.matrixBundle',      dependencies: ['graphic.matrix'],      factory(m) { return m; } },
    { name: 'graphic.colorBundle',       dependencies: ['graphic.color'],       factory(m) { return m; } },
    { name: 'graphic.scopedIdsBundle',   dependencies: ['graphic.scopedIds'],   factory(m) { return m; } },
    { name: 'graphic.interpolateBundle', dependencies: ['graphic.interpolate'], factory(m) { return m; } },
    // DOM-bound roots (main-thread, inline secPolicy+dom in standalone).
    { name: 'graphic.svgApplyBundle',    dependencies: ['graphic.svgApply'],    factory(m) { return m; } },
    { name: 'graphic.svgBuildBundle',    dependencies: ['graphic.svgBuild'],    factory(m) { return m; } },
    { name: 'graphic.schedulerBundle',   dependencies: ['graphic.scheduler'],   factory(m) { return m; } },
    { name: 'graphic.tweenBundle',       dependencies: ['graphic.tween'],       factory(m) { return m; } },
    // Full pipeline — the canonical "graphic.timeline" bundle (all deps inline).
    { name: 'graphic.timelineBundle',    dependencies: ['graphic.timeline'],    factory(m) { return m; } },
    // Scene/event DSL — topo-last DOM-bound root (all deps inline in standalone).
    { name: 'graphic.sceneBundle',       dependencies: ['graphic.scene'],       factory(m) { return m; } },
    // Frame-sequence primitive — DOM-bound root (inlines scheduler + svgApply chain).
    { name: 'graphic.framesBundle',      dependencies: ['graphic.frames'],      factory(m) { return m; } },
];

// ── fw-mode barrel — individual descriptor re-exports ────────────────────────
//
// Named re-exports allow selective imports:
//   import { lerpModule, easingModule } from '@awacloud/graphic-anim';

export {
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
    pageflipModule,
    hypertreeModule,
    animAggregatorModule,
    svg3dModule,
};

// ── Constructible helpers ──
//
// Additive re-exports of the two hand-wiring-free constructors. They are plain
// helpers, NOT module descriptors: absent from `graphicModules`/`modules`, from
// `AGGREGATE_NAMES` and from every `bundle` entry, so no generated artifact
// inlines them. Both are DOM-bound by design, so the kernel-only Worker-safety
// objection that keeps the pure kernels off this barrel does not apply — they
// ship on the root subpath and are deliberately NOT advertised under
// `./kernels/*` (that subpath carries the extension modules' kernels: seven
// pure and Worker-safe, plus the DOM-bound svg3d rig builder `svg3d.apply`).

export { createPageflip } from './pageflip/create.js';
export { createHypertree } from './hypertree/create.js';
