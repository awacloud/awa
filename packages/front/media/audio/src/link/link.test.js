// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `audio.link` (rows B1b, B4c, B5b1): the codec
 * between a capture port and a playback port, in a worker's scope, its
 * packets in `media.frame` frames. The scope and the worklet ports are
 * stood in for by message channels.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate as deflateModule } from '@awacloud/fw/io/compress/deflate.js';
import { mediaAudioModules } from '../main.js';
import { frameModule } from '@awacloud/media-stream/frame';
import { signals } from '../../bench/lib/signals.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);
runtime.registerDeep(deflateModule);
runtime.registerDeep(frameModule);
const link = runtime.resolve('audio.link');
const codec = runtime.resolve('audio.codec');
const frame = runtime.resolve('media.frame');
const gate = runtime.resolve('audio.gate');
/** The fw `deflate` module: what a worker gives `attach` for the lossless stage. */
const deflate = runtime.resolve('deflate');
const [, , , voiced] = signals({ rate: 48000, seconds: 1, seed: 3 }).map((s) => s.samples);
const FRAMES = 60;

/** A worker scope: messages in through `send`, out into `replies`. */
function fakeScope() {
    const target = new EventTarget();
    const replies = [];
    target.postMessage = (data) => replies.push(data);
    target.send = (data) => target.dispatchEvent(new MessageEvent('message', { data }));
    return { scope: target, replies };
}

/** Collects the messages of a port until `count` arrived. */
function collect(port, count) {
    const got = [];
    return new Promise((resolve) => {
        port.onmessage = ({ data }) => {
            got.push(data);
            if (got.length === count) resolve(got);
        };
    });
}

const reply = (replies, type) => new Promise((resolve) => {
    const look = () => {
        const found = replies.find((r) => r.type === type);
        if (found) resolve(found);
        else setTimeout(look, 1);
    };
    look();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The codec's packets for the first `count` frames. */
function packetsOf(config, count = FRAMES) {
    const encoder = codec.createEncoder(config);
    const out = [];
    for (let f = 0; f < count; f++) out.push(...encoder.push(voiced.subarray(f * 128, (f + 1) * 128)).map((p) => p.slice()));
    return out;
}

/** What audio.codec gives for the same frames, run directly; `lost` packets are told to the decoder. */
function direct(config, lost = new Set()) {
    const decoder = codec.createDecoder({ rate: config.rate });
    const out = [];
    packetsOf(config).forEach((packet, k) => out.push(...(lost.has(k) ? decoder.lose() : decoder.push(packet))));
    return out;
}

/** Opens a link on fresh ports; returns them and the scope. */
async function opened(options, attachOptions = {}) {
    const { scope, replies } = fakeScope();
    link.attach(scope, attachOptions);
    const capture = new MessageChannel();
    const playback = new MessageChannel();
    const { transport: wanted, ...rest } = options;
    const transport = wanted ? new MessageChannel() : null;
    scope.send({ type: 'open', capture: capture.port2, playback: playback.port2, transport: transport ? transport.port2 : null, ...rest });
    await reply(replies, 'opened');
    const close = () => {
        scope.send({ type: 'close' });
        for (const port of [capture.port1, playback.port1, transport && transport.port1]) if (port) port.close();
    };
    const feed = (count = FRAMES) => {
        for (let f = 0; f < count; f++) capture.port1.postMessage(voiced.slice(f * 128, (f + 1) * 128));
    };
    return { scope, replies, capture, playback, transport, close, feed };
}

describe('audio.link', () => {
    test('loops the frames through the codec in groups: the playback port gets what audio.codec gives', async () => {
        for (const group of [1, 3, undefined]) {
            const config = { rate: 48000, preset: 'voice' };
            const l = await opened({ config, group });
            const arriving = collect(l.playback.port1, FRAMES);
            l.feed();
            const got = await arriving;
            expect(got.every((f) => f instanceof Float32Array && f.length === 128)).toBe(true);
            expect(got).toEqual(direct(config));
            l.scope.send({ type: 'stats' });
            expect((await reply(l.replies, 'stats')).sent).toBe(FRAMES / (group ?? 4));
            l.close();
        }
    });

    test('frames leave on a transport, four packets each by default, and arriving frames are played', async () => {
        const config = { rate: 48000, preset: 'music' };
        const l = await opened({ config, transport: true });
        const leaving = collect(l.transport.port1, FRAMES / 4);
        l.feed();
        const frames = await leaving;
        const packets = packetsOf(config);
        frames.forEach((bytes, i) => {
            const read = frame.read(bytes);
            expect(read).toMatchObject({ kind: 'audio', layer: 0, sequence: i, time: i * 4, deflated: false });
            // Four packets, each behind its length.
            const parts = [];
            let at = 0;
            while (at < read.payload.length) {
                let length = 0;
                let shift = 0;
                let b;
                do {
                    b = read.payload[at++];
                    length |= (b & 0x7f) << shift;
                    shift += 7;
                } while (b & 0x80);
                parts.push(read.payload.slice(at, at + length));
                at += length;
            }
            expect(parts).toEqual(packets.slice(i * 4, i * 4 + 4));
        });
        const arriving = collect(l.playback.port1, FRAMES);
        for (const bytes of frames) l.transport.port1.postMessage(bytes);
        expect(await arriving).toEqual(direct(config));
        l.close();
    });

    test('a frame missing on the way is stood in for by decoder.lose(); a late and a repeated frame change nothing', async () => {
        const config = { rate: 48000, preset: 'voice' };
        const l = await opened({ config, transport: true });
        const leaving = collect(l.transport.port1, FRAMES / 4);
        l.feed();
        const frames = await leaving;
        // Frames 3 and 7 to 8 withheld; frame 3 then comes late, frame 10 twice.
        const withheld = new Set([3, 7, 8]);
        const lost = new Set([...withheld].flatMap((i) => [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3]));
        const arriving = collect(l.playback.port1, FRAMES);
        frames.forEach((bytes, i) => {
            if (!withheld.has(i)) l.transport.port1.postMessage(bytes);
            if (i === 5) l.transport.port1.postMessage(frames[3]);
            if (i === 10) l.transport.port1.postMessage(bytes);
        });
        expect(await arriving).toEqual(direct(config, lost));
        await settle();
        l.scope.send({ type: 'stats' });
        expect(await reply(l.replies, 'stats')).toMatchObject({ lost: 3, concealed: 12, late: 1, repeats: 1, decoded: FRAMES - 12 });
        l.close();
    });

    test('with the deflate option the frame keeps the smaller; the wire bytes are counted', async () => {
        const config = { rate: 48000, preset: 'voice' };
        const l = await opened({ config, transport: true, deflate: true }, { deflate, wait: 10 });
        const leaving = collect(l.transport.port1, FRAMES / 4);
        l.feed();
        const frames = await leaving;
        const packets = packetsOf(config);
        // The same frames as a media.frame writer with the lossless stage makes of the same payloads.
        const writer = frame.createWriter({ kind: 'audio', deflate, lossless: true });
        const lengthOf = (n) => (n < 128 ? [n] : [(n & 0x7f) | 0x80, n >> 7]);
        const expected = frames.map((_, i) => {
            const group = packets.slice(i * 4, i * 4 + 4);
            const payload = Uint8Array.from(group.flatMap((p) => [...lengthOf(p.length), ...p]));
            return writer.write(payload, { time: i * 4 });
        });
        expect(frames).toEqual(expected);
        const arriving = collect(l.playback.port1, FRAMES);
        for (const bytes of frames) l.transport.port1.postMessage(bytes);
        expect(await arriving).toEqual(direct(config));
        l.scope.send({ type: 'stats' });
        const stats = await reply(l.replies, 'stats');
        expect(stats.bytes).toBe(packets.reduce((sum, p) => sum + p.length, 0));
        expect(stats.wireBytes).toBe(frames.reduce((sum, f) => sum + f.length, 0));
        expect(stats.deflatedBytes).toBeUndefined();
        l.close();
        // Asked without a deflate given to attach: an error, no link.
        const { scope, replies } = fakeScope();
        link.attach(scope);
        const c = new MessageChannel();
        const p = new MessageChannel();
        scope.send({ type: 'open', capture: c.port2, playback: p.port2, config: { rate: 48000 }, deflate: true });
        expect((await reply(replies, 'error')).message).toMatch(/deflate/);
        expect(replies.filter((r) => r.type === 'opened')).toHaveLength(0);
        for (const port of [c.port1, p.port1]) port.close();
    });

    test('with a gate, nothing leaves while silent but one frame saying so, and its level reaches the playback (row A8b)', async () => {
        const config = { rate: 48000, preset: 'voice' };
        // Eight loud frames, twelve quiet ones (a noise of RMS about 0.0005), eight loud again.
        let x = 7;
        const quiet = () => new Float32Array(128).map(() => {
            x = (x * 1103515245 + 12345) >>> 0;
            return ((x / 2 ** 32) * 2 - 1) * 0.0005 * Math.sqrt(3);
        });
        const input = [...Array.from({ length: 8 }, (_, f) => voiced.slice(f * 128, (f + 1) * 128)), ...Array.from({ length: 12 }, quiet), ...Array.from({ length: 8 }, (_, f) => voiced.slice((f + 8) * 128, (f + 9) * 128))];
        const l = await opened({ config, transport: true, gate: { mode: 'counter', threshold: 0.001, hold: 2 } });
        const leaving = collect(l.transport.port1, 6);
        for (const f of input) l.capture.port1.postMessage(f.slice());
        const frames = await leaving;
        // The packets of frames 0-7 in two groups, 8-9 (the hold) in a short one, a silence, then 20-27.
        const encoder = codec.createEncoder(config);
        const packets = input.map((f) => encoder.push(f)[0].slice());
        const reads = frames.map((bytes) => frame.read(bytes));
        expect(reads.map((r) => r.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(reads[3].payload[0]).toBe(0);
        expect(Math.abs(10 ** (-reads[3].payload[1] / 40) / gate.level(input[10]) - 1)).toBeLessThan(0.06);
        const arriving = collect(l.playback.port1, 19);
        for (const bytes of frames) l.transport.port1.postMessage(bytes);
        const got = await arriving;
        const decoder = codec.createDecoder({ rate: 48000 });
        const expected = [...packets.slice(0, 10), ...packets.slice(20)].map((p) => decoder.push(p)[0]);
        expect(got.filter((m) => m instanceof Float32Array)).toEqual(expected);
        const said = got.find((m) => m && m.type === 'silence');
        expect(Math.abs(said.level / gate.level(input[10]) - 1)).toBeLessThan(0.06);
        expect(got.indexOf(said)).toBe(10);
        l.scope.send({ type: 'stats' });
        expect(await reply(l.replies, 'stats')).toMatchObject({ gated: 10, silences: 1, lost: 0, sent: 6 });
        l.close();
        // A bad gate: an error, no link.
        const { scope, replies } = fakeScope();
        link.attach(scope);
        const c = new MessageChannel();
        const p = new MessageChannel();
        scope.send({ type: 'open', capture: c.port2, playback: p.port2, config: { rate: 48000 }, gate: { mode: 'counter', threshold: -1 } });
        expect((await reply(replies, 'error')).message).toMatch(/audio.gate/);
        expect(replies.filter((r) => r.type === 'opened')).toHaveLength(0);
        for (const port of [c.port1, p.port1]) port.close();
    });

    test("gate: true takes the owner's values (D22): 0.004, a hold of 96 frames", async () => {
        const config = { rate: 48000, preset: 'voice' };
        let x = 11;
        const quiet = () => new Float32Array(128).map(() => {
            x = (x * 1103515245 + 12345) >>> 0;
            return ((x / 2 ** 32) * 2 - 1) * 0.002 * Math.sqrt(3);
        });
        const l = await opened({ config, gate: true });
        // Eight frames well over the threshold (RMS 0.1), then a hundred under it (RMS 0.002).
        for (let f = 0; f < 8; f++) l.capture.port1.postMessage(new Float32Array(128).map((_, i) => (i % 2 ? 0.1 : -0.1)));
        for (let f = 0; f < 100; f++) l.capture.port1.postMessage(quiet());
        await settle();
        l.scope.send({ type: 'stats' });
        expect(await reply(l.replies, 'stats')).toMatchObject({ frames: 108, gated: 4, silences: 1 });
        l.close();
    });

    test('a damaged frame on the transport is answered with an error, and the link goes on', async () => {
        const config = { rate: 48000, preset: 'voice' };
        const l = await opened({ config, transport: true });
        const leaving = collect(l.transport.port1, 2);
        l.feed(8);
        const [first, second] = await leaving;
        const arriving = collect(l.playback.port1, 4);
        l.transport.port1.postMessage(Uint8Array.from([0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]));
        l.transport.port1.postMessage(first);
        await arriving;
        expect((await reply(l.replies, 'error')).message).toMatch(/media.frame/);
        const more = collect(l.playback.port1, 4);
        l.transport.port1.postMessage(second);
        expect(await more).toHaveLength(4);
        l.close();
    });

    test('answers stats with its counts, and its times when given a timer', async () => {
        let tick = 0;
        const l = await opened({ config: { rate: 48000, preset: 'voice' } }, { now: () => tick++ });
        const arriving = collect(l.playback.port1, 8);
        l.feed(10);
        await arriving;
        // The playback processor's side: it answers the link's question on its port.
        l.playback.port1.onmessage = ({ data }) => {
            if (data && data.type === 'stats') l.playback.port1.postMessage({ type: 'stats', queued: 2, played: 8, underruns: 1, dropped: 0, silences: 1, comforted: 5 });
        };
        l.scope.send({ type: 'stats' });
        const stats = await reply(l.replies, 'stats');
        // Ten frames captured: two full groups sent and played, two packets waiting for the third.
        expect(stats).toMatchObject({ frames: 10, packets: 10, sent: 2, decoded: 8, lost: 0, playback: { queued: 2, played: 8, underruns: 1, dropped: 0, silences: 1, comforted: 5 } });
        expect(stats.bytes).toBeGreaterThan(30);
        const sent = packetsOf({ rate: 48000, preset: 'voice' }, 8);
        expect(stats.wireBytes).toBe(sent.reduce((sum, p) => sum + p.length + (p.length < 128 ? 1 : 2), 0) + 2 * frame.HEADER);
        expect(stats.encodeMs).toBeGreaterThan(0);
        expect(stats.decodeMs).toBeGreaterThan(0);
        l.close();
    });

    test('without a timer, it times nothing', async () => {
        const l = await opened({ config: { rate: 48000 } }, { wait: 20 });
        l.scope.send({ type: 'stats' });
        const stats = await reply(l.replies, 'stats');
        expect(stats.encodeMs).toBeNull();
        expect(stats.decodeMs).toBeNull();
        expect(stats.playback).toBeNull();       // nothing answered on the playback port
        l.close();
    });

    test('a bad configuration is answered with an error, not thrown', async () => {
        const { scope, replies } = fakeScope();
        link.attach(scope);
        const capture = new MessageChannel();
        const playback = new MessageChannel();
        expect(() => scope.send({ type: 'open', capture: capture.port2, playback: playback.port2, config: { rate: 32000 } })).not.toThrow();
        expect((await reply(replies, 'error')).message).toMatch(/rate/);
        expect(() => scope.send({ type: 'open', config: {} })).not.toThrow();
        expect(() => scope.send({ type: 'open', capture: capture.port2, playback: playback.port2, config: { rate: 48000 }, group: 0 })).not.toThrow();
        await settle();
        expect(replies.filter((r) => r.type === 'error')).toHaveLength(3);
        expect(replies.at(-1).message).toMatch(/group/);
        capture.port1.close();
        playback.port1.close();
    });
});

describe('audio.link, hardened (pass P)', () => {
    test('`conceal` reaches the link\'s decoder: a lost frame is filled the way asked', async () => {
        const config = { rate: 48000, preset: 'voice' };
        const l = await opened({ config, transport: true, conceal: 'repeat' });
        const leaving = collect(l.transport.port1, FRAMES / 4);
        l.feed();
        const frames = await leaving;
        const decoder = codec.createDecoder({ rate: 48000, conceal: 'repeat' });
        const expected = [];
        packetsOf(config).forEach((p, k) => expected.push(...(k >= 8 && k < 12 ? decoder.lose() : decoder.push(p))));
        const arriving = collect(l.playback.port1, FRAMES);
        frames.forEach((bytes, i) => { if (i !== 2) l.transport.port1.postMessage(bytes); });
        expect(await arriving).toEqual(expected);
        l.close();
    });

    test('a damaged packet inside a frame is concealed alone; the others play', async () => {
        const config = { rate: 48000, preset: 'voice' };
        const l = await opened({ config, transport: true });
        const leaving = collect(l.transport.port1, 2);
        l.feed(8);
        const [first, second] = await leaving;
        // The first frame again, its second packet replaced by three bytes no decoder takes.
        const read = frame.read(first);
        const packets = packetsOf(config, 8);
        const lengthOf = (n) => (n < 128 ? [n] : [(n & 0x7f) | 0x80, n >> 7]);
        const group = [packets[0], Uint8Array.of(0, 0, 0), packets[2], packets[3]];
        const payload = Uint8Array.from(group.flatMap((p) => [...lengthOf(p.length), ...p]));
        const damaged = new Uint8Array(12 + payload.length);
        damaged.set(first.subarray(0, 12));
        damaged.set(payload, 12);
        expect(read.sequence).toBe(0);
        const decoder = codec.createDecoder({ rate: 48000 });
        const expected = [packets[0], null, packets[2], packets[3], ...packets.slice(4, 8)].flatMap((p) => (p ? decoder.push(p) : decoder.lose()));
        const arriving = collect(l.playback.port1, 8);
        l.transport.port1.postMessage(damaged);
        l.transport.port1.postMessage(second);
        expect(await arriving).toEqual(expected);
        l.scope.send({ type: 'stats' });
        expect(await reply(l.replies, 'stats')).toMatchObject({ damaged: 1, concealed: 1 });
        l.close();
    });

    test('what is not bytes on the transport is counted, not silently dropped', async () => {
        const l = await opened({ config: { rate: 48000 }, transport: true }, { wait: 10 });
        l.transport.port1.postMessage(new ArrayBuffer(8));
        l.transport.port1.postMessage('hello');
        await settle();
        l.scope.send({ type: 'stats' });
        expect(await reply(l.replies, 'stats')).toMatchObject({ ignored: 2 });
        l.close();
    });
});
