// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A `<w:hyperlink>` holds a paragraph's content (CT_Hyperlink,
 * EG_PContent): its children are typed as a paragraph's — runs,
 * revisions, bookmark markers, range markup (`<w:proofErr>` …) — in place,
 * and any other child stays verbatim in the hyperlink's `_extras`, written
 * after its typed children.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const s = runtime.resolve('docxStructure');
const xml = runtime.resolve('xml');
const d = runtime.resolve('docx');
const zip = runtime.resolve('zip');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const LINK = '<w:hyperlink w:anchor="_Toc1"><w:bookmarkStart w:id="7" w:name="here"/>'
    + '<w:del w:id="2" w:author="Ann"><w:r><w:delText>old </w:delText></w:r></w:del>'
    + '<w:proofErr w:type="spellStart"/><w:r><w:t>kept</w:t></w:r><w:proofErr w:type="spellEnd"/>'
    + '<w:ins w:id="3" w:author="Ann"><w:r><w:t> new</w:t></w:r></w:ins><w:bookmarkEnd w:id="7"/></w:hyperlink>';

const para = (inner) => xml.parse(`<w:p ${NS}>${inner}</w:p>`);
const names = (el) => (el.children || []).filter((c) => c.type === 'element').map((c) => c.name);

describe('docxStructure — a hyperlink holds a paragraph\'s content', () => {
    test('revisions, bookmark markers and proofing marks are typed in place', () => {
        const [link] = s.parseParagraph(para(LINK)).children;
        expect(link.type).toBe('hyperlink');
        expect(link.anchor).toBe('_Toc1');
        expect(link.children.map((c) => c.type)).toEqual(['bookmarkStart', 'del', 'rangeMarker', 'run', 'rangeMarker', 'ins', 'bookmarkEnd']);
        expect([link.children[2].attrs, link.children[4].attrs]).toEqual([{ 'w:type': 'spellStart' }, { 'w:type': 'spellEnd' }]);
        expect(link._extras).toBeUndefined();
    });

    test('parse → render keeps the typed children in order; a parse of the render is the same node', () => {
        const once = s.parseParagraph(para(LINK));
        const rendered = s.renderParagraph(once);
        expect(names(rendered.children[0])).toEqual(['w:bookmarkStart', 'w:del', 'w:proofErr', 'w:r', 'w:proofErr', 'w:ins', 'w:bookmarkEnd']);
        expect(s.parseParagraph(xml.parse(xml.serialize(rendered).replace('<w:p>', `<w:p ${NS}>`)))).toEqual(once);
    });

    test('a hyperlink of runs reads and writes as before', () => {
        const [link] = s.parseParagraph(para('<w:hyperlink w:anchor="a"><w:r><w:t>x</w:t></w:r></w:hyperlink>')).children;
        expect(link).toEqual({ type: 'hyperlink', anchor: 'a', children: [{ type: 'run', children: [{ type: 'text', value: 'x' }] }] });
        expect(xml.serialize(s.renderParagraph({ type: 'paragraph', children: [link] })).replace(/^<\?xml[^>]*>\s*/, ''))
            .toBe('<w:p><w:hyperlink w:anchor="a"><w:r><w:t xml:space="preserve">x</w:t></w:r></w:hyperlink></w:p>');
    });
});

describe('docx.read / docx.write — a hyperlink\'s content', () => {
    test('the deletion, the insertion, the bookmark and the proofErr survive the round trip', () => {
        const parts = zip.unzipSync(d.write({ type: 'document', body: [{ type: 'paragraph', children: [] }] }));
        const body = dec.decode(parts['word/document.xml']).replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body><w:p>${LINK}</w:p></w:body>`);
        const bytes = zip.zipSync({ ...parts, 'word/document.xml': enc.encode(body) });
        const r = d.read(bytes);
        const out = dec.decode(zip.unzipSync(d.write(r.document))['word/document.xml']);
        for (const frag of ['<w:del w:id="2" w:author="Ann">', '<w:ins w:id="3" w:author="Ann">', '<w:bookmarkStart w:id="7" w:name="here"/>', '<w:proofErr w:type="spellEnd"/>'])
            expect(out).toContain(frag);
        expect(d.read(zip.zipSync({ ...parts, 'word/document.xml': enc.encode(out) })).document).toEqual(r.document);
        expect(d.toText(r.document)).toBe('kept new');
    });
});
