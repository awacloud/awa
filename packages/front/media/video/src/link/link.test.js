// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `video.link` (rows B2b, B4b, B4c, B5b2): the video codec in a
 * worker, from the grab to the picture. The worker's scope, the canvases
 * and the frames are stood in for; the GPU way is proven in Chromium
 * (`bench/link/loop.html`).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { deflate as deflateModule } from '@awacloud/fw/io/compress/deflate.js';
import { frameModule } from '@awacloud/media-stream/frame';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
runtime.registerDeep(deflateModule);
const link = runtime.resolve('video.link');
const codec = runtime.resolve('video.codec');
/** The fw `deflate` module: what a worker gives `attach` for the lossless stage. */
const deflate = runtime.resolve('deflate');
runtime.registerDeep(frameModule);
const frame = runtime.resolve('media.frame');
const pack = runtime.resolve('video.pack');

const W = 128;
const H = 64;
const FPS = 24;
const FRAMES = 12;
const sequence = sequences({ width: W, height: H, frames: FRAMES, fps: FPS, seed: 2 }).find((s) => s.name === 'shapes');
const source = Array.from({ length: FRAMES }, (_, t) => sequence.frame(t));

/** A worker scope: messages in through `send`, out into `replies`. */
function fakeScope() {
    const target = new EventTarget();
    const replies = [];
    target.postMessage = (data) => replies.push(data);
    target.send = (data) => target.dispatchEvent(new MessageEvent('message', { data }));
    return { scope: target, replies };
}

/** The grab's canvas: what is drawn on it is the frame's own picture. */
function grabCanvas() {
    let current = null;
    return { getContext: () => ({ fillRect() {}, drawImage(frame) { current = frame; }, getImageData: () => ({ data: current.rgba.slice() }) }) };
}

/** A display canvas with a 2D context that keeps the last picture put. */
function displayCanvas() {
    const shown = [];
    const context = {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (image) => shown.push(image.data.slice()),
    };
    return { shown, width: 0, height: 0, getContext: (kind) => (kind === '2d' ? context : null) };
}

const frameAt = (t) => ({ timestamp: Math.round((t * 1e6) / FPS), displayWidth: W, displayHeight: H, rgba: source[t], close() {} });

/** What video.codec gives for the same frames, run directly. */
function direct(preset) {
    const encoder = codec.createEncoder({ width: W, height: H, fps: FPS, preset });
    const decoder = codec.createDecoder({ width: W, height: H });
    const pictures = [];
    for (const frame of source) for (const packet of encoder.push(frame)) pictures.push(decoder.push(packet).slice());
    return pictures;
}

const reply = (replies, type) => new Promise((resolve) => {
    const look = () => {
        const found = replies.find((r) => r.type === type);
        if (found) resolve(found);
        else setTimeout(look, 1);
    };
    look();
});

/** A picture's media time on the wire: the grab's timestamp in milliseconds. */
const timeOf = (t) => Math.round(frameAt(t).timestamp / 1000);

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The codec's packets for the source, run directly. */
function packetsOf(preset) {
    const encoder = codec.createEncoder({ width: W, height: H, fps: FPS, preset });
    return source.flatMap((picture) => encoder.push(picture).map((packet) => packet.slice()));
}

/** A link on a transport, fed the source: the frames it sent, the scope to read. */
async function onTransport(preset, open = {}, options = {}) {
    const { scope, replies } = fakeScope();
    link.attach(scope, options);
    const transport = new MessageChannel();
    scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset }, surface: grabCanvas(), transport: transport.port2, ...open });
    await reply(replies, 'opened');
    const frames = [];
    transport.port1.onmessage = ({ data }) => frames.push(data);
    feed(scope);
    await settle();
    transport.port1.onmessage = null;
    return { scope, replies, frames, transport };
}

function feed(scope) {
    for (let t = 0; t < FRAMES; t++) scope.send({ type: 'grab-frame', frame: frameAt(t), timestamp: frameAt(t).timestamp });
}

describe('video.link', () => {
    test('loops the grabbed frames through the codec: the pictures are those of video.codec', async () => {
        const { scope, replies } = fakeScope();
        link.attach(scope);
        scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'standard' }, surface: grabCanvas() });
        const opened = await reply(replies, 'opened');
        expect(opened).toMatchObject({ coded: { width: W, height: H, fps: FPS }, display: 'none' });
        feed(scope);
        const pictures = replies.filter((r) => r.type === 'picture').map((r) => r.picture);
        expect(pictures).toEqual(direct('standard'));
        scope.send({ type: 'close' });
    });

    test('draws on a display canvas, on a 2D context where there is no GPU', async () => {
        const { scope, replies } = fakeScope();
        link.attach(scope);
        const canvas = displayCanvas();
        scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'quality' }, surface: grabCanvas(), canvas });
        expect((await reply(replies, 'opened')).display).toBe('cpu');
        feed(scope);
        expect([canvas.width, canvas.height]).toEqual([W, H]);
        expect(canvas.shown).toEqual(direct('quality'));
        scope.send({ type: 'close' });
    });

    test('with a transport port, frames leave on it — a frame a unit — and arriving frames are shown', async () => {
        const { scope, replies } = fakeScope();
        link.attach(scope);
        const transport = new MessageChannel();
        scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'economy' }, surface: grabCanvas(), transport: transport.port2 });
        await reply(replies, 'opened');
        const frames = [];
        transport.port1.onmessage = ({ data }) => frames.push(data);
        feed(scope);
        await settle();
        expect(replies.filter((r) => r.type === 'picture')).toHaveLength(0);
        // The same packets, unit by unit, as media.frame frames.
        const encoder = codec.createEncoder({ width: W, height: H, fps: FPS, preset: 'economy' });
        const expected = [];
        const writer = frame.createWriter({ kind: 'video' });
        source.forEach((picture, t) => {
            for (const packet of encoder.push(picture)) {
                for (const unit of pack.readUnits(packet)) expected.push(writer.write(unit.bytes, { layer: unit.type, time: timeOf(t) }));
            }
        });
        expect(frames).toEqual(expected);
        expect(frame.header(frames[0])).toMatchObject({ kind: 'video', layer: 0, sequence: 0 });
        for (const bytes of frames) transport.port1.postMessage(bytes);
        await settle();
        expect(replies.filter((r) => r.type === 'picture').map((r) => r.picture)).toEqual(direct('economy'));
        scope.send({ type: 'close' });
        transport.port1.close();
    });

    test('frames of a picture arriving out of order give the same picture', async () => {
        const { scope, replies, frames, transport } = await onTransport('standard');
        // Each picture's frames sent back finest detail first, the base last.
        const byTime = new Map();
        for (const bytes of frames) {
            const { time } = frame.header(bytes);
            if (!byTime.has(time)) byTime.set(time, []);
            byTime.get(time).push(bytes);
        }
        for (const group of byTime.values()) for (const bytes of group.reverse()) transport.port1.postMessage(bytes);
        await settle();
        expect(replies.filter((r) => r.type === 'picture').map((r) => r.picture)).toEqual(direct('standard'));
        scope.send({ type: 'close' });
        transport.port1.close();
    });

    test('answers stats, times what it was given a timer for, and lets a check observe', async () => {
        const { scope, replies } = fakeScope();
        let tick = 0;
        const seen = { grabbed: [], shown: 0 };
        link.attach(scope, { now: () => tick++, observe: { grabbed: (rgba, timestamp) => seen.grabbed.push(timestamp), shown: (peek) => { seen.shown++; seen.last = peek(); } } });
        scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'standard' }, surface: grabCanvas() });
        await reply(replies, 'opened');
        feed(scope);
        scope.send({ type: 'stats' });
        const stats = await reply(replies, 'stats');
        const packets = packetsOf('standard');
        expect(stats).toMatchObject({ grabbed: FRAMES, skipped: 0, coded: FRAMES, shown: direct('standard').length, display: 'none', lost: 0, late: 0 });
        expect(stats.packets).toBe(stats.shown);
        expect(stats.units).toBe(packets.reduce((sum, p) => sum + pack.readUnits(p).length, 0));
        expect(stats.bytes).toBe(packets.reduce((sum, p) => sum + p.length, 0));
        expect(stats.wireBytes).toBe(packets.reduce((sum, p) => sum + pack.readUnits(p).reduce((s, u) => s + frame.HEADER + u.bytes.length, 0), 0));
        expect(stats.keptWireBytes).toBe(stats.wireBytes);
        expect(stats.keptBytes).toBeUndefined();
        expect(stats.encodeMs).toBeGreaterThan(0);
        expect(stats.decodeMs).toBeGreaterThan(0);
        expect(seen.grabbed).toEqual(source.map((_, t) => frameAt(t).timestamp));
        expect(seen.shown).toBe(stats.shown);
        expect(seen.last).toEqual(direct('standard').at(-1));        // peek: the picture last shown
        scope.send({ type: 'close' });
    });

    test('drops frames by their header, between the encoder and the decoder, as a relay holding no key would', async () => {
        const { DETAIL, COLOUR } = pack.types;
        // Frames 0-3 whole, 4-7 without the finest detail level, 8-9 without colour nor details, 10-11 whole again.
        const rule = (t) => (t < 4 ? null : t < 8 ? { details: 1, colour: false } : t < 10 ? { details: 2, colour: true } : null);
        const cut = (packet, drop) => (!drop ? packet : pack.writeUnits(pack.readUnits(packet).filter((u) => !(drop.colour && u.type === COLOUR) && !(u.type >= DETAIL + 2 - drop.details))));
        const encoder = codec.createEncoder({ width: W, height: H, fps: FPS, preset: 'standard' });
        const decoder = codec.createDecoder({ width: W, height: H });
        const expected = [];
        let kept = 0;
        let sent = 0;
        source.forEach((picture, t) => {
            for (const packet of encoder.push(picture)) {
                const given = cut(packet, rule(t));
                for (const unit of pack.readUnits(packet)) sent += frame.HEADER + unit.bytes.length;
                for (const unit of pack.readUnits(given)) kept += frame.HEADER + unit.bytes.length;
                expected.push(decoder.push(given).slice());
            }
        });
        const { scope, replies } = fakeScope();
        link.attach(scope);
        scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'standard' }, surface: grabCanvas() });
        await reply(replies, 'opened');
        for (let t = 0; t < FRAMES; t++) {
            if (t === 4 || t === 8 || t === 10) scope.send({ type: 'drop', ...(rule(t) ?? { details: 0, colour: false }) });
            scope.send({ type: 'grab-frame', frame: frameAt(t), timestamp: frameAt(t).timestamp });
        }
        expect(replies.filter((r) => r.type === 'picture').map((r) => r.picture)).toEqual(expected);
        scope.send({ type: 'stats' });
        expect(await reply(replies, 'stats')).toMatchObject({ wireBytes: sent, keptWireBytes: kept });
        expect(kept).toBeLessThan(sent);
        // Asked for more levels than the stream has: all its details go, the base and the colour stay.
        scope.send({ type: 'drop', details: 9, colour: false });
        replies.length = 0;
        scope.send({ type: 'grab-frame', frame: frameAt(0), timestamp: 9e6 });
        expect(replies.filter((r) => r.type === 'picture')).toHaveLength(1);
        scope.send({ type: 'close' });
    });

    test('a lost detail frame: its picture shown without it; a lost base: its picture not shown, counted', async () => {
        const { scope, replies, frames, transport } = await onTransport('standard');
        const finest = pack.types.DETAIL + 1;
        // Picture 3 loses its finest detail, picture 6 its base.
        const at = (t) => timeOf(t);
        const withheld = (bytes) => {
            const h = frame.header(bytes);
            return (h.time === at(3) && h.layer === finest) || (h.time === at(6) && h.layer === pack.types.BASE);
        };
        const decoder = codec.createDecoder({ width: W, height: H });
        const expected = [];
        packetsOf('standard').forEach((packet, t) => {
            if (t === 6) return;
            const given = t === 3 ? pack.writeUnits(pack.readUnits(packet).filter((u) => u.type !== finest)) : packet;
            expected.push(decoder.push(given).slice());
        });
        for (const bytes of frames) if (!withheld(bytes)) transport.port1.postMessage(bytes);
        await settle();
        expect(replies.filter((r) => r.type === 'picture').map((r) => r.picture)).toEqual(expected);
        scope.send({ type: 'stats' });
        expect(await reply(replies, 'stats')).toMatchObject({ lost: 2, shown: FRAMES - 1 });
        scope.send({ type: 'close' });
        transport.port1.close();
    });

    test('with the deflate option each frame keeps the smaller, and the pictures do not change', async () => {
        const { scope, replies, frames, transport } = await onTransport('standard', { deflate: true }, { deflate });
        const writer = frame.createWriter({ kind: 'video', deflate, lossless: true });
        const expected = [];
        packetsOf('standard').forEach((packet, t) => {
            for (const unit of pack.readUnits(packet)) expected.push(writer.write(unit.bytes, { layer: unit.type, time: timeOf(t) }));
        });
        expect(frames).toEqual(expected);
        expect(frames.some((bytes) => frame.header(bytes).deflated)).toBe(true);
        for (const bytes of frames) transport.port1.postMessage(bytes);
        await settle();
        expect(replies.filter((r) => r.type === 'picture').map((r) => r.picture)).toEqual(direct('standard'));
        scope.send({ type: 'stats' });
        expect((await reply(replies, 'stats')).wireBytes).toBe(frames.reduce((sum, bytes) => sum + bytes.length, 0));
        scope.send({ type: 'close' });
        transport.port1.close();
        // Asked without a deflate given to attach: an error, no link.
        const bare = fakeScope();
        link.attach(bare.scope);
        bare.scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'standard' }, surface: grabCanvas(), deflate: true });
        expect((await reply(bare.replies, 'error')).message).toMatch(/deflate/);
        expect(bare.replies.filter((r) => r.type === 'opened')).toHaveLength(0);
    });

    test('a layer the relay gives back after dropping it counts no loss (pass P)', async () => {
        const { scope, replies } = fakeScope();
        link.attach(scope);
        scope.send({ type: 'open', config: { width: W, height: H, fps: FPS, preset: 'standard' }, surface: grabCanvas() });
        await reply(replies, 'opened');
        for (let t = 0; t < FRAMES; t++) {
            if (t === 3) scope.send({ type: 'drop', details: 2, colour: true });
            if (t === 8) scope.send({ type: 'drop', details: 0, colour: false });
            scope.send({ type: 'grab-frame', frame: frameAt(t), timestamp: frameAt(t).timestamp });
        }
        scope.send({ type: 'stats' });
        expect(await reply(replies, 'stats')).toMatchObject({ lost: 0, shown: FRAMES });
        scope.send({ type: 'close' });
    });

    test('a frame clock that stands still or goes back loses no picture (pass P)', async () => {
        // The grab keeps such frames (row B2d); the link must not drop them as late.
        for (const stamps of [Array.from({ length: FRAMES }, () => 5e6), Array.from({ length: FRAMES }, (_, t) => (t < 6 ? 9e6 + t * 41667 : (t - 6) * 41667))]) {
            const { scope, replies } = fakeScope();
            link.attach(scope);
            scope.send({ type: 'open', config: { width: W, height: H, fps: FPS * 100, preset: 'standard' }, surface: grabCanvas() });
            await reply(replies, 'opened');
            stamps.forEach((timestamp, t) => scope.send({ type: 'grab-frame', frame: frameAt(t), timestamp }));
            scope.send({ type: 'stats' });
            expect(await reply(replies, 'stats')).toMatchObject({ coded: FRAMES, shown: FRAMES, late: 0 });
            scope.send({ type: 'close' });
        }
    });

    test('a damaged frame on the transport is answered with an error, and the link goes on', async () => {
        const { scope, replies, frames, transport } = await onTransport('standard');
        transport.port1.postMessage(Uint8Array.from([0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]));
        for (const bytes of frames) transport.port1.postMessage(bytes);
        await settle();
        expect((await reply(replies, 'error')).message).toMatch(/media.frame/);
        expect(replies.filter((r) => r.type === 'picture')).toHaveLength(FRAMES);
        scope.send({ type: 'close' });
        transport.port1.close();
    });

    test('a bad configuration is answered with an error, not thrown', async () => {
        const { scope, replies } = fakeScope();
        link.attach(scope);
        expect(() => scope.send({ type: 'open', config: { width: 100, height: 62, fps: FPS, preset: 'standard' }, surface: grabCanvas() })).not.toThrow();
        expect((await reply(replies, 'error')).message).toMatch(/video.codec/);
        // Frames before a good open are let go.
        expect(() => feed(scope)).not.toThrow();
    });
});
