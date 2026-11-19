// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Reference codecs of the video bench. They are not
 * candidates: their scores are known in advance, so they prove the bench
 * measures what it says before any real codec is judged on it.
 *
 * Codec shape, shared with every candidate:
 *   { name, createEncoder({ width, height, fps }), createDecoder({ width, height }) }
 *   encoder.push(rgba: Uint8ClampedArray) → Uint8Array[]         (0..n packets)
 *   decoder.push(packet: Uint8Array)      → Uint8ClampedArray    (the whole current picture)
 *
 * A frame for which the encoder returns no packet leaves the picture as
 * it is: that is how a codec says "nothing changed".
 */

/** The frame as it is: four bytes a pixel, no loss. */
export const identity = {
    name: 'identity',
    createEncoder: () => ({ push: (frame) => [new Uint8Array(frame)] }),
    createDecoder: () => ({ push: (packet) => new Uint8ClampedArray(packet) }),
};

/**
 * Five bits a channel, one byte each: a mean square error of 5.5 on
 * uniform values, 40.73 dB.
 */
export const rgb555 = {
    name: 'rgb555',
    createEncoder: () => ({
        push(frame) {
            const packet = new Uint8Array((frame.length / 4) * 3);
            for (let i = 0, to = 0; i < frame.length; i += 4) {
                packet[to++] = frame[i] >> 3;
                packet[to++] = frame[i + 1] >> 3;
                packet[to++] = frame[i + 2] >> 3;
            }
            return [packet];
        },
    }),
    createDecoder: () => ({
        push(packet) {
            const picture = new Uint8ClampedArray((packet.length / 3) * 4);
            for (let from = 0, i = 0; from < packet.length; i += 4) {
                // Rebuilt at the middle of each step.
                picture[i] = (packet[from++] << 3) | 4;
                picture[i + 1] = (packet[from++] << 3) | 4;
                picture[i + 2] = (packet[from++] << 3) | 4;
                picture[i + 3] = 255;
            }
            return picture;
        },
    }),
};

/**
 * A whole frame every fourth frame, nothing between: exact on a still
 * scene for a quarter of the bytes, late on anything that moves.
 */
export const hold4 = {
    name: 'hold4',
    createEncoder: () => {
        let t = 0;
        return { push: (frame) => (t++ % 4 === 0 ? [new Uint8Array(frame)] : []) };
    },
    createDecoder: () => ({ push: (packet) => new Uint8ClampedArray(packet) }),
};
