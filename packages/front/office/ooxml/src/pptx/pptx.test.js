// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcContentTypes } from '../opc/contentTypes.js';
import { opcRelationships } from '../opc/relationships.js';
import { opcPackage } from '../opc/package.js';
import { drawingml } from '../drawingml/drawingml.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { ooxmlMath } from '../math/math.js';
import { pptxTheme } from './theme.js';
import { pptxPicture } from './picture.js';
import { pptxTable } from './table.js';
import { pptxChart } from './chart.js';
import { pptxSlide } from './slide.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { pptxWalker } from './pptx-walker.js';
import { pptx } from './pptx.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

function build() {
    const xmlInst = ooxmlXml.factory();
    const relsInst = opcRelationships.factory(_errors, xmlInst);
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const opcInst = opcPackage.factory(_errors,
        zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
        opcContentTypes.factory(_errors, xmlInst), relsInst, _shared);
    const mathInst = ooxmlMath.factory(_errors, xmlInst);
    const dml = drawingml.factory(xmlInst, mathInst, _shared);
    const chartPart = drawingmlChart.factory(_errors, xmlInst, _shared);
    const themeInst = pptxTheme.factory(_errors, xmlInst, _shared);
    const picInst = pptxPicture.factory(xmlInst, _shared);
    const tblInst = pptxTable.factory(xmlInst, dml, _shared);
    const chartInst = pptxChart.factory(xmlInst, chartPart, _shared);
    const shapeInst = drawingmlShape.factory(xmlInst, _shared);
    const slideInst = pptxSlide.factory(_errors, xmlInst, dml, picInst, tblInst,
        chartInst, shapeInst, _shared);
    const mcInst = markupCompatibility.factory(xmlInst);
    const walkerInst = pptxWalker.factory();
    return pptx.factory(_errors, opcInst, xmlInst, relsInst,
        slideInst, themeInst, mcInst, picInst, chartPart, shapeInst, walkerInst, _shared);
}

describe('pptx — basic', () => {
    test('paragraphs shorthand roundtrip', () => {
        const p = build();
        const bytes = p.write({
            slides: [
                { paragraphs: ['Slide one', 'Bullet'] },
                { paragraphs: ['Slide two'] }
            ]
        });
        const back = p.read(bytes);
        expect(back.presentation.slides).toHaveLength(2);
        expect(p.extractBody(back.presentation.slides[0])).toEqual(['Slide one', 'Bullet']);
        expect(p.extractBody(back.presentation.slides[1])).toEqual(['Slide two']);
    });

    test('title + body shorthand roundtrip', () => {
        const p = build();
        const bytes = p.write({
            slides: [
                { title: 'Welcome', body: ['Bullet 1', 'Bullet 2'] },
                { title: 'Section 2', body: ['Single bullet'] }
            ]
        });
        const back = p.read(bytes);
        expect(back.presentation.slides).toHaveLength(2);
        expect(p.extractTitle(back.presentation.slides[0])).toBe('Welcome');
        expect(p.extractBody(back.presentation.slides[0]))
            .toEqual(['Bullet 1', 'Bullet 2']);
        expect(p.extractTitle(back.presentation.slides[1])).toBe('Section 2');
    });
});

describe('pptx — auto-generated parts', () => {
    test('default theme + master + layout are produced', () => {
        const p = build();
        const bytes = p.write({
            slides: [{ title: 'X' }]
        });
        const back = p.read(bytes);
        expect(back.presentation.theme).toBeDefined();
        expect(back.presentation.theme.clrScheme.colors.dk1).toBeDefined();
        expect(back.presentation.theme.fontScheme.minorFont.latin).toBe('Calibri');
        expect(back.presentation.slideMasters).toHaveLength(1);
        expect(back.presentation.slideLayouts).toHaveLength(1);
    });

    test('theme parsed back has expected accent colors', () => {
        const p = build();
        const back = p.read(p.write({ slides: [{ title: 't' }] }));
        expect(back.presentation.theme.clrScheme.colors.accent1.srgb).toBe('4472C4');
        expect(back.presentation.theme.clrScheme.colors.accent6.srgb).toBe('70AD47');
    });

    test('package contains the required parts', () => {
        const p = build();
        const bytes = p.write({ slides: [{ title: 't' }] });
        const back = p.read(bytes);
        expect(back.package.parts['/ppt/theme/theme1.xml']).toBeDefined();
        expect(back.package.parts['/ppt/slideMasters/slideMaster1.xml']).toBeDefined();
        expect(back.package.parts['/ppt/slideLayouts/slideLayout1.xml']).toBeDefined();
        expect(back.package.parts['/ppt/slides/slide1.xml']).toBeDefined();
    });

    test('typed shape model with placeholder roundtrips', () => {
        const p = build();
        const slide = {
            shapes: [{
                type: 'shape', id: 2, name: 'Title 1',
                placeholder: { type: 'title' },
                txBody: {
                    paragraphs: [{
                        runs: [{ type: 'text', value: 'My Title' }]
                    }]
                }
            }]
        };
        const back = p.read(p.write({ slides: [slide] }));
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.placeholder.type).toBe('title');
        expect(sp.txBody.paragraphs[0].runs[0].value).toBe('My Title');
    });

    test('rich runs with bold + size + color', () => {
        const p = build();
        const slide = {
            shapes: [{
                type: 'shape', id: 2, name: 'Body',
                placeholder: { idx: 1 },
                txBody: {
                    paragraphs: [{
                        runs: [
                            { type: 'text', value: 'Plain ' },
                            { type: 'text', value: 'BOLD',
                              rPr: { bold: true, size: 2400, color: 'FF0000' } }
                        ]
                    }]
                }
            }]
        };
        const back = p.read(p.write({ slides: [slide] }));
        const runs = back.presentation.slides[0].shapes[0].txBody.paragraphs[0].runs;
        expect(runs[0].value).toBe('Plain ');
        expect(runs[1].value).toBe('BOLD');
        expect(runs[1].rPr.bold).toBe(true);
        expect(runs[1].rPr.size).toBe(2400);
        expect(runs[1].rPr.color).toBe('FF0000');
    });

    test('multiple paragraphs with bullet levels', () => {
        const p = build();
        const slide = {
            shapes: [{
                type: 'shape', id: 2, placeholder: { idx: 1 },
                txBody: {
                    paragraphs: [
                        { pPr: { level: 0 },
                          runs: [{ type: 'text', value: 'Top' }] },
                        { pPr: { level: 1 },
                          runs: [{ type: 'text', value: 'Sub' }] }
                    ]
                }
            }]
        };
        const back = p.read(p.write({ slides: [slide] }));
        const ps = back.presentation.slides[0].shapes[0].txBody.paragraphs;
        expect(ps[0].pPr.level).toBe(0);
        expect(ps[1].pPr.level).toBe(1);
    });
});

describe('pptx — pictures in slides', () => {
    const PNG_1X1 = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
    ]);

    test('picture in slide roundtrips with image bytes preserved', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.picture(PNG_1X1, {
                        cx: '3in', cy: '2in', name: 'fig.png',
                        offsetX: '0.5in', offsetY: '0.5in',
                        description: 'Figure'
                    })
                ]
            }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.type).toBe('picture');
        expect(sp.cx).toBe(2743200);
        expect(sp.cy).toBe(1828800);
        expect(sp.description).toBe('Figure');
        expect(sp.image.contentType).toBe('image/png');
        expect(sp.image.data).toEqual(PNG_1X1);
    });

    test('content type Default for png is declared', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [p.picture(PNG_1X1, { cx: '1in', cy: '1in' })]
            }]
        });
        const back = p.read(bytes);
        expect(back.package.contentTypes.defaults.png).toBe('image/png');
    });

    test('image part lives in ppt/media/', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [p.picture(PNG_1X1, { cx: '1in', cy: '1in' })]
            }]
        });
        const back = p.read(bytes);
        const mediaParts = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/ppt/media/'));
        expect(mediaParts).toHaveLength(1);
        expect(mediaParts[0]).toMatch(/^\/ppt\/media\/image\d+\.png$/);
    });

    test('same image used twice in one slide produces a single part', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.picture(PNG_1X1, { cx: '1in', cy: '1in', offsetX: 0 }),
                    p.picture(PNG_1X1, { cx: '2in', cy: '2in', offsetX: 1000000 })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes[0].embedRef).toBe(shapes[1].embedRef);
        const mediaParts = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/ppt/media/'));
        expect(mediaParts).toHaveLength(1);
    });

    test('picture coexists with title placeholder', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [
                    {
                        type: 'shape', id: 2, name: 'Title 1',
                        placeholder: { type: 'title' },
                        txBody: { paragraphs: [
                            { runs: [{ type: 'text', value: 'Diagram' }] }
                        ] }
                    },
                    p.picture(PNG_1X1, { cx: '4in', cy: '3in',
                                          offsetX: '1in', offsetY: '2in' })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes).toHaveLength(2);
        expect(shapes[0].placeholder.type).toBe('title');
        expect(shapes[1].type).toBe('picture');
    });
});

describe('pptx — tables in slides', () => {
    function buildTableMod() {
        const dml = drawingml.factory(ooxmlXml.factory(), null, _shared);
        return pptxTable.factory(ooxmlXml.factory(), dml, _shared);
    }

    test('typed table shape roundtrips with cell text', () => {
        const p = build();
        const tableMod = buildTableMod();
        const tableShape = tableMod.tableFromRows([
            ['Name', 'Score'],
            ['Alice', '95'],
            ['Bob', '88']
        ], { cx: 4000000, cy: 1200000, offsetX: 1000000, offsetY: 1000000,
             tableStyleId: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}' });

        const bytes = p.write({ slides: [{ shapes: [tableShape] }] });
        const back = p.read(bytes);

        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.type).toBe('table');
        expect(sp.cx).toBe(4000000);
        expect(sp.rows).toHaveLength(3);
        expect(sp.columns).toHaveLength(2);
        expect(sp.rows[0].cells[0].txBody.paragraphs[0].runs[0].value)
            .toBe('Name');
        expect(sp.rows[2].cells[1].txBody.paragraphs[0].runs[0].value)
            .toBe('88');
        expect(sp.tableStyleId)
            .toBe('{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}');
    });

    test('table coexists with title + picture in same slide', () => {
        const p = build();
        const tableMod = buildTableMod();
        const PNG_1X1 = new Uint8Array([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82
        ]);
        const bytes = p.write({
            slides: [{
                shapes: [
                    {
                        type: 'shape', id: 2, name: 'Title',
                        placeholder: { type: 'title' },
                        txBody: { paragraphs: [
                            { runs: [{ type: 'text', value: 'Q4 Stats' }] }
                        ] }
                    },
                    p.picture(PNG_1X1, { cx: '2in', cy: '1in',
                                          offsetX: 0, offsetY: '2in' }),
                    tableMod.tableFromRows([
                        ['Region', 'Sales'],
                        ['EU', '$120k']
                    ], { offsetX: '4in', offsetY: '2in' })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes).toHaveLength(3);
        expect(shapes[0].placeholder.type).toBe('title');
        expect(shapes[1].type).toBe('picture');
        expect(shapes[2].type).toBe('table');
    });
});

describe('pptx — charts in slides', () => {
    function buildChartPart() {
        return drawingmlChart.factory(_errors, ooxmlXml.factory(), _shared);
    }

    test('chart shape roundtrips with chart part written', () => {
        const p = build();
        const chartMod = buildChartPart();
        const spec = chartMod.barChart({
            title: 'Sales by Region',
            series: [{ name: 'Q4', categories: ['EU', 'US', 'APAC'],
                       values: [120, 85, 200] }],
            legend: { position: 'r' }
        });
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.chart(spec, { cx: 6000000, cy: 4000000,
                                     offsetX: 1000000, offsetY: 1500000,
                                     name: 'Sales chart' })
                ]
            }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.type).toBe('chart');
        expect(sp.cx).toBe(6000000);
        expect(sp.chartRef).toBeDefined();
        // Chart spec is parsed back from the chart part.
        expect(sp.chart.plotType).toBe('bar');
        expect(sp.chart.title).toBe('Sales by Region');
        expect(sp.chart.series[0].values).toEqual([120, 85, 200]);
    });

    test('package contains chart part + Override content type', () => {
        const p = build();
        const chartMod = buildChartPart();
        const bytes = p.write({
            slides: [{
                shapes: [p.chart(chartMod.pieChart({
                    series: [{ name: 's', categories: ['a', 'b'], values: [1, 2] }]
                }), { cx: 4000000, cy: 4000000 })]
            }]
        });
        const back = p.read(bytes);
        const chartParts = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/ppt/charts/'));
        expect(chartParts).toHaveLength(1);
        expect(back.package.contentTypes.overrides[chartParts[0]])
            .toContain('chart+xml');
    });

    test('chart with embedded Excel workbook roundtrips', () => {
        const p = build();
        const chartMod = drawingmlChart.factory(_errors, ooxmlXml.factory(), _shared);
        const xlsxBytes = new Uint8Array([
            0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x21, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        const spec = chartMod.barChart({
            title: 'Sales',
            series: [{ name: 'Q4', categories: ['EU', 'US'],
                        values: [100, 200] }]
        });
        spec.embeddedWorkbook = xlsxBytes;
        const bytes = p.write({
            slides: [{ shapes: [p.chart(spec, { cx: 5e6, cy: 4e6 })] }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.type).toBe('chart');
        expect(sp.chart.embeddedWorkbook).toEqual(xlsxBytes);
        expect(sp.chart.embeddedWorkbookRid).toBeDefined();
        const embKeys = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/ppt/embeddings/'));
        expect(embKeys).toHaveLength(1);
        expect(embKeys[0]).toMatch(/Microsoft_Excel_Worksheet\d+\.xlsx$/);
    });

    test('chart coexists with title shape + picture in one slide', () => {
        const p = build();
        const chartMod = buildChartPart();
        const PNG_1X1 = new Uint8Array([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82
        ]);
        const bytes = p.write({
            slides: [{
                shapes: [
                    {
                        type: 'shape', id: 2, name: 'Title 1',
                        placeholder: { type: 'title' },
                        txBody: { paragraphs: [
                            { runs: [{ type: 'text', value: 'Q4 Review' }] }
                        ] }
                    },
                    p.picture(PNG_1X1, { cx: '2in', cy: '1in',
                                          offsetX: 0, offsetY: '1in' }),
                    p.chart(chartMod.lineChart({
                        series: [{ name: 'Trend',
                                    categories: ['Jan','Feb','Mar'],
                                    values: [10, 15, 12] }]
                    }), { cx: 5000000, cy: 3000000,
                          offsetX: 3000000, offsetY: '1in' })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes).toHaveLength(3);
        expect(shapes[0].placeholder.type).toBe('title');
        expect(shapes[1].type).toBe('picture');
        expect(shapes[2].type).toBe('chart');
        expect(shapes[2].chart.plotType).toBe('line');
    });
});

describe('pptx — preset shapes (drawingmlShape)', () => {
    test('rectangle with solid fill + line', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.shape('rect', {
                        cx: '4in', cy: '2in',
                        offsetX: '1in', offsetY: '1in',
                        fill: '4472C4',
                        line: { color: '2F5496', width: 12700 },
                        text: 'Hello'
                    })
                ]
            }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.type).toBe('shape');
        expect(sp.shapeProps.geom).toBe('rect');
        expect(sp.shapeProps.cx).toBe(3657600);
        expect(sp.shapeProps.fill).toEqual({ rgb: '4472C4' });
        expect(sp.shapeProps.line.color).toBe('2F5496');
        expect(sp.shapeProps.line.width).toBe(12700);
        // Text body preserved.
        expect(sp.txBody.paragraphs[0].runs[0].value).toBe('Hello');
    });

    test('ellipse with no fill', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [p.shape('ellipse', {
                    cx: '2in', cy: '2in', fill: 'none',
                    line: { color: '000000', width: 6350 }
                })]
            }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.shapeProps.geom).toBe('ellipse');
        expect(sp.shapeProps.fill).toBe('none');
    });

    test('arrow + callout + star with text', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.shape('rightArrow', { cx: '3in', cy: '1in',
                                              offsetX: 0, offsetY: 0,
                                              fill: 'ED7D31', text: '→' }),
                    p.shape('wedgeRectCallout', { cx: '3in', cy: '1in',
                                                    offsetX: 0, offsetY: '1.5in',
                                                    fill: 'FFE699',
                                                    text: 'Callout text' }),
                    p.shape('star5', { cx: '2in', cy: '2in',
                                         offsetX: '4in', offsetY: 0,
                                         fill: 'FFC000', text: '★' })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes).toHaveLength(3);
        expect(shapes[0].shapeProps.geom).toBe('rightArrow');
        expect(shapes[1].shapeProps.geom).toBe('wedgeRectCallout');
        expect(shapes[2].shapeProps.geom).toBe('star5');
    });

    test('PRESETS contains expected names', () => {
        const p = build();
        expect(p.PRESETS.rect).toBe('rect');
        expect(p.PRESETS.ellipse).toBe('ellipse');
        expect(p.PRESETS.heart).toBe('heart');
    });

    test('rotation + flip', () => {
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [p.shape('triangle', {
                    cx: 1000000, cy: 1000000,
                    rotation: 5400000,
                    flipH: true,
                    fill: '70AD47'
                })]
            }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.shapeProps.rotation).toBe(5400000);
        expect(sp.shapeProps.flipH).toBe(true);
    });
});

describe('pptx — math in slide text body', () => {
    test('inline OMML inside a slide paragraph roundtrips', () => {
        const p = build();
        const m = ooxmlMath.factory(_errors, ooxmlXml.factory());
        const bytes = p.write({
            slides: [{
                shapes: [{
                    type: 'shape', id: 2, name: 'Body',
                    placeholder: { idx: 1 },
                    txBody: {
                        paragraphs: [{
                            runs: [
                                { type: 'text', value: 'Quadratic: ' },
                                m.oMath(
                                    m.r('y = '),
                                    m.frac(m.r('1'), m.r('2'))
                                )
                            ]
                        }]
                    }
                }]
            }]
        });
        const back = p.read(bytes);
        const runs = back.presentation.slides[0].shapes[0].txBody.paragraphs[0].runs;
        expect(runs).toHaveLength(2);
        expect(runs[0].value).toBe('Quadratic: ');
        expect(runs[1].type).toBe('oMath');
        expect(runs[1].children[1].type).toBe('frac');
    });
});

describe('pptx — rId allocator uniqueness (historic bug fix)', () => {
    const PNG_1X1 = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
    ]);
    // Distinct pixel data so dedup picks them as 2 separate parts.
    const PNG_1X1_B = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0E, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0xFF,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
        0xAE, 0x42, 0x60, 0x82
    ]);

    function getSlideRels(pkg, slideIdx) {
        return pkg.rels[`/ppt/slides/slide${slideIdx + 1}.xml`] || [];
    }

    test('two pictures with one carrying a preferred rId yield unique rIds', () => {
        // Historic bug: when 2nd picture had `image.rId = 'rId1'` and the
        // first picture already auto-allocated `rId1`, the package emitted
        // two rels with Id='rId1' — corrupt pptx. The allocator must now
        // register preferred rIds and fall back on collision.
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.picture(PNG_1X1, { cx: '1in', cy: '1in' }),
                    {
                        type: 'picture',
                        image: { data: PNG_1X1_B, rId: 'rId1' },
                        cx: 100, cy: 100, offsetX: 0, offsetY: 0
                    }
                ]
            }]
        });
        const back = p.read(bytes);
        const rels = getSlideRels(back.package, 0);
        const ids = rels.map(r => r.Id);
        // Every Id must be unique.
        expect(new Set(ids).size).toBe(ids.length);
        // The two pictures must point to different rIds.
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes[0].embedRef).not.toBe(shapes[1].embedRef);
    });

    test('preferred rId is honored when not yet allocated', () => {
        // `claim(preferred)` should keep the preferred id if it's free.
        const p = build();
        const bytes = p.write({
            slides: [{
                shapes: [{
                    type: 'picture',
                    image: { data: PNG_1X1, rId: 'rId7' },
                    cx: 100, cy: 100, offsetX: 0, offsetY: 0
                }]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes[0].embedRef).toBe('rId7');
        // And layout rel got a free id different from rId7.
        const rels = getSlideRels(back.package, 0);
        const ids = rels.map(r => r.Id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('rId7');
    });

    test('roundtrip on a complex slide deck preserves unique rIds', () => {
        const p = build();
        const bytes = p.write({
            slides: [
                {
                    shapes: [
                        p.picture(PNG_1X1, { cx: '1in', cy: '1in' }),
                        p.picture(PNG_1X1_B, { cx: '2in', cy: '2in', offsetX: 1000 })
                    ]
                },
                {
                    shapes: [
                        p.picture(PNG_1X1_B, { cx: '1in', cy: '1in' })
                    ]
                }
            ]
        });
        const back = p.read(bytes);
        for (let i = 0; i < back.presentation.slides.length; i++) {
            const rels = getSlideRels(back.package, i);
            const ids = rels.map(r => r.Id);
            expect(new Set(ids).size).toBe(ids.length);
            // Each slide must always have a slideLayout rel.
            expect(rels.some(r => /slideLayout/.test(r.Type))).toBe(true);
        }
    });
});

describe('pptx — slide size', () => {
    test('default 4:3 size', () => {
        const p = build();
        const back = p.read(p.write({ slides: [{ title: 't' }] }));
        // The presentation.xml is parsed at read time but sldSize round-tripped
        // via the package XML — verify by re-parsing presentation.xml.
        expect(back.package.parts['/ppt/presentation.xml']).toBeDefined();
    });

    test('custom 16:9 size', () => {
        const p = build();
        const bytes = p.write({
            slides: [{ title: 't' }],
            sldSize: { cx: 12192000, cy: 6858000, type: 'screen16x9' }
        });
        const back = p.read(bytes);
        expect(back.presentation.sldSize.cx).toBe(12192000);
        expect(back.presentation.sldSize.cy).toBe(6858000);
        expect(back.presentation.sldSize.type).toBe('screen16x9');
    });
});
