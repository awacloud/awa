// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for the committed two-surface `dist/` bundles generated
 * by `tools/generate-bundles.mjs`. Each of the 18 descriptors (9 roots × 2
 * surfaces) must :
 *
 *   - expose the canonical `{ name, dependencies, factory }` shape ;
 *   - `-package` (dist/build) invocable with the 6 fw modules positionally ;
 *   - `-bundled` (dist/standalone) invocable with no args ;
 *   - returned surface (read/write/use on the format core instance).
 *
 * Relocated from `src/bundles/prebuilt/prebuilds.test.js` when the prebuilt
 * tree moved to `dist/standalone` (bundled variant) + `dist/build` (package
 * variant). Descriptor names are unchanged (`docxPackage`, `docxBundled`, …)
 * — verified against the actual regenerated output, not carried over
 * verbatim from the retired tree.
 *
 * @module ooxml/tests/dist-bundles.integration.test
 */
import { describe, test, expect } from 'bun:test';

import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { bitstream }    from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }      from '@awacloud/fw/io/compress/huffman.js';
import { deflate }      from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }        from '@awacloud/fw/io/compress/lz77.js';
import { zip }          from '@awacloud/fw/io/compress/zip.js';
import { crc32 }        from '@awacloud/fw/io/calc/crc32.js';

import { docxBundled }       from '../dist/standalone/docx.js';
import { docxPackage }       from '../dist/build/docx.js';
import { docxLargeBundled }  from '../dist/standalone/docx-large.js';
import { docxLargePackage }  from '../dist/build/docx-large.js';
import { docxFullBundled }   from '../dist/standalone/docx-full.js';
import { docxFullPackage }   from '../dist/build/docx-full.js';
import { xlsxBundled }       from '../dist/standalone/xlsx.js';
import { xlsxPackage }       from '../dist/build/xlsx.js';
import { xlsxLargeBundled }  from '../dist/standalone/xlsx-large.js';
import { xlsxLargePackage }  from '../dist/build/xlsx-large.js';
import { xlsxFullBundled }   from '../dist/standalone/xlsx-full.js';
import { xlsxFullPackage }   from '../dist/build/xlsx-full.js';
import { pptxBundled }       from '../dist/standalone/pptx.js';
import { pptxPackage }       from '../dist/build/pptx.js';
import { pptxLargeBundled }  from '../dist/standalone/pptx-large.js';
import { pptxLargePackage }  from '../dist/build/pptx-large.js';
import { pptxFullBundled }   from '../dist/standalone/pptx-full.js';
import { pptxFullPackage }   from '../dist/build/pptx-full.js';

// Resolve the 7 fw module descriptors into instances (tiny inline runtime).
function resolveFw() {
    const defs = { xml: fwXml, bitstream, huffman, lz77, deflate, zip, crc32 };
    const cache = Object.create(null);
    function resolve(n) {
        if (n in cache) return cache[n];
        const def = defs[n];
        const deps = def.dependencies.map(resolve);
        return (cache[n] = def.factory.apply({}, deps));
    }
    return ['xml', 'bitstream', 'huffman', 'lz77', 'deflate', 'zip', 'crc32'].map(resolve);
}
const FW_ARGS = resolveFw();
const FW_NAMES = ['xml', 'bitstream', 'huffman', 'lz77', 'deflate', 'zip', 'crc32'];

const ALL_PACKAGE = [
    ['docxPackage',      docxPackage],
    ['docxLargePackage', docxLargePackage],
    ['docxFullPackage',  docxFullPackage],
    ['xlsxPackage',      xlsxPackage],
    ['xlsxLargePackage', xlsxLargePackage],
    ['xlsxFullPackage',  xlsxFullPackage],
    ['pptxPackage',      pptxPackage],
    ['pptxLargePackage', pptxLargePackage],
    ['pptxFullPackage',  pptxFullPackage]
];

const ALL_BUNDLED = [
    ['docxBundled',      docxBundled],
    ['docxLargeBundled', docxLargeBundled],
    ['docxFullBundled',  docxFullBundled],
    ['xlsxBundled',      xlsxBundled],
    ['xlsxLargeBundled', xlsxLargeBundled],
    ['xlsxFullBundled',  xlsxFullBundled],
    ['pptxBundled',      pptxBundled],
    ['pptxLargeBundled', pptxLargeBundled],
    ['pptxFullBundled',  pptxFullBundled]
];

describe('dist bundles — descriptor shape', () => {
    for (const [name, d] of [...ALL_PACKAGE, ...ALL_BUNDLED]) {
        test(`${name} : shape`, () => {
            expect(d).toBeDefined();
            expect(d.name).toBe(name);
            expect(Array.isArray(d.dependencies)).toBe(true);
            expect(typeof d.factory).toBe('function');
        });
    }
});

describe('dist bundles — -package (dist/build) variants', () => {
    for (const [name, d] of ALL_PACKAGE) {
        test(`${name} : declares the 6 fw modules`, () => {
            expect(d.dependencies).toEqual(FW_NAMES);
        });
        test(`${name} : factory builds an instance with read/write/use`, () => {
            const inst = d.factory(...FW_ARGS);
            expect(inst).toBeDefined();
            expect(typeof inst.read).toBe('function');
            expect(typeof inst.write).toBe('function');
            expect(typeof inst.use).toBe('function');
        });
    }
});

describe('dist bundles — -bundled (dist/standalone) variants', () => {
    for (const [name, d] of ALL_BUNDLED) {
        test(`${name} : declares no dependencies`, () => {
            expect(d.dependencies).toEqual([]);
        });
        test(`${name} : factory builds an instance with no args`, () => {
            const inst = d.factory();
            expect(inst).toBeDefined();
            expect(typeof inst.read).toBe('function');
            expect(typeof inst.write).toBe('function');
            expect(typeof inst.use).toBe('function');
        });
    }
});

describe('dist bundles — functional smoke', () => {
    test('xlsxLargeBundled round-trips a workbook', () => {
        const inst = xlsxLargeBundled.factory();
        const wb = { type: 'workbook', sheets: [{ name: 'A', rows: [[{ value: 1 }]] }] };
        const back = inst.read(inst.write(wb));
        expect(back.workbook.sheets[0].name).toBe('A');
    });
    test('xlsxLargePackage round-trips a workbook', () => {
        const inst = xlsxLargePackage.factory(...FW_ARGS);
        const wb = { type: 'workbook', sheets: [{ name: 'B', rows: [[{ value: 2 }]] }] };
        const back = inst.read(inst.write(wb));
        expect(back.workbook.sheets[0].name).toBe('B');
    });
    test('pptxBundled round-trips a presentation', () => {
        const inst = pptxBundled.factory();
        const back = inst.read(inst.write({ slides: [{ paragraphs: ['Hello'] }] }));
        expect(inst.extractBody(back.presentation.slides[0])).toEqual(['Hello']);
    });
    test('pptxPackage round-trips a presentation', () => {
        const inst = pptxPackage.factory(...FW_ARGS);
        const back = inst.read(inst.write({ slides: [{ paragraphs: ['World'] }] }));
        expect(inst.extractBody(back.presentation.slides[0])).toEqual(['World']);
    });
});

describe('dist/build/index.js barrel', () => {
    test('re-exports the modules array and every named descriptor', async () => {
        const barrel = await import('../dist/build/index.js');

        // The four registration arrays.
        expect(Array.isArray(barrel.modules)).toBe(true);
        expect(Array.isArray(barrel.fw_require)).toBe(true);
        expect(Array.isArray(barrel.extras)).toBe(true);
        expect(Array.isArray(barrel.bundle)).toBe(true);

        // A representative sample of named module descriptors, each carrying
        // the canonical `{ name, dependencies, factory }` shape.
        for (const name of ['docx', 'xlsx', 'pptx', 'opcPackage', 'drawingml']) {
            const desc = barrel[name];
            expect(typeof desc).toBe('object');
            expect(typeof desc.name).toBe('string');
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        }

        // docxLargeBundle re-exported through the barrel is the same descriptor.
        const { docxLargeBundle } = await import('../src/bundles/docx-large.js');
        expect(barrel.docxLargeBundle).toBe(docxLargeBundle);
    });
});
