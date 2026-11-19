// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Readers of real audio files for the bench: PCM WAV and
 * FLAC, a mono mix, and a rate conversion to the rate the codecs work at.
 *
 * The FLAC decoder is the bench's own, written from the format's public
 * specification. It does not check the frame CRCs; it checks what
 * matters more — the MD5 of every decoded sample against the one the
 * file carries.
 */

import { createHash } from 'node:crypto';

/**
 * @typedef {object} AudioFile
 * @property {number} rate Sample rate in Hz.
 * @property {number} bits Bits per sample in the file.
 * @property {Float32Array[]} channels Samples in [-1, 1).
 */

/**
 * Reads a PCM WAV file (8 to 32 bits, any channel count).
 * @param {Uint8Array} bytes
 * @returns {AudioFile}
 * @throws {Error} When the file is not PCM WAV.
 */
export function readWav(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
    if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('wav: not a RIFF WAVE file');
    let format = null;
    for (let at = 12; at + 8 <= bytes.length;) {
        const id = tag(at);
        const size = view.getUint32(at + 4, true);
        if (id === 'fmt ') {
            // 1: PCM; 0xFFFE: extensible, whose sub-format starts with the same code.
            const code = view.getUint16(at + 8, true) === 0xfffe ? view.getUint16(at + 32, true) : view.getUint16(at + 8, true);
            if (code !== 1) throw new Error('wav: PCM expected');
            format = { channels: view.getUint16(at + 10, true), rate: view.getUint32(at + 12, true), bits: view.getUint16(at + 22, true) };
        } else if (id === 'data') {
            if (!format) throw new Error('wav: data before fmt');
            const bytesPer = format.bits / 8;
            const count = Math.floor(Math.min(size, bytes.length - at - 8) / (bytesPer * format.channels));
            const channels = Array.from({ length: format.channels }, () => new Float32Array(count));
            const scale = 2 ** (format.bits - 1);
            let p = at + 8;
            for (let i = 0; i < count; i++) {
                for (let c = 0; c < format.channels; c++, p += bytesPer) {
                    let v = 0;
                    for (let b = 0; b < bytesPer; b++) v += bytes[p + b] * 2 ** (8 * b);
                    if (bytesPer === 1) v -= 128;                // 8-bit WAV is unsigned
                    else if (v >= scale) v -= 2 * scale;
                    channels[c][i] = v / scale;
                }
            }
            return { rate: format.rate, bits: format.bits, channels };
        }
        at += 8 + size + (size & 1);
    }
    throw new Error('wav: no data chunk');
}

/** A reader of bits, most significant first. */
function bitReader(bytes, at) {
    let byte = at;
    let left = 8;       // bits left in the current byte
    const r = {
        get offset() { return byte; },
        /** @throws {RangeError} At the end of the data. */
        bits(count) {
            let value = 0;
            while (count > 0) {
                if (byte >= bytes.length) throw new RangeError('flac: unexpected end');
                const take = count < left ? count : left;
                value = value * 2 ** take + ((bytes[byte] >> (left - take)) & ((1 << take) - 1));
                left -= take;
                count -= take;
                if (left === 0) { byte++; left = 8; }
            }
            return value;
        },
        signed(count) {
            const value = r.bits(count);
            return value >= 2 ** (count - 1) ? value - 2 ** count : value;
        },
        /** Counts zero bits up to the next one bit. */
        unary() {
            let zeros = 0;
            for (;;) {
                if (byte >= bytes.length) throw new RangeError('flac: unexpected end');
                const rest = bytes[byte] & ((1 << left) - 1);
                if (rest === 0) { zeros += left; byte++; left = 8; continue; }
                const lead = Math.clz32(rest) - (32 - left);
                zeros += lead;
                left -= lead + 1;
                if (left === 0) { byte++; left = 8; }
                return zeros;
            }
        },
        align() { if (left !== 8) { byte++; left = 8; } },
    };
    return r;
}

/** Reads the residual of a predicted subframe into `out[order…]`. */
function residual(r, out, order, block) {
    const method = r.bits(2);
    if (method > 1) throw new Error('flac: residual coding');
    const paramBits = method === 0 ? 4 : 5;
    const escape = method === 0 ? 15 : 31;
    const partitionOrder = r.bits(4);
    const partitions = 1 << partitionOrder;
    let at = order;
    for (let p = 0; p < partitions; p++) {
        const count = (block >> partitionOrder) - (p === 0 ? order : 0);
        const k = r.bits(paramBits);
        if (k === escape) {
            const raw = r.bits(5);
            for (let i = 0; i < count; i++) out[at++] = raw === 0 ? 0 : r.signed(raw);
        } else {
            for (let i = 0; i < count; i++) {
                const u = r.unary() * 2 ** k + (k === 0 ? 0 : r.bits(k));
                out[at++] = u % 2 === 0 ? u / 2 : -(u + 1) / 2;
            }
        }
    }
}

const FIXED = [[], [1], [2, -1], [3, -3, 1], [4, -6, 4, -1]];

/** Decodes one subframe into `out` (integers kept as numbers). */
function subframe(r, out, block, bits) {
    if (r.bits(1) !== 0) throw new Error('flac: subframe padding');
    const type = r.bits(6);
    let wasted = 0;
    if (r.bits(1) === 1) wasted = r.unary() + 1;
    const depth = bits - wasted;
    if (type === 0) {
        out.fill(r.signed(depth), 0, block);
    } else if (type === 1) {
        for (let i = 0; i < block; i++) out[i] = r.signed(depth);
    } else if (type >= 8 && type <= 12) {
        const order = type - 8;
        for (let i = 0; i < order; i++) out[i] = r.signed(depth);
        residual(r, out, order, block);
        const c = FIXED[order];
        for (let i = order; i < block; i++) {
            let sum = out[i];
            for (let j = 0; j < order; j++) sum += c[j] * out[i - 1 - j];
            out[i] = sum;
        }
    } else if (type >= 32) {
        const order = type - 31;
        for (let i = 0; i < order; i++) out[i] = r.signed(depth);
        const precision = r.bits(4) + 1;
        const shift = r.signed(5);
        if (shift < 0) throw new Error('flac: negative shift');
        const c = [];
        for (let j = 0; j < order; j++) c.push(r.signed(precision));
        residual(r, out, order, block);
        const divisor = 2 ** shift;
        for (let i = order; i < block; i++) {
            let sum = 0;
            for (let j = 0; j < order; j++) sum += c[j] * out[i - 1 - j];
            out[i] += Math.floor(sum / divisor);
        }
    } else {
        throw new Error(`flac: subframe type ${type}`);
    }
    if (wasted > 0) for (let i = 0; i < block; i++) out[i] *= 2 ** wasted;
}

/**
 * Decodes a FLAC file.
 *
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {number} [options.start=0] First sample to keep.
 * @param {number} [options.count] Samples to keep; to the end by default.
 * @returns {AudioFile & { total: number, md5Checked: boolean }} `md5Checked`: the whole stream decoded to the MD5 the file carries.
 * @throws {Error} When the file is not FLAC or uses an unsupported form.
 */
export function decodeFlac(bytes, { start = 0, count } = {}) {
    if (bytes.length < 42 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'fLaC') throw new Error('flac: not a FLAC file');
    let at = 4;
    let info = null;
    for (;;) {
        const header = bytes[at];
        const length = (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
        if ((header & 0x7f) === 0) {
            const r = bitReader(bytes, at + 4);
            r.bits(16); r.bits(16); r.bits(24); r.bits(24);
            info = { rate: r.bits(20), channels: r.bits(3) + 1, bits: r.bits(5) + 1, total: r.bits(36), md5: bytes.subarray(at + 22, at + 38) };
        }
        at += 4 + length;
        if (header & 0x80) break;
    }
    if (!info) throw new Error('flac: no STREAMINFO');
    const { rate, bits, total } = info;
    const keep = Math.max(0, Math.min(count ?? total, total - start));
    const channels = Array.from({ length: info.channels }, () => new Float32Array(keep));
    const scale = 2 ** (bits - 1);
    const bytesPer = Math.ceil(bits / 8);
    const hash = createHash('md5');
    const work = Array.from({ length: info.channels }, () => new Float64Array(65536));
    const r = bitReader(bytes, at);
    let position = 0;
    while (position < total && r.offset < bytes.length - 2) {
        if (r.bits(15) !== 0x7ffc) throw new Error(`flac: lost sync at byte ${r.offset}`);
        r.bits(1);
        const blockCode = r.bits(4);
        const rateCode = r.bits(4);
        const assignment = r.bits(4);
        const sizeCode = r.bits(3);
        r.bits(1);
        // The frame or sample number, in a UTF-8-like code: skip its continuation bytes.
        let lead = r.bits(8);
        while (lead & 0x80 && lead & 0x40) { r.bits(8); lead = (lead << 1) & 0xff; }
        let block;
        if (blockCode === 1) block = 192;
        else if (blockCode >= 2 && blockCode <= 5) block = 576 << (blockCode - 2);
        else if (blockCode === 6) block = r.bits(8) + 1;
        else if (blockCode === 7) block = r.bits(16) + 1;
        else if (blockCode >= 8) block = 256 << (blockCode - 8);
        else throw new Error('flac: block size');
        if (rateCode === 12) r.bits(8);
        else if (rateCode === 13 || rateCode === 14) r.bits(16);
        const depth = [bits, 8, 12, 0, 16, 20, 24, 32][sizeCode];
        if (depth !== bits) throw new Error('flac: a sample size that changes mid-stream');
        r.bits(8);                                              // CRC-8
        const side = assignment === 8 ? 1 : assignment === 9 ? 0 : assignment === 10 ? 1 : -1;
        if (assignment > 10 || (assignment < 8 && assignment + 1 !== info.channels)) throw new Error('flac: channel assignment');
        for (let c = 0; c < info.channels; c++) subframe(r, work[c], block, bits + (c === side ? 1 : 0));
        r.align();
        r.bits(16);                                             // CRC-16
        const [a, b] = work;
        if (assignment === 8) for (let i = 0; i < block; i++) b[i] = a[i] - b[i];
        else if (assignment === 9) for (let i = 0; i < block; i++) a[i] += b[i];
        else if (assignment === 10) {
            for (let i = 0; i < block; i++) {
                const s = b[i];
                const m = a[i] * 2 + (((s % 2) + 2) % 2);
                a[i] = (m + s) / 2;
                b[i] = (m - s) / 2;
            }
        }
        const pcm = new Uint8Array(block * info.channels * bytesPer);
        let p = 0;
        for (let i = 0; i < block; i++) {
            const index = position + i - start;
            for (let c = 0; c < info.channels; c++) {
                const v = work[c][i];
                let u = v < 0 ? v + 2 ** (8 * bytesPer) : v;
                for (let k = 0; k < bytesPer; k++) { pcm[p++] = u % 256; u = Math.floor(u / 256); }
                if (index >= 0 && index < keep) channels[c][index] = v / scale;
            }
        }
        hash.update(pcm);
        position += block;
    }
    const digest = hash.digest();
    const md5Checked = position === total && info.md5.every((byte, i) => byte === digest[i]);
    return { rate, bits, total, channels, md5Checked };
}

/**
 * @param {Float32Array[]} channels
 * @returns {Float32Array} The mean of the channels.
 */
export function toMono(channels) {
    const out = new Float32Array(channels[0].length);
    for (let i = 0; i < out.length; i++) {
        let sum = 0;
        for (const channel of channels) sum += channel[i];
        out[i] = sum / channels.length;
    }
    return out;
}

/**
 * Converts the sample rate with a windowed-sinc filter (32 zero crossings
 * a side, Blackman window), band-limited to the lower of the two rates.
 * An offline tool: quality first, not speed.
 *
 * @param {Float32Array} samples
 * @param {number} from Rate of `samples`, Hz.
 * @param {number} to Wanted rate, Hz.
 * @returns {Float32Array}
 */
export function resample(samples, from, to) {
    if (from === to) return new Float32Array(samples);
    const out = new Float32Array(Math.floor((samples.length * to) / from));
    const cutoff = Math.min(1, to / from) * 0.96;       // a little under the new Nyquist
    const reach = Math.ceil(32 / cutoff);
    for (let i = 0; i < out.length; i++) {
        const centre = (i * from) / to;
        const first = Math.max(0, Math.ceil(centre - reach));
        const last = Math.min(samples.length - 1, Math.floor(centre + reach));
        let sum = 0;
        for (let j = first; j <= last; j++) {
            const x = (j - centre) * cutoff;
            const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
            const w = (j - centre) / reach;
            sum += samples[j] * sinc * (0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w));
        }
        out[i] = sum * cutoff;
    }
    return out;
}
