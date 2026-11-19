// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The live demo of `@awacloud/media-video`: a camera or screen
 * track → `video.grab` → `video.link` in a worker (encoder, decoder, the
 * picture drawn on the GPU there), beside the source itself, with the layers
 * a relay would drop to switch while it runs.
 *
 * `?source=test` replaces the camera by a generated moving picture: a check
 * without a permission prompt. The state is left in `window.__demo`.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const grab = runtime.resolve('video.grab');

const $ = (id) => document.getElementById(id);
const test = new URLSearchParams(location.search).get('source') === 'test';
let session = null;
window.__demo = { running: false, stats: null, error: null, opened: null };

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

/** A generated moving picture, 30 frames a second, on a clock a hidden page does not throttle. */
function testTrack(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    // Chromium asks the track for the next frame, Firefox the stream (row B2c).
    const requestFrame = typeof track.requestFrame === 'function' ? () => track.requestFrame() : () => stream.requestFrame();
    let k = 0;
    let next = performance.now();
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        if (track.readyState === 'ended') return;
        const now = performance.now();
        if (now >= next) {
            const bands = ['#1f5f8b', '#8b3a1f', '#3a8b1f', '#8b8b1f', '#5f1f8b', '#1f8b8b'];
            bands.forEach((colour, i) => { context.fillStyle = colour; context.fillRect(0, (i * height) / 6, width, height / 6 + 1); });
            context.fillStyle = '#f0f0f0';
            context.fillRect((k * 5) % (width - 80), height / 2 - 40, 80, 80);
            context.font = `${Math.round(height / 8)}px system-ui, sans-serif`;
            context.fillText(`frame ${k}`, 24, height / 6);
            k++;
            requestFrame();
            next += 1000 / 30;
            if (now - next > 200) next = now;
        }
        channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
    return stream;
}

async function start() {
    await stop();
    const [width, height] = $('size').value.split('x').map(Number);
    const preset = $('preset').value;
    $('state').textContent = 'Starting…';
    let stream;
    if (test) stream = testTrack(width, height);
    else if ($('source').value === 'screen') stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
    else stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } }, audio: false });
    const track = stream.getVideoTracks()[0];
    $('before').srcObject = stream;
    // The picture through the codec: a canvas given up to the worker, which draws on it.
    const canvas = document.createElement('canvas');
    $('after').replaceChildren(canvas);
    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(new URL('../dist/workers/demo.js', import.meta.url), { type: 'module' });
    const opening = once(worker, 'opened');
    worker.postMessage({ type: 'open', config: { width, height, fps: 30, preset }, canvas: offscreen, show: $('gpu').checked ? 'gpu' : 'cpu', deflate: $('deflate').checked }, [offscreen]);
    const opened = await opening;
    window.__demo.opened = opened;
    const feeder = grab.source(track.clone());
    feeder.attach(worker);
    session = { stream, worker, feeder, last: null, at: performance.now(), timer: null, opened };
    drop();
    session.timer = setInterval(measure, 1000);
    window.__demo.running = true;
    $('state').textContent = `Running: ${width} × ${height}, ${preset}, coded ${opened.coded.width} × ${opened.coded.height} at ${opened.coded.fps} a second${test ? ' (generated picture)' : ''}.`;
}

function drop() {
    if (!session) return;
    session.worker.postMessage({ type: 'drop', details: Number($('details').value), colour: $('colour').checked });
}

async function measure() {
    if (!session) return;
    const current = session;
    const asking = once(current.worker, 'stats').catch(() => null);
    current.worker.postMessage({ type: 'stats' });
    const stats = await asking;
    if (!stats || session !== current) return;
    const now = performance.now();
    const previous = current.last;
    current.last = { ...stats, at: now };
    window.__demo.stats = stats;
    if (previous) {
        const seconds = (now - previous.at) / 1000;
        const rate = (bytes) => `${Math.round((bytes * 8) / seconds / 1000)} kbit/s`;
        $('m-sent').textContent = rate(stats.bytes - previous.bytes);
        const share = (part) => `${Math.round((100 * part) / Math.max(1, stats.bytes - previous.bytes))} % of the codec's`;
        const wire = stats.wireBytes - previous.wireBytes;
        const kept = stats.keptWireBytes - previous.keptWireBytes;
        $('m-sent-deflated').textContent = `${rate(wire)} (${share(wire)})`;
        $('m-kept-deflated').textContent = `${rate(kept)} (${share(kept)})`;
        $('m-kept').textContent = `${stats.lost}, ${stats.late}`;
        const perSecond = (key) => ((stats[key] - previous[key]) / seconds).toFixed(1);
        $('m-fps').textContent = `${perSecond('grabbed')}, ${perSecond('skipped')}, ${perSecond('shown')}`;
    }
    if (stats.coded > 0) $('m-time').textContent = `${(stats.encodeMs / stats.coded).toFixed(1)} ms, ${(stats.decodeMs / Math.max(1, stats.shown)).toFixed(2)} ms`;
    $('m-shape').textContent = `${current.opened.coded.width} × ${current.opened.coded.height}, ${stats.display === 'gpu' ? 'the GPU' : stats.display === 'cpu' ? 'a 2D canvas' : '—'}, ${current.feeder.kind === 'stream' ? 'a frame stream' : 'bitmaps of a video element'}`;
}

async function stop() {
    if (!session) return;
    const ending = session;
    session = null;
    clearInterval(ending.timer);
    ending.feeder.stop();
    ending.worker.terminate();
    for (const track of ending.stream.getTracks()) track.stop();
    $('before').srcObject = null;
    window.__demo.running = false;
    $('state').textContent = 'Stopped.';
}

const guard = (fn) => () => fn().catch((error) => {
    window.__demo.error = String(error && error.message ? error.message : error);
    $('state').textContent = `Error: ${window.__demo.error}`;
});
$('start').addEventListener('click', guard(start));
$('stop').addEventListener('click', guard(stop));
for (const id of ['source', 'size', 'preset', 'gpu', 'deflate']) $(id).addEventListener('change', () => { if (session) guard(start)(); });
for (const id of ['details', 'colour']) $(id).addEventListener('change', drop);
$('split').addEventListener('input', () => $('stage').style.setProperty('--split', `${$('split').value}%`));
