// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Reference codecs of the audio bench. They are not
 * candidates: their scores are known in advance, so they prove the bench
 * measures what it says before any real codec is judged on it.
 *
 * Codec shape, shared with every candidate:
 *   { name, delay, createEncoder(rate), createDecoder(rate) }
 *   encoder.push(frame: Float32Array) → Uint8Array[]   (0..n packets)
 *   decoder.push(packet: Uint8Array)  → Float32Array[] (0..n frames)
 */

/**
 * Builds a stateless PCM codec over a typed-array sample format.
 * @param {string} name
 * @param {Int8ArrayConstructor|Int16ArrayConstructor} Type
 * @param {number} scale Full-scale integer value.
 */
function pcm(name, Type, scale) {
    return {
        name,
        delay: 0,
        createEncoder: () => ({
            push(frame) {
                const ints = new Type(frame.length);
                for (let i = 0; i < frame.length; i++) ints[i] = Math.round(Math.max(-1, Math.min(1, frame[i])) * scale);
                return [new Uint8Array(ints.buffer)];
            },
        }),
        createDecoder: () => ({
            push(packet) {
                const ints = new Type(packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength));
                const frame = new Float32Array(ints.length);
                for (let i = 0; i < ints.length; i++) frame[i] = ints[i] / scale;
                return [frame];
            },
        }),
    };
}

/** The samples as they are: four bytes each, no loss. */
export const identity = {
    name: 'identity',
    delay: 0,
    createEncoder: () => ({
        push: (frame) => [new Uint8Array(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength))],
    }),
    createDecoder: () => ({
        push: (packet) => [new Float32Array(packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength))],
    }),
};

/** Uniform 16-bit PCM: 6.02 × 16 + 1.76 dB on a full-scale sine. */
export const pcm16 = pcm('pcm16', Int16Array, 32767);

/** Uniform 8-bit PCM: 6.02 × 8 + 1.76 dB on a full-scale sine. */
export const pcm8 = pcm('pcm8', Int8Array, 127);
