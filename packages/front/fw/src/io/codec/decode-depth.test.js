// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The recursive decoders stop at a nesting limit (audit A5): a deep input
// throws a named error at `maxDepth` (default 512) instead of recursing until
// the engine's stack overflows.

import { describe, test, expect } from 'bun:test';
import { cbor } from './cbor.js';
import { msgpack } from './msgpack.js';
import { utf8 } from './utf8.js';

const C = cbor.factory(utf8.factory());
const M = msgpack.factory(utf8.factory());

/** `n` nested one-element arrays around 0: CBOR 0x81…0x00, MessagePack 0x91…0x00. */
const nested = (head, n) => { const b = new Uint8Array(n + 1).fill(head); b[n] = 0; return b; };
const depthOf = (v) => { let d = 0; while (Array.isArray(v)) { v = v[0]; d++; } return d; };

for (const [name, codec, arr, map, indef] of [['cbor', C, 0x81, 0xa1, 0x9f], ['msgpack', M, 0x91, 0x81, null]]) {
    describe(name + '.decode: the nesting limit', () => {
        test('512 levels decode; 513 throw a named error', () => {
            expect(depthOf(codec.decode(nested(arr, 512)))).toBe(512);
            expect(() => codec.decode(nested(arr, 513))).toThrow(/nesting deeper than maxDepth \(512\)/);
        });

        test('a deep input far past the limit throws the same error (not a stack overflow)', () => {
            let e = null;
            try { codec.decode(nested(arr, 200000)); } catch (x) { e = x; }
            expect(e && e.message).toMatch(/maxDepth/);
        });

        test('maxDepth is configurable and validated', () => {
            expect(() => codec.decode(nested(arr, 5), { maxDepth: 4 })).toThrow(/maxDepth \(4\)/);
            expect(depthOf(codec.decode(nested(arr, 5), { maxDepth: 5 }))).toBe(5);
            expect(() => codec.decode(nested(arr, 1), { maxDepth: 0 })).toThrow(RangeError);
        });

        test('maps count, and siblings do not add up', () => {
            const deepMap = new Uint8Array(2 * 40 + 1);
            for (let i = 0; i < 40; i++) { deepMap[2 * i] = map; deepMap[2 * i + 1] = 0x01; }
            deepMap[80] = 0x00;
            expect(() => codec.decode(deepMap, { maxDepth: 39 })).toThrow(/maxDepth/);
            expect(() => codec.decode(deepMap, { maxDepth: 40 })).not.toThrow();
            const wide = codec.encode(Array.from({ length: 2000 }, () => [[1]]));
            expect(codec.decode(wide, { maxDepth: 3 }).length).toBe(2000);
        });

        if (indef !== null) {
            test('indefinite-length arrays count too', () => {
                const b = new Uint8Array(2 * 10 + 1);
                for (let i = 0; i < 10; i++) b[i] = indef;
                b[10] = 0x00;
                for (let i = 11; i < 21; i++) b[i] = 0xff;
                expect(() => codec.decode(b, { maxDepth: 9 })).toThrow(/maxDepth/);
                expect(depthOf(codec.decode(b, { maxDepth: 10 }))).toBe(10);
            });
        }
    });
}
