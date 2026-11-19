// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Objective quality figures of the video bench. They
 * compare a decoded picture with its source pixel by pixel (PSNR) or
 * window by window (SSIM); they say nothing of how natural a picture
 * looks, which stays the eye's judgement.
 *
 * Luma here is the standard weighting of the three channels, on purpose
 * not the codec's own approximation: the bench must not share the
 * arithmetic of what it judges.
 */

/**
 * Standard luma of a pixel (integer, rounds to nearest).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} 0 to 255.
 */
export function luma(r, g, b) {
    return (77 * r + 150 * g + 29 * b + 128) >> 8;
}

/** PSNR in dB of a mean square error on 8-bit values. */
export function psnrOf(mse) {
    return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

/**
 * @param {Uint8ClampedArray} ref RGBA.
 * @param {Uint8ClampedArray} out RGBA.
 * @returns {{ sse: number, count: number, mse: number, psnr: number }} On luma.
 */
export function psnrLuma(ref, out) {
    let sse = 0;
    const count = ref.length / 4;
    for (let i = 0; i < ref.length; i += 4) {
        const d = luma(ref[i], ref[i + 1], ref[i + 2]) - luma(out[i], out[i + 1], out[i + 2]);
        sse += d * d;
    }
    const mse = sse / count;
    return { sse, count, mse, psnr: psnrOf(mse) };
}

/**
 * @param {Uint8ClampedArray} ref RGBA.
 * @param {Uint8ClampedArray} out RGBA.
 * @returns {{ sse: number, count: number, mse: number, psnr: number }} Over the three colour channels.
 */
export function psnrColour(ref, out) {
    let sse = 0;
    const count = (ref.length / 4) * 3;
    for (let i = 0; i < ref.length; i += 4) {
        const dr = ref[i] - out[i];
        const dg = ref[i + 1] - out[i + 1];
        const db = ref[i + 2] - out[i + 2];
        sse += dr * dr + dg * dg + db * db;
    }
    const mse = sse / count;
    return { sse, count, mse, psnr: psnrOf(mse) };
}

/**
 * Structural similarity on luma: the mean over 8 × 8 windows, stepped
 * by 4, of the usual index (constants for 8-bit values). 1 is identical;
 * it falls with lost structure (blur, blocks) more than with a uniform
 * shift of level.
 *
 * @param {Uint8ClampedArray} ref RGBA.
 * @param {Uint8ClampedArray} out RGBA.
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function ssimLuma(ref, out, width, height) {
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    const a = new Float64Array(width * height);
    const b = new Float64Array(width * height);
    for (let p = 0, i = 0; p < a.length; p++, i += 4) {
        a[p] = luma(ref[i], ref[i + 1], ref[i + 2]);
        b[p] = luma(out[i], out[i + 1], out[i + 2]);
    }
    const SIZE = 8;
    const STEP = 4;
    const n = SIZE * SIZE;
    let sum = 0;
    let windows = 0;
    for (let y = 0; y + SIZE <= height; y += STEP) {
        for (let x = 0; x + SIZE <= width; x += STEP) {
            let sa = 0;
            let sb = 0;
            let saa = 0;
            let sbb = 0;
            let sab = 0;
            for (let dy = 0; dy < SIZE; dy++) {
                const row = (y + dy) * width + x;
                for (let dx = 0; dx < SIZE; dx++) {
                    const va = a[row + dx];
                    const vb = b[row + dx];
                    sa += va; sb += vb;
                    saa += va * va; sbb += vb * vb; sab += va * vb;
                }
            }
            const ma = sa / n;
            const mb = sb / n;
            const va = saa / n - ma * ma;
            const vb = sbb / n - mb * mb;
            const cov = sab / n - ma * mb;
            sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
            windows++;
        }
    }
    return windows === 0 ? NaN : sum / windows;
}
