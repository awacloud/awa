// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { buildXml, buildPkg, buildOdtStack, buildOdsStack, buildOdpStack } from './build.js';

function resolveZip() {
    const rt = new ModuleRuntime();
    for (const m of [bitstream, huffman, lz77, deflate, crc32, zip]) rt.register(m);
    return rt.resolve('zip');
}

describe('test helpers — build', () => {
    test('buildXml returns a usable xml factory', () => {
        const xml = buildXml();
        expect(typeof xml.parse).toBe('function');
        expect(xml.parse('<a/>').name).toBe('a');
    });

    test('buildPkg returns the pkg + dependencies', () => {
        const z = resolveZip();
        const built = buildPkg({ zip: z });
        expect(built.xml).toBeDefined();
        expect(built.mimetype).toBeDefined();
        expect(built.manifest).toBeDefined();
        expect(built.pkg).toBeDefined();
        const empty = built.pkg.empty(built.mimetype.CT_ODT);
        expect(empty.mimetype).toBe(built.mimetype.CT_ODT);
    });

    test('buildOdtStack returns a working odt module', () => {
        const z = resolveZip();
        const stack = buildOdtStack({ zip: z });
        expect(stack.odt).toBeDefined();
        const doc = { body: [stack.paragraph.paragraph('hello')] };
        const bytes = stack.odt.write(doc);
        const back = stack.odt.read(bytes);
        expect(back.body[0].runs[0].value).toBe('hello');
    });

    test('buildOdsStack returns a working ods module', () => {
        const z = resolveZip();
        const stack = buildOdsStack({ zip: z });
        expect(stack.ods).toBeDefined();
        const doc = { spreadsheet: { tables: [stack.ods.sheet('S', [[1, 2]])] } };
        const back = stack.ods.read(stack.ods.write(doc));
        expect(back.spreadsheet.tables[0].name).toBe('S');
    });

    test('buildOdpStack returns a working odp module', () => {
        const z = resolveZip();
        const stack = buildOdpStack({ zip: z });
        expect(stack.odp).toBeDefined();
        const doc = { slides: [stack.odp.slide('A'), stack.odp.slide('B')] };
        const back = stack.odp.read(stack.odp.write(doc));
        expect(back.slides).toHaveLength(2);
    });
});
