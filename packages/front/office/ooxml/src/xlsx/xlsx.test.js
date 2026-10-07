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
import { xlsxStyles } from './styles.js';
import { xlsxTables } from './tables.js';
import { xlsxConditionalFormatting } from './conditionalFormatting.js';
import { xlsxComments } from './comments.js';
import { xlsxThreadedComments } from './threadedComments.js';
import { xlsxDrawings } from './drawings.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { drawingml } from '../drawingml/drawingml.js';
import { xlsxWalker } from './xlsx-walker.js';
import { xlsx } from './xlsx.js';
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
    const stylesInst = xlsxStyles.factory(_errors, xmlInst, _shared);
    const tablesInst = xlsxTables.factory(_errors, xmlInst, _shared);
    const cfInst = xlsxConditionalFormatting.factory(xmlInst, _shared);
    const commentsInst = xlsxComments.factory(_errors, xmlInst, _shared);
    const mcInst = markupCompatibility.factory(xmlInst);
    const drawingmlShapeInst = drawingmlShape.factory(xmlInst, _shared);
    const drawingmlInst = drawingml.factory(xmlInst, null, _shared);
    const drawingsInst = xlsxDrawings.factory(_errors, xmlInst,
        drawingmlShapeInst, drawingmlInst, _shared);
    const chartInst = drawingmlChart.factory(_errors, xmlInst, _shared);
    const tcInst = xlsxThreadedComments.factory(_errors, xmlInst, _shared);
    const walkerInst = xlsxWalker.factory();
    return xlsx.factory(_errors, opcInst, xmlInst, relsInst,
        stylesInst, tablesInst, cfInst, commentsInst, mcInst,
        drawingsInst, chartInst, tcInst, walkerInst, _shared);
}

describe('xlsx — addressing', () => {
    test('colName', () => {
        const x = build();
        expect(x.colName(0)).toBe('A');
        expect(x.colName(25)).toBe('Z');
        expect(x.colName(26)).toBe('AA');
        expect(x.colName(701)).toBe('ZZ');
        expect(x.colName(702)).toBe('AAA');
    });
    test('colIndex roundtrip', () => {
        const x = build();
        for (const i of [0, 25, 26, 100, 701, 1000]) {
            expect(x.colIndex(x.colName(i))).toBe(i);
        }
    });
    test('parseRef', () => {
        const x = build();
        expect(x.parseRef('A1')).toEqual({ col: 0, row: 0 });
        expect(x.parseRef('B3')).toEqual({ col: 1, row: 2 });
        expect(x.parseRef('AA10')).toEqual({ col: 26, row: 9 });
    });
});

describe('xlsx — basic roundtrip', () => {
    test('numbers, strings, booleans', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S1',
                rows: [
                    ['hello', 42, true],
                    ['world', 3.14, false]
                ]
            }]
        });
        const back = x.read(bytes);
        const sheet = back.workbook.sheets[0];
        expect(sheet.name).toBe('S1');
        expect(sheet.rows[0][0].value).toBe('hello');
        expect(sheet.rows[0][1].value).toBe(42);
        expect(sheet.rows[0][2].value).toBe(true);
        expect(sheet.rows[1][2].value).toBe(false);
        expect(sheet.rows[1][1].value).toBeCloseTo(3.14);
    });

    test('strings go through shared strings table', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{ name: 'S', rows: [['repeated'], ['repeated'], ['unique']] }]
        });
        const back = x.read(bytes);
        // Shared strings table should be deduplicated.
        expect(back.workbook.sharedStrings).toHaveLength(2);
        expect(back.workbook.sharedStrings).toContain('repeated');
        expect(back.workbook.sharedStrings).toContain('unique');
        expect(back.workbook.sheets[0].rows[0][0].value).toBe('repeated');
    });
});

describe('xlsx — formulas', () => {
    test('roundtrip formula with cached value', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [
                    [1, 2, { type: 'cell', formula: 'A1+B1', value: 3, t: 'n' }]
                ]
            }]
        });
        const back = x.read(bytes);
        const cell = back.workbook.sheets[0].rows[0][2];
        expect(cell.formula).toBe('A1+B1');
        expect(cell.value).toBe(3);
    });
});

describe('xlsx — merges', () => {
    test('merged cell ranges roundtrip', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [['A', 'B'], ['C', 'D']],
                merges: ['A1:B1', 'A2:A3']
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.sheets[0].merges).toEqual(['A1:B1', 'A2:A3']);
    });
});

describe('xlsx — styles', () => {
    test('cell.s references cellXfs index after roundtrip', () => {
        const x = build();
        const xfs = [
            { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 },
            { numFmtId: 0, fontId: 1, fillId: 0, borderId: 0, xfId: 0,
              applyFont: true }
        ];
        const stylesObj = {
            numFmts: [],
            fonts: [
                { size: 11, name: 'Calibri', family: 2 },
                { size: 11, name: 'Calibri', family: 2, bold: true }
            ],
            fills: [{ patternType: 'none' }, { patternType: 'gray125' }],
            borders: [{ left: {}, right: {}, top: {}, bottom: {}, diagonal: {} }],
            cellStyleXfs: [xfs[0]],
            cellXfs: xfs,
            cellStyles: [{ name: 'Normal', xfId: 0, builtinId: 0 }]
        };
        const bytes = x.write({
            styles: stylesObj,
            sheets: [{
                name: 'S',
                rows: [[
                    { type: 'cell', value: 'plain' },
                    { type: 'cell', value: 'bold', s: 1 }
                ]]
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.styles.fonts[1].bold).toBe(true);
        expect(back.workbook.sheets[0].rows[0][1].s).toBe(1);
    });
});

describe('xlsx — defined names', () => {
    test('roundtrip workbook-level + scoped names', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{ name: 'S', rows: [[1]] }],
            definedNames: [
                { name: 'AllData', value: 'S!$A:$Z' },
                { name: '_Hidden', value: 'S!$A$1', hidden: true },
                { name: 'Local', value: 'S!$A$1', scope: 0 }
            ]
        });
        const back = x.read(bytes);
        expect(back.workbook.definedNames).toEqual([
            { name: 'AllData', value: 'S!$A:$Z' },
            { name: '_Hidden', value: 'S!$A$1', hidden: true },
            { name: 'Local', value: 'S!$A$1', scope: 0 }
        ]);
    });
});

describe('xlsx — auto-filter', () => {
    test('roundtrip', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [['h1', 'h2'], [1, 2]],
                autoFilter: { ref: 'A1:B2' }
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.sheets[0].autoFilter).toEqual({ ref: 'A1:B2' });
    });
});

describe('xlsx — sheet views (frozen panes)', () => {
    test('roundtrip frozen first row', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [['h'], [1]],
                sheetViews: [{
                    workbookViewId: 0, tabSelected: true,
                    pane: { ySplit: 1, topLeftCell: 'A2',
                            activePane: 'bottomLeft', state: 'frozen' }
                }]
            }]
        });
        const back = x.read(bytes);
        const sv = back.workbook.sheets[0].sheetViews[0];
        expect(sv.tabSelected).toBe(true);
        expect(sv.pane).toEqual({
            ySplit: 1, topLeftCell: 'A2',
            activePane: 'bottomLeft', state: 'frozen'
        });
    });
});

describe('xlsx — data validations', () => {
    test('roundtrip dropdown list validation', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [['', '', '']],
                dataValidations: [{
                    type: 'list', sqref: 'A1:A10',
                    allowBlank: true, showInputMessage: true,
                    showErrorMessage: true, errorTitle: 'Invalid',
                    error: 'Pick a value from the list.',
                    formula1: '"Yes,No,Maybe"'
                }]
            }]
        });
        const back = x.read(bytes);
        const dv = back.workbook.sheets[0].dataValidations[0];
        expect(dv.type).toBe('list');
        expect(dv.formula1).toBe('"Yes,No,Maybe"');
        expect(dv.allowBlank).toBe(true);
    });
});

describe('xlsx — hyperlinks in cells', () => {
    test('external hyperlink with relationship', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [['Anthropic']],
                hyperlinks: [{ ref: 'A1', target: 'https://anthropic.com',
                               external: true, tooltip: 'Site' }]
            }]
        });
        const back = x.read(bytes);
        const hl = back.workbook.sheets[0].hyperlinks[0];
        expect(hl.ref).toBe('A1');
        expect(hl.target).toBe('https://anthropic.com');
        expect(hl.external).toBe(true);
        expect(hl.tooltip).toBe('Site');
    });

    test('internal hyperlink via location', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [['back']],
                hyperlinks: [{ ref: 'A1', location: "'S'!$B$1" }]
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.sheets[0].hyperlinks[0].location)
            .toBe("'S'!$B$1");
    });
});

describe('xlsx — tables', () => {
    test('roundtrip a sheet with one table', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [['Name', 'Age'], ['Alice', 30], ['Bob', 25]],
                tableRefs: [1]
            }],
            tables: [{
                id: 1, name: 'People', displayName: 'People', ref: 'A1:B3',
                headerRowCount: 1,
                columns: [{ id: 1, name: 'Name' }, { id: 2, name: 'Age' }]
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.tables).toHaveLength(1);
        const t = back.workbook.tables[0];
        expect(t.name).toBe('People');
        expect(t.columns).toHaveLength(2);
        expect(back.workbook.sheets[0].tableRefs).toEqual([1]);
    });
});

describe('xlsx — conditional formatting', () => {
    test('cellIs + dxf reference roundtrip via sheet', () => {
        const x = build();
        const styles = xlsxStyles.factory(_errors, ooxmlXml.factory(), _shared).defaults();
        // Add a "red bold" dxf for negative numbers.
        styles.dxfs.push({
            font: { bold: true, color: { rgb: 'FF9C0006' } },
            fill: { patternType: 'solid', bgColor: { rgb: 'FFFFC7CE' } }
        });
        const bytes = x.write({
            styles,
            sheets: [{
                name: 'Numbers',
                rows: [[1], [-2], [3], [-4]],
                conditionalFormatting: [{
                    sqref: 'A1:A4',
                    rules: [{
                        type: 'cellIs', priority: 1,
                        operator: 'lessThan', dxfId: 0,
                        formulas: ['0']
                    }]
                }]
            }]
        });
        const back = x.read(bytes);
        const cf = back.workbook.sheets[0].conditionalFormatting[0];
        expect(cf.sqref).toBe('A1:A4');
        expect(cf.rules[0].operator).toBe('lessThan');
        expect(cf.rules[0].dxfId).toBe(0);
        expect(cf.rules[0].formulas).toEqual(['0']);
        // dxf survived in styles.
        expect(back.workbook.styles.dxfs[0].font.bold).toBe(true);
    });

    test('color scale + data bar + icon set in same sheet', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'Vis',
                rows: [[10], [20], [30], [40], [50]],
                conditionalFormatting: [
                    { sqref: 'A1:A5', rules: [{
                        type: 'colorScale', priority: 1,
                        colorScale: {
                            cfvos: [{ type: 'min' }, { type: 'max' }],
                            colors: [{ rgb: 'FFF8696B' }, { rgb: 'FF63BE7B' }]
                        }
                    }]},
                    { sqref: 'B1:B5', rules: [{
                        type: 'dataBar', priority: 2,
                        dataBar: {
                            cfvos: [{ type: 'min' }, { type: 'max' }],
                            color: { rgb: 'FF638EC6' }
                        }
                    }]},
                    { sqref: 'C1:C5', rules: [{
                        type: 'iconSet', priority: 3,
                        iconSet: {
                            iconSet: '3TrafficLights1',
                            cfvos: [
                                { type: 'percent', val: '0' },
                                { type: 'percent', val: '33' },
                                { type: 'percent', val: '67' }
                            ]
                        }
                    }]}
                ]
            }]
        });
        const back = x.read(bytes);
        const blocks = back.workbook.sheets[0].conditionalFormatting;
        expect(blocks).toHaveLength(3);
        expect(blocks[0].rules[0].colorScale.cfvos).toHaveLength(2);
        expect(blocks[1].rules[0].dataBar.color.rgb).toBe('FF638EC6');
        expect(blocks[2].rules[0].iconSet.iconSet).toBe('3TrafficLights1');
    });

    test('multiple rules in one block (priority-ordered)', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [[1], [2], [3]],
                conditionalFormatting: [{
                    sqref: 'A1:A3',
                    rules: [
                        { type: 'cellIs', priority: 1,
                          operator: 'greaterThan', dxfId: 0,
                          formulas: ['10'], stopIfTrue: true },
                        { type: 'cellIs', priority: 2,
                          operator: 'equal', dxfId: 1,
                          formulas: ['0'] }
                    ]
                }]
            }]
        });
        const back = x.read(bytes);
        const rules = back.workbook.sheets[0].conditionalFormatting[0].rules;
        expect(rules).toHaveLength(2);
        expect(rules[0].stopIfTrue).toBe(true);
    });
});

describe('xlsx — comments', () => {
    test('sheet-level roundtrip with author + plain text', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [['hello', 'world']],
                comments: [
                    { ref: 'A1', author: 'Alice', text: 'reviewer note' },
                    { ref: 'B1', author: 'Bob',   text: 'follow-up' }
                ]
            }]
        });
        const back = x.read(bytes);
        const c = back.workbook.sheets[0].comments;
        expect(c).toHaveLength(2);
        expect(c[0].ref).toBe('A1');
        expect(c[0].author).toBe('Alice');
        expect(c[0].richText[0].text).toBe('reviewer note');
        expect(c[1].author).toBe('Bob');
    });

    test('rich text comment with bold + custom color', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [[1]],
                comments: [{
                    ref: 'A1', author: 'Author',
                    richText: [
                        { text: 'WARNING:',
                          rPr: { bold: true, size: 9, font: 'Tahoma',
                                 color: { rgb: 'FFFF0000' } } },
                        { text: ' check this cell',
                          rPr: { size: 9, font: 'Tahoma' } }
                    ]
                }]
            }]
        });
        const back = x.read(bytes);
        const rt = back.workbook.sheets[0].comments[0].richText;
        expect(rt[0].rPr.bold).toBe(true);
        expect(rt[0].rPr.color.rgb).toBe('FFFF0000');
        expect(rt[1].text).toBe(' check this cell');
    });

    test('package contains comments and VML drawing parts', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [[1]],
                comments: [{ ref: 'A1', author: 'X', text: 'ok' }]
            }]
        });
        const back = x.read(bytes);
        expect(back.package.parts['/xl/comments1.xml']).toBeDefined();
        expect(back.package.parts['/xl/drawings/vmlDrawing1.vml']).toBeDefined();
        // VML content type is declared as a Default for the 'vml' extension.
        expect(back.package.contentTypes.defaults.vml)
            .toBe('application/vnd.openxmlformats-officedocument.vmlDrawing');
        // Comments part is declared as an Override (per absolute path).
        expect(back.package.contentTypes.overrides['/xl/comments1.xml'])
            .toContain('comments+xml');
    });

    test('comments coexist with hyperlinks + tables in the same sheet', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'Mixed',
                rows: [['Name', 'Url'],
                       ['Site', 'https://example.com']],
                hyperlinks: [{ ref: 'B2', target: 'https://example.com',
                               external: true }],
                comments: [{ ref: 'A1', author: 'A', text: 'header note' }],
                tableRefs: [1]
            }],
            tables: [{
                id: 1, name: 'T', displayName: 'T', ref: 'A1:B2',
                headerRowCount: 1,
                columns: [{ id: 1, name: 'Name' }, { id: 2, name: 'Url' }]
            }]
        });
        const back = x.read(bytes);
        expect(back.workbook.sheets[0].comments).toHaveLength(1);
        expect(back.workbook.sheets[0].hyperlinks[0].target)
            .toBe('https://example.com');
        expect(back.workbook.tables).toHaveLength(1);
    });
});

describe('xlsx — threaded comments', () => {
    test('top-level comment + reply roundtrip with auto-resolved persons', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'Review',
                rows: [['Item', 'Value']],
                threadedComments: [
                    { ref: 'B1', author: 'Alice',
                      date: '2024-01-15T10:00:00Z',
                      text: 'What does this represent?' },
                    { ref: 'B1', author: 'Bob',
                      date: '2024-01-15T10:30:00Z',
                      text: 'Updated, see row 12.',
                      parentId: 0,
                      done: true }
                ]
            }]
        });
        const back = x.read(bytes);
        const tc = back.workbook.sheets[0].threadedComments;
        expect(tc).toHaveLength(2);
        expect(tc[0].text).toBe('What does this represent?');
        expect(tc[1].text).toBe('Updated, see row 12.');
        expect(tc[1].done).toBe(true);
        expect(tc[1].parentId).toBe(tc[0].id);
        expect(back.workbook.persons).toHaveLength(2);
        const aliceP = back.workbook.persons.find(p => p.displayName === 'Alice');
        expect(aliceP.id).toBe(tc[0].personId);
    });

    test('package contains threadedComments + persons parts with content types', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [[1]],
                threadedComments: [
                    { ref: 'A1', author: 'Carol',
                      date: '2024-01-15T11:00:00Z',
                      text: 'Looks good' }
                ]
            }]
        });
        const back = x.read(bytes);
        expect(back.package.parts['/xl/threadedComments/threadedComment1.xml'])
            .toBeDefined();
        expect(back.package.parts['/xl/persons/person.xml']).toBeDefined();
        expect(back.package.contentTypes.overrides[
            '/xl/threadedComments/threadedComment1.xml'])
            .toBe('application/vnd.ms-excel.threadedcomments+xml');
        expect(back.package.contentTypes.overrides['/xl/persons/person.xml'])
            .toBe('application/vnd.ms-excel.person+xml');
    });

    test('mention with start index + length', () => {
        const x = build();
        const aliceId = '{aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa}';
        const bobId = '{bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb}';
        const bytes = x.write({
            persons: [
                { id: aliceId, displayName: 'Alice', providerId: 'None' },
                { id: bobId,   displayName: 'Bob',   providerId: 'None' }
            ],
            sheets: [{
                name: 'S', rows: [['x']],
                threadedComments: [{
                    ref: 'A1',
                    date: '2024-01-15T12:00:00Z',
                    personId: aliceId,
                    text: '@Bob please verify',
                    mentions: [{
                        mentionpersonId: bobId,
                        mentionId: '0',
                        startIndex: 0,
                        length: 4
                    }]
                }]
            }]
        });
        const back = x.read(bytes);
        const tc = back.workbook.sheets[0].threadedComments[0];
        expect(tc.mentions).toHaveLength(1);
        expect(tc.mentions[0].mentionpersonId).toBe(bobId);
        expect(tc.mentions[0].startIndex).toBe(0);
        expect(tc.mentions[0].length).toBe(4);
    });

    test('threaded comments coexist with classic comments + tables', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [['Header']],
                comments: [{ ref: 'A1', author: 'Legacy', text: 'Old comment' }],
                threadedComments: [{
                    ref: 'A1', author: 'Modern',
                    date: '2024-01-15T10:00:00Z',
                    text: 'New thread comment'
                }],
                tableRefs: [1]
            }],
            tables: [{
                id: 1, name: 'T', displayName: 'T', ref: 'A1:A1',
                headerRowCount: 1,
                columns: [{ id: 1, name: 'Header' }]
            }]
        });
        const back = x.read(bytes);
        const sheet = back.workbook.sheets[0];
        expect(sheet.comments).toHaveLength(1);
        expect(sheet.threadedComments).toHaveLength(1);
        expect(back.workbook.tables).toHaveLength(1);
    });
});

describe('xlsx — drawings (charts + images in worksheets)', () => {
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
    const drInst = xlsxDrawings.factory(_errors, ooxmlXml.factory(), null, null, _shared);
    const chart = drawingmlChart.factory(_errors, ooxmlXml.factory(), _shared);

    test('chart anchored to a cell range roundtrips with chart part', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'Data',
                rows: [['Region', 'Sales'], ['EU', 120], ['US', 85], ['APAC', 200]],
                drawings: [{
                    anchor: drInst.twoCell({ col: 4, row: 0 }, { col: 12, row: 18 }),
                    cx: 6000000, cy: 4000000,
                    chart: chart.barChart({
                        title: 'Sales by Region',
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
        const d = sheet.drawings[0];
        expect(d.anchor.kind).toBe('twoCell');
        expect(d.chart.plotType).toBe('bar');
        expect(d.chart.title).toBe('Sales by Region');
        expect(d.chart.series[0].values).toEqual([120, 85, 200]);
    });

    test('package contains drawing + chart parts and Override CT', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [[1]],
                drawings: [{
                    anchor: drInst.twoCell({ col: 0, row: 0 }, { col: 5, row: 10 }),
                    chart: chart.lineChart({
                        series: [{ name: 's', categories: ['a','b'], values: [1, 2] }]
                    })
                }]
            }]
        });
        const back = x.read(bytes);
        expect(back.package.parts['/xl/drawings/drawing1.xml']).toBeDefined();
        const chartParts = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/xl/charts/'));
        expect(chartParts).toHaveLength(1);
        expect(back.package.contentTypes.overrides['/xl/drawings/drawing1.xml'])
            .toBe('application/vnd.openxmlformats-officedocument.drawing+xml');
        expect(back.package.contentTypes.overrides[chartParts[0]])
            .toContain('chart+xml');
    });

    test('image anchored to one cell roundtrips with media part', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [[1]],
                drawings: [{
                    anchor: drInst.oneCell({ col: 1, row: 1 },
                                            { cx: 2000000, cy: 1500000 }),
                    cx: 2000000, cy: 1500000,
                    image: { data: PNG_1X1, contentType: 'image/png' },
                    description: 'Logo'
                }]
            }]
        });
        const back = x.read(bytes);
        const d = back.workbook.sheets[0].drawings[0];
        expect(d.anchor.kind).toBe('oneCell');
        expect(d.image.contentType).toBe('image/png');
        expect(d.image.data).toEqual(PNG_1X1);
        expect(d.description).toBe('Logo');
        const mediaParts = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/xl/media/'));
        expect(mediaParts).toHaveLength(1);
        expect(back.package.contentTypes.defaults.png).toBe('image/png');
    });

    test('chart + image in same sheet, dedup of repeated image', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'Mixed', rows: [['x']],
                drawings: [
                    { anchor: drInst.twoCell({ col: 0, row: 0 }, { col: 4, row: 8 }),
                      chart: chart.pieChart({
                          series: [{ name: 's', categories: ['a','b'], values: [1, 2] }]
                      }) },
                    { anchor: drInst.oneCell({ col: 5, row: 0 },
                                              { cx: 1000000, cy: 1000000 }),
                      cx: 1000000, cy: 1000000,
                      image: { data: PNG_1X1, contentType: 'image/png' } },
                    { anchor: drInst.oneCell({ col: 7, row: 0 },
                                              { cx: 1000000, cy: 1000000 }),
                      cx: 1000000, cy: 1000000,
                      image: { data: PNG_1X1, contentType: 'image/png' } }
                ]
            }]
        });
        const back = x.read(bytes);
        const drs = back.workbook.sheets[0].drawings;
        expect(drs).toHaveLength(3);
        expect(drs[0].chart.plotType).toBe('pie');
        const mediaParts = Object.keys(back.package.parts)
            .filter(k => k.startsWith('/xl/media/'));
        expect(mediaParts).toHaveLength(1);
    });

    test('typed xdr:sp shape with prstGeom + fill + text', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S', rows: [['x']],
                drawings: [{
                    anchor: drInst.oneCell({ col: 1, row: 1 },
                                            { cx: 2000000, cy: 1000000 }),
                    shapeProps: {
                        geom: 'roundRect',
                        cx: 2000000, cy: 1000000,
                        offsetX: 0, offsetY: 0,
                        fill: { rgb: '4472C4' },
                        line: { color: '2F5496', width: 12700 }
                    },
                    name: 'Process step',
                    txBody: {
                        paragraphs: [{
                            runs: [{ type: 'text', value: 'Step 1' }]
                        }]
                    }
                }]
            }]
        });
        const back = x.read(bytes);
        const d = back.workbook.sheets[0].drawings[0];
        expect(d.shapeProps.geom).toBe('roundRect');
        expect(d.shapeProps.fill).toEqual({ rgb: '4472C4' });
        expect(d.shapeProps.line.color).toBe('2F5496');
        expect(d.txBody.paragraphs[0].runs[0].value).toBe('Step 1');
        expect(d.name).toBe('Process step');
    });

    test('drawings coexist with comments + tables in the same sheet', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [['Name', 'Score'], ['Alice', 90], ['Bob', 85]],
                comments: [{ ref: 'A1', author: 'Reviewer', text: 'header' }],
                tableRefs: [1],
                drawings: [{
                    anchor: drInst.twoCell({ col: 3, row: 0 }, { col: 9, row: 12 }),
                    chart: chart.barChart({
                        title: 'Scores',
                        series: [{ name: 'Q4',
                                    categories: ['Alice', 'Bob'],
                                    values: [90, 85] }]
                    })
                }]
            }],
            tables: [{
                id: 1, name: 'T', displayName: 'T', ref: 'A1:B3',
                headerRowCount: 1,
                columns: [{ id: 1, name: 'Name' }, { id: 2, name: 'Score' }]
            }]
        });
        const back = x.read(bytes);
        const sheet = back.workbook.sheets[0];
        expect(sheet.comments).toHaveLength(1);
        expect(sheet.drawings).toHaveLength(1);
        expect(sheet.drawings[0].chart.title).toBe('Scores');
        expect(back.workbook.tables).toHaveLength(1);
    });
});

describe('xlsx — column widths', () => {
    test('roundtrip cols', () => {
        const x = build();
        const bytes = x.write({
            sheets: [{
                name: 'S',
                rows: [['x']],
                cols: [{ min: 1, max: 1, width: 25.5 }, { min: 2, max: 5 }]
            }]
        });
        const back = x.read(bytes);
        const cols = back.workbook.sheets[0].cols;
        expect(cols[0]).toEqual({ min: 1, max: 1, width: 25.5 });
        expect(cols[1]).toEqual({ min: 2, max: 5 });
    });
});
