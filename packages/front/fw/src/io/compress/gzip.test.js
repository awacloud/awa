// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 }    from './lz77.js';
import { gzip }    from './gzip.js';
import { crc32 }   from '../calc/crc32.js';

describe('gzip module', () => {

    test('has correct module metadata', () => {
        expect(gzip.name).toBe('gzip');
        expect(gzip.dependencies).toEqual(['deflate', 'crc32']);
        expect(typeof gzip.factory).toBe('function');
    });

    describe('factory', () => {
        const bs = bitstream.factory();
        const d = deflate.factory(bs, huffman.factory(bs), lz77.factory());
        const Crc32 = crc32.factory();
        const g = gzip.factory(d, Crc32);

        test('returns expected methods', () => {
            expect(typeof g.gzipSync).toBe('function');
            expect(typeof g.gunzipSync).toBe('function');
            expect(typeof g.gzip).toBe('function');
            expect(typeof g.gunzip).toBe('function');
        });

        describe('gzipSync / gunzipSync', () => {
            test('round-trip: empty buffer', () => {
                const data = new Uint8Array(0);
                const compressed = g.gzipSync(data);
                const restored = g.gunzipSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: ASCII string', () => {
                const data = new TextEncoder().encode('Hello, Gzip!');
                const compressed = g.gzipSync(data);
                const restored = g.gunzipSync(compressed);
                expect(restored).toEqual(data);
            });

            test('output starts with gzip magic bytes', () => {
                const data = new TextEncoder().encode('test');
                const compressed = g.gzipSync(data);
                expect(compressed[0]).toBe(0x1F);
                expect(compressed[1]).toBe(0x8B);
                expect(compressed[2]).toBe(0x08);
            });

            test('round-trip with filename option', () => {
                const data = new TextEncoder().encode('file contents');
                const compressed = g.gzipSync(data, { filename: 'test.txt' });
                // FNAME flag should be set
                expect(compressed[3] & 0x08).toBe(0x08);
                const restored = g.gunzipSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip: large repetitive data', () => {
                const data = new Uint8Array(10000).fill(42);
                const compressed = g.gzipSync(data);
                expect(compressed.length).toBeLessThan(data.length);
                const restored = g.gunzipSync(compressed);
                expect(restored).toEqual(data);
            });

            test('round-trip with pre-allocated output', () => {
                const data = new TextEncoder().encode('pre-alloc test');
                const compressed = g.gzipSync(data);
                const out = new Uint8Array(data.length);
                const restored = g.gunzipSync(compressed, { out });
                expect(restored).toEqual(data);
            });
        });

        describe('gzip / gunzip (async)', () => {
            test('async round-trip', async () => {
                const data = new TextEncoder().encode('async gzip test');
                const compressed = await g.gzip(data);
                const restored = await g.gunzip(compressed);
                expect(restored).toEqual(data);
            });
        });

        test('invalid gzip data throws', () => {
            expect(() => g.gunzipSync(new Uint8Array([0, 1, 2, 3]))).toThrow();
        });

        describe('GzipStream / GunzipStream (streaming)', () => {
            function collect(pushFn) {
                const chunks = [];
                const stream = pushFn(chunks);
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) { out.set(c, off); off += c.length; }
                return out;
            }

            test('returns expected stream constructors', () => {
                expect(typeof g.GzipStream).toBe('function');
                expect(typeof g.GunzipStream).toBe('function');
            });

            test('single-chunk round-trip', () => {
                const data = new TextEncoder().encode('streaming gzip test');

                const compressed = collect(chunks => {
                    const s = new g.GzipStream({}, (c, f) => chunks.push(c));
                    s.push(data, true);
                    return s;
                });

                const restored = collect(chunks => {
                    const s = new g.GunzipStream({}, (c, f) => chunks.push(c));
                    s.push(compressed, true);
                    return s;
                });

                expect(restored).toEqual(data);
            });

            test('multi-chunk compress, single decompress', () => {
                const enc = new TextEncoder();
                const part1 = enc.encode('hello ');
                const part2 = enc.encode('world');
                const expected = enc.encode('hello world');

                const compressed = collect(chunks => {
                    const s = new g.GzipStream({}, (c) => chunks.push(c));
                    s.push(part1, false);
                    s.push(part2, true);
                    return s;
                });

                const restored = collect(chunks => {
                    const s = new g.GunzipStream({}, (c) => chunks.push(c));
                    s.push(compressed, true);
                    return s;
                });

                expect(restored).toEqual(expected);
            });

            test('stream decompress in multiple chunks', () => {
                const data = new Uint8Array(2000).map((_, i) => i & 0xFF);
                const compressed = g.gzipSync(data);

                const mid = compressed.length >> 1;
                const restored = collect(chunks => {
                    const s = new g.GunzipStream({}, (c) => chunks.push(c));
                    s.push(compressed.subarray(0, mid), false);
                    s.push(compressed.subarray(mid), true);
                    return s;
                });

                expect(restored).toEqual(data);
            });

            test('GzipStream output starts with gzip magic bytes', () => {
                const data = new TextEncoder().encode('test');
                let firstChunk = null;
                const s = new g.GzipStream({}, (c) => { if (!firstChunk) firstChunk = c; });
                s.push(data, true);
                expect(firstChunk[0]).toBe(0x1F);
                expect(firstChunk[1]).toBe(0x8B);
            });

            test('GzipStream with ondata as first argument', () => {
                const data = new TextEncoder().encode('callback style');
                const chunks = [];
                const s = new g.GzipStream((c) => chunks.push(c));
                s.push(data, true);
                expect(chunks.length).toBeGreaterThan(0);
            });
        });
    });
});
