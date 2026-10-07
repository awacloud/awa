// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Unit tests for `readImageHeader` — the minimal, honest PNG/JPEG header
 * reader `md → pdf` image placement needs (BL-980, office/BATCH_35 task 02).
 *
 * Most fixtures here are SYNTHETIC byte arrays: the module reads a header
 * and nothing else, so a hand-built header is a complete, exact input for
 * every branch — including the ones no committed fixture could cover
 * (CMYK JPEG, palette PNG, 16-bit depth). The two COMMITTED first-party
 * fixtures (`corpus/assets/px.png`, `corpus/assets/px.jpg`, provenance in
 * `corpus/assets/PROVENANCE.md`) are read back too, so the synthetic shapes
 * are pinned against real files an independent decoder accepted.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { readImageHeader } from './image-header.js';

/** `oconv/tests/_fixtures/corpus/assets`, resolved from this file's own location (cwd-independent, BL-1564). */
const ASSETS = fileURLToPath(new URL('../../tests/_fixtures/corpus/assets', import.meta.url));

/**
 * Read a committed asset fixture.
 *
 * @param {string} name
 * @returns {Promise<Uint8Array>}
 */
async function asset(name) {
    return new Uint8Array(await Bun.file(`${ASSETS}/${name}`).arrayBuffer());
}

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * A synthetic PNG header: signature + a well-formed IHDR chunk. Only the
 * first 33 bytes matter to the reader, so the CRC is left as four zeroes —
 * `readImageHeader` verifies structure, never checksums.
 *
 * @param {object} spec
 * @returns {Uint8Array}
 */
function png(spec) {
    const be32 = (n) => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
    return Uint8Array.from(PNG_SIG
        .concat(be32(13), [0x49, 0x48, 0x44, 0x52])
        .concat(be32(spec.width), be32(spec.height),
            [spec.bitDepth, spec.colorType, 0, 0, 0], [0, 0, 0, 0]));
}

/**
 * A synthetic JPEG: SOI, an APP0 segment the walker must SKIP, then one
 * frame header, then SOS. No entropy data — the reader stops at the frame.
 *
 * @param {object} spec
 * @returns {Uint8Array}
 */
function jpeg(spec) {
    const marker = spec.marker === undefined ? 0xC0 : spec.marker;
    const hi = (n) => (n >>> 8) & 0xFF;
    const lo = (n) => n & 0xFF;
    const app0 = [0xFF, 0xE0, 0x00, 0x06, 0x4A, 0x46, 0x49, 0x46];
    const comps = [];
    for (let i = 0; i < spec.components; i += 1) comps.push(i + 1, 0x11, 0x00);
    const frameLen = 8 + comps.length;
    const frame = [0xFF, marker, hi(frameLen), lo(frameLen),
        spec.precision === undefined ? 8 : spec.precision,
        hi(spec.height), lo(spec.height), hi(spec.width), lo(spec.width),
        spec.components].concat(comps);
    return Uint8Array.from([0xFF, 0xD8]
        .concat(app0, frame, [0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]));
}

describe('readImageHeader — PNG', () => {
    test('greyscale (colour type 0): geometry, DeviceGray, bit depth, filter null', () => {
        expect(readImageHeader(png({ width: 24, height: 42, bitDepth: 8, colorType: 0 })))
            .toEqual({
                format: 'png', width: 24, height: 42,
                colorSpace: 'DeviceGray', bitsPerComponent: 8, filter: null
            });
    });

    test('truecolour (colour type 2): DeviceRGB, filter null', () => {
        expect(readImageHeader(png({ width: 3, height: 5, bitDepth: 16, colorType: 2 })))
            .toEqual({
                format: 'png', width: 3, height: 5,
                colorSpace: 'DeviceRGB', bitsPerComponent: 16, filter: null
            });
    });

    test('`filter` is null for EVERY supported PNG — a PNG IDAT is not a PDF image stream', () => {
        for (const colorType of [0, 2]) {
            for (const bitDepth of [1, 2, 4, 8, 16]) {
                const h = readImageHeader(png({ width: 1, height: 1, bitDepth, colorType }));
                expect(h).not.toBeNull();
                expect(h.filter).toBeNull();
            }
        }
    });

    test('palette (3) and alpha (4, 6) colour types return null — refused, never guessed', () => {
        for (const colorType of [3, 4, 6]) {
            expect(readImageHeader(png({ width: 1, height: 1, bitDepth: 8, colorType })))
                .toBeNull();
        }
    });

    test('an illegal bit depth returns null', () => {
        for (const bitDepth of [0, 3, 7, 12, 32]) {
            expect(readImageHeader(png({ width: 1, height: 1, bitDepth, colorType: 0 })))
                .toBeNull();
        }
    });

    test('zero width or height returns null', () => {
        expect(readImageHeader(png({ width: 0, height: 1, bitDepth: 8, colorType: 0 }))).toBeNull();
        expect(readImageHeader(png({ width: 1, height: 0, bitDepth: 8, colorType: 0 }))).toBeNull();
    });

    test('a first chunk that is not IHDR, or the wrong IHDR length, returns null', () => {
        const notIhdr = png({ width: 1, height: 1, bitDepth: 8, colorType: 0 });
        notIhdr[12] = 0x69;                       // 'i' — a private chunk
        expect(readImageHeader(notIhdr)).toBeNull();

        const badLen = png({ width: 1, height: 1, bitDepth: 8, colorType: 0 });
        badLen[11] = 12;                          // IHDR length 12, not 13
        expect(readImageHeader(badLen)).toBeNull();
    });

    test('a truncated PNG returns null and never throws', () => {
        const full = png({ width: 1, height: 1, bitDepth: 8, colorType: 0 });
        for (let n = 0; n < full.length; n += 1) {
            expect(readImageHeader(full.slice(0, n))).toBeNull();
        }
    });

    test('the COMMITTED px.png fixture: 1x1 DeviceGray, filter null', async () => {
        expect(readImageHeader(await asset('px.png'))).toEqual({
            format: 'png', width: 1, height: 1,
            colorSpace: 'DeviceGray', bitsPerComponent: 8, filter: null
        });
    });
});

describe('readImageHeader — JPEG', () => {
    test('SOF0 with 3 components: geometry, DeviceRGB, DCTDecode', () => {
        expect(readImageHeader(jpeg({ width: 640, height: 480, components: 3 })))
            .toEqual({
                format: 'jpeg', width: 640, height: 480,
                colorSpace: 'DeviceRGB', bitsPerComponent: 8, filter: 'DCTDecode'
            });
    });

    test('1 component → DeviceGray', () => {
        expect(readImageHeader(jpeg({ width: 8, height: 9, components: 1 })))
            .toEqual({
                format: 'jpeg', width: 8, height: 9,
                colorSpace: 'DeviceGray', bitsPerComponent: 8, filter: 'DCTDecode'
            });
    });

    test('4 components (CMYK / YCCK) → null', () => {
        expect(readImageHeader(jpeg({ width: 8, height: 9, components: 4 }))).toBeNull();
    });

    test('SOF1 and SOF2 are read; SOF3 (lossless) and SOF9 (arithmetic) are not', () => {
        for (const marker of [0xC0, 0xC1, 0xC2]) {
            const h = readImageHeader(jpeg({ width: 2, height: 3, components: 3, marker }));
            expect(h).not.toBeNull();
            expect(h.filter).toBe('DCTDecode');
        }
        for (const marker of [0xC3, 0xC9, 0xCB]) {
            expect(readImageHeader(jpeg({ width: 2, height: 3, components: 3, marker })))
                .toBeNull();
        }
    });

    test('a non-8-bit sample precision is reported as-is (12-bit extended)', () => {
        expect(readImageHeader(jpeg({ width: 2, height: 2, components: 1, precision: 12 })).bitsPerComponent)
            .toBe(12);
    });

    test('SOI followed straight by SOS (no frame header) → null', () => {
        expect(readImageHeader(Uint8Array.from(
            [0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]
        ))).toBeNull();
    });

    // MEASURED, not assumed: a JPEG cut AFTER its frame header still yields
    // a complete header, and the reader honestly reports it — it makes no
    // claim about the entropy-coded scan it never looks at. Only a cut
    // reaching INTO the frame header can return null. `frameEnd` is derived
    // from the synthetic layout: SOI (2) + APP0 (8) + frame (2 + 8 + 3·N).
    test('a JPEG truncated inside the frame header returns null and never throws', () => {
        const full = jpeg({ width: 4, height: 4, components: 3 });
        const frameEnd = 2 + 8 + 2 + 8 + (3 * 3);
        for (let n = 0; n < frameEnd; n += 1) {
            expect(readImageHeader(full.slice(0, n))).toBeNull();
        }
        expect(readImageHeader(full.slice(0, frameEnd))).not.toBeNull();
    });

    test('the COMMITTED px.jpg fixture: 1x1 DeviceGray, DCTDecode', async () => {
        expect(readImageHeader(await asset('px.jpg'))).toEqual({
            format: 'jpeg', width: 1, height: 1,
            colorSpace: 'DeviceGray', bitsPerComponent: 8, filter: 'DCTDecode'
        });
    });
});

describe('readImageHeader — refusals never throw', () => {
    test('non-Uint8Array inputs return null', () => {
        for (const bad of [null, undefined, 0, '', 'PNG', [], {},
            new Uint8Array(0).buffer, [0x89, 0x50]]) {
            expect(readImageHeader(bad)).toBeNull();
        }
    });

    test('an empty array and 8 random bytes return null', () => {
        expect(readImageHeader(new Uint8Array(0))).toBeNull();
        expect(readImageHeader(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    });

    test('every 1-byte mutation of a valid JPEG either parses or returns null — never throws', () => {
        const full = jpeg({ width: 4, height: 4, components: 3 });
        for (let i = 0; i < full.length; i += 1) {
            for (const v of [0x00, 0xFF, 0x7F]) {
                const copy = full.slice();
                copy[i] = v;
                expect(() => readImageHeader(copy)).not.toThrow();
            }
        }
    });

    test('every 1-byte mutation of a valid PNG either parses or returns null — never throws', () => {
        const full = png({ width: 4, height: 4, bitDepth: 8, colorType: 2 });
        for (let i = 0; i < full.length; i += 1) {
            for (const v of [0x00, 0xFF, 0x7F]) {
                const copy = full.slice();
                copy[i] = v;
                expect(() => readImageHeader(copy)).not.toThrow();
            }
        }
    });
});
