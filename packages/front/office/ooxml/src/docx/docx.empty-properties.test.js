// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * An empty `<w:rPr/>` / `<w:pPr/>` (LibreOffice writes them) reads as an
 * empty object and is written back as the empty element, so a docx body
 * round trip is a fixed point. A run or paragraph with no properties
 * still writes none.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const s = runtime.resolve('docxStructure');
const xml = runtime.resolve('xml');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (inner) => xml.parse(`<w:p ${NS}>${inner}</w:p>`);
const names = (el) => (el.children || []).filter((c) => c.type === 'element').map((c) => c.name);
const reparse = (el) => s.parseParagraph(xml.parse(xml.serialize(el).replace('<w:p>', `<w:p ${NS}>`)));

describe('docxStructure — empty property elements', () => {
    test('an empty pPr, paragraph-mark rPr and run rPr survive parse → render → parse', () => {
        for (const inner of [
            '<w:pPr/><w:r><w:rPr/><w:t>a</w:t></w:r>',
            '<w:pPr><w:rPr></w:rPr></w:pPr><w:r><w:rPr></w:rPr><w:t>a</w:t></w:r>',
        ]) {
            const once = s.parseParagraph(para(inner));
            const rendered = s.renderParagraph(once);
            expect(reparse(rendered)).toEqual(once);
            expect(names(rendered)).toEqual(['w:pPr', 'w:r']);
            expect(names(rendered.children[1])).toEqual(['w:rPr', 'w:t']);
        }
        const mark = s.renderParagraph(s.parseParagraph(para('<w:pPr><w:rPr/></w:pPr><w:r><w:t>a</w:t></w:r>')));
        expect(names(mark.children[0])).toEqual(['w:rPr']);
    });

    test('a run or paragraph without properties writes none', () => {
        const rendered = s.renderParagraph({ type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: 'a' }] }] });
        expect(names(rendered)).toEqual(['w:r']);
        expect(names(rendered.children[0])).toEqual(['w:t']);
    });
});
