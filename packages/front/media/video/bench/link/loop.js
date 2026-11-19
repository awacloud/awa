// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The loop-back of row B2b, measured: the known moving
 * picture of `bench/grab/scene.js` drawn in a canvas, its captured track
 * grabbed in a worker by `video.grab`, coded and decoded there by
 * `video.link`, and drawn by the worker on a canvas the page gave up — on
 * the GPU, then on a 2D context to compare.
 *
 * The page notes when it drew each frame; the worker notes when it grabbed
 * it and when its picture was shown, and reads the counter back from the
 * picture shown. The compositor's share (the canvas to the screen) is not
 * in the figures. The result is left in `window.__videoLoop`.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../../src/main.js';
import { drawScene, frameRequester } from '../grab/scene.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const grab = runtime.resolve('video.grab');

const SECONDS = Number(new URLSearchParams(location.search).get('seconds') ?? 5);
const report = { visible: document.visibilityState === 'visible', runs: [], ok: false };
const state = document.getElementById('state');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = () => performance.timeOrigin + performance.now();

function once(worker, type) {
    return new Promise((resolve, reject) => {
        const listener = ({ data }) => {
            if (data.type !== type && data.type !== 'error') return;
            worker.removeEventListener('message', listener);
            if (data.type === 'error') reject(new Error(data.message));
            else resolve(data);
        };
        worker.addEventListener('message', listener);
    });
}

/** A source canvas of a size, drawn 30 times a second on a clock that a hidden page does not throttle. */
function makeSource(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const requestFrame = frameRequester(stream);
    const drawn = {};
    let k = 0;
    let next = performance.now();
    let ticking = true;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        if (!ticking) return;
        const now = performance.now();
        if (now >= next) {
            drawScene(context, width, height, k);
            drawn[k] = clock();
            k++;
            requestFrame();
            next += 1000 / 30;
            if (now - next > 200) next = now;
        }
        channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
    return { track, drawn, restart: () => { k = 0; next = performance.now(); for (const key of Object.keys(drawn)) delete drawn[key]; }, stop: () => { ticking = false; track.stop(); } };
}

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);
const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : null);

async function run(source, { width, height, preset, show }) {
    source.restart();
    const worker = new Worker(new URL('../../dist/workers/loop.js', import.meta.url), { type: 'module' });
    const display = document.createElement('canvas');
    document.getElementById('shown').replaceChildren(display);
    const offscreen = display.transferControlToOffscreen();
    const opening = once(worker, 'opened');
    worker.postMessage({ type: 'open', config: { width, height, fps: 30, preset }, canvas: offscreen, show }, [offscreen]);
    const opened = await opening;
    const own = source.track.clone();
    const feeder = grab.source(own);
    const t0 = performance.now();
    feeder.attach(worker);
    const pageMs = performance.now() - t0;
    await sleep(SECONDS * 1000);
    const asking = once(worker, 'stats');
    worker.postMessage({ type: 'stats' });
    const stats = await asking;
    const probing = once(worker, 'probe');
    worker.postMessage({ type: 'probe' });
    const probe = await probing;
    feeder.stop();
    own.stop();
    worker.terminate();
    const toGrab = [];
    const toShown = [];
    for (const [k, at] of Object.entries(probe.grabbed)) if (source.drawn[k] !== undefined) toGrab.push(at - source.drawn[k]);
    for (const [k, at] of Object.entries(probe.shown)) if (probe.grabbed[k] !== undefined) toShown.push(at - probe.grabbed[k]);
    const total = Object.entries(probe.shown).filter(([k]) => source.drawn[k] !== undefined).map(([k, at]) => at - source.drawn[k]);
    return {
        size: `${width}x${height}`,
        preset,
        display: stats.display,
        opened: opened.display,
        grab: feeder.kind,
        grabbedFps: r2(stats.grabbed / SECONDS),
        shownFps: r2(stats.shown / SECONDS),
        kbps: Math.round((stats.bytes * 8) / SECONDS / 1000),
        encodeMs: r2(stats.encodeMs / Math.max(1, stats.coded)),
        decodeAndShowMs: r2(stats.decodeMs / Math.max(1, stats.shown)),
        sourceToGrabMs: { mean: r2(mean(toGrab)), max: r2(Math.max(...toGrab)) },
        grabToShownMs: { mean: r2(mean(toShown)), max: r2(Math.max(...toShown)) },
        sourceToShownMs: { mean: r2(mean(total)), max: r2(Math.max(...total)) },
        counterReadBack: `${probe.matched} of ${probe.peeks}`,
        pageAttachMs: r2(pageMs),
    };
}

async function main() {
    const plan = [
        { width: 640, height: 360, preset: 'standard', show: 'gpu' },
        { width: 640, height: 360, preset: 'standard', show: 'cpu' },
        { width: 640, height: 360, preset: 'economy', show: 'gpu' },
        { width: 640, height: 360, preset: 'screen', show: 'gpu' },
        { width: 1280, height: 720, preset: 'standard', show: 'gpu' },
        { width: 1280, height: 720, preset: 'standard', show: 'cpu' },
        { width: 1280, height: 720, preset: 'quality', show: 'gpu' },
    ];
    const sources = {};
    for (const item of plan) {
        const key = `${item.width}x${item.height}`;
        sources[key] ??= makeSource(item.width, item.height);
        state.textContent = `Running ${key} ${item.preset} (${item.show})…`;
        report.runs.push(await run(sources[key], item));
    }
    for (const source of Object.values(sources)) source.stop();
    report.ok = report.runs.every((row) => row.shownFps > 0 && row.counterReadBack.split(' of ')[0] === row.counterReadBack.split(' of ')[1]);
}

try {
    await main();
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
}
window.__videoLoop = report;
document.getElementById('report').textContent = JSON.stringify(report, null, 2);
state.textContent = report.error ? 'Failed.' : report.ok ? 'Done; every picture read back was the frame sent.' : 'DONE, BUT A RUN FAILED ITS CHECK.';
