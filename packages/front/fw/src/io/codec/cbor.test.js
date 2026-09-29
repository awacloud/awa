// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { cbor } from './cbor.js';
import { utf8 } from './utf8.js';

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}
function bytesToHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
}

describe('cbor module', () => {
    test('should have correct module metadata', () => {
        expect(cbor.name).toBe('cbor');
        expect(cbor.dependencies).toEqual(['utf8']);
        expect(typeof cbor.factory).toBe('function');
    });

    describe('factory', () => {
        let codec;

        beforeEach(() => {
            codec = cbor.factory(utf8.factory());
        });

        test('should create codec instance', () => {
            expect(codec).toBeDefined();
            expect(typeof codec.encode).toBe('function');
            expect(typeof codec.decode).toBe('function');
            expect(typeof codec.Tagged).toBe('function');
        });

        describe('RFC 8949 Appendix A - integer & misc vectors (deterministic)', () => {
            // Values where encoder is expected to emit the shortest int form
            const vectors = [
                [0, '00'],
                [1, '01'],
                [10, '0a'],
                [23, '17'],
                [24, '1818'],
                [100, '1864'],
                [1000, '1903e8'],
                [1000000, '1a000f4240'],
                [-1, '20'],
                [-10, '29'],
                [-100, '3863'],
                [-1000, '3903e7'],
                [false, 'f4'],
                [true, 'f5'],
                [null, 'f6'],
                [undefined, 'f7'],
                [Infinity, 'f97c00'],
                [-Infinity, 'f9fc00'],
                ['', '60'],
                ['a', '6161'],
                ['IETF', '6449455446'],
                ['"\\', '62225c'],
                [[], '80'],
                [[1, 2, 3], '83010203'],
                [{}, 'a0'],
            ];

            vectors.forEach(([value, hex]) => {
                test(`encode ${JSON.stringify(value) ?? String(value)} → ${hex}`, () => {
                    expect(bytesToHex(codec.encode(value))).toBe(hex);
                });
                test(`decode ${hex} → ${JSON.stringify(value) ?? String(value)}`, () => {
                    expect(codec.decode(hexToBytes(hex))).toEqual(value);
                });
            });
        });

        describe('float encodings', () => {
            test('1.5 → f93e00 (float16)', () => {
                expect(bytesToHex(codec.encode(1.5))).toBe('f93e00');
                expect(codec.decode(hexToBytes('f93e00'))).toBe(1.5);
            });

            test('3.4028234663852886e+38 → fa7f7fffff (float32)', () => {
                expect(bytesToHex(codec.encode(3.4028234663852886e+38))).toBe('fa7f7fffff');
                expect(codec.decode(hexToBytes('fa7f7fffff'))).toBe(3.4028234663852886e+38);
            });

            test('1.1 → float64', () => {
                const encoded = codec.encode(1.1);
                expect(encoded[0]).toBe(0xfb);
                expect(codec.decode(encoded)).toBe(1.1);
            });

            test('decode float16 vectors', () => {
                expect(codec.decode(hexToBytes('f90000'))).toBe(0);
                expect(codec.decode(hexToBytes('f93c00'))).toBe(1);
                expect(codec.decode(hexToBytes('f97bff'))).toBe(65504);
            });

            test('-0 preserved (sign round-trip)', () => {
                const encoded = codec.encode(-0);
                expect(bytesToHex(encoded)).toBe('f98000');
                const decoded = codec.decode(encoded);
                expect(Object.is(decoded, -0)).toBe(true);
            });
        });

        describe('NaN handling', () => {
            test('should encode/decode NaN', () => {
                const encoded = codec.encode(NaN);
                expect(Number.isNaN(codec.decode(encoded))).toBe(true);
            });
        });

        describe('strings', () => {
            test('should handle UTF-8 multibyte', () => {
                const s = 'héllo 世界';
                expect(codec.decode(codec.encode(s))).toBe(s);
            });

            test('should handle long strings', () => {
                const s = 'x'.repeat(300);
                expect(codec.decode(codec.encode(s))).toBe(s);
            });
        });

        describe('byte strings (Uint8Array)', () => {
            test('should encode empty byte string', () => {
                expect(bytesToHex(codec.encode(new Uint8Array([])))).toBe('40');
            });

            test('should encode 4-byte byte string', () => {
                expect(bytesToHex(codec.encode(new Uint8Array([1, 2, 3, 4])))).toBe('4401020304');
            });

            test('should roundtrip Uint8Array', () => {
                const bytes = new Uint8Array([0, 1, 127, 128, 255]);
                const decoded = codec.decode(codec.encode(bytes));
                expect(decoded).toBeInstanceOf(Uint8Array);
                expect(Array.from(decoded)).toEqual(Array.from(bytes));
            });
        });

        describe('arrays', () => {
            test('should encode nested arrays', () => {
                const v = [1, [2, 3], [4, 5]];
                expect(bytesToHex(codec.encode(v))).toBe('8301820203820405');
            });

            test('should encode long arrays', () => {
                const v = [];
                for (let i = 1; i <= 25; i++) v.push(i);
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0x98); // array length 24+ uses 1-byte suffix
                expect(codec.decode(encoded)).toEqual(v);
            });
        });

        describe('maps / objects', () => {
            test('should encode {"a":1,"b":[2,3]}', () => {
                const v = { a: 1, b: [2, 3] };
                expect(bytesToHex(codec.encode(v))).toBe('a26161016162820203');
            });

            test('should encode mixed keyed object', () => {
                const v = { 1: 2, 3: 4 };
                // Object.keys returns string keys
                const decoded = codec.decode(codec.encode(v));
                expect(decoded).toEqual(v);
            });

            test('should roundtrip Map', () => {
                const m = new Map();
                m.set('x', 1);
                m.set('y', [1, 2]);
                const decoded = codec.decode(codec.encode(m));
                // Map decodes into a plain object (string keys here)
                expect(decoded).toEqual({ x: 1, y: [1, 2] });
            });
        });

        describe('BigInt', () => {
            test('should encode small BigInt as major 0/1', () => {
                expect(bytesToHex(codec.encode(42n))).toBe('182a');
                expect(bytesToHex(codec.encode(-42n))).toBe('3829');
            });

            test('should decode 64-bit unsigned back to BigInt', () => {
                // 2^40 requires 8-byte argument → decoded as Number (safe)
                const big = 0xffffffffffffffffn;
                const encoded = codec.encode(big);
                expect(codec.decode(encoded)).toBe(big);
            });

            test('should encode very large BigInt as tag 2', () => {
                const big = 1n << 80n;
                const encoded = codec.encode(big);
                expect(encoded[0]).toBe(0xc2); // tag 2
                expect(codec.decode(encoded)).toBe(big);
            });

            test('should encode very large negative BigInt as tag 3', () => {
                const big = -(1n << 80n);
                const encoded = codec.encode(big);
                expect(encoded[0]).toBe(0xc3); // tag 3
                expect(codec.decode(encoded)).toBe(big);
            });
        });

        describe('Tagged values', () => {
            test('should passthrough unknown tags', () => {
                const t = new codec.Tagged(1234, 'payload');
                const encoded = codec.encode(t);
                const decoded = codec.decode(encoded);
                expect(decoded).toBeInstanceOf(codec.Tagged);
                expect(decoded.tag).toBe(1234);
                expect(decoded.value).toBe('payload');
            });
        });

        describe('indefinite length decoding', () => {
            test('should decode indefinite array', () => {
                const bytes = hexToBytes('9f018202039f0405ffff');
                expect(codec.decode(bytes)).toEqual([1, [2, 3], [4, 5]]);
            });

            test('should decode indefinite map', () => {
                const bytes = hexToBytes('bf61610161629f0203ffff');
                expect(codec.decode(bytes)).toEqual({ a: 1, b: [2, 3] });
            });

            test('should decode indefinite text string', () => {
                const bytes = hexToBytes('7f657374726561646d696e67ff');
                expect(codec.decode(bytes)).toBe('streaming');
            });

            test('should decode indefinite byte string', () => {
                const bytes = hexToBytes('5f42010243030405ff');
                const result = codec.decode(bytes);
                expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
            });
        });

        describe('roundtrip', () => {
            test('should roundtrip deeply nested structure', () => {
                const v = {
                    name: 'Alice',
                    age: 30,
                    active: true,
                    tags: ['admin', 'user'],
                    meta: { flags: [1, 2, 3], extra: null },
                    blob: new Uint8Array([0xde, 0xad, 0xbe, 0xef])
                };
                const decoded = codec.decode(codec.encode(v));
                expect(decoded.name).toBe('Alice');
                expect(decoded.age).toBe(30);
                expect(decoded.active).toBe(true);
                expect(decoded.tags).toEqual(['admin', 'user']);
                expect(decoded.meta).toEqual({ flags: [1, 2, 3], extra: null });
                expect(Array.from(decoded.blob)).toEqual([0xde, 0xad, 0xbe, 0xef]);
            });

            test('should roundtrip integer boundary values', () => {
                const values = [0, 23, 24, 255, 256, 65535, 65536, 0xffffffff,
                    -1, -24, -25, -256, -257, -0x100000000];
                for (const v of values) {
                    expect(codec.decode(codec.encode(v))).toBe(v);
                }
            });

            test('should roundtrip float values', () => {
                const values = [0.5, -0.5, 1.5, 3.14, 2.718281828, 1e100, -1e-100];
                for (const v of values) {
                    expect(codec.decode(codec.encode(v))).toBe(v);
                }
            });
        });

        describe('errors', () => {
            test('should throw on truncated input', () => {
                expect(() => codec.decode(hexToBytes('1a0000'))).toThrow();
            });

            test('should throw on unsupported value (Symbol)', () => {
                expect(() => codec.encode(Symbol('x'))).toThrow();
            });
        });

        describe('deterministic encoding (RFC 8949 §4.2)', () => {
            test('sorts map keys by bytewise lex of encoded form', () => {
                // Keys: "a" (61), "b" (62), 10 (0a). Encoded :
                //   10  → 0a   (1 byte)
                //   "a" → 6161 (2 bytes, starts with 0x61)
                //   "b" → 6162 (2 bytes, starts with 0x61)
                // Bytewise lex : shorter first → 10, then "a" (61 61), then "b" (61 62).
                const m = new Map();
                m.set('b', 2);
                m.set('a', 1);
                m.set(10, 'ten');
                const encoded = codec.encode(m, { deterministic: true });
                // a3 (map len 3) + 0a (key 10) + 63..("ten") + 6161 + 01 + 6162 + 02
                expect(bytesToHex(encoded)).toBe('a30a6374656e61610161620 2'.replace(/ /g, ''));
            });

            test('deep deterministic encoding sorts inner maps too', () => {
                const v = { z: { b: 1, a: 2 }, a: 3 };
                const det = codec.encode(v, { deterministic: true });
                // top level: "a" (6161) < "z" (617a) ; inner : "a" < "b"
                const decoded = codec.decode(det, { useMap: true });
                expect([...decoded.keys()]).toEqual(['a', 'z']);
                expect([...decoded.get('z').keys()]).toEqual(['a', 'b']);
            });

            test('non-deterministic keeps insertion order', () => {
                const m = new Map();
                m.set('z', 1);
                m.set('a', 2);
                const encoded = codec.encode(m);
                const decoded = codec.decode(encoded, { useMap: true });
                expect([...decoded.keys()]).toEqual(['z', 'a']);
            });
        });

        describe('Simple values', () => {
            test('decode simple(0..19) as Simple instance', () => {
                const decoded = codec.decode(hexToBytes('e0')); // simple(0)
                expect(decoded).toBeInstanceOf(codec.Simple);
                expect(decoded.value).toBe(0);
            });

            test('decode simple(16) via one-byte form (f8 10)', () => {
                const decoded = codec.decode(hexToBytes('f810'));
                expect(decoded).toBeInstanceOf(codec.Simple);
                expect(decoded.value).toBe(16);
            });

            test('decode simple(255) via f8 ff', () => {
                const decoded = codec.decode(hexToBytes('f8ff'));
                expect(decoded).toBeInstanceOf(codec.Simple);
                expect(decoded.value).toBe(255);
            });

            test('encode Simple(5) → e5', () => {
                expect(bytesToHex(codec.encode(new codec.Simple(5)))).toBe('e5');
            });

            test('encode Simple(32) → f820', () => {
                expect(bytesToHex(codec.encode(new codec.Simple(32)))).toBe('f820');
            });

            test('encode Simple(255) → f8ff', () => {
                expect(bytesToHex(codec.encode(new codec.Simple(255)))).toBe('f8ff');
            });

            test('roundtrip Simple through encode', () => {
                for (const n of [0, 15, 19, 32, 100, 200, 255]) {
                    const decoded = codec.decode(codec.encode(new codec.Simple(n)));
                    expect(decoded.value).toBe(n);
                }
            });

            test('refuse to encode reserved simple(24..31)', () => {
                expect(() => codec.encode(new codec.Simple(24))).toThrow();
                expect(() => codec.encode(new codec.Simple(31))).toThrow();
            });

            test('refuse to construct out-of-range Simple', () => {
                expect(() => new codec.Simple(-1)).toThrow();
                expect(() => new codec.Simple(256)).toThrow();
                expect(() => new codec.Simple(1.5)).toThrow();
            });
        });

        describe('useMap decode option', () => {
            test('returns Map for CBOR maps with useMap:true', () => {
                const bytes = codec.encode({ a: 1, b: 2 });
                const decoded = codec.decode(bytes, { useMap: true });
                expect(decoded).toBeInstanceOf(Map);
                expect(decoded.get('a')).toBe(1);
                expect(decoded.get('b')).toBe(2);
            });

            test('preserves non-string integer keys', () => {
                const m = new Map();
                m.set(1, 'one');
                m.set(2, 'two');
                const bytes = codec.encode(m);
                const decoded = codec.decode(bytes, { useMap: true });
                expect(decoded.get(1)).toBe('one');
                expect(decoded.get(2)).toBe('two');
                // Without useMap, keys would be stringified :
                const plain = codec.decode(bytes);
                expect(plain).toEqual({ '1': 'one', '2': 'two' });
            });

            test('preserves insertion order', () => {
                const m = new Map();
                m.set('z', 1);
                m.set('a', 2);
                m.set('m', 3);
                const decoded = codec.decode(codec.encode(m), { useMap: true });
                expect([...decoded.keys()]).toEqual(['z', 'a', 'm']);
            });

            test('works with indefinite-length map', () => {
                const bytes = hexToBytes('bf61610161629f0203ffff');
                const decoded = codec.decode(bytes, { useMap: true });
                expect(decoded).toBeInstanceOf(Map);
                expect(decoded.get('a')).toBe(1);
                expect(decoded.get('b')).toEqual([2, 3]);
            });
        });

        describe('canonical NaN (deterministic §4.2.2)', () => {
            test('NaN always encodes as f97e00', () => {
                expect(bytesToHex(codec.encode(NaN))).toBe('f97e00');
            });
        });
    });
});
