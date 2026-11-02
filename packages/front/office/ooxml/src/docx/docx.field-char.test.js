// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A `<w:fldChar>` keeps its child (`<w:ffData>` of a legacy form field,
 * `<w:fldData>`, `<w:numberingChange>` of a tracked numbering change)
 * verbatim in the node's `_extras`, and its `w:fldLock` as `fldLock`;
 * both are written back inside the element.
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
const FF_DATA = '<w:ffData><w:name w:val="Text1"/><w:enabled/><w:calcOnExit w:val="0"/>'
    + '<w:textInput><w:maxLength w:val="12"/></w:textInput></w:ffData>';
const NUMBERING_CHANGE = '<w:numberingChange w:id="0" w:author="Ann" w:date="2015-02-11T14:39:00Z" w:original="1."/>';
const FIELD = `<w:r><w:fldChar w:fldCharType="begin" w:fldLock="true">${FF_DATA}</w:fldChar></w:r>`
    + '<w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r>'
    + '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>value</w:t></w:r>'
    + `<w:r><w:fldChar w:fldCharType="end">${NUMBERING_CHANGE}</w:fldChar></w:r>`;

const para = (inner) => xml.parse(`<w:p ${NS}>${inner}</w:p>`);
const fldChars = (p) => p.children.flatMap((r) => r.children.filter((c) => c.type === 'fldChar'));

describe('docxStructure — field characters', () => {
    test('the child and the lock are read onto the node, kind and dirty unchanged', () => {
        const [begin, separate, end] = fldChars(s.parseParagraph(para(FIELD)));
        expect(begin.kind).toBe('begin');
        expect(begin.fldLock).toBe(true);
        expect(begin._extras.map((n) => n.name)).toEqual(['w:ffData']);
        expect(separate).toEqual({ type: 'fldChar', kind: 'separate' });
        expect(end.kind).toBe('end');
        expect(end.fldLock).toBeUndefined();
        expect(end._extras.map((n) => [n.name, n.attrs['w:original']])).toEqual([['w:numberingChange', '1.']]);
        // ST_OnOff: an off lock is no lock.
        const [off] = fldChars(s.parseParagraph(para('<w:r><w:fldChar w:fldCharType="begin" w:fldLock="0" w:dirty="1"/></w:r>')));
        expect(off).toEqual({ type: 'fldChar', kind: 'begin', dirty: true });
    });

    test('parse → render writes them back inside the element; a parse of the render is the same node', () => {
        const once = s.parseParagraph(para(FIELD));
        const out = xml.serialize(s.renderParagraph(once));
        expect(out).toContain('<w:fldChar w:fldCharType="begin" w:fldLock="1"><w:ffData><w:name w:val="Text1"/>');
        expect(out).toContain('<w:textInput><w:maxLength w:val="12"/></w:textInput></w:ffData></w:fldChar>');
        expect(out).toContain(`<w:fldChar w:fldCharType="end">${NUMBERING_CHANGE}</w:fldChar>`);
        expect(s.parseParagraph(xml.parse(out.replace('<w:p>', `<w:p ${NS}>`)))).toEqual(once);
    });
});

describe('docx.read / docx.write — field characters', () => {
    test('a form field and a tracked numbering change survive the round trip', () => {
        const parts = zip.unzipSync(d.write({ type: 'document', body: [{ type: 'paragraph', children: [] }] }));
        const body = dec.decode(parts['word/document.xml']).replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body><w:p>${FIELD}</w:p></w:body>`);
        const bytes = zip.zipSync({ ...parts, 'word/document.xml': enc.encode(body) });
        const r = d.read(bytes);
        const out = dec.decode(zip.unzipSync(d.write(r.document))['word/document.xml']);
        expect(out).toContain('w:fldLock="1"><w:ffData>');
        expect(out).toContain('<w:maxLength w:val="12"/>');
        expect(out).toContain('<w:numberingChange w:id="0" w:author="Ann"');
        expect(d.read(zip.zipSync({ ...parts, 'word/document.xml': enc.encode(out) })).document).toEqual(r.document);
    });
});
