// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.grab` — the frames of a camera or screen track,
 * read in a worker as RGBA at the codec's size and rate.
 *
 * Written inside the video package because its bindings need it and the
 * framework does not have it yet (owner decision D15); shaped as an fw
 * descriptor with no dependency, so that it can move into the framework as
 * it is. Platform objects are read when a function is called, never at
 * import.
 *
 * Two ways in, from the page (`source`):
 *   - `stream` — where `MediaStreamTrackProcessor` exists (Chromium), the
 *     track becomes a stream of `VideoFrame`s, handed to the worker whole:
 *     the page's thread never touches a frame. Its buffer holds one frame,
 *     so a worker that falls behind loses the old frames, not the new.
 *   - `bitmaps` — elsewhere, a `<video>` element plays the track and each
 *     new frame (`requestVideoFrameCallback`) is posted to the worker as a
 *     transferred `ImageBitmap`, with its time.
 * One way out, in the worker (`reader`): the frame drawn on an
 * `OffscreenCanvas` at the asked size — scaled to fit, centred, on black
 * — read as RGBA, and closed at once. Frames that come sooner than the
 * asked rate allows are skipped by their timestamps (and closed).
 *
 * Messages a page's `attach` posts, which `receive` takes in the worker:
 *   { type: 'grab-stream', stream }              the processor's stream, transferred
 *   { type: 'grab-frame', frame, timestamp }     one ImageBitmap, transferred; timestamp in µs
 */

/**
 * @typedef {object} GrabSource
 * @property {'stream'|'bitmaps'} kind
 * @property {(target: { postMessage: Function }) => void} attach Starts handing the frames to a worker (or a port).
 * @property {() => void} stop Ends the `bitmaps` feeder; a transferred stream is ended by its reader, the track by its owner.
 *
 * @typedef {object} GrabReader
 * @property {(frame: VideoFrame|ImageBitmap, timestamp?: number) => Uint8ClampedArray|null} push RGBA, or null when the frame is skipped; the frame is closed either way. A `VideoFrame` carries its timestamp (µs).
 * @property {{ kept: number, skipped: number }} counts
 *
 * @typedef {object} GrabApi
 * @property {() => { processor: boolean, offscreen: boolean, bitmaps: boolean }} supported
 * @property {(track: MediaStreamTrack, options?: { prefer?: 'stream'|'bitmaps' }) => GrabSource} source On the page.
 * @property {(options: { width: number, height: number, fps?: number, canvas?: OffscreenCanvas }) => GrabReader} reader In the worker.
 * @property {(stream: ReadableStream, reader: GrabReader, onFrame: (rgba: Uint8ClampedArray, timestamp: number) => void) => { done: Promise<void>, stop: () => void }} read
 * @property {(scope: EventTarget, reader: GrabReader, onFrame: (rgba: Uint8ClampedArray, timestamp: number) => void) => void} receive
 */

export const grabModule = {
    name: 'video.grab',
    version: '0.2.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {GrabApi} */
    factory() {
        function supported() {
            const bitmaps = typeof document !== 'undefined' && typeof HTMLVideoElement === 'function'
                && 'requestVideoFrameCallback' in HTMLVideoElement.prototype && typeof createImageBitmap === 'function';
            return {
                processor: typeof MediaStreamTrackProcessor === 'function',
                offscreen: typeof OffscreenCanvas === 'function',
                bitmaps,
            };
        }

        /**
         * @param {MediaStreamTrack} track A video track.
         * @param {object} [options]
         * @param {'stream'|'bitmaps'} [options.prefer] Force one way in, where it exists.
         * @returns {GrabSource}
         * @throws {Error} When neither way in exists here.
         */
        function source(track, { prefer } = {}) {
            const here = supported();
            const useStream = here.processor && prefer !== 'bitmaps';
            if (!useStream && !here.bitmaps) throw new Error('video.grab: no way to read a video track here (MediaStreamTrackProcessor, or a video element with requestVideoFrameCallback)');
            if (useStream) {
                const stream = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable;
                return {
                    kind: 'stream',
                    attach(target) {
                        target.postMessage({ type: 'grab-stream', stream }, [stream]);
                    },
                    stop() {
                        // The worker's reader ends the stream; the track belongs to its owner.
                    },
                };
            }
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.srcObject = new MediaStream([track]);
            let running = false;
            let target = null;
            const tick = (now, meta) => {
                if (!running) return;
                const timestamp = Math.round(meta.mediaTime * 1e6);
                createImageBitmap(video).then((frame) => {
                    if (!running) return frame.close();
                    try {
                        target.postMessage({ type: 'grab-frame', frame, timestamp }, [frame]);
                    } catch {
                        frame.close();          // not posted: not leaked
                    }
                }, () => {});
                video.requestVideoFrameCallback(tick);
            };
            return {
                kind: 'bitmaps',
                attach(to) {
                    target = to;
                    running = true;
                    video.play().then(() => video.requestVideoFrameCallback(tick), () => {});
                },
                stop() {
                    running = false;
                    video.pause();
                    video.srcObject = null;
                },
            };
        }

        /**
         * @param {object} options
         * @param {number} options.width
         * @param {number} options.height
         * @param {number} [options.fps] The most frames a second kept; all of them by default.
         * @param {OffscreenCanvas} [options.canvas] Where to draw; a new one of the asked size by default.
         * @returns {GrabReader}
         * @throws {Error} Without an OffscreenCanvas and none given.
         */
        function reader({ width, height, fps, canvas }) {
            if (!canvas && typeof OffscreenCanvas !== 'function') throw new Error('video.grab: reading a frame needs an OffscreenCanvas');
            const surface = canvas ?? new OffscreenCanvas(width, height);
            const context = surface.getContext('2d', { willReadFrequently: true });
            const interval = fps > 0 && Number.isFinite(fps) ? 1e6 / fps : 0;
            let due = null;
            let last = null;
            let kept = 0;
            let skipped = 0;
            return {
                get counts() {
                    return { kept, skipped };
                },
                push(frame, timestamp = frame.timestamp) {
                    try {
                        if (!Number.isFinite(timestamp)) throw new RangeError(`video.grab: a frame pushed without a timestamp (${timestamp})`);
                        // A frame stamped at or before the last one kept: the clock stands still or went back
                        // (row B2d). The schedule starts again from it — a stalled clock gives no time to keep a
                        // rate by, so every frame is kept then, never none.
                        const restart = last !== null && timestamp <= last;
                        // The rate: a frame is kept when it reaches its due time, a quarter of an interval early at most.
                        if (!restart && due !== null && interval > 0 && timestamp < due - interval / 4) {
                            skipped++;
                            return null;
                        }
                        due = restart || due === null || timestamp > due + interval ? timestamp + interval : due + interval;
                        last = timestamp;
                        const sw = frame.displayWidth ?? frame.width;
                        const sh = frame.displayHeight ?? frame.height;
                        const scale = Math.min(width / sw, height / sh);
                        const dw = Math.round(sw * scale);
                        const dh = Math.round(sh * scale);
                        context.fillStyle = '#000';
                        context.fillRect(0, 0, width, height);
                        context.drawImage(frame, (width - dw) >> 1, (height - dh) >> 1, dw, dh);
                        kept++;
                        return context.getImageData(0, 0, width, height).data;
                    } finally {
                        frame.close();
                    }
                },
            };
        }

        /**
         * Drains a stream of frames through a reader, until it ends or is stopped.
         * @returns {{ done: Promise<void>, stop: () => void }}
         */
        /**
         * Drains a stream of frames through a reader, until it ends or is stopped. A frame that
         * fails is reported (`onError`) and the read goes on; `stop` ends a read that waits.
         * @returns {{ done: Promise<void>, stop: () => void }}
         */
        function read(stream, through, onFrame, onError = () => {}) {
            const input = stream.getReader();
            let stopped = false;
            const stop = () => {
                if (stopped) return;
                stopped = true;
                // Ends a read that waits for a frame; the source is told.
                input.cancel().catch(() => {});
            };
            const done = (async () => {
                try {
                    while (!stopped) {
                        const { value, done: ended } = await input.read();
                        if (ended || stopped) {
                            if (value && typeof value.close === 'function') value.close();
                            return;
                        }
                        try {
                            const timestamp = value.timestamp;
                            const rgba = through.push(value, timestamp);
                            if (rgba) onFrame(rgba, timestamp);
                        } catch (error) {
                            onError(error);
                        }
                    }
                } catch (error) {
                    if (!stopped) onError(error);
                } finally {
                    stop();
                }
            })();
            return { done, stop };
        }

        /**
         * Takes, on a worker's scope, what a page's `attach` posts. One stream is read at a time: a
         * new one stops the last. `stop` ends the current read.
         * @returns {{ stop: () => void }}
         */
        function receive(scope, through, onFrame, onError = () => {}) {
            let current = null;
            scope.addEventListener('message', ({ data }) => {
                if (!data || typeof data !== 'object') return;
                if (data.type === 'grab-stream') {
                    if (current) current.stop();
                    current = read(data.stream, through, onFrame, onError);
                } else if (data.type === 'grab-frame') {
                    try {
                        const rgba = through.push(data.frame, data.timestamp);
                        if (rgba) onFrame(rgba, data.timestamp);
                    } catch (error) {
                        onError(error);
                    }
                }
            });
            return {
                stop() {
                    if (current) current.stop();
                    current = null;
                },
            };
        }

        return { supported, source, reader, read, receive };
    },
};
