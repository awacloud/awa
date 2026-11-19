// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A known moving picture for the grab check (row B2a): the
 * page draws it into the canvas it captures, the worker draws it again to
 * compare with what it read. Frame `k` carries `k` modulo 1024 in ten
 * blocks along its top, white for a set bit.
 */

/**
 * How a canvas capture is asked for its next frame: Chromium puts
 * `requestFrame()` on the track, Firefox on the stream (row B2c).
 * @param {MediaStream} stream A `canvas.captureStream(0)`.
 * @returns {() => void}
 */
export function frameRequester(stream) {
    const track = stream.getVideoTracks()[0];
    if (typeof track.requestFrame === 'function') return () => track.requestFrame();
    if (typeof stream.requestFrame === 'function') return () => stream.requestFrame();
    throw new Error('this browser asks a canvas capture for a frame neither on the track nor on the stream');
}

/** The ten counter blocks: left edge, top edge, side, in pixels. */
export const BLOCKS = Array.from({ length: 10 }, (_, i) => ({ x: 8 + i * 48, y: 8, side: 40 }));

/** Draws frame `k` of the scene on a 2D context of `width` × `height`. */
export function drawScene(context, width, height, k) {
    const bands = ['#1f5f8b', '#8b3a1f', '#3a8b1f', '#8b8b1f', '#5f1f8b', '#1f8b8b'];
    const band = Math.ceil(height / bands.length);
    bands.forEach((colour, i) => {
        context.fillStyle = colour;
        context.fillRect(0, i * band, width, band);
    });
    // Something that moves, so that each frame differs from the last.
    context.fillStyle = '#f0f0f0';
    context.fillRect(((k * 7) % (width - 80)) + 10, height - 110, 70, 70);
    BLOCKS.forEach((block, i) => {
        context.fillStyle = (k >> i) & 1 ? '#ffffff' : '#000000';
        context.fillRect(block.x, block.y, block.side, block.side);
    });
}

/** Reads the counter back from an RGBA picture of the scene. */
export function readCounter(rgba, width) {
    let k = 0;
    BLOCKS.forEach((block, i) => {
        const at = ((block.y + (block.side >> 1)) * width + block.x + (block.side >> 1)) * 4;
        const luma = (rgba[at] + rgba[at + 1] + rgba[at + 2]) / 3;
        if (luma > 128) k |= 1 << i;
    });
    return k;
}

/** PSNR of two RGBA pictures over their colour channels, in dB. */
export function psnr(a, b) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const d = a[i + c] - b[i + c];
            sum += d * d;
            n++;
        }
    }
    return sum === 0 ? Infinity : 10 * Math.log10((255 * 255 * n) / sum);
}
