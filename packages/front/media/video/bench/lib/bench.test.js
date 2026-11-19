// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the video bench: sequences, metrics, PNG, harness
 * and the three reference codecs (row V2 of the media-codecs lane).
 */

import { describe, test, expect } from 'bun:test';
import { sequences, prng } from './sequences.js';
import { psnrLuma, psnrColour, ssimLuma, luma } from './metrics.js';
import { encodePng } from './png.js';
import { runCodec } from './harness.js';
import { identity, rgb555, hold4 } from './reference.js';
import { fw } from './fw.js';

const SIZE = { width: 96, height: 64, frames: 12, fps: 24, seed: 3 };
const set = sequences(SIZE);
const byName = Object.fromEntries(set.map((s) => [s.name, s]));

/** Number of bytes that differ between two frames. */
function differing(a, b) {
    let count = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
    return count;
}

/** A sequence of uniform noise, for the quantiser's theory. */
function noiseSequence(width, height, frames) {
    return {
        name: 'noise', width, height, fps: 24, frames,
        frame(t) {
            const random = prng(100 + t);
            const out = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < out.length; i++) out[i] = i % 4 === 3 ? 255 : Math.floor(random() * 256);
            return out;
        },
    };
}

describe('sequences', () => {
    test('the set names the six sequences, at the asked size', () => {
        expect(set.map((s) => s.name)).toEqual(['static', 'shapes', 'camera', 'scroll', 'cut', 'panel']);
        for (const s of set) {
            expect(s.width).toBe(96);
            expect(s.height).toBe(64);
            expect(s.frames).toBe(12);
            expect(s.fps).toBe(24);
            const frame = s.frame(0);
            expect(frame).toBeInstanceOf(Uint8ClampedArray);
            expect(frame.length).toBe(96 * 64 * 4);
            for (let i = 3; i < frame.length; i += 4) if (frame[i] !== 255) throw new Error(`${s.name}: alpha at ${i}`);
        }
    });

    test('the same seed gives the same frames', () => {
        const again = sequences(SIZE);
        for (let k = 0; k < set.length; k++) {
            for (const t of [0, 5, 11]) expect(differing(again[k].frame(t), set[k].frame(t))).toBe(0);
        }
        const other = sequences({ ...SIZE, seed: 4 });
        expect(differing(other[0].frame(0), set[0].frame(0))).toBeGreaterThan(0);
    });

    test('static does not move; it has flat areas and fine detail', () => {
        const first = byName.static.frame(0);
        for (const t of [1, 6, 11]) expect(differing(byName.static.frame(t), first)).toBe(0);
        let flat = 0;
        let busy = 0;
        for (let i = 0; i + 4 < first.length; i += 4) {
            const step = Math.abs(first[i + 1] - first[i + 5]);
            if (step === 0) flat++;
            if (step > 40) busy++;
        }
        expect(flat).toBeGreaterThan(96 * 64 * 0.2);
        expect(busy).toBeGreaterThan(50);
    });

    test('shapes moves a part of the picture, not all of it', () => {
        const a = byName.shapes.frame(3);
        const b = byName.shapes.frame(4);
        const moved = differing(a, b) / a.length;
        expect(moved).toBeGreaterThan(0.002);
        expect(moved).toBeLessThan(0.3);
    });

    test('camera is shapes under a noise of at most 2 a channel', () => {
        const clean = byName.shapes.frame(5);
        const noisy = byName.camera.frame(5);
        let worst = 0;
        let touched = 0;
        for (let i = 0; i < clean.length; i++) {
            const d = Math.abs(noisy[i] - clean[i]);
            if (d > worst) worst = d;
            if (d > 0) touched++;
        }
        expect(worst).toBe(2);
        expect(touched).toBeGreaterThan(clean.length * 0.4);
        // New noise at every frame, on a scene that also moves.
        expect(differing(byName.camera.frame(5), byName.camera.frame(6))).toBeGreaterThan(clean.length * 0.4);
    });

    test('scroll moves the page up by a whole number of pixels a frame', () => {
        const s = byName.scroll;
        const a = s.frame(2);
        const b = s.frame(3);
        const row = 96 * 4;
        expect(s.pixelsPerFrame).toBeGreaterThan(0);
        // Line y of the next frame is line y + step of this one.
        for (let y = 0; y + s.pixelsPerFrame < 64; y++) {
            const from = (y + s.pixelsPerFrame) * row;
            const to = y * row;
            for (let i = 0; i < row; i++) if (b[to + i] !== a[from + i]) throw new Error(`line ${y}`);
        }
        // Screen content: two levels dominate.
        let dark = 0;
        for (let i = 0; i < a.length; i += 4) if (a[i] < 80) dark++;
        expect(dark).toBeGreaterThan(96 * 64 * 0.05);
        expect(dark).toBeLessThan(96 * 64 * 0.5);
    });

    test('panel is a still area beside a scrolling one', () => {
        const s = byName.panel;
        const a = s.frame(2);
        const b = s.frame(3);
        expect(s.panelLeft % 16).toBe(0);
        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 96; x++) {
                const i = (y * 96 + x) * 4;
                if (x < s.panelLeft) { if (a[i] !== b[i]) throw new Error(`still ${x},${y}`); }
                else if (y + s.pixelsPerFrame < 64 && b[i] !== a[i + s.pixelsPerFrame * 96 * 4]) throw new Error(`panel ${x},${y}`);
            }
        }
    });

    test('cut changes the scene at the middle frame', () => {
        const s = byName.cut;
        const before = differing(s.frame(4), s.frame(5)) / (96 * 64 * 4);
        const across = differing(s.frame(5), s.frame(6)) / (96 * 64 * 4);
        expect(s.cutAt).toBe(6);
        // Alpha never changes: at most three bytes in four can differ.
        expect(across).toBeGreaterThan(0.5);
        expect(before).toBeLessThan(0.3);
    });
});

describe('metrics', () => {
    const picture = byName.static.frame(0);

    test('psnr is infinite on identical pictures', () => {
        expect(psnrLuma(picture, picture).psnr).toBe(Infinity);
        expect(psnrColour(picture, picture).psnr).toBe(Infinity);
    });

    test('psnr is exact on a known error', () => {
        // Every colour channel raised by 5 on a mid-grey picture: MSE 25 on colour and on luma.
        const grey = new Uint8ClampedArray(32 * 32 * 4).fill(100);
        const brighter = grey.map((v, i) => (i % 4 === 3 ? v : v + 5));
        const expected = 10 * Math.log10((255 * 255) / 25);
        expect(psnrColour(grey, brighter).psnr).toBeCloseTo(expected, 6);
        expect(psnrColour(grey, brighter).mse).toBeCloseTo(25, 9);
        expect(psnrLuma(grey, brighter).psnr).toBeCloseTo(expected, 6);
        expect(luma(100, 100, 100)).toBe(100);
        expect(luma(255, 255, 255)).toBe(255);
        expect(luma(0, 255, 0)).toBeGreaterThan(luma(255, 0, 0));
    });

    test('ssim is 1 on identical pictures and falls with a blur more than with a lift', () => {
        expect(ssimLuma(picture, picture, 96, 64)).toBe(1);
        const lifted = picture.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + 3)));
        const blurred = new Uint8ClampedArray(picture);
        for (let y = 0; y < 64; y++) {
            for (let x = 1; x < 95; x++) {
                for (let c = 0; c < 3; c++) {
                    const i = (y * 96 + x) * 4 + c;
                    blurred[i] = (picture[i - 4] + picture[i] + picture[i + 4]) / 3;
                }
            }
        }
        const high = ssimLuma(picture, lifted, 96, 64);
        const low = ssimLuma(picture, blurred, 96, 64);
        expect(high).toBeGreaterThan(0.98);
        expect(high).toBeLessThan(1);
        expect(low).toBeLessThan(high);
        expect(low).toBeGreaterThan(0);
    });
});

describe('png', () => {
    test('a picture round-trips through a PNG file, every CRC right', () => {
        const picture = byName.shapes.frame(7);
        const file = encodePng(picture, 96, 64);
        expect(Array.from(file.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
        const chunks = [];
        for (let at = 8; at < file.length;) {
            const length = view.getUint32(at);
            const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
            const crc = new fw.Crc32();
            crc.append(file.subarray(at + 4, at + 8 + length));
            expect(crc.get()).toBe(view.getUint32(at + 8 + length));
            chunks.push({ type, data: file.subarray(at + 8, at + 8 + length) });
            at += 12 + length;
        }
        expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
        const header = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13);
        expect(header.getUint32(0)).toBe(96);
        expect(header.getUint32(4)).toBe(64);
        expect(Array.from(chunks[0].data.subarray(8, 13))).toEqual([8, 2, 0, 0, 0]);
        const lines = fw.zlib.unzlibSync(chunks[1].data);
        expect(lines.length).toBe(64 * (1 + 96 * 3));
        for (let y = 0; y < 64; y++) {
            const start = y * (1 + 96 * 3);
            expect(lines[start]).toBe(0);
            for (let x = 0; x < 96; x++) {
                for (let c = 0; c < 3; c++) {
                    if (lines[start + 1 + x * 3 + c] !== picture[(y * 96 + x) * 4 + c]) throw new Error(`pixel ${x},${y}`);
                }
            }
        }
    });
});

describe('harness and reference codecs', () => {
    test('identity is lossless and costs four bytes a pixel', () => {
        const row = runCodec(identity, byName.shapes);
        expect(row.codec).toBe('identity');
        expect(row.sequence).toBe('shapes');
        expect(row.frames).toBe(12);
        expect(row.psnrLuma).toBe(Infinity);
        expect(row.worstPsnrLuma).toBe(Infinity);
        expect(row.psnrColour).toBe(Infinity);
        expect(row.ssim).toBe(1);
        expect(row.rawBytesPerFrame).toBe(96 * 64 * 4);
        expect(row.rawKbps).toBeCloseTo((96 * 64 * 4 * 8 * 24) / 1000, 6);
        expect(row.deflatedKbps).toBeLessThan(row.rawKbps);
        expect(row.inflateChecked).toBe(true);
        expect(row.encodeMs).toBeGreaterThanOrEqual(0);
        expect(row.decodeMs).toBeGreaterThanOrEqual(0);
    });

    test('rgb555 scores at the theory on uniform noise', () => {
        const row = runCodec(rgb555, noiseSequence(96, 64, 4));
        // Error from -4 to 3, each equally likely: a mean square of 5.5.
        expect(Math.abs(row.psnrColour - 10 * Math.log10((255 * 255) / 5.5))).toBeLessThan(0.2);
        expect(row.psnrLuma).toBeGreaterThan(row.psnrColour);
        expect(row.rawBytesPerFrame).toBe(96 * 64 * 3);
    });

    test('a frame without a packet leaves the picture as it is', () => {
        const still = runCodec(hold4, byName.static);
        expect(still.packets).toBe(3);
        expect(still.rawBytesPerFrame).toBe((96 * 64 * 4) / 4);
        expect(still.psnrLuma).toBe(Infinity);
        const moving = runCodec(hold4, byName.shapes);
        expect(Number.isFinite(moving.psnrLuma)).toBe(true);
        expect(moving.worstPsnrLuma).toBeLessThan(moving.psnrLuma);
        expect(moving.ssim).toBeLessThan(1);
    });

    test('the picture is black before the first packet', () => {
        const late = {
            name: 'late',
            createEncoder: () => {
                let t = 0;
                return { push: (frame) => (t++ === 0 ? [] : [new Uint8Array(frame.buffer.slice(0))]) };
            },
            createDecoder: () => ({ push: (packet) => new Uint8ClampedArray(packet) }),
        };
        const row = runCodec(late, byName.static, { keep: [0, 1] });
        expect(row.pictures.get(0).every((v, i) => v === (i % 4 === 3 ? 255 : 0))).toBe(true);
        expect(differing(row.pictures.get(1), byName.static.frame(1))).toBe(0);
        expect(row.worstPsnrLuma).toBeLessThan(20);
    });

    test('withheld packets do not reach the decoder, their bytes still count', () => {
        const whole = runCodec(identity, byName.shapes);
        const lossy = runCodec(identity, byName.shapes, { drop: new Set([4, 5]), keep: [5, 6] });
        expect(lossy.rawBytesPerFrame).toBe(whole.rawBytesPerFrame);
        expect(lossy.dropped).toBe(2);
        expect(Number.isFinite(lossy.worstPsnrLuma)).toBe(true);
        // Frame 5 still shows frame 3; frame 6 is whole again.
        expect(differing(lossy.pictures.get(5), byName.shapes.frame(3))).toBe(0);
        expect(differing(lossy.pictures.get(6), byName.shapes.frame(6))).toBe(0);
    });
});
