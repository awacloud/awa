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

        test('parseTable types w:tblPr; renderTable emits it, then the grid, before the rows', () => {
            const t = { type: 'table', tblPr: tblPr(), rows: [{ type: 'row', cells: [cellOf('a')] }] };
            const el = s.renderTable(t);
            expect(el.children.map(c => c.name)).toEqual(['w:tblPr', 'w:tblGrid', 'w:tr']);
            const back = s.parseTable(el);
            expect(back.tblPr).toEqual(tblPr());
            expect(back._extras.map(e => e.name)).toEqual(['w:tblGrid']);
        });

        test('a table without tblPr has no tblPr key and renders an empty w:tblPr (CT_Tbl requires one)', () => {
            const t = { type: 'table', rows: [{ type: 'row', cells: [cellOf('a')] }] };
            const el = s.renderTable(t);
            expect(el.children.map(c => c.name)).toEqual(['w:tblPr', 'w:tblGrid', 'w:tr']);
            expect(el.children[0].children).toEqual([]);
            const back = s.parseTable(el);
            expect('tblPr' in back).toBe(false);
            expect(back._extras.map(e => e.name)).toEqual(['w:tblPr', 'w:tblGrid']);
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

        test('a table with no preserved grid is written with one gridCol per grid column (CT_Tbl requires w:tblGrid)', () => {
            const sized = (t, w) => ({ ...cellOf(t), tcPr: { width: { w, type: 'dxa' } } });
            const spanned = { ...cellOf('ab'), tcPr: { gridSpan: 2 } };
            const t = { type: 'table', rows: [
                { type: 'row', cells: [spanned, cellOf('c')] },
                { type: 'row', cells: [sized('a', 1000), sized('b', '2000'), sized('c', 3000)] },
                { type: 'row', cells: [cellOf('x')] }
            ] };
            const grid = s.renderTable(t).children[1];
            expect(grid.name).toBe('w:tblGrid');
            expect(grid.children.map(c => [c.name, c.attrs['w:w']])).toEqual([
                ['w:gridCol', '1000'], ['w:gridCol', '2000'], ['w:gridCol', '3000']
            ]);
        });

        test('widths are left out unless a span-free row as wide as the grid gives every one in dxa', () => {
            const pct = { ...cellOf('a'), tcPr: { width: { w: 2500, type: 'pct' } } };
            const t = { type: 'table', rows: [
                { type: 'row', cells: [pct, cellOf('b')] },
                { type: 'row', cells: [{ ...cellOf('c'), tcPr: { width: { w: 900, type: 'dxa' } } }] }
            ] };
            const grid = s.renderTable(t).children[1];
            expect(grid.children.map(c => [c.name, c.attrs['w:w']])).toEqual([['w:gridCol', undefined], ['w:gridCol', undefined]]);
            const empty = s.renderTable({ type: 'table', rows: [] });
            expect(empty.children.map(c => c.name)).toEqual(['w:tblPr', 'w:tblGrid']);
            expect(empty.children[1].children).toEqual([]);
        });

        test('a preserved grid is written once; a nested table gets its own; write, read, write is stable', () => {
            const el = xml.parse(
                '<w:tbl xmlns:w="x"><w:tblGrid><w:gridCol w:w="100"/></w:tblGrid>'
                + '<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>');
            const kept = s.renderTable(s.parseTable(el));
            expect(kept.children.map(c => c.name)).toEqual(['w:tblPr', 'w:tblGrid', 'w:tr']);
            expect(kept.children[1].children.map(c => c.attrs['w:w'])).toEqual(['100']);

            // A preserved childless tblPr still comes first, before a derived grid.
            const bare = s.parseTable(xml.parse('<w:tbl xmlns:w="x"><w:tblPr/><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>'));
            expect(bare._extras.map(e => e.name)).toEqual(['w:tblPr']);
            expect(s.renderTable(bare).children.map(c => c.name)).toEqual(['w:tblPr', 'w:tblGrid', 'w:tr']);

            const inner = { type: 'table', rows: [{ type: 'row', cells: [cellOf('i'), cellOf('j')] }] };
            const outer = { type: 'table', rows: [{ type: 'row', cells: [{ type: 'cell', children: [inner] }] }] };
            const once = s.renderTable(outer);
            const innerEl = once.children[2].children[0].children[0];
            expect(innerEl.name).toBe('w:tbl');
            expect(innerEl.children[1].children).toHaveLength(2);
            expect(xml.serialize(s.renderTable(s.parseTable(once)))).toBe(xml.serialize(once));
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
            expect(s.renderSection(undefined)).toBeNull();
        });

        test('w:pgSz w:code (the paper code) reads as pageSize.code and is written back', () => {
            const sect = s.parseSection(xml.parse('<w:sectPr xmlns:w="x"><w:pgSz w:w="11906" w:h="16838" w:code="9"/></w:sectPr>'));
            expect(sect.pageSize).toEqual({ w: 11906, h: 16838, code: 9 });
            expect(s.renderSection(sect).children[0].attrs).toEqual({ 'w:w': '11906', 'w:h': '16838', 'w:code': '9' });
        });

        test('an empty w:sectPr reads as an empty object and is written back empty', () => {
            const sect = s.parseSection(xml.parse('<w:sectPr xmlns:w="x"/>'));
            expect(sect).toEqual({});
            const el = s.renderSection(sect);
            expect(el.name).toBe('w:sectPr');
            expect(el.children).toEqual([]);
        });

        test('strict universal measures read as twips (A49)', () => {
            const sect = s.parseSection(xml.parse(
                '<w:sectPr xmlns:w="x"><w:pgSz w:w="612pt" w:h="792pt" w:orient="portrait"/>'
                + '<w:pgMar w:top="1in" w:right="2.54cm" w:bottom="25.4mm" w:left="6pc"'
                + ' w:header="0.5in" w:footer="36pt" w:gutter="-1in"/></w:sectPr>'));
            expect(sect.pageSize).toEqual({ w: 12240, h: 15840, orient: 'portrait' });
            expect(sect.pageMargin).toEqual({ top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: -1440 });
            const pi = s.parseSection(xml.parse('<w:sectPr xmlns:w="x"><w:pgMar w:top="6pi" w:left="1.5mm"/></w:sectPr>'));
            expect(pi.pageMargin).toEqual({ top: 1440, left: 85 });
            const out = s.renderSection(sect);
            expect(JSON.stringify(out)).not.toContain('NaN');
            expect(out.children.find((c) => c.name === 'w:pgSz').attrs['w:w']).toBe('12240');
        });

        test('transitional integers read as before', () => {
            const sect = s.parseSection(xml.parse('<w:sectPr xmlns:w="x"><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="-720"/></w:sectPr>'));
            expect(sect.pageSize).toEqual({ w: 11906, h: 16838 });
            expect(sect.pageMargin).toEqual({ top: -720 });
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

    test('a table WITHOUT tblPr writes an empty w:tblPr and its grid, and reads back without the key', () => {
        const bytes = d.write({ type: 'document', body: [
            { type: 'table', rows: [{ type: 'row', cells: [cell('a')] }] }
        ] });
        expect(documentXml(bytes)).toContain('<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid><w:tr>');
        expect('tblPr' in d.read(bytes).document.body[0]).toBe(false);
    });
});

describe('docxStructure - content controls around cells and rows', () => {
    const xml = ooxmlXml.factory();
    const props = docxProperties.factory(xml);
    const draw = docxDrawing.factory(xml, drawingmlShape.factory(xml, _shared), _shared);
    const s = docxStructure.factory(xml, props, draw, ooxmlMath.factory(_errors, xml));
    const W = 'xmlns:w="x"';
    const tc = (t) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const tr = (t) => `<w:tr>${tc(t)}</w:tr>`;
    const pr = (alias) => `<w:sdtPr><w:alias w:val="${alias}"/></w:sdtPr>`;
    const cellText = (c) => c.children[0].children[0].children[0].value;
    const names = (el) => el.children.filter((c) => c.type === 'element').map((c) => c.name);

    test('a cell inside a row-level w:sdt is read in place, carrying the control; written back in place', () => {
        const el = xml.parse(`<w:tr ${W}>${tc('A')}<w:sdt>${pr('Title')}<w:sdtEndPr><w:rPr><w:b/></w:rPr></w:sdtEndPr>`
            + `<w:sdtContent>${tc('B')}</w:sdtContent></w:sdt>${tc('C')}</w:tr>`);
        const row = s.parseRow(el);

        expect(row.cells.map(cellText)).toEqual(['A', 'B', 'C']);
        expect('_extras' in row).toBe(false);
        expect('sdt' in row.cells[0]).toBe(false);
        expect(row.cells[1].sdt).toHaveLength(1);
        const [ctl] = row.cells[1].sdt;
        expect(ctl.group).toBe(0);
        expect(ctl.properties).toEqual(s.parseSdtProperties(xml.findChild(xml.findChild(el, 'w:sdt'), 'w:sdtPr')));
        expect(ctl._extras.map((e) => e.name)).toEqual(['w:sdtEndPr']);

        const back = s.renderRow(row);
        expect(names(back)).toEqual(['w:tc', 'w:sdt', 'w:tc']);
        const sdt = back.children.find((c) => c.name === 'w:sdt');
        expect(names(sdt)).toEqual(['w:sdtPr', 'w:sdtEndPr', 'w:sdtContent']);
        expect(names(xml.findChild(sdt, 'w:sdtContent'))).toEqual(['w:tc']);
        expect(s.parseRow(back)).toEqual(row);
    });

    // T50: a block-level control inside a cell, typed in place as in the body.
    test('a block-level w:sdt in a cell reads as a blockSdt in place and is written back there', () => {
        const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
        const el = xml.parse(`<w:tr ${W}><w:tc>${p('before')}<w:sdt>${pr('Field')}<w:sdtContent>${p('inside')}</w:sdtContent></w:sdt>`
            + `${p('after')}</w:tc></w:tr>`);
        const cell = s.parseRow(el).cells[0];

        expect(cell.children.map((c) => c.type)).toEqual(['paragraph', 'blockSdt', 'paragraph']);
        expect('_extras' in cell).toBe(false);
        expect(cell.children[1].properties.alias).toBe('Field');
        expect(cell.children[1].children[0].children[0].children[0].value).toBe('inside');

        const tcEl = xml.findChild(s.renderRow(s.parseRow(el)), 'w:tc');
        expect(names(tcEl)).toEqual(['w:p', 'w:sdt', 'w:p']);
        expect(s.parseRow(s.renderRow(s.parseRow(el)))).toEqual(s.parseRow(el));
    });

    test('a control holding two cells is one group; two adjacent controls are two', () => {
        const el = xml.parse(`<w:tr ${W}><w:sdt>${pr('a')}<w:sdtContent>${tc('1')}${tc('2')}</w:sdtContent></w:sdt>`
            + `<w:sdt>${pr('b')}<w:sdtContent>${tc('3')}</w:sdtContent></w:sdt></w:tr>`);
        const row = s.parseRow(el);
        expect(row.cells.map((c) => c.sdt.map((x) => x.group))).toEqual([[0], [0], [1]]);
        const back = s.renderRow(row);
        expect(names(back)).toEqual(['w:sdt', 'w:sdt']);
        expect(back.children.map((c) => names(xml.findChild(c, 'w:sdtContent')))).toEqual([['w:tc', 'w:tc'], ['w:tc']]);
    });

    test('a nested control adds a level; a content child that is neither a cell nor a control is kept', () => {
        const el = xml.parse(`<w:tr ${W}><w:sdt>${pr('outer')}<w:sdtContent>${tc('X')}`
            + `<w:sdt>${pr('inner')}<w:sdtContent>${tc('Y')}</w:sdtContent></w:sdt>`
            + `<w:customXml w:element="k"/></w:sdtContent></w:sdt></w:tr>`);
        const row = s.parseRow(el);
        expect(row.cells.map(cellText)).toEqual(['X', 'Y']);
        expect(row.cells.map((c) => c.sdt.map((x) => x.group))).toEqual([[0], [0, 1]]);
        expect(row.cells[0].sdt[0]._contentExtras.map((e) => e.name)).toEqual(['w:customXml']);

        const back = s.renderRow(row);
        expect(names(back)).toEqual(['w:sdt']);
        const content = xml.findChild(back.children[0], 'w:sdtContent');
        expect(names(content)).toEqual(['w:tc', 'w:sdt', 'w:customXml']);
        expect(s.parseRow(back)).toEqual(row);
    });

    test('rows inside a table-level w:sdt are read in place and written back in place', () => {
        const el = xml.parse(`<w:tbl ${W}><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid>${tr('r1')}`
            + `<w:sdt>${pr('rows')}<w:sdtContent>${tr('r2')}${tr('r3')}</w:sdtContent></w:sdt>${tr('r4')}</w:tbl>`);
        const t = s.parseTable(el);
        expect(t.rows.map((r) => cellText(r.cells[0]))).toEqual(['r1', 'r2', 'r3', 'r4']);
        expect(t.rows.map((r) => (r.sdt ? r.sdt.map((x) => x.group) : null))).toEqual([null, [0], [0], null]);
        expect(t._extras.map((e) => e.name)).toEqual(['w:tblPr', 'w:tblGrid']);

        const back = s.renderTable(t);
        expect(names(back)).toEqual(['w:tblPr', 'w:tblGrid', 'w:tr', 'w:sdt', 'w:tr']);
        expect(names(xml.findChild(back.children[3], 'w:sdtContent'))).toEqual(['w:tr', 'w:tr']);
        expect(s.parseTable(back)).toEqual(t);
    });

    test('a cell whose only content is a block-level w:sdt gets no extra paragraph; an empty cell still gets one', () => {
        const cell = s.parseCell(xml.parse(`<w:tc ${W}><w:sdt>${pr('block')}<w:sdtContent>`
            + '<w:p><w:r><w:t>X</w:t></w:r></w:p></w:sdtContent></w:sdt></w:tc>'));
        // typed in place since T50 (it was kept raw in _extras)
        expect(cell.children.map((c) => c.type)).toEqual(['blockSdt']);
        expect(names(s.renderCell(cell))).toEqual(['w:sdt']);
        expect(names(s.renderCell({ type: 'cell', children: [] }))).toEqual(['w:p']);
    });

    test('the derived grid counts the cells inside a control', () => {
        const row = s.parseRow(xml.parse(`<w:tr ${W}>${tc('A')}<w:sdt>${pr('c')}<w:sdtContent>${tc('B')}</w:sdtContent></w:sdt></w:tr>`));
        const grid = s.renderTable({ type: 'table', rows: [row] }).children[1];
        expect(grid.children).toHaveLength(2);
    });
});

describe('docx facade - content controls around cells keep their place', () => {
    const runtime = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
    const d = runtime.resolve('docx');
    const opc = runtime.resolve('opcPackage');
    const decoder = new TextDecoder();
    const documentXml = (bytes) => decoder.decode(opc.read(bytes).parts['/word/document.xml']);

    test('read -> write -> read keeps a content-control cell before a plain one', () => {
        const ctl = { group: 0, properties: { alias: 'Title' } };
        const source = d.write({ type: 'document', body: [{ type: 'table', rows: [{ type: 'row', cells: [
            { type: 'cell', children: [d.paragraph('first')], sdt: [ctl] },
            { type: 'cell', children: [d.paragraph('second')] }
        ] }] }] });
        const x = documentXml(source);
        expect(x.indexOf('<w:sdt>')).toBeGreaterThan(-1);
        expect(x.indexOf('first')).toBeLessThan(x.indexOf('second'));

        const r = d.read(source);
        const again = d.write(r.document, { carry: r });
        const y = documentXml(again);
        expect(y.indexOf('<w:sdt>')).toBeLessThan(y.indexOf('second'));
        expect(y.indexOf('first')).toBeLessThan(y.indexOf('second'));
        const cells = d.read(again).document.body[0].rows[0].cells;
        expect(cells.map((c) => c.children[0].children[0].children[0].value)).toEqual(['first', 'second']);
        expect(cells[0].sdt[0].properties.alias).toBe('Title');
    });
});

describe('docx facade - the page background', () => {
    const runtime = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
    const d = runtime.resolve('docx');
    const opc = runtime.resolve('opcPackage');
    const decoder = new TextDecoder();
    const documentXml = (bytes) => decoder.decode(opc.read(bytes).parts['/word/document.xml']);
    const vml = { type: 'element', name: 'v:background', attrs: { id: '_x0000_s1025', fillcolor: '#ffff00' }, children: [] };

    test('a coloured background and a VML one are read, written before the body and read back equal', () => {
        for (const background of [{ color: 'FFFF00' }, { color: '1F497D', themeColor: 'text2', themeShade: 'BF', _extras: [vml] }]) {
            const bytes = d.write({ type: 'document', background, body: [d.paragraph('x')] });
            const x = documentXml(bytes);
            expect(x.indexOf('<w:background')).toBeGreaterThan(-1);
            expect(x.indexOf('<w:background')).toBeLessThan(x.indexOf('<w:body>'));
            if (background._extras) expect(x).toMatch(/<w:document [^>]*xmlns:v="urn:schemas-microsoft-com:vml"/);
            const back = d.read(bytes).document;
            expect(back.background).toEqual(background);
            expect(documentXml(d.write(back))).toBe(x);
        }
    });

    test('no background writes no w:background and reads back without the key', () => {
        const bytes = d.write({ type: 'document', body: [d.paragraph('x')] });
        expect(documentXml(bytes)).not.toContain('w:background');
        expect('background' in d.read(bytes).document).toBe(false);
    });
});

describe('docxStructure - hyperlink attributes', () => {
    const xml = ooxmlXml.factory();
    const props = docxProperties.factory(xml);
    const draw = docxDrawing.factory(xml, drawingmlShape.factory(xml, _shared), _shared);
    const s = docxStructure.factory(xml, props, draw, ooxmlMath.factory(_errors, xml));

    test('w:history, w:tooltip, w:tgtFrame and w:docLocation are read and written back', () => {
        const el = xml.parse('<w:hyperlink xmlns:w="x" xmlns:r="y" r:id="rId4" w:history="1" w:tooltip="Go"'
            + ' w:tgtFrame="_blank" w:docLocation="loc"><w:r><w:t>a</w:t></w:r></w:hyperlink>');
        const h = s.parseHyperlink(el);
        expect(h).toMatchObject({ rId: 'rId4', history: true, tooltip: 'Go', tgtFrame: '_blank', docLocation: 'loc' });
        expect(s.renderHyperlink(h).attrs).toEqual({ 'r:id': 'rId4', 'w:tgtFrame': '_blank', 'w:tooltip': 'Go',
            'w:docLocation': 'loc', 'w:history': '1' });
    });

    test('w:history="0" stays false; a link without them writes none', () => {
        const off = s.parseHyperlink(xml.parse('<w:hyperlink xmlns:w="x" w:anchor="b" w:history="0"><w:r><w:t>a</w:t></w:r></w:hyperlink>'));
        expect(off.history).toBe(false);
        expect(s.renderHyperlink(off).attrs).toEqual({ 'w:anchor': 'b', 'w:history': '0' });
        const bare = s.parseHyperlink(xml.parse('<w:hyperlink xmlns:w="x" w:anchor="b"><w:r><w:t>a</w:t></w:r></w:hyperlink>'));
        expect(Object.keys(bare)).toEqual(['type', 'children', 'anchor']);
        expect(s.renderHyperlink(bare).attrs).toEqual({ 'w:anchor': 'b' });
    });
});

describe('docxStructure - content control fidelity', () => {
    const xml = ooxmlXml.factory();
    const props = docxProperties.factory(xml);
    const draw = docxDrawing.factory(xml, drawingmlShape.factory(xml, _shared), _shared);
    const s = docxStructure.factory(xml, props, draw, ooxmlMath.factory(_errors, xml));
    const names = (el) => el.children.filter((c) => c.type === 'element').map((c) => c.name);
    const END = '<w:sdtEndPr><w:rPr><w:b/></w:rPr></w:sdtEndPr>';

    test('w:sdtEndPr is kept on a block and an inline control, written between sdtPr and sdtContent', () => {
        const block = s.parseSdt(xml.parse('<w:sdt xmlns:w="x"><w:sdtPr><w:tag w:val="t"/></w:sdtPr>' + END
            + '<w:sdtContent><w:p/></w:sdtContent></w:sdt>'), true);
        expect(block._extras.map((e) => e.name)).toEqual(['w:sdtEndPr']);
        expect(names(s.renderSdt(block))).toEqual(['w:sdtPr', 'w:sdtEndPr', 'w:sdtContent']);
        const inline = s.parseSdt(xml.parse('<w:sdt xmlns:w="x"><w:sdtPr><w:tag w:val="t"/></w:sdtPr>' + END
            + '<w:sdtContent><w:r><w:t>a</w:t></w:r></w:sdtContent></w:sdt>'), false);
        expect(names(s.renderSdt(inline))).toEqual(['w:sdtPr', 'w:sdtEndPr', 'w:sdtContent']);
    });

    test("an inline control's content is typed as a paragraph's; another child is kept after it", () => {
        const sdt = s.parseSdt(xml.parse('<w:sdt xmlns:w="x"><w:sdtContent><w:bookmarkStart w:id="1" w:name="b"/>'
            + '<w:r><w:t>a</w:t></w:r><w:customXml w:element="place"/><w:bookmarkEnd w:id="1"/></w:sdtContent></w:sdt>'), false); // T68: customXml, smartTag being typed
        expect(sdt.children.map((c) => c.type)).toEqual(['bookmarkStart', 'run', 'bookmarkEnd']);
        expect(sdt._contentExtras.map((e) => e.name)).toEqual(['w:customXml']);
        const content = s.renderSdt(sdt).children.find((c) => c.name === 'w:sdtContent');
        expect(names(content)).toEqual(['w:bookmarkStart', 'w:r', 'w:bookmarkEnd', 'w:customXml']);
    });

    test('w:showingPlcHdr keeps its value; w:text keeps its attributes', () => {
        const pr = (inner) => s.parseSdtProperties(xml.parse('<w:sdtPr xmlns:w="x">' + inner + '</w:sdtPr>'));
        const off = pr('<w:showingPlcHdr w:val="false"/>');
        expect(off.showingPlcHdr).toBe(false);
        expect(s.renderSdtProperties(off).children[0].attrs).toEqual({ 'w:val': '0' });
        const on = pr('<w:showingPlcHdr/>');
        expect(on.showingPlcHdr).toBe(true);
        expect(s.renderSdtProperties(on).children[0].attrs).toEqual({});
        const text = pr('<w:text w:multiLine="1"/>');
        expect(text.kind).toBe('text');
        expect(s.renderSdtProperties(text).children[0].attrs).toEqual({ 'w:multiLine': '1' });
    });
});

describe('docxStructure - run-level attributes', () => {
    const xml = ooxmlXml.factory();
    const props = docxProperties.factory(xml);
    const draw = docxDrawing.factory(xml, drawingmlShape.factory(xml, _shared), _shared);
    const s = docxStructure.factory(xml, props, draw, ooxmlMath.factory(_errors, xml));

    test("a break's w:clear and a note reference's w:customMarkFollows are read and written back", () => {
        const run = s.parseRun(xml.parse('<w:r xmlns:w="x"><w:br w:type="textWrapping" w:clear="all"/>'
            + '<w:footnoteReference w:customMarkFollows="1" w:id="2"/><w:endnoteReference w:id="3"/></w:r>'));
        expect(run.children).toEqual([
            { type: 'break', kind: 'textWrapping', clear: 'all' },
            { type: 'footnoteReference', id: '2', customMarkFollows: true },
            { type: 'endnoteReference', id: '3' }
        ]);
        expect(s.renderRun(run).children.map((c) => c.attrs)).toEqual([
            { 'w:type': 'textWrapping', 'w:clear': 'all' },
            { 'w:customMarkFollows': '1', 'w:id': '2' },
            { 'w:id': '3' }
        ]);
    });
});

describe('docx facade - the Office extension elements, opt-in', () => {
    const runtime = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
    const d = runtime.resolve('docx');
    const opc = runtime.resolve('opcPackage');
    const decoder = new TextDecoder();
    const documentXml = (bytes) => decoder.decode(opc.read(bytes).parts['/word/document.xml']);
    const el = (name, attrs = {}, children = []) => ({ type: 'element', name, attrs, children });
    const source = d.write({ type: 'document', body: [{ type: 'paragraph', children: [
        { type: 'run', rPr: { bold: true, _extras: [el('w14:textOutline', { 'w14:w': '9525' })] },
          children: [{ type: 'text', value: 'a' }] },
        { type: 'sdt', properties: { tag: 't', _extras: [el('w14:checkbox', {}, [el('w14:checked', { 'w14:val': '1' })])] },
          children: [{ type: 'run', children: [{ type: 'text', value: 'b' }] }] }
    ] }] });

    test('the default read drops them, as before', () => {
        expect(documentXml(source)).toContain('<w14:textOutline');
        expect(documentXml(d.write(d.read(source).document))).not.toContain('w14:');
    });

    test("extensions: 'keep' keeps them through a write, declared and ignorable", () => {
        const r = d.read(source, { extensions: 'keep' });
        const x = documentXml(d.write(r.document));
        expect(x).toContain('<w14:textOutline w14:w="9525"/>');
        expect(x).toContain('<w14:checkbox><w14:checked w14:val="1"/></w14:checkbox>');
        expect(x).toMatch(/<w:document [^>]*xmlns:w14="http:\/\/schemas.microsoft.com\/office\/word\/2010\/wordml"/);
        expect(x).toMatch(/mc:Ignorable="[^"]*\bw14\b/);
    });

    test('any other value throws a ContractError', () => {
        expect(() => d.read(source, { extensions: 'yes' })).toThrow(expect.objectContaining({ code: 'docx/invalid-extensions' }));
    });
});
