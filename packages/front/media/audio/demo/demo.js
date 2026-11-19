// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The live demo of `@awacloud/media-audio`: the microphone →
 * `audio.webaudio` capture → `audio.link` in a worker (the codec) →
 * `audio.webaudio` playback, with the microphone itself to compare.
 *
 * `?source=test` replaces the microphone by a muted tone: a silent check of
 * the plumbing, without a permission prompt. The state is left in
 * `window.__demo` for such checks.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
const webaudio = runtime.resolve('audio.webaudio');
const codec = runtime.resolve('audio.codec');

const $ = (id) => document.getElementById(id);
const test = new URLSearchParams(location.search).get('source') === 'test';
let session = null;
let directly = false;
window.__demo = { running: false, stats: null, error: null };

/** Sends a message to the worker and waits for the answer of a type (or an error). */
function ask(worker, message, type, transfer = []) {
    return new Promise((resolve, reject) => {
        const listener = ({ data }) => {
            if (data.type !== type && data.type !== 'error') return;
            worker.removeEventListener('message', listener);
            if (data.type === 'error') reject(new Error(data.message));
            else resolve(data);
        };
        worker.addEventListener('message', listener);
        worker.postMessage(message, transfer);
    });
}

async function start() {
    await stop();
    const preset = $('preset').value;
    const depth = Number($('depth').value);
    $('state').textContent = 'Starting…';
    const context = webaudio.createContext();
    await webaudio.install(context);
    let stream = null;
    let input;
    if (test) {
        const tone = context.createOscillator();
        input = context.createGain();
        input.gain.value = 0;
        tone.connect(input);
        tone.start();
    } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
        input = context.createMediaStreamSource(stream);
    }
    const capture = webaudio.capture(context, input);
    // The playback's defaults trim a lasting delay over one second (D17); unticked, it never does.
    const player = webaudio.playback(context, { depth, max: 32, ...($('trim').checked ? {} : { trim: 0 }) });
    // Two paths to the ears, one heard at a time: through the codec, or the microphone itself.
    player.node.disconnect();
    const viaCodec = context.createGain();
    const direct = context.createGain();
    player.node.connect(viaCodec).connect(context.destination);
    input.connect(direct).connect(context.destination);
    const worker = new Worker(new URL('../dist/workers/demo.js', import.meta.url), { type: 'module' });
    await ask(worker, { type: 'open', capture: capture.port, playback: player.port, config: { rate: context.sampleRate, preset }, deflate: $('deflate').checked }, 'opened', [capture.port, player.port]);
    if (context.state !== 'running') await context.resume();
    session = { context, stream, worker, viaCodec, direct, last: null, timer: null };
    hear(directly);
    $('m-base').textContent = `${(context.baseLatency * 1000).toFixed(1)} ms`;
    $('m-delay').textContent = `${((((depth + 1) * 128 + codec.delay({ rate: context.sampleRate, preset })) * 1000) / context.sampleRate).toFixed(1)} ms`;
    session.timer = setInterval(measure, 1000);
    window.__demo.running = true;
    $('state').textContent = `Running: ${preset}, a reserve of ${depth}, trim ${$('trim').checked ? 'on' : 'off'}${test ? ' (muted test signal)' : ''}.`;
}

async function measure() {
    if (!session) return;
    const stats = await ask(session.worker, { type: 'stats' }, 'stats').catch(() => null);
    if (!stats || !session) return;
    const previous = session.last;
    session.last = stats;
    window.__demo.stats = stats;
    if (previous && stats.frames > previous.frames) {
        const seconds = ((stats.frames - previous.frames) * 128) / session.context.sampleRate;
        $('m-rate').textContent = `${(((stats.bytes - previous.bytes) * 8) / seconds / 1000).toFixed(0)} kbit/s`;
        const wire = stats.wireBytes - previous.wireBytes;
        $('m-deflated').textContent = `${((wire * 8) / seconds / 1000).toFixed(0)} kbit/s (${Math.round((100 * wire) / Math.max(1, stats.bytes - previous.bytes))} % of the raw)`;
        $('m-lost').textContent = `${stats.lost}, ${stats.concealed}`;
    }
    if (stats.playback) {
        $('m-under').textContent = String(stats.playback.underruns);
        $('m-trim').textContent = String(stats.playback.trimmed);
    }
    if (stats.frames > 0) $('m-time').textContent = `${((stats.encodeMs * 1000) / stats.frames).toFixed(0)} µs, ${((stats.decodeMs * 1000) / Math.max(1, stats.decoded)).toFixed(0)} µs`;
}

function hear(choice) {
    directly = choice;
    $('direct').setAttribute('aria-pressed', String(choice));
    $('via-codec').setAttribute('aria-pressed', String(!choice));
    if (!session) return;
    session.direct.gain.value = choice ? 1 : 0;
    session.viaCodec.gain.value = choice ? 0 : 1;
}

async function stop() {
    if (!session) return;
    const ending = session;
    session = null;
    clearInterval(ending.timer);
    ending.worker.terminate();
    if (ending.stream) for (const track of ending.stream.getTracks()) track.stop();
    await ending.context.close();
    window.__demo.running = false;
    $('state').textContent = 'Stopped.';
}

const guard = (fn) => () => fn().catch((error) => {
    window.__demo.error = String(error && error.message ? error.message : error);
    $('state').textContent = `Error: ${window.__demo.error}`;
});
$('start').addEventListener('click', guard(start));
$('stop').addEventListener('click', guard(stop));
$('direct').addEventListener('click', () => hear(true));
$('via-codec').addEventListener('click', () => hear(false));
for (const id of ['preset', 'depth', 'trim', 'deflate']) $(id).addEventListener('change', () => { if (session) guard(start)(); });
