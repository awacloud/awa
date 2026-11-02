// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The raw subtrees `docx.read` keeps (a `w:sectPr` in `pPr._extras`, a
 * content control a table cell holds verbatim) hold no two adjacent text
 * nodes where the read removed a node between whitespace: an XML comment
 * (the XML parser drops it) or an ignorable element (markup
 * compatibility drops it). The write serialises both nodes as one run of
 * characters, so a split read would not be a fixed point.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const zip = runtime.resolve('zip');
const enc = new TextEncoder();
const dec = new TextDecoder();

const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';

/** A docx whose body is `body` (pretty-printed XML), its root declaring w15 as ignorable. */
function docxWithBody(body) {
    const parts = zip.unzipSync(d.write({ type: 'document', body: [{ type: 'paragraph', children: [] }] }));
    const xmlText = dec.decode(parts['word/document.xml'])
        .replace(/<w:document\b([^>]*)>/, (m, a) => (a.includes('xmlns:w15=') ? m : `<w:document${a} xmlns:w15="${W15}">`))
        .replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}</w:body>`);
    return zip.zipSync({ ...parts, 'word/document.xml': enc.encode(xmlText) });
}

/** A raw XML text node: exactly `{ type: 'text', value }`. */
const isRawText = (x) => x?.type === 'text' && typeof x.value === 'string' && Object.keys(x).length === 2;

/** Paths of every array of `v` holding two adjacent raw text nodes. */
function adjacentText(v, path = '', out = []) {
    if (!v || typeof v !== 'object' || v instanceof Uint8Array) return out;
    if (Array.isArray(v)) {
        for (let i = 1; i < v.length; i++) {
            if (isRawText(v[i - 1]) && isRawText(v[i])) out.push(`${path}[${i}]`);
        }
        v.forEach((x, i) => adjacentText(x, `${path}.${i}`, out));
    } else {
        for (const k of Object.keys(v)) adjacentText(v[k], `${path}.${k}`, out);
    }
    return out;
}

const SECTPR_COMMENT = `
    <w:p>
      <w:pPr>
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
          <!-- page margins -->
          <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/>
        </w:sectPr>
      </w:pPr>
      <w:r><w:t>one</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>two</w:t></w:r></w:p>`;

const CELL_APPEARANCE = `
    <w:tbl>
      <w:tblPr/>
      <w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr>
        <w:tc>
          <w:sdt>
            <w:sdtPr>
              <w:alias w:val="Initials"/>
              <w:showingPlcHdr/>
              <w15:appearance w15:val="hidden"/>
            </w:sdtPr>
            <w:sdtEndPr/>
            <w:sdtContent>
              <w:p><w:r><w:t>YN</w:t></w:r></w:p>
            </w:sdtContent>
          </w:sdt>
          <w:p/>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p/>`;

describe('docx.read — no adjacent text nodes in a raw subtree', () => {
    for (const [label, body] of [['an XML comment in a w:sectPr', SECTPR_COMMENT],
        ['an ignorable w15:appearance in a content control of a cell', CELL_APPEARANCE]]) {
        test(`${label}: one text node, and read -> write -> read is a fixed point`, () => {
            const r = d.read(docxWithBody(body));
            expect(adjacentText(r.document)).toEqual([]);
            expect(d.read(d.write(r.document)).document).toEqual(r.document);
        });
    }

    test('the same, under alternateContent: keep', () => {
        for (const body of [SECTPR_COMMENT, CELL_APPEARANCE]) {
            const r = d.read(docxWithBody(body), { alternateContent: 'keep' });
            expect(adjacentText(r.document)).toEqual([]);
        }
    });
});
