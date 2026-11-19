// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Minimal WAV (RIFF, 16-bit PCM, mono) writer and reader, so
 * that the bench's sources and decoded signals can be listened to.
 */

/**
 * @param {Float32Array} samples Values in [-1, 1]; clipped beyond.
 * @param {number} rate Sample rate in Hz.
 * @returns {Uint8Array} A complete WAV file.
 */
export function encodeWav(samples, rate) {
    const bytes = new Uint8Array(44 + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const ascii = (offset, text) => {
        for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
    };
    ascii(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);          // fmt chunk size
    view.setUint16(20, 1, true);           // PCM
    view.setUint16(22, 1, true);           // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);    // byte rate
    view.setUint16(32, 2, true);           // block align
    view.setUint16(34, 16, true);          // bits per sample
    ascii(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, Math.round(v * 32767), true);
    }
    return bytes;
}

/**
 * Reads a file written by `encodeWav`.
 * @param {Uint8Array} bytes
 * @returns {{ rate: number, samples: Float32Array }}
 * @throws {Error} When the file is not 16-bit PCM mono with a 44-byte header.
 */
export function decodeWav(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12));
    if (tag !== 'RIFFWAVE' || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) {
        throw new Error('wav: expected 16-bit PCM mono');
    }
    const count = view.getUint32(40, true) / 2;
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) samples[i] = view.getInt16(44 + i * 2, true) / 32767;
    return { rate: view.getUint32(24, true), samples };
}
