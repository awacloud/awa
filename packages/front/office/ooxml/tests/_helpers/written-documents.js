// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Documents the ooxml writers emit, for output-validity
 * checks by an external validator (the office-scorecard axis C,
 * OOXML-Validator).
 *
 * Every document is written through the public API only (`docx.write`,
 * `xlsx.write`, `pptx.write` and the builders the runtime resolves), never
 * by hand. The set covers what the writers model: text, run and paragraph
 * properties, tables, lists with numbering, headers, footnotes and
 * endnotes, comments, fields, bookmarks, hyperlinks, content controls bound
 * to custom XML, Office Math, inline pictures, charts and shapes (docx);
 * shared strings, every cell type, formulas, merges, columns, row
 * properties, styles and differential formats, tables, defined names,
 * hyperlinks, conditional formatting, comments, threaded comments, a
 * hidden sheet and a chart drawing (xlsx); title and body slides, preset
 * shapes, a picture, a table and a chart (pptx).
 *
 * `roundTrip` writes a document read from existing bytes back with the
 * same package's writer — the other half of the measure.
 *
 * The package test `tests/written-documents.integration.test.js` reads each
 * document back; `tools/office-scorecard` imports this module by relative
 * path, so the documents the validator judges are the ones tested here.
 *
 * @module tests/_helpers/written-documents
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import * as ooxmlMods from '../../src/main.js';

/** A 1 × 1 RGBA PNG. */
export const PNG_1X1 = new Uint8Array([
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

/**
 * A runtime wired with the fw codecs the ooxml stack needs and every core
 * ooxml module (the `@awacloud/fw` default export touches `window`).
 *
 * @returns {ModuleRuntime}
 */
export function ooxmlRuntime() {
    const runtime = new ModuleRuntime();
    for (const m of [xml, bitstream, huffman, lz77, deflate, crc32, zip, ...ooxmlMods.modules]) runtime.register(m);
    return runtime;
}

function para(children, pPr) {
    const node = { type: 'paragraph', children };
    if (pPr) node.pPr = pPr;
    return node;
}

/** @param {ModuleRuntime} rt */
function docxDocuments(rt) {
    const d = rt.resolve('docx');
    const m = rt.resolve('ooxmlMath');
    const chart = rt.resolve('drawingmlChart');
    const numbering = rt.resolve('docxNumbering');
    const out = [];
    const add = (id, bytes) => out.push({ id, ext: 'docx', bytes });

    add('docx-text-table', d.write({
        type: 'document',
        body: [
            d.paragraph('Title', { rPr: { bold: true, size: 32 }, pPr: { align: 'center' } }),
            d.paragraph('Body paragraph.', { rPr: { italic: true, color: '0070C0', underline: 'single' } }),
            d.tableFromRows([['col 1', 'col 2'], ['x', 'y']])
        ]
    }));

    add('docx-numbering-header-footnote', d.write({
        type: 'document',
        body: [
            d.paragraph('Title', { rPr: { bold: true, size: 32 }, pPr: { align: 'center' } }),
            d.listParagraph('First item', 1, 0),
            d.listParagraph('Second item', 1, 0),
            para([
                d.run('See '),
                { type: 'run', children: [{ type: 'footnoteReference', id: '1' }] },
                d.run(' for details.')
            ])
        ],
        sectPr: {
            pageSize: { w: 12240, h: 15840 },
            pageMargin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            headerReferences: [{ type: 'default', rId: 'rIdH1' }],
            footerReferences: [{ type: 'default', rId: 'rIdF1' }]
        }
    }, {
        numbering: {
            abstractNums: [{
                abstractNumId: 0, multiLevelType: 'singleLevel',
                levels: [{ ilvl: 0, start: 1, numFmt: 'decimal', lvlText: '%1.', lvlJc: 'left' }]
            }],
            nums: [{ numId: 1, abstractNumId: 0 }]
        },
        settings: { defaultTabStop: 720 },
        footnotes: { notes: [{ id: 1, body: [d.paragraph('Cited source.')] }] },
        headers: { rIdH1: { type: 'header', body: [d.paragraph('Confidential')] } },
        footers: { rIdF1: { type: 'footer', body: [para([d.fieldSimple('PAGE', '1')])] } }
    }));

    const bullets = numbering.bulletList();
    add('docx-bullet-list', d.write({
        type: 'document',
        body: [d.listParagraph('One', bullets.numId, 0), d.listParagraph('Two', bullets.numId, 0)]
    }, { numbering: bullets.numbering }));

    add('docx-math', d.write({
        type: 'document',
        body: [
            d.paragraph('The quadratic formula:'),
            m.oMathPara(m.oMath(
                m.r('x = '),
                m.frac(
                    [m.r('-b ± '), m.rad([m.sup(m.r('b'), m.r('2')), m.r(' - 4ac')])],
                    [m.r('2a')]
                )
            ))
        ]
    }));

    const template = d.repeatingSection(
        { tag: 'orders' },
        [d.repeatingSectionItem([para([
            d.run('• '),
            d.boundText({ tag: 'customer' }, '(name)', { bold: true }),
            d.run(' — $'),
            d.boundText({ tag: 'amount' }, '0')
        ])])]
    );
    d.expandRepeating(template, [
        { customer: 'Acme', amount: '1200.50' },
        { customer: 'Globex', amount: '850.00' }
    ]);
    add('docx-repeating-section', d.write({ type: 'document', body: [d.paragraph('Q4 invoice list:'), template] }));

    const guid = '{ABC12345-6789-4DEF-8123-456789ABCDEF}';
    add('docx-custom-xml-binding', d.write({
        type: 'document',
        body: [para([
            d.run('Hello '),
            {
                type: 'sdt',
                properties: {
                    alias: 'CustomerName', tag: 'customer', kind: 'text',
                    dataBinding: {
                        xpath: '/ns0:order/ns0:customer',
                        prefixMappings: "xmlns:ns0='http://example.com/order'",
                        storeItemID: guid
                    }
                },
                children: [d.run('Acme Corp', { bold: true })]
            },
            d.run('!')
        ])]
    }, {
        customXml: [{
            xml: '<order xmlns="http://example.com/order"><customer>Acme Corp</customer></order>',
            storeItemID: guid,
            schemaRefs: ['http://example.com/order']
        }]
    }));

    add('docx-image', d.write({
        type: 'document',
        body: [
            d.paragraph('See diagram below:'),
            para([d.imageRun(PNG_1X1, { cx: '2in', cy: '1.5in', name: 'figure.png', description: 'Architecture overview' })])
        ]
    }));

    add('docx-styles', d.write({
        type: 'document',
        body: [d.paragraph('h', { pPr: { pStyle: 'Heading1' } })]
    }, { styles: { styles: [{ type: 'paragraph', styleId: 'Heading1', rPr: { bold: true, size: 32 } }] } }));

    add('docx-chart-shape', d.write({
        type: 'document',
        body: [
            d.paragraph('Quarterly trend:'),
            para([d.chartRun(chart.lineChart({
                title: 'Revenue',
                series: [{ name: 'Q4', categories: ['Jan', 'Feb', 'Mar'], values: [100, 110, 95] }]
            }), { cx: '5in', cy: '3in' })]),
            para([d.shapeRun('rect', { cx: '2in', cy: '1in', name: 'Box' })])
        ]
    }));

    add('docx-comments-endnotes-fields', d.write({
        type: 'document',
        body: [
            para([
                { type: 'commentRangeStart', id: 1 },
                d.run('Reviewed text'),
                { type: 'commentRangeEnd', id: 1 },
                { type: 'run', children: [{ type: 'commentReference', id: '1' }] },
                d.run(' and a note'),
                { type: 'run', children: [{ type: 'endnoteReference', id: '1' }] }
            ]),
            para([...d.bookmark('anchor', 0, [d.run('Bookmarked')]),
                { type: 'run', children: [{ type: 'tab' }, { type: 'text', value: 'after a tab' }] }]),
            para([d.run('Printed '), ...d.fieldComplex('DATE \\@ "yyyy-MM-dd"', '2026-01-01')]),
            para([d.hyperlink('awa', 'https://example.com/', { rId: 'rIdL1' })]),
            para([{ type: 'run', children: [{ type: 'break', kind: 'page' }] }]),
            d.paragraph('After the break.')
        ]
    }, {
        comments: { comments: [{ id: 1, author: 'Alice', initials: 'A', date: '2024-01-15T10:00:00Z', body: [d.paragraph('Really?')] }] },
        endnotes: { notes: [{ id: 1, body: [d.paragraph('An endnote.')] }] }
    }));

    return out;
}

/** @param {ModuleRuntime} rt */
function xlsxDocuments(rt) {
    const x = rt.resolve('xlsx');
    const xs = rt.resolve('xlsxStyles');
    const drawings = rt.resolve('xlsxDrawings');
    const chart = rt.resolve('drawingmlChart');
    const out = [];
    const add = (id, bytes) => out.push({ id, ext: 'xlsx', bytes });

    const stylesDef = xs.defaults();
    stylesDef.fonts.push({ size: 11, name: 'Calibri', family: 2, bold: true });
    stylesDef.cellXfs.push({ numFmtId: 0, fontId: 1, fillId: 0, borderId: 0, xfId: 0, applyFont: true });
    add('xlsx-styles-table-names', x.write({
        sheets: [{
            name: 'Inventory',
            rows: [
                [{ type: 'cell', value: 'Item', s: 1 }, { type: 'cell', value: 'Qty', s: 1 }],
                ['apples', 4],
                ['oranges', 7]
            ],
            autoFilter: { ref: 'A1:B3' },
            tableRefs: [1],
            hyperlinks: [{ ref: 'A1', target: 'https://example.com', external: true, tooltip: 'Source' }]
        }],
        styles: stylesDef,
        definedNames: [{ name: 'Items', value: 'Inventory!$A$2:$A$3' }],
        tables: [{
            id: 1, name: 'Inventory', displayName: 'Inventory', ref: 'A1:B3', headerRowCount: 1,
            columns: [{ id: 1, name: 'Item' }, { id: 2, name: 'Qty' }]
        }]
    }));

    const cfStyles = xs.defaults();
    xs.withDxfs(cfStyles, [{ font: { bold: true, color: { rgb: 'FF9C0006' } }, fill: { patternType: 'solid', bgColor: { rgb: 'FFFFC7CE' } } }]);
    add('xlsx-conditional-formatting', x.write({
        styles: cfStyles,
        sheets: [{
            name: 'Sales',
            rows: [['region', 'q1'], ['EU', 100], ['US', -50], ['APAC', 200]],
            conditionalFormatting: [{
                sqref: 'B2:B4',
                rules: [
                    { type: 'cellIs', priority: 1, operator: 'lessThan', dxfId: 0, formulas: ['0'] },
                    { type: 'colorScale', priority: 2, colorScale: { cfvos: [{ type: 'min' }, { type: 'max' }], colors: [{ rgb: 'FFF8696B' }, { rgb: 'FF63BE7B' }] } }
                ]
            }]
        }]
    }));

    add('xlsx-chart', x.write({
        sheets: [{
            name: 'Sales',
            rows: [['Region', 'Q4'], ['EU', 120], ['US', 85], ['APAC', 200]],
            drawings: [{
                anchor: drawings.twoCell({ col: 4, row: 0 }, { col: 12, row: 18 }),
                cx: 6000000, cy: 4000000,
                chart: chart.barChart({
                    title: 'Q4 by region',
                    series: [{ name: 'Q4', categories: ['EU', 'US', 'APAC'], values: [120, 85, 200] }],
                    legend: { position: 'r' }
                })
            }]
        }]
    }));

    add('xlsx-threaded-comments', x.write({
        sheets: [{
            name: 'Review',
            rows: [['Total'], [1234.56]],
            threadedComments: [
                { ref: 'A2', author: 'Alice', date: '2024-03-10T14:00:00Z', text: 'Where does this come from?' },
                { ref: 'A2', author: 'Bob', date: '2024-03-10T14:15:00Z', text: 'See pivot table on Sheet 2.', parentId: 0 },
                { ref: 'A2', author: 'Alice', date: '2024-03-10T14:20:00Z', text: 'Got it, thanks.', parentId: 0, done: true }
            ]
        }]
    }));

    add('xlsx-comments', x.write({
        sheets: [{
            name: 'Review',
            rows: [['Item', 'Status'], ['feature A', 'done']],
            comments: [{
                ref: 'B2', author: 'Alice',
                richText: [
                    { text: 'Alice:', rPr: { bold: true, size: 9, font: 'Tahoma' } },
                    { text: ' ready for QA', rPr: { size: 9, font: 'Tahoma' } }
                ]
            }]
        }]
    }));

    add('xlsx-formulas-merges', x.write({
        sheets: [{
            name: 'Data',
            rows: [
                ['name', 'qty', 'unit', 'total'],
                ['apples', 4, 0.5, { type: 'cell', formula: 'B2*C2', value: 2, t: 'n' }],
                ['apples', 6, 0.5, { type: 'cell', formula: 'B3*C3', value: 3, t: 'n' }]
            ],
            merges: ['A1:D1']
        }]
    }));

    add('xlsx-sheet-properties', x.write({
        sheets: [
            {
                name: 'Visible',
                rows: [
                    ['text', true, { type: 'cell', value: 'inline', t: 'inlineStr' }],
                    [{ type: 'cell', value: 'formula text', t: 'str', formula: '"formula "&"text"' }, false, 3.5],
                    ['hidden row', 1, 2]
                ],
                rowProps: { 0: { r: 1, height: 24, customHeight: true }, 2: { r: 3, hidden: true } },
                cols: [{ min: 1, max: 1, width: 20 }, { min: 3, max: 3, width: 8, hidden: true }]
            },
            { name: 'Hidden', state: 'hidden', rows: [['kept out of sight']] }
        ]
    }));

    return out;
}

/** @param {ModuleRuntime} rt */
function pptxDocuments(rt) {
    const p = rt.resolve('pptx');
    const chart = rt.resolve('drawingmlChart');
    const table = rt.resolve('pptxTable');
    const out = [];
    const add = (id, bytes) => out.push({ id, ext: 'pptx', bytes });
    const title = (text) => ({
        type: 'shape', id: 2, name: 'Title',
        placeholder: { type: 'title' },
        txBody: { paragraphs: [{ runs: [{ type: 'text', value: text }] }] }
    });

    add('pptx-title-body', p.write({
        slides: [
            { title: 'Welcome', body: ['Bullet 1', 'Bullet 2'] },
            { title: 'Section 2', body: ['Single bullet'] }
        ]
    }));

    add('pptx-chart', p.write({
        slides: [{
            shapes: [p.chart(chart.barChart({
                title: 'Q4 Sales',
                series: [{ name: 'Q4', categories: ['EU', 'US', 'APAC'], values: [120, 85, 200] }],
                legend: { position: 'r' }
            }), { cx: 6000000, cy: 4000000, offsetX: 1000000, offsetY: 1500000 })]
        }]
    }));

    add('pptx-shapes', p.write({
        slides: [{
            shapes: [
                title('Process flow'),
                p.shape('rect', { id: 3, cx: '2in', cy: '1in', offsetX: '0.5in', offsetY: '2in', fill: '4472C4', line: { color: '2F5496', width: 12700 }, text: 'Step 1' }),
                p.shape('rightArrow', { id: 4, cx: '0.5in', cy: '0.5in', offsetX: '2.75in', offsetY: '2.25in', fill: '70AD47' }),
                p.shape('wedgeRoundRectCallout', { id: 5, cx: '2.5in', cy: '1in', offsetX: '3.5in', offsetY: '2in', fill: 'FFE699', line: { color: 'BF8F00' }, text: 'Done!' })
            ]
        }]
    }));

    add('pptx-picture-table', p.write({
        slides: [{
            shapes: [
                title('Quarterly Review'),
                p.picture(PNG_1X1, { id: 3, cx: '3in', cy: '2in', offsetX: '0.5in', offsetY: '1.5in', description: 'Sales chart' }),
                table.tableFromRows([['Region', 'Sales'], ['EU', '$120k'], ['US', '$85k'], ['APAC', '$200k']],
                    { cx: 4000000, cy: 1500000, offsetX: 5000000, offsetY: 1500000 })
            ]
        }]
    }));

    return out;
}

/**
 * Every document of the measure, in a fixed order.
 *
 * @param {ModuleRuntime} [rt]
 * @returns {{ id: string, ext: 'docx'|'xlsx'|'pptx', bytes: Uint8Array }[]}
 */
export function writtenDocuments(rt = ooxmlRuntime()) {
    return [...docxDocuments(rt), ...xlsxDocuments(rt), ...pptxDocuments(rt)];
}

/**
 * Reads `bytes` with the package's reader for `ext` and writes the result
 * back with its writer (a docx passes its auxiliary parts through, as the
 * read/write guide does).
 *
 * @param {'docx'|'xlsx'|'pptx'} ext
 * @param {Uint8Array} bytes
 * @param {ModuleRuntime} [rt]
 * @returns {Uint8Array}
 */
export function roundTrip(ext, bytes, rt = ooxmlRuntime()) {
    const mod = rt.resolve(ext);
    const r = mod.read(bytes);
    if (ext === 'xlsx') return mod.write(r.workbook);
    if (ext === 'pptx') return mod.write(r.presentation);
    return mod.write(r.document, {
        styles: r.styles, numbering: r.numbering, settings: r.settings,
        comments: r.comments, footnotes: r.footnotes, endnotes: r.endnotes,
        headers: r.headers, footers: r.footers, hyperlinks: r.hyperlinks,
        images: r.images, customXml: r.customXml
    });
}
