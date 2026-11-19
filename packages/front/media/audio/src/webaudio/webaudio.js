// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.webaudio` — the Web Audio graph the codec needs:
 * an audio context, a capture node that gives frames of 128 samples on a
 * port, a playback node that plays frames posted on its port.
 *
 * Written inside the audio package because its bindings need it and the
 * framework does not have it yet (owner decision D15); shaped as an fw
 * descriptor with no dependency, so that it can move into the framework as
 * it is.
 *
 * The two processors run in an `AudioWorklet`, one module whose source the
 * factory holds as text (`processorSource`): a worklet loads a module from
 * a URL, and a capture-free factory cannot point at a file of its own. By
 * default it is loaded from a blob URL; a page whose security policy
 * refuses blob URLs hosts the text and gives its URL to `install`.
 *
 * - **Capture** (`awa-capture`): its input mixed down to one channel, cut
 *   into frames of 128 samples whatever size the browser renders in, each
 *   frame posted on the node's port as a transferred `Float32Array`. An
 *   input with no channel counts as silence: the frames keep the clock.
 * - **Playback** (`awa-playback`): frames posted on its port are played in
 *   order. It starts once `depth` frames are queued; on an underrun it
 *   plays silence, counts it, and waits for `depth` again; beyond `max`
 *   queued frames it drops the oldest and counts them. With `trim`, the
 *   frames left in reserve after each quantum are watched over a window
 *   of `trim` quanta: if even the lowest reserve of the window is above
 *   `depth`, the oldest frames in excess are dropped, so that a delay
 *   built up once (a late start, a stall of the worker) does not stay
 *   for good. By default the reserve is 3 frames and the window one
 *   second (owner decision D17, on the B1b loop-back); `trim: 0` turns
 *   it off. A `{ type: 'silence', level }` message (sent by `audio.link`
 *   when its gate shuts, row A8b) says the frames stop on purpose: the
 *   empty queue that follows is not an underrun, and with `comfort` (an
 *   option, off by default) a white noise of that RMS plays until frames
 *   come back — 10 dB under it by default (`comfortDb`), to stay under the
 *   conversation's level (the owner, D22). A `{ type: 'stats' }` message is answered with the counts
 *   (`silences`, `comforted` quanta among them).
 *
 * A node's port is a `MessagePort`: it can be handed to a worker, so that
 * frames go between the audio thread and the codec without the page's
 * thread. The microphone itself (`getUserMedia`) is not Web Audio: the
 * caller hands a `MediaStream` or any audio node to `capture`.
 */

/**
 * @typedef {object} CaptureHandle
 * @property {AudioWorkletNode} node
 * @property {MessagePort} port Each message: one frame of 128 samples, a `Float32Array`.
 * @property {() => void} stop Disconnects the node and closes its port.
 *
 * @typedef {object} PlaybackStats
 * @property {number} queued
 * @property {number} played
 * @property {number} underruns
 * @property {number} dropped Beyond `max`.
 * @property {number} trimmed Taken off a lasting excess (`trim`).
 * @property {number} silences Silences announced (`{ type: 'silence', level }`).
 * @property {number} comforted Quanta of comfort noise played.
 *
 * @typedef {object} PlaybackHandle
 * @property {AudioWorkletNode} node
 * @property {MessagePort} port Post one `Float32Array` frame a message.
 * @property {(options?: { wait?: number }) => Promise<PlaybackStats|null>} stats Asks the processor its counts — while the port is still the page's;
 *   null when it does not answer within `wait` milliseconds (250 by default), or after `stop`.
 * @property {() => void} stop
 *
 * @typedef {object} WebAudioApi
 * @property {{ capture: string, playback: string }} processors The names the worklet module registers.
 * @property {string} processorSource The worklet module, as text.
 * @property {() => boolean} supported `AudioContext` and `AudioWorkletNode` are there.
 * @property {(options?: { rate?: 44100|48000, latencyHint?: string|number }) => AudioContext} createContext
 * @property {(context: BaseAudioContext, options?: { url?: string }) => Promise<void>} install Adds the worklet module, once a context.
 * @property {(context: BaseAudioContext, source: MediaStream|AudioNode) => CaptureHandle} capture The context must be installed.
 * @property {(context: BaseAudioContext, options?: { depth?: number, max?: number, trim?: number, comfort?: boolean, comfortDb?: number }) => PlaybackHandle} playback The context must be installed.
 */

export const webaudioModule = {
    name: 'audio.webaudio',
    version: '0.5.2',
    type: 'lib.media.audio',
    dependencies: [],
    deps: [],

    /** @returns {WebAudioApi} */
    factory() {
        const FRAME = 128;
        const RATES = [44100, 48000];
        const processors = { capture: 'awa-capture', playback: 'awa-playback' };

        // The worklet module. It runs in the AudioWorkletGlobalScope, apart from this factory.
        const processorSource = `// audio.webaudio worklet module
class AwaCapture extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const o = (options && options.processorOptions) || {};
        this.size = o.frame || 128;
        this.frame = new Float32Array(this.size);
        this.fill = 0;
    }
    process(inputs, outputs) {
        const input = inputs[0] || [];
        const channels = input.length;
        const out = outputs[0] && outputs[0][0];
        const n = channels > 0 ? input[0].length : out ? out.length : 128;
        for (let i = 0; i < n; i++) {
            let v = 0;
            if (channels === 1) v = input[0][i];
            else if (channels > 1) {
                for (let c = 0; c < channels; c++) v += input[c][i];
                v /= channels;
            }
            this.frame[this.fill++] = v;
            if (this.fill === this.size) {
                this.port.postMessage(this.frame, [this.frame.buffer]);
                this.frame = new Float32Array(this.size);
                this.fill = 0;
            }
        }
        return true;
    }
}
class AwaPlayback extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const o = (options && options.processorOptions) || {};
        this.depth = o.depth || 3;
        this.max = o.max || 16;
        this.trim = o.trim || 0;
        this.low = Infinity;
        this.counted = 0;
        this.trimmed = 0;
        this.queue = [];
        this.offset = 0;
        this.playing = false;
        this.played = 0;
        this.underruns = 0;
        this.dropped = 0;
        // A silence announced by the link (row A8b): not an underrun; with comfort, a noise at its level.
        this.comfort = Boolean(o.comfort);
        // Under the conversation's level (the owner, D22): the noise this many dB under the level announced.
        this.comfortGain = Math.pow(10, (o.comfortDb === undefined ? -10 : o.comfortDb) / 20);
        this.silent = false;
        this.level = 0;
        this.silences = 0;
        this.comforted = 0;
        this.seed = 0x9e3779b9;
        this.port.onmessage = (event) => {
            const data = event.data;
            if (data instanceof Float32Array) {
                this.queue.push(data);
                while (this.queue.length > this.max) {
                    this.queue.shift();
                    this.offset = 0;
                    this.dropped++;
                }
            } else if (data && data.type === 'silence') {
                this.silent = true;
                this.level = Number(data.level) || 0;
                this.silences++;
            } else if (data && data.type === 'stats') {
                this.port.postMessage({ type: 'stats', queued: this.queue.length, played: this.played, underruns: this.underruns, dropped: this.dropped, trimmed: this.trimmed, silences: this.silences, comforted: this.comforted });
            }
        };
    }
    /** A white noise of RMS this.level times this.comfortGain, from index from to the end, during an announced silence (comfort on). */
    noise(out, from) {
        if (!this.comfort || from >= out.length) return;
        const a = this.level * this.comfortGain * Math.sqrt(3);
        let x = this.seed;
        for (let i = from; i < out.length; i++) {
            x ^= x << 13;
            x ^= x >>> 17;
            x ^= x << 5;
            out[i] = ((x >>> 0) / 4294967296 * 2 - 1) * a;
        }
        this.seed = x;
        this.comforted++;
    }
    process(inputs, outputs) {
        const channels = outputs[0];
        const out = channels[0];
        if (!this.playing) {
            if (this.queue.length < this.depth) {
                if (this.silent) {
                    this.noise(out, 0);
                    for (let c = 1; c < channels.length; c++) channels[c].set(out);
                }
                return true;
            }
            this.playing = true;
            this.silent = false;
        }
        let i = 0;
        while (i < out.length) {
            if (this.queue.length === 0) {
                if (this.silent) this.noise(out, i);
                else this.underruns++;
                this.playing = false;
                this.low = Infinity;
                this.counted = 0;
                break;
            }
            const head = this.queue[0];
            const take = Math.min(head.length - this.offset, out.length - i);
            out.set(head.subarray(this.offset, this.offset + take), i);
            i += take;
            this.offset += take;
            if (this.offset === head.length) {
                this.queue.shift();
                this.offset = 0;
                this.played++;
            }
        }
        if (this.playing && this.trim > 0) {
            // The reserve left after this quantum; an excess the whole window kept is not needed.
            if (this.queue.length < this.low) this.low = this.queue.length;
            if (++this.counted >= this.trim) {
                const excess = this.low - this.depth;
                if (excess > 0) {
                    this.queue.splice(0, excess);
                    this.offset = 0;
                    this.trimmed += excess;
                }
                this.low = Infinity;
                this.counted = 0;
            }
        }
        for (let c = 1; c < channels.length; c++) channels[c].set(out);
        return true;
    }
}
registerProcessor('awa-capture', AwaCapture);
registerProcessor('awa-playback', AwaPlayback);
`;

        // The module promise of each context; one factory call, one set (lifetime: the container's).
        const installed = new WeakMap();

        function supported() {
            return typeof AudioContext === 'function' && typeof AudioWorkletNode === 'function';
        }

        /** @throws {Error} When Web Audio with AudioWorklet is not there. */
        function need() {
            if (!supported()) throw new Error('audio.webaudio: Web Audio with AudioWorklet is not available here');
        }

        /**
         * @param {object} [options]
         * @param {44100|48000} [options.rate=48000] One of the codec's two rates.
         * @param {string|number} [options.latencyHint='interactive']
         * @returns {AudioContext}
         * @throws {RangeError} On another rate. @throws {Error} Without Web Audio.
         */
        function createContext({ rate = 48000, latencyHint = 'interactive' } = {}) {
            if (!RATES.includes(rate)) throw new RangeError(`audio.webaudio: rate ${rate}, the codec takes ${RATES.join(' or ')} Hz`);
            need();
            return new AudioContext({ sampleRate: rate, latencyHint });
        }

        /**
         * @param {BaseAudioContext} context
         * @param {object} [options]
         * @param {string} [options.url] Where the text of `processorSource` is hosted; a blob URL otherwise.
         * @returns {Promise<void>}
         * @throws {Error} Without Web Audio.
         */
        function install(context, { url } = {}) {
            need();
            if (installed.has(context)) return installed.get(context);
            const own = url ? null : URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }));
            const loading = context.audioWorklet.addModule(url ?? own).finally(() => {
                if (own) URL.revokeObjectURL(own);
            }).catch((error) => {
                // A failed load is not kept: the fallback (`{ url }`, a page policy refusing blob: URLs) may try again.
                if (installed.get(context) === loading) installed.delete(context);
                throw error;
            });
            installed.set(context, loading);
            return loading;
        }

        /**
         * @param {BaseAudioContext} context An installed context.
         * @param {MediaStream|AudioNode} source
         * @returns {CaptureHandle}
         * @throws {TypeError} When the source is neither. @throws {Error} Without Web Audio.
         */
        function capture(context, source) {
            need();
            const input = typeof MediaStream === 'function' && source instanceof MediaStream ? context.createMediaStreamSource(source) : source;
            if (!input || typeof input.connect !== 'function') throw new TypeError('audio.webaudio: capture takes a MediaStream or an audio node');
            const node = new AudioWorkletNode(context, processors.capture, {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
                channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
                processorOptions: { frame: FRAME },
            });
            input.connect(node);
            // Its output is silence; connected, the node is pulled by the graph.
            node.connect(context.destination);
            return {
                node,
                port: node.port,
                stop() {
                    try {
                        input.disconnect(node);
                    } catch {
                        // already disconnected
                    }
                    node.disconnect();
                    node.port.close();
                },
            };
        }

        /**
         * @param {BaseAudioContext} context An installed context.
         * @param {object} [options]
         * @param {number} [options.depth=3] Frames queued before playing starts, and again after an underrun.
         * @param {number} [options.max=16] Frames queued at most; the oldest go first.
         * @param {number} [options.trim] A window, in quanta, over which a lasting excess is dropped; one second of the context by default (D17); 0: never.
         * @param {boolean} [options.comfort=false] During an announced silence, play a comfort noise instead of nothing.
         * @param {number} [options.comfortDb=-10] How far under the announced level the noise plays, in dB, 0 or under (D22).
         * @returns {PlaybackHandle}
         * @throws {RangeError} On a bad depth, max, trim, comfort or comfortDb. @throws {Error} Without Web Audio.
         */
        function playback(context, { depth = 3, max = 16, trim, comfort = false, comfortDb = -10 } = {}) {
            need();
            if (trim === undefined) trim = Math.round(context.sampleRate / FRAME);
            if (!Number.isInteger(depth) || depth < 1 || !Number.isInteger(max) || max < depth) throw new RangeError(`audio.webaudio: depth ${depth}, max ${max}`);
            if (!Number.isInteger(trim) || trim < 0) throw new RangeError(`audio.webaudio: trim ${trim}`);
            if (typeof comfort !== 'boolean') throw new RangeError(`audio.webaudio: comfort ${comfort}, true or false`);
            if (!(typeof comfortDb === 'number' && Number.isFinite(comfortDb) && comfortDb <= 0)) throw new RangeError(`audio.webaudio: comfortDb ${comfortDb}, 0 or under`);
            const node = new AudioWorkletNode(context, processors.playback, {
                numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
                processorOptions: { depth, max, trim, comfort, comfortDb },
            });
            node.connect(context.destination);
            let stopped = false;
            return {
                node,
                port: node.port,
                stats({ wait = 250 } = {}) {
                    if (stopped) return Promise.resolve(null);
                    return new Promise((resolve) => {
                        let timer = null;
                        const listener = ({ data }) => {
                            if (!data || data.type !== 'stats') return;
                            node.port.removeEventListener('message', listener);
                            clearTimeout(timer);
                            const { queued, played, underruns, dropped, trimmed, silences = 0, comforted = 0 } = data;
                            resolve({ queued, played, underruns, dropped, trimmed, silences, comforted });
                        };
                        node.port.addEventListener('message', listener);
                        timer = setTimeout(() => {
                            node.port.removeEventListener('message', listener);
                            resolve(null);
                        }, wait);
                        node.port.start();
                        node.port.postMessage({ type: 'stats' });
                    });
                },
                stop() {
                    stopped = true;
                    node.disconnect();
                    node.port.close();
                },
            };
        }

        return { processors, processorSource, supported, createContext, install, capture, playback };
    },
};
