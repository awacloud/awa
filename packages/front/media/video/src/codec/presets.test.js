// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of row V11: the presets of `video.codec`, its
 * default rule, the filter a stream wishes, and what left the codec.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaVideoModules } from '../main.js';
import { sequences } from '../../bench/lib/sequences.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaVideoModules);
const codec = runtime.resolve('video.codec');
const pack = runtime.resolve('video.pack');

const W = 128;
const H = 96;
const FPS = 24;
const SHAPE = { width: W, height: H, fps: FPS };
const set = sequences({ width: W, height: H, frames: 40, fps: FPS, seed: 3 });
const byName = Object.fromEntries(set.map((s) => [s.name, s]));

function run(sequence, frames, config, decoderConfig = {}) {
    const encoder = codec.createEncoder({ ...SHAPE, ...config });
    const decoder = codec.createDecoder({ ...encoder.coded, ...decoderConfig });
    const packets = [];
    let bytes = 0;
    let picture = null;
    for (let t = 0; t < frames; t++) {
        for (const packet of encoder.push(sequence.frame(t))) {
            packets.push(packet);
            bytes += packet.length;
            picture = new Uint8ClampedArray(decoder.push(packet));
        }
    }
    return { packets, bytes, picture, held: encoder.picture() };
}

describe('video.codec presets', () => {
    const REF = { rule: 'reference', chroma: true };

    const ECONOMY = { levels: 2, diagonal: true, exact: true, quant: 4, coding: 'nibbles', detail: 8, select: { ...REF, thresholds: [[6, 6], [6, 6], [7, 7], [7, 7], [8, 8]] }, post: true };

    test('six presets, each a set of options', () => {
        expect(codec.presets).toEqual({
            quality: { levels: 2, diagonal: true, exact: true, quant: 2, coding: 'nibbles', detail: 4, select: REF, post: true },
            standard: { levels: 2, diagonal: true, exact: true, quant: 4, coding: 'nibbles', detail: 4, select: REF, post: true },
            // Row D14: the owner's eye on real video — a coarser step is not an economy mode, higher thresholds are.
            // Row V16: then fewer frames, then a smaller picture.
            economy: { ...ECONOMY, maxFps: 15 },
            low: { ...ECONOMY, maxFps: 15, reduce: 2 },
            minimal: { ...ECONOMY, maxFps: 10, reduce: 2 },
            screen: { levels: 2, diagonal: true, exact: true, quant: 2, coding: 'nibbles', detail: 4, select: REF, motion: { tile: 32, range: 127, minChange: 0.02 }, post: false },
        });
    });

    test('a preset is its options spelled out; a given option wins; an unknown one is refused', () => {
        for (const [name, options] of Object.entries(codec.presets)) {
            const sequence = name === 'screen' ? byName.scroll : byName.shapes;
            expect(run(sequence, 6, { preset: name }).packets).toEqual(run(sequence, 6, options).packets);
        }
        const coarse = run(byName.shapes, 6, { preset: 'quality', quant: 8 });
        expect(coarse.bytes).toBeLessThan(run(byName.shapes, 6, { preset: 'quality' }).bytes);
        expect(codec.describe(coarse.packets[0]).quant).toBe(8);
        expect(() => codec.createEncoder({ ...SHAPE, preset: 'other' })).toThrow(RangeError);
    });

    test('the presets order themselves: fewer bytes from quality to economy', () => {
        const bytes = ['quality', 'standard', 'economy'].map((preset) => run(byName.camera, 12, { preset }).bytes);
        expect(bytes[1]).toBeLessThan(bytes[0]);
        expect(bytes[2]).toBeLessThan(bytes[1]);
    });

    test('without a select, the rule is the reference one with its colour test', () => {
        const plain = run(byName.shapes, 8, { levels: 2, diagonal: true, detail: 4 });
        const stated = run(byName.shapes, 8, { levels: 2, diagonal: true, detail: 4, select: REF });
        const history = run(byName.shapes, 8, { levels: 2, diagonal: true, detail: 4, select: { rule: 'history' } });
        expect(plain.packets).toEqual(stated.packets);
        expect(history.packets).not.toEqual(stated.packets);
    });
});

describe('video.codec filter wish', () => {
    test('a camera preset wishes the colour smoothing; a decoder follows, or overrules', () => {
        const followed = run(byName.shapes, 6, { preset: 'quality' });
        expect(codec.describe(followed.packets[0]).post).toBe(true);
        expect(followed.picture).toEqual(run(byName.shapes, 6, { preset: 'quality' }, { post: 'chroma' }).picture);
        expect(followed.picture).not.toEqual(followed.held);
        const refused = run(byName.shapes, 6, { preset: 'quality' }, { post: 'none' });
        expect(refused.picture).toEqual(refused.held);
        // The wish changes one flag, no other byte.
        const bare = run(byName.shapes, 6, { preset: 'quality', post: false });
        expect(bare.bytes).toBe(followed.bytes);
        expect(bare.picture).toEqual(bare.held);
    });

    test('the screen preset and a stream without a preset wish nothing', () => {
        const screen = run(byName.scroll, 6, { preset: 'screen' });
        expect(codec.describe(screen.packets[0]).post).toBe(false);
        expect(screen.picture).toEqual(screen.held);
        const plain = run(byName.shapes, 6, { levels: 2, detail: 4 });
        expect(codec.describe(plain.packets[0]).post).toBe(false);
        expect(plain.picture).toEqual(plain.held);
        // A decoder may still filter it.
        expect(run(byName.shapes, 6, { levels: 2, detail: 4 }, { post: 'gauss' }).picture).not.toEqual(plain.held);
    });
});

describe('video.codec after the decisions', () => {
    test('the strips left the codec', () => {
        expect(() => codec.createEncoder({ ...SHAPE, coding: 'strips' })).toThrow(RangeError);
        expect(() => codec.createEncoder({ ...SHAPE, baseCoding: 'strips' })).toThrow(RangeError);
        // A packet that says strips is refused.
        const packet = run(byName.shapes, 1, { quant: 4, coding: 'nibbles', detail: 4 }).packets[0];
        const units = pack.readUnits(packet).map((unit) => ({ type: unit.type, bytes: Uint8Array.from(unit.bytes) }));
        const base = units.find((unit) => unit.type === pack.types.BASE).bytes;
        base[2] = (2 << 4) | (base[2] & 15);
        expect(() => codec.createDecoder({ width: W, height: H }).push(pack.writeUnits(units))).toThrow(RangeError);
        base[2] = (1 << 4) | 8 | (base[2] & 7);
        expect(() => codec.createDecoder({ width: W, height: H }).push(pack.writeUnits(units))).toThrow(RangeError);
    });

    test('v13: under camera noise a larger step never costs more bytes', () => {
        for (const exact of [false, true]) {
            const bytes = [1, 2, 4, 8, 16].map((quant) => run(byName.camera, 16, { levels: 2, diagonal: true, exact, quant, coding: 'nibbles', detail: 4 }).bytes);
            for (let k = 1; k < bytes.length; k++) expect(bytes[k]).toBeLessThanOrEqual(bytes[k - 1]);
        }
    });
});
