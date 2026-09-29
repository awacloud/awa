// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { bitstream } from './bitstream.js';

describe('bitstream module', () => {

    test('has correct module metadata', () => {
        expect(bitstream.name).toBe('bitstream');
        expect(bitstream.version).toBe('1.0.0');
        expect(bitstream.type).toBe('fw.io.compress');
        expect(bitstream.dependencies).toEqual([]);
        expect(typeof bitstream.factory).toBe('function');
    });

    describe('factory', () => {
        const bs = bitstream.factory();

        test('returns expected API', () => {
            expect(typeof bs.readBits).toBe('function');
            expect(typeof bs.readBits16).toBe('function');
            expect(typeof bs.writeBits).toBe('function');
            expect(typeof bs.writeBits16).toBe('function');
            expect(typeof bs.byteOffset).toBe('function');
            expect(typeof bs.slice).toBe('function');
            expect(typeof bs.max).toBe('function');
            expect(bs.rev).toBeInstanceOf(Uint16Array);
            expect(bs.rev.length).toBe(32768);
        });

        describe('readBits / writeBits', () => {
            test('round-trip of 0..15-bit values at byte-aligned positions', () => {
                const buf = new Uint8Array(8);
                bs.writeBits(buf, 0, 0xABCD);
                expect(bs.readBits(buf, 0, 0xFFFF)).toBe(0xABCD);
            });

            test('round-trip at non-aligned bit position', () => {
                const buf = new Uint8Array(8);
                bs.writeBits(buf, 3, 0x1A5);
                expect(bs.readBits(buf, 3, 0x1FF)).toBe(0x1A5);
            });

            test('readBits respects mask (does not read beyond requested bits)', () => {
                const buf = new Uint8Array(4);
                buf[0] = 0xFF; buf[1] = 0xFF;
                expect(bs.readBits(buf, 0, 0x07)).toBe(0x07);
                expect(bs.readBits(buf, 0, 0x0F)).toBe(0x0F);
            });
        });

        describe('readBits16 / writeBits16 (24-bit window)', () => {
            test('round-trip of values up to 17 bits at offset 0', () => {
                const buf = new Uint8Array(8);
                bs.writeBits16(buf, 0, 0x1FFFF);
                expect(bs.readBits16(buf, 0) & 0x1FFFF).toBe(0x1FFFF);
            });

            test('round-trip at bit offset 5', () => {
                const buf = new Uint8Array(8);
                bs.writeBits16(buf, 5, 0x12345);
                expect(bs.readBits16(buf, 5) & 0x1FFFF).toBe(0x12345);
            });
        });

        describe('byteOffset', () => {
            test('returns ceil(p / 8)', () => {
                expect(bs.byteOffset(0)).toBe(0);
                expect(bs.byteOffset(1)).toBe(1);
                expect(bs.byteOffset(7)).toBe(1);
                expect(bs.byteOffset(8)).toBe(1);
                expect(bs.byteOffset(9)).toBe(2);
                expect(bs.byteOffset(16)).toBe(2);
            });
        });

        describe('slice', () => {
            test('returns copy (not a view) of subrange', () => {
                const src = new Uint8Array([1, 2, 3, 4, 5]);
                const out = bs.slice(src, 1, 4);
                expect(Array.from(out)).toEqual([2, 3, 4]);
                src[1] = 99;
                expect(out[0]).toBe(2);
            });

            test('handles null/undefined start and end', () => {
                const src = new Uint8Array([1, 2, 3]);
                expect(Array.from(bs.slice(src))).toEqual([1, 2, 3]);
                expect(Array.from(bs.slice(src, null, null))).toEqual([1, 2, 3]);
            });

            test('clamps negative start to 0 and oversize end to length', () => {
                const src = new Uint8Array([1, 2, 3]);
                expect(Array.from(bs.slice(src, -5, 100))).toEqual([1, 2, 3]);
            });
        });

        describe('max', () => {
            test('returns greatest element', () => {
                expect(bs.max(new Uint8Array([1, 3, 2]))).toBe(3);
                expect(bs.max([5])).toBe(5);
                expect(bs.max([0, 0, 0])).toBe(0);
            });
        });

        describe('rev table (15-bit reversal)', () => {
            test('rev[0] === 0', () => {
                expect(bs.rev[0]).toBe(0);
            });

            test('rev[1] === 0x4000 (1 reversed in 15 bits)', () => {
                expect(bs.rev[1]).toBe(0x4000);
            });

            test('involution: rev[rev[i]] === i for sampled values', () => {
                for (const i of [0, 1, 0x42, 0x1234, 0x7FFF]) {
                    expect(bs.rev[bs.rev[i]]).toBe(i);
                }
            });

            test('exhaustive: every entry equals an independent bit-loop mirror', () => {
                let mismatches = 0;
                for (let i = 0; i < 32768; ++i) {
                    let mirrored = 0;
                    for (let b = 0; b < 15; ++b) {
                        if (i & (1 << b)) mirrored |= 1 << (14 - b);
                    }
                    if (bs.rev[i] !== mirrored) ++mismatches;
                }
                expect(mismatches).toBe(0);
                expect(bs.rev[0x7FFF]).toBe(0x7FFF);
            });

            test('each factory() call builds its own table', () => {
                expect(bitstream.factory().rev).not.toBe(bs.rev);
            });
        });

        describe('RFC 1951 §3.1.1 packing', () => {
            test('fields fill a byte from its least-significant bit', () => {
                const buf = new Uint8Array(2);
                bs.writeBits(buf, 0, 5);    // 3 bits: 101
                bs.writeBits(buf, 3, 27);   // 5 bits: 11011, above the first field
                expect(buf[0]).toBe(0xDD);
                expect(buf[1]).toBe(0);
                expect(bs.readBits(buf, 0, 7)).toBe(5);
                expect(bs.readBits(buf, 3, 31)).toBe(27);
            });
        });

        describe('byte windows', () => {
            test('writeBits at bit 7 touches bytes o and o+1 only (no throw at capacity)', () => {
                const o = 3;
                const exact = new Uint8Array(o + 2);
                expect(() => bs.writeBits(exact, 8 * o + 7, 0x1FF)).not.toThrow();
                expect(exact[o]).toBe(0x80);
                expect(exact[o + 1]).toBe(0xFF);

                // A 10-bit value at offset 7 spills one bit past the 16-bit
                // window: it is dropped, byte o+2 stays clear.
                const roomy = new Uint8Array(o + 3);
                bs.writeBits(roomy, 8 * o + 7, 0x3FF);
                expect(roomy[o]).toBe(0x80);
                expect(roomy[o + 1]).toBe(0xFF);
                expect(roomy[o + 2]).toBe(0);
            });

            test('writeBits16 touches bytes o..o+2 only', () => {
                const buf = new Uint8Array(6);
                bs.writeBits16(buf, 8 + 7, 0x1FFFF);
                expect(Array.from(buf)).toEqual([0, 0x80, 0xFF, 0xFF, 0, 0]);
            });

            test('readBits past the end reads zero padding', () => {
                expect(bs.readBits(new Uint8Array([0xFF]), 4, 0xFF)).toBe(0x0F);
                expect(bs.readBits(new Uint8Array([0xFF]), 8, 0xFF)).toBe(0);
                expect(bs.readBits16(new Uint8Array([0xFF, 0xFF]), 4)).toBe(0x0FFF);
            });

            test('readBits16 carries 17..24-bit values at every offset with n + s <= 24', () => {
                for (let s = 0; s < 8; ++s) {
                    for (let n = 17; n + s <= 24; ++n) {
                        const mask = (1 << n) - 1;
                        for (const v of [mask, 0xA5A5A5 & mask, (1 << (n - 1)) | 1]) {
                            const buf = new Uint8Array(8);
                            bs.writeBits16(buf, 16 + s, v);
                            expect(bs.readBits16(buf, 16 + s) & mask).toBe(v);
                        }
                    }
                }
            });
        });

        describe('write/read sweep', () => {
            /** Independent oracle: set bit `p + j` for every set bit `j` of `v`. */
            function expectedBytes(size, p, v, n) {
                const out = new Uint8Array(size);
                for (let j = 0; j < n; ++j) {
                    if ((v >>> j) & 1) out[(p + j) >> 3] |= 1 << ((p + j) & 7);
                }
                return out;
            }

            function sameBytes(a, b) {
                return a.length === b.length && a.every((x, i) => x === b[i]);
            }

            test('writeBits/readBits for p in 0..64, n in 1..9', () => {
                let failures = 0;
                for (let p = 0; p <= 64; ++p) {
                    for (let n = 1; n <= 9; ++n) {
                        const mask = (1 << n) - 1;
                        const v = (0x155 ^ (p * 7)) & mask;
                        const buf = new Uint8Array(12);
                        bs.writeBits(buf, p, v);
                        if (!sameBytes(buf, expectedBytes(12, p, v, n))) ++failures;
                        if (bs.readBits(buf, p, mask) !== v) ++failures;
                    }
                }
                expect(failures).toBe(0);
            });

            test('writeBits16/readBits16 for p in 0..64, n in 1..16', () => {
                let failures = 0;
                for (let p = 0; p <= 64; ++p) {
                    for (let n = 1; n <= 16; ++n) {
                        const mask = (1 << n) - 1;
                        const v = (0xB3C5 ^ (p * 131)) & mask;
                        const buf = new Uint8Array(12);
                        bs.writeBits16(buf, p, v);
                        if (!sameBytes(buf, expectedBytes(12, p, v, n))) ++failures;
                        if ((bs.readBits16(buf, p) & mask) !== v) ++failures;
                    }
                }
                expect(failures).toBe(0);
            });

            test('consecutive fields pack without gaps', () => {
                const widths = [1, 3, 9, 16, 5, 7, 2, 13, 8, 4];
                const field = (i, n) => (i * 0x2B7) & ((1 << n) - 1);
                const buf = new Uint8Array(16);
                let p = 0;
                widths.forEach((n, i) => {
                    bs.writeBits16(buf, p, field(i, n));
                    p += n;
                });
                p = 0;
                widths.forEach((n, i) => {
                    expect(bs.readBits16(buf, p) & ((1 << n) - 1)).toBe(field(i, n));
                    p += n;
                });
            });
        });

        describe('byteOffset (exhaustive 0..64)', () => {
            test('equals Math.ceil(p / 8) and is an integer', () => {
                for (let p = 0; p <= 64; ++p) {
                    const got = bs.byteOffset(p);
                    expect(Number.isInteger(got)).toBe(true);
                    expect(got).toBe(Math.ceil(p / 8));
                }
            });
        });

        describe('slice (copy semantics)', () => {
            test('full copy is detached from the source', () => {
                const src = new Uint8Array([7, 8, 9]);
                const out = bs.slice(src);
                src.fill(0);
                expect(Array.from(out)).toEqual([7, 8, 9]);
                expect(out.buffer).not.toBe(src.buffer);
            });

            test('copy of a view returns a plain Uint8Array of the range only', () => {
                const backing = new Uint8Array([1, 2, 3, 4, 5, 6]);
                const view = backing.subarray(2, 5);
                const out = bs.slice(view, 1);
                expect(out).toBeInstanceOf(Uint8Array);
                expect(Array.from(out)).toEqual([4, 5]);
                expect(out.byteOffset).toBe(0);
                backing[3] = 0;
                expect(out[0]).toBe(4);
            });
        });

        describe('max (input kinds)', () => {
            test('Uint16Array, number[] and a single element', () => {
                expect(bs.max(new Uint16Array([9, 40000, 3]))).toBe(40000);
                expect(bs.max([4, -1, 12, 12, 0])).toBe(12);
                expect(bs.max(new Uint8Array([200]))).toBe(200);
            });

            test('empty input returns arr[0] (undefined), never throws', () => {
                expect(bs.max([])).toBeUndefined();
                expect(bs.max(new Uint8Array(0))).toBeUndefined();
            });
        });
    });
});
