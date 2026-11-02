// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `oconvPdfImagePng.encodePng`, read back by an independent PNG reader
 * (`node:zlib` inflates, the CRC-32 is computed here).
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../../main.js';
import { readPng } from '../../../tests/_fixtures/png-reader.js';

let encodePng;

beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ encodePng } = rt.resolve('oconvPdfImagePng'));
});

describe('oconvPdfImagePng.encodePng', () => {
    test('grey 8-bit: the rows read back as written', () => {
        const png = readPng(encodePng({ width: 2, height: 2, bitDepth: 8, colorType: 0, data: new Uint8Array([0, 255, 128, 64]) }));
        expect(png).toMatchObject({ width: 2, height: 2, bitDepth: 8, colorType: 0 });
        expect(png.rows.map((r) => [...r])).toEqual([[0, 255], [128, 64]]);
    });

    test('grey 1-bit: rows packed to whole bytes', () => {
        const png = readPng(encodePng({ width: 3, height: 2, bitDepth: 1, colorType: 0, data: new Uint8Array([0b10100000, 0b01000000]) }));
        expect(png.rows.map((r) => [...r])).toEqual([[0b10100000], [0b01000000]]);
    });

    test('grey 16-bit and RGB 8-bit', () => {
        const g = readPng(encodePng({ width: 1, height: 1, bitDepth: 16, colorType: 0, data: new Uint8Array([0x12, 0x34]) }));
        expect([...g.rows[0]]).toEqual([0x12, 0x34]);
        const rgb = readPng(encodePng({ width: 2, height: 1, bitDepth: 8, colorType: 2, data: new Uint8Array([1, 2, 3, 4, 5, 6]) }));
        expect(rgb.colorType).toBe(2);
        expect([...rgb.rows[0]]).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('a palette picture carries PLTE', () => {
        const png = readPng(encodePng({ width: 2, height: 1, bitDepth: 8, colorType: 3, data: new Uint8Array([1, 0]), palette: new Uint8Array([10, 20, 30, 40, 50, 60]) }));
        expect([...png.palette]).toEqual([10, 20, 30, 40, 50, 60]);
        expect([...png.rows[0]]).toEqual([1, 0]);
    });

    test('an ICC profile is carried in iCCP', () => {
        const icc = new Uint8Array([7, 7, 7, 1, 2, 3]);
        const png = readPng(encodePng({ width: 1, height: 1, bitDepth: 8, colorType: 2, data: new Uint8Array([9, 9, 9]), iccProfile: icc }));
        expect([...png.icc]).toEqual([...icc]);
    });

    test('a bad argument throws oconv: bad png', () => {
        const ok = { width: 1, height: 1, bitDepth: 8, colorType: 0, data: new Uint8Array([0]) };
        for (const bad of [
            { ...ok, width: 0 }, { ...ok, height: 1.5 }, { ...ok, colorType: 5 },
            { ...ok, bitDepth: 3 }, { ...ok, colorType: 2, bitDepth: 4 },
            { ...ok, data: new Uint8Array(0) }, { ...ok, colorType: 3 }
        ]) {
            expect(() => encodePng(bad)).toThrow('oconv: bad png');
        }
    });
});
