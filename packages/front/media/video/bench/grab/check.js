// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The browser leg of `video.grab` (row B2a).
 *
 * A known moving picture (`scene.js`) is drawn into a canvas, 30 frames a
 * second, and its `captureStream()` track goes through each way in — the
 * processor's stream, then the posted bitmaps — to a real worker, which
 * reads the counter drawn in each frame, draws that frame again and
 * compares. A third run asks the reader for 15 frames a second. The result
 * is left in `window.__grabCheck`. The bitmaps way needs a page in view: a
 * hidden page's video element gives no frame.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../../src/main.js';
import { drawScene, frameRequester } from './scene.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const grab = runtime.resolve('video.grab');

const WIDTH = 640;
const HEIGHT = 360;
const SECONDS = Number(new URLSearchParams(location.search).get('seconds') ?? 5);
const report = { supported: grab.supported(), visible: document.visibilityState === 'visible', clock: null, runs: [], ok: false };
const state = document.getElementById('state');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canvas = document.getElementById('scene');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const context = canvas.getContext('2d');
const stream = canvas.captureStream(0);
const track = stream.getVideoTracks()[0];
const requestFrame = frameRequester(stream);

// The source's clock: 30 frames a second. A hidden page throttles its timers, so it spins on a message channel then.
let k = 0;
let next = performance.now();
let ticking = true;
function frameDue() {
    const now = performance.now();
    if (now >= next) {
        drawScene(context, WIDTH, HEIGHT, k++);
        requestFrame();
        next += 1000 / 30;
        if (now - next > 200) next = now;
    }
}
if (document.visibilityState === 'visible') {
    report.clock = 'timer';
    (function loop() {
        if (!ticking) return;
        frameDue();
        setTimeout(loop, 4);
    })();
} else {
    report.clock = 'message channel (the page was hidden)';
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        if (!ticking) return;
        frameDue();
        channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
}

function once(worker, type) {
    return new Promise((resolve) => {
        const listener = ({ data }) => {
            if (data.type !== type) return;
            worker.removeEventListener('message', listener);
            resolve(data);
        };
        worker.addEventListener('message', listener);
    });
}

async function run(prefer, fps) {
    const worker = new Worker(new URL('./grab-worker.js', import.meta.url), { type: 'module' });
    const ready = once(worker, 'ready');
    worker.postMessage({ type: 'config', width: WIDTH, height: HEIGHT, fps });
    await ready;
    // Each run counts from 0, so that the counter drawn never wraps.
    k = 0;
    const own = track.clone();
    const source = grab.source(own, { prefer });
    source.attach(worker);
    await sleep(SECONDS * 1000);
    const answer = once(worker, 'report');
    worker.postMessage({ type: 'report' });
    const result = await answer;
    source.stop();
    own.stop();
    worker.terminate();
    return { way: source.kind, askedFps: fps, ...result };
}

async function main() {
    if (!report.supported.offscreen) return;
    if (report.supported.processor) report.runs.push(await run('stream', 30));
    if (report.supported.bitmaps) report.runs.push(await run('bitmaps', 30));
    report.runs.push(await run(report.supported.processor ? 'stream' : 'bitmaps', 15));
    report.ok = report.runs.length > 0 && report.runs.every((row) => row.kept > 0 && row.backwards === 0 && (row.psnrMean === 'inf' || row.psnrMean > 30));
}

try {
    await main();
} catch (error) {
    report.error = String(error && error.stack ? error.stack : error);
}
ticking = false;
window.__grabCheck = report;
document.getElementById('report').textContent = JSON.stringify(report, null, 2);
state.textContent = report.error ? 'Failed.' : report.ok ? 'Done.' : 'DONE, BUT A RUN FAILED ITS CHECK.';
