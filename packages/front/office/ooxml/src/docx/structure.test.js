// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for docxStructure — runs, paragraphs, tables, hyperlinks, sections.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlMath } from '../math/math.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { docxProperties } from './properties.js';
import { docxDrawing } from './drawing.js';
import { docxStructure } from './structure.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

describe('docxStructure module', () => {
    test('module metadata', () => {
        expect(docxStructure.name).toBe('docxStructure');
        expect(docxStructure.dependencies).toEqual(
            ['xml', 'docxProperties', 'docxDrawing', 'ooxmlMath']);
        expect(typeof docxStructure.factory).toBe('function');
    });

    let xml, s;
    beforeEach(() => {
        xml = ooxmlXml.factory();
        const props = docxProperties.factory(xml);
        const draw = docxDrawing.factory(xml, drawingmlShape.factory(xml, _shared), _shared);
        const math = ooxmlMath.factory(_errors, xml);
        s = docxStructure.factory(xml, props, draw, math);
    });

    describe('factory API', () => {
        test('exposes expected functions', () => {
            for (const k of ['parseRun', 'renderRun', 'parseHyperlink', 'renderHyperlink',
                              'parseParagraph', 'renderParagraph', 'parseTable', 'renderTable',
                              'parseRow', 'renderRow', 'parseCell', 'renderCell',
                              'parseSection', 'renderSection', 'parseSdt', 'renderSdt',
                              'parseSdtProperties', 'renderSdtProperties',
                              'parseBody', 'renderBodyChildren']) {
                expect(typeof s[k]).toBe('function');
            }
        });
    });

    describe('parseRun / renderRun', () => {
        test('text + tab + break + delText roundtrip', () => {
            const run = {
                type: 'run',
                rPr: { bold: true },
                children: [
                    { type: 'text', value: 'hello' },
                    { type: 'tab' },
                    { type: 'break', kind: 'page' },
                    { type: 'text', value: 'world' }
                ]
            };
            const back = s.parseRun(s.renderRun(run));
            expect(back.type).toBe('run');
            expect(back.rPr.bold).toBe(true);
            expect(back.children).toHaveLength(4);
            expect(back.children[1]).toEqual({ type: 'tab' });
            expect(back.children[2]).toEqual({ type: 'break', kind: 'page' });
        });

        test('delText preserved', () => {
            const r = { type: 'run', children: [{ type: 'delText', value: 'gone' }] };
            const back = s.parseRun(s.renderRun(r));
            expect(back.children[0].type).toBe('delText');
            expect(back.children[0].value).toBe('gone');
        });
    });

    describe('parseHyperlink / renderHyperlink', () => {
        test('rId-based external', () => {
            const h = { type: 'hyperlink', rId: 'rId1',
                        children: [{ type: 'run', children: [{ type: 'text', value: 'click' }] }] };
            const back = s.parseHyperlink(s.renderHyperlink(h));
            expect(back.type).toBe('hyperlink');
            expect(back.rId).toBe('rId1');
            expect(back.children[0].children[0].value).toBe('click');
        });

        test('anchor-based internal', () => {
            const h = { type: 'hyperlink', anchor: 'top',
                        children: [{ type: 'run', children: [{ type: 'text', value: 'go' }] }] };
            const back = s.parseHyperlink(s.renderHyperlink(h));
            expect(back.anchor).toBe('top');
            expect(back.rId).toBeUndefined();
        });
    });

    describe('parseParagraph / renderParagraph', () => {
        test('roundtrip with pPr + multiple runs', () => {
            const p = {
                type: 'paragraph',
                pPr: { align: 'center' },
                children: [
                    { type: 'run', children: [{ type: 'text', value: 'A' }] },
                    { type: 'run', rPr: { italic: true },
                      children: [{ type: 'text', value: 'B' }] }
                ]
            };
            const back = s.parseParagraph(s.renderParagraph(p));
            expect(back.pPr.align).toBe('center');
            expect(back.children).toHaveLength(2);
            expect(back.children[1].rPr.italic).toBe(true);
        });
    });

    describe('parseTable / parseRow / parseCell', () => {
        test('roundtrip 2x2 table', () => {
            const t = {
                type: 'table',
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', children: [{ type: 'paragraph',
                          children: [{ type: 'run',
                            children: [{ type: 'text', value: 'a' }] }] }] },
                        { type: 'cell', children: [{ type: 'paragraph',
                          children: [{ type: 'run',
                            children: [{ type: 'text', value: 'b' }] }] }] }
                    ]},
                    { type: 'row', cells: [
                        { type: 'cell', children: [{ type: 'paragraph',
                          children: [{ type: 'run',
                            children: [{ type: 'text', value: 'c' }] }] }] },
                        { type: 'cell', children: [{ type: 'paragraph',
                          children: [{ type: 'run',
                            children: [{ type: 'text', value: 'd' }] }] }] }
                    ]}
                ]
            };
            const back = s.parseTable(s.renderTable(t));
            expect(back.type).toBe('table');
            expect(back.rows).toHaveLength(2);
            expect(back.rows[0].cells).toHaveLength(2);
            expect(back.rows[1].cells[1].children[0].children[0]
                       .children[0].value).toBe('d');
        });

        test('cell tcPr (gridSpan, width)', () => {
            const cell = { type: 'cell',
                tcPr: { gridSpan: 2, width: { w: '5000', type: 'dxa' } },
                children: [{ type: 'paragraph', children: [
                    { type: 'run', children: [{ type: 'text', value: 'x' }] }
                ]}]};
            const back = s.parseCell(s.renderCell(cell));
            expect(back.tcPr.gridSpan).toBe(2);
            expect(back.tcPr.width).toEqual({ w: '5000', type: 'dxa' });
        });
    });

    describe('table tblPr (BL-1766)', () => {
        const cellOf = t => ({ type: 'cell', children: [{ type: 'paragraph',
            children: [{ type: 'run', children: [{ type: 'text', value: t }] }] }] });
        const edge = { val: 'single', sz: 4, space: 0, color: 'auto' };
        const tblPr = () => ({
            style: 'TableGrid',
            width: { w: 5000, type: 'pct' },
            borders: {
                top: { ...edge }, left: { ...edge }, bottom: { ...edge },
                right: { ...edge }, insideH: { ...edge }, insideV: { ...edge }
            }
        });

        test('parseTable types w:tblPr; renderTable emits it before the rows', () => {
            const t = { type: 'table', tblPr: tblPr(), rows: [{ type: 'row', cells: [cellOf('a')] }] };
            const el = s.renderTable(t);
            expect(el.children.map(c => c.name)).toEqual(['w:tblPr', 'w:tr']);
            const back = s.parseTable(el);
            expect(back.tblPr).toEqual(tblPr());
            expect(back._extras).toBeUndefined();
        });

        test('a table without tblPr has no tblPr key and renders no w:tblPr', () => {
            const t = { type: 'table', rows: [{ type: 'row', cells: [cellOf('a')] }] };
            const el = s.renderTable(t);
            expect(el.children.map(c => c.name)).toEqual(['w:tr']);
            expect('tblPr' in s.parseTable(el)).toBe(false);
        });

        test('tblGrid stays in _extras and renders tblPr, tblGrid, rows in that order', () => {
            const el = xml.parse(
                '<w:tbl xmlns:w="x"><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>'
                + '<w:tblGrid><w:gridCol w:w="100"/></w:tblGrid>'
                + '<w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>');
            const t = s.parseTable(el);
            expect(t.tblPr).toEqual({ style: 'TableGrid' });
            expect(t._extras.map(e => e.name)).toEqual(['w:tblGrid']);
            expect(s.renderTable(t).children.map(c => c.name))
                .toEqual(['w:tblPr', 'w:tblGrid', 'w:tr']);
        });

        test('tblPr children beyond style/width/borders survive in tblPr._extras', () => {
            const el = xml.parse(
                '<w:tbl xmlns:w="x"><w:tblPr><w:tblLook w:val="04A0"/></w:tblPr>'
                + '<w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>');
            const t = s.parseTable(el);
            expect(t.tblPr._extras[0].name).toBe('w:tblLook');
            expect(s.renderTable(t).children[0].children[0].name).toBe('w:tblLook');
        });
    });

    describe('parseSection / renderSection', () => {
        test('roundtrip pageSize + margins', () => {
            const sect = {
                pageSize: { w: 12240, h: 15840, orient: 'portrait' },
                pageMargin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
            };
            const back = s.parseSection(s.renderSection(sect));
            expect(back.pageSize).toEqual(sect.pageSize);
            expect(back.pageMargin.top).toBe(1440);
        });

        test('returns null when nothing to render', () => {
            expect(s.renderSection(null)).toBeNull();
        });
    });

    describe('parseSdt / renderSdt', () => {
        test('inline SDT with tag + alias', () => {
            const sdt = {
                type: 'sdt',
                properties: { tag: 't', alias: 'a' },
                children: [{ type: 'run', children: [{ type: 'text', value: 'x' }] }]
            };
            const back = s.parseSdt(s.renderSdt(sdt));
            expect(back.type).toBe('sdt');
            expect(back.properties.tag).toBe('t');
            expect(back.properties.alias).toBe('a');
            expect(back.children[0].children[0].value).toBe('x');
        });
    });

    describe('sdtPr — repeating sections (Word 2012 w15 elements)', () => {
        const sdtPr = inner => xml.parse('<w:sdtPr>' + inner + '</w:sdtPr>');

        test('w15:repeatingSection with sectionTitle and doNotAllowInsertDeleteSection children', () => {
            const p = s.parseSdtProperties(sdtPr(
                '<w:tag w:val="rows"/>'
                + '<w15:repeatingSection>'
                + '<w15:sectionTitle w:val="Rows"/>'
                + '<w15:doNotAllowInsertDeleteSection/>'
                + '</w15:repeatingSection>'));
            expect(p).toEqual({
                tag: 'rows', kind: 'repeatingSection',
                sectionTitle: 'Rows', doNotAllowInsertDeleteSection: true
            });
        });

        test('doNotAllowInsertDeleteSection follows CT_OnOff', () => {
            const lock = v => s.parseSdtProperties(sdtPr(
                '<w15:repeatingSection><w15:doNotAllowInsertDeleteSection'
                + (v === undefined ? '' : ` w:val="${v}"`)
                + '/></w15:repeatingSection>')).doNotAllowInsertDeleteSection;
            for (const v of [undefined, '1', 'true', 'on']) expect(lock(v)).toBe(true);
            for (const v of ['0', 'false', 'off']) expect(lock(v)).toBeUndefined();
        });

        test('w15:repeatingSectionItem', () => {
            const p = s.parseSdtProperties(sdtPr('<w15:repeatingSectionItem/>'));
            expect(p).toEqual({ kind: 'repeatingSectionItem' });
        });

        test('legacy main-namespace form (w:sectionTitle attribute) still reads', () => {
            expect(s.parseSdtProperties(sdtPr(
                '<w:repeatingSection w:sectionTitle="Old"/>')))
                .toEqual({ kind: 'repeatingSection', sectionTitle: 'Old' });
            expect(s.parseSdtProperties(sdtPr('<w:repeatingSectionItem/>')))
                .toEqual({ kind: 'repeatingSectionItem' });
        });

        test('render emits the w15 elements only, title before the lock', () => {
            const out = xml.serialize(s.renderSdtProperties({
                kind: 'repeatingSection', sectionTitle: 'Rows',
                doNotAllowInsertDeleteSection: true
            }));
            expect(out).toContain('<w:sdtPr><w15:repeatingSection>'
                + '<w15:sectionTitle w:val="Rows"/>'
                + '<w15:doNotAllowInsertDeleteSection/>'
                + '</w15:repeatingSection></w:sdtPr>');
            const item = xml.serialize(s.renderSdtProperties({ kind: 'repeatingSectionItem' }));
            expect(item).toContain('<w:sdtPr><w15:repeatingSectionItem/></w:sdtPr>');
            const bare = xml.serialize(s.renderSdtProperties({ kind: 'repeatingSection' }));
            expect(bare).toContain('<w:sdtPr><w15:repeatingSection/></w:sdtPr>');
            for (const x of [out, item, bare]) {
                expect(x).not.toContain('<w:repeatingSection');
                expect(x).not.toContain('w:sectionTitle=');
            }
        });

        test('legacy form re-renders as w15', () => {
            const p = s.parseSdtProperties(sdtPr('<w:repeatingSection w:sectionTitle="Old"/>'));
            expect(xml.serialize(s.renderSdtProperties(p))).toContain(
                '<w15:repeatingSection><w15:sectionTitle w:val="Old"/></w15:repeatingSection>');
        });
    });

    describe('parseBody / renderBodyChildren', () => {
        test('full document roundtrip via body', () => {
            const doc = {
                type: 'document',
                body: [{
                    type: 'paragraph',
                    children: [{ type: 'run',
                                 children: [{ type: 'text', value: 'hi' }] }]
                }],
                sectPr: { pageSize: { w: 12240, h: 15840 } }
            };
            const kids = s.renderBodyChildren(doc);
            const bodyEl = xml.el('w:body', {}, kids);
            const parsed = s.parseBody(bodyEl);
            expect(parsed.body).toHaveLength(1);
            expect(parsed.body[0].type).toBe('paragraph');
            expect(parsed.sectPr.pageSize.w).toBe(12240);
        });
    });
});

describe('docx facade - table tblPr round trip (BL-1766)', () => {
    const runtime = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
    const d = runtime.resolve('docx');
    const opc = runtime.resolve('opcPackage');
    const decoder = new TextDecoder();
    const edge = { val: 'single', sz: 4, space: 0, color: 'auto' };
    const cell = t => ({ type: 'cell', children: [d.paragraph(t)] });
    const tblPr = () => ({
        style: 'TableGrid',
        width: { w: 5000, type: 'pct' },
        borders: {
            top: { ...edge }, left: { ...edge }, bottom: { ...edge },
            right: { ...edge }, insideH: { ...edge }, insideV: { ...edge }
        }
    });
    const documentXml = bytes =>
        decoder.decode(opc.read(bytes).parts['/word/document.xml']);

    test('write then read returns the same typed tblPr; w:tblPr precedes the first w:tr', () => {
        const bytes = d.write({ type: 'document', body: [
            { type: 'table', tblPr: tblPr(), rows: [{ type: 'row', cells: [cell('a')] }] }
        ] });
        expect(d.read(bytes).document.body[0].tblPr).toEqual(tblPr());
        const x = documentXml(bytes);
        expect(x.indexOf('<w:tblPr>')).toBeGreaterThan(-1);
        expect(x.indexOf('<w:tblPr>')).toBeLessThan(x.indexOf('<w:tr>'));
        expect(x).toContain('<w:tblStyle w:val="TableGrid"/>');
    });

    test('a table WITHOUT tblPr writes no w:tblPr and reads back without the key', () => {
        const bytes = d.write({ type: 'document', body: [
            { type: 'table', rows: [{ type: 'row', cells: [cell('a')] }] }
        ] });
        expect(documentXml(bytes)).not.toContain('w:tblPr');
        expect('tblPr' in d.read(bytes).document.body[0]).toBe(false);
    });
});
