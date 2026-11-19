// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The large bundle's hooks type losslessly (T60 (b1)): an element a hook
 * would not write back as read — an attribute it does not keep, an empty
 * element, a name a bag holds twice — stays in `_extras` as read, so a
 * save-back through the bundle writes what a save-back through the core
 * writes. `docxProperties.sameElement` and `hydrateLossless` are the guard.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const props = rt.resolve('docxProperties');
const opc = rt.resolve('opcPackage');
const big = new ModuleRuntime();
big.registerDeep(ooxmlMods.docxLargeBundle);
const docx = big.resolve('docxLargeBundle');
const dec = new TextDecoder();

const el = (name, attrs = {}, children = []) => xml.el(name, attrs, children);
const names = (list) => (list || []).map((c) => c.name);

describe('docxProperties.sameElement', () => {
    test('names, attributes in any order, children; a childless toggle value by meaning; whitespace text left out', () => {
        expect(props.sameElement(el('w:x', { 'w:a': '1', 'w:b': '2' }), el('w:x', { 'w:b': '2', 'w:a': '1' }))).toBe(true);
        expect(props.sameElement(el('w:keepNext', { 'w:val': 'true' }), el('w:keepNext'))).toBe(true);
        expect(props.sameElement(el('w:keepNext', { 'w:val': 'false' }), el('w:keepNext', { 'w:val': '0' }))).toBe(true);
        expect(props.sameElement(el('w:keepNext', { 'w:val': '0' }), el('w:keepNext'))).toBe(false);
        expect(props.sameElement(el('w:cnfStyle', { 'w:val': '1', 'w:firstRow': '1' }), el('w:cnfStyle', { 'w:val': '1' }))).toBe(false);
        expect(props.sameElement(el('w:p', {}, [{ type: 'text', value: '\n  ' }, el('w:r')]), el('w:p', {}, [el('w:r')]))).toBe(true);
        expect(props.sameElement(el('w:p', {}, [el('w:r')]), el('w:p', {}, [el('w:r'), el('w:r')]))).toBe(false);
    });
});

describe('docxProperties.hydrateLossless', () => {
    const typeBag = (bag) => {
        const left = [];
        for (const c of bag._extras) {
            if (c.name === 'w:kern') bag.kern = Number(c.attrs['w:val']);
            else if (c.name === 'w:item') (bag.items = bag.items || []).push(c.attrs['w:val']);
            else left.push(c);
        }
        if (left.length) bag._extras = left; else delete bag._extras;
        return bag;
    };
    const untypeBag = (bag) => {
        const out = { ...bag };
        const extras = out._extras ? [...out._extras] : [];
        if (out.kern !== undefined) { extras.push(el('w:kern', { 'w:val': String(out.kern) })); delete out.kern; }
        for (const v of out.items || []) extras.push(el('w:item', { 'w:val': v }));
        delete out.items;
        if (extras.length) out._extras = extras;
        return out;
    };
    test('typed when written back as read; another shape, an unknown element, a name held twice stay as read, in place', () => {
        const bag = { _extras: [el('w:kern', { 'w:val': '28' }), el('w:other'), el('w:item', { 'w:val': 'a' }), el('w:item', { 'w:val': 'b' })] };
        props.hydrateLossless(bag, typeBag, untypeBag);
        expect(bag.kern).toBe(28);
        expect(bag.items).toEqual(['a', 'b']);
        expect(names(bag._extras)).toEqual(['w:other']);
        const odd = { _extras: [el('w:kern', { 'w:val': '28', 'w:x': '1' })] };
        props.hydrateLossless(odd, typeBag, untypeBag);
        expect(odd.kern).toBeUndefined();
        expect(names(odd._extras)).toEqual(['w:kern']);
        const twice = { _extras: [el('w:kern', { 'w:val': '1' }), el('w:other'), el('w:kern', { 'w:val': '2' })] };
        props.hydrateLossless(twice, typeBag, untypeBag);
        expect(twice.kern).toBeUndefined();
        expect(twice._extras.map((c) => `${c.name}${c.attrs['w:val'] ?? ''}`)).toEqual(['w:kern1', 'w:other', 'w:kern2']);
    });
    test('a repeated name typed into an array is all or nothing, so its occurrences keep their order', () => {
        const mixed = { _extras: [el('w:item', { 'w:val': 'a' }), el('w:other'), el('w:item', { 'w:val': 'b', 'w:x': '1' })] };
        props.hydrateLossless(mixed, typeBag, untypeBag);
        expect(mixed.items).toBeUndefined();
        expect(mixed._extras.map((c) => `${c.name}${c.attrs['w:val'] ?? ''}`)).toEqual(['w:itema', 'w:other', 'w:itemb']);
    });
});

describe('the large bundle saves back what it read', () => {
    const document = {
        type: 'document',
        body: [
            {
                type: 'paragraph',
                pPr: { _extras: [el('w:cnfStyle', { 'w:val': '100000000000', 'w:firstRow': '1' }), el('w:framePr'), el('w:keepNext', { 'w:val': 'true' })] },
                children: [{ type: 'run', rPr: { _extras: [el('w:lang'), el('w:shd', { 'w:val': 'clear', 'w:fill': 'A9A57C', 'w:themeFill': 'accent1' }), el('w:kern', { 'w:val': '28' })] }, children: [{ type: 'text', value: 'x' }] }]
            },
            {
                type: 'table',
                rows: [{ type: 'row', _extras: [el('w:trPr')], cells: [{ type: 'cell', tcPr: { _extras: [el('w:tcBorders'), el('w:vAlign', { 'w:val': 'center' })] }, children: [{ type: 'paragraph', children: [] }] }] }]
            }
        ]
    };
    const settings = {
        _extras: [
            el('w:themeFontLang', { 'w:val': 'es-ES', 'w:eastAsia': '', 'w:bidi': '' }),
            el('w:stylePaneFormatFilter', { 'w:val': '3F01', 'w:allStyles': '1' }),
            el('w:compat', {}, [el('w:doNotExpandShiftReturn')]),
            el('w:compat', {}, [el('w:compatSetting', { 'w:name': 'compatibilityMode', 'w:uri': 'http://schemas.microsoft.com/office/word', 'w:val': '12' })])
        ]
    };
    const bytes = docx.write(document, { settings });
    const read = docx.read(bytes);

    test('what a hook cannot write back stays as read; what it can is typed', () => {
        const p = read.document.body[0];
        expect(names(p.pPr._extras).sort()).toEqual(['w:cnfStyle', 'w:framePr']);
        expect(p.pPr.keepNext).toBe(true);
        const r = p.children[0];
        expect(names(r.rPr._extras).sort()).toEqual(['w:lang', 'w:shd']);
        expect(r.rPr.kern).toBe(28);
        const row = read.document.body[1].rows[0];
        expect(names(row._extras)).toEqual(['w:trPr']);
        expect(names(row.cells[0].tcPr._extras)).toEqual(['w:tcBorders']);
        expect(row.cells[0].tcPr.vAlign).toBe('center');
        expect(names(read.settings._extras).sort()).toEqual(['w:compat', 'w:compat', 'w:stylePaneFormatFilter', 'w:themeFontLang']);
    });

    test('the save-back writes the elements as read', () => {
        const again = docx.write(read.document, { settings: read.settings });
        const parts = opc.read(again).parts;
        const body = dec.decode(parts['/word/document.xml']);
        expect(body).toContain('w:firstRow="1"');
        expect(body).toMatch(/<w:framePr\s*\/>/);
        expect(body).toMatch(/<w:lang\s*\/>/);
        expect(body).toContain('w:themeFill="accent1"');
        expect(body).toMatch(/<w:trPr\s*\/>/);
        expect(body).toMatch(/<w:tcBorders\s*\/>/);
        const set = dec.decode(parts['/word/settings.xml']);
        expect(set).toContain('w:bidi=""');
        expect(set).toContain('w:allStyles="1"');
        expect(set.indexOf('doNotExpandShiftReturn')).toBeLessThan(set.indexOf('compatibilityMode'));
    });
});
