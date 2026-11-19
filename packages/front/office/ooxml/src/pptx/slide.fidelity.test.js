// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — a slide, layout or master part is written back as read (T62
 * (c)): `p:spPr`'s `bwMode`, the root's attributes (a layout's `type` as
 * `layoutType`), and a `p:extLst` written once, where it was read.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const slide = rt.resolve('pptxSlide');
const props = rt.resolve('docxProperties');

const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr bwMode="auto"/>'
    + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>x</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>';
const EXT = (uri) => `<p:extLst><p:ext uri="${uri}"><x/></p:ext></p:extLst>`;
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const same = (text, parse, serialize) => {
    const src = xml.parse(text);
    const model = parse(src, {});
    return [props.sameElement(noNs(xml.parse(serialize(model))), noNs(src)), model];
};

describe('a slide part written back as read', () => {
    test('p:spPr\'s bwMode', () => {
        const [ok, model] = same(`<p:sld ${NS}><p:cSld>${TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`, slide.parseSlide, slide.serializeSlide);
        expect(model.shapes[0].shapeProps.bwMode).toBe('auto');
        expect(ok).toBe(true);
    });
    test('a layout\'s type and its other root attributes', () => {
        const [ok, model] = same(`<p:sldLayout ${NS} type="title" preserve="1" showMasterSp="0" matchingName="M"><p:cSld name="Title Slide">${TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
            slide.parseSlideLayout, slide.serializeSlideLayout);
        expect([model.layoutType, model.rootAttrs]).toEqual(['title', { preserve: '1', showMasterSp: '0', matchingName: 'M' }]);
        expect(ok).toBe(true);
    });
    test('a slide\'s and a master\'s root attributes', () => {
        const [okSlide, s] = same(`<p:sld ${NS} show="0" showMasterPhAnim="0"><p:cSld>${TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`, slide.parseSlide, slide.serializeSlide);
        expect(s.rootAttrs).toEqual({ show: '0', showMasterPhAnim: '0' });
        expect(okSlide).toBe(true);
        const [okMaster] = same(`<p:sldMaster ${NS} preserve="1"><p:cSld>${TREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>`,
            slide.parseSlideMaster, slide.serializeSlideMaster);
        expect(okMaster).toBe(true);
    });
    test('a p:extLst read in p:cSld alone is written there alone', () => {
        const [ok, model] = same(`<p:sld ${NS}><p:cSld>${TREE}${EXT('{C}')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`, slide.parseSlide, slide.serializeSlide);
        expect(model.cSldExtras).toBeUndefined();
        expect(model._extras.map((c) => c.name)).toEqual(['p:extLst']);
        expect(ok).toBe(true);
    });
    test('p:cSld\'s and the root\'s p:extLst, each written once where it was read', () => {
        const [ok, model] = same(`<p:sld ${NS}><p:cSld>${TREE}${EXT('{C}')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${EXT('{R}')}</p:sld>`, slide.parseSlide, slide.serializeSlide);
        expect(model.cSldExtras.map((c) => c.children[0].attrs.uri)).toEqual(['{C}']);
        expect(model._extras.map((c) => c.children[0].attrs.uri)).toEqual(['{R}']);
        expect(ok).toBe(true);
    });
    test('a root-only element a model gives in _extras still goes to the root', () => {
        const out = xml.parse(slide.serializeSlide({ shapes: [], _extras: [xml.el('p:transition', { spd: 'slow' })] }));
        expect(out.children.filter((c) => c.type === 'element').map((c) => c.name)).toEqual(['p:cSld', 'p:transition']);
    });
});
