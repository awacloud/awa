// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration tests that exercise each bundle through a `ModuleRuntime`.
 * Verifies that registering every odf core module + every extra + the
 * bundle descriptor allows `resolve('<format>LargeBundle')` /
 * `resolve('<format>FullBundle')` to return a fully wired core instance
 * (i.e. one whose `.use(...)` extension hooks were fed every declared
 * extra).
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';

import { modules as odfModules } from '../main.js';
import { odfMiscHelper }  from '../extra/_misc-helper.js';
import { odfTypedHelper } from '../extra/_typed-helper.js';
import { textTrackedChanges } from '../extra/text-tracked-changes.js';
import { textFieldsExtended } from '../extra/text-fields-extended.js';
import { textListDetailed } from '../extra/text-list-detailed.js';
import { tableAdvanced } from '../extra/table-advanced.js';
import { stylePage } from '../extra/style-page.js';
import { stylePropertiesTyped } from '../extra/style-properties-typed.js';
import { drawShapes } from '../extra/draw-shapes.js';
import { presentationTyped } from '../extra/presentation-typed.js';
import { textMetaExtended } from '../extra/text-meta-extended.js';
import { textSectionsAdvanced } from '../extra/text-sections-advanced.js';
import { textTocIndex } from '../extra/text-toc-index.js';
import { drawImageExtended } from '../extra/draw-image-extended.js';
import { chartTyped } from '../extra/chart-typed.js';
import { animationsSmil } from '../extra/animations-smil.js';
import { formsControls } from '../extra/forms-controls.js';
import { numberFormatExtended } from '../extra/number-format-extended.js';
import { metaExtended } from '../extra/meta-extended.js';
import { mathMathml } from '../extra/math-mathml.js';
import { dr3d3d } from '../extra/dr3d-3d.js';
import { databaseSources } from '../extra/database-sources.js';
import { settingsExtended } from '../extra/settings-extended.js';
import { scriptMacros } from '../extra/script-macros.js';
import { dsigSignatures } from '../extra/dsig-signatures.js';
import { textMisc } from '../extra/text-misc.js';
import { styleMisc } from '../extra/style-misc.js';
import { drawMisc } from '../extra/draw-misc.js';
import { tableMisc } from '../extra/table-misc.js';
import { officeMisc } from '../extra/office-misc.js';
import { legacyStaroffice } from '../extra/legacy-staroffice.js';

import { odtLargeBundle } from './odt-large.js';
import { odsLargeBundle } from './ods-large.js';
import { odpLargeBundle } from './odp-large.js';
import { odtFullBundle }  from './odt-full.js';
import { odsFullBundle }  from './ods-full.js';
import { odpFullBundle }  from './odp-full.js';

function makeRuntime() {
    const rt = new ModuleRuntime();
    // fw infra used by odf core modules
    rt.register(fwXml);
    rt.register(bitstream);
    rt.register(huffman);
    rt.register(lz77);
    rt.register(deflate);
    rt.register(zip);
    rt.register(crc32);
    // every odf core module
    for (const m of odfModules) rt.register(m);
    // shared helpers consumed by opt-in extras
    rt.register(odfMiscHelper);
    rt.register(odfTypedHelper);
    // every opt-in extra
    const extras = [
        textTrackedChanges, textFieldsExtended, textListDetailed,
        tableAdvanced, stylePage, stylePropertiesTyped,
        drawShapes, presentationTyped,
        textMetaExtended, textSectionsAdvanced, textTocIndex,
        drawImageExtended, chartTyped, animationsSmil, formsControls,
        numberFormatExtended, metaExtended, mathMathml,
        dr3d3d, databaseSources, settingsExtended, scriptMacros, dsigSignatures,
        textMisc, styleMisc, drawMisc, tableMisc, officeMisc, legacyStaroffice
    ];
    for (const e of extras) rt.register(e);
    return rt;
}

describe('bundles via ModuleRuntime', () => {
    test('odtLargeBundle resolves to a wired odt instance', () => {
        const rt = makeRuntime();
        rt.register(odtLargeBundle);
        const inst = rt.resolve('odtLargeBundle');
        expect(inst).toBeDefined();
        expect(typeof inst.read).toBe('function');
        expect(typeof inst.write).toBe('function');
        expect(typeof inst.use).toBe('function');
        expect(inst.hasExtensions).toBe(true);
        // Roundtrip smoke
        const bytes = inst.write(inst.empty());
        const back = inst.read(bytes);
        expect(back.body.length).toBeGreaterThanOrEqual(1);
    });

    test('odtFullBundle resolves to the (further-enriched) odt instance', () => {
        const rt = makeRuntime();
        rt.register(odtLargeBundle);
        rt.register(odtFullBundle);
        const inst = rt.resolve('odtFullBundle');
        expect(inst).toBeDefined();
        expect(inst.hasExtensions).toBe(true);
        const bytes = inst.write(inst.empty());
        const back = inst.read(bytes);
        expect(back.body.length).toBeGreaterThanOrEqual(1);
    });

    test('odsLargeBundle resolves and supports basic write/read', () => {
        const rt = makeRuntime();
        rt.register(odsLargeBundle);
        const inst = rt.resolve('odsLargeBundle');
        expect(inst).toBeDefined();
        expect(inst.hasExtensions).toBe(true);
        const bytes = inst.write(inst.empty());
        const back = inst.read(bytes);
        expect(back.spreadsheet.tables.length).toBeGreaterThanOrEqual(1);
    });

    test('odsFullBundle resolves to a wired ods instance', () => {
        const rt = makeRuntime();
        rt.register(odsLargeBundle);
        rt.register(odsFullBundle);
        const inst = rt.resolve('odsFullBundle');
        expect(inst).toBeDefined();
        expect(inst.hasExtensions).toBe(true);
    });

    test('odpLargeBundle resolves and supports basic write/read', () => {
        const rt = makeRuntime();
        rt.register(odpLargeBundle);
        const inst = rt.resolve('odpLargeBundle');
        expect(inst).toBeDefined();
        expect(inst.hasExtensions).toBe(true);
    });

    test('odpFullBundle resolves to a wired odp instance', () => {
        const rt = makeRuntime();
        rt.register(odpLargeBundle);
        rt.register(odpFullBundle);
        const inst = rt.resolve('odpFullBundle');
        expect(inst).toBeDefined();
        expect(inst.hasExtensions).toBe(true);
    });
});
