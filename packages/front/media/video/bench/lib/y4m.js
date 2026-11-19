// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Real video for the bench: a reader of YUV4MPEG2
 * (`.y4m`) files, the raw format the freely licensed test sequences are
 * published in. A text header, then for each frame the line `FRAME` and
 * its planes as they are — nothing to decode, so no third-party code.
 *
 * A file is read frame by frame from the disk: these files weigh
 * hundreds of megabytes. Colours are converted by the BT.601
 * limited-range matrix, in integers.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const MARKER = 'FRAME\n';

/**
 * @typedef {object} Y4mVideo
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} frames
 * @property {(index: number) => Uint8ClampedArray} frame RGBA, alpha 255; a new picture at each call.
 * @property {() => void} close
 */

/**
 * @param {string} path
 * @returns {Y4mVideo}
 * @throws {RangeError} On a file that is not y4m, an unsupported sampling, or a frame out of the file.
 */
export function openY4m(path) {
    const fd = openSync(path, 'r');
    const fail = (message) => {
        closeSync(fd);
        return new RangeError(`bench y4m: ${message}`);
    };
    const head = new Uint8Array(512);
    const got = readSync(fd, head, 0, head.length, 0);
    const end = head.subarray(0, got).indexOf(10);
    const line = end < 0 ? '' : new TextDecoder().decode(head.subarray(0, end));
    if (!line.startsWith('YUV4MPEG2 ')) throw fail('not a YUV4MPEG2 file');
    let width = 0;
    let height = 0;
    let fps = 0;
    let sampling = '420';
    for (const field of line.split(' ').slice(1)) {
        const value = field.slice(1);
        if (field[0] === 'W') width = Number(value);
        else if (field[0] === 'H') height = Number(value);
        else if (field[0] === 'F') {
            const [num, den] = value.split(':').map(Number);
            fps = num / den;
        } else if (field[0] === 'C') sampling = value;
    }
    if (!(width > 0) || !(height > 0) || !(fps > 0)) throw fail(`header ${line}`);
    const kind = sampling.startsWith('420') ? 420 : sampling === '444' ? 444 : sampling === 'mono' ? 400 : 0;
    if (!kind) throw fail(`sampling ${sampling}`);
    const cw = kind === 420 ? width >> 1 : width;
    const ch = kind === 420 ? height >> 1 : height;
    const luma = width * height;
    const chroma = kind === 400 ? 0 : cw * ch;
    const each = MARKER.length + luma + 2 * chroma;
    const first = end + 1;
    const frames = Math.floor((fstatSync(fd).size - first) / each);
    const raw = new Uint8Array(each);

    return {
        width,
        height,
        fps,
        frames,
        frame(index) {
            if (!Number.isInteger(index) || index < 0 || index >= frames) throw new RangeError(`bench y4m: frame ${index} of ${frames}`);
            const read = readSync(fd, raw, 0, each, first + index * each);
            if (read !== each || new TextDecoder().decode(raw.subarray(0, MARKER.length)) !== MARKER) throw new RangeError(`bench y4m: frame ${index} is not where it should be`);
            const out = new Uint8ClampedArray(luma * 4);
            const yAt = MARKER.length;
            const uAt = yAt + luma;
            const vAt = uAt + chroma;
            for (let y = 0; y < height; y++) {
                const row = kind === 420 ? (y >> 1) * cw : y * cw;
                for (let x = 0; x < width; x++) {
                    const c = raw[yAt + y * width + x] - 16;
                    const at = kind === 420 ? row + (x >> 1) : row + x;
                    const d = chroma ? raw[uAt + at] - 128 : 0;
                    const e = chroma ? raw[vAt + at] - 128 : 0;
                    const i = (y * width + x) * 4;
                    out[i] = (298 * c + 409 * e + 128) >> 8;
                    out[i + 1] = (298 * c - 100 * d - 208 * e + 128) >> 8;
                    out[i + 2] = (298 * c + 516 * d + 128) >> 8;
                    out[i + 3] = 255;
                }
            }
            return out;
        },
        close: () => closeSync(fd),
    };
}

/**
 * A bench sequence from a `.y4m` file.
 *
 * @param {object} options
 * @param {string} options.path
 * @param {string} options.name Name of the sequence in the table.
 * @param {number} [options.start=0] First source frame.
 * @param {number} options.frames Frames of the sequence.
 * @param {number} [options.step=1] One source frame in `step`: 60 fps becomes 30 with 2.
 * @param {number} [options.scale=1] Whole-number reduction, by averaging.
 * @returns {{ name: string, width: number, height: number, frames: number, fps: number, frame: (t: number) => Uint8ClampedArray }} The size is cut down to a multiple of 8.
 * @throws {RangeError} When the file does not hold the frames asked.
 */
export function fileSequence({ path, name, start = 0, frames, step = 1, scale = 1 }) {
    const video = openY4m(path);
    if (start + (frames - 1) * step >= video.frames) {
        video.close();
        throw new RangeError(`bench y4m: ${frames} frames from ${start} by ${step} asked, the file holds ${video.frames}`);
    }
    const width = Math.floor(video.width / scale) & ~7;
    const height = Math.floor(video.height / scale) & ~7;
    const area = scale * scale;
    // The codecs of a run each ask every frame: keep what was converted.
    const kept = new Map();

    return {
        name,
        width,
        height,
        frames,
        fps: video.fps / step,
        frame(t) {
            const cached = kept.get(t);
            if (cached) return new Uint8ClampedArray(cached);
            const source = video.frame(start + t * step);
            const out = new Uint8ClampedArray(width * height * 4);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let r = 0;
                    let g = 0;
                    let b = 0;
                    for (let dy = 0; dy < scale; dy++) {
                        const row = ((y * scale + dy) * video.width + x * scale) * 4;
                        for (let dx = 0; dx < scale; dx++) {
                            r += source[row + dx * 4];
                            g += source[row + dx * 4 + 1];
                            b += source[row + dx * 4 + 2];
                        }
                    }
                    const i = (y * width + x) * 4;
                    out[i] = Math.round(r / area);
                    out[i + 1] = Math.round(g / area);
                    out[i + 2] = Math.round(b / area);
                    out[i + 3] = 255;
                }
            }
            kept.set(t, out);
            return new Uint8ClampedArray(out);
        },
    };
}
