// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The bench's spectral figure. Waveform SNR punishes a
 * harmless level or tilt error as hard as real distortion; the
 * log-spectral distance compares what the two signals contain, frequency
 * by frequency, whatever their phase.
 */

/**
 * In-place radix-2 FFT.
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @throws {RangeError} When the length is not a power of two.
 */
export function fft(re, im) {
    const n = re.length;
    if (n < 2 || (n & (n - 1)) !== 0) throw new RangeError(`fft: length ${n}`);
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const r = re[i]; re[i] = re[j]; re[j] = r;
            const m = im[i]; im[i] = im[j]; im[j] = m;
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1;
        const angle = (-2 * Math.PI) / size;
        for (let start = 0; start < n; start += size) {
            for (let k = 0; k < half; k++) {
                const wr = Math.cos(angle * k);
                const wi = Math.sin(angle * k);
                const a = start + k;
                const b = a + half;
                const tr = re[b] * wr - im[b] * wi;
                const ti = re[b] * wi + im[b] * wr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
    }
}

const SIZE = 512;
const HOP = 256;

/**
 * Power spectrum of one Hann-windowed frame, bins 1..`bins`.
 * @param {Float32Array} x
 * @param {number} start
 * @param {number} bins
 * @returns {Float64Array}
 */
function power(x, start, bins) {
    const re = new Float64Array(SIZE);
    const im = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) re[i] = x[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SIZE));
    fft(re, im);
    const out = new Float64Array(bins);
    for (let k = 1; k <= bins; k++) out[k - 1] = re[k] * re[k] + im[k] * im[k];
    return out;
}

/**
 * Log-spectral distance of `out` against `ref`, in dB: per frame, the
 * root mean square over the bins up to `maxHz` of the difference between
 * the two power spectra in dB; then the mean over the frames whose
 * reference is not silent. 0 is identical content; a copy scaled by g dB
 * is at |g|. Lower is better; it ignores phase.
 *
 * Both spectra are floored at `floorDb` under the strongest bin of the
 * reference frame: what lies under that floor in both is not compared
 * (it would be rounding noise against rounding noise), while anything a
 * codec adds above it — noise, images, aliases — counts in full.
 *
 * @param {Float32Array} ref
 * @param {Float32Array} out
 * @param {object} options
 * @param {number} options.rate Sample rate in Hz.
 * @param {number} [options.maxHz] Upper band limit; half the rate by default.
 * @param {number} [options.delay=0] Samples by which `out` lags `ref`.
 * @param {number} [options.silence=1e-9] Mean-square level under which a reference frame is skipped.
 * @param {number} [options.floorDb=-60] Floor under the reference frame's strongest bin.
 * @returns {number} NaN when every reference frame is silent.
 */
export function logSpectralDistance(ref, out, { rate, maxHz = rate / 2, delay = 0, silence = 1e-9, floorDb = -60 }) {
    const n = Math.min(ref.length, out.length - delay);
    const bins = Math.min(SIZE / 2 - 1, Math.floor((maxHz * SIZE) / rate));
    const shifted = delay === 0 ? out : out.subarray(delay);
    let sum = 0;
    let count = 0;
    for (let start = 0; start + SIZE <= n; start += HOP) {
        let energy = 0;
        for (let i = start; i < start + SIZE; i++) energy += ref[i] * ref[i];
        if (energy / SIZE < silence) continue;
        const a = power(ref, start, bins);
        const b = power(shifted, start, bins);
        let peak = 0;
        for (let k = 0; k < bins; k++) peak = Math.max(peak, a[k]);
        const floor = Math.max(peak * 10 ** (floorDb / 10), 1e-30);
        let squares = 0;
        for (let k = 0; k < bins; k++) {
            const d = 10 * Math.log10(Math.max(a[k], floor) / Math.max(b[k], floor));
            squares += d * d;
        }
        sum += Math.sqrt(squares / bins);
        count++;
    }
    return count === 0 ? NaN : sum / count;
}
