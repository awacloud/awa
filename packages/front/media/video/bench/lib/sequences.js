// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Generated test sequences of the video bench. Everything
 * is computed from a seed, a size and a frame index: no recorded
 * material, the same frames on every run.
 *
 * A frame is RGBA, 8 bits a channel, alpha always 255 — what a canvas
 * hands over.
 */

/**
 * Seeded generator of uniform numbers in [0, 1) (mulberry32).
 * @param {number} seed
 * @returns {() => number}
 */
export function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A hash of three integers to an unsigned 32-bit value. */
function hash(a, b, c) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    return h >>> 0;
}

/**
 * A still scene with what a codec meets: flat areas and an edge, a
 * gradient, one-pixel stripes, a fine texture.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} seed
 * @param {boolean} [alternate=false] Another layout and palette, for the scene after a cut.
 * @returns {Uint8ClampedArray}
 */
function scene(width, height, seed, alternate = false) {
    const out = new Uint8ClampedArray(width * height * 4);
    const random = prng(seed);
    const texture = new Uint8Array(width * height);
    for (let i = 0; i < texture.length; i++) texture[i] = 64 + Math.floor(random() * 128);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // The alternate scene is the same layout seen from the other side.
            const u = (alternate ? width - 1 - x : x) / width;
            const v = y / height;
            let r;
            let g;
            let b;
            if (u < 0.35) {
                // Two flat areas under a diagonal edge.
                if (u + v * 0.35 < 0.2) { r = 200; g = 170; b = 60; }
                else if (v < 0.5) { r = 60; g = 110; b = 170; }
                else { r = 40; g = 140; b = 90; }
            } else if (u < 0.55) {
                // A vertical gradient.
                const level = Math.round(40 + 180 * v);
                r = level; g = Math.round(level * 0.8); b = 255 - level;
            } else if (u < 0.75) {
                // One-pixel stripes.
                const on = x & 1;
                r = on ? 220 : 30; g = on ? 220 : 30; b = on ? 200 : 50;
            } else {
                // A fine texture.
                const t = texture[y * width + x];
                r = t; g = Math.min(255, t + 20); b = 255 - t;
            }
            if (alternate) { r = 255 - r; g = 255 - g; b = 255 - b; }
            const i = (y * width + x) * 4;
            out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
        }
    }
    return out;
}

/** Draws the two moving shapes of frame `t` over a copy of `base`. */
function withShapes(base, width, height, t) {
    const out = new Uint8ClampedArray(base);
    // A disc crossing the picture, two pixels a frame.
    const radius = Math.max(4, Math.round(height / 6));
    const cx = (Math.round(width * 0.2) + 2 * t) % width;
    const cy = Math.round(height * 0.4);
    for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + (y - cy) * (y - cy) > radius * radius) continue;
            const x = (((cx + dx) % width) + width) % width;
            const i = (y * width + x) * 4;
            out[i] = 230; out[i + 1] = 80; out[i + 2] = 60;
        }
    }
    // A rectangle sliding down and right, one pixel a frame.
    const w = Math.max(6, Math.round(width / 8));
    const h = Math.max(5, Math.round(height / 7));
    const left = (Math.round(width * 0.5) + t) % width;
    const top = (Math.round(height * 0.55) + t) % height;
    for (let dy = 0; dy < h; dy++) {
        const y = (top + dy) % height;
        for (let dx = 0; dx < w; dx++) {
            const x = (left + dx) % width;
            const i = (y * width + x) * 4;
            out[i] = 245; out[i + 1] = 240; out[i + 2] = 120;
        }
    }
    return out;
}

/**
 * The bench's sequence set.
 *
 * @param {object} options
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.frames Frames in each sequence.
 * @param {number} options.fps Frame rate the byte rates are quoted at.
 * @param {number} options.seed Seed of every random choice.
 * @returns {{ name: string, width: number, height: number, frames: number, fps: number, frame: (t: number) => Uint8ClampedArray }[]}
 */
export function sequences({ width, height, frames, fps, seed }) {
    const shape = { width, height, frames, fps };
    const base = scene(width, height, seed);
    const other = scene(width, height, seed + 1, true);
    const cutAt = Math.floor(frames / 2);
    const pixelsPerFrame = 2;
    // The panel starts on a multiple of 16 pixels, near 40 % of the width.
    const panelLeft = Math.round((width * 0.4) / 16) * 16;

    /** Screen content: lines of text-like glyphs on a light page, scrolled by whole pixels. */
    function page(t) {
        const out = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const py = y + t * pixelsPerFrame;
            const line = Math.floor(py / 8);
            const row = py % 8;
            for (let x = 0; x < width; x++) {
                // A glyph cell is 4 pixels wide and 5 high; three blank rows between lines;
                // about three cells in ten are spaces.
                const cell = Math.floor(x / 4);
                const inked = row < 5 && x % 4 < 3 && hash(cell, line, seed) % 10 >= 3 && (hash(cell, line, seed + 7) >>> (row * 3 + (x % 4))) & 1;
                const level = inked ? 30 : 235;
                const i = (y * width + x) * 4;
                out[i] = level; out[i + 1] = level; out[i + 2] = inked ? 40 : 230; out[i + 3] = 255;
            }
        }
        return out;
    }

    return [
        { name: 'static', ...shape, frame: () => new Uint8ClampedArray(base) },
        { name: 'shapes', ...shape, frame: (t) => withShapes(base, width, height, t) },
        {
            name: 'camera',
            ...shape,
            /** `shapes` under a sensor noise of -2 to 2 a channel, new at every frame. */
            frame(t) {
                const out = withShapes(base, width, height, t);
                const random = prng(seed * 7919 + t);
                for (let i = 0; i < out.length; i++) {
                    if (i % 4 !== 3) out[i] += Math.floor(random() * 5) - 2;
                }
                return out;
            },
        },
        { name: 'scroll', ...shape, pixelsPerFrame, frame: page },
        { name: 'cut', ...shape, cutAt, frame: (t) => withShapes(t < cutAt ? base : other, width, height, t) },
        {
            name: 'panel',
            ...shape,
            pixelsPerFrame,
            panelLeft,
            /** A still scene on the left, a panel of scrolling text on the right. */
            frame(t) {
                const out = new Uint8ClampedArray(base);
                const text = page(t);
                for (let y = 0; y < height; y++) {
                    const from = (y * width + panelLeft) * 4;
                    out.set(text.subarray(from, (y + 1) * width * 4), from);
                }
                return out;
            },
        },
    ];
}
