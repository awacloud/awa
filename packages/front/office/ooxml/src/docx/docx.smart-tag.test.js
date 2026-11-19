// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A `w:smartTag` (ECMA-376 Part 1 § 17.5.1.9) is typed as an inline
 * wrapper and written back in its place: its text keeps its position in
 * the paragraph through a save-back, and `docx.toText` reads it.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const s = runtime.resolve('docxStructure');
const xml = runtime.resolve('xml');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (inner) => xml.parse(`<w:p ${NS}>${inner}</w:p>`);
const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const names = (el) => el.children.filter((c) => c.type === 'element').map((c) => c.name);
const SMART = '<w:smartTag w:uri="urn:schemas-microsoft-com:office:smarttags" w:element="place">'
    + '<w:smartTagPr><w:attr w:name="Country" w:val="FR"/></w:smartTagPr>'
    + run('B')
    + '<w:customXml w:element="note"/>'
    + '</w:smartTag>';

describe('docxStructure — a smart tag typed in place (T68)', () => {
    test('the wrapper reads in place, its run inside, its properties and an unknown child kept', () => {
        const p = s.parseParagraph(para(run('A ') + SMART + run(' C')));
        expect(p._extras).toBeUndefined();
        expect(p.children.map((c) => c.type)).toEqual(['run', 'smartTag', 'run']);
        const t = p.children[1];
        expect(t.attrs).toEqual({ 'w:uri': 'urn:schemas-microsoft-com:office:smarttags', 'w:element': 'place' });
        expect(t.smartTagPr.name).toBe('w:smartTagPr');
        expect(t.children.map((c) => c.type)).toEqual(['run']);
        expect(t._extras.map((e) => e.name)).toEqual(['w:customXml']);
    });

    test('written back in its place: the text keeps its order, a fixed point', () => {
        const once = s.parseParagraph(para(run('A ') + SMART + run(' C')));
        const rendered = s.renderParagraph(once);
        expect(names(rendered)).toEqual(['w:r', 'w:smartTag', 'w:r']);
        expect(names(rendered.children.find((c) => c.name === 'w:smartTag'))).toEqual(['w:smartTagPr', 'w:r', 'w:customXml']);
        expect(s.parseParagraph(xml.parse(xml.serialize(rendered).replace('<w:p>', `<w:p ${NS}>`)))).toEqual(once);
        expect(d.toText({ body: [once] })).toBe('A B C');
    });

    test('a smart tag inside a smart tag, and inside a revision', () => {
        const nested = s.parseParagraph(para(`<w:smartTag w:element="a"><w:smartTag w:element="b">${run('x')}</w:smartTag></w:smartTag>`));
        expect(nested.children[0].children[0].type).toBe('smartTag');
        expect(d.toText({ body: [nested] })).toBe('x');
        const ins = s.parseParagraph(para(`<w:ins w:id="1" w:author="A"><w:smartTag w:element="c">${run('y')}</w:smartTag></w:ins>`));
        expect(ins.children[0].children[0].type).toBe('smartTag');
    });
});
