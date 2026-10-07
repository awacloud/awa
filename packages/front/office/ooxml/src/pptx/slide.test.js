// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingml } from '../drawingml/drawingml.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { pptxPicture } from './picture.js';
import { pptxTable } from './table.js';
import { pptxChart } from './chart.js';
import { pptxSlide } from './slide.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const dml = drawingml.factory(xml, null, _shared);
const picMod = pptxPicture.factory(xml, _shared);
const tblMod = pptxTable.factory(xml, dml, _shared);
const chartPart = drawingmlChart.factory(_errors, xml, _shared);
const chartMod = pptxChart.factory(xml, chartPart, _shared);
const shapeMod = drawingmlShape.factory(xml, _shared);
const slide = pptxSlide.factory(_errors, xml, dml, picMod, tblMod, chartMod, shapeMod, _shared);

describe('pptxSlide — shape', () => {
    test('parseShape extracts placeholder + title text', () => {
        const xmlText = '<?xml version="1.0"?>'
            + '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
            + '       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
            + '       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            + '<p:cSld><p:spTree>'
            + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            + '<p:grpSpPr/>'
            + '<p:sp>'
            + '<p:nvSpPr>'
            + '<p:cNvPr id="2" name="Title 1"/>'
            + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            + '<p:nvPr><p:ph type="title"/></p:nvPr>'
            + '</p:nvSpPr>'
            + '<p:spPr/>'
            + '<p:txBody><a:bodyPr/><a:lstStyle/>'
            + '<a:p><a:r><a:t>My Title</a:t></a:r></a:p>'
            + '</p:txBody>'
            + '</p:sp>'
            + '</p:spTree></p:cSld>'
            + '</p:sld>';
        const obj = slide.parseSlide(xmlText);
        const sp = obj.shapes[0];
        expect(sp.id).toBe(2);
        expect(sp.name).toBe('Title 1');
        expect(sp.placeholder).toEqual({ type: 'title' });
        expect(sp.txBody.paragraphs[0].runs[0].value).toBe('My Title');
    });

    test('fromTitleBody builds a typed slide', () => {
        const s = slide.fromTitleBody({ title: 'Hello',
                                         body: ['line 1', 'line 2'] });
        expect(s.shapes).toHaveLength(2);
        expect(s.shapes[0].placeholder).toEqual({ type: 'title' });
        expect(s.shapes[1].placeholder).toEqual({ idx: 1 });
        expect(s.shapes[1].txBody.paragraphs).toHaveLength(2);
    });

    test('serializeSlide / parseSlide roundtrip preserves shape', () => {
        const slideObj = slide.fromTitleBody({ title: 'T',
                                                body: ['a', 'b'] });
        const back = slide.parseSlide(slide.serializeSlide(slideObj));
        expect(slide.extractTitle(back)).toBe('T');
        expect(slide.extractBody(back)).toEqual(['a', 'b']);
    });

    test('slide layout type attribute roundtrip', () => {
        const layout = {
            type: 'slideLayout',
            layoutType: 'title',
            cSldName: 'Title Slide',
            shapes: [],
            clrMapOvr: xml.el('p:clrMapOvr', {}, [
                xml.el('a:masterClrMapping', {})
            ])
        };
        const xmlText = slide.serializeSlideLayout(layout);
        expect(xmlText).toContain('type="title"');
        const back = slide.parseSlideLayout(xmlText);
        expect(back).toBeDefined();
    });
});

describe('drawingml text body — via pptxSlide', () => {
    test('rich rPr roundtrip (bold + size + color + font)', () => {
        const slideObj = {
            shapes: [{
                type: 'shape', id: 2, name: 'Body',
                placeholder: { idx: 1 },
                txBody: {
                    paragraphs: [{
                        runs: [{
                            type: 'text', value: 'Stylish',
                            rPr: { bold: true, italic: true,
                                   underline: 'sng', size: 3200,
                                   color: '00FF00', font: 'Arial',
                                   lang: 'en-US' }
                        }]
                    }]
                }
            }]
        };
        const back = slide.parseSlide(slide.serializeSlide(slideObj));
        const r = back.shapes[0].txBody.paragraphs[0].runs[0];
        expect(r.rPr.bold).toBe(true);
        expect(r.rPr.italic).toBe(true);
        expect(r.rPr.underline).toBe('sng');
        expect(r.rPr.size).toBe(3200);
        expect(r.rPr.color).toBe('00FF00');
        expect(r.rPr.font).toBe('Arial');
        expect(r.rPr.lang).toBe('en-US');
    });

    test('paragraph properties (level + align + bullet) roundtrip', () => {
        const slideObj = {
            shapes: [{
                type: 'shape', id: 2, placeholder: { idx: 1 },
                txBody: {
                    paragraphs: [
                        { pPr: { level: 1, align: 'ctr',
                                  bullet: { char: '•' } },
                          runs: [{ type: 'text', value: 'centered' }] },
                        { pPr: { bullet: 'none' },
                          runs: [{ type: 'text', value: 'no bullet' }] },
                        { pPr: { bullet: { autoNumType: 'arabicPeriod' } },
                          runs: [{ type: 'text', value: 'numbered' }] }
                    ]
                }
            }]
        };
        const back = slide.parseSlide(slide.serializeSlide(slideObj));
        const ps = back.shapes[0].txBody.paragraphs;
        expect(ps[0].pPr.level).toBe(1);
        expect(ps[0].pPr.align).toBe('ctr');
        expect(ps[0].pPr.bullet).toEqual({ char: '•' });
        expect(ps[1].pPr.bullet).toBe('none');
        expect(ps[2].pPr.bullet).toEqual({ autoNumType: 'arabicPeriod' });
    });
});
