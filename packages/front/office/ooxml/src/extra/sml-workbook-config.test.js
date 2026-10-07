// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for smlWorkbookConfig — workbook-level config (bookViews,
 * fileVersion, custom views, smartTagTypes, …).
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlWorkbookConfig } from './sml-workbook-config.js';

describe('smlWorkbookConfig module', () => {
    test('module metadata', () => {
        expect(smlWorkbookConfig.name).toBe('smlWorkbookConfig');
        expect(smlWorkbookConfig.dependencies).toEqual(['xml']);
        expect(typeof smlWorkbookConfig.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = smlWorkbookConfig.factory(xml);
    });

    describe('factory', () => {
        test('exposes the public API', () => {
            for (const k of ['parseWorkbookConfig', 'renderWorkbookConfig',
                              'parseWorkbookView', 'renderWorkbookView',
                              'parseCustomWorkbookView', 'renderCustomWorkbookView',
                              'parseSmartTagTypes', 'renderSmartTagTypes',
                              'parseWebPublishObjects', 'renderWebPublishObjects']) {
                expect(typeof m[k]).toBe('function');
            }
        });
    });

    describe('parseWorkbookView / renderWorkbookView', () => {
        test('roundtrip', () => {
            const v = { activeTab: '0', xWindow: '0', yWindow: '0',
                         windowWidth: '24000', windowHeight: '13000' };
            const back = m.parseWorkbookView(m.renderWorkbookView(v));
            expect(back.activeTab).toBe('0');
            expect(back.windowWidth).toBe('24000');
        });
    });

    describe('parseSmartTagTypes / renderSmartTagTypes', () => {
        test('roundtrip list', () => {
            const arr = [
                { namespaceUri: 'urn:a', name: 'one' },
                { namespaceUri: 'urn:b', name: 'two' }
            ];
            const el = m.renderSmartTagTypes(arr);
            expect(el.name).toBe('smartTagTypes');
            const back = m.parseSmartTagTypes(el);
            expect(back).toHaveLength(2);
            expect(back[0].name).toBe('one');
            expect(back[1].namespaceUri).toBe('urn:b');
        });
    });

    describe('parseWebPublishObjects / renderWebPublishObjects', () => {
        test('roundtrip with count', () => {
            const o = { count: '1', items: [
                { id: '1', divId: 'd', sourceObject: 'Sheet1', destinationFile: '/x' }
            ]};
            const back = m.parseWebPublishObjects(m.renderWebPublishObjects(o));
            expect(back.count).toBe('1');
            expect(back.items).toHaveLength(1);
            expect(back.items[0].divId).toBe('d');
        });
    });

    describe('parseWorkbookConfig / renderWorkbookConfig', () => {
        test('roundtrip multi-section workbook config', () => {
            const cfg = {
                fileVersion: { appName: 'xl', lastEdited: '7' },
                fileSharing: { readOnlyRecommended: '1' },
                fileRecoveryPr: { autoRecover: '1' },
                oleSize: { ref: 'A1' },
                protection: { lockStructure: '1' },
                workbookProtection: { workbookPassword: 'CAFE' },
                smartTagPr: { embed: '1' },
                webPublishing: { allowPng: '1' },
                bookViews: [{ activeTab: '0' }],
                customWorkbookViews: [{ guid: '{X}' }],
                smartTagTypes: [{ name: 'one' }],
                webPublishObjects: { items: [{ id: '1', divId: 'd' }] },
                pivotCaches: [{ cacheId: '1', 'r:id': 'rId1' }]
            };
            const els = m.renderWorkbookConfig(cfg);
            expect(els.length).toBeGreaterThanOrEqual(12);
            const back = m.parseWorkbookConfig(els);
            expect(back.fileVersion.appName).toBe('xl');
            expect(back.fileSharing.readOnlyRecommended).toBe('1');
            expect(back.protection.lockStructure).toBe('1');
            expect(back.bookViews).toHaveLength(1);
            expect(back.customWorkbookViews[0].guid).toBe('{X}');
            expect(back.smartTagTypes[0].name).toBe('one');
            expect(back.webPublishObjects.items[0].divId).toBe('d');
            expect(back.pivotCaches[0].cacheId).toBe('1');
        });

        test('returns empty object when no recognized children', () => {
            expect(m.parseWorkbookConfig([])).toEqual({});
        });
    });
});
