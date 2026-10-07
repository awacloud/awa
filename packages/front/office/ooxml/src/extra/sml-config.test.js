// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlCalculation } from './sml-calculation.js';
import { smlSheetConfig } from './sml-sheet-config.js';
import { smlWorkbookConfig } from './sml-workbook-config.js';
import { smlFormControls } from './sml-form-controls.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
const _errors = _ooxmlErrors.factory();

const xml = ooxmlXml.factory();

describe('extra/sml-calculation — Phase 10', () => {
    const m = smlCalculation.factory(xml);

    test('calcChain with typed flags', () => {
        const cc = {
            cells: [
                { r: 'A1', i: '1', s: '1', l: '1', a: '1', t: '2' },
                { r: 'B2', i: '1' }
            ]
        };
        const text = m.renderCalcChain(cc);
        expect(text).toContain('<calcChain');
        const back = m.parseCalcChain(text);
        expect(back.cells.length).toBe(2);
        expect(back.cells[0].r).toBe('A1');
        expect(back.cells[0].s).toBe('1');
        expect(back.cells[0].t).toBe('2');
        expect(back.cells[1].r).toBe('B2');
    });

    test('calcPr with all attrs', () => {
        const cp = {
            calcId: '162913',
            calcMode: 'auto',
            refMode: 'A1',
            iterate: '1',
            iterateCount: '100',
            iterateDelta: '0.001',
            fullCalcOnLoad: '1',
            forceFullCalc: '0',
            fullPrecision: '1',
            calcCompleted: '1',
            calcOnSave: '1',
            concurrentCalc: '1',
            concurrentManualCount: '4'
        };
        const node = m.renderCalcPr(cp);
        expect(node.name).toBe('calcPr');
        const back = m.parseCalcPr(node);
        expect(back).toEqual(cp);
    });
});

describe('extra/sml-sheet-config — Phase 11', () => {
    const m = smlSheetConfig.factory(xml);

    test('sheetPr with tabColor / outlinePr / pageSetUpPr', () => {
        const cfg = {
            sheetPr: {
                codeName: 'Sheet1',
                enableFormatConditionsCalculation: '1',
                filterMode: '0',
                published: '1',
                syncHorizontal: '0',
                syncRef: 'A1',
                syncVertical: '0',
                transitionEntry: '0',
                transitionEvaluation: '0',
                tabColor: { rgb: 'FF0000FF' },
                outlinePr: { applyStyles: '1', summaryBelow: '1', summaryRight: '1', showOutlineSymbols: '1' },
                pageSetUpPr: { autoPageBreaks: '1', fitToPage: '0' }
            },
            dimension: 'A1:Z100',
            sheetFormatPr: {
                baseColWidth: '10',
                defaultColWidth: '8.43',
                defaultRowHeight: '15',
                customHeight: '1',
                zeroHeight: '0',
                thickTop: '0',
                thickBottom: '0',
                outlineLevelRow: '0',
                outlineLevelCol: '0'
            }
        };
        const out = m.renderSheetConfig(cfg);
        const back = m.parseSheetConfig(out);
        expect(back.sheetPr.codeName).toBe('Sheet1');
        expect(back.sheetPr.tabColor.rgb).toBe('FF0000FF');
        expect(back.sheetPr.outlinePr.summaryBelow).toBe('1');
        expect(back.sheetPr.pageSetUpPr.autoPageBreaks).toBe('1');
        expect(back.dimension).toBe('A1:Z100');
        expect(back.sheetFormatPr.defaultColWidth).toBe('8.43');
    });

    test('headerFooter with all six headers/footers', () => {
        const cfg = {
            headerFooter: {
                attrs: { differentOddEven: '1', differentFirst: '1', scaleWithDoc: '1', alignWithMargins: '1' },
                oddHeader: 'OH', oddFooter: 'OF',
                evenHeader: 'EH', evenFooter: 'EF',
                firstHeader: 'FH', firstFooter: 'FF'
            }
        };
        const back = m.parseSheetConfig(m.renderSheetConfig(cfg));
        expect(back.headerFooter.oddHeader).toBe('OH');
        expect(back.headerFooter.evenFooter).toBe('EF');
        expect(back.headerFooter.firstHeader).toBe('FH');
        expect(back.headerFooter.attrs.differentOddEven).toBe('1');
    });

    test('rowBreaks / colBreaks with brk children', () => {
        const cfg = {
            rowBreaks: { count: '2', manualBreakCount: '1', items: [{ id: '5', max: '16383', man: '1' }, { id: '20', max: '16383' }] },
            colBreaks: { count: '1', manualBreakCount: '1', items: [{ id: '3', max: '1048575', man: '1' }] }
        };
        const back = m.parseSheetConfig(m.renderSheetConfig(cfg));
        expect(back.rowBreaks.items.length).toBe(2);
        expect(back.rowBreaks.count).toBe('2');
        expect(back.colBreaks.items[0].id).toBe('3');
    });

    test('printOptions, pageMargins, pageSetup', () => {
        const cfg = {
            printOptions: { horizontalCentered: '1', verticalCentered: '0', headings: '1', gridLines: '1', gridLinesSet: '1' },
            pageMargins: { left: '0.7', right: '0.7', top: '0.75', bottom: '0.75', header: '0.3', footer: '0.3' },
            pageSetup: { paperSize: '9', orientation: 'portrait', scale: '100', fitToWidth: '1', fitToHeight: '1', 'r:id': 'rId1' }
        };
        const back = m.parseSheetConfig(m.renderSheetConfig(cfg));
        expect(back.printOptions.horizontalCentered).toBe('1');
        expect(back.pageMargins.left).toBe('0.7');
        expect(back.pageSetup.orientation).toBe('portrait');
    });

    test('customSheetView roundtrip', () => {
        const cfg = {
            customSheetViews: [{
                attrs: { guid: '{X}', scale: '100' },
                pageMargins: { left: '0.7', right: '0.7', top: '0.75', bottom: '0.75', header: '0.3', footer: '0.3' },
                pageSetup: { paperSize: '9', orientation: 'landscape' },
                printOptions: { gridLines: '1', gridLinesSet: '1' },
                headerFooter: { attrs: {}, oddHeader: 'X' },
                rowBreaks: { count: '1', items: [{ id: '5' }] },
                colBreaks: { count: '1', items: [{ id: '2' }] }
            }]
        };
        const back = m.parseSheetConfig(m.renderSheetConfig(cfg));
        expect(back.customSheetViews.length).toBe(1);
        expect(back.customSheetViews[0].pageSetup.orientation).toBe('landscape');
        expect(back.customSheetViews[0].rowBreaks.items[0].id).toBe('5');
    });

    test('sheetProtection + protectedRanges', () => {
        const cfg = {
            sheetProtection: { sheet: '1', password: 'X', formatCells: '0', insertRows: '0' },
            protectedRanges: [
                { sqref: 'A1:B2', name: 'R1', securityDescriptor: 'S' },
                { sqref: 'C3:D4', name: 'R2' }
            ]
        };
        const back = m.parseSheetConfig(m.renderSheetConfig(cfg));
        expect(back.sheetProtection.sheet).toBe('1');
        expect(back.protectedRanges.length).toBe(2);
        expect(back.protectedRanges[0].name).toBe('R1');
    });

    test('phoneticPr + sheetCalcPr', () => {
        const cfg = {
            phoneticPr: { fontId: '1', type: 'noConversion' },
            sheetCalcPr: { fullCalcOnLoad: '1' }
        };
        const back = m.parseSheetConfig(m.renderSheetConfig(cfg));
        expect(back.phoneticPr.fontId).toBe('1');
        expect(back.sheetCalcPr.fullCalcOnLoad).toBe('1');
    });
});

describe('extra/sml-workbook-config — Phase 12', () => {
    const m = smlWorkbookConfig.factory(xml);

    test('pivotCaches', () => {
        const w = { pivotCaches: [{ cacheId: '0', 'r:id': 'rId1' }, { cacheId: '1', 'r:id': 'rId2' }] };
        const back = m.parseWorkbookConfig(m.renderWorkbookConfig(w));
        expect(back.pivotCaches.length).toBe(2);
        expect(back.pivotCaches[0].cacheId).toBe('0');
    });

    test('full workbook config', () => {
        const w = {
            fileVersion: { appName: 'xl', lastEdited: '7', lowestEdited: '7', rupBuild: '20413' },
            fileSharing: { reservationPassword: 'abc', userName: 'u' },
            fileRecoveryPr: { autoRecover: '1' },
            oleSize: { ref: 'A1:E10' },
            workbookProtection: { workbookPassword: 'p', lockStructure: '1' },
            smartTagPr: { embed: '1', show: 'all' },
            webPublishing: { codePage: '65001', allowPng: '1' },
            bookViews: [{ activeTab: '0', firstSheet: '0', xWindow: '0', yWindow: '0', windowWidth: '12000', windowHeight: '8000' }],
            customWorkbookViews: [{ name: 'View1', guid: '{Y}', maximized: '1' }],
            smartTagTypes: [{ namespaceUri: 'urn:test', name: 'Foo', url: 'http://x' }],
            webPublishObjects: { count: '1', items: [{ id: '1', divId: 'd1', sourceObject: 'S', destinationFile: 'f.htm', title: 'T', autoRepublish: '1' }] }
        };
        const out = m.renderWorkbookConfig(w);
        const back = m.parseWorkbookConfig(out);
        expect(back.fileVersion.appName).toBe('xl');
        expect(back.fileSharing.userName).toBe('u');
        expect(back.fileRecoveryPr.autoRecover).toBe('1');
        expect(back.oleSize.ref).toBe('A1:E10');
        expect(back.workbookProtection.lockStructure).toBe('1');
        expect(back.smartTagPr.embed).toBe('1');
        expect(back.webPublishing.codePage).toBe('65001');
        expect(back.bookViews.length).toBe(1);
        expect(back.bookViews[0].activeTab).toBe('0');
        expect(back.customWorkbookViews[0].name).toBe('View1');
        expect(back.smartTagTypes[0].namespaceUri).toBe('urn:test');
        expect(back.webPublishObjects.items[0].divId).toBe('d1');
    });
});

describe('extra/sml-form-controls — Phase 13', () => {
    const m = smlFormControls.factory(_errors, xml);

    test('parseActiveX + renderActiveX with ocxPr', () => {
        const ax = {
            attrs: { 'ax:classid': '{8856F961-340A-11D0-A96B-00C04FD705A2}' },
            ocxPr: [
                { name: 'AutoLoad', value: '0' },
                { name: 'License', value: 'XYZ', license: '1' },
                { name: 'Persistence', value: '0', persistence: '1' },
                { name: 'Id', value: '1', id: '1' }
            ]
        };
        const text = m.renderActiveX(ax);
        expect(text).toContain('<ocx');
        expect(text).toContain('<ocxPr');
        const back = m.parseActiveX(text);
        expect(back.ocxPr.length).toBe(4);
        expect(back.ocxPr[0].name).toBe('AutoLoad');
        expect(back.ocxPr[1].license).toBe('1');
        expect(back.ocxPr[2].persistence).toBe('1');
    });

    test('oleObjects roundtrip', () => {
        const node = m.renderOleObjects([{
            progId: 'Word.Document.12',
            shapeId: '1025',
            'r:id': 'rId4',
            objectPr: {
                attrs: { defaultSize: '0', autoLoad: '0', 'r:id': 'rId5' },
                anchor: { attrs: { moveWithCells: '1', sizeWithCells: '0' } }
            }
        }]);
        expect(node.name).toBe('oleObjects');
        const arr = m.parseOleObjects(node);
        expect(arr.length).toBe(1);
        expect(arr[0].progId).toBe('Word.Document.12');
        expect(arr[0].objectPr.anchor.attrs.moveWithCells).toBe('1');
    });

    test('controls roundtrip', () => {
        const node = m.renderControls([{
            shapeId: '1027', name: 'CheckBox1', 'r:id': 'rId6',
            controlPr: {
                attrs: { defaultSize: '0', autoFill: '0', autoLine: '0', autoPict: '0' },
                anchor: { attrs: { moveWithCells: '1' } }
            }
        }]);
        expect(node.name).toBe('controls');
        const arr = m.parseControls(node);
        expect(arr.length).toBe(1);
        expect(arr[0].shapeId).toBe('1027');
        expect(arr[0].controlPr.attrs.defaultSize).toBe('0');
    });
});
