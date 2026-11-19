// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/engine/main.js
//
// Engine demo — tween + timeline + stagger on real <svg> shapes, driven
// entirely through the `graphic.anim` aggregate surface handed over by
// `../_boot.js` (`anim.svgBuild`, `anim.tween`, `anim.timeline`,
// `anim.scheduler`). No bundler, no `src/` import: every capability comes
// from the resolved `anim` object passed into `run()`.
//
// Demo-entry contract (frozen by `demos/_boot.js`):
//   export async function run({ mount, anim, variant }) => { dispose() }

/**
 * @typedef {Object} RunArgs
 * @property {SVGElement} mount Mount point — an `<svg>` element the demo
 *   appends its own shapes into. Never queried by id/selector.
 * @property {object} anim The resolved `graphic.anim` aggregate surface:
 *   `{ svgBuild: { build, SVG_TAGS }, tween: { Tween, tween },
 *   timeline: { Timeline }, scheduler: { Scheduler, scheduler }, ... }`.
 * @property {'standalone'|'fw'} variant Which surface booted `anim`
 *   (unused by the demo itself — both variants expose the same API).
 */

/**
 * Run the engine demo: build a handful of real SVG shapes, then demonstrate
 * three `graphic.anim` capabilities on them —
 *
 * 1. a single tween animating one shape's position AND color, eased;
 * 2. a `Timeline#sequence` chaining three tweens back-to-back;
 * 3. a `Timeline#stagger` driving a group of tweens with a per-element
 *    delay from ONE timeline.
 *
 * Every shape is bound BY REFERENCE at build time (the object returned by
 * `svgBuild.build`) — no per-tick `getElementById`/selector lookup, per the
 * standing perf rule. `run` is idempotent per fresh `mount`: it only ever
 * appends children it just built.
 *
 * @param {RunArgs} args
 * @returns {Promise<{ dispose(): void }>}
 */
export async function run({ mount, anim }) {
    const { build } = anim.svgBuild;
    const { tween } = anim.tween;
    const { Timeline } = anim.timeline;
    const { scheduler } = anim.scheduler;

    /**
     * Every playing tween/timeline handed back by `tween()`/`Timeline#play`
     * — reference-bound once, disposed together via the shared scheduler.
     * @type {Array<{ done?: boolean }>}
     */
    const active = [];

    // ── (1) a single tween: position + color, eased ────────────────────────
    const dot = build({
        tag: 'circle',
        attrs: { cx: 10, cy: 20, r: 8, fill: '#3366ff' },
    });
    mount.appendChild(dot);

    active.push(tween({
        target: dot, property: 'cx', from: 10, to: 190,
        duration: 1400, easing: 'easeInOutQuad',
    }));
    active.push(tween({
        target: dot, property: 'fill', from: '#3366ff', to: '#ff6633',
        duration: 1400, easing: 'easeInOutQuad',
    }));

    // ── (2) a timeline sequencing >= 3 tweens back-to-back ──────────────────
    const seqRects = [0, 1, 2].map((i) => build({
        tag: 'rect',
        attrs: { x: 10, y: 45 + i * 16, width: 14, height: 10, fill: '#33aa66' },
    }));
    for (const rect of seqRects) mount.appendChild(rect);

    const sequenceTimeline = new Timeline();
    sequenceTimeline.sequence(seqRects.map((rect) => ({
        target: rect, property: 'x', from: 10, to: 170,
        duration: 500, easing: 'easeInOutQuad',
    })));
    sequenceTimeline.play();
    active.push(sequenceTimeline);

    // ── (3) a staggered group: same tween, per-element delay ───────────────
    const staggerDots = [0, 1, 2, 3, 4].map((i) => build({
        tag: 'circle',
        attrs: { cx: 10 + i * 20, cy: 110, r: 5, fill: '#8855dd' },
    }));
    for (const el of staggerDots) mount.appendChild(el);

    const staggerTimeline = new Timeline();
    staggerTimeline.stagger(staggerDots.map((el) => ({
        target: el, property: 'cy', from: 110, to: 80,
        duration: 600, easing: 'easeOutQuad',
    })), 90);
    staggerTimeline.play();
    active.push(staggerTimeline);

    return {
        /**
         * Stop and clean up every running tween/timeline through the
         * shared scheduler reached off the aggregate (`anim.scheduler`) —
         * never a `src/` internal import.
         */
        dispose() {
            for (const item of active) scheduler.remove(item);
        },
    };
}
