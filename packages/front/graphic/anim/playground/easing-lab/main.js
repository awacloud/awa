// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/playground/easing-lab/main.js
//
// Playground surface — pick any of the 31 `graphic.easing` curves and watch
// a circle glide along a track using it, side by side with the curve itself
// plotted as an SVG polyline. Resolves its OWN fw runtime directly off the
// public root barrel (`@awacloud/graphic-anim` -> `graphicModules`) — this
// surface does NOT reuse the `demos/` family's `_boot.js` plumbing, which is
// family-shared and underscore-prefixed on purpose
// (`docs/demo-playground.md` §1).
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

const PLOT_X0 = 20;
const PLOT_X1 = 220;
const PLOT_Y0 = 170;
const PLOT_H = 120;
const CURVE_SAMPLES = 60;

/**
 * Sample a normalized easing curve (`t -> t'`, both in `[0,1]`, though
 * Back/Elastic/Bounce overshoot the range at the ends) into SVG polyline
 * points on the plot area below the track.
 *
 * @param {(t: number) => number} fn
 * @returns {string}
 */
function sampleCurvePoints(fn) {
    const pts = [];
    for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
        const t = i / CURVE_SAMPLES;
        const y = fn(t);
        const x = PLOT_X0 + t * (PLOT_X1 - PLOT_X0);
        const py = PLOT_Y0 - y * PLOT_H;
        pts.push(`${x},${py}`);
    }
    return pts.join(' ');
}

/**
 * @param {{ mount: Element }} ctx Page-owned mount; this surface builds its
 *   own controls + SVG stage into it (no other ctx keys used).
 * @returns {{ dispose(): void }}
 */
export function run({ mount }) {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep(graphicModules);
    const anim = runtime.resolve('graphic.anim');
    const { easing } = anim;
    const { tween } = anim.tween;
    const { scheduler } = anim.scheduler;

    // ── controls ─────────────────────────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'demo-controls';

    const selectLabel = document.createElement('label');
    selectLabel.textContent = 'Easing ';
    const select = document.createElement('select');
    // Never a hardcoded list — the resolved `graphic.easing` table IS the
    // source of truth for what this control offers.
    for (const name of Object.keys(easing)) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    }
    select.value = 'easeInOutQuad';
    selectLabel.appendChild(select);

    const durationLabel = document.createElement('label');
    durationLabel.textContent = 'Duration (ms) ';
    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.min = '100';
    durationInput.max = '5000';
    durationInput.step = '100';
    durationInput.value = '900';
    durationLabel.appendChild(durationInput);

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.textContent = 'Replay';

    controls.append(selectLabel, durationLabel, replayBtn);
    mount.appendChild(controls);

    // ── stage: track + moving dot, plus the curve plot ──────────────────
    const svg = svgEl('svg', { viewBox: '0 0 400 200' });

    const track = svgEl('line', {
        x1: String(PLOT_X0), y1: '30', x2: String(PLOT_X1), y2: '30',
        stroke: 'var(--card-border)', 'stroke-width': '2',
    });
    const dot = svgEl('circle', { cx: String(PLOT_X0), cy: '30', r: '7', fill: 'var(--accent)' });

    const axisX = svgEl('line', {
        x1: String(PLOT_X0), y1: String(PLOT_Y0), x2: String(PLOT_X1), y2: String(PLOT_Y0),
        stroke: 'var(--card-border)', 'stroke-width': '1',
    });
    const axisY = svgEl('line', {
        x1: String(PLOT_X0), y1: String(PLOT_Y0 - PLOT_H), x2: String(PLOT_X0), y2: String(PLOT_Y0),
        stroke: 'var(--card-border)', 'stroke-width': '1',
    });
    const curve = svgEl('polyline', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': '2' });

    svg.append(track, dot, axisX, axisY, curve);
    mount.appendChild(svg);

    // ── behaviour ────────────────────────────────────────────────────────
    /** @type {{ done: boolean }|null} In-flight `Tween` handle, or `null`. */
    let handle = null;
    let disposed = false;

    /**
     * (Re)start the dot's tween for the selected easing/duration, and loop
     * it — `onComplete` re-triggers `play()` so a reader can watch the shape
     * repeat without clicking Replay again. Guarded by `disposed`: a tween
     * only ever self-unregisters on NATURAL completion
     *, so
     * without the flag a completed tween's `onComplete` would keep firing
     * `play()` forever, even after `dispose()`.
     */
    function play() {
        if (disposed) return;
        if (handle) scheduler.remove(handle);

        const name = select.value;
        const fn = easing[name] || easing.linear;
        curve.setAttribute('points', sampleCurvePoints(fn));

        const duration = Number(durationInput.value) || 900;
        handle = tween({
            target: dot,
            property: 'cx',
            from: PLOT_X0,
            to: PLOT_X1,
            duration,
            easing: name,
            onComplete() {
                if (!disposed) play();
            },
        });
    }

    select.addEventListener('change', play);
    durationInput.addEventListener('change', play);
    replayBtn.addEventListener('click', play);

    play();

    return {
        /**
         * Stop any in-flight tween via the shared scheduler this page's own
         * runtime resolved, and drop the control listeners.
         */
        dispose() {
            disposed = true;
            if (handle) scheduler.remove(handle);
            select.removeEventListener('change', play);
            durationInput.removeEventListener('change', play);
            replayBtn.removeEventListener('click', play);
        },
    };
}
