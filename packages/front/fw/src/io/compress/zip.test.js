// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 }    from './lz77.js';
import { zip }     from './zip.js';
import { crc32 }   from '../calc/crc32.js';

describe('zip module', () => {

    test('has correct module metadata', () => {
        expect(zip.name).toBe('zip');
        expect(zip.dependencies).toEqual(['deflate', 'crc32']);
        expect(typeof zip.factory).toBe('function');
    });

    describe('factory', () => {
        const bs = bitstream.factory();
        const d = deflate.factory(bs, huffman.factory(bs), lz77.factory());
        const Crc32 = crc32.factory();
        const z = zip.factory(d, Crc32);

        test('returns expected methods', () => {
            expect(typeof z.zipSync).toBe('function');
            expect(typeof z.unzipSync).toBe('function');
            expect(typeof z.zip).toBe('function');
            expect(typeof z.unzip).toBe('function');
        });

        describe('zipSync / unzipSync', () => {
            test('round-trip: single file', () => {
                const data = new TextEncoder().encode('Hello, ZIP!');
                const archive = z.zipSync({ 'hello.txt': data });
                const extracted = z.unzipSync(archive);
                expect(extracted['hello.txt']).toEqual(data);
            });

            test('round-trip: multiple files', () => {
                const files = {
                    'a.txt': new TextEncoder().encode('file A'),
                    'b.txt': new TextEncoder().encode('file B content here'),
                    'c.txt': new TextEncoder().encode('c'),
                };
                const archive = z.zipSync(files);
                const extracted = z.unzipSync(archive);
                for (const [name, data] of Object.entries(files)) {
                    expect(extracted[name]).toEqual(data);
                }
            });

            test('round-trip: stored (level 0)', () => {
                const data = new TextEncoder().encode('not compressed');
                const archive = z.zipSync({ 'file.txt': [data, { level: 0 }] });
                const extracted = z.unzipSync(archive);
                expect(extracted['file.txt']).toEqual(data);
            });

            test('round-trip: empty file', () => {
                const archive = z.zipSync({ 'empty.txt': new Uint8Array(0) });
                const extracted = z.unzipSync(archive);
                expect(extracted['empty.txt']).toEqual(new Uint8Array(0));
            });

            test('round-trip: empty archive', () => {
                const archive = z.zipSync({});
                const extracted = z.unzipSync(archive);
                expect(Object.keys(extracted).length).toBe(0);
            });

            test('round-trip: nested directory structure', () => {
                const data = new TextEncoder().encode('nested file');
                // Keys without trailing slash produce directory entries automatically
                const archive = z.zipSync({
                    dir: {
                        'nested.txt': data,
                    },
                });
                const extracted = z.unzipSync(archive);
                expect(extracted['dir/nested.txt']).toEqual(data);
            });

            test('round-trip: Unicode filename', () => {
                const data = new TextEncoder().encode('unicode test');
                const archive = z.zipSync({ 'héllo.txt': data });
                const extracted = z.unzipSync(archive);
                expect(extracted['héllo.txt']).toEqual(data);
            });

            test('archive starts with ZIP local header signature', () => {
                const data = new TextEncoder().encode('test');
                const archive = z.zipSync({ 'f.txt': data });
                // PK\x03\x04
                expect(archive[0]).toBe(0x50);
                expect(archive[1]).toBe(0x4B);
                expect(archive[2]).toBe(0x03);
                expect(archive[3]).toBe(0x04);
            });

            test('filter option skips entries', () => {
                const files = {
                    'keep.txt': new TextEncoder().encode('keep'),
                    'skip.txt': new TextEncoder().encode('skip'),
                };
                const archive = z.zipSync(files);
                const extracted = z.unzipSync(archive, {
                    filter: ({ name }) => name === 'keep.txt',
                });
                expect(extracted['keep.txt']).toBeDefined();
                expect(extracted['skip.txt']).toBeUndefined();
            });

            test('large file round-trip', () => {
                const data = new Uint8Array(50000).map((_, i) => i & 0xFF);
                const archive = z.zipSync({ 'large.bin': data });
                const extracted = z.unzipSync(archive);
                expect(extracted['large.bin']).toEqual(data);
            });
        });

        describe('zip / unzip (async)', () => {
            test('async round-trip', async () => {
                const data = new TextEncoder().encode('async zip test');
                const archive = await z.zip({ 'test.txt': data });
                const extracted = await z.unzip(archive);
                expect(extracted['test.txt']).toEqual(data);
            });
        });

        test('invalid zip data throws', () => {
            expect(() => z.unzipSync(new Uint8Array([0, 1, 2, 3]))).toThrow();
        });

        describe('ZipStream (streaming writer)', () => {
            // Collect all emitted chunks into one Uint8Array
            function collect(buildFn) {
                const chunks = [];
                let finalSeen = false;
                buildFn((chunk, final) => {
                    chunks.push(chunk);
                    if (final) finalSeen = true;
                });
                expect(finalSeen).toBe(true);
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) { out.set(c, off); off += c.length; }
                return out;
            }

            test('returns expected constructors', () => {
                expect(typeof z.ZipStream).toBe('function');
                expect(typeof z.ZipStreamReader).toBe('function');
            });

            test('add single file → round-trips with unzipSync', () => {
                const data = new TextEncoder().encode('hello streaming');
                const archive = collect(ondata => {
                    const zs = new z.ZipStream({}, ondata);
                    zs.add('hello.txt', data);
                    zs.finalize();
                });
                expect(archive[0]).toBe(0x50);  // PK signature
                const extracted = z.unzipSync(archive);
                expect(extracted['hello.txt']).toEqual(data);
            });

            test('add multiple files → all extractable', () => {
                const files = {
                    'a.txt': new TextEncoder().encode('file A'),
                    'b.txt': new TextEncoder().encode('file B content'),
                };
                const archive = collect(ondata => {
                    const zs = new z.ZipStream({}, ondata);
                    for (const [name, data] of Object.entries(files)) zs.add(name, data);
                    zs.finalize();
                });
                const extracted = z.unzipSync(archive);
                for (const [name, data] of Object.entries(files)) {
                    expect(extracted[name]).toEqual(data);
                }
            });

            test('add with level 0 (store mode)', () => {
                const data = new TextEncoder().encode('uncompressed');
                const archive = collect(ondata => {
                    const zs = new z.ZipStream({}, ondata);
                    zs.add('file.txt', data, { level: 0 });
                    zs.finalize();
                });
                const extracted = z.unzipSync(archive);
                expect(extracted['file.txt']).toEqual(data);
            });

            test('add empty file', () => {
                const archive = collect(ondata => {
                    const zs = new z.ZipStream({}, ondata);
                    zs.add('empty.txt', new Uint8Array(0));
                    zs.finalize();
                });
                const extracted = z.unzipSync(archive);
                expect(extracted['empty.txt']).toEqual(new Uint8Array(0));
            });

            test('empty archive (no entries)', () => {
                const archive = collect(ondata => {
                    const zs = new z.ZipStream({}, ondata);
                    zs.finalize();
                });
                const extracted = z.unzipSync(archive);
                expect(Object.keys(extracted).length).toBe(0);
            });

            test('ondata as first argument', () => {
                const data = new TextEncoder().encode('callback');
                const chunks = [];
                const zs = new z.ZipStream((chunk, final) => {
                    chunks.push(chunk);
                });
                zs.add('f.txt', data);
                zs.finalize();
                expect(chunks.length).toBeGreaterThan(0);
            });

            describe('openEntry (streaming file content)', () => {
                test('single-chunk entry → extractable', () => {
                    const data = new Uint8Array(200).fill(42);
                    const archive = collect(ondata => {
                        const zs = new z.ZipStream({}, ondata);
                        const w = zs.openEntry('data.bin');
                        w.push(data, true);
                        zs.finalize();
                    });
                    const extracted = z.unzipSync(archive);
                    expect(extracted['data.bin']).toEqual(data);
                });

                test('multi-chunk entry → extractable', () => {
                    const part1 = new Uint8Array(5000).fill(1);
                    const part2 = new Uint8Array(5000).fill(2);
                    const expected = new Uint8Array(10000);
                    expected.set(part1); expected.set(part2, 5000);

                    const archive = collect(ondata => {
                        const zs = new z.ZipStream({}, ondata);
                        const w = zs.openEntry('big.bin');
                        w.push(part1, false);
                        w.push(part2, true);
                        zs.finalize();
                    });
                    const extracted = z.unzipSync(archive);
                    expect(extracted['big.bin']).toEqual(expected);
                });

                test('store mode streaming entry', () => {
                    const data = new Uint8Array(300).fill(7);
                    const archive = collect(ondata => {
                        const zs = new z.ZipStream({}, ondata);
                        const w = zs.openEntry('raw.bin', { level: 0 });
                        w.push(data.subarray(0, 150), false);
                        w.push(data.subarray(150), true);
                        zs.finalize();
                    });
                    const extracted = z.unzipSync(archive);
                    expect(extracted['raw.bin']).toEqual(data);
                });

                test('openEntry followed by add → both extractable', () => {
                    const streamed = new Uint8Array(1000).fill(3);
                    const sync = new TextEncoder().encode('sync file');

                    const archive = collect(ondata => {
                        const zs = new z.ZipStream({}, ondata);
                        const w = zs.openEntry('streamed.bin');
                        w.push(streamed, true);
                        zs.add('sync.txt', sync);
                        zs.finalize();
                    });
                    const extracted = z.unzipSync(archive);
                    expect(extracted['streamed.bin']).toEqual(streamed);
                    expect(extracted['sync.txt']).toEqual(sync);
                });

                test('archive bytes are emitted before finalize is called', () => {
                    const data = new Uint8Array(500).fill(9);
                    const chunksBefore = [];
                    const zs = new z.ZipStream((chunk, final) => {
                        if (!final) chunksBefore.push(chunk.length);
                    });
                    const w = zs.openEntry('test.bin');
                    w.push(data, true);
                    // At this point, at least the local header + data has been emitted
                    expect(chunksBefore.length).toBeGreaterThan(0);
                    zs.finalize();
                });

                test('pushing after final throws', () => {
                    const zs = new z.ZipStream(() => {});
                    const w = zs.openEntry('f.txt');
                    w.push(new Uint8Array([1, 2, 3]), true);
                    expect(() => w.push(new Uint8Array([4]), false)).toThrow();
                });

                test('opening entry while one is active throws', () => {
                    const zs = new z.ZipStream(() => {});
                    zs.openEntry('f1.txt');
                    expect(() => zs.openEntry('f2.txt')).toThrow();
                });
            });

            test('large file round-trip via openEntry', () => {
                const data = new Uint8Array(50000).map((_, i) => i & 0xFF);
                const archive = collect(ondata => {
                    const zs = new z.ZipStream({}, ondata);
                    const w = zs.openEntry('large.bin');
                    // Push in 10KB chunks
                    for (let i = 0; i < data.length; i += 10000) {
                        w.push(data.subarray(i, i + 10000), i + 10000 >= data.length);
                    }
                    zs.finalize();
                });
                const extracted = z.unzipSync(archive);
                expect(extracted['large.bin']).toEqual(data);
            });
        });

        describe('ZipStreamReader (streaming reader)', () => {
            test('push in one chunk → all files extracted', () => {
                const files = {
                    'a.txt': new TextEncoder().encode('file A'),
                    'b.txt': new TextEncoder().encode('file B'),
                };
                const archive = z.zipSync(files);

                const extracted = {};
                const reader = new z.ZipStreamReader((name, data) => { extracted[name] = data; });
                reader.push(archive, true);

                for (const [name, data] of Object.entries(files)) {
                    expect(extracted[name]).toEqual(data);
                }
            });

            test('push in multiple chunks → extracted on final', () => {
                const data = new TextEncoder().encode('streamed read');
                const archive = z.zipSync({ 'test.txt': data });

                const extracted = {};
                const reader = new z.ZipStreamReader((name, d) => { extracted[name] = d; });
                const mid = archive.length >> 1;
                reader.push(archive.subarray(0, mid), false);
                expect(Object.keys(extracted).length).toBe(0);  // not yet
                reader.push(archive.subarray(mid), true);
                expect(extracted['test.txt']).toEqual(data);
            });

            test('onfile isFinal flag is true on last file', () => {
                const archive = z.zipSync({
                    'a.txt': new TextEncoder().encode('A'),
                    'b.txt': new TextEncoder().encode('B'),
                });
                const finals = [];
                const reader = new z.ZipStreamReader((name, data, isFinal) => finals.push(isFinal));
                reader.push(archive, true);
                expect(finals[finals.length - 1]).toBe(true);
            });

            test('onfile as first argument', () => {
                const archive = z.zipSync({ 'f.txt': new TextEncoder().encode('x') });
                const names = [];
                const reader = new z.ZipStreamReader((name) => names.push(name));
                reader.push(archive, true);
                expect(names).toContain('f.txt');
            });
        });

        describe('deterministic mtime (BL-28)', () => {
            // Fixed, well inside the MS-DOS date range (1980-2099) — avoids
            // any pre-1980 / post-2099 edge, and inside the range regardless
            // of the running machine's timezone.
            const FIXED_MTIME = Date.UTC(2020, 5, 15, 12, 0, 0);
            const OTHER_MTIME = Date.UTC(2021, 10, 3, 8, 30, 0);
            const data = new TextEncoder().encode('deterministic payload');

            function collect(buildFn) {
                const chunks = [];
                buildFn((chunk) => chunks.push(chunk));
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) { out.set(c, off); off += c.length; }
                return out;
            }

            test('zipSync: writer-level opts.mtime is byte-identical across two writes', () => {
                const a1 = z.zipSync({ 'f.txt': data }, { mtime: FIXED_MTIME });
                const a2 = z.zipSync({ 'f.txt': data }, { mtime: FIXED_MTIME });
                expect(a1).toEqual(a2);
            });

            test('zipSync: writer-level opts.mtime applies to directory entries too', () => {
                const a1 = z.zipSync({ dir: { 'f.txt': data } }, { mtime: FIXED_MTIME });
                const a2 = z.zipSync({ dir: { 'f.txt': data } }, { mtime: FIXED_MTIME });
                expect(a1).toEqual(a2);
            });

            test('ZipStream.add: constructor-level opts.mtime is byte-identical across two streams', () => {
                const build = () => collect(ondata => {
                    const zs = new z.ZipStream({ mtime: FIXED_MTIME }, ondata);
                    zs.add('f.txt', data);
                    zs.finalize();
                });
                expect(build()).toEqual(build());
            });

            test('ZipStream.openEntry: constructor-level opts.mtime is byte-identical across two streams', () => {
                const build = () => collect(ondata => {
                    const zs = new z.ZipStream({ mtime: FIXED_MTIME }, ondata);
                    const w = zs.openEntry('f.txt');
                    w.push(data, true);
                    zs.finalize();
                });
                expect(build()).toEqual(build());
            });

            test('per-entry mtime still wins over the writer-level default', () => {
                const withPerEntry = z.zipSync(
                    { 'f.txt': [data, { mtime: OTHER_MTIME }] },
                    { mtime: FIXED_MTIME },
                );
                const writerOnly = z.zipSync({ 'f.txt': data }, { mtime: FIXED_MTIME });
                const perEntryOnly = z.zipSync({ 'f.txt': data }, { mtime: OTHER_MTIME });
                // The per-entry mtime (not the writer default) determines the bytes.
                expect(withPerEntry).toEqual(perEntryOnly);
                expect(withPerEntry).not.toEqual(writerOnly);
            });

            test('no mtime option: default (Date.now()) behaviour is unchanged — archive still builds', () => {
                const archive = z.zipSync({ 'f.txt': data });
                expect(archive.length).toBeGreaterThan(0);
                const extracted = z.unzipSync(archive);
                expect(extracted['f.txt']).toEqual(data);
            });

            test('existing byte pin unaffected: archive still starts with the local-header signature', () => {
                const archive = z.zipSync({ 'f.txt': data }, { mtime: FIXED_MTIME });
                expect(archive[0]).toBe(0x50);
                expect(archive[1]).toBe(0x4B);
                expect(archive[2]).toBe(0x03);
                expect(archive[3]).toBe(0x04);
            });

            test('DOS-epoch clamp edge: a fixed pre-1980 mtime still throws error code 10', () => {
                const preEpoch = Date.UTC(1979, 0, 1);
                let caught;
                try {
                    z.zipSync({ 'f.txt': data }, { mtime: preEpoch });
                } catch (e) {
                    caught = e;
                }
                expect(caught).toBeDefined();
                expect(caught.code).toBe(10);
            });

            test('DOS-epoch clamp edge: a fixed mtime just inside 1980 does not throw', () => {
                const justInside = Date.UTC(1980, 0, 2);
                expect(() => z.zipSync({ 'f.txt': data }, { mtime: justInside })).not.toThrow();
            });
        });
    });
});
