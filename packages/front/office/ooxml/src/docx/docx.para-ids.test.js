// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Word's paragraph and row ids (`w14:paraId`, `w14:textId`) survive a
 * save-back when the read keeps the `w14` namespace (T57): a paragraph and a
 * row read them as `paraId` / `textId` and the write gives them back; a part
 * carries each `paraId` once, so a paragraph a consumer copied does not
 * repeat it. The default read drops `w14` as before.
 *
 * Every source package is a document written by `docx.write`, opened with
 * `opcPackage.read`, given a Word-like root and runs, and zipped again.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const rt = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) rt.register(m);
const docx = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const enc = new TextEncoder();
const dec = new TextDecoder();

const ROOT = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14">';
const PARA = '<w:p w14:paraId="1A2B3C4D" w14:textId="77777777"><w:r><w:t>one</w:t></w:r></w:p>';
const TABLE = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>'
    + '<w:tr w14:paraId="0000000A" w14:textId="0000000B"><w:tc><w:p w14:paraId="0000000C" w14:textId="0000000D"/></w:tc></w:tr></w:tbl>';

/** A source whose body starts with `blocks` (and whose header, given, holds `header`). */
function source(blocks, header) {
    const base = docx.write({ type: 'document', body: [{ type: 'paragraph', children: [docx.run('end')] }] },
        header ? { headers: { rIdH: { type: 'header', body: [{ type: 'paragraph', children: [docx.run('h')] }] } } } : {});
    const pkg = opc.read(base);
    const inject = (part, xmlBlocks, tag) => {
        const s = dec.decode(pkg.parts[part]).replace(new RegExp(`<${tag}\\b[^>]*>`), () => ROOT.replace('<w:document', `<${tag}`));
        const at = s.indexOf('<w:body>') >= 0 ? s.indexOf('<w:body>') + 8 : s.indexOf('>', s.indexOf(`<${tag}`)) + 1;
        pkg.parts[part] = enc.encode(s.slice(0, at) + xmlBlocks + s.slice(at));
    };
    inject('/word/document.xml', blocks, 'w:document');
    if (header) inject('/word/header1.xml', header, 'w:hdr');
    return opc.write(pkg);
}
const KEEP = { alternateContent: 'keep', extensions: 'keep' };
const saveBack = (r) => docx.write(r.document, { styles: r.styles, settings: r.settings, headers: r.headers,
    footers: r.footers, hyperlinks: r.hyperlinks, images: r.images, carry: r });
const part = (bytes, name = '/word/document.xml') => dec.decode(opc.read(bytes).parts[name]);

describe('w14:paraId / w14:textId kept under extensions: keep (T57)', () => {
    test('a paragraph\'s and a row\'s ids read and written back', () => {
        const r = docx.read(source(PARA + TABLE), KEEP);
        const [p, t] = r.document.body;
        expect(p).toMatchObject({ type: 'paragraph', paraId: '1A2B3C4D', textId: '77777777' });
        expect(t.rows[0]).toMatchObject({ paraId: '0000000A', textId: '0000000B' });
        expect(t.rows[0].cells[0].children[0]).toMatchObject({ paraId: '0000000C', textId: '0000000D' });
        const out = part(saveBack(r));
        expect(out).toMatch(/<w:p w14:paraId="1A2B3C4D" w14:textId="77777777">/);
        expect(out).toMatch(/<w:tr w14:paraId="0000000A" w14:textId="0000000B">/);
        expect(out).toContain('w14:paraId="0000000C"');
    });

    test('the default read drops them, as before', () => {
        const r = docx.read(source(PARA + TABLE));
        expect(r.document.body[0].paraId).toBeUndefined();
        expect(r.document.body[1].rows[0].paraId).toBeUndefined();
    });

    test('a part carries each paraId once: a copied paragraph does not repeat it', () => {
        const r = docx.read(source(PARA), KEEP);
        r.document.body.splice(1, 0, structuredClone(r.document.body[0]));
        const out = part(saveBack(r));
        expect(out.match(/w14:paraId="1A2B3C4D"/g)).toHaveLength(1);
        expect(out.match(/w14:textId="77777777"/g)).toHaveLength(2);
    });

    test('a header paragraph keeps its ids', () => {
        const r = docx.read(source('', PARA), KEEP);
        expect(part(saveBack(r), '/word/header1.xml')).toMatch(/<w:p w14:paraId="1A2B3C4D" w14:textId="77777777">/);
    });
});

describe('w14 ids of a display-equation paragraph (T57)', () => {
    test('a paragraph holding only an equation keeps its ids', () => {
        const eq = '<w:p w14:paraId="6570E839" w14:textId="4BA06C5F" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'
            + '<m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara></w:p>';
        const r = docx.read(source(eq), KEEP);
        expect(r.document.body[0]).toMatchObject({ type: 'oMathPara', paraId: '6570E839', textId: '4BA06C5F' });
        expect(part(saveBack(r))).toMatch(/<w:p w14:paraId="6570E839" w14:textId="4BA06C5F">/);
    });
});
