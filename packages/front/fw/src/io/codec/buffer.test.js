// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { buffer } from './buffer.js';
import { utf8 } from './utf8.js';
import { valid } from '../utils/valid.js';

const NUM_TYPE = {
    uint8: 0x01,
    int8: 0x02,
    uint16: 0x03,
    int16: 0x04,
    uint32: 0x05,
    int32: 0x06,
    float16: 0x07,
    float32: 0x08,
    float64: 0x09
};

function decodeBlock(u8) {
    const block = u8[0];
    const type = block & 0x0f;
    const head = (block >> 4) + 1;
    let len = 0;
    for (let i = 0; i < head; i++) {
        len += u8[1 + i] << (i * 8);
    }
    const start = 1 + head;
    const payload = u8.subarray(start, start + len);
    return { type, head, len, payload };
}

describe('buffer module', () => {
    test('should have correct module metadata', () => {
        expect(buffer.name).toBe('buffer');
        expect(buffer.dependencies).toEqual(['valid', 'utf8']);
        expect(typeof buffer.factory).toBe('function');
    });

    describe('factory', () => {
        let codec;

        beforeEach(() => {
            codec = buffer.factory(valid.factory(), utf8.factory());
        });

        test('should create codec instance', () => {
            expect(codec).toBeDefined();
            expect(typeof codec.out).toBe('function');
            expect(typeof codec.in).toBe('function');
            expect(typeof codec.consume).toBe('function');
            expect(typeof codec.clone).toBe('function');
            expect(typeof codec.concat).toBe('function');
        });

        describe('number encoding/decoding', () => {
            test('should roundtrip integers and floats', () => {
                const values = [
                    0,
                    255,
                    256,
                    65535,
                    65536,
                    0xffffffff,
                    -0x80000000,
                    0x7fffffff,
                    -1,
                    -128,
                    -129,
                    -32768,
                    -32769,
                    1.5,
                    1 + Math.pow(2, -11),
                    1 / 3
                ];

                values.forEach(value => {
                    const encoded = codec.out(value);
                    const decoded = codec.in(encoded);
                    if (Number.isNaN(value)) {
                        expect(Number.isNaN(decoded)).toBe(true);
                    } else {
                        expect(decoded).toBe(value);
                    }
                });
            });

            test('should preserve -0, NaN and infinities', () => {
                const values = [-0, NaN, Infinity, -Infinity];
                values.forEach(value => {
                    const encoded = codec.out(value);
                    const decoded = codec.in(encoded);
                    if (Number.isNaN(value)) {
                        expect(Number.isNaN(decoded)).toBe(true);
                    } else if (Object.is(value, -0)) {
                        expect(Object.is(decoded, -0)).toBe(true);
                    } else {
                        expect(decoded).toBe(value);
                    }
                });
            });

            test('should encode with minimal exact numeric type', () => {
                const b255 = decodeBlock(codec.out(255));
                expect(b255.type).toBe(0x01);
                expect(b255.len).toBe(2);
                expect(b255.payload[0]).toBe(NUM_TYPE.uint8);
                expect(b255.payload[1]).toBe(255);

                const b256 = decodeBlock(codec.out(256));
                expect(b256.type).toBe(0x01);
                expect(b256.len).toBe(3);
                expect(b256.payload[0]).toBe(NUM_TYPE.uint16);

                const bNeg1 = decodeBlock(codec.out(-1));
                expect(bNeg1.payload[0]).toBe(NUM_TYPE.int8);

                const bFloat16 = decodeBlock(codec.out(1.5));
                expect(bFloat16.payload[0]).toBe(NUM_TYPE.float16);
                expect(bFloat16.len).toBe(3);

                const bFloat32 = decodeBlock(codec.out(1 + Math.pow(2, -11)));
                expect(bFloat32.payload[0]).toBe(NUM_TYPE.float32);
                expect(bFloat32.len).toBe(5);

                const bFloat64 = decodeBlock(codec.out(1 / 3));
                expect(bFloat64.payload[0]).toBe(NUM_TYPE.float64);
                expect(bFloat64.len).toBe(9);
            });

            test('should roundtrip large safe integers via float64', () => {
                const value = Number.MAX_SAFE_INTEGER;
                const encoded = codec.out(value);
                const decoded = codec.in(encoded);
                expect(decoded).toBe(value);
                const info = decodeBlock(encoded);
                expect(info.payload[0]).toBe(NUM_TYPE.float64);
                expect(info.len).toBe(9);
            });

            test('should preserve negative zero in nested structures', () => {
                const value = { n: -0, arr: [-0, 0] };
                const decoded = codec.in(codec.out(value));
                expect(Object.is(decoded.n, -0)).toBe(true);
                expect(Object.is(decoded.arr[0], -0)).toBe(true);
                expect(Object.is(decoded.arr[1], 0)).toBe(true);
            });
        });

        describe('string/boolean/array/object', () => {
            test('should roundtrip string', () => {
                const value = 'Hello World';
                const encoded = codec.out(value);
                const decoded = codec.in(encoded);
                expect(decoded).toBe(value);
            });

            test('should roundtrip unicode string', () => {
                const value = 'Hello 世界';
                const decoded = codec.in(codec.out(value));
                expect(decoded).toBe(value);
            });

            test('should roundtrip boolean', () => {
                expect(codec.in(codec.out(true))).toBe(true);
                expect(codec.in(codec.out(false))).toBe(false);
            });

            test('should roundtrip array', () => {
                const value = [1, 'x', true, [2, 3]];
                const encoded = codec.out(value);
                const decoded = codec.in(encoded);
                expect(decoded).toEqual(value);
            });

            test('should roundtrip empty array', () => {
                const value = [];
                const decoded = codec.in(codec.out(value));
                expect(decoded).toEqual(value);
            });

            test('should roundtrip object', () => {
                const value = { a: 1, b: 'x', c: true, d: [2, 3] };
                const encoded = codec.out(value);
                const decoded = codec.in(encoded);
                expect(decoded).toEqual(value);
            });

            test('should roundtrip empty object', () => {
                const value = {};
                const decoded = codec.in(codec.out(value));
                expect(decoded).toEqual(value);
            });

            test('should roundtrip nested objects', () => {
                const value = { a: { b: { c: 1 } }, d: [1, { e: 'x' }] };
                const decoded = codec.in(codec.out(value));
                expect(decoded).toEqual(value);
            });
        });

        describe('uint8array/uint8clampedarray', () => {
            test('should roundtrip Uint8Array', () => {
                const value = new Uint8Array([1, 2, 3, 255]);
                const decoded = codec.in(codec.out(value));
                expect(decoded).toEqual(value);
                expect(decoded).toBeInstanceOf(Uint8Array);
            });

            test('should roundtrip Uint8ClampedArray', () => {
                const value = new Uint8ClampedArray([1, 2, 3, 255]);
                const decoded = codec.in(codec.out(value));
                expect(decoded).toEqual(value);
                expect(decoded).toBeInstanceOf(Uint8ClampedArray);
            });
        });

        describe('consume/concat/clone', () => {
            test('should consume concatenated blocks', () => {
                const a = codec.out(1);
                const b = codec.out('x');
                const c = codec.out(true);
                const all = codec.concat(a.length + b.length + c.length, [a, b, c]);
                const decoded = codec.consume(all);
                expect(decoded).toEqual([1, 'x', true]);
            });

            test('should handle consume with trailing invalid data', () => {
                const a = codec.out(1);
                const bad = new Uint8Array([0xff, 0x00, 0x00]);
                const all = codec.concat(a.length + bad.length, [a, bad]);
                const decoded = codec.consume(all);
                expect(decoded).toEqual([1]);
            });

            test('should clone values via encode/decode', () => {
                const value = { a: 1, b: [2, 3], c: 'z' };
                const cloned = codec.clone(value);
                expect(cloned).toEqual(value);
            });
        });

        describe('invalid input handling', () => {
            test('should return null for invalid block header', () => {
                const bad = new Uint8Array([0x00]);
                const decoded = codec.in(bad);
                expect(decoded).toBe(null);
            });

            test('should return null for truncated block', () => {
                const good = codec.out(1);
                const truncated = good.slice(0, good.length - 1);
                const decoded = codec.in(truncated);
                expect(decoded).toBe(null);
            });
        });
    });
});
