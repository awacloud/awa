// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { msgpack } from './msgpack.js';
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

describe('msgpack module', () => {
    test('should have correct module metadata', () => {
        expect(msgpack.name).toBe('msgpack');
        expect(msgpack.dependencies).toEqual(['utf8']);
        expect(typeof msgpack.factory).toBe('function');
    });

    describe('factory', () => {
        let codec;

        beforeEach(() => {
            codec = msgpack.factory(utf8.factory());
        });

        test('should create codec instance', () => {
            expect(typeof codec.encode).toBe('function');
            expect(typeof codec.decode).toBe('function');
            expect(typeof codec.Ext).toBe('function');
        });

        describe('spec-defined prefixes (encode)', () => {
            const vectors = [
                [null, 'c0'],
                [false, 'c2'],
                [true, 'c3'],
                [0, '00'],
                [1, '01'],
                [0x7f, '7f'],
                [0x80, 'cc80'],
                [0xff, 'ccff'],
                [0x100, 'cd0100'],
                [0xffff, 'cdffff'],
                [0x10000, 'ce00010000'],
                [0xffffffff, 'ceffffffff'],
                [-1, 'ff'],
                [-32, 'e0'],
                [-33, 'd0df'],
                [-0x80, 'd080'],
                [-0x81, 'd1ff7f'],
                [-0x8000, 'd18000'],
                [-0x8001, 'd2ffff7fff'],
                [-0x80000000, 'd280000000'],
                ['', 'a0'],
                ['a', 'a161'],
                ['hello', 'a568656c6c6f'],
                [[], '90'],
                [[1, 2, 3], '93010203'],
                [{}, '80'],
                [{ a: 1 }, '81a16101'],
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

        describe('undefined', () => {
            test('undefined encodes as nil (0xc0) and decodes as null', () => {
                expect(bytesToHex(codec.encode(undefined))).toBe('c0');
                expect(codec.decode(hexToBytes('c0'))).toBe(null);
            });
        });

        describe('floats', () => {
            test('1.5 → float32 (shortest exact form)', () => {
                const encoded = codec.encode(1.5);
                expect(encoded[0]).toBe(0xca);
                expect(codec.decode(encoded)).toBe(1.5);
            });

            test('1.1 → float64 (not exact as float32)', () => {
                const encoded = codec.encode(1.1);
                expect(encoded[0]).toBe(0xcb);
                expect(codec.decode(encoded)).toBe(1.1);
            });

            test('-0 preserved as float32', () => {
                const encoded = codec.encode(-0);
                expect(encoded[0]).toBe(0xca);
                const decoded = codec.decode(encoded);
                expect(Object.is(decoded, -0)).toBe(true);
            });

            test('decode float32', () => {
                // 0xca + float32(1.5) = 3fc00000
                expect(codec.decode(hexToBytes('ca3fc00000'))).toBe(1.5);
            });

            test('NaN roundtrip', () => {
                expect(Number.isNaN(codec.decode(codec.encode(NaN)))).toBe(true);
            });

            test('Infinity roundtrip', () => {
                expect(codec.decode(codec.encode(Infinity))).toBe(Infinity);
                expect(codec.decode(codec.encode(-Infinity))).toBe(-Infinity);
            });
        });

        describe('strings', () => {
            test('UTF-8 multibyte', () => {
                const s = 'héllo 世界';
                expect(codec.decode(codec.encode(s))).toBe(s);
            });

            test('str8 (33 chars)', () => {
                const s = 'a'.repeat(33);
                const encoded = codec.encode(s);
                expect(encoded[0]).toBe(0xd9);
                expect(encoded[1]).toBe(33);
                expect(codec.decode(encoded)).toBe(s);
            });

            test('str16 (300 bytes)', () => {
                const s = 'b'.repeat(300);
                const encoded = codec.encode(s);
                expect(encoded[0]).toBe(0xda);
                expect(codec.decode(encoded)).toBe(s);
            });

            test('str32 (70000 bytes)', () => {
                const s = 'c'.repeat(70000);
                const encoded = codec.encode(s);
                expect(encoded[0]).toBe(0xdb);
                expect(codec.decode(encoded)).toBe(s);
            });
        });

        describe('binary (Uint8Array)', () => {
            test('bin8', () => {
                const v = new Uint8Array([1, 2, 3, 4, 5]);
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0xc4);
                expect(encoded[1]).toBe(5);
                expect(Array.from(codec.decode(encoded))).toEqual([1, 2, 3, 4, 5]);
            });

            test('bin16 (300 bytes)', () => {
                const v = new Uint8Array(300).fill(0xaa);
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0xc5);
                const decoded = codec.decode(encoded);
                expect(decoded.length).toBe(300);
                expect(decoded[0]).toBe(0xaa);
                expect(decoded[299]).toBe(0xaa);
            });
        });

        describe('arrays', () => {
            test('array16 (20 items)', () => {
                const v = [];
                for (let i = 0; i < 20; i++) v.push(i);
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0xdc);
                expect(codec.decode(encoded)).toEqual(v);
            });

            test('nested arrays', () => {
                const v = [1, [2, [3, [4, [5]]]]];
                expect(codec.decode(codec.encode(v))).toEqual(v);
            });
        });

        describe('maps', () => {
            test('map16 (20 entries)', () => {
                const v = {};
                for (let i = 0; i < 20; i++) v['key' + i] = i;
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0xde);
                expect(codec.decode(encoded)).toEqual(v);
            });

            test('Map instance roundtrip', () => {
                const m = new Map();
                m.set('x', 1);
                m.set('y', 'two');
                expect(codec.decode(codec.encode(m))).toEqual({ x: 1, y: 'two' });
            });
        });

        describe('BigInt', () => {
            test('uint64 roundtrip', () => {
                const v = 0xffffffffffffffffn;
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0xcf);
                expect(codec.decode(encoded)).toBe(v);
            });

            test('int64 roundtrip', () => {
                const v = -0x8000000000000000n;
                const encoded = codec.encode(v);
                expect(encoded[0]).toBe(0xd3);
                expect(codec.decode(encoded)).toBe(v);
            });

            test('out-of-range BigInt throws', () => {
                expect(() => codec.encode(1n << 70n)).toThrow();
            });
        });

        describe('ext types', () => {
            test('fixext1', () => {
                const ext = new codec.Ext(5, new Uint8Array([0xaa]));
                const encoded = codec.encode(ext);
                expect(encoded[0]).toBe(0xd4);
                expect(encoded[1]).toBe(5);
                const decoded = codec.decode(encoded);
                expect(decoded).toBeInstanceOf(codec.Ext);
                expect(decoded.type).toBe(5);
                expect(Array.from(decoded.data)).toEqual([0xaa]);
            });

            test('fixext4', () => {
                const ext = new codec.Ext(3, new Uint8Array([1, 2, 3, 4]));
                const encoded = codec.encode(ext);
                expect(encoded[0]).toBe(0xd6);
            });

            test('ext8 (3 bytes)', () => {
                const ext = new codec.Ext(7, new Uint8Array([1, 2, 3]));
                const encoded = codec.encode(ext);
                expect(encoded[0]).toBe(0xc7);
                const decoded = codec.decode(encoded);
                expect(decoded.type).toBe(7);
                expect(Array.from(decoded.data)).toEqual([1, 2, 3]);
            });

            test('negative type code', () => {
                const ext = new codec.Ext(-1, new Uint8Array([0xff]));
                const encoded = codec.encode(ext);
                const decoded = codec.decode(encoded);
                expect(decoded.type).toBe(-1);
            });
        });

        describe('roundtrip', () => {
            test('deep mixed structure', () => {
                const v = {
                    name: 'Bob',
                    flags: [true, false, null],
                    scores: [10, 20, 30],
                    meta: { nested: { leaf: 'ok' } },
                    blob: new Uint8Array([0xca, 0xfe])
                };
                const decoded = codec.decode(codec.encode(v));
                expect(decoded.name).toBe('Bob');
                expect(decoded.flags).toEqual([true, false, null]);
                expect(decoded.scores).toEqual([10, 20, 30]);
                expect(decoded.meta).toEqual({ nested: { leaf: 'ok' } });
                expect(Array.from(decoded.blob)).toEqual([0xca, 0xfe]);
            });

            test('boundary integers', () => {
                const values = [0, 127, 128, 255, 256, 65535, 65536, 0xffffffff,
                    -1, -32, -33, -128, -129, -32768, -32769, -0x80000000];
                for (const v of values) {
                    expect(codec.decode(codec.encode(v))).toBe(v);
                }
            });
        });

        describe('errors', () => {
            test('truncated input throws', () => {
                expect(() => codec.decode(hexToBytes('cd00'))).toThrow();
            });

            test('unknown prefix throws', () => {
                expect(() => codec.decode(new Uint8Array([0xc1]))).toThrow();
            });

            test('unsupported value (Symbol) throws', () => {
                expect(() => codec.encode(Symbol('x'))).toThrow();
            });
        });

        describe('timestamp extension (type -1)', () => {
            test('timestamp 32 (fixext4) for dates on whole seconds', () => {
                const d = new Date('2024-01-01T00:00:00.000Z');
                const encoded = codec.encode(d);
                expect(encoded[0]).toBe(0xd6); // fixext4
                expect(encoded[1]).toBe(0xff); // type -1
                const decoded = codec.decode(encoded);
                expect(decoded).toBeInstanceOf(Date);
                expect(decoded.getTime()).toBe(d.getTime());
            });

            test('timestamp 64 (fixext8) for sub-second dates', () => {
                const d = new Date('2024-01-01T00:00:00.123Z');
                const encoded = codec.encode(d);
                expect(encoded[0]).toBe(0xd7);
                expect(encoded[1]).toBe(0xff);
                const decoded = codec.decode(encoded);
                expect(decoded.getTime()).toBe(d.getTime());
            });

            test('timestamp 96 (ext8 len=12) for pre-1970 dates', () => {
                const d = new Date('1900-01-01T00:00:00.500Z');
                const encoded = codec.encode(d);
                expect(encoded[0]).toBe(0xc7);
                expect(encoded[1]).toBe(12);
                expect(encoded[2]).toBe(0xff);
                const decoded = codec.decode(encoded);
                expect(decoded.getTime()).toBe(d.getTime());
            });

            test('date fields in objects roundtrip', () => {
                const v = { at: new Date('2025-06-15T12:34:56.789Z'), n: 7 };
                const decoded = codec.decode(codec.encode(v));
                expect(decoded.n).toBe(7);
                expect(decoded.at).toBeInstanceOf(Date);
                expect(decoded.at.getTime()).toBe(v.at.getTime());
            });

            test('Now roundtrip', () => {
                const now = new Date();
                const decoded = codec.decode(codec.encode(now));
                expect(decoded.getTime()).toBe(now.getTime());
            });
        });

        describe('useMap decode option', () => {
            test('returns Map instances with useMap:true', () => {
                const bytes = codec.encode({ a: 1, b: 2 });
                const decoded = codec.decode(bytes, { useMap: true });
                expect(decoded).toBeInstanceOf(Map);
                expect(decoded.get('a')).toBe(1);
            });

            test('preserves insertion order', () => {
                const m = new Map();
                m.set('z', 1);
                m.set('a', 2);
                const decoded = codec.decode(codec.encode(m), { useMap: true });
                expect([...decoded.keys()]).toEqual(['z', 'a']);
            });

            test('preserves non-string keys', () => {
                const m = new Map();
                m.set(1, 'one');
                m.set(2, 'two');
                const decoded = codec.decode(codec.encode(m), { useMap: true });
                expect(decoded.get(1)).toBe('one');
                expect(decoded.get(2)).toBe('two');
            });
        });
    });
});
