// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A packet with nothing selected (pass P, a reviewer's
 * finding reproduced): a page scrolled, the move sent and no pixel — the
 * encoder writes each empty band as one terminator byte, and the decoder
 * must take what the encoder gives.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const nibbles = runtime.resolve('video.nibbles');
const W = 128;
const H = 128;

/** A white page with a textured block, shifted up by `shift` rows. */
function page(shift) {
    const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = 0; y < H; y++) {
        const sy = y + shift;
        for (let x = 0; x < W; x++) {
            if (sy < 40 || sy >= 72 || x < 32 || x >= 96) continue;
            const i = (y * W + x) * 4;
            const v = ((x * 7 + sy * 13) % 64) * 3;
            rgba[i] = v;
            rgba[i + 1] = 255 - v;
            rgba[i + 2] = (v * 2) % 256;
        }
    }
    return rgba;
}

describe('an empty band', () => {
    test('nibbles: the terminator of an empty band is read back, one byte', () => {
        const list = [];
        nibbles.put(list, new Int32Array(0));
        expect(list).toEqual([0xff]);
        expect(nibbles.read(Uint8Array.from(list), 0, new Int32Array(0))).toBe(1);
        expect(() => nibbles.read(Uint8Array.from([0x12]), 0, new Int32Array(0))).toThrow(RangeError);
    });

    test('a scrolled page with nothing left to send decodes, with and without delta', () => {
        for (const options of [{ preset: 'screen' }, { preset: 'screen', delta: true }]) {
            const encoder = codec.createEncoder({ width: W, height: H, fps: 15, ...options });
            const decoder = codec.createDecoder({ width: W, height: H });
            for (const shift of [0, 0, 32, 32, 32]) {
                for (const packet of encoder.push(page(shift))) expect(() => decoder.push(packet)).not.toThrow();
            }
        }
    });
});
