// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration tests that exercise each bundle through a `ModuleRuntime`.
 * Verifies that registering every ooxml module + every extra + the bundle
 * descriptor allows `resolve('<format>LargeBundle')` to return a fully
 * wired core instance (i.e. one whose `.use(...)` extension hooks were
 * fed every declared extra).
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

import { modules as ooxmlModules, extras as ooxmlExtras } from '../main.js';

import { docxLargeBundle } from './docx-large.js';
import { docxFullBundle }  from './docx-full.js';
import { xlsxLargeBundle } from './xlsx-large.js';
import { xlsxFullBundle }  from './xlsx-full.js';
import { pptxLargeBundle } from './pptx-large.js';
import { pptxFullBundle }  from './pptx-full.js';

function makeRuntime() {
    const rt = new ModuleRuntime();
    // fw infra needed by ooxml core modules
    rt.register(fwXml);
    rt.register(bitstream);
    rt.register(huffman);
    rt.register(lz77);
    rt.register(deflate);
    rt.register(zip);
    rt.register(crc32);
    // every ooxml core module
    for (const m of ooxmlModules) rt.register(m);
    // every opt-in extra
    for (const e of ooxmlExtras) rt.register(e);
    return rt;
}

describe('bundles via ModuleRuntime', () => {
    test('docxLargeBundle resolves to a docx instance with extras wired', () => {
        const rt = makeRuntime();
        rt.register(docxLargeBundle);
        const inst = rt.resolve('docxLargeBundle');
        expect(inst).toBeDefined();
        expect(typeof inst.read).toBe('function');
        expect(typeof inst.write).toBe('function');
        expect(typeof inst.use).toBe('function');
        // Extras are wired : a doc with <w:caps/> in rPr should now parse
        // typed (without the extras the value lands in `_extras`).
        const documentXml = '<?xml version="1.0"?>'
            + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:body><w:p><w:r><w:rPr><w:caps/></w:rPr><w:t>x</w:t></w:r></w:p></w:body>'
            + '</w:document>';
        const opc = rt.resolve('opcPackage');
        const pkg = opc.empty();
        opc.setPart(pkg, '/word/document.xml',
            new TextEncoder().encode(documentXml), inst.CT_DOCUMENT);
        opc.setRels(pkg, '/', [{
            Id: 'rId1', Type: inst.REL_TYPE_DOC, Target: 'word/document.xml'
        }]);
        const parsed = inst.read(opc.write(pkg));
        expect(parsed.document.body[0].children[0].rPr.caps).toBe(true);
    });

    test('docxFullBundle resolves to the (further-enriched) docx instance', () => {
        const rt = makeRuntime();
        rt.register(docxLargeBundle);
        rt.register(docxFullBundle);
        const inst = rt.resolve('docxFullBundle');
        expect(inst).toBeDefined();
        expect(typeof inst.read).toBe('function');
        expect(typeof inst.write).toBe('function');
    });

    test('xlsxLargeBundle resolves and supports basic write/read', () => {
        const rt = makeRuntime();
        rt.register(xlsxLargeBundle);
        const inst = rt.resolve('xlsxLargeBundle');
        expect(inst).toBeDefined();
        expect(typeof inst.read).toBe('function');
        const wb = { type: 'workbook', sheets: [{ name: 'A', rows: [[{ value: 1 }]] }] };
        const back = inst.read(inst.write(wb));
        expect(back.workbook.sheets[0].name).toBe('A');
    });

    test('xlsxFullBundle resolves to a wired xlsx instance', () => {
        const rt = makeRuntime();
        rt.register(xlsxLargeBundle);
        rt.register(xlsxFullBundle);
        const inst = rt.resolve('xlsxFullBundle');
        expect(inst).toBeDefined();
        expect(typeof inst.read).toBe('function');
    });

    test('pptxLargeBundle resolves and supports basic write/read', () => {
        const rt = makeRuntime();
        rt.register(pptxLargeBundle);
        const inst = rt.resolve('pptxLargeBundle');
        expect(inst).toBeDefined();
        const back = inst.read(inst.write({ slides: [{ paragraphs: ['Hello'] }] }));
        expect(inst.extractBody(back.presentation.slides[0])).toEqual(['Hello']);
    });

    test('pptxFullBundle resolves to a wired pptx instance', () => {
        const rt = makeRuntime();
        rt.register(pptxLargeBundle);
        rt.register(pptxFullBundle);
        const inst = rt.resolve('pptxFullBundle');
        expect(inst).toBeDefined();
        expect(typeof inst.read).toBe('function');
    });
});
