// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests of `media.frame` (row B5a, ruling D19): the frame
 * around each unit that travels.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate as deflateModule } from '@awacloud/fw/io/compress/deflate.js';
import { mediaStreamModules } from '../main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaStreamModules);
runtime.registerDeep(deflateModule);
const frame = runtime.resolve('media.frame');
const deflate = runtime.resolve('deflate');

/** A payload that DEFLATE shrinks (repeats), one it cannot (a seeded noise). */
const repetitive = new Uint8Array(600).map((_, i) => (i % 24 < 12 ? 7 : 200));
const noise = (() => {
    let x = 12345;
    return new Uint8Array(90).map(() => {
        x = (x * 1103515245 + 12345) >>> 0;
        return x >>> 24;
    });
})();

describe('media.frame', () => {
    test('frames a payload and reads it back: the fields and the payload byte for byte', () => {
        const writer = frame.createWriter({ kind: 'video', keyId: 3 });
        const out = writer.write(noise, { layer: 2, time: 90000 });
        expect(out.length).toBe(frame.HEADER + noise.length);
        expect([...out.subarray(0, 12)]).toEqual([0x14, 0, 2, 3, 0, 0, 0, 0, 0, 1, 0x5f, 0x90]);
        expect(frame.read(out)).toEqual({
            version: 1, kind: 'video', layer: 2, keyId: 3, sequence: 0, time: 90000, deflated: false, encrypted: false, payload: noise,
        });
        const audio = frame.createWriter({ kind: 'audio' }).write(repetitive, { time: 128 });
        expect(frame.read(audio)).toMatchObject({ kind: 'audio', layer: 0, keyId: 0, sequence: 0, time: 128, payload: repetitive });
    });

    test('the sequence counts from 0 per layer, and wraps at 2^32', () => {
        const writer = frame.createWriter({ kind: 'video' });
        const seq = (layer) => frame.header(writer.write(noise, { layer, time: 0 })).sequence;
        expect([seq(0), seq(0), seq(2), seq(0), seq(2), seq(3)]).toEqual([0, 1, 0, 2, 1, 0]);
        const late = frame.createWriter({ kind: 'audio', start: 2 ** 32 - 2 });
        expect([0, 1, 2].map(() => frame.header(late.write(noise, { time: 0 })).sequence)).toEqual([2 ** 32 - 2, 2 ** 32 - 1, 0]);
    });

    test('the lossless stage keeps the smaller: deflated when it pays, stored when it does not', () => {
        const writer = frame.createWriter({ kind: 'video', deflate, lossless: true });
        const small = writer.write(repetitive, { time: 0 });
        expect(small.length).toBe(frame.HEADER + deflate.deflateSync(repetitive, { level: 6 }).length);
        expect(frame.header(small).deflated).toBe(true);
        expect(frame.read(small, { deflate }).payload).toEqual(repetitive);
        const stored = writer.write(noise, { time: 0 });
        expect(frame.header(stored).deflated).toBe(false);
        expect(stored.length).toBe(frame.HEADER + noise.length);
        expect(frame.read(stored).payload).toEqual(noise);
        // The level given is used.
        const fast = frame.createWriter({ kind: 'video', deflate, lossless: { level: 1 } }).write(repetitive, { time: 0 });
        expect([...fast.subarray(12)]).toEqual([...deflate.deflateSync(repetitive, { level: 1 })]);
        // Asked without a deflate: refused at creation.
        expect(() => frame.createWriter({ kind: 'video', lossless: true })).toThrow(/deflate/);
        expect(() => frame.createWriter({ kind: 'video', deflate, lossless: { level: 10 } })).toThrow(/level/);
    });

    test('header reads a relay\'s view without the payload and without a deflate', () => {
        const out = frame.createWriter({ kind: 'video', deflate, lossless: true, keyId: 9 }).write(repetitive, { layer: 4, time: 33 });
        expect(frame.header(out)).toEqual({ version: 1, kind: 'video', layer: 4, keyId: 9, sequence: 0, time: 33, deflated: true, encrypted: false });
        expect(frame.header(out.subarray(0, 12)).layer).toBe(4);
    });

    test('a damaged frame is refused with a RangeError naming the cause', () => {
        const good = frame.createWriter({ kind: 'video', deflate, lossless: true }).write(repetitive, { time: 0 });
        const damage = (at, value) => {
            const copy = good.slice();
            copy[at] = value;
            return copy;
        };
        const refused = (bytes, cause, options) => {
            expect(() => frame.read(bytes, options)).toThrow(RangeError);
            expect(() => frame.read(bytes, options)).toThrow(cause);
        };
        refused(good.subarray(0, 11), /short/);
        refused(damage(0, 0x24), /version/);
        refused(damage(0, 0x11), /reserved/);
        refused(damage(0, 0x1c), /kind/);
        refused(damage(1, 0x04), /reserved/);
        refused(damage(1, 0x02), /encrypted/);
        refused(good, /deflate/);
        refused(good.subarray(0, good.length - 4), /inflate/, { deflate });   // a deflated payload cut short
        // A writer refuses what it cannot frame.
        const writer = frame.createWriter({ kind: 'audio' });
        expect(() => writer.write(noise, { time: -1 })).toThrow(RangeError);
        expect(() => writer.write(noise, { time: 2 ** 32 })).toThrow(RangeError);
        expect(() => writer.write(noise, { layer: 256, time: 0 })).toThrow(RangeError);
        expect(() => frame.createWriter({ kind: 'text' })).toThrow(RangeError);
    });

    test('the tracker counts what is missing per layer, a late frame and a repeat, across the wrap', () => {
        const tracker = frame.createTracker();
        const at = (layer, sequence) => tracker.accept({ layer, sequence });
        expect(at(0, 0)).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        expect(at(0, 1)).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        expect(at(0, 4)).toEqual({ missing: 2, late: false, repeat: false, resync: false });
        expect(at(0, 3)).toEqual({ missing: 0, late: true, repeat: false, resync: false });
        expect(at(0, 4)).toEqual({ missing: 0, late: false, repeat: true, resync: false });
        // Another layer has its own count: a layer a relay drops leaves no gap in the others.
        expect(at(2, 10)).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        expect(at(2, 11)).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        expect(at(0, 5)).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        // Across the wrap.
        const wrap = frame.createTracker();
        wrap.accept({ layer: 0, sequence: 2 ** 32 - 2 });
        expect(wrap.accept({ layer: 0, sequence: 1 })).toEqual({ missing: 2, late: false, repeat: false, resync: false });
        expect(wrap.accept({ layer: 0, sequence: 2 ** 32 - 1 })).toEqual({ missing: 0, late: true, repeat: false, resync: false });
        expect(tracker.counts).toEqual({ frames: 8, missing: 2, late: 1, repeats: 1, resyncs: 0 });
    });
});

describe('media.frame against a hostile or a changing stream (pass P)', () => {
    test('a jump beyond the resync bound, forward or back, starts the layer again rather than freezing it', () => {
        const tracker = frame.createTracker();
        tracker.accept({ layer: 0, sequence: 100 });
        // Forged far ahead: not two billion frames lost, and the true ones after it are not late.
        expect(tracker.accept({ layer: 0, sequence: 100 + 2 ** 31 - 1 })).toEqual({ missing: 0, late: false, repeat: false, resync: true });
        expect(tracker.accept({ layer: 0, sequence: 101 })).toEqual({ missing: 0, late: false, repeat: false, resync: true });
        expect(tracker.accept({ layer: 0, sequence: 102 })).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        // A sender that started again from 0, far behind.
        tracker.accept({ layer: 1, sequence: 1e6 });
        expect(tracker.accept({ layer: 1, sequence: 0 })).toMatchObject({ resync: true, late: false });
        expect(tracker.accept({ layer: 1, sequence: 1 })).toMatchObject({ missing: 0, resync: false });
        // Within the bound, a gap is still counted.
        expect(tracker.accept({ layer: 0, sequence: 102 + frame.RESYNC })).toMatchObject({ missing: frame.RESYNC - 1, resync: false });
        expect(tracker.counts).toMatchObject({ resyncs: 3 });
    });

    test('forget(layer): a layer a relay gave back starts again, its gap not counted as loss', () => {
        const tracker = frame.createTracker();
        tracker.accept({ layer: 3, sequence: 10 });
        tracker.forget(3);
        expect(tracker.accept({ layer: 3, sequence: 900 })).toEqual({ missing: 0, late: false, repeat: false, resync: false });
        expect(tracker.counts.missing).toBe(0);
    });

    test('read refuses a deflated payload that would grow past maxPayload (16 MiB unless given)', () => {
        const big = new Uint8Array(200000);
        const bytes = frame.createWriter({ kind: 'video', deflate, lossless: true }).write(big, { time: 0 });
        expect(bytes.length).toBeLessThan(1000);
        expect(() => frame.read(bytes, { deflate, maxPayload: 100000 })).toThrow(/maxPayload|inflate/);
        expect(frame.read(bytes, { deflate }).payload).toEqual(big);
        expect(frame.read(bytes, { deflate, maxPayload: 200000 }).payload.length).toBe(200000);
        expect(frame.MAX_PAYLOAD).toBe(16 * 2 ** 20);
    });

    test('a writer refuses a payload that is not bytes, and a lossless option that is neither true nor an object', () => {
        const writer = frame.createWriter({ kind: 'audio' });
        expect(() => writer.write([1, 2, 3], { time: 0 })).toThrow(TypeError);
        expect(() => writer.write(new ArrayBuffer(4), { time: 0 })).toThrow(TypeError);
        expect(() => frame.createWriter({ kind: 'audio', deflate, lossless: 'yes' })).toThrow(RangeError);
    });
});
