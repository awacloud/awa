// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — the slide / layout / master writers put each preserved element
 * where the schema places it: the slide-level ones (`p:transition`,
 * `p:timing`, `p:hf`) at the root and never inside `p:cSld`, the
 * `p:cSld`-only ones (`p:custDataLst`, `p:controls`) inside `p:cSld` and
 * never at the root, each list in schema order (pml.xsd `CT_Slide`,
 * `CT_SlideLayout`, `CT_SlideMaster`, `CT_CommonSlideData`).
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';
import { pptxSlide } from './slide.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const slideMod = rt.resolve('pptxSlide');
const p = rt.resolve('pptx');
const opc = rt.resolve('opcPackage');
const decoder = new TextDecoder();

const el = (name, kids = []) => xml.el(name, {}, kids);
const names = (node) => node.children.filter(c => c.type === 'element').map(c => c.name);
const rootOf = (text) => xml.parse(text);
const cSldOf = (root) => root.children.find(c => c.name === 'p:cSld');
const shapes = [{ type: 'shape', id: 2, name: 'T', placeholder: { type: 'title' }, txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'x' }] }] } }];

describe('pptx slide — slide-level elements stay at the root', () => {
    test('p:transition and p:timing are written once, after p:clrMapOvr', () => {
        const root = rootOf(slideMod.serializeSlide({ type: 'slide', shapes, clrMapOvr: el('p:clrMapOvr'), _extras: [el('p:timing'), el('p:transition')] }));
        expect(names(root)).toEqual(['p:cSld', 'p:clrMapOvr', 'p:transition', 'p:timing']);
        expect(names(cSldOf(root))).toEqual(['p:spTree']);
    });

    test('an mc:AlternateContent holding a transition is placed as the transition', () => {
        const alt = el('mc:AlternateContent', [el('mc:Choice', [el('p:transition')]), el('mc:Fallback', [el('p:transition')])]);
        const root = rootOf(slideMod.serializeSlide({ type: 'slide', shapes, _extras: [alt] }));
        expect(names(root)).toEqual(['p:cSld', 'mc:AlternateContent']);
        expect(names(cSldOf(root))).toEqual(['p:spTree']);
    });

    test('a master writes transition, timing and hf before txStyles', () => {
        const root = rootOf(slideMod.serializeSlideMaster({
            type: 'slideMaster', shapes, clrMap: el('p:clrMap'), layoutIds: [{ id: '2147483649', rId: 'rId1' }],
            txStyles: el('p:txStyles'), _extras: [el('p:hf'), el('p:timing'), el('p:transition')]
        }));
        expect(names(root)).toEqual(['p:cSld', 'p:clrMap', 'p:sldLayoutIdLst', 'p:transition', 'p:timing', 'p:hf', 'p:txStyles']);
        expect(names(cSldOf(root))).toEqual(['p:spTree']);
    });

    test('a layout writes hf after timing', () => {
        const root = rootOf(slideMod.serializeSlideLayout({ type: 'slideLayout', shapes, _extras: [el('p:hf'), el('p:timing')] }));
        expect(names(root)).toEqual(['p:cSld', 'p:timing', 'p:hf']);
    });
});

describe('pptx slide — p:cSld-only elements stay in p:cSld', () => {
    test('custDataLst and controls are written once, inside p:cSld, in schema order', () => {
        const root = rootOf(slideMod.serializeSlide({ type: 'slide', shapes, _extras: [el('p:controls'), el('p:custDataLst')] }));
        expect(names(root)).toEqual(['p:cSld']);
        expect(names(cSldOf(root))).toEqual(['p:spTree', 'p:custDataLst', 'p:controls']);
    });

    test('p:extLst and unknown names keep their old placement (both places)', () => {
        const root = rootOf(slideMod.serializeSlide({ type: 'slide', shapes, _extras: [el('p:extLst'), el('p:zz')] }));
        expect(names(root)).toEqual(['p:cSld', 'p:extLst', 'p:zz']);
        expect(names(cSldOf(root))).toEqual(['p:spTree', 'p:extLst', 'p:zz']);
    });

    test('renderCSld alone keeps a parsed p:cSld\'s own children', () => {
        const parsed = slideMod.parseCSld(xml.parse('<p:cSld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:spTree/><p:custDataLst/><p:extLst/></p:cSld>'));
        expect(names(slideMod.renderCSld(parsed))).toEqual(['p:spTree', 'p:custDataLst', 'p:extLst']);
    });
});

describe('pptx slide — round trip and compatibility', () => {
    test('a presentation read and written puts the transition at the root once; a second write is stable', () => {
        const once = p.write({ slides: [{ type: 'slide', shapes, clrMapOvr: el('p:clrMapOvr', [el('a:masterClrMapping')]), _extras: [el('p:transition')] }] });
        const slideXml = (b) => decoder.decode(opc.read(b).parts['/ppt/slides/slide1.xml']);
        const root = rootOf(slideXml(once));
        expect(names(root)).toEqual(['p:cSld', 'p:clrMapOvr', 'p:transition']);
        expect(names(cSldOf(root))).toEqual(['p:spTree']);
        const back = p.read(once).presentation;
        expect(back.slides[0]._extras.map(e => e.name)).toEqual(['p:transition']);
        expect(slideXml(p.write(back))).toBe(slideXml(once));
    });

    test('a hand-wired pptxSlide without the ordering helper routes but keeps the old order', () => {
        const { orderBySequence: _o, sequence: _s, ...older } = rt.resolve('ooxmlShared');
        const deps = ['ooxmlErrors', 'xml', 'drawingml', 'pptxPicture', 'pptxTable', 'pptxChart', 'drawingmlShape'].map(n => rt.resolve(n));
        const mod = pptxSlide.factory(...deps, older);
        const root = rootOf(mod.serializeSlideMaster({
            type: 'slideMaster', shapes, clrMap: el('p:clrMap'), txStyles: el('p:txStyles'), _extras: [el('p:timing'), el('p:controls')]
        }));
        expect(names(root)).toEqual(['p:cSld', 'p:clrMap', 'p:txStyles', 'p:timing']);
        expect(names(cSldOf(root))).toEqual(['p:spTree', 'p:controls']);
    });
});
