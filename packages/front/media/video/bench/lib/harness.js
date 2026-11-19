// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The video bench harness: drives one codec over one
 * sequence, frame by frame, and reports quality, byte rates and time.
 *
 * What is compared with each source frame is the picture a viewer would
 * have at that instant: the last picture the decoder produced, black
 * before the first one. A codec that sends nothing for a frame is
 * therefore judged on what it left on screen.
 *
 * Byte rates are given raw and after DEFLATE, each packet deflated on
 * its own through the fw `deflate` module: the lossless stage of the
 * stream, which cannot wait for a later packet.
 */

import { fw } from './fw.js';
import { psnrLuma, psnrColour, psnrOf, ssimLuma } from './metrics.js';

/** Milliseconds from a monotonic source. */
function millis() {
    return Number(process.hrtime.bigint()) / 1e6;
}

/**
 * @typedef {object} BenchRow
 * @property {string} codec
 * @property {string} sequence
 * @property {number} frames
 * @property {number} packets Packets the encoder produced.
 * @property {number} dropped Packets withheld from the decoder.
 * @property {number} psnrLuma dB, over the whole run.
 * @property {number} worstPsnrLuma dB, on the worst frame.
 * @property {number} psnrColour dB, over the three channels and the whole run.
 * @property {number} ssim Mean over the frames.
 * @property {number} rawBytesPerFrame Mean, withheld packets included.
 * @property {number} rawKbps
 * @property {number} deflatedKbps
 * @property {number} encodeMs Per frame; a measurement, never a gate.
 * @property {number} decodeMs Per frame; a measurement, never a gate.
 * @property {boolean} inflateChecked Every deflated packet inflated back to its bytes.
 * @property {Map<number, Uint8ClampedArray>} pictures The pictures of the frames asked in `keep`.
 */

/**
 * Runs `codec` over `sequence`.
 *
 * @param {{ name: string, createEncoder: (shape: { width: number, height: number, fps: number }) => { push: (frame: Uint8ClampedArray) => Uint8Array[] }, createDecoder: (shape: { width: number, height: number }) => { push: (packet: Uint8Array) => Uint8ClampedArray } }} codec
 * @param {{ name: string, width: number, height: number, frames: number, fps: number, frame: (t: number) => Uint8ClampedArray }} sequence
 * @param {object} [options]
 * @param {Set<number>} [options.drop] Frames whose packets are withheld from the decoder (a lost packet).
 * @param {number[]} [options.keep] Frames whose picture is returned.
 * @param {number} [options.level=6] DEFLATE level.
 * @returns {BenchRow}
 */
export function runCodec(codec, sequence, { drop = new Set(), keep = [], level = 6 } = {}) {
    const { width, height, frames, fps } = sequence;
    const encoder = codec.createEncoder({ width, height, fps });
    const decoder = codec.createDecoder({ width, height });
    let picture = new Uint8ClampedArray(width * height * 4);
    for (let i = 3; i < picture.length; i += 4) picture[i] = 255;

    const pictures = new Map();
    let packets = 0;
    let dropped = 0;
    let raw = 0;
    let deflated = 0;
    let inflateChecked = true;
    let encodeMs = 0;
    let decodeMs = 0;
    let lumaSse = 0;
    let lumaCount = 0;
    let colourSse = 0;
    let colourCount = 0;
    let worst = Infinity;
    let ssimSum = 0;

    for (let t = 0; t < frames; t++) {
        const source = sequence.frame(t);
        let start = millis();
        const list = encoder.push(source);
        encodeMs += millis() - start;
        for (const packet of list) {
            packets++;
            raw += packet.length;
            const packed = fw.deflate.deflateSync(packet, { level });
            deflated += packed.length;
            const back = fw.deflate.inflateSync(packed);
            if (back.length !== packet.length || back.some((byte, i) => byte !== packet[i])) inflateChecked = false;
            if (drop.has(t)) {
                dropped++;
                continue;
            }
            start = millis();
            picture = decoder.push(packet);
            decodeMs += millis() - start;
        }
        const y = psnrLuma(source, picture);
        const c = psnrColour(source, picture);
        lumaSse += y.sse; lumaCount += y.count;
        colourSse += c.sse; colourCount += c.count;
        if (y.psnr < worst) worst = y.psnr;
        ssimSum += ssimLuma(source, picture, width, height);
        if (keep.includes(t)) pictures.set(t, new Uint8ClampedArray(picture));
    }

    const kbps = (bytes) => ((bytes / frames) * 8 * fps) / 1000;
    return {
        codec: codec.name,
        sequence: sequence.name,
        frames,
        packets,
        dropped,
        psnrLuma: psnrOf(lumaSse / lumaCount),
        worstPsnrLuma: worst,
        psnrColour: psnrOf(colourSse / colourCount),
        ssim: ssimSum / frames,
        rawBytesPerFrame: raw / frames,
        rawKbps: kbps(raw),
        deflatedKbps: kbps(deflated),
        encodeMs: encodeMs / frames,
        decodeMs: decodeMs / frames,
        inflateChecked,
        pictures,
    };
}
