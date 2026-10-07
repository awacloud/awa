// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for smlFormControls — ActiveX, OLE objects, controls.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { smlFormControls } from './sml-form-controls.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
const _errors = _ooxmlErrors.factory();

describe('smlFormControls module', () => {
    test('module metadata', () => {
        expect(smlFormControls.name).toBe('smlFormControls');
        expect(smlFormControls.dependencies).toEqual(['ooxmlErrors', 'xml']);
        expect(typeof smlFormControls.factory).toBe('function');
    });

    let xml, m;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        m = smlFormControls.factory(_errors, xml);
    });

    describe('factory', () => {
        test('exposes parseActiveX / parseOleObjects / parseControls', () => {
            for (const k of ['parseActiveX', 'renderActiveX',
                              'parseOleObjects', 'renderOleObjects',
                              'parseControls', 'renderControls',
                              'parseControl', 'renderControl']) {
                expect(typeof m[k]).toBe('function');
            }
        });
    });

    describe('parseActiveX / renderActiveX', () => {
        test('roundtrip ocxPr list', () => {
            const ax = {
                attrs: { 'ax:persistence': 'persistPropertyBag', 'ax:classid': 'CLSID' },
                ocxPr: [
                    { name: 'Caption', value: 'Click me' },
                    { name: 'Width',   value: '120' }
                ]
            };
            const text = m.renderActiveX(ax);
            expect(text).toContain('ocxPr');
            const back = m.parseActiveX(text);
            expect(back.ocxPr).toHaveLength(2);
            expect(back.ocxPr[0].name).toBe('Caption');
            expect(back.ocxPr[0].value).toBe('Click me');
            expect(back.ocxPr[1].name).toBe('Width');
        });

        test('renderActiveX passthrough of element node', () => {
            const el = xml.el('ocx', { xmlns: 'x' }, []);
            const text = m.renderActiveX(el);
            expect(text).toContain('ocx');
        });
    });

    describe('parseOleObjects / renderOleObjects', () => {
        test('roundtrip oleObject with objectPr + anchor', () => {
            const arr = [{
                progId: 'Excel.Sheet.12', dvAspect: 'DVASPECT_CONTENT',
                shapeId: '1025', 'r:id': 'rId5',
                objectPr: { attrs: { defaultSize: '0', autoLine: '0' },
                             anchor: { attrs: { moveWithCells: '1' } } }
            }];
            const el = m.renderOleObjects(arr);
            expect(el.name).toBe('oleObjects');
            const back = m.parseOleObjects(el);
            expect(back).toHaveLength(1);
            expect(back[0].progId).toBe('Excel.Sheet.12');
            expect(back[0].shapeId).toBe('1025');
            expect(back[0].objectPr.anchor.attrs.moveWithCells).toBe('1');
        });

        test('throws on wrong root', () => {
            expect(() => m.parseOleObjects(xml.el('foo', {}))).toThrow();
        });
    });

    describe('parseControls / renderControls', () => {
        test('roundtrip control with controlPr + anchor', () => {
            const arr = [{
                shapeId: '1027', name: 'Button1', 'r:id': 'rId7',
                controlPr: { attrs: { defaultSize: '0', print: '0' },
                              anchor: { attrs: { moveWithCells: '1' } } }
            }];
            const el = m.renderControls(arr);
            expect(el.name).toBe('controls');
            const back = m.parseControls(el);
            expect(back).toHaveLength(1);
            expect(back[0].shapeId).toBe('1027');
            expect(back[0].name).toBe('Button1');
            expect(back[0].controlPr.attrs.print).toBe('0');
        });

        test('throws on wrong root', () => {
            expect(() => m.parseControls(xml.el('foo', {}))).toThrow();
        });
    });

    describe('parseControl / renderControl passthrough', () => {
        test('roundtrip raw control text', () => {
            const text = '<control xmlns="x" shapeId="1"/>';
            const node = m.parseControl(text);
            expect(node.name).toBe('control');
            const back = m.renderControl(node);
            expect(back).toContain('control');
        });
    });
});
