// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Documents the odf writers emit, for output-validity checks
 * by an external validator (the office-scorecard axis C, odfvalidator).
 *
 * Every document is written through the public API only (`odt.write`,
 * `ods.write`, `odp.write` and the builders the runtime resolves — e.g.
 * `textParagraph.renderParagraph`, `textFields.renderField`,
 * `drawShape.renderShape`, `odfStyles` named-style specs), never with
 * hand-written XML or a hand-built package. Element nodes produced by a
 * module's own `render*` builder are placed in the slot the typed model
 * offers for them: an `element` run of a paragraph (bookmarks, fields,
 * change markers, shapes), a raw body node (the tracked-changes
 * container), a frame's or a slide's `_extras.children` (a slide's shapes,
 * a table frame), a cell's `children` or a notes body.
 *
 * The set covers what the writers model: paragraph styles and spans with
 * emphasis flags, links, spacing runs, headings, ordered / bullet / nested
 * lists, a section, a grid body table with a header row, bookmarks, fields,
 * tracked changes, an embedded picture, a text-box frame, drawing shapes,
 * page layout, a master page with a footer and the document metadata
 * (odt); every cell value type, formulas, merged cells, column / row / cell
 * automatic styles, a number format, hidden and repeated rows and columns,
 * several sheets (ods); text-box slides, a picture frame, styled shapes, a
 * table frame, speaker notes and several slides (odp).
 *
 * Left out, because no public writer can express them without raw XML
 * input: embedded formulas and charts (an `Object N/` sub-document whose
 * manifest entry no writer declares), forms, 3-D scenes and animations.
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
import * as odfMods from '../../src/main.js';

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
 * A runtime wired with the fw codecs the odf stack needs and every core
 * odf module (the `@awacloud/fw` default export touches `window`).
 *
 * @returns {ModuleRuntime}
 */
export function odfRuntime() {
    const runtime = new ModuleRuntime();
    for (const m of [bitstream, huffman, lz77, deflate, crc32, zip, xml, ...odfMods.modules]) runtime.register(m);
    return runtime;
}

const text = (value) => ({ type: 'text', value });

/**
 * A styles.xml model with one page layout (automatic) and one master page,
 * plus the named styles given.
 *
 * @param {ModuleRuntime} rt
 * @param {object} page — `{ master, layout, width, height, footer? }`
 * @param {object[]} [named] — named-style specs (`odfStyles.namedStyle`)
 * @returns {object}
 */
function stylesWithPage(rt, page, named) {
    const pageLayout = rt.resolve('stylePageLayout');
    const masterPage = rt.resolve('styleMasterPage');
    const styles = rt.resolve('odfStyles').empty();
    for (const s of named || []) styles.styles.push(s);
    const layout = {
        name: page.layout,
        properties: {
            'fo:page-width': page.width, 'fo:page-height': page.height,
            'fo:margin-top': '2cm', 'fo:margin-bottom': '2cm', 'fo:margin-left': '2cm', 'fo:margin-right': '2cm'
        }
    };
    if (page.footer) layout.footerStyle = { properties: { 'fo:min-height': '0.6cm', 'fo:margin-top': '0.3cm' } };
    styles.automaticStyles.push(pageLayout.renderPageLayout(layout));
    const master = { name: page.master, pageLayoutName: page.layout };
    if (page.footer) master.footers = { default: page.footer };
    styles.masterStyles.push(masterPage.renderMasterPage(master));
    return styles;
}

/** @param {ModuleRuntime} rt */
function odtDocuments(rt) {
    const o = rt.resolve('odt');
    const para = rt.resolve('textParagraph');
    const heading = rt.resolve('textHeading');
    const fields = rt.resolve('textFields');
    const marks = rt.resolve('textBookmarks');
    const tracked = rt.resolve('textTracked');
    const shapes = rt.resolve('drawShape');
    const out = [];
    const add = (id, bytes) => out.push({ id, ext: 'odt', bytes });
    const p = (...runs) => ({ type: 'paragraph', runs });
    const a4 = { master: 'Standard', layout: 'pm1', width: '21cm', height: '29.7cm' };
    const named = [
        { name: 'Standard', family: 'paragraph', class: 'text' },
        { name: 'Title', displayName: 'Title', family: 'paragraph', parentStyleName: 'Standard', class: 'chapter',
          properties: { paragraph: { 'fo:text-align': 'center' }, text: { 'fo:font-size': '24pt', 'fo:font-weight': 'bold' } } },
        { name: 'Heading_20_1', displayName: 'Heading 1', family: 'paragraph', parentStyleName: 'Standard',
          nextStyleName: 'Standard', defaultOutlineLevel: 1, class: 'text',
          properties: { text: { 'fo:font-size': '18pt', 'fo:font-weight': 'bold' } } },
        { name: 'Heading_20_2', displayName: 'Heading 2', family: 'paragraph', parentStyleName: 'Standard',
          nextStyleName: 'Standard', defaultOutlineLevel: 2, class: 'text',
          properties: { text: { 'fo:font-size': '14pt', 'fo:font-weight': 'bold' } } },
        { name: 'Emphasis', family: 'text', properties: { text: { 'fo:font-style': 'italic' } } }
    ];

    add('odt-text-styles-meta', o.write({
        body: [
            o.paragraph('Quarterly report', { styleName: 'Title' }),
            p(text('Plain, '),
                { type: 'span', value: 'bold', bold: true }, text(', '),
                { type: 'span', value: 'italic', italic: true }, text(', '),
                { type: 'span', value: 'struck', strike: true }, text(', '),
                { type: 'span', value: 'code', monospace: true }, text(', '),
                { type: 'span', value: 'all four', bold: true, italic: true, strike: true, monospace: true }, text(' and '),
                { type: 'span', value: 'a named style', styleName: 'Emphasis' }, text('.')),
            p(text('See '), { type: 'link', href: 'https://example.com/report', runs: [text('the online version')] },
                text(' or '), { type: 'link', href: 'https://example.com/', runs: [{ type: 'span', value: 'the site', bold: true }] }, text('.')),
            p(text('a'), { type: 'space', count: 3 }, text('b'), { type: 'tab' }, text('c'), { type: 'line-break' }, text('second line')),
            { type: 'soft-page-break' },
            o.paragraph('After the soft page break.', { styleName: 'Standard' })
        ]
    }, {
        styles: stylesWithPage(rt, a4, named),
        meta: {
            title: 'Quarterly report', creator: 'Alice', date: '2026-05-13T10:00:00',
            initialCreator: 'Bob', creationDate: '2026-05-01T09:00:00'
        }
    }));

    add('odt-headings-lists-section', o.write({
        body: [
            heading.heading('Overview', { outlineLevel: 1, styleName: 'Heading_20_1' }),
            o.paragraph('Intro paragraph.'),
            { type: 'list', ordered: true, items: [
                { children: [o.paragraph('first')] },
                { children: [o.paragraph('second'), { type: 'list', ordered: true, numFormat: 'a', items: [
                    { children: [o.paragraph('second, a')] },
                    { children: [o.paragraph('second, b')] }
                ] }] },
                { children: [o.paragraph('third')] }
            ] },
            { type: 'list', ordered: false, items: [
                { children: [o.paragraph('bullet one')] },
                { children: [o.paragraph('bullet two'), { type: 'list', ordered: false, items: [
                    { children: [o.paragraph('nested bullet')] }
                ] }] }
            ] },
            { type: 'list', ordered: true, numFormat: 'I', items: [{ children: [o.paragraph('Roman one')] }] },
            heading.heading('Details', { outlineLevel: 2, styleName: 'Heading_20_2' }),
            { type: 'section', name: 'Appendix', children: [
                heading.heading('Inside the section', { outlineLevel: 2, styleName: 'Heading_20_2' }),
                o.paragraph('Section body.')
            ] }
        ]
    }, { styles: stylesWithPage(rt, a4, named) }));

    add('odt-table', o.write({
        body: [
            o.paragraph('Inventory:'),
            {
                type: 'table', name: 'Inventory', grid: true, headerRows: 1,
                columns: [{}, {}, {}],
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', children: [p({ type: 'span', value: 'Item', bold: true })] },
                        { type: 'cell', children: [p({ type: 'span', value: 'Qty', bold: true })] },
                        { type: 'cell', children: [p({ type: 'span', value: 'Notes', bold: true })] }
                    ] },
                    { type: 'row', cells: [
                        { type: 'cell', children: [o.paragraph('apples')] },
                        { type: 'cell', valueType: 'float', value: '4', children: [o.paragraph('4')] },
                        { type: 'cell', children: [{ type: 'list', ordered: false, items: [
                            { children: [o.paragraph('fresh')] }, { children: [o.paragraph('local')] }
                        ] }] }
                    ] },
                    { type: 'row', cells: [
                        { type: 'cell', colSpan: 2, children: [o.paragraph('merged across two columns')] },
                        { type: 'cell', covered: true, children: [] },
                        { type: 'cell', children: [o.paragraph('last')] }
                    ] }
                ]
            },
            {
                type: 'table', name: 'Plain',
                columns: [{ repeated: 2 }],
                rows: [{ type: 'row', cells: [
                    { type: 'cell', children: [o.paragraph('no grid')] },
                    { type: 'cell', children: [o.paragraph('two cells')] }
                ] }]
            }
        ]
    }));

    const field = (kind, attrs, value) => fields.renderField({ type: 'field', kind, attrs, value });
    const marker = (kind, name) => marks.renderMarker({ type: 'marker', kind, name });
    const footer = [para.renderParagraph(p(text('Page '), field('page-number', { 'text:select-page': 'current' }, '1'),
        text(' of '), field('page-count', {}, '1')))];
    add('odt-fields-bookmarks', o.write({
        body: [
            p(marker('text:bookmark', 'top'), text('Document '), field('title', {}, 'Fields and bookmarks'),
                text(' by '), field('author-name', {}, 'Alice'), text('.')),
            p(text('Printed '), field('date', { 'text:date-value': '2026-01-01' }, '2026-01-01'),
                text(' at '), field('time', { 'text:time-value': '10:30:00' }, '10:30'), text('.')),
            p(text('Before '), marker('text:bookmark-start', 'range'), text('bookmarked range'),
                marker('text:bookmark-end', 'range'), text(' after.')),
            p(text('Jump back: '), field('bookmark-ref', { 'text:reference-format': 'text', 'text:ref-name': 'range' }, 'bookmarked range'),
                text('; reference mark: '), marker('text:reference-mark-start', 'rm1'), text('marked'),
                marker('text:reference-mark-end', 'rm1'), text('.'))
        ]
    }, {
        styles: stylesWithPage(rt, { ...a4, footer }, named),
        meta: { title: 'Fields and bookmarks', creator: 'Alice' }
    }));

    const change = (kind, id) => tracked.renderChangeMarker({ type: 'change-marker', kind, id });
    add('odt-tracked-changes', o.write({
        body: [
            tracked.renderTrackedChanges({ trackedChanges: [
                { id: 'ct1', kind: 'insertion', creator: 'Alice', date: '2026-05-13T10:00:00' },
                { id: 'ct2', kind: 'deletion', creator: 'Bob', date: '2026-05-13T11:00:00',
                  body: [para.renderParagraph(o.paragraph('removed sentence'))] },
                { id: 'ct3', kind: 'format-change', creator: 'Carol', date: '2026-05-13T12:00:00' }
            ] }),
            p(text('Kept '), change('text:change-start', 'ct1'), text('inserted'), change('text:change-end', 'ct1'), text(' text.')),
            p(text('Deleted here:'), change('text:change', 'ct2'), text(' end.')),
            p(change('text:change-start', 'ct3'), text('reformatted'), change('text:change-end', 'ct3'))
        ]
    }));

    add('odt-image-frames-shapes', o.write({
        body: [
            p(text('Logo '),
                { type: 'image', href: 'Pictures/dot.png', mimeType: 'image/png', name: 'Logo', width: '2cm', height: '2cm' },
                text(' inline.')),
            p({ type: 'image', href: 'Pictures/dot.png', name: 'Figure', anchorType: 'paragraph', width: '4cm', height: '3cm' },
                text('Anchored to the paragraph.')),
            p(text('A text box: '), {
                type: 'frame', anchorType: 'as-char', name: 'Box', width: '6cm', height: '2cm',
                child: { kind: 'text-box', attrs: {}, children: [para.renderParagraph(o.paragraph('Inside the box.'))] }
            }),
            p(text('Shapes follow.'),
                shapes.renderShape({ type: 'shape', kind: 'draw:rect', children: [], attrs: {
                    'text:anchor-type': 'paragraph', 'draw:name': 'Rect',
                    'svg:x': '1cm', 'svg:y': '1cm', 'svg:width': '4cm', 'svg:height': '2cm' } }),
                shapes.renderShape({ type: 'shape', kind: 'draw:ellipse', children: [], attrs: {
                    'text:anchor-type': 'paragraph', 'draw:name': 'Ellipse',
                    'svg:x': '6cm', 'svg:y': '1cm', 'svg:width': '3cm', 'svg:height': '2cm' } }),
                shapes.renderShape({ type: 'shape', kind: 'draw:line', children: [], attrs: {
                    'text:anchor-type': 'paragraph', 'draw:name': 'Line',
                    'svg:x1': '1cm', 'svg:y1': '4cm', 'svg:x2': '9cm', 'svg:y2': '4cm' } }),
                shapes.renderShape({
                    type: 'shape', kind: 'draw:custom-shape',
                    attrs: { 'text:anchor-type': 'paragraph', 'draw:name': 'Custom',
                             'svg:x': '10cm', 'svg:y': '1cm', 'svg:width': '3cm', 'svg:height': '3cm' },
                    children: [para.renderParagraph(o.paragraph('Shape text'))],
                    enhancedGeometry: { attrs: { 'svg:viewBox': '0 0 21600 21600', 'draw:type': 'rectangle' } }
                }))
        ],
        pictures: { 'Pictures/dot.png': PNG_1X1 }
    }));

    return out;
}

/** @param {ModuleRuntime} rt */
function odsDocuments(rt) {
    const o = rt.resolve('ods');
    const numberFormats = rt.resolve('numberFormats');
    const out = [];
    const add = (id, bytes) => out.push({ id, ext: 'ods', bytes });
    const row = (...cells) => ({ type: 'row', cells: cells.map((c) => o.cell(c)) });
    /** A typed cell whose display text is `shown`. */
    const typed = (valueType, value, shown, extra) => ({
        ...o.cell(shown), valueType, value, ...(extra || {})
    });

    add('ods-from-arrays', o.write(o.fromArrays([
        { name: 'Plain', rows: [['name', 'qty', 'ok'], ['apples', 4, true], ['pears', 2.5, false]] }
    ])));

    const values = o.sheet('Values', []);
    values.columns = [{ repeated: 3 }];
    values.rows = [
        row('type', 'value', 'note'),
        { type: 'row', cells: [o.cell('string'), o.cell('text value'), o.cell('')] },
        { type: 'row', cells: [o.cell('float'), o.cell(3.25), o.cell('')] },
        { type: 'row', cells: [o.cell('percentage'), typed('percentage', '0.42', '42%'), o.cell('')] },
        { type: 'row', cells: [o.cell('currency'), typed('currency', '19.99', '19.99 EUR', { currency: 'EUR' }), o.cell('')] },
        { type: 'row', cells: [o.cell('date'), o.cell(new Date('2026-03-01T00:00:00Z')), o.cell('')] },
        { type: 'row', cells: [o.cell('time'), typed('time', 'PT10H30M00S', '10:30:00'), o.cell('')] },
        { type: 'row', cells: [o.cell('boolean'), o.cell(true), o.cell('')] },
        { type: 'row', cells: [o.cell('empty'), o.cell(null), o.cell('blank cell')] }
    ];
    add('ods-value-types', o.write({ spreadsheet: { tables: [values] } }));

    const data = o.sheet('Data', []);
    data.columns = [{ styleName: 'co1' }, { styleName: 'co2', repeated: 2 }, { styleName: 'co2', visibility: 'collapse' }];
    data.rows = [
        { type: 'row', styleName: 'ro1', cells: [
            o.cell('Sales by region', { styleName: 'ce1' }),
            { type: 'cell', covered: true, children: [] },
            { type: 'cell', covered: true, children: [] },
            o.cell('hidden col')
        ] },
        row('region', 'q1', 'q2', 'hidden'),
        row('EU', 100, 120, 0),
        row('US', 80, 95, 0),
        { type: 'row', cells: [
            o.cell('total', { styleName: 'ce1' }),
            o.cell(180, { formula: 'of:=SUM([.B3:.B4])' }),
            o.cell(215, { formula: 'of:=SUM([.C3:.C4])' }),
            o.cell(0)
        ] },
        { type: 'row', cells: [
            o.cell('growth'),
            { ...o.cell('19%'), valueType: 'percentage', value: '0.194444444444444', formula: 'of:=[.C5]/[.B5]-1', styleName: 'ce3' },
            { type: 'cell', rowSpan: 2, ...o.cell('spans two rows') },
            o.cell('')
        ] },
        { type: 'row', cells: [
            o.cell('updated'),
            { ...o.cell('2026-03-31'), valueType: 'date', value: '2026-03-31', styleName: 'ce2' },
            { type: 'cell', covered: true, children: [] },
            o.cell('')
        ] },
        { type: 'row', repeated: 2, cells: [{ type: 'cell', repeated: 4, children: [] }] },
        { type: 'row', visibility: 'collapse', cells: [o.cell('hidden row')] }
    ];
    data.rows[0].cells[0].colSpan = 3;
    const notes = o.sheet('Notes', [['Second sheet'], ['with a single column']]);
    notes.columns = [{}];
    const styles = rt.resolve('odfStyles').empty();
    for (const el of numberFormats.render({ formats: [
        { kind: 'date', name: 'N1', parts: [
            { type: 'year', attrs: { 'number:style': 'long' } }, { type: 'text', attrs: {}, text: '-' },
            { type: 'month', attrs: { 'number:style': 'long' } }, { type: 'text', attrs: {}, text: '-' },
            { type: 'day', attrs: { 'number:style': 'long' } }
        ] },
        { kind: 'percentage', name: 'N2', parts: [
            { type: 'number', attrs: { 'number:decimal-places': '1', 'number:min-integer-digits': '1' } },
            { type: 'text', attrs: {}, text: '%' }
        ] }
    ] })) styles.styles.push(el);
    add('ods-formulas-merges-styles', o.write({
        spreadsheet: { tables: [data, notes] },
        automaticStyles: { styles: [
            { name: 'co1', family: 'table-column', properties: { tableColumn: { 'style:column-width': '4cm' } } },
            { name: 'co2', family: 'table-column', properties: { tableColumn: { 'style:column-width': '2.5cm' } } },
            { name: 'ro1', family: 'table-row', properties: { tableRow: { 'style:row-height': '0.8cm', 'style:use-optimal-row-height': 'false' } } },
            { name: 'ce1', family: 'table-cell',
              properties: { tableCell: { 'fo:background-color': '#dde8f5' }, text: { 'fo:font-weight': 'bold' } } },
            { name: 'ce2', family: 'table-cell', properties: {}, _extras: { attrs: { 'style:data-style-name': 'N1' } } },
            { name: 'ce3', family: 'table-cell', properties: {}, _extras: { attrs: { 'style:data-style-name': 'N2' } } }
        ] }
    }, {
        styles,
        meta: { title: 'Sales', creator: 'Alice' }
    }));

    return out;
}

/** @param {ModuleRuntime} rt */
function odpDocuments(rt) {
    const o = rt.resolve('odp');
    const para = rt.resolve('textParagraph');
    const heading = rt.resolve('textHeading');
    const frames = rt.resolve('drawFrame');
    const shapes = rt.resolve('drawShape');
    const table = rt.resolve('tableTable');
    const out = [];
    const add = (id, bytes) => out.push({ id, ext: 'odp', bytes });
    const styles = () => stylesWithPage(rt, { master: 'Default', layout: 'PM1', width: '28cm', height: '15.75cm' });
    const pr = (value) => para.renderParagraph(para.paragraph(value));
    const textBox = (name, x, y, width, height, children) => ({
        type: 'frame', name, x, y, width, height, child: { kind: 'text-box', attrs: {}, children }
    });
    const titleBox = (value) => textBox('Title', '2cm', '1cm', '24cm', '2.5cm',
        [heading.renderHeading(heading.heading(value, { outlineLevel: 1 }))]);

    add('odp-text-slides', o.write({
        slides: [
            o.slide('Welcome', { masterPageName: 'Default', frames: [
                titleBox('Welcome'),
                textBox('Subtitle', '2cm', '5cm', '24cm', '2cm', [pr('An odf presentation')])
            ] }),
            o.slide('Agenda', { masterPageName: 'Default', frames: [
                titleBox('Agenda'),
                textBox('Body', '2cm', '4cm', '24cm', '9cm', [pr('First point'), pr('Second point'), pr('Third point')])
            ], notes: { body: [frames.renderFrame(textBox('Notes', '2cm', '15cm', '17cm', '10cm', [pr('Speaker note.')]))] } }),
            o.slide('End', { masterPageName: 'Default' })
        ]
    }, { styles: styles(), meta: { title: 'Deck', creator: 'Alice' } }));

    const shapeSlide = o.slide('Shapes', { masterPageName: 'Default', frames: [
        titleBox('Process flow'),
        { type: 'frame', name: 'Picture', x: '18cm', y: '4cm', width: '6cm', height: '4cm',
          child: { kind: 'image', href: 'https://example.com/picture.png', mimeType: 'image/png' } }
    ] });
    shapeSlide._extras = { children: [
        shapes.renderShape({ type: 'shape', kind: 'draw:rect', children: [pr('Step 1')], attrs: {
            'draw:name': 'Step', 'draw:style-name': 'gr1',
            'svg:x': '2cm', 'svg:y': '5cm', 'svg:width': '5cm', 'svg:height': '2.5cm' } }),
        shapes.renderShape({ type: 'shape', kind: 'draw:ellipse', children: [], attrs: {
            'draw:name': 'Dot', 'draw:style-name': 'gr2',
            'svg:x': '9cm', 'svg:y': '5cm', 'svg:width': '2.5cm', 'svg:height': '2.5cm' } }),
        shapes.renderShape({ type: 'shape', kind: 'draw:line', children: [], attrs: {
            'draw:name': 'Arrow', 'svg:x1': '7cm', 'svg:y1': '6.25cm', 'svg:x2': '9cm', 'svg:y2': '6.25cm' } }),
        shapes.renderShape({
            type: 'shape', kind: 'draw:custom-shape', children: [pr('Done')],
            attrs: { 'draw:name': 'Callout', 'draw:style-name': 'gr2',
                     'svg:x': '13cm', 'svg:y': '5cm', 'svg:width': '4cm', 'svg:height': '2.5cm' },
            enhancedGeometry: { attrs: { 'svg:viewBox': '0 0 21600 21600', 'draw:type': 'ellipse' } }
        })
    ] };
    const tableSlide = o.slide('Figures', { masterPageName: 'Default', frames: [titleBox('Figures')] });
    tableSlide.frames.push({
        type: 'frame', name: 'Table', x: '2cm', y: '4cm', width: '12cm', height: '3cm',
        _extras: { children: [table.renderTable({
            type: 'table', name: 'Figures', columns: [{ repeated: 2 }],
            rows: [['Region', 'Sales'], ['EU', '120'], ['US', '85']].map((r) => ({
                type: 'row', cells: r.map((v) => ({ type: 'cell', valueType: 'string', value: v, children: [pr(v)] }))
            }))
        })] }
    });
    add('odp-shapes-picture-table', o.write({
        slides: [shapeSlide, tableSlide],
        automaticStyles: { styles: [
            { name: 'gr1', family: 'graphic', properties: { graphic: {
                'draw:fill': 'solid', 'draw:fill-color': '#4472c4', 'svg:stroke-color': '#2f5496' } } },
            { name: 'gr2', family: 'graphic', properties: { graphic: {
                'draw:fill': 'solid', 'draw:fill-color': '#ffe699', 'draw:stroke': 'none' } } }
        ] }
    }, { styles: styles() }));

    return out;
}

/**
 * Every document of the measure, in a fixed order.
 *
 * @param {ModuleRuntime} [rt]
 * @returns {{ id: string, ext: 'odt'|'ods'|'odp', bytes: Uint8Array }[]}
 */
export function writtenDocuments(rt = odfRuntime()) {
    return [...odtDocuments(rt), ...odsDocuments(rt), ...odpDocuments(rt)];
}

/**
 * Reads `bytes` with the package's reader for `ext` and writes the result
 * back with its writer. Every part of the read result the writer accepts
 * is passed back:
 *
 * - odt — `body`, `autoStyles`, `fontFaces`, `meta`, `settings`, `styles`
 *   and `package` (the carried parts: pictures, thumbnails, embedded
 *   objects, manifest directory entries). The document is read with
 *   `{ framesInRuns: true }` so a paragraph's frames are written back at
 *   their place in the text instead of after its runs.
 * - ods — `spreadsheet`, `automaticStyles`, `meta`, `settings`, `styles`,
 *   `package`.
 * - odp — `slides`, `automaticStyles`, `meta`, `settings`, `styles`,
 *   `package`.
 *
 * `meta:generator` is rewritten to this library (the writers' rule).
 *
 * @param {'odt'|'ods'|'odp'} ext
 * @param {Uint8Array} bytes
 * @param {ModuleRuntime} [rt]
 * @returns {Uint8Array}
 */
export function roundTrip(ext, bytes, rt = odfRuntime()) {
    const mod = rt.resolve(ext);
    const sidecars = (r) => ({ meta: r.meta, settings: r.settings, styles: r.styles, package: r.package });
    if (ext === 'ods') {
        const r = mod.read(bytes);
        return mod.write({ spreadsheet: r.spreadsheet, automaticStyles: r.automaticStyles, ...sidecars(r) });
    }
    if (ext === 'odp') {
        const r = mod.read(bytes);
        return mod.write({ slides: r.slides, automaticStyles: r.automaticStyles, ...sidecars(r) });
    }
    const r = mod.read(bytes, { framesInRuns: true });
    return mod.write({ body: r.body, autoStyles: r.autoStyles, fontFaces: r.fontFaces, ...sidecars(r) });
}
