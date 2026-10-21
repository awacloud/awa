// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — the opt-in `slideExtrasByPart` read option keeps the leftovers
 * of `<p:cSld>` (`cSldExtras`) apart from those of the slide root
 * (`_extras`), so neither overwrites the other and the writer puts each
 * where it came from. Without the option the 1.0.0 model is unchanged.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const slideMod = rt.resolve('pptxSlide');
const p = rt.resolve('pptx');
const opc = rt.resolve('opcPackage');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const SP_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>';
const CSLD_EXT = '<p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"/></p:extLst>';
const ROOT_EXT = '<p:extLst><p:ext uri="{root}"/></p:extLst>';
const slideXml = (cSldTail, rootTail) => `<p:sld ${NS}><p:cSld>${SP_TREE}${cSldTail}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${rootTail}</p:sld>`;
const SPLIT = { slideExtrasByPart: true };

const names = (list) => (list || []).map(e => e.name);
const kids = (node) => node.children.filter(c => c.type === 'element').map(c => c.name);
const cSldOf = (root) => root.children.find(c => c.name === 'p:cSld');
const exts = (node) => node.children.filter(c => c.name === 'p:extLst').map(e => e.children[0].attrs.uri);

describe('pptx slide — slideExtrasByPart on read', () => {
    test('both levels keep their leftovers: nothing is overwritten', () => {
        const s = slideMod.parseSlide(slideXml(`<p:custDataLst/>${CSLD_EXT}`, `<p:timing/>${ROOT_EXT}`), SPLIT);
        expect(names(s.cSldExtras)).toEqual(['p:custDataLst', 'p:extLst']);
        expect(names(s._extras)).toEqual(['p:timing', 'p:extLst']);
    });

    test('cSldExtras is present and empty when p:cSld has no leftovers; _extras absent when the root has none', () => {
        const s = slideMod.parseSlide(slideXml('', ''), SPLIT);
        expect(s.cSldExtras).toEqual([]);
        expect(s._extras).toBeUndefined();
    });

    test('layouts and masters split too', () => {
        const layout = slideMod.parseSlideLayout(`<p:sldLayout ${NS}><p:cSld>${SP_TREE}${CSLD_EXT}</p:cSld></p:sldLayout>`, SPLIT);
        expect(names(layout.cSldExtras)).toEqual(['p:extLst']);
        expect(layout._extras).toBeUndefined();
        const master = slideMod.parseSlideMaster(`<p:sldMaster ${NS}><p:cSld>${SP_TREE}</p:cSld><p:clrMap/><p:hf/></p:sldMaster>`, SPLIT);
        expect(master.cSldExtras).toEqual([]);
        expect(names(master._extras)).toEqual(['p:hf']);
    });

    test('without the option the 1.0.0 model is unchanged (the root overwrites p:cSld)', () => {
        for (const opts of [undefined, {}, { slideExtrasByPart: false }]) {
            const s = slideMod.parseSlide(slideXml(CSLD_EXT, '<p:timing/>'), opts);
            expect(s.cSldExtras).toBeUndefined();
            expect(names(s._extras)).toEqual(['p:timing']);
            const only = slideMod.parseSlide(slideXml(CSLD_EXT, ''), opts);
            expect(names(only._extras)).toEqual(['p:extLst']);
        }
    });
});

describe('pptx slide — the writer places a split model by origin', () => {
    test('each p:extLst is written once, at its own level, in schema order', () => {
        const s = slideMod.parseSlide(slideXml(`${CSLD_EXT}<p:custDataLst/>`, `${ROOT_EXT}<p:timing/>`), SPLIT);
        const root = xml.parse(slideMod.serializeSlide(s));
        expect(kids(root)).toEqual(['p:cSld', 'p:clrMapOvr', 'p:timing', 'p:extLst']);
        expect(exts(root)).toEqual(['{root}']);
        expect(kids(cSldOf(root))).toEqual(['p:spTree', 'p:custDataLst', 'p:extLst']);
        expect(exts(cSldOf(root))).toEqual(['{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}']);
    });

    test('an empty cSldExtras keeps a root p:extLst out of p:cSld', () => {
        const s = slideMod.parseSlide(slideXml('', ROOT_EXT), SPLIT);
        const root = xml.parse(slideMod.serializeSlide(s));
        expect(kids(cSldOf(root))).toEqual(['p:spTree']);
        expect(exts(root)).toEqual(['{root}']);
    });

    test('a split model given misplaced elements still never writes them at the wrong level', () => {
        const s = { type: 'slide', shapes: [], cSldExtras: [xml.el('p:timing', {}), xml.el('p:controls', {})], _extras: [xml.el('p:custDataLst', {}), xml.el('p:transition', {})] };
        const root = xml.parse(slideMod.serializeSlide(s));
        expect(kids(root)).toEqual(['p:cSld', 'p:transition']);
        expect(kids(cSldOf(root))).toEqual(['p:spTree', 'p:controls']);
    });

    test('a split read, write and split read is stable', () => {
        const once = slideMod.serializeSlide(slideMod.parseSlide(slideXml(CSLD_EXT, `<p:timing/>${ROOT_EXT}`), SPLIT));
        const again = slideMod.parseSlide(once, SPLIT);
        expect(names(again.cSldExtras)).toEqual(['p:extLst']);
        expect(names(again._extras)).toEqual(['p:timing', 'p:extLst']);
        expect(slideMod.serializeSlide(again)).toBe(once);
    });

    test('a model without cSldExtras is written as before (A47 routing)', () => {
        const s = slideMod.parseSlide(slideXml(CSLD_EXT, ''));
        const root = xml.parse(slideMod.serializeSlide(s));
        expect(exts(cSldOf(root))).toEqual(['{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}']);
        expect(exts(root)).toEqual(['{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}']);
    });
});

describe('pptx — slideExtrasByPart through pptx.read and pptx.write', () => {
    test('a deck read with the option keeps both levels and writes each once; typedRunColors still applies', () => {
        const pkg = opc.read(p.write({ slides: [{ title: 'one' }] }));
        const part = '/ppt/slides/slide1.xml';
        const text = decoder.decode(pkg.parts[part])
            .replace('</p:spTree></p:cSld>', `</p:spTree>${CSLD_EXT}</p:cSld>`)
            .replace('</p:sld>', '<p:timing/></p:sld>')
            .replace('<a:r><a:t>one</a:t>', '<a:r><a:rPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr><a:t>one</a:t>');
        expect(text).toContain('<a:schemeClr val="accent1"/>');
        expect(text).toContain(CSLD_EXT);
        pkg.parts[part] = encoder.encode(text);
        const bytes = opc.write(pkg);
        const deck = p.read(bytes, { slideExtrasByPart: true, typedRunColors: true }).presentation;
        const slide = deck.slides[0];
        expect(names(slide.cSldExtras)).toEqual(['p:extLst']);
        expect(names(slide._extras)).toEqual(['p:timing']);
        expect(slide.shapes[0].txBody.paragraphs[0].runs[0].rPr.color.schemeColor).toBe('accent1');
        expect(Array.isArray(deck.slideLayouts[0].cSldExtras)).toBe(true);
        expect(Array.isArray(deck.slideMasters[0].cSldExtras)).toBe(true);
        const out = xml.parse(decoder.decode(opc.read(p.write(deck)).parts[part]));
        expect(kids(out)).toEqual(['p:cSld', 'p:timing']);
        expect(kids(cSldOf(out))).toEqual(['p:spTree', 'p:extLst']);
        expect(p.read(bytes).presentation.slides[0].cSldExtras).toBeUndefined();
    });
});
