// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for the committed two-surface `dist/` bundles generated
 * by `tools/generate-bundles.mjs`. For each of the 9 assembly roots (`odt`,
 * `odt-large`, `odt-full`, `ods`, `ods-large`, `ods-full`, `odp`, `odp-large`,
 * `odp-full`), both variants must :
 *
 *   - expose the canonical `{ name, dependencies, factory }` shape ;
 *   - the `-package` variant declares the 6 fw modules as dependencies and
 *     is invocable with them positionally ;
 *   - the `-bundled` variant declares no dependencies and is invocable with
 *     no args ;
 *   - resolve to a working odf instance (read/write/use on the format core).
 *
 * Relocated from `src/bundles/prebuilt/prebuilds.test.js` when the prebuilt
 * tree moved to `dist/standalone` (bundled variant) + `dist/build` (package
 * variant). Descriptor names are unchanged from the retired generator
 * (`odtBundled`, `odtPackage`, …) — only the file paths moved.
 *
 * @module odf/tests/dist-bundles.integration.test
 */
import { describe, test, expect } from 'bun:test';

import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { bitstream }    from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }      from '@awacloud/fw/io/compress/huffman.js';
import { deflate }      from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }        from '@awacloud/fw/io/compress/lz77.js';
import { zip }          from '@awacloud/fw/io/compress/zip.js';
import { crc32 }        from '@awacloud/fw/io/calc/crc32.js';

import { odtBundled }       from '../dist/standalone/odt.js';
import { odtPackage }       from '../dist/build/odt.js';
import { odtLargeBundled }  from '../dist/standalone/odt-large.js';
import { odtLargePackage }  from '../dist/build/odt-large.js';
import { odtFullBundled }   from '../dist/standalone/odt-full.js';
import { odtFullPackage }   from '../dist/build/odt-full.js';
import { odsBundled }       from '../dist/standalone/ods.js';
import { odsPackage }       from '../dist/build/ods.js';
import { odsLargeBundled }  from '../dist/standalone/ods-large.js';
import { odsLargePackage }  from '../dist/build/ods-large.js';
import { odsFullBundled }   from '../dist/standalone/ods-full.js';
import { odsFullPackage }   from '../dist/build/ods-full.js';
import { odpBundled }       from '../dist/standalone/odp.js';
import { odpPackage }       from '../dist/build/odp.js';
import { odpLargeBundled }  from '../dist/standalone/odp-large.js';
import { odpLargePackage }  from '../dist/build/odp-large.js';
import { odpFullBundled }   from '../dist/standalone/odp-full.js';
import { odpFullPackage }   from '../dist/build/odp-full.js';

import { odtLargeBundle } from '../src/bundles/odt-large.js';

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
    ['odtPackage',      odtPackage],
    ['odtLargePackage', odtLargePackage],
    ['odtFullPackage',  odtFullPackage],
    ['odsPackage',      odsPackage],
    ['odsLargePackage', odsLargePackage],
    ['odsFullPackage',  odsFullPackage],
    ['odpPackage',      odpPackage],
    ['odpLargePackage', odpLargePackage],
    ['odpFullPackage',  odpFullPackage]
];

const ALL_BUNDLED = [
    ['odtBundled',      odtBundled],
    ['odtLargeBundled', odtLargeBundled],
    ['odtFullBundled',  odtFullBundled],
    ['odsBundled',      odsBundled],
    ['odsLargeBundled', odsLargeBundled],
    ['odsFullBundled',  odsFullBundled],
    ['odpBundled',      odpBundled],
    ['odpLargeBundled', odpLargeBundled],
    ['odpFullBundled',  odpFullBundled]
];

describe('prebuilt bundles — descriptor shape', () => {
    for (const [name, d] of [...ALL_PACKAGE, ...ALL_BUNDLED]) {
        test(`${name} : shape`, () => {
            expect(d).toBeDefined();
            expect(d.name).toBe(name);
            expect(Array.isArray(d.dependencies)).toBe(true);
            expect(typeof d.factory).toBe('function');
        });
    }
});

describe('prebuilt bundles — -package variants', () => {
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

describe('prebuilt bundles — -bundled variants', () => {
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

describe('prebuilt bundles — functional smoke', () => {
    test('odtBundled round-trips a paragraph', () => {
        const inst = odtBundled.factory();
        const back = inst.read(inst.write({ body: [inst.paragraph('Hello, ODT.')] }));
        expect(back.body[0].runs[0].value).toBe('Hello, ODT.');
    });
    test('odtLargePackage round-trips a paragraph', () => {
        const inst = odtLargePackage.factory(...FW_ARGS);
        const back = inst.read(inst.write({ body: [inst.paragraph('Large.')] }));
        expect(back.body[0].runs[0].value).toBe('Large.');
    });
    test('odtFullBundled round-trips a paragraph', () => {
        const inst = odtFullBundled.factory();
        const back = inst.read(inst.write({ body: [inst.paragraph('Full.')] }));
        expect(back.body[0].runs[0].value).toBe('Full.');
    });
    test('odsBundled round-trips a sheet', () => {
        const inst = odsBundled.factory();
        const doc = { spreadsheet: { tables: [inst.sheet('Sheet1', [[1, 2], [3, 4]])] } };
        const back = inst.read(inst.write(doc));
        expect(back.spreadsheet.tables).toHaveLength(1);
        expect(back.spreadsheet.tables[0].name).toBe('Sheet1');
    });
    test('odsLargePackage round-trips a sheet', () => {
        const inst = odsLargePackage.factory(...FW_ARGS);
        const doc = { spreadsheet: { tables: [inst.sheet('S', [[1]])] } };
        const back = inst.read(inst.write(doc));
        expect(back.spreadsheet.tables[0].name).toBe('S');
    });
    test('odpBundled round-trips a slide', () => {
        const inst = odpBundled.factory();
        const back = inst.read(inst.write(inst.empty()));
        expect(back.slides).toHaveLength(1);
        expect(back.slides[0].name).toBe('Slide1');
    });
    test('odpFullPackage round-trips a slide', () => {
        const inst = odpFullPackage.factory(...FW_ARGS);
        const back = inst.read(inst.write(inst.fromSlides([inst.slide('Intro'), inst.slide('End')])));
        expect(back.slides).toHaveLength(2);
        expect(back.slides[0].name).toBe('Intro');
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
        for (const name of ['odt', 'ods', 'odp', 'pkgPackage', 'odtLargeBundle']) {
            const desc = barrel[name];
            expect(typeof desc).toBe('object');
            expect(typeof desc.name).toBe('string');
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        }

        // odtLargeBundle re-exported through the barrel is the same descriptor.
        expect(barrel.odtLargeBundle).toBe(odtLargeBundle);
    });
});
