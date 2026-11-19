// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The builder's structure API: `openElement`, `markContent`
 * and `closeElement` declare the logical structure of a tagged document;
 * `build()` writes the structure tree, the elements with their
 * marked-content references, the ParentTree and the pages' StructParents,
 * and under PDF/UA-2 the PDF 2.0 namespace.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';

const rt = new ModuleRuntime();
// T30 (g2), D53: pdfBuilder declares fonts' Standard 14 lookups, so the
// runtime takes the README's composition, pkg_require included.
for (const m of [...fw_require, ...pkg_require, ...modules]) rt.register(m);
const pdf = rt.resolve('pdf');
const { builder } = rt.resolve('pdfBuilder');
const { ContractError, RenderError } = rt.resolve('pdfErrors');
const latin1 = new TextDecoder('latin1');
const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };

/** A reader over `bytes`: `get` resolves a reference, `name` / `text` / `refNum` read a value. */
function readerOf(bytes) {
    const doc = pdf.read(bytes);
    const r = doc._raw.resolve;
    const get = (v) => (v && v.type === 'ref' ? r(v) : v);
    return {
        doc, get,
        catalog: doc.catalog.raw.entries,
        name: (v) => get(v).value,
        text: (v) => latin1.decode(get(v).value),
        refNum: (v) => v.num,
        items: (v) => (get(v).type === 'array' ? get(v).items : [v]),
        /** The pages as `{ num, entries }`, in order. */
        pages: () => get(get(doc.catalog.raw.entries.Pages).entries.Kids).items.map((k) => ({ num: k.num, entries: get(k).entries }))
    };
}

/** One page, a Document holding a P with one marked-content sequence. */
function onePara(opts) {
    const b = builder(opts).addMetadata({ Title: 'T' }).addPage().openElement('Document').openElement('P', { lang: 'fr' });
    const mcid = b.markContent();
    b.addContent(`/P <</MCID ${mcid}>> BDC 0 0 m EMC`);
    return { b: b.closeElement().closeElement(), mcid };
}

describe('builder structure API', () => {
    test('the tree: StructTreeRoot, the elements, the ParentTree, StructParents, MarkInfo', () => {
        const { b, mcid } = onePara();
        expect(mcid).toBe(0);
        const x = readerOf(b.build());
        expect(x.get(x.get(x.catalog.MarkInfo).entries.Marked).value).toBe(true);
        const root = x.get(x.catalog.StructTreeRoot).entries;
        expect(x.name(root.Type)).toBe('StructTreeRoot');
        expect(x.get(root.ParentTreeNextKey).value).toBe(1);
        const document = x.get(root.K).entries;
        expect(x.name(document.Type)).toBe('StructElem');
        expect(x.name(document.S)).toBe('Document');
        expect(x.refNum(document.P)).toBe(x.catalog.StructTreeRoot.num);
        const pRef = document.K;
        const p = x.get(pRef).entries;
        expect(x.name(p.S)).toBe('P');
        expect(x.refNum(p.P)).toBe(root.K.num);
        expect(x.get(p.K).value).toBe(0);
        expect(x.text(p.Lang)).toBe('fr');
        const [page] = x.pages();
        expect(x.refNum(p.Pg)).toBe(page.num);
        expect(x.refNum(document.Pg)).toBe(page.num);
        expect(x.get(page.entries.StructParents).value).toBe(0);
        const nums = x.get(x.get(root.ParentTree).entries.Nums).items;
        expect(x.get(nums[0]).value).toBe(0);
        expect(x.items(nums[1]).map(x.refNum)).toEqual([pRef.num]);
        expect(root.Namespaces).toBeUndefined();
        expect(p.NS).toBeUndefined();
    });

    test('per-page MCIDs, an element over two pages holds an MCR, several kids in an array', () => {
        const b = builder().addPage().openElement('Document').openElement('P');
        const m0 = b.markContent();
        const m1 = b.markContent();
        b.addContent(`/P <</MCID ${m0}>> BDC EMC /P <</MCID ${m1}>> BDC EMC`);
        b.addPage();
        const m2 = b.markContent();
        b.addContent(`/P <</MCID ${m2}>> BDC EMC`);
        b.closeElement().openElement('Figure', { alt: 'A square', attributes: [{ O: 'Layout', BBox: 0 }, { O: 'Table', Scope: 'Column', RowSpan: 2, Checked: true }] });
        const m3 = b.markContent();
        b.addContent(`/Figure <</MCID ${m3}>> BDC EMC`).closeElement().closeElement();
        expect([m0, m1, m2, m3]).toEqual([0, 1, 0, 1]);
        const x = readerOf(b.build());
        const [page1, page2] = x.pages();
        const document = x.get(x.get(x.catalog.StructTreeRoot).entries.K).entries;
        const [pRef, figRef] = x.items(document.K);
        const p = x.get(pRef).entries;
        expect(x.refNum(p.Pg)).toBe(page1.num);
        const kids = x.items(p.K);
        expect(kids.slice(0, 2).map((k) => x.get(k).value)).toEqual([0, 1]);
        const mcr = x.get(kids[2]).entries;
        expect(x.name(mcr.Type)).toBe('MCR');
        expect(x.refNum(mcr.Pg)).toBe(page2.num);
        expect(x.get(mcr.MCID).value).toBe(0);
        const fig = x.get(figRef).entries;
        expect(x.refNum(fig.Pg)).toBe(page2.num);
        expect(x.text(fig.Alt)).toBe('A square');
        const [layout, table] = x.items(fig.A).map((a) => x.get(a).entries);
        expect(x.name(layout.O)).toBe('Layout');
        expect(x.get(layout.BBox).value).toBe(0);
        expect([x.name(table.O), x.name(table.Scope), x.get(table.RowSpan).value, x.get(table.Checked).value]).toEqual(['Table', 'Column', 2, true]);
        expect(x.get(page1.entries.StructParents).value).toBe(0);
        expect(x.get(page2.entries.StructParents).value).toBe(1);
        const root = x.get(x.catalog.StructTreeRoot).entries;
        expect(x.get(root.ParentTreeNextKey).value).toBe(2);
        const nums = x.get(x.get(root.ParentTree).entries.Nums).items;
        expect(x.items(nums[1]).map(x.refNum)).toEqual([pRef.num, pRef.num]);
        expect(x.get(nums[2]).value).toBe(1);
        expect(x.items(nums[3]).map(x.refNum)).toEqual([pRef.num, figRef.num]);
    });

    test('one attribute object is written as a dictionary, several top elements as an array', () => {
        const b = builder().addPage().openElement('L', { attributes: [{ O: 'List', ListNumbering: 'Unordered' }] });
        b.addContent(`/L <</MCID ${b.markContent()}>> BDC EMC`);
        b.closeElement().openElement('P');
        b.addContent(`/P <</MCID ${b.markContent()}>> BDC EMC`);
        b.closeElement();
        const x = readerOf(b.build());
        const tops = x.items(x.get(x.catalog.StructTreeRoot).entries.K);
        expect(tops.map((t) => x.name(x.get(t).entries.S))).toEqual(['L', 'P']);
        const a = x.get(x.get(tops[0]).entries.A);
        expect(a.type).toBe('dict');
        expect(x.name(a.entries.ListNumbering)).toBe('Unordered');
    });

    test('under PDF/UA-2 every element and the root carry the PDF 2.0 namespace; not under PDF/UA-1', () => {
        const x = readerOf(onePara({ pdfUA: 2, lang: 'en' }).b.build());
        const root = x.get(x.catalog.StructTreeRoot).entries;
        const [nsRef] = x.items(root.Namespaces);
        const ns = x.get(nsRef).entries;
        expect(x.name(ns.Type)).toBe('Namespace');
        expect(x.text(ns.NS)).toBe('http://iso.org/pdf2/ssn');
        const document = x.get(root.K).entries;
        expect(x.refNum(document.NS)).toBe(nsRef.num);
        expect(x.refNum(x.get(document.K).entries.NS)).toBe(nsRef.num);
        const ua1 = readerOf(onePara({ pdfUA: 1, lang: 'en' }).b.build());
        expect(ua1.get(ua1.catalog.StructTreeRoot).entries.Namespaces).toBeUndefined();
    });

    test('misuse is refused with typed errors', () => {
        const code = (fn, Type = ContractError) => { const e = thrown(fn); expect(e).toBeInstanceOf(Type); return e.code; };
        for (const t of ['', '1P', 'H 1', '/P', 7, undefined]) expect(code(() => builder().openElement(t))).toBe('pdf/builder/bad-struct-type');
        for (const props of [7, { alt: 1 }, { lang: {} }, { attributes: {} }, { attributes: [{}] }, { attributes: [{ O: 'T', S: {} }] },
            { attributes: [{ O: 'T', S: Infinity }] }, { attributes: [null] }]) {
            expect(code(() => builder().openElement('P', props))).toBe('pdf/builder/bad-struct-props');
        }
        expect(code(() => builder().openElement('P').markContent(), RenderError)).toBe('pdf/builder/no-page');
        expect(code(() => builder().addPage().markContent())).toBe('pdf/builder/no-open-element');
        expect(code(() => builder().closeElement())).toBe('pdf/builder/no-open-element');
        expect(code(() => builder().addPage().openElement('P').build())).toBe('pdf/builder/open-element');
    });

    test('without an element nothing changes', () => {
        const plain = builder().addPage().addContent('0 0 m').build();
        const x = readerOf(plain);
        expect(x.catalog.StructTreeRoot).toBeUndefined();
        expect(x.catalog.MarkInfo).toBeUndefined();
        expect(x.pages()[0].entries.StructParents).toBeUndefined();
    });
});
