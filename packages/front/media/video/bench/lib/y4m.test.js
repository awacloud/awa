// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of the bench's `.y4m` reader (row V14).
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openY4m, fileSequence } from './y4m.js';

const dir = mkdtempSync(join(tmpdir(), 'media-video-y4m-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Writes a y4m file whose frames are flat colours `[y, u, v]`. */
function write(name, { width, height, rate = 'F30:1', sampling = 'C420jpeg', frames }) {
    const enc = new TextEncoder();
    const chroma = sampling.startsWith('C420') ? (width >> 1) * (height >> 1) : sampling === 'C444' ? width * height : 0;
    const parts = [enc.encode(`YUV4MPEG2 W${width} H${height} ${rate} Ip A1:1${sampling ? ` ${sampling}` : ''}\n`)];
    for (const [y, u, v] of frames) {
        parts.push(enc.encode('FRAME\n'), new Uint8Array(width * height).fill(y), new Uint8Array(chroma).fill(u), new Uint8Array(chroma).fill(v));
    }
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.length; }
    const path = join(dir, name);
    writeFileSync(path, bytes);
    return path;
}

const pixel = (rgba, i = 0) => [rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2], rgba[4 * i + 3]];

describe('bench y4m reader', () => {
    test('the header gives the size, the rate and the frame count', () => {
        const path = write('a.y4m', { width: 32, height: 16, rate: 'F30000:1001', frames: [[16, 128, 128], [235, 128, 128], [81, 90, 240]] });
        const video = openY4m(path);
        expect(video.width).toBe(32);
        expect(video.height).toBe(16);
        expect(video.fps).toBeCloseTo(29.97, 2);
        expect(video.frames).toBe(3);
        video.close();
    });

    test('black, white and red land where they should, in any order of reading', () => {
        const video = openY4m(write('b.y4m', { width: 16, height: 8, frames: [[16, 128, 128], [235, 128, 128], [81, 90, 240], [145, 54, 34], [41, 240, 110]] }));
        expect(pixel(video.frame(2))).toEqual([255, 0, 0, 255]);
        expect(pixel(video.frame(0))).toEqual([0, 0, 0, 255]);
        expect(pixel(video.frame(1), 77)).toEqual([255, 255, 255, 255]);
        const green = pixel(video.frame(3));
        const blue = pixel(video.frame(4));
        expect(green[1]).toBeGreaterThan(250);
        expect(green[0] + green[2]).toBeLessThan(6);
        expect(blue[2]).toBeGreaterThan(250);
        expect(blue[0] + blue[1]).toBeLessThan(6);
        expect(() => video.frame(5)).toThrow(RangeError);
        video.close();
    });

    test('4:4:4 and mono are read; a file that is not y4m is refused', () => {
        const full = openY4m(write('c.y4m', { width: 8, height: 8, sampling: 'C444', frames: [[81, 90, 240]] }));
        expect(pixel(full.frame(0))).toEqual([255, 0, 0, 255]);
        full.close();
        const mono = openY4m(write('d.y4m', { width: 8, height: 8, sampling: 'Cmono', frames: [[235, 0, 0]] }));
        expect(pixel(mono.frame(0))).toEqual([255, 255, 255, 255]);
        mono.close();
        const path = join(dir, 'e.y4m');
        writeFileSync(path, new TextEncoder().encode('RIFF nothing of the kind\n'));
        expect(() => openY4m(path)).toThrow(RangeError);
    });

    test('a sequence for the bench: start, count, step, reduction, a size cut to a multiple of 8', () => {
        // 44 × 20 → reduced by 2 → 22 × 10 → cut to 16 × 8.
        const frames = Array.from({ length: 12 }, (_, k) => [16 + k * 10, 128, 128]);
        const path = write('f.y4m', { width: 44, height: 20, rate: 'F60:1', frames });
        const sequence = fileSequence({ path, name: 'clip', start: 2, frames: 4, step: 2, scale: 2 });
        expect(sequence.name).toBe('clip');
        expect([sequence.width, sequence.height]).toEqual([16, 8]);
        expect(sequence.fps).toBe(30);
        expect(sequence.frames).toBe(4);
        // Frame t is source frame 2 + 2t: its grey rises with it.
        const greys = [0, 1, 2, 3].map((t) => sequence.frame(t)[0]);
        expect(greys[1]).toBeGreaterThan(greys[0]);
        expect(greys[3]).toBeGreaterThan(greys[2]);
        expect(sequence.frame(1).length).toBe(16 * 8 * 4);
        expect(sequence.frame(1)[0]).toBe(Math.round(((16 + 4 * 10 - 16) * 255) / 219));
        // More frames asked than the file holds: refused.
        expect(() => fileSequence({ path, name: 'clip', start: 2, frames: 9, step: 2 })).toThrow(RangeError);
    });
});
