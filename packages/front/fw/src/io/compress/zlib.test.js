// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 }    from './lz77.js';
import { zlib }    from './zlib.js';
import { adler32 } from '../calc/adler32.js';

describe('zlib module', () => {

    test('has correct module metadata', () => {
        expect(zlib.name).toBe('zlib');
        expect(zlib.dependencies).toEqual(['deflate', 'adler32']);
        expect(typeof zlib.factory).toBe('function');
    });

    describe('factory', () => {
        const bs = bitstream.factory();
        const d = deflate.factory(bs, huffman.factory(bs), lz77.factory());
        const Adler32 = adler32.factory();
        const z = zlib.factory(d, Adler32);

        test('returns expected methods', () => {
            expect(typeof z.zlibSync).toBe('function');
            expect(typeof z.unzlibSync).toBe('function');
            expect(typeof z.zlib).toBe('function');
            expect(typeof z.unzlib).toBe('function');
        });

        describe('zlibSync / unzlibSync', () => {
            test('round-trip: empty buffer', () => {
                const data = new Uint8Array(0);
                const compressed = z.zlibSync(data);
                const restored = z.unzlibSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: ASCII string', () => {
                const data = new TextEncoder().encode('Hello, Zlib!');
                const compressed = z.zlibSync(data);
                const restored = z.unzlibSync(compressed);
                expect(restored).toEqual(data);
            });

            test('output starts with zlib CMF byte 0x78', () => {
                const data = new TextEncoder().encode('test');
                const compressed = z.zlibSync(data);
                expect(compressed[0]).toBe(0x78);
                // CMF/FLG must be divisible by 31
                expect(((compressed[0] << 8) | compressed[1]) % 31).toBe(0);
            });

            test('round-trip: repetitive data', () => {
                const data = new Uint8Array(5000).fill(99);
                const compressed = z.zlibSync(data);
                expect(compressed.length).toBeLessThan(data.length);
                const restored = z.unzlibSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: level 0 (store)', () => {
                const data = new TextEncoder().encode('store mode');
                const compressed = z.zlibSync(data, { level: 0 });
                const restored = z.unzlibSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip with pre-allocated output', () => {
                const data = new TextEncoder().encode('pre-alloc zlib');
                const compressed = z.zlibSync(data);
                const out = new Uint8Array(data.length);
                const restored = z.unzlibSync(compressed, { out });
                expect(restored).toEqual(data);
            });
        });

        describe('zlib / unzlib (async)', () => {
            test('async round-trip', async () => {
                const data = new TextEncoder().encode('async zlib test');
                const compressed = await z.zlib(data);
                const restored = await z.unzlib(compressed);
                expect(restored).toEqual(data);
            });
        });

        test('invalid zlib data throws', () => {
            expect(() => z.unzlibSync(new Uint8Array([0, 0, 0, 0]))).toThrow();
        });

        describe('ZlibStream / UnzlibStream (streaming)', () => {
            function collect(pushFn) {
                const chunks = [];
                pushFn(chunks);
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) { out.set(c, off); off += c.length; }
                return out;
            }

            test('returns expected stream constructors', () => {
                expect(typeof z.ZlibStream).toBe('function');
                expect(typeof z.UnzlibStream).toBe('function');
            });

            test('single-chunk round-trip', () => {
                const data = new TextEncoder().encode('streaming zlib test');

                const compressed = collect(chunks => {
                    const s = new z.ZlibStream({}, (c) => chunks.push(c));
                    s.push(data, true);
                });

                const restored = collect(chunks => {
                    const s = new z.UnzlibStream({}, (c) => chunks.push(c));
                    s.push(compressed, true);
                });

                expect(restored).toEqual(data);
            });

            test('multi-chunk compress, single decompress', () => {
                const enc = new TextEncoder();
                const part1 = enc.encode('hello ');
                const part2 = enc.encode('world');
                const expected = enc.encode('hello world');

                const compressed = collect(chunks => {
                    const s = new z.ZlibStream({}, (c) => chunks.push(c));
                    s.push(part1, false);
                    s.push(part2, true);
                });

                const restored = collect(chunks => {
                    const s = new z.UnzlibStream({}, (c) => chunks.push(c));
                    s.push(compressed, true);
                });

                expect(restored).toEqual(expected);
            });

            test('stream decompress in multiple chunks', () => {
                const data = new Uint8Array(2000).map((_, i) => i & 0xFF);
                const compressed = z.zlibSync(data);

                const mid = compressed.length >> 1;
                const restored = collect(chunks => {
                    const s = new z.UnzlibStream({}, (c) => chunks.push(c));
                    s.push(compressed.subarray(0, mid), false);
                    s.push(compressed.subarray(mid), true);
                });

                expect(restored).toEqual(data);
            });

            test('ZlibStream output starts with CMF byte 0x78', () => {
                const data = new TextEncoder().encode('test');
                let firstChunk = null;
                const s = new z.ZlibStream({}, (c) => { if (!firstChunk) firstChunk = c; });
                s.push(data, true);
                expect(firstChunk[0]).toBe(0x78);
                expect(((firstChunk[0] << 8) | firstChunk[1]) % 31).toBe(0);
            });

            test('ZlibStream with ondata as first argument', () => {
                const data = new TextEncoder().encode('callback style');
                const chunks = [];
                const s = new z.ZlibStream((c) => chunks.push(c));
                s.push(data, true);
                expect(chunks.length).toBeGreaterThan(0);
            });
        });
    });
});
