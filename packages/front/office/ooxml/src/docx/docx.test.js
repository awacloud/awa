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
import { docxProperties } from './properties.js';
import { docxDrawing } from './drawing.js';
import { docxStructure } from './structure.js';
import { docxStyles } from './styles.js';
import { docxNumbering } from './numbering.js';
import { docxSettings } from './settings.js';
import { docxComments } from './comments.js';
import { docxFootnotes } from './footnotes.js';
import { docxHeaders } from './headers.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { docxCustomXml } from './customXml.js';
import { ooxmlMath } from '../math/math.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { docxWalker } from './docx-walker.js';
import { docx } from './docx.js';
import { docxText } from './docx-text.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

function build() {
    const xmlInst = ooxmlXml.factory();
    const relsInst = opcRelationships.factory(_errors, xmlInst);
    const ctInst = opcContentTypes.factory(_errors, xmlInst);
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const opcInst = opcPackage.factory(_errors,
        zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
        ctInst, relsInst, _shared);
    const propsInst = docxProperties.factory(xmlInst);
    const drawingInst = docxDrawing.factory(xmlInst,
        drawingmlShape.factory(xmlInst, _shared), _shared);
    const mathInst = ooxmlMath.factory(_errors, xmlInst);
    const structInst = docxStructure.factory(xmlInst, propsInst, drawingInst, mathInst);
    const stylesInst = docxStyles.factory(_errors, xmlInst, propsInst, _shared);
    const numInst = docxNumbering.factory(_errors, xmlInst, propsInst, _shared);
    const setInst = docxSettings.factory(_errors, xmlInst, _shared);
    const comInst = docxComments.factory(_errors, xmlInst, structInst, _shared);
    const fnInst = docxFootnotes.factory(_errors, xmlInst, structInst, _shared);
    const hdrInst = docxHeaders.factory(_errors, xmlInst, structInst, _shared);
    const mcInst = markupCompatibility.factory(xmlInst);
    const chartInst = drawingmlChart.factory(_errors, xmlInst, _shared);
    const cxInst = docxCustomXml.factory(_errors, xmlInst, _shared);
    const walkerInst = docxWalker.factory();
    return docx.factory(_errors, docxText.factory(), opcInst, xmlInst, relsInst,
        structInst, stylesInst, numInst, setInst, comInst, fnInst, hdrInst,
        drawingInst, mcInst, chartInst, cxInst, walkerInst, _shared);
}

describe('docx — basic', () => {
    test('module metadata', () => {
        expect(docx.name).toBe('docx');
        expect(docx.dependencies).toContain('opcPackage');
    });

    test('write/read roundtrip on simple text', () => {
        const d = build();
        const doc = d.fromText(['Hello, world.', 'Second paragraph.']);
        const bytes = d.write(doc);
        const result = d.read(bytes);
        expect(result.document.body).toHaveLength(2);
        expect(d.toText(result.document)).toBe('Hello, world.\nSecond paragraph.');
    });

    test('preserves unicode and whitespace', () => {
        const d = build();
        const doc = d.fromText(['héllo  世界', '   leading spaces']);
        const bytes = d.write(doc);
        const back = d.read(bytes);
        expect(d.toText(back.document))
            .toBe('héllo  世界\n   leading spaces');
    });

    test('empty document is valid', () => {
        const d = build();
        const bytes = d.write({ type: 'document', body: [] });
        const back = d.read(bytes);
        expect(back.document.body).toEqual([]);
    });

    test('escapes XML special chars in text', () => {
        const d = build();
        const doc = d.fromText(['A < B & C > D "quoted"']);
        const bytes = d.write(doc);
        const back = d.read(bytes);
        expect(d.toText(back.document)).toBe('A < B & C > D "quoted"');
    });
});

describe('docx — run properties', () => {
    test('roundtrip bold/italic/underline/color/size', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('formatted', {
                rPr: { bold: true, italic: true, underline: 'single',
                       color: 'FF0000', size: 28, font: 'Arial' }
            })]
        };
        const back = d.read(d.write(doc));
        const rPr = back.document.body[0].children[0].rPr;
        expect(rPr.bold).toBe(true);
        expect(rPr.italic).toBe(true);
        expect(rPr.underline).toBe('single');
        expect(rPr.color).toBe('FF0000');
        expect(rPr.size).toBe(28);
        expect(rPr.font).toBe('Arial');
    });

    test('toggle off via w:val=0', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('off', { rPr: { bold: false } })]
        };
        const back = d.read(d.write(doc));
        expect(back.document.body[0].children[0].rPr.bold).toBe(false);
    });

    test('vertAlign and strike', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('x', { rPr: { vertAlign: 'superscript', strike: true } })]
        };
        const back = d.read(d.write(doc));
        const rPr = back.document.body[0].children[0].rPr;
        expect(rPr.vertAlign).toBe('superscript');
        expect(rPr.strike).toBe(true);
    });
});

describe('docx — paragraph properties', () => {
    test('alignment + style + indent + spacing', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('aligned', {
                pPr: {
                    align: 'center',
                    pStyle: 'Heading1',
                    indent: { left: 720, firstLine: 360 },
                    spacing: { before: 240, after: 120, line: 360 }
                }
            })]
        };
        const back = d.read(d.write(doc));
        const pPr = back.document.body[0].pPr;
        expect(pPr.align).toBe('center');
        expect(pPr.pStyle).toBe('Heading1');
        expect(pPr.indent).toEqual({ left: 720, firstLine: 360 });
        expect(pPr.spacing).toEqual({ before: 240, after: 120, line: 360 });
    });

    test('numPr (list reference)', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('item', { pPr: { numPr: { ilvl: 0, numId: 1 } } })]
        };
        // A list reference needs the numbering part it points into:
        // write() throws docx/numbering-missing without opts.numbering.
        const numbering = { abstractNums: [{ abstractNumId: 0,
            levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.' }] }],
            nums: [{ numId: 1, abstractNumId: 0 }] };
        const back = d.read(d.write(doc, { numbering }));
        expect(back.document.body[0].pPr.numPr).toEqual({ ilvl: 0, numId: 1 });
    });
});

describe('docx — runs structure', () => {
    test('break + tab in a run', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [{
                    type: 'run',
                    children: [
                        { type: 'text', value: 'A' },
                        { type: 'tab' },
                        { type: 'text', value: 'B' },
                        { type: 'break', kind: 'page' },
                        { type: 'text', value: 'C' }
                    ]
                }]
            }]
        };
        const back = d.read(d.write(doc));
        const children = back.document.body[0].children[0].children;
        expect(children).toHaveLength(5);
        expect(children[1]).toEqual({ type: 'tab' });
        expect(children[3]).toEqual({ type: 'break', kind: 'page' });
    });

    test('multiple runs in a paragraph', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('plain '),
                    d.run('bold', { bold: true }),
                    d.run(' rest')
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const runs = back.document.body[0].children;
        expect(runs).toHaveLength(3);
        expect(runs[1].rPr.bold).toBe(true);
        expect(d.toText(back.document)).toBe('plain bold rest');
    });
});

describe('docx — tables', () => {
    test('roundtrip simple 2x2 table', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.tableFromRows([['A', 'B'], ['C', 'D']])]
        };
        const back = d.read(d.write(doc));
        const t = back.document.body[0];
        expect(t.type).toBe('table');
        expect(t.rows).toHaveLength(2);
        expect(t.rows[0].cells).toHaveLength(2);
        expect(d.toText(back.document)).toBe('A\tB\nC\tD');
    });

    test('cell with multiple paragraphs', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [{
                        type: 'cell',
                        children: [d.paragraph('line 1'), d.paragraph('line 2')]
                    }, {
                        type: 'cell',
                        children: [d.paragraph('other')]
                    }]
                }]
            }]
        };
        const back = d.read(d.write(doc));
        expect(back.document.body[0].rows[0].cells[0].children).toHaveLength(2);
    });

    test('cell properties (gridSpan, vMerge, width)', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [{
                        type: 'cell',
                        tcPr: { gridSpan: 2, width: { w: '5000', type: 'dxa' } },
                        children: [d.paragraph('span')]
                    }]
                }]
            }]
        };
        const back = d.read(d.write(doc));
        const tcPr = back.document.body[0].rows[0].cells[0].tcPr;
        expect(tcPr.gridSpan).toBe(2);
        expect(tcPr.width).toEqual({ w: '5000', type: 'dxa' });
    });
});

describe('docx — sections', () => {
    test('roundtrip page size + margins', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('content')],
            sectPr: {
                pageSize: { w: 12240, h: 15840, orient: 'portrait' },
                pageMargin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
            }
        };
        const back = d.read(d.write(doc));
        expect(back.document.sectPr.pageSize)
            .toEqual({ w: 12240, h: 15840, orient: 'portrait' });
        expect(back.document.sectPr.pageMargin.top).toBe(1440);
    });
});

describe('docx — hyperlinks', () => {
    test('external hyperlink with relationship', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('Visit '),
                    d.hyperlink('Anthropic', 'https://anthropic.com',
                                { rId: 'rIdLink1' })
                ]
            }]
        };
        const bytes = d.write(doc);
        const back = d.read(bytes);
        const link = back.document.body[0].children[1];
        expect(link.type).toBe('hyperlink');
        expect(link.rId).toBe('rIdLink1');
        expect(back.hyperlinks.rIdLink1.target).toBe('https://anthropic.com');
        expect(back.hyperlinks.rIdLink1.external).toBe(true);
    });

    test('internal hyperlink via anchor', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [{
                    type: 'hyperlink',
                    anchor: 'top',
                    children: [d.run('back')]
                }]
            }]
        };
        const back = d.read(d.write(doc));
        const link = back.document.body[0].children[0];
        expect(link.anchor).toBe('top');
        expect(link.rId).toBeUndefined();
    });
});

describe('docx — bookmarks and tracked changes', () => {
    test('bookmark start/end roundtrip', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    { type: 'bookmarkStart', id: '1', name: 'top' },
                    d.run('anchor'),
                    { type: 'bookmarkEnd', id: '1' }
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids[0]).toEqual({ type: 'bookmarkStart', id: '1', name: 'top' });
        expect(kids[2]).toEqual({ type: 'bookmarkEnd', id: '1' });
    });

    test('ins/del wrap runs with author + date', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    { type: 'ins', id: '0', author: 'Alice', date: '2026-05-08T10:00:00Z',
                      children: [d.run('inserted')] },
                    { type: 'del', id: '1', author: 'Bob',
                      children: [{
                          type: 'run',
                          children: [{ type: 'delText', value: 'removed' }]
                      }] }
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids[0].type).toBe('ins');
        expect(kids[0].author).toBe('Alice');
        expect(kids[1].type).toBe('del');
        expect(kids[1].children[0].children[0].type).toBe('delText');
    });

    test('comment range markers + reference', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    { type: 'commentRangeStart', id: '0' },
                    d.run('text'),
                    { type: 'commentRangeEnd', id: '0' },
                    { type: 'run',
                      rPr: { rStyle: 'CommentReference' },
                      children: [{ type: 'commentReference', id: '0' }] }
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids[0].type).toBe('commentRangeStart');
        expect(kids[2].type).toBe('commentRangeEnd');
        expect(kids[3].children[0].type).toBe('commentReference');
    });

    test('footnote + endnote references in runs', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('See '),
                    { type: 'run', children: [{ type: 'footnoteReference', id: '1' }] },
                    d.run(' or '),
                    { type: 'run', children: [{ type: 'endnoteReference', id: '1' }] }
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids[1].children[0]).toEqual({ type: 'footnoteReference', id: '1' });
        expect(kids[3].children[0]).toEqual({ type: 'endnoteReference', id: '1' });
    });
});

describe('docx — L2 parts integration', () => {
    test('writes + reads numbering part', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.listParagraph('First', 1, 0), d.listParagraph('Second', 1, 0)]
        };
        const bytes = d.write(doc, {
            numbering: {
                abstractNums: [{
                    abstractNumId: 0, multiLevelType: 'singleLevel',
                    levels: [{ ilvl: 0, start: 1, numFmt: 'decimal',
                               lvlText: '%1.', lvlJc: 'left' }]
                }],
                nums: [{ numId: 1, abstractNumId: 0 }]
            }
        });
        const back = d.read(bytes);
        expect(back.numbering).toBeDefined();
        expect(back.numbering.nums[0].numId).toBe(1);
        expect(back.document.body[0].pPr.numPr).toEqual({ ilvl: 0, numId: 1 });
    });

    test('writes + reads settings part', () => {
        const d = build();
        const bytes = d.write({ type: 'document', body: [d.paragraph('x')] }, {
            settings: { defaultTabStop: 720, evenAndOddHeaders: true }
        });
        const back = d.read(bytes);
        expect(back.settings.defaultTabStop).toBe(720);
        expect(back.settings.evenAndOddHeaders).toBe(true);
    });

    test('writes + reads comments part', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    { type: 'commentRangeStart', id: '0' },
                    d.run('quoted'),
                    { type: 'commentRangeEnd', id: '0' },
                    { type: 'run', children: [{ type: 'commentReference', id: '0' }] }
                ]
            }]
        };
        const bytes = d.write(doc, {
            comments: {
                comments: [{ id: 0, author: 'Reviewer',
                             body: [d.paragraph('Looks good')] }]
            }
        });
        const back = d.read(bytes);
        expect(back.comments.comments[0].author).toBe('Reviewer');
        expect(back.comments.comments[0].body[0].children[0].children[0].value)
            .toBe('Looks good');
    });

    test('writes + reads footnotes + endnotes parts', () => {
        const d = build();
        const bytes = d.write({ type: 'document', body: [d.paragraph('see ref')] }, {
            footnotes: { notes: [
                { id: -1, noteType: 'separator', body: [d.paragraph('')] },
                { id: 1, body: [d.paragraph('A footnote.')] }
            ]},
            endnotes: { notes: [{ id: 1, body: [d.paragraph('An endnote.')] }] }
        });
        const back = d.read(bytes);
        expect(back.footnotes.notes).toHaveLength(2);
        expect(back.footnotes.notes[1].body[0].children[0].children[0].value)
            .toBe('A footnote.');
        expect(back.endnotes.notes[0].body[0].children[0].children[0].value)
            .toBe('An endnote.');
    });

    test('writes + reads headers + footers with sectPr references', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [d.paragraph('content')],
            sectPr: {
                pageSize: { w: 12240, h: 15840 },
                headerReferences: [{ type: 'default', rId: 'rIdH1' }],
                footerReferences: [{ type: 'default', rId: 'rIdF1' }]
            }
        };
        const bytes = d.write(doc, {
            headers: {
                rIdH1: { type: 'header', body: [d.paragraph('Top of every page')] }
            },
            footers: {
                rIdF1: { type: 'footer', body: [d.paragraph('Page footer')] }
            }
        });
        const back = d.read(bytes);
        expect(back.document.sectPr.headerReferences[0].rId).toBe('rIdH1');
        expect(back.headers.rIdH1.body[0].children[0].children[0].value)
            .toBe('Top of every page');
        expect(back.footers.rIdF1.body[0].children[0].children[0].value)
            .toBe('Page footer');
    });
});

describe('docx — inline images', () => {
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

    test('imageRun helper produces a run wrapping a drawing', () => {
        const d = build();
        const run = d.imageRun(PNG_1X1, { cx: '1in', cy: '1in' });
        expect(run.type).toBe('run');
        expect(run.children[0].type).toBe('drawing');
    });

    test('write/read roundtrip preserves the image part', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [d.imageRun(PNG_1X1, {
                    cx: '2in', cy: '1.5in', name: 'fig.png',
                    description: 'Figure 1'
                })]
            }]
        };
        const bytes = d.write(doc);
        const back = d.read(bytes);

        const drawing = back.document.body[0].children[0].children[0];
        expect(drawing.type).toBe('drawing');
        expect(drawing.mode).toBe('inline');
        expect(drawing.cx).toBe(1828800);
        expect(drawing.cy).toBe(1371600);
        expect(drawing.description).toBe('Figure 1');
        // embedRef populated and points at a real image.
        expect(drawing.embedRef).toBeDefined();
        expect(back.images[drawing.embedRef]).toBeDefined();
        expect(back.images[drawing.embedRef].data).toEqual(PNG_1X1);
        expect(back.images[drawing.embedRef].contentType).toBe('image/png');
    });

    test('content type Default for png is declared', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [d.imageRun(PNG_1X1, { cx: '1in', cy: '1in' })]
            }]
        };
        const bytes = d.write(doc);
        const back = d.read(bytes);
        expect(back.package.contentTypes.defaults.png).toBe('image/png');
    });

    test('multiple images dedupe to one part when same buffer', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.imageRun(PNG_1X1, { cx: '1in', cy: '1in' }),
                    d.imageRun(PNG_1X1, { cx: '2in', cy: '2in' })
                ]
            }]
        };
        const bytes = d.write(doc);
        const back = d.read(bytes);
        // Same Uint8Array → single image part, both drawings reference the same rId.
        const r1 = back.document.body[0].children[0].children[0];
        const r2 = back.document.body[0].children[1].children[0];
        expect(r1.embedRef).toBe(r2.embedRef);
        expect(Object.keys(back.images)).toHaveLength(1);
    });

    test('image inside a table cell roundtrips', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'table',
                rows: [{
                    type: 'row',
                    cells: [{
                        type: 'cell',
                        children: [{
                            type: 'paragraph',
                            children: [d.imageRun(PNG_1X1, { cx: '0.5in', cy: '0.5in' })]
                        }]
                    }]
                }]
            }]
        };
        const bytes = d.write(doc);
        const back = d.read(bytes);
        const drawing = back.document.body[0].rows[0].cells[0]
            .children[0].children[0].children[0];
        expect(drawing.type).toBe('drawing');
        expect(back.images[drawing.embedRef].data).toEqual(PNG_1X1);
    });
});

describe('docx — inline charts', () => {
    test('chartRun roundtrips chart spec via word/charts/chart1.xml', () => {
        const d = build();
        const chartMod = drawingmlChart.factory(_errors, ooxmlXml.factory(), _shared);
        const spec = chartMod.barChart({
            title: 'Quarterly',
            series: [{ name: 'Q1', categories: ['Jan','Feb','Mar'],
                        values: [100, 120, 90] }],
            legend: { position: 'b' }
        });
        const doc = {
            type: 'document',
            body: [
                d.paragraph('See chart:'),
                {
                    type: 'paragraph',
                    children: [d.chartRun(spec, { cx: '5in', cy: '3in' })]
                }
            ]
        };
        const back = d.read(d.write(doc));
        const drawing = back.document.body[1].children[0].children[0];
        expect(drawing.type).toBe('drawing');
        expect(drawing.kind).toBe('chart');
        expect(drawing.chartRef).toBeDefined();
        expect(drawing.chart).toBeDefined();
        expect(drawing.chart.plotType).toBe('bar');
        expect(drawing.chart.title).toBe('Quarterly');
        expect(drawing.chart.series[0].values).toEqual([100, 120, 90]);
        expect(back.charts[drawing.chartRef].partName)
            .toMatch(/^\/word\/charts\/chart\d+\.xml$/);
    });
});

describe('docx — Word fields', () => {
    test('fldSimple PAGE field roundtrips', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('Page '),
                    d.fieldSimple('PAGE', '1'),
                    d.run(' of '),
                    d.fieldSimple('NUMPAGES', '10')
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids[1].type).toBe('fldSimple');
        expect(kids[1].instr).toBe('PAGE');
        expect(kids[1].children[0].children[0].value).toBe('1');
        expect(kids[3].instr).toBe('NUMPAGES');
    });

    test('fldChar complex field cycle (TOC) roundtrips', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: d.fieldComplex('TOC \\o "1-3" \\h \\z \\u',
                                          'Table of Contents')
            }]
        };
        const back = d.read(d.write(doc));
        const kids = back.document.body[0].children;
        expect(kids).toHaveLength(5);
        expect(kids[0].children[0].type).toBe('fldChar');
        expect(kids[0].children[0].kind).toBe('begin');
        expect(kids[1].children[0].type).toBe('instrText');
        expect(kids[1].children[0].value).toContain('TOC');
        expect(kids[2].children[0].kind).toBe('separate');
        expect(kids[3].children[0].value).toBe('Table of Contents');
        expect(kids[4].children[0].kind).toBe('end');
    });
});

describe('docx — inline shapes (wps:wsp)', () => {
    test('shapeRun with rect + fill + line roundtrips', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [
                d.paragraph('Diagram:'),
                {
                    type: 'paragraph',
                    children: [d.shapeRun('rect', {
                        cx: '3in', cy: '1.5in',
                        fill: '4472C4',
                        line: { color: '2F5496', width: 12700 }
                    })]
                }
            ]
        };
        const back = d.read(d.write(doc));
        const drawing = back.document.body[1].children[0].children[0];
        expect(drawing.type).toBe('drawing');
        expect(drawing.kind).toBe('shape');
        expect(drawing.shapeProps.geom).toBe('rect');
        expect(drawing.shapeProps.fill).toEqual({ rgb: '4472C4' });
        expect(drawing.shapeProps.line.color).toBe('2F5496');
    });
});

describe('docx — content controls (SDT)', () => {
    test('inline SDT with dataBinding roundtrips', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('Customer: '),
                    {
                        type: 'sdt',
                        properties: {
                            alias: 'CustomerName',
                            tag: 'customer',
                            id: 1234,
                            kind: 'text',
                            dataBinding: {
                                xpath: '/ns0:order/ns0:customer[1]',
                                prefixMappings: "xmlns:ns0='http://example.com'",
                                storeItemID: '{ABC12345-6789-4ABC-DEF0-1234567890AB}'
                            }
                        },
                        children: [d.run('Acme Corp')]
                    }
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const sdt = back.document.body[0].children[1];
        expect(sdt.type).toBe('sdt');
        expect(sdt.properties.alias).toBe('CustomerName');
        expect(sdt.properties.tag).toBe('customer');
        expect(sdt.properties.kind).toBe('text');
        expect(sdt.properties.dataBinding.xpath)
            .toBe('/ns0:order/ns0:customer[1]');
        expect(sdt.children[0].children[0].value).toBe('Acme Corp');
    });

    test('block-level SDT wrapping a paragraph', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'blockSdt',
                properties: {
                    alias: 'Section A',
                    tag: 'sectionA',
                    dataBinding: {
                        xpath: '/root/sectionA',
                        storeItemID: '{12345678-1234-4234-8234-123456789012}'
                    }
                },
                children: [d.paragraph('Bound section content.')]
            }]
        };
        const back = d.read(d.write(doc));
        const block = back.document.body[0];
        expect(block.type).toBe('blockSdt');
        expect(block.properties.alias).toBe('Section A');
        expect(block.children[0].type).toBe('paragraph');
    });

    test('SDT with showingPlcHdr flag', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [{
                    type: 'sdt',
                    properties: { tag: 'placeholder', showingPlcHdr: true },
                    children: [d.run('Click here')]
                }]
            }]
        };
        const back = d.read(d.write(doc));
        expect(back.document.body[0].children[0].properties.showingPlcHdr)
            .toBe(true);
    });
});

describe('docx — custom XML data binding', () => {
    test('writes customXml + itemProps parts with rels', () => {
        const d = build();
        const customXmlData =
            '<?xml version="1.0" encoding="UTF-8"?>'
            + '<order xmlns="http://example.com/order">'
            + '<customer>Acme Corp</customer>'
            + '<total>1234.56</total>'
            + '</order>';
        const bytes = d.write({
            type: 'document',
            body: [d.paragraph('Bound document')]
        }, {
            customXml: [{
                xml: customXmlData,
                schemaRefs: ['http://example.com/order']
            }]
        });
        const back = d.read(bytes);
        expect(back.customXml).toBeDefined();
        expect(back.customXml).toHaveLength(1);
        expect(back.customXml[0].xml).toContain('<customer>Acme Corp</customer>');
        expect(back.customXml[0].storeItemID).toMatch(/^\{[0-9A-F-]+\}$/);
        expect(back.customXml[0].schemaRefs).toEqual(['http://example.com/order']);
        expect(back.package.parts['/customXml/item1.xml']).toBeDefined();
        expect(back.package.parts['/customXml/itemProps1.xml']).toBeDefined();
    });

    test('content type Default xml + Override customXmlProperties', () => {
        const d = build();
        const bytes = d.write({
            type: 'document',
            body: [d.paragraph('x')]
        }, {
            customXml: [{ xml: '<root/>' }]
        });
        const back = d.read(bytes);
        expect(back.package.contentTypes.defaults.xml).toBe('application/xml');
        expect(back.package.contentTypes.overrides['/customXml/itemProps1.xml'])
            .toContain('customXmlProperties+xml');
    });

    test('multiple custom XML items get distinct GUIDs', () => {
        const d = build();
        const bytes = d.write({
            type: 'document',
            body: [d.paragraph('m')]
        }, {
            customXml: [
                { xml: '<a/>' },
                { xml: '<b/>' },
                { xml: '<c/>',
                  storeItemID: '{12345678-1234-4234-8234-123456789012}' }
            ]
        });
        const back = d.read(bytes);
        expect(back.customXml).toHaveLength(3);
        const ids = back.customXml.map(c => c.storeItemID);
        expect(new Set(ids).size).toBe(3);
        expect(ids[2]).toBe('{12345678-1234-4234-8234-123456789012}');
    });

    test('SDT bound to customXml item via shared storeItemID', () => {
        const d = build();
        const guid = '{ABC12345-6789-4ABC-8DEF-1234567890AB}';
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('Customer: '),
                    {
                        type: 'sdt',
                        properties: {
                            alias: 'CustomerName',
                            kind: 'text',
                            dataBinding: {
                                xpath: '/order/customer',
                                storeItemID: guid
                            }
                        },
                        children: [d.run('(default)')]
                    }
                ]
            }]
        };
        const bytes = d.write(doc, {
            customXml: [{
                xml: '<order><customer>Acme</customer></order>',
                storeItemID: guid
            }]
        });
        const back = d.read(bytes);
        const sdt = back.document.body[0].children[1];
        expect(sdt.properties.dataBinding.storeItemID).toBe(guid);
        expect(back.customXml[0].storeItemID).toBe(guid);
    });
});

describe('docx — repeating sections + templating', () => {
    test('repeatingSection / repeatingSectionItem builders produce typed nodes', () => {
        const d = build();
        const item = d.repeatingSectionItem([d.paragraph('row')]);
        expect(item.type).toBe('blockSdt');
        expect(item.properties.kind).toBe('repeatingSectionItem');

        const section = d.repeatingSection({ tag: 'rows' }, [item]);
        expect(section.type).toBe('blockSdt');
        expect(section.properties.kind).toBe('repeatingSection');
        expect(section.properties.tag).toBe('rows');
        expect(section.children).toEqual([item]);
    });

    test('repeating section roundtrips through write/read', () => {
        const d = build();
        const doc = {
            type: 'document',
            body: [
                d.paragraph('Order list:'),
                d.repeatingSection(
                    { tag: 'orders',
                      dataBinding: { xpath: '/orders/order',
                                      storeItemID: '{12345678-1234-4234-8234-123456789012}' } },
                    [d.repeatingSectionItem([
                        {
                            type: 'paragraph',
                            children: [
                                d.run('Customer: '),
                                d.boundText({ tag: 'customer' }, '(name)')
                            ]
                        }
                    ])]
                )
            ]
        };
        const back = d.read(d.write(doc));
        const sec = back.document.body[1];
        expect(sec.type).toBe('blockSdt');
        expect(sec.properties.kind).toBe('repeatingSection');
        expect(sec.properties.tag).toBe('orders');
        expect(sec.properties.dataBinding.xpath).toBe('/orders/order');
        // First (and only) item is the template.
        expect(sec.children).toHaveLength(1);
        const item = sec.children[0];
        expect(item.properties.kind).toBe('repeatingSectionItem');
        // Item contains the bound paragraph.
        const bound = item.children[0].children[1];
        expect(bound.type).toBe('sdt');
        expect(bound.properties.tag).toBe('customer');
    });

    test('boundText builds an inline text SDT', () => {
        const d = build();
        const node = d.boundText({ tag: 'customer',
                                    dataBinding: { xpath: '/order/customer' } },
                                   '(default)');
        expect(node.type).toBe('sdt');
        expect(node.properties.kind).toBe('text');
        expect(node.properties.tag).toBe('customer');
        expect(node.children[0].type).toBe('run');
        expect(node.children[0].children[0].value).toBe('(default)');
    });

    test('substituteByTag replaces SDT content by mapping', () => {
        const d = build();
        const tree = {
            type: 'paragraph',
            children: [
                d.run('Hello '),
                d.boundText({ tag: 'name' }, '(name)'),
                d.run(' — '),
                d.boundText({ tag: 'email' }, '(email)')
            ]
        };
        d.substituteByTag(tree, { name: 'Alice', email: 'a@x.com' });
        expect(tree.children[1].children[0].children[0].value).toBe('Alice');
        expect(tree.children[3].children[0].children[0].value).toBe('a@x.com');
    });

    test('substituteByTag does not modify section/item SDTs', () => {
        const d = build();
        const section = d.repeatingSection(
            { tag: 'rows' },
            [d.repeatingSectionItem([d.paragraph('row')])]);
        d.substituteByTag(section, { rows: 'should not replace' });
        // section children still hold the item template, not the value.
        expect(section.children[0].properties.kind).toBe('repeatingSectionItem');
    });

    test('expandRepeating clones the item template per record', () => {
        const d = build();
        const section = d.repeatingSection(
            { tag: 'orders' },
            [d.repeatingSectionItem([
                {
                    type: 'paragraph',
                    children: [
                        d.run('• '),
                        d.boundText({ tag: 'customer' }, '(name)'),
                        d.run(' (#'),
                        d.boundText({ tag: 'orderId' }, '?'),
                        d.run(')')
                    ]
                }
            ])]
        );
        d.expandRepeating(section, [
            { customer: 'Alice', orderId: '1001' },
            { customer: 'Bob',   orderId: '1002' },
            { customer: 'Carol', orderId: '1003' }
        ]);
        expect(section.children).toHaveLength(3);
        // Each item is a clone of the template (independent objects).
        expect(section.children[0].properties.kind).toBe('repeatingSectionItem');
        expect(section.children[0]).not.toBe(section.children[1]);
        // Values were substituted in each clone.
        const aliceP = section.children[0].children[0];
        const bobP = section.children[1].children[0];
        expect(aliceP.children[1].children[0].children[0].value).toBe('Alice');
        expect(bobP.children[1].children[0].children[0].value).toBe('Bob');
        expect(aliceP.children[3].children[0].children[0].value).toBe('1001');
    });

    test('expanded section roundtrips with multiple items', () => {
        const d = build();
        const section = d.repeatingSection(
            { tag: 'rows' },
            [d.repeatingSectionItem([
                {
                    type: 'paragraph',
                    children: [d.run('— '), d.boundText({ tag: 'item' }, '?')]
                }
            ])]
        );
        d.expandRepeating(section, [
            { item: 'apples' }, { item: 'oranges' }, { item: 'pears' }
        ]);
        const doc = { type: 'document', body: [section] };
        const back = d.read(d.write(doc));
        const sec = back.document.body[0];
        expect(sec.children).toHaveLength(3);
        const texts = sec.children.map(item =>
            item.children[0].children[1].children[0].children[0].value);
        expect(texts).toEqual(['apples', 'oranges', 'pears']);
    });
});

describe('docx — math (OMML)', () => {
    test('inline math in a paragraph roundtrips', () => {
        const d = build();
        const m = ooxmlMath.factory(_errors, ooxmlXml.factory());
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    d.run('Pythagoras: '),
                    m.oMath(
                        m.sup(m.r('a'), m.r('2')),
                        m.r(' + '),
                        m.sup(m.r('b'), m.r('2')),
                        m.r(' = '),
                        m.sup(m.r('c'), m.r('2'))
                    )
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const inline = back.document.body[0].children[1];
        expect(inline.type).toBe('oMath');
        expect(inline.children).toHaveLength(5);
        expect(inline.children[0].type).toBe('sSup');
        expect(inline.children[0].base[0].text).toBe('a');
        expect(inline.children[0].sup[0].text).toBe('2');
    });

    test('block math (oMathPara) at body level', () => {
        const d = build();
        const m = ooxmlMath.factory(_errors, ooxmlXml.factory());
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
        expect(block.children[0].type).toBe('oMath');
        const expr = block.children[0].children;
        expect(expr[0].text).toBe('x = ');
        expect(expr[1].type).toBe('frac');
        const num = expr[1].numerator;
        expect(num[1].type).toBe('rad');
    });

    test('integral n-ary operator', () => {
        const d = build();
        const m = ooxmlMath.factory(_errors, ooxmlXml.factory());
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [
                    m.oMath(m.nary('∫', m.r('0'), m.r('1'),
                                    [m.sup(m.r('x'), m.r('2')), m.r(' dx')]))
                ]
            }]
        };
        const back = d.read(d.write(doc));
        const nary = back.document.body[0].children[0].children[0];
        expect(nary.type).toBe('nary');
        expect(nary.op).toBe('∫');
        expect(nary.sub[0].text).toBe('0');
        expect(nary.sup[0].text).toBe('1');
    });

    test('matrix wrapped in delimiters', () => {
        const d = build();
        const m = ooxmlMath.factory(_errors, ooxmlXml.factory());
        const doc = {
            type: 'document',
            body: [{
                type: 'paragraph',
                children: [m.oMath(
                    m.delim(
                        m.matrix([
                            [m.r('1'), m.r('0')],
                            [m.r('0'), m.r('1')]
                        ]),
                        { open: '[', close: ']' }
                    )
                )]
            }]
        };
        const back = d.read(d.write(doc));
        const delim = back.document.body[0].children[0].children[0];
        expect(delim.type).toBe('d');
        expect(delim.open).toBe('[');
        const mat = delim.children[0][0];
        expect(mat.type).toBe('m');
        expect(mat.rows).toHaveLength(2);
    });
});

describe('docx — markup compatibility', () => {
    test('mc:AlternateContent with w14 Choice + Fallback resolves to Fallback', () => {
        const d = build();
        const xmlInst = ooxmlXml.factory();
        const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<w:document'
            + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
            + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
            + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"'
            + ' mc:Ignorable="w14">'
            + '<w:body>'
            + '<w:p><w:r><w:rPr>'
            + '<w:b/>'
            + '<w14:glow w14:rad="50000"><w14:srgbClr w14:val="FF0000"/></w14:glow>'
            + '</w:rPr><w:t>Bold with extension</w:t></w:r></w:p>'
            + '<w:p>'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14">'
            + '<w:r><w:t>Modern variant</w:t></w:r>'
            + '</mc:Choice>'
            + '<mc:Fallback>'
            + '<w:r><w:t>Fallback variant</w:t></w:r>'
            + '</mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</w:p>'
            + '</w:body></w:document>';

        // Build a docx package containing this document.
        const bs = bitstream.factory();
        const hf = huffman.factory(bs);
        const opcInst = opcPackage.factory(_errors,
            zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
            opcContentTypes.factory(_errors, xmlInst),
            opcRelationships.factory(_errors, xmlInst), _shared);
        const pkg = opcInst.empty();
        opcInst.setPart(pkg, '/word/document.xml',
            new TextEncoder().encode(documentXml),
            d.CT_DOCUMENT);
        opcInst.setRels(pkg, '/', [{
            Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml'
        }]);
        const bytes = opcInst.write(pkg);

        const parsed = d.read(bytes);
        // First paragraph: bold preserved, w14:glow stripped (Ignorable).
        const p1 = parsed.document.body[0];
        expect(p1.children[0].rPr.bold).toBe(true);
        expect(p1.children[0].rPr._extras).toBeUndefined();

        // Second paragraph: AlternateContent resolved to Fallback.
        const p2 = parsed.document.body[1];
        expect(p2.children[0].children[0].value).toBe('Fallback variant');
    });
});

describe('docx — preserve unknowns', () => {
    test('unknown rPr child is preserved across roundtrip', () => {
        const d = build();
        const xmlInst = ooxmlXml.factory();
        const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:body>'
            + '<w:p><w:r><w:rPr>'
            + '<w:b/>'
            + '<w:lang w:val="fr-FR"/>'
            + '</w:rPr><w:t>x</w:t></w:r></w:p>'
            + '</w:body>'
            + '</w:document>';

        // Construct a minimal docx package containing this document.
        const bs = bitstream.factory();
        const hf = huffman.factory(bs);
        const opcInst = opcPackage.factory(_errors,
            zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory()),
            opcContentTypes.factory(_errors, xmlInst),
            opcRelationships.factory(_errors, xmlInst), _shared);
        const pkg = opcInst.empty();
        opcInst.setPart(pkg, '/word/document.xml',
            new TextEncoder().encode(documentXml),
            d.CT_DOCUMENT);
        opcInst.setRels(pkg, '/', [{
            Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml'
        }]);
        const bytes = opcInst.write(pkg);

        const parsed = d.read(bytes);
        const rPr = parsed.document.body[0].children[0].rPr;
        expect(rPr.bold).toBe(true);
        expect(rPr._extras).toBeDefined();
        expect(rPr._extras.some(n => n.name === 'w:lang')).toBe(true);

        // Roundtrip should re-emit the unknown.
        const out = d.read(d.write(parsed.document));
        const rPr2 = out.document.body[0].children[0].rPr;
        expect(rPr2._extras.some(n => n.name === 'w:lang')).toBe(true);
    });
});
