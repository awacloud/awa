// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/demos/frames/main.js
//
// `frames` demo — a self-contained frame-sequence flip animation driven
// entirely through the `graphic.frames` capability of the `graphic.anim`
// aggregate surface handed over by `../_boot.js` (`anim.svgBuild.build`,
// `anim.frames.frames`). No bundler, no `src/` import: every capability
// comes from the resolved `anim` object passed into `run()`.
//
// Content: `FRAME_COUNT` regular polygons, each with one more side than the
// last (triangle → decagon) — a literal "shape morphing per frame" sequence,
// generated in code with no external assets. `graphic.frames` (discrete
// mode) steps through them, showing exactly one at a time via its default
// `display` writer.
//
// Demo-entry contract (frozen by `demos/_boot.js`):
//   export async function run({ mount, anim, variant }) => { dispose() }
//
// Play/pause/jump-to-frame controls live in `index.html` (its own script,
// outside the frozen `run()` contract) and drive the sequence through the
// EXTRA methods this demo's handle exposes on top of the required
// `dispose()` — `play()`/`pause()`/`seek(index)` forward straight to the
// live `Frames` instance (`anim.frames.frames(...)` return value), and the
// current `.frame`/`.frameCount`/`.playing`/`.done` readouts are the SAME
// properties documented for `graphic.frames`
// (`docs/api/frames/frames.md` "State" table) — no shadow state kept here.

/** Total frames in the sequence — polygon side counts run 3..3+FRAME_COUNT-1. */
const FRAME_COUNT = 8;
/** Sides of the first (frame 0) polygon; each later frame adds one side. */
const MIN_SIDES = 3;
/** Shared viewBox center / circumradius for every polygon frame. */
const CENTER = 50;
const RADIUS = 42;

/**
 * @typedef {Object} RunArgs
 * @property {SVGElement} mount Mount point — an `<svg>` element the demo
 *   appends its own frame elements into. Never queried by id/selector.
 * @property {object} anim The resolved `graphic.anim` aggregate surface:
 *   `{ svgBuild: { build }, frames: { Frames, frames }, ... }`.
 * @property {'standalone'|'fw'} variant Which surface booted `anim` (unused
 *   by the demo itself — both variants expose the same API).
 */

/**
 * @typedef {Object} FramesHandle
 * @property {() => void} play Start/resume playback (`Frames#play`).
 * @property {() => void} pause Freeze on the current frame (`Frames#pause`).
 * @property {(index: number) => void} seek Jump to `index`, clamped, no throw (`Frames#seek`).
 * @property {() => number} frame Current displayed frame index (`.frame`).
 * @property {() => number} frameCount Total frames (`.frameCount`).
 * @property {() => boolean} playing True while registered on the scheduler (`.playing`).
 * @property {() => void} dispose Stop playback and release the mount.
 */

/**
 * Build the `FRAME_COUNT` polygon frame elements — one regular polygon per
 * frame, `MIN_SIDES + i` sides, filled with a hue that steps across the
 * sequence. Every element is built ONCE via `svgBuild.build` and appended to
 * `mount`, then handed to `Frames` bound BY REFERENCE — no per-tick lookup.
 *
 * @param {{ build: Function }} svgBuild Resolved `graphic.svgBuild`.
 * @param {SVGElement} mount
 * @returns {SVGElement[]} The `FRAME_COUNT` frame group elements, in order.
 */
function buildFrames(svgBuild, mount) {
    const frameEls = [];
    for (let i = 0; i < FRAME_COUNT; i += 1) {
        const sides = MIN_SIDES + i;
        const hue = Math.round((360 / FRAME_COUNT) * i);
        const points = [];
        for (let k = 0; k < sides; k += 1) {
            const theta = ((Math.PI * 2 * k) / sides) - (Math.PI / 2);
            const x = (CENTER + (RADIUS * Math.cos(theta))).toFixed(2);
            const y = (CENTER + (RADIUS * Math.sin(theta))).toFixed(2);
            points.push(`${x},${y}`);
        }

        const group = svgBuild.build({
            tag: 'g',
            children: [
                {
                    tag: 'polygon',
                    attrs: {
                        points: points.join(' '),
                        fill: `hsl(${hue}, 70%, 55%)`,
                        stroke: '#1a1a1a',
                        'stroke-width': 1.5,
                    },
                },
            ],
        });
        mount.appendChild(group);
        frameEls.push(group);
    }
    return frameEls;
}

/**
 * Run the frames demo: build the polygon frame set, wrap it in a
 * `graphic.frames` sequence (discrete mode, default `display` writer), park
 * it on frame 0 via `seek` (visible but paused), and hand back a handle that
 * forwards play/pause/seek to the live instance for `index.html`'s controls.
 *
 * `run` is idempotent per fresh `mount`: it only ever appends the elements it
 * just built and never queries `document` beyond `mount`.
 *
 * @param {RunArgs} args
 * @returns {Promise<FramesHandle>}
 */
export async function run({ mount, anim }) {
    const { build } = anim.svgBuild;
    const frameEls = buildFrames({ build }, mount);

    const sequence = anim.frames.frames({
        frames: frameEls,
        fps: 4,
        loop: true,
    });
    // Render frame 0 immediately (paused) so the stage is never blank/
    // overlapping before the user presses play — mirrors the doc's own
    // "scrub without playing" example.
    sequence.seek(0);

    return {
        play() { sequence.play(); },
        pause() { sequence.pause(); },
        seek(index) { sequence.seek(index); },
        frame() { return sequence.frame; },
        frameCount() { return sequence.frameCount; },
        playing() { return sequence.playing; },

        /**
         * Stop playback (unregisters from the shared scheduler via
         * `Frames#pause`, exactly like `Frames#pause` itself) and release
         * every frame element appended to `mount`.
         */
        dispose() {
            sequence.pause();
            for (const el of frameEls) {
                if (el.parentNode === mount) mount.removeChild(el);
            }
        },
    };
}
