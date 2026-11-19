// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/clock/main.js
//
// `clock` demo — ACCEPTANCE reproduction of the legacy
// `packages/front/@anim-old/exemples et codes/clock.js` analog clock, using
// ONLY the modern `graphic.anim` aggregate surface (`scene`/`svgBuild` for
// structure, `tween`/`scheduler`/`svgApply` for animation). No legacy JS is
// ported — see `clock-notes.md` for the full construct-by-construct map and
// the honest gap list.
//
// Data delivery choice (compare the `scene` demo): the JSON template
// is an inline object literal rather than a separate `.json` module — small
// enough that a second file would add indirection without benefit, and it
// keeps the per-hand `id` values next to the code that binds them below.
//
// Id-prefix collision caveat: `graphic.scene` defaults `prefix` to the literal `'scene'` — this
// demo always mints its own fresh prefix per `run()` call (`nextPrefix()`
// below), exercised on every boot (the smoke test runs this demo once per
// variant, into the same module realm).

let instanceCounter = 0;

/** Mint a fresh, per-instance-unique scene id prefix. */
function nextPrefix() {
    return `clock-demo-${instanceCounter++}`;
}

/** Shared rotation pivot for all three hands — the legacy clock's center. */
const PIVOT_X = 400;
const PIVOT_Y = 400;

/**
 * Full-sweep periods (ms), each an EXACT real clock cycle length: after one
 * full `duration` of real elapsed time, the true current angle equals the
 * cycle's starting angle again. This is what lets each hand's tween restart
 * itself with the SAME static `from`/`to` forever with no phase drift (see
 * `spin()`).
 */
const PERIOD_SECONDS_MS = 60 * 1000;
const PERIOD_MINUTES_MS = 60 * 60 * 1000;
const PERIOD_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * The legacy `obj_clock` template, reproduced as a `graphic.svgBuild`
 * `NodeDesc` (consumed here via `graphic.scene`'s `SceneSpec.template`).
 * Structure matches `clock.js` 1:1 (masks, dataId → id, same geometry) —
 * see `clock-notes.md` for the construct-by-construct table.
 *
 * @type {object}
 */
const TEMPLATE = {
    tag: 'g',
    children: [
        {
            tag: 'defs',
            children: [
                {
                    tag: 'mask',
                    attrs: { id: 'aMaskClock' },
                    children: [
                        { tag: 'circle', attrs: { fill: '#ffffff', cx: 100, cy: 100, r: 450 } },
                    ],
                },
                {
                    tag: 'mask',
                    attrs: { id: 'aMaskBackground' },
                    children: [
                        { tag: 'rect', attrs: { fill: '#ffffff', x: 0, y: 0, width: 800, height: 800 } },
                    ],
                },
            ],
        },
        {
            tag: 'g',
            attrs: { mask: 'url(#aMaskBackground)' },
            children: [
                { tag: 'rect', attrs: { id: 'aBackground', fill: '#da8028', x: 0, y: 0, width: 800, height: 800 } },
                { tag: 'circle', attrs: { id: 'aClockBorder', fill: '#ffffff', opacity: 0.75, cx: 400, cy: 400, r: 400 } },
                { tag: 'circle', attrs: { id: 'aClockBackground', fill: '#333333', cx: 400, cy: 400, r: 390 } },
                { tag: 'line', attrs: { id: 'aTimeHours', stroke: '#dddddd', 'stroke-width': 2, x1: 400, y1: 400, x2: 400, y2: 35 } },
                { tag: 'line', attrs: { id: 'aTimeMinutes', stroke: '#dddddd', 'stroke-width': 2, x1: 400, y1: 400, x2: 400, y2: 25 } },
                { tag: 'line', attrs: { id: 'aTimeSeconds', stroke: '#ff3333', 'stroke-width': 1.5, x1: 400, y1: 400, x2: 400, y2: 15 } },
                { tag: 'circle', attrs: { id: 'aClockEffect', fill: '#ffffff', mask: 'url(#aMaskClock)', opacity: 0.25, cx: 400, cy: 400, r: 400 } },
            ],
        },
    ],
};

/**
 * Compute each hand's current angle (degrees, clockwise from 12 o'clock) from
 * the real wall clock — same formulas as the legacy `setTime()`, but kept in
 * floating point (no `parseInt` truncation) so the continuous sweep below
 * starts from the exact current position.
 *
 * @param {Date} [now]
 * @returns {{ seconds: number, minutes: number, hours: number }}
 */
function currentAngles(now = new Date()) {
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    return {
        seconds: seconds * (360 / 60),
        minutes: minutes * (360 / 60),
        hours: hours * (360 / 12),
    };
}

/**
 * Demo entry — frozen contract (`demos/_boot.js`).
 *
 * @param {{ mount: SVGElement, anim: object, variant: 'standalone'|'fw' }} ctx
 * @returns {Promise<{ dispose(): void }>}
 */
export async function run({ mount, anim }) {
    const { scene: sceneMod, tween: tweenMod, svgApply, scheduler: schedulerMod } = anim;
    const { Tween } = tweenMod;

    const scene = sceneMod.createScene({
        template: TEMPLATE,
        prefix: nextPrefix(),
        refs: {
            seconds: 'aTimeSeconds',
            minutes: 'aTimeMinutes',
            hours: 'aTimeHours',
        },
        events: {},
    });

    mount.appendChild(scene.root);

    // Bind targets BY REFERENCE once, from the built subtree — mirrors the
    // legacy `ajs.getInfo(id, [...])` one-time lookup (`objDate` in clock.js).
    const hands = {
        seconds: scene.el('seconds'),
        minutes: scene.el('minutes'),
        hours: scene.el('hours'),
    };

    const angles = currentAngles();
    const active = new Set();
    let disposed = false;

    /**
     * Drive one hand's continuous rotation forever.
     *
     * A linear `Tween` sweeps a plain NUMBER 0→360 over exactly one full real
     * cycle (`periodMs`). A custom `apply` writer — not the tween's default
     * attribute writer — turns that numeric progress into the correctly
     * PIVOTED transform string and writes it via `svgApply.svgAttr`.
     *
     * Bypassing the default writer is required: `graphic.interpolate`'s
     * transform parser explicitly ignores `rotate(deg, cx, cy)`'s pivot args
     * (ignores everything but `deg` — ties the rotation to the SVG origin,
     * per its own doc comment), so animating the `transform` STRING directly
     * through the built-in interpolator would rotate the hand around the
     * wrong point. Interpolating a plain NUMBER sidesteps that gap entirely
     * (see `clock-notes.md`).
     *
     * On completion the tween restarts itself with the SAME static
     * `from: 0`/`to: 360` — `graphic.tween`/`graphic.timeline` have no
     * built-in infinite-repeat flag (verified against the live surface: a
     * `Tween`/`Timeline` completes once `raw >= 1` and unregisters itself).
     * This self-restart composition IS the scheduler-driven fallback the
     * plan calls for when a surface has no first-class loop feature.
     *
     * @param {SVGElement} target
     * @param {number} startAngle Current real angle at `run()` time.
     * @param {number} periodMs Exact real-time length of one full sweep.
     */
    function spin(target, startAngle, periodMs) {
        const cycle = () => {
            if (disposed) return;
            const tw = new Tween({
                target,
                property: 'transform',
                from: 0,
                to: 360,
                duration: periodMs,
                easing: 'linear',
                apply: (sweep) => {
                    const angle = (startAngle + sweep) % 360;
                    svgApply.svgAttr(target, 'transform', `rotate(${angle}, ${PIVOT_X}, ${PIVOT_Y})`);
                },
                onComplete: () => {
                    active.delete(tw);
                    cycle();
                },
            });
            active.add(tw);
            tw.play();
        };
        cycle();
    }

    spin(hands.seconds, angles.seconds, PERIOD_SECONDS_MS);
    spin(hands.minutes, angles.minutes, PERIOD_MINUTES_MS);
    spin(hands.hours, angles.hours, PERIOD_HOURS_MS);

    return {
        dispose() {
            // Stop future restarts AND unregister any in-flight tween — a
            // tween that merely has `done = true` set externally would still
            // linger in the scheduler's active set forever (only a tween's
            // own natural completion calls `scheduler.remove`), which would
            // leak an orphan entry and keep the shared rAF loop alive.
            disposed = true;
            for (const tw of active) {
                schedulerMod.scheduler.remove(tw);
            }
            active.clear();
            if (scene.root.parentNode === mount) {
                mount.removeChild(scene.root);
            }
        },
    };
}
