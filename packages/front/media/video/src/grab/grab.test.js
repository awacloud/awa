// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.grab` (row B2a). Bun has no camera, no
 * `VideoFrame`, no canvas: the module is checked to refuse cleanly, and
 * its worker side is run on stand-ins for the canvas and the frames. The
 * browser leg is `bench/grab/check.html`.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const grab = runtime.resolve('video.grab');

/** A canvas stand-in that records what is drawn and gives a filled picture back. */
function fakeCanvas() {
    const calls = [];
    const context = {
        fillStyle: null,
        fillRect: (...a) => calls.push(['fillRect', context.fillStyle, ...a]),
        drawImage: (source, ...a) => calls.push(['drawImage', source.id, ...a]),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(7) }),
    };
    return { calls, getContext: () => context };
}

/** A `VideoFrame` stand-in: a size, a timestamp in microseconds, a close count. */
function frame(id, timestamp, width = 1280, height = 720) {
    return { id, timestamp, displayWidth: width, displayHeight: height, closed: 0, close() { this.closed++; } };
}

describe('video.grab without a browser', () => {
    test('says nothing is there, and refuses a source with a clear error', () => {
        expect(grab.supported()).toEqual({ processor: false, offscreen: false, bitmaps: false });
        expect(() => grab.source({ kind: 'video' })).toThrow(/video.grab/);
        expect(() => grab.reader({ width: 64, height: 32 })).toThrow(/OffscreenCanvas/);
    });
});

describe('video.grab reader', () => {
    test('gives RGBA of the asked size, the picture fitted and centred on black, and closes each input', () => {
        const canvas = fakeCanvas();
        const reader = grab.reader({ width: 640, height: 360, canvas });
        const wide = frame('a', 0, 1280, 720);
        const out = reader.push(wide);
        expect(out).toBeInstanceOf(Uint8ClampedArray);
        expect(out.length).toBe(640 * 360 * 4);
        expect(wide.closed).toBe(1);
        expect(canvas.calls).toEqual([['fillRect', '#000', 0, 0, 640, 360], ['drawImage', 'a', 0, 0, 640, 360]]);
        canvas.calls.length = 0;
        reader.push(frame('b', 100000, 640, 480));          // 4:3 into 16:9: borders left and right
        expect(canvas.calls[1]).toEqual(['drawImage', 'b', 80, 0, 480, 360]);
        canvas.calls.length = 0;
        const small = grab.reader({ width: 320, height: 192, canvas });
        small.push(frame('c', 0, 1920, 1080));              // borders above and below
        expect(canvas.calls[1]).toEqual(['drawImage', 'c', 0, 6, 320, 180]);
    });

    test('takes an ImageBitmap with its timestamp given apart', () => {
        const canvas = fakeCanvas();
        const reader = grab.reader({ width: 64, height: 32, canvas });
        const bitmap = { id: 'bm', width: 64, height: 32, closed: 0, close() { this.closed++; } };
        expect(reader.push(bitmap, 0)).toHaveLength(64 * 32 * 4);
        expect(bitmap.closed).toBe(1);
        expect(canvas.calls[1]).toEqual(['drawImage', 'bm', 0, 0, 64, 32]);
    });

    test('keeps the asked rate by the timestamps, skipping and closing the rest', () => {
        for (const [fps, kept] of [[15, 15], [20, 20], [30, 30], [undefined, 30]]) {
            const reader = grab.reader({ width: 16, height: 16, fps, canvas: fakeCanvas() });
            const frames = Array.from({ length: 30 }, (_, k) => frame(k, Math.round((k * 1e6) / 30)));
            const outs = frames.map((f) => reader.push(f));
            expect(outs.filter(Boolean)).toHaveLength(kept);
            expect(frames.every((f) => f.closed === 1)).toBe(true);
            expect(reader.counts).toEqual({ kept, skipped: 30 - kept });
        }
    });

    test('after a stall, it starts again from the frame that comes', () => {
        const reader = grab.reader({ width: 16, height: 16, fps: 10, canvas: fakeCanvas() });
        expect(reader.push(frame(0, 0))).not.toBeNull();
        expect(reader.push(frame(1, 5e6))).not.toBeNull();       // five seconds later
        expect(reader.push(frame(2, 5e6 + 50000))).toBeNull();   // 50 ms after it: under 1 / 10 s
        expect(reader.push(frame(3, 5e6 + 100000))).not.toBeNull();
    });

    test('a clock that stands still or goes back never freezes it: the schedule starts again (row B2d)', () => {
        // Standing still: no time to keep a rate by, so every frame is kept — never none.
        const still = grab.reader({ width: 16, height: 16, fps: 30, canvas: fakeCanvas() });
        const stuck = Array.from({ length: 10 }, (_, k) => still.push(frame(k, 1234)));
        expect(stuck.every(Boolean)).toBe(true);
        expect(still.counts).toEqual({ kept: 10, skipped: 0 });
        // Going back (a clock reset): kept, and the rate follows from there.
        const reset = grab.reader({ width: 16, height: 16, fps: 15, canvas: fakeCanvas() });
        const at = (k) => Math.round((k * 1e6) / 30);
        const before = [0, 1, 2, 3].map((k) => reset.push(frame(k, 9e6 + at(k))));
        expect(before.map(Boolean)).toEqual([true, false, true, false]);
        const after = [0, 1, 2, 3, 4].map((k) => reset.push(frame(10 + k, at(k))));
        expect(after.map(Boolean)).toEqual([true, false, true, false, true]);
    });
});

describe('video.grab worker side', () => {
    test('read drains a stream of frames through a reader, in order, until it ends', async () => {
        const reader = grab.reader({ width: 16, height: 16, canvas: fakeCanvas() });
        const frames = Array.from({ length: 5 }, (_, k) => frame(k, k * 40000));
        const stream = new ReadableStream({ start(controller) { for (const f of frames) controller.enqueue(f); controller.close(); } });
        const seen = [];
        await grab.read(stream, reader, (rgba, timestamp) => seen.push(timestamp)).done;
        expect(seen).toEqual([0, 40000, 80000, 120000, 160000]);
        expect(frames.every((f) => f.closed === 1)).toBe(true);
    });

    test('read can be stopped', async () => {
        const reader = grab.reader({ width: 16, height: 16, canvas: fakeCanvas() });
        let k = 0;
        const stream = new ReadableStream({ pull(controller) { controller.enqueue(frame(k, k++ * 33333)); } });
        let count = 0;
        const reading = grab.read(stream, reader, () => { if (++count === 3) reading.stop(); });
        await reading.done;
        expect(count).toBe(3);
    });

    test('receive takes a transferred stream or posted bitmaps on a scope', async () => {
        const reader = grab.reader({ width: 16, height: 16, canvas: fakeCanvas() });
        const scope = new EventTarget();
        const send = (data) => scope.dispatchEvent(new MessageEvent('message', { data }));
        const seen = [];
        grab.receive(scope, reader, (rgba, timestamp) => seen.push(timestamp));
        send({ type: 'grab-frame', frame: { id: 'x', width: 16, height: 16, close() {} }, timestamp: 1000 });
        const stream = new ReadableStream({ start(controller) { controller.enqueue(frame('s', 2000000)); controller.close(); } });
        send({ type: 'grab-stream', stream });
        send({ type: 'something else' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(seen).toEqual([1000, 2000000]);
    });
});

describe('video.grab, hardened (pass P)', () => {
    test('stop ends a read that waits for a frame, and cancels the stream', async () => {
        const reader = grab.reader({ width: 16, height: 16, canvas: fakeCanvas() });
        let cancelled = false;
        const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } });
        const reading = grab.read(stream, reader, () => {});
        await new Promise((resolve) => setTimeout(resolve, 5));
        reading.stop();
        await reading.done;
        expect(cancelled).toBe(true);
    });

    test('a frame that fails is reported and the read goes on', async () => {
        let k = 0;
        const reader = { push: (f) => { if (f.id === 1) throw new Error('drawImage failed'); f.close(); return new Uint8ClampedArray(4); } };
        const frames = Array.from({ length: 3 }, () => frame(k, k++ * 33333));
        const stream = new ReadableStream({ start(controller) { for (const f of frames) controller.enqueue(f); controller.close(); } });
        const seen = [];
        const errors = [];
        await grab.read(stream, reader, (rgba, timestamp) => seen.push(timestamp), (error) => errors.push(error.message)).done;
        expect(seen).toEqual([0, 66666]);
        expect(errors).toEqual(['drawImage failed']);
    });

    test('a second stream given to receive stops the first; stop() stops the current one', async () => {
        const reader = grab.reader({ width: 16, height: 16, canvas: fakeCanvas() });
        const scope = new EventTarget();
        const send = (data) => scope.dispatchEvent(new MessageEvent('message', { data }));
        const cancelled = [];
        const waiting = (name) => new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled.push(name); } });
        const receiving = grab.receive(scope, reader, () => {});
        send({ type: 'grab-stream', stream: waiting('first') });
        send({ type: 'grab-stream', stream: waiting('second') });
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(cancelled).toEqual(['first']);
        receiving.stop();
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(cancelled).toEqual(['first', 'second']);
    });

    test('a frame pushed without a timestamp is refused, and closed', () => {
        const reader = grab.reader({ width: 16, height: 16, fps: 30, canvas: fakeCanvas() });
        const bitmap = { id: 'b', width: 16, height: 16, closed: 0, close() { this.closed++; } };
        expect(() => reader.push(bitmap)).toThrow(RangeError);
        expect(bitmap.closed).toBe(1);
    });
});
