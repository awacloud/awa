// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `opts.pdf.pdfUA` and `opts.pdf.lang` — md → pdf and docx →
 * pdf claiming PDF/UA-1 or PDF/UA-2: the document is built with
 * `pdfBuilder`'s `pdfUA` and its structure API, every drawn item marked
 * with its element (headings, paragraphs, quotes, lists, tables, code,
 * pictures), rules and page numbers artifacts; a picture without alt text
 * an artifact with an `image/decorative` loss; the title from the front
 * matter, else the first heading. The registered default faces embed every
 * font (`@awacloud/oconv-fonts` by relative path, as `pdfa.integration`).
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
import { registerDefaultFaces } from '../../oconv-fonts/src/main.js';
import { fw_require as pdfFwRequire, pkg_require as pdfPkgRequire, modules as pdfModules, extras as pdfExtras } from '../../pdf/src/main.js';

const latin1 = new TextDecoder('latin1');
const dec = new TextDecoder();
const JPEG = new Uint8Array(readFileSync(new URL('./_fixtures/corpus/assets/px.jpg', import.meta.url)));
const MD = [
    '---', 'title: Front title', '---', '',
    '# Head', '', 'Para *em* text.', '', '> Quoted.', '',
    '- one', '- two', '  1. nested', '',
    '```js', 'code', '```', '', '---', '',
    '| a | b |', '|---|---|', '| 1 | 2 |', '',
    '![alt text](px.jpg) ![](px.jpg)', ''
].join('\n');

const pdfRt = new ModuleRuntime();
for (const m of [...pdfFwRequire, ...pdfPkgRequire, ...pdfModules]) pdfRt.register(m);
for (const m of pdfExtras) { try { pdfRt.register(m); } catch { /* already registered */ } }
const pdf = pdfRt.resolve('pdf');
const { validatePdfUa } = pdfRt.resolve('pdfUaTagged');

async function oconvWith(faces) {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    if (faces) await registerDefaultFaces(rt);
    rt.registerAll(modules);
    return rt.resolve('oconv');
}

/**
 * The structure tree of `bytes`: each element as its type, or `[type,
 * ...kids]` when it holds elements; `marks` counts the elements holding
 * marked content, `bare` lists the leaves holding none; `elements` maps a
 * type to its dictionaries.
 */
function treeOf(bytes) {
    const doc = pdf.read(bytes);
    const r = doc._raw.resolve;
    const get = (v) => (v && v.type === 'ref' ? r(v) : v);
    const out = { marks: 0, bare: [], elements: {}, catalog: doc.catalog.raw.entries, get };
    const kidsOf = (e) => (e.K === undefined ? [] : get(e.K).type === 'array' ? get(e.K).items : [e.K]);
    const shape = (ref) => {
        const e = get(ref).entries;
        const type = get(e.S).value;
        (out.elements[type] ||= []).push(e);
        const kids = kidsOf(e);
        const elements = kids.filter((k) => k.type === 'ref' && get(get(k).entries.Type)?.value !== 'MCR');
        const marked = kids.length > elements.length;
        if (marked) out.marks += 1;
        if (!marked && elements.length === 0) out.bare.push(type);
        return elements.length === 0 ? type : [type, ...elements.map(shape)];
    };
    const root = get(out.catalog.StructTreeRoot);
    out.tree = root ? shape(root.entries.K) : null;
    return out;
}

const ua1Tree = ['Document', 'H1', 'P', ['BlockQuote', 'P'],
    ['L', ['LI', 'Lbl', ['LBody', 'P']], ['LI', 'Lbl', ['LBody', 'P', ['L', ['LI', 'Lbl', ['LBody', 'P']]]]]],
    ['P', 'Code'], ['Table', ['TR', ['TH', 'P'], ['TH', 'P']], ['TR', ['TD', 'P'], ['TD', 'P']]], 'Figure'];
const ua2Tree = ['Document', 'H1', 'P', ['Div', 'P'], ua1Tree[4], 'P', ua1Tree[6], 'Figure'];

describe('oconv opts.pdf.pdfUA', () => {
    for (const [part, expected, header] of [[1, ua1Tree, '%PDF-1.7'], [2, ua2Tree, '%PDF-2.0']]) {
        test(`fromMd claims PDF/UA-${part}: the structure, the marks, the artifacts, the title, the language`, async () => {
            const oconv = await oconvWith(true);
            const r = await oconv.fromMd({ markdown: MD, target: 'pdf', assets: { 'px.jpg': JPEG }, opts: { pdf: { pdfUA: part, lang: 'en-GB' } } });
            const t = treeOf(r.bytes);
            expect(latin1.decode(r.bytes.slice(0, 8))).toBe(header);
            expect(t.tree).toEqual(expected);
            expect(t.bare).toEqual([]);
            expect(latin1.decode(t.get(t.elements.Figure[0].Alt).value)).toBe('alt text');
            const th = t.get(t.elements.TH[0].A).entries;
            expect([th.O.value, th.Scope.value]).toEqual(['Table', 'Column']);
            expect(t.elements.L.map((l) => t.get(l.A).entries.ListNumbering.value)).toEqual(['Disc', 'LowerAlpha']);
            expect(latin1.decode(t.get(t.catalog.Lang).value)).toBe('en-GB');
            expect(dec.decode(t.get(t.catalog.Metadata).raw)).toContain('<rdf:li xml:lang="x-default">Front title</rdf:li>');
            const text = latin1.decode(r.bytes);
            expect(text).toContain('/Artifact <</Type /Pagination>> BDC');
            expect(r.losses.filter((l) => l.code === 'image/decorative')).toHaveLength(1);
            expect(validatePdfUa(pdf.read(r.bytes), { part }).errors).toEqual([]);
        });
    }

    test('the title falls back to the first heading; with neither the request is refused', async () => {
        const oconv = await oconvWith(true);
        const opts = { pdf: { pdfUA: 2, lang: 'fr' } };
        const r = await oconv.fromMd({ markdown: 'Intro.\n\n## Second *level*\n', target: 'pdf', opts });
        const t = treeOf(r.bytes);
        expect(dec.decode(t.get(t.catalog.Metadata).raw)).toContain('<rdf:li xml:lang="x-default">Second level</rdf:li>');
        expect(t.tree).toEqual(['Document', 'P', 'H2']);
        await expect(oconv.fromMd({ markdown: 'No heading.\n', target: 'pdf', opts }))
            .rejects.toThrow('oconv: pdf/UA needs a title (front matter or a heading)');
    });

    test('convert docx -> pdf claims the part and tags the document', async () => {
        const oconv = await oconvWith(true);
        const bytes = new Uint8Array(readFileSync(new URL('./_fixtures/corpus/docx/docx-smoke.docx', import.meta.url)));
        const out = await oconv.convert({ name: 'x.docx', bytes, target: 'pdf', opts: { pdf: { pdfUA: 1, lang: 'en' } } });
        expect(treeOf(out.bytes).tree[0]).toBe('Document');
        expect(validatePdfUa(pdf.read(out.bytes), { part: 1 }).errors).toEqual([]);
    });

    test('bad options, missing faces, and nothing written without pdfUA', async () => {
        const oconv = await oconvWith(true);
        const md = '# T\n';
        const refuse = (pdfOpts, message) => expect(oconv.fromMd({ markdown: md, target: 'pdf', opts: { pdf: pdfOpts } })).rejects.toThrow(message);
        await refuse({ pdfUA: 1 }, 'oconv: bad pdf option lang');
        await refuse({ pdfUA: 1, lang: '' }, 'oconv: bad pdf option lang');
        await refuse({ lang: 'en' }, 'oconv: bad pdf option lang');
        for (const bad of [0, 3, '1', true]) await refuse({ pdfUA: bad, lang: 'en' }, 'oconv: bad pdf option pdfUA');
        await refuse({ pdfUA: 1, lang: 'en', pdfA: '4' }, 'oconv: bad pdf option pdfUA');
        const bare = await oconvWith(false);
        await expect(bare.fromMd({ markdown: md, target: 'pdf', opts: { pdf: { pdfUA: 1, lang: 'en' } } }))
            .rejects.toThrow(/^oconv: pdf\/UA needs embedded faces \(/);
        const plain = await oconv.fromMd({ markdown: MD, target: 'pdf', assets: { 'px.jpg': JPEG } });
        expect(treeOf(plain.bytes).tree).toBeNull();
        expect(latin1.decode(plain.bytes)).not.toContain('/Artifact');
        expect(plain.losses.some((l) => l.code === 'image/decorative')).toBe(false);
    });
});
