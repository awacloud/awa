// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `docxFullBundle` types the docx body's, sections' and
 * settings' details `docx-large` leaves raw (T60 (c), `wmlDocumentDetails`);
 * the walker dehydrates in reverse registration order and visits sections.
 * `docxLargeBundle` reads them in `_extras` as before; the save-back writes
 * the parts as read.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const props = rt.resolve('docxProperties');
const { createWalker } = rt.resolve('docxWalker');
const bundle = (desc, name) => { const r = new ModuleRuntime(); r.registerDeep(desc); return r.resolve(name); };
const full = bundle(ooxmlMods.docxFullBundle, 'docxFullBundle');
const large = bundle(ooxmlMods.docxLargeBundle, 'docxLargeBundle');
const dec = new TextDecoder();
const el = (name, attrs = {}, children = []) => xml.el(name, attrs, children);
const val = (name, v) => el(name, { 'w:val': String(v) });
const rev = { 'w:id': '1', 'w:author': 'A', 'w:date': '2026-01-01T00:00:00Z' };

const document = {
    type: 'document',
    body: [
        { type: 'paragraph',
            pPr: { _extras: [el('w:shd', { 'w:val': 'clear', 'w:fill': 'EEEEEE' }), el('w:pBdr', {}, [el('w:top', { 'w:val': 'single', 'w:sz': '4' }), el('w:bottom', { 'w:val': 'single', 'w:sz': '8' })]),
                el('w:pPrChange', rev, [el('w:pPr', {}, [el('w:keepNext')])])] },
            children: [{ type: 'run', rPr: { _extras: [el('w:rtl'), val('w:spacing', 20), el('w:rPrChange', rev, [el('w:rPr', {}, [el('w:b')])])] }, children: [{ type: 'text', value: 'x' }] }] },
        { type: 'table', rows: [{ type: 'row', _extras: [el('w:tblPrEx', {}, [el('w:tblBorders', {}, [el('w:top', { 'w:val': 'nil' })])])],
            cells: [{ type: 'cell', tcPr: { _extras: [el('w:shd', { 'w:val': 'clear', 'w:fill': 'FF0000' })] }, children: [{ type: 'paragraph', children: [] }] }] }] }
    ],
    sectPr: { _extras: [el('w:pgNumType', { 'w:start': '3' }), el('w:cols', { 'w:num': '2', 'w:space': '720' }, [el('w:col', { 'w:w': '4000' }), el('w:col', { 'w:w': '4500' })]),
        el('w:formProt', { 'w:val': 'false' }), el('w:docGrid', { 'w:linePitch': '360' })] }
};
const settings = {
    _extras: [el('w:doNotAutoCompressPictures'), el('w:compat', {}, [el('w:useFELayout'), el('w:compatSetting', { 'w:name': 'compatibilityMode', 'w:uri': 'http://schemas.microsoft.com/office/word', 'w:val': '15' })]),
        el('m:mathPr', {}, [el('m:mathFont', { 'm:val': 'Cambria Math' }), el('m:brkBin', { 'm:val': 'before' }), el('m:dispDef')])]
};
const bytes = full.write(document, { settings });
const read = full.read(bytes);

describe('wmlDocumentDetails through docxFullBundle', () => {
    test('a run\'s and a paragraph\'s details, their property changes', () => {
        const p = read.document.body[0];
        expect(p.pPr.shd).toEqual({ val: 'clear', fill: 'EEEEEE' });
        expect(p.pPr.pBdr).toEqual({ top: { val: 'single', sz: '4' }, bottom: { val: 'single', sz: '8' } });
        expect(p.pPr.pPrChange.author).toBe('A');
        expect(p.pPr._extras).toBeUndefined();
        const r = p.children[0].rPr;
        expect([r.rtl, r.spacing, r.rPrChange.id, r.rPrChange.rPr.bold, r._extras]).toEqual([true, 20, '1', true, undefined]);
    });
    test('a cell\'s shading, a row\'s table property exceptions, the section\'s details', () => {
        const row = read.document.body[1].rows[0];
        expect(row.cells[0].tcPr.shd).toEqual({ val: 'clear', fill: 'FF0000' });
        expect(row.tblPrEx).toBeDefined();
        expect(row._extras).toBeUndefined();
        const s = read.document.sectPr;
        expect([s.pgNumType, s.cols, s.formProt, s.docGrid, s._extras])
            .toEqual([{ start: '3' }, { num: '2', space: '720', col: [{ w: '4000' }, { w: '4500' }] }, false, { linePitch: '360' }, undefined]);
    });
    test('settings\' math properties and toggles, compat\'s legacy toggles', () => {
        expect(read.settings.mathPr).toEqual({ mathFont: 'Cambria Math', brkBin: 'before', dispDef: true });
        expect(read.settings.toggles).toEqual({ doNotAutoCompressPictures: true });
        expect(read.settings.compat.toggles).toEqual({ useFELayout: true });
    });
    test('docxLargeBundle reads them in _extras as before', () => {
        const l = large.read(bytes);
        expect(l.document.body[0].children[0].rPr._extras.map((c) => c.name)).toContain('w:rtl');
        expect(l.document.sectPr._extras.map((c) => c.name)).toContain('w:pgNumType');
    });
    test('the save-back writes the document and settings as read', () => {
        const again = opc.read(full.write(read.document, { settings: read.settings })).parts;
        const first = opc.read(bytes).parts;
        for (const part of ['/word/document.xml', '/word/settings.xml']) {
            expect(props.sameElement(xml.parse(dec.decode(again[part])), xml.parse(dec.decode(first[part])))).toBe(true);
        }
    });
});

describe('the walker\'s dehydrate order and sections', () => {
    test('dehydrate hooks run in reverse registration order; a section is visited', () => {
        const log = [];
        const ext = (tag) => ({
            hydrateRunProperties(r) { log.push(`h${tag}`); return r; },
            dehydrateRunProperties(r) { log.push(`d${tag}`); return r; },
            hydrateSection(s) { log.push(`s${tag}`); return s; }
        });
        const w = createWalker();
        w.use(ext(1), ext(2));
        const m = { document: { type: 'document', body: [{ type: 'paragraph', children: [{ type: 'run', rPr: {}, children: [] }] }], sectPr: {} } };
        w.applyHydrate(m);
        w.applyDehydrate(m);
        expect(log).toEqual(['h1', 'h2', 's1', 's2', 'd2', 'd1']);
    });
});
