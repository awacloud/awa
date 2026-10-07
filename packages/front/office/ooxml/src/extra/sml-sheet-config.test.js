// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for smlSheetConfig — sheet-level config (sheetPr, headerFooter, breaks…).
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlSheetConfig } from './sml-sheet-config.js';

describe('smlSheetConfig module', () => {
    test('module metadata', () => {
        expect(smlSheetConfig.name).toBe('smlSheetConfig');
        expect(smlSheetConfig.dependencies).toEqual(['xml']);
        expect(typeof smlSheetConfig.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = smlSheetConfig.factory(xml);
    });

    describe('factory', () => {
        test('exposes the public API', () => {
            for (const k of ['parseSheetConfig', 'renderSheetConfig',
                              'parseSheetPr', 'renderSheetPr',
                              'parseHeaderFooter', 'renderHeaderFooter',
                              'parseBreaks', 'renderBreaks',
                              'parseCustomSheetView', 'renderCustomSheetView']) {
                expect(typeof m[k]).toBe('function');
            }
        });
    });

    describe('parseSheetPr / renderSheetPr', () => {
        test('roundtrip with tabColor + outlinePr + pageSetUpPr', () => {
            const sp = {
                codeName: 'Sheet1', filterMode: '0',
                tabColor: { rgb: 'FF0000' },
                outlinePr: { applyStyles: '1', summaryBelow: '0' },
                pageSetUpPr: { fitToPage: '1' }
            };
            const back = m.parseSheetPr(m.renderSheetPr(sp));
            expect(back.codeName).toBe('Sheet1');
            expect(back.filterMode).toBe('0');
            expect(back.tabColor).toEqual({ rgb: 'FF0000' });
            expect(back.outlinePr.applyStyles).toBe('1');
            expect(back.pageSetUpPr.fitToPage).toBe('1');
        });
    });

    describe('parseHeaderFooter / renderHeaderFooter', () => {
        test('roundtrip odd/even/first headers + footers', () => {
            const hf = {
                attrs: { differentOddEven: '1', differentFirst: '1' },
                oddHeader: '&L&"Arial"Page', oddFooter: '&Cpage &P',
                evenHeader: 'even-h', evenFooter: 'even-f',
                firstHeader: 'first-h', firstFooter: 'first-f'
            };
            const back = m.parseHeaderFooter(m.renderHeaderFooter(hf));
            expect(back.oddHeader).toBe(hf.oddHeader);
            expect(back.oddFooter).toBe(hf.oddFooter);
            expect(back.evenHeader).toBe('even-h');
            expect(back.firstHeader).toBe('first-h');
            expect(back.attrs.differentOddEven).toBe('1');
        });
    });

    describe('parseBreaks / renderBreaks', () => {
        test('roundtrip rowBreaks', () => {
            const b = { count: '2', manualBreakCount: '2',
                         items: [{ id: '5', man: '1' }, { id: '10', man: '1' }] };
            const back = m.parseBreaks(m.renderBreaks('rowBreaks', b));
            expect(back.count).toBe('2');
            expect(back.items).toHaveLength(2);
            expect(back.items[0].id).toBe('5');
        });

        test('roundtrip colBreaks via renderBreaks switcher', () => {
            const b = { items: [{ id: '3' }] };
            const el = m.renderBreaks('colBreaks', b);
            expect(el.name).toBe('colBreaks');
            const back = m.parseBreaks(el);
            expect(back.items[0].id).toBe('3');
        });
    });

    describe('parseCustomSheetView / renderCustomSheetView', () => {
        test('roundtrip with pageMargins + headerFooter', () => {
            const v = {
                attrs: { guid: '{00000000-0000-0000-0000-000000000000}',
                          scale: '100' },
                pageMargins: { left: '0.7', right: '0.7', top: '0.75',
                                bottom: '0.75', header: '0.3', footer: '0.3' },
                headerFooter: { attrs: {}, oddHeader: 'H' }
            };
            const back = m.parseCustomSheetView(m.renderCustomSheetView(v));
            expect(back.attrs.scale).toBe('100');
            expect(back.pageMargins.top).toBe('0.75');
            expect(back.headerFooter.oddHeader).toBe('H');
        });
    });

    describe('parseSheetConfig / renderSheetConfig', () => {
        test('roundtrip multi-section worksheet config', () => {
            const cfg = {
                sheetPr: { codeName: 'S1' },
                dimension: 'A1:C10',
                sheetFormatPr: { defaultRowHeight: '15' },
                printOptions: { headings: '1' },
                pageMargins: { left: '0.7', right: '0.7', top: '0.75',
                                bottom: '0.75', header: '0.3', footer: '0.3' },
                pageSetup: { paperSize: '9', orientation: 'portrait' },
                headerFooter: { attrs: {}, oddHeader: 'top' },
                rowBreaks: { items: [{ id: '5' }] }
            };
            const els = m.renderSheetConfig(cfg);
            expect(els.length).toBeGreaterThan(0);
            const back = m.parseSheetConfig(els);
            expect(back.sheetPr.codeName).toBe('S1');
            expect(back.dimension).toBe('A1:C10');
            expect(back.sheetFormatPr.defaultRowHeight).toBe('15');
            expect(back.pageSetup.paperSize).toBe('9');
            expect(back.headerFooter.oddHeader).toBe('top');
            expect(back.rowBreaks.items).toHaveLength(1);
        });

        test('returns empty object when no recognized children', () => {
            expect(m.parseSheetConfig([])).toEqual({});
        });
    });
});
