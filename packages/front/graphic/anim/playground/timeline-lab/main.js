// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/playground/timeline-lab/main.js
//
// Playground surface — three staged rects driven by ONE `Timeline` built
// from three offset `.add()` steps, with Play/Stop controls. Demonstrates
// `onSettle` (NOT `onComplete`): the terminal-transition hook that fires on
// BOTH natural completion and an explicit `stop()`
//. Resolves its OWN fw runtime
// directly off the public root barrel, same as `../easing-lab/main.js` —
// this surface does not reuse the `demos/` family's `_boot.js` plumbing.
//
// No import side effects: nothing below runs until `run()` is called.

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { graphicModules } from '@awacloud/graphic-anim';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @returns {SVGElement}
 */
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
        for (const key of Object.keys(attrs)) el.setAttribute(key, attrs[key]);
    }
    return el;
}

const REST_X = 20;
const RUN_X = 340;
const STEP_MS = 300;
const DURATION_MS = 700;

/**
 * @param {{ mount: Element }} ctx Page-owned mount; this surface builds its
 *   own controls + SVG stage into it (no other ctx keys used).
 * @returns {{ dispose(): void }}
 */
export function run({ mount }) {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep(graphicModules);
    const anim = runtime.resolve('graphic.anim');
    const { Timeline } = anim.timeline;
    const { svgAttr } = anim.svgApply;

    // ── controls ─────────────────────────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'demo-controls';
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = 'Play';
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.textContent = 'Stop';
    stopBtn.disabled = true;
    controls.append(playBtn, stopBtn);
    mount.appendChild(controls);

    // ── stage: three staged rects ───────────────────────────────────────
    const svg = svgEl('svg', { viewBox: '0 0 400 160' });
    const rects = [0, 1, 2].map((i) => svgEl('rect', {
        x: String(REST_X),
        y: String(15 + i * 45),
        width: '30',
        height: '30',
        fill: 'var(--accent)',
    }));
    for (const rect of rects) svg.appendChild(rect);
    mount.appendChild(svg);

    // ── behaviour ────────────────────────────────────────────────────────
    /** @type {{ stop(): void }|null} */
    let timeline = null;
    let disposed = false;

    /**
     * @param {boolean} running
     */
    function setRunning(running) {
        playBtn.disabled = running;
        stopBtn.disabled = !running;
    }

    /**
     * Build and play a fresh `Timeline` over the three rects, staged
     * `STEP_MS` apart via three offset `.add()` calls.
     */
    function play() {
        if (disposed) return;
        if (timeline) timeline.stop();
        for (const rect of rects) svgAttr(rect, 'x', REST_X);

        timeline = new Timeline({
            // `onSettle` — NOT `onComplete` — fires on BOTH natural
            // completion and `stop()`, so the controls re-enable whichever
            // way the play cycle ends. `onComplete` alone would leave the
            // Stop button armed forever after a manual stop().
            onSettle() {
                setRunning(false);
            },
        });
        rects.forEach((rect, i) => {
            timeline.add({
                target: rect,
                property: 'x',
                from: REST_X,
                to: RUN_X,
                duration: DURATION_MS,
                easing: 'easeInOutQuad',
            }, i * STEP_MS);
        });
        timeline.play();
        setRunning(true);
    }

    function stop() {
        if (timeline) timeline.stop();
    }

    playBtn.addEventListener('click', play);
    stopBtn.addEventListener('click', stop);

    return {
        /**
         * `stop()` the current timeline (idempotent, and itself fires
         * `onSettle` — harmless if the play cycle already settled), then
         * drop the control listeners.
         */
        dispose() {
            disposed = true;
            if (timeline) timeline.stop();
            playBtn.removeEventListener('click', play);
            stopBtn.removeEventListener('click', stop);
        },
    };
}
