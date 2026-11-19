// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The audio bench harness: drives one codec over one signal,
 * frame by frame, and reports quality, byte rates and time.
 *
 * Byte rates are given raw and after DEFLATE, each packet deflated on its
 * own through the fw `deflate` module: that is the lossless stage the
 * stream applies before encryption, and a low-latency stream cannot wait
 * for later packets to compress an earlier one.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate as deflateModule } from '@awacloud/fw/io/compress/deflate.js';
import { FRAME } from './signals.js';
import { snr, segmentalSnr } from './metrics.js';
import { logSpectralDistance } from './spectral.js';

let deflateApi = null;

/** Resolves the fw deflate module once, on first use. */
function fwDeflate() {
    if (!deflateApi) {
        const runtime = new ModuleRuntime();
        runtime.registerDeep(deflateModule);
        deflateApi = runtime.resolve('deflate');
    }
    return deflateApi;
}

/** Microseconds from a monotonic source; Bun and Node expose `process.hrtime`. */
function micros() {
    return Number(process.hrtime.bigint()) / 1000;
}

/**
 * @typedef {object} BenchRow
 * @property {string} codec
 * @property {string} signal
 * @property {number} frames Frames pushed to the encoder.
 * @property {number} packets Packets the encoder produced.
 * @property {number} snr dB.
 * @property {number} segmentalSnr dB.
 * @property {number} spectralDistance Log-spectral distance up to `spectralMaxHz`, dB; lower is better.
 * @property {number} spectralDistanceFull The same over the whole band: it also sees what a codec adds above the voice band.
 * @property {number} rawBytesPerSecond
 * @property {number} deflatedBytesPerSecond
 * @property {number} microsPerFrame Encode plus decode; a measurement, never a gate.
 * @property {number} latencyMs The codec's delay plus what it buffers beyond one frame, in milliseconds.
 * @property {boolean} inflateChecked Every deflated packet inflated back to its bytes.
 * @property {Float32Array} decoded The decoded signal, source length.
 */

/**
 * Runs `codec` over `signal`.
 *
 * A codec may buffer: `latency` is what it holds beyond one frame, in
 * samples, and its encoder then has a `flush()` returning the last packets.
 *
 * @param {{ name: string, delay: number, latency?: number, createEncoder: (rate: number) => { push: (frame: Float32Array) => Uint8Array[] }, createDecoder: (rate: number) => { push: (packet: Uint8Array) => Float32Array[] } }} codec
 * @param {{ name: string, samples: Float32Array }} signal Whole frames.
 * @param {number} rate Sample rate in Hz.
 * @param {object} [options]
 * @param {number} [options.level=6] DEFLATE level.
 * @param {number} [options.spectralMaxHz=5000] Upper limit of the spectral figure.
 * @returns {BenchRow}
 */
export function runCodec(codec, signal, rate, { level = 6, spectralMaxHz = 5000 } = {}) {
    const { deflateSync, inflateSync } = fwDeflate();
    const { samples } = signal;
    const frames = Math.floor(samples.length / FRAME);
    const encoder = codec.createEncoder(rate);
    const decoder = codec.createDecoder(rate);
    const decoded = new Float32Array(samples.length + codec.delay);
    const packets = [];
    let written = 0;

    const take = (list) => {
        for (const packet of list) {
            packets.push(packet);
            for (const frame of decoder.push(packet)) {
                const room = decoded.length - written;
                decoded.set(frame.length > room ? frame.subarray(0, room) : frame, written);
                written += Math.min(frame.length, room);
            }
        }
    };
    const start = micros();
    for (let f = 0; f < frames; f++) take(encoder.push(samples.subarray(f * FRAME, (f + 1) * FRAME)));
    // A codec that buffers hands over what it still holds.
    if (encoder.flush) take(encoder.flush());
    const elapsed = micros() - start;

    let raw = 0;
    let deflated = 0;
    let inflateChecked = true;
    for (const packet of packets) {
        const packed = deflateSync(packet, { level });
        raw += packet.length;
        deflated += packed.length;
        const back = inflateSync(packed);
        if (back.length !== packet.length || back.some((byte, i) => byte !== packet[i])) inflateChecked = false;
    }

    const seconds = (frames * FRAME) / rate;
    return {
        codec: codec.name,
        signal: signal.name,
        frames,
        packets: packets.length,
        snr: snr(samples, decoded, { delay: codec.delay }),
        segmentalSnr: segmentalSnr(samples, decoded, { delay: codec.delay }),
        spectralDistance: logSpectralDistance(samples, decoded, { rate, maxHz: spectralMaxHz, delay: codec.delay }),
        spectralDistanceFull: logSpectralDistance(samples, decoded, { rate, delay: codec.delay }),
        rawBytesPerSecond: raw / seconds,
        deflatedBytesPerSecond: deflated / seconds,
        microsPerFrame: elapsed / frames,
        latencyMs: ((codec.delay + (codec.latency ?? 0)) * 1000) / rate,
        inflateChecked,
        decoded: decoded.subarray(codec.delay, codec.delay + samples.length),
    };
}
