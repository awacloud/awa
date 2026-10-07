// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — wires the ooxml factories through fw's `ModuleRuntime`
 * and verifies that read(write(doc)) produces a structurally equivalent
 * document for each supported format.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import * as ooxmlMods from '../src/main.js';

// `@awacloud/fw` default export touches `window` (logger init) which isn't
// available in Bun headless tests. Wire a runtime by hand instead — it's
// the same primitive, just without the browser-only logger.
const runtime = new ModuleRuntime();
for (const m of [xml, bitstream, huffman, lz77, deflate, crc32, zip, ...ooxmlMods.modules]) runtime.register(m);

describe('ooxml × fw runtime — roundtrip', () => {
    test('docx — text + properties + tables', () => {
        const d = runtime.resolve('docx');
        const doc = {
            type: 'document',
            body: [
                d.paragraph('Title', { rPr: { bold: true, size: 32 },
                                       pPr: { align: 'center' } }),
                d.paragraph('Body paragraph.'),
                d.tableFromRows([['col 1', 'col 2'], ['x', 'y']])
            ]
        };
        const back = d.read(d.write(doc));
        expect(back.document.body).toHaveLength(3);
        expect(back.document.body[0].pPr.align).toBe('center');
        expect(back.document.body[0].children[0].rPr.bold).toBe(true);
        expect(back.document.body[2].type).toBe('table');
    });

    test('docx — full L2 stack (numbering + headers + comments + footnotes)', () => {
        const d = runtime.resolve('docx');
        const doc = {
            type: 'document',
            body: [
                d.paragraph('Title', { rPr: { bold: true, size: 32 },
                                       pPr: { align: 'center' } }),
                d.listParagraph('First item', 1, 0),
                d.listParagraph('Second item', 1, 0),
                {
                    type: 'paragraph',
                    children: [
                        d.run('See '),
                        { type: 'run', children: [{ type: 'footnoteReference', id: '1' }] },
                        d.run(' for details.')
                    ]
                }
            ],
            sectPr: {
                pageSize: { w: 12240, h: 15840 },
                pageMargin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
                headerReferences: [{ type: 'default', rId: 'rIdH1' }]
            }
        };
        const bytes = d.write(doc, {
            numbering: {
                abstractNums: [{
                    abstractNumId: 0, multiLevelType: 'singleLevel',
                    levels: [{ ilvl: 0, start: 1, numFmt: 'decimal',
                               lvlText: '%1.', lvlJc: 'left' }]
                }],
                nums: [{ numId: 1, abstractNumId: 0 }]
            },
            settings: { defaultTabStop: 720 },
            footnotes: { notes: [{ id: 1, body: [d.paragraph('Cited source.')] }] },
            headers: { rIdH1: { type: 'header', body: [d.paragraph('Confidential')] } }
        });
        const back = d.read(bytes);
        expect(back.numbering.nums[0].numId).toBe(1);
        expect(back.settings.defaultTabStop).toBe(720);
        expect(back.footnotes.notes[0].body[0].children[0].children[0].value)
            .toBe('Cited source.');
        expect(back.headers.rIdH1.body[0].children[0].children[0].value)
            .toBe('Confidential');
    });

    test('docx — block math (quadratic formula) roundtrips', () => {
        const d = runtime.resolve('docx');
        const m = runtime.resolve('ooxmlMath');
        const doc = {
            type: 'document',
            body: [
                d.paragraph('The quadratic formula:'),
                m.oMathPara(m.oMath(
                    m.r('x = '),
                    m.frac(
                        [m.r('-b ± '),
                         m.rad(
                             [m.sup(m.r('b'), m.r('2')),
                              m.r(' - 4ac')])],
                        [m.r('2a')]
                    )
                ))
            ]
        };
        const back = d.read(d.write(doc));
        const block = back.document.body[1];
        expect(block.type).toBe('oMathPara');
        const f = block.children[0].children[1];
        expect(f.type).toBe('frac');
        expect(f.numerator[1].type).toBe('rad');
        expect(f.denominator[0].text).toBe('2a');
    });

    test('docx — repeating section template expanded with data', () => {
        const d = runtime.resolve('docx');
        const template = d.repeatingSection(
            { tag: 'orders' },
            [d.repeatingSectionItem([
                {
                    type: 'paragraph',
                    children: [
                        d.run('• '),
                        d.boundText({ tag: 'customer' }, '(name)',
                                     { bold: true }),
                        d.run(' — $'),
                        d.boundText({ tag: 'amount' }, '0')
                    ]
                }
            ])]
        );
        d.expandRepeating(template, [
            { customer: 'Acme', amount: '1200.50' },
            { customer: 'Globex', amount: '850.00' },
            { customer: 'Initech', amount: '2000.00' }
        ]);
        const doc = {
            type: 'document',
            body: [d.paragraph('Q4 invoice list:'), template]
        };
        const back = d.read(d.write(doc));
        const sec = back.document.body[1];
        expect(sec.properties.kind).toBe('repeatingSection');
        expect(sec.children).toHaveLength(3);
        const rows = sec.children.map(item => {
            const p = item.children[0];
            return {
                customer: p.children[1].children[0].children[0].value,
                amount: p.children[3].children[0].children[0].value
            };
        });
        expect(rows).toEqual([
            { customer: 'Acme', amount: '1200.50' },
            { customer: 'Globex', amount: '850.00' },
            { customer: 'Initech', amount: '2000.00' }
        ]);
    });

    test('docx — SDT bound to custom XML for templating', () => {
        const d = runtime.resolve('docx');
        const guid = '{ABC12345-6789-4DEF-8123-456789ABCDEF}';
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('Hello '),
                    {
                        type: 'sdt',
                        properties: {
                            alias: 'CustomerName',
                            tag: 'customer',
                            kind: 'text',
                            dataBinding: {
                                xpath: '/ns0:order/ns0:customer',
                                prefixMappings: "xmlns:ns0='http://example.com/order'",
                                storeItemID: guid
                            }
                        },
                        children: [d.run('Acme Corp', { bold: true })]
                    },
                    d.run('!')
                ]
            }]
        };
        const back = d.read(d.write(doc, {
            customXml: [{
                xml: '<order xmlns="http://example.com/order">'
                    + '<customer>Acme Corp</customer></order>',
                storeItemID: guid,
                schemaRefs: ['http://example.com/order']
            }]
        }));
        const sdt = back.document.body[0].children[1];
        expect(sdt.type).toBe('sdt');
        expect(sdt.properties.dataBinding.xpath)
            .toBe('/ns0:order/ns0:customer');
        expect(sdt.properties.dataBinding.storeItemID).toBe(guid);
        expect(back.customXml).toHaveLength(1);
        expect(back.customXml[0].storeItemID).toBe(guid);
        expect(back.customXml[0].xml).toContain('<customer>Acme Corp</customer>');
        expect(back.customXml[0].schemaRefs)
            .toEqual(['http://example.com/order']);
    });

    test('docx — inline image roundtrip', () => {
        const d = runtime.resolve('docx');
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
        const doc = {
            type: 'document',
            body: [
                d.paragraph('See diagram below:'),
                {
                    type: 'paragraph',
                    children: [d.imageRun(PNG_1X1, {
                        cx: '2in', cy: '1.5in',
                        name: 'figure.png',
                        description: 'Architecture overview'
                    })]
                }
            ]
        };
        const back = d.read(d.write(doc));
        const drawing = back.document.body[1].children[0].children[0];
        expect(drawing.type).toBe('drawing');
        expect(drawing.description).toBe('Architecture overview');
        expect(back.images[drawing.embedRef].contentType).toBe('image/png');
        expect(back.images[drawing.embedRef].data).toEqual(PNG_1X1);
    });

    test('docx — styles part', () => {
        const d = runtime.resolve('docx');
        const stylesObj = {
            styles: [
                { type: 'paragraph', styleId: 'Heading1',
                  rPr: { bold: true, size: 32 } }
            ]
        };
        const bytes = d.write({
            type: 'document',
            body: [d.paragraph('h', { pPr: { pStyle: 'Heading1' } })]
        }, { styles: stylesObj });
        const back = d.read(bytes);
        expect(back.styles.styles[0].styleId).toBe('Heading1');
    });

    test('xlsx — full L2 stack (styles + tables + defined names + filter)', () => {
        const x = runtime.resolve('xlsx');
        const stylesDef = runtime.resolve('xlsxStyles').defaults();
        // Add a bold font + matching cellXf.
        stylesDef.fonts.push({ size: 11, name: 'Calibri', family: 2, bold: true });
        stylesDef.cellXfs.push({
            numFmtId: 0, fontId: 1, fillId: 0, borderId: 0, xfId: 0,
            applyFont: true
        });
        const bytes = x.write({
            sheets: [{
                name: 'Inventory',
                rows: [
                    [{ type: 'cell', value: 'Item', s: 1 },
                     { type: 'cell', value: 'Qty', s: 1 }],
                    ['apples', 4],
                    ['oranges', 7]
                ],
                autoFilter: { ref: 'A1:B3' },
                tableRefs: [1],
                hyperlinks: [{ ref: 'A1', target: 'https://example.com',
                               external: true, tooltip: 'Source' }]
            }],
            styles: stylesDef,
            definedNames: [{ name: 'Items', value: 'Inventory!$A$2:$A$3' }],
            tables: [{
                id: 1, name: 'Inventory', displayName: 'Inventory',
                ref: 'A1:B3', headerRowCount: 1,
                columns: [{ id: 1, name: 'Item' }, { id: 2, name: 'Qty' }]
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.styles.fonts[1].bold).toBe(true);
        expect(back.workbook.sheets[0].rows[0][0].s).toBe(1);
        expect(back.workbook.sheets[0].autoFilter).toEqual({ ref: 'A1:B3' });
        expect(back.workbook.definedNames[0].name).toBe('Items');
        expect(back.workbook.tables[0].name).toBe('Inventory');
        expect(back.workbook.sheets[0].hyperlinks[0].target)
            .toBe('https://example.com');
    });

    test('xlsx — conditional formatting (dxf + color scale)', () => {
        const x = runtime.resolve('xlsx');
        const styles = runtime.resolve('xlsxStyles').defaults();
        runtime.resolve('xlsxStyles').withDxfs(styles, [
            { font: { bold: true, color: { rgb: 'FF9C0006' } },
              fill: { patternType: 'solid', bgColor: { rgb: 'FFFFC7CE' } } }
        ]);
        const bytes = x.write({
            styles,
            sheets: [{
                name: 'Sales',
                rows: [['region', 'q1'], ['EU', 100], ['US', -50], ['APAC', 200]],
                conditionalFormatting: [
                    { sqref: 'B2:B4', rules: [
                        { type: 'cellIs', priority: 1,
                          operator: 'lessThan', dxfId: 0,
                          formulas: ['0'] },
                        { type: 'colorScale', priority: 2,
                          colorScale: {
                              cfvos: [{ type: 'min' }, { type: 'max' }],
                              colors: [{ rgb: 'FFF8696B' }, { rgb: 'FF63BE7B' }]
                          }
                        }
                    ]}
                ]
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.styles.dxfs).toHaveLength(1);
        expect(back.workbook.styles.dxfs[0].font.bold).toBe(true);
        const cfRules = back.workbook.sheets[0].conditionalFormatting[0].rules;
        expect(cfRules).toHaveLength(2);
        expect(cfRules[0].operator).toBe('lessThan');
        expect(cfRules[1].colorScale.colors).toHaveLength(2);
    });

    test('xlsx — chart anchored to cells via drawings part', () => {
        const x = runtime.resolve('xlsx');
        const drawings = runtime.resolve('xlsxDrawings');
        const chart = runtime.resolve('drawingmlChart');
        const bytes = x.write({
            sheets: [{
                name: 'Sales',
                rows: [['Region', 'Q4'], ['EU', 120], ['US', 85], ['APAC', 200]],
                drawings: [{
                    anchor: drawings.twoCell({ col: 4, row: 0 },
                                              { col: 12, row: 18 }),
                    cx: 6000000, cy: 4000000,
                    chart: chart.barChart({
                        title: 'Q4 by region',
                        series: [{ name: 'Q4',
                                    categories: ['EU', 'US', 'APAC'],
                                    values: [120, 85, 200] }],
                        legend: { position: 'r' }
                    })
                }]
            }]
        });
        const back = x.read(bytes);
        const sheet = back.workbook.sheets[0];
        expect(sheet.drawings).toHaveLength(1);
        expect(sheet.drawings[0].chart.title).toBe('Q4 by region');
        expect(sheet.drawings[0].chart.series[0].values).toEqual([120, 85, 200]);
        expect(sheet.drawings[0].anchor.kind).toBe('twoCell');
    });

    test('xlsx — threaded comments thread (Office 2018+)', () => {
        const x = runtime.resolve('xlsx');
        const bytes = x.write({
            sheets: [{
                name: 'Review',
                rows: [['Total'], [1234.56]],
                threadedComments: [
                    { ref: 'A2', author: 'Alice',
                      date: '2024-03-10T14:00:00Z',
                      text: 'Where does this come from?' },
                    { ref: 'A2', author: 'Bob',
                      date: '2024-03-10T14:15:00Z',
                      text: 'See pivot table on Sheet 2.',
                      parentId: 0 },
                    { ref: 'A2', author: 'Alice',
                      date: '2024-03-10T14:20:00Z',
                      text: 'Got it, thanks.',
                      parentId: 0,
                      done: true }
                ]
            }]
        });
        const back = x.read(bytes);
        const tc = back.workbook.sheets[0].threadedComments;
        expect(tc).toHaveLength(3);
        expect(tc[0].parentId).toBeUndefined();
        expect(tc[1].parentId).toBe(tc[0].id);
        expect(tc[2].parentId).toBe(tc[0].id);
        expect(tc[2].done).toBe(true);
        expect(back.workbook.persons).toHaveLength(2);
    });

    test('xlsx — comments with rich text', () => {
        const x = runtime.resolve('xlsx');
        const bytes = x.write({
            sheets: [{
                name: 'Review',
                rows: [['Item', 'Status'], ['feature A', 'done']],
                comments: [{
                    ref: 'B2', author: 'Alice',
                    richText: [
                        { text: 'Alice:', rPr: { bold: true, size: 9,
                                                  font: 'Tahoma' } },
                        { text: ' ready for QA',
                          rPr: { size: 9, font: 'Tahoma' } }
                    ]
                }]
            }]
        });
        const back = x.read(bytes);
        const c = back.workbook.sheets[0].comments[0];
        expect(c.author).toBe('Alice');
        expect(c.richText[0].rPr.bold).toBe(true);
        expect(c.richText[1].text).toBe(' ready for QA');
    });

    test('xlsx — formulas + shared strings + merges', () => {
        const x = runtime.resolve('xlsx');
        const bytes = x.write({
            sheets: [{
                name: 'Data',
                rows: [
                    ['name', 'qty', 'unit', 'total'],
                    ['apples', 4, 0.5,
                     { type: 'cell', formula: 'B2*C2', value: 2, t: 'n' }],
                    ['apples', 6, 0.5,
                     { type: 'cell', formula: 'B3*C3', value: 3, t: 'n' }]
                ],
                merges: ['A1:D1']
            }]
        });
        const back = x.read(bytes);
        const sheet = back.workbook.sheets[0];
        expect(sheet.merges).toEqual(['A1:D1']);
        expect(sheet.rows[1][3].formula).toBe('B2*C2');
        expect(sheet.rows[1][3].value).toBe(2);
        // String 'apples' should be in shared strings, deduped.
        expect(back.workbook.sharedStrings).toContain('apples');
    });

    test('pptx — chart in slide with bar plot', () => {
        const p = runtime.resolve('pptx');
        const chartMod = runtime.resolve('drawingmlChart');
        const bytes = p.write({
            slides: [{
                shapes: [
                    p.chart(chartMod.barChart({
                        title: 'Q4 Sales',
                        series: [{ name: 'Q4',
                                    categories: ['EU', 'US', 'APAC'],
                                    values: [120, 85, 200] }],
                        legend: { position: 'r' }
                    }), { cx: 6000000, cy: 4000000,
                          offsetX: 1000000, offsetY: 1500000 })
                ]
            }]
        });
        const back = p.read(bytes);
        const sp = back.presentation.slides[0].shapes[0];
        expect(sp.type).toBe('chart');
        expect(sp.chart.plotType).toBe('bar');
        expect(sp.chart.title).toBe('Q4 Sales');
        expect(sp.chart.series[0].values).toEqual([120, 85, 200]);
    });

    test('docx — chart in document via chartRun', () => {
        const d = runtime.resolve('docx');
        const chartMod = runtime.resolve('drawingmlChart');
        const doc = {
            type: 'document',
            body: [
                d.paragraph('Quarterly trend:'),
                {
                    type: 'paragraph',
                    children: [d.chartRun(chartMod.lineChart({
                        title: 'Revenue',
                        series: [{ name: 'Q4',
                                    categories: ['Jan','Feb','Mar'],
                                    values: [100, 110, 95] }]
                    }), { cx: '5in', cy: '3in' })]
                }
            ]
        };
        const back = d.read(d.write(doc));
        const drawing = back.document.body[1].children[0].children[0];
        expect(drawing.kind).toBe('chart');
        expect(drawing.chart.plotType).toBe('line');
        expect(drawing.chart.title).toBe('Revenue');
        expect(drawing.chart.series[0].values).toEqual([100, 110, 95]);
    });

    test('pptx — preset shapes (rect + arrow + callout)', () => {
        const p = runtime.resolve('pptx');
        const bytes = p.write({
            slides: [{
                shapes: [
                    {
                        type: 'shape', id: 2, name: 'Title',
                        placeholder: { type: 'title' },
                        txBody: { paragraphs: [
                            { runs: [{ type: 'text', value: 'Process flow' }] }
                        ] }
                    },
                    p.shape('rect', {
                        cx: '2in', cy: '1in',
                        offsetX: '0.5in', offsetY: '2in',
                        fill: '4472C4', line: { color: '2F5496', width: 12700 },
                        text: 'Step 1'
                    }),
                    p.shape('rightArrow', {
                        cx: '0.5in', cy: '0.5in',
                        offsetX: '2.75in', offsetY: '2.25in',
                        fill: '70AD47'
                    }),
                    p.shape('wedgeRoundRectCallout', {
                        cx: '2.5in', cy: '1in',
                        offsetX: '3.5in', offsetY: '2in',
                        fill: 'FFE699', line: { color: 'BF8F00' },
                        text: 'Done!'
                    })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes).toHaveLength(4);
        expect(shapes[0].placeholder.type).toBe('title');
        expect(shapes[1].shapeProps.geom).toBe('rect');
        expect(shapes[1].shapeProps.fill).toEqual({ rgb: '4472C4' });
        expect(shapes[2].shapeProps.geom).toBe('rightArrow');
        expect(shapes[3].shapeProps.geom).toBe('wedgeRoundRectCallout');
        expect(shapes[3].txBody.paragraphs[0].runs[0].value).toBe('Done!');
    });

    test('pptx — picture + table in same slide', () => {
        const p = runtime.resolve('pptx');
        const tableMod = runtime.resolve('pptxTable');
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
                            { runs: [{ type: 'text', value: 'Quarterly Review' }] }
                        ] }
                    },
                    p.picture(PNG_1X1, { cx: '3in', cy: '2in',
                                          offsetX: '0.5in', offsetY: '1.5in',
                                          description: 'Sales chart' }),
                    tableMod.tableFromRows([
                        ['Region', 'Sales'],
                        ['EU',   '$120k'],
                        ['US',   '$85k'],
                        ['APAC', '$200k']
                    ], { cx: 4000000, cy: 1500000,
                         offsetX: 5000000, offsetY: 1500000 })
                ]
            }]
        });
        const back = p.read(bytes);
        const shapes = back.presentation.slides[0].shapes;
        expect(shapes).toHaveLength(3);
        expect(shapes[0].placeholder.type).toBe('title');
        expect(shapes[1].type).toBe('picture');
        expect(shapes[1].image.contentType).toBe('image/png');
        expect(shapes[1].description).toBe('Sales chart');
        expect(shapes[2].type).toBe('table');
        expect(shapes[2].rows).toHaveLength(4);
        expect(shapes[2].rows[3].cells[1].txBody.paragraphs[0].runs[0].value)
            .toBe('$200k');
    });

    test('pptx — multi-slide with title + body + theme', () => {
        const p = runtime.resolve('pptx');
        const bytes = p.write({
            slides: [
                { title: 'Welcome', body: ['Bullet 1', 'Bullet 2'] },
                { title: 'Section 2', body: ['Single bullet'] }
            ]
        });
        const back = p.read(bytes);
        expect(back.presentation.slides).toHaveLength(2);
        expect(p.extractTitle(back.presentation.slides[0])).toBe('Welcome');
        expect(p.extractBody(back.presentation.slides[1]))
            .toEqual(['Single bullet']);
        // Auto-generated theme should round-trip with Office defaults.
        expect(back.presentation.theme.clrScheme.colors.accent1.srgb).toBe('4472C4');
        expect(back.presentation.slideMasters).toHaveLength(1);
        expect(back.presentation.slideLayouts).toHaveLength(1);
    });

    test('markup compatibility — w14 extensions in document.xml are stripped on read', () => {
        const d = runtime.resolve('docx');
        const opc = runtime.resolve('opcPackage');
        const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<w:document'
            + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
            + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
            + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"'
            + ' mc:Ignorable="w14">'
            + '<w:body>'
            + '<w:p>'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14"><w:r><w:t>2010+ branch</w:t></w:r></mc:Choice>'
            + '<mc:Fallback><w:r><w:t>vanilla</w:t></w:r></mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</w:p></w:body></w:document>';
        const pkg = opc.empty();
        opc.setPart(pkg, '/word/document.xml',
            new TextEncoder().encode(documentXml), d.CT_DOCUMENT);
        opc.setRels(pkg, '/', [{
            Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml'
        }]);
        const back = d.read(opc.write(pkg));
        // Default: w14 not in supportedPrefixes → Fallback selected.
        expect(d.toText(back.document)).toBe('vanilla');
    });

    test('factories remain serialisable (worker-safe)', () => {
        for (const m of ooxmlMods.modules) {
            const s = m.factory.toString();
            expect(s).toContain('function');
        }
    });
});
