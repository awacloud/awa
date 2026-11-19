// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.link` — the codec between a capture port and a
 * playback port, run in a worker, its packets sent in `media.frame` frames.
 *
 * A worker attaches it to its own scope (`attach(self)`). The page then
 * hands it, in one `open` message, the port of an `audio.webaudio`
 * capture node, the port of a playback node and the codec's
 * configuration: from there the frames go from the audio thread to the
 * encoder and from the decoder back to the audio thread, without the
 * page's thread.
 *
 * What travels is a frame of the stream package (row B5b1, rulings D19
 * and D20): `group` codec packets (4 by default), each behind its length
 * (an unsigned LEB128), the media time the index of its first 128-sample
 * frame. Frames loop back inside the worker, or — given a `transport`
 * port — leave on it, and the frames that arrive on it are played: the
 * place where a stream to a peer plugs in. A frame behind a gap in the
 * sequence stands in for the missing ones: `decoder.lose()` once for each
 * packet they carried, at most `MAX_CONCEAL` frames; a late or repeated
 * frame is dropped. Packets that do not yet fill a group wait for it.
 *
 * With `gate` (`true` for the owner's values — a counter, 0.004, a hold of
 * 96 frames, D22 — or the `audio.gate` options; row A8b) each captured frame is
 * asked: an active one is sent as above; at the first inactive one the
 * packets waiting for their group leave at once, then one frame says
 * "silence" — its payload a packet of length 0 and a level byte (the
 * frame's RMS in half-decibels under full scale, 255 for nothing) — and
 * nothing more leaves until the gate opens. The encoder still runs on the
 * frames it does not send; the sequence counts only the frames sent, so a
 * silence is never read as a loss. The receiving end hands the playback
 * `{ type: 'silence', level }` (its comfort noise, `audio.webaudio`).
 *
 * Messages to the scope:
 *   { type: 'open', capture, playback, transport?, config, group?, deflate?, gate?, conceal?, soft? }   → { type: 'opened', coded, group }
 *   { type: 'stats' }   → { type: 'stats', frames, packets, bytes, wireBytes, sent, received, lost, concealed,
 *                         late, repeats, decoded, gated, silences, damaged, ignored, encodeMs, decodeMs, playback }
 * `conceal` and `soft` go to the decoder (`audio.codec`); a packet the decoder
 * refuses inside a frame is concealed alone (`damaged`); what arrives on the
 * transport and is not bytes is counted (`ignored`). A loss is concealed with
 * as many frames as packets the lost frames carried, read from the next
 * frame's count — off only when a short frame at a gate's close and its
 * silence frame are lost together.
 *   { type: 'close' }   → { type: 'closed' }
 * A failure — a bad configuration, a damaged frame — is answered with
 * { type: 'error', message }; the link goes on.
 *
 * `playback` is what the playback processor counts (queued, played,
 * underruns, dropped, trimmed), asked on its port — the worker holds it; null when
 * it does not answer within `wait` milliseconds (250 by default).
 *
 * The module reads no clock: a timer is given to `attach` (`now`, in
 * milliseconds) or nothing is timed.
 *
 * The lossless stage (rows B4c, B5b1): with `deflate: true` (level 6) or
 * `deflate: { level }` in `open`, each frame keeps the smaller of its
 * payload deflated or stored — so audio, which DEFLATE does not shrink,
 * does not pay for it. The DEFLATE itself is the fw `deflate` module,
 * given to `attach` by the worker that registers it.
 */

import { codecModule } from '../codec/codec.js';
import { frameModule } from '@awacloud/media-stream/frame';
import { gateModule } from '../gate/gate.js';

/**
 * @typedef {object} LinkApi
 * @property {(scope: { addEventListener: Function, postMessage: Function }, options?: { now?: () => number, wait?: number, deflate?: { deflateSync: (data: Uint8Array, options?: { level?: number }) => Uint8Array, inflateSync: (data: Uint8Array) => Uint8Array } }) => void} attach
 */

export const linkModule = {
    name: 'audio.link',
    version: '0.6.1',
    type: 'lib.media.audio',
    dependencies: ['audio.codec', 'media.frame', 'audio.gate'],
    deps: [codecModule, frameModule, gateModule],

    /**
     * @param {import('../codec/codec.js').AudioCodecApi} codec
     * @param {import('@awacloud/media-stream/frame').FrameApi} framing
     * @param {import('../gate/gate.js').GateApi} gates
     * @returns {LinkApi}
     */
    factory(codec, framing, gates) {
        /** Packets a frame unless the page says otherwise (ruling D20). */
        const GROUP = 4;
        /** The most frames a gap is concealed with: 170 ms at 48 kHz; a longer hole is left to the playback. */
        const MAX_CONCEAL = 64;
        const WRAP = 2 ** 32;

        /** A silence's level in a byte: half-decibels under full scale, 255 for nothing. */
        const levelByte = (rms) => (rms > 0 ? Math.max(0, Math.min(254, Math.round(-40 * Math.log10(rms)))) : 255);
        const levelOf = (byte) => (byte === 255 ? 0 : 10 ** (-byte / 40));

        /** A buffer of its own, to transfer: a view may sit on a larger one. */
        const own = (bytes) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice());

        const message = (error) => String(error && error.message ? error.message : error);

        /** The packets of a group, each behind its length (an unsigned LEB128). */
        function joinPackets(packets) {
            let size = 0;
            for (const p of packets) size += p.length + (p.length < 128 ? 1 : p.length < 16384 ? 2 : 3);
            const out = new Uint8Array(size);
            let at = 0;
            for (const p of packets) {
                let n = p.length;
                while (n >= 128) {
                    out[at++] = (n & 0x7f) | 0x80;
                    n >>= 7;
                }
                out[at++] = n;
                out.set(p, at);
                at += p.length;
            }
            return out;
        }

        function splitPackets(payload) {
            const packets = [];
            let at = 0;
            while (at < payload.length) {
                let length = 0;
                let shift = 0;
                let b;
                do {
                    if (at >= payload.length || shift > 14) throw new RangeError('audio.link: a packet length cut short in the frame');
                    b = payload[at++];
                    length |= (b & 0x7f) << shift;
                    shift += 7;
                } while (b & 0x80);
                if (at + length > payload.length) throw new RangeError('audio.link: a packet longer than its frame');
                packets.push(payload.subarray(at, at + length));
                at += length;
            }
            return packets;
        }

        /**
         * @param {{ addEventListener: Function, postMessage: Function }} scope The worker's scope.
         * @param {object} [options]
         * @param {() => number} [options.now] Milliseconds; without it nothing is timed.
         * @param {number} [options.wait=250] Milliseconds to wait for the playback processor's counts.
         * @param {{ deflateSync: Function, inflateSync: Function }} [options.deflate] The fw `deflate` module, for the lossless stage.
         */
        function attach(scope, { now, wait = 250, deflate: lossless = null } = {}) {
            let open = null;
            const fail = (error) => scope.postMessage({ type: 'error', message: message(error) });

            function close() {
                if (!open) return;
                for (const port of [open.capture, open.playback, open.transport]) if (port) port.close();
                open = null;
            }

            function start({ capture, playback, transport = null, config = {}, group = GROUP, deflate = false, gate = null, conceal, soft }) {
                if (!capture || !playback) throw new TypeError('audio.link: open needs a capture and a playback port');
                if (!Number.isInteger(group) || group < 1 || group > 64) throw new RangeError(`audio.link: group ${group}, 1 to 64 packets a frame`);
                if (deflate && !lossless) throw new Error('audio.link: deflate asked, but no deflate was given to attach');
                let gating = null;
                if (gate) {
                    try {
                        // `gate: true` takes the owner's values (D22).
                        gating = gates.createGate(gate === true ? {} : gate);
                    } catch (error) {
                        throw new RangeError(`audio.link: ${message(error)}`, { cause: error });
                    }
                }
                const writer = framing.createWriter({ kind: 'audio', deflate: lossless, lossless: deflate });
                const tracker = framing.createTracker();
                const encoder = codec.createEncoder(config);
                const decoder = codec.createDecoder({ rate: config.rate ?? 48000, conceal, soft });
                const counts = {
                    frames: 0, packets: 0, bytes: 0, wireBytes: 0, sent: 0, received: 0, lost: 0, concealed: 0, late: 0, repeats: 0, decoded: 0,
                    gated: 0, silences: 0, damaged: 0, ignored: 0, encodeMs: now ? 0 : null, decodeMs: now ? 0 : null,
                };
                const waiting = [];
                let pending = [];
                let first = 0;
                let speaking = true;

                /** A frame onto the way, looped back or on the transport. */
                const send = (payload, time) => {
                    const bytes = own(writer.write(payload, { time: time % WRAP }));
                    counts.sent++;
                    counts.wireBytes += bytes.length;
                    if (transport) transport.postMessage(bytes, [bytes.buffer]);
                    else arrive(bytes);
                };

                const toPlayback = (frames) => {
                    for (const out of frames) playback.postMessage(out, [out.buffer]);
                };

                /** A frame from the way: a gap concealed, the packets decoded. */
                const arrive = (bytes) => {
                    const read = framing.read(bytes, { deflate: lossless });
                    if (read.kind !== 'audio') throw new RangeError(`audio.link: a ${read.kind} frame on the audio link`);
                    const said = read.payload.length === 2 && read.payload[0] === 0;
                    const packets = said ? [] : splitPackets(read.payload);
                    const seen = tracker.accept(read);
                    counts.received++;
                    if (seen.late) {
                        counts.late++;
                        return;
                    }
                    if (seen.repeat) {
                        counts.repeats++;
                        return;
                    }
                    counts.lost += seen.missing;
                    if (said) {
                        playback.postMessage({ type: 'silence', level: levelOf(read.payload[1]) });
                        return;
                    }
                    const t0 = now ? now() : 0;
                    const holes = Math.min(MAX_CONCEAL, seen.missing * packets.length);
                    for (let k = 0; k < holes; k++) {
                        toPlayback(decoder.lose());
                        counts.concealed++;
                    }
                    for (const packet of packets) {
                        let frames;
                        try {
                            // A copy: the decoder may keep its own array, and a transferred one is lost to it.
                            frames = decoder.push(packet).map((f) => new Float32Array(f));
                            counts.decoded += frames.length;
                        } catch {
                            // A damaged packet is concealed alone: the frame's others still play, the time base holds.
                            counts.damaged++;
                            counts.concealed++;
                            frames = decoder.lose();
                        }
                        toPlayback(frames);
                    }
                    if (now) counts.decodeMs += now() - t0;
                };

                capture.onmessage = ({ data }) => {
                    if (!(data instanceof Float32Array)) return;
                    try {
                        const index = counts.frames++;
                        const active = gating ? gating.push(data) : true;
                        const t0 = now ? now() : 0;
                        const packets = encoder.push(data);
                        if (now) counts.encodeMs += now() - t0;
                        if (!active) {
                            // The encoder ran, its stages in step; nothing of this frame leaves.
                            counts.gated++;
                            if (speaking) {
                                if (pending.length) send(joinPackets(pending), first);
                                pending = [];
                                send(Uint8Array.of(0, levelByte(gates.level(data))), index);
                                counts.silences++;
                            }
                            speaking = false;
                            return;
                        }
                        speaking = true;
                        for (const packet of packets) {
                            if (pending.length === 0) first = index;
                            counts.packets++;
                            counts.bytes += packet.length;
                            pending.push(packet);
                        }
                        if (pending.length < group) return;
                        send(joinPackets(pending), first);
                        pending = [];
                    } catch (error) {
                        fail(error);
                    }
                };
                if (transport) {
                    transport.onmessage = ({ data }) => {
                        if (!(data instanceof Uint8Array)) {
                            counts.ignored++;
                            return;
                        }
                        try {
                            arrive(data);
                        } catch (error) {
                            fail(error);
                        }
                    };
                }
                playback.onmessage = ({ data }) => {
                    if (!data || data.type !== 'stats') return;
                    const { queued, played, underruns, dropped, trimmed, silences = 0, comforted = 0 } = data;
                    for (const answer of waiting.splice(0)) answer({ queued, played, underruns, dropped, trimmed, silences, comforted });
                };
                open = { capture, playback, transport, counts, waiting };
                scope.postMessage({ type: 'opened', coded: { rate: config.rate ?? 48000 }, group });
            }

            const none = {
                frames: 0, packets: 0, bytes: 0, wireBytes: 0, sent: 0, received: 0, lost: 0, concealed: 0, late: 0, repeats: 0, decoded: 0,
                gated: 0, silences: 0, damaged: 0, ignored: 0, encodeMs: null, decodeMs: null, playback: null,
            };

            scope.addEventListener('message', ({ data }) => {
                try {
                    if (!data || typeof data !== 'object') return;
                    if (data.type === 'open') {
                        close();
                        start(data);
                    } else if (data.type === 'stats') {
                        if (!open) {
                            scope.postMessage({ type: 'stats', ...none });
                            return;
                        }
                        const { counts, waiting, playback } = open;
                        let done = false;
                        const answer = (counted) => {
                            if (done) return;
                            done = true;
                            scope.postMessage({ type: 'stats', ...counts, playback: counted });
                        };
                        waiting.push(answer);
                        playback.postMessage({ type: 'stats' });
                        setTimeout(() => answer(null), wait);
                    } else if (data.type === 'close') {
                        close();
                        scope.postMessage({ type: 'closed' });
                    }
                } catch (error) {
                    fail(error);
                }
            });
        }

        return { attach };
    },
};
