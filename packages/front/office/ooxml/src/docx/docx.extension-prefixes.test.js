// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docx.read` treats the Office extension prefixes the writer lists in
 * `mc:Ignorable` (`ooxmlShared.WORD_EXTENSION_PREFIXES`) as ignorable in
 * every part, whether or not the part lists them: a part that declares
 * `w14` without `mc:Ignorable` reads as its written form does.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const shared = runtime.resolve('ooxmlShared');
const zip = runtime.resolve('zip');
const enc = new TextEncoder();
const dec = new TextDecoder();

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const BODY = '<w:body><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr>'
    + '<w:sdt><w:sdtPr><w:tag w:val="cell"/></w:sdtPr><w:sdtContent><w:tc>'
    + '<w:p w14:paraId="00000002"><w:r><w:t>a</w:t></w:r></w:p></w:tc></w:sdtContent></w:sdt>'
    + '</w:tr></w:tbl><w:p w14:paraId="00000003"><w:r><w:t>b</w:t></w:r></w:p></w:body>';

/** A docx whose root declares w14, with `ignorable` as its mc:Ignorable (none when null). */
function docxWith(ignorable) {
    const parts = zip.unzipSync(d.write({ type: 'document', body: [{ type: 'paragraph', children: [] }] }));
    const decl = ` xmlns:w14="${W14}"` + (ignorable == null ? ''
        : ` xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="${ignorable}"`);
    const body = dec.decode(parts['word/document.xml'])
        .replace(/<w:document\b([^>]*)>/, (m, a) => `<w:document${a.replace(/\s(xmlns:mc|mc:Ignorable)="[^"]*"/g, '')}${decl}>`)
        .replace(/<w:body>[\s\S]*<\/w:body>/, BODY);
    return zip.zipSync({ ...parts, 'word/document.xml': enc.encode(body) });
}

describe('ooxmlShared.WORD_EXTENSION_PREFIXES', () => {
    test('the extension prefixes the writer lists in mc:Ignorable', () => {
        expect(shared.WORD_EXTENSION_PREFIXES).toEqual(['wp14', 'w14', 'w15', 'w16', 'w16cex', 'w16cid', 'w16se', 'w16sdtdh']);
        expect(Object.isFrozen(shared.WORD_EXTENSION_PREFIXES)).toBe(true);
    });
});

describe('docx.read — an undeclared Office extension prefix', () => {
    test('a root declaring w14 without mc:Ignorable reads as its written form: a fixed point', () => {
        const r = d.read(docxWith(null));
        expect(JSON.stringify(r.document)).not.toContain('w14:paraId');
        const out = d.write(r.document);
        expect(d.read(out).document).toEqual(r.document);
    });

    test('it reads as the same root listing w14 in mc:Ignorable does', () => {
        expect(d.read(docxWith(null)).document).toEqual(d.read(docxWith('w14')).document);
    });
});
