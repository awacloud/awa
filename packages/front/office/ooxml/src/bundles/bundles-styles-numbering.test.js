// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `docxFullBundle` types the styles' and the numbering's
 * details (T60 (b3), `wmlStyleDetails`): a style's flags and names, a
 * table style's conditional formats, the latent styles; an abstract
 * numbering's ids and links, a level's suffix, style, legal flag, legacy
 * and restart. `docxLargeBundle` reads them in `_extras` as before. Each element is typed only when it
 * is written back as read, and the save-back writes the parts as read.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const props = rt.resolve('docxProperties');
const big = new ModuleRuntime();
big.registerDeep(ooxmlMods.docxFullBundle);
const docx = big.resolve('docxFullBundle');
const large = new ModuleRuntime();
large.registerDeep(ooxmlMods.docxLargeBundle);
const dec = new TextDecoder();
const el = (name, attrs = {}, children = []) => xml.el(name, attrs, children);
const val = (name, v) => el(name, { 'w:val': String(v) });

const styles = {
    _extras: [el('w:latentStyles', { 'w:defLockedState': '0', 'w:defUIPriority': '99', 'w:count': '2' },
        [el('w:lsdException', { 'w:name': 'Normal', 'w:uiPriority': '0', 'w:qFormat': '1' }), el('w:lsdException', { 'w:name': 'heading 1', 'w:uiPriority': '9' })])],
    styles: [
        { type: 'paragraph', styleId: 'Heading1', name: 'heading 1',
            _extras: [val('w:link', 'Heading1Char'), val('w:uiPriority', 9), el('w:qFormat'), el('w:semiHidden'), el('w:unhideWhenUsed'), val('w:rsid', '00A1B2C3'), val('w:aliases', 'H1')] },
        { type: 'paragraph', styleId: 'Odd', name: 'odd', _extras: [val('w:uiPriority', '099')] },
        { type: 'table', styleId: 'Grid', name: 'grid',
            _extras: [el('w:tblStylePr', { 'w:type': 'firstRow' }, [el('w:rPr', {}, [el('w:b'), val('w:kern', 28)]), el('w:tblPr'), el('w:tcPr', {}, [el('w:shd', { 'w:val': 'clear', 'w:fill': 'FF0000' })])]),
                el('w:tblStylePr', { 'w:type': 'lastRow' }, [el('w:pPr', {}, [el('w:keepNext')])])] }
    ]
};
const numbering = {
    _extras: [val('w:numIdMacAtCleanup', 3)],
    abstractNums: [{ abstractNumId: 0, multiLevelType: 'hybridMultilevel',
        _extras: [val('w:nsid', '1A2B3C4D'), val('w:tmpl', '0409000F')],
        levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.',
            _extras: [val('w:suff', 'space'), val('w:pStyle', 'Heading1'), el('w:isLgl'), val('w:lvlRestart', 0), el('w:legacy', { 'w:legacy': '1', 'w:legacySpace': '0', 'w:legacyIndent': '360' })] }] }],
    nums: [{ numId: 1, abstractNumId: 0 }]
};
const body = { type: 'document', body: [{ type: 'paragraph', pPr: { numPr: { numId: 1, ilvl: 0 } }, children: [] }] };
const read = docx.read(docx.write(body, { styles, numbering }));

describe('wmlStyleDetails through docxFullBundle', () => {
    test('a style\'s flags and names, the latent styles, typed', () => {
        const h = read.styles.styles.find((s) => s.styleId === 'Heading1');
        expect({ link: h.link, uiPriority: h.uiPriority, qFormat: h.qFormat, semiHidden: h.semiHidden, unhideWhenUsed: h.unhideWhenUsed, rsid: h.rsid, aliases: h.aliases })
            .toEqual({ link: 'Heading1Char', uiPriority: 9, qFormat: true, semiHidden: true, unhideWhenUsed: true, rsid: '00A1B2C3', aliases: 'H1' });
        expect(h._extras).toBeUndefined();
        expect(read.styles.latentStyles).toEqual({ defLockedState: '0', defUIPriority: '99', count: '2',
            exceptions: [{ name: 'Normal', uiPriority: '0', qFormat: '1' }, { name: 'heading 1', uiPriority: '9' }] });
    });
    test('a value the typing would not write back as read stays raw', () => {
        const odd = read.styles.styles.find((s) => s.styleId === 'Odd');
        expect(odd.uiPriority).toBeUndefined();
        expect(odd._extras.map((c) => c.name)).toEqual(['w:uiPriority']);
    });
    test('a table style\'s conditional formats, their properties typed by the run and paragraph hooks', () => {
        const g = read.styles.styles.find((s) => s.styleId === 'Grid');
        expect(g.tblStylePr.map((t) => t.type)).toEqual(['firstRow', 'lastRow']);
        expect(g.tblStylePr[0].rPr.bold).toBe(true);
        expect(g.tblStylePr[0].rPr.kern).toBe(28);
        // An empty tblPr types as {} (written back empty).
        expect(g.tblStylePr[0].tblPr).toEqual({});
        expect(g.tblStylePr[0]._extras.map((c) => c.name)).toEqual(['w:tcPr']);
        expect(g.tblStylePr[1].pPr.keepNext).toBe(true);
    });
});

describe('the numbering hooks through docxFullBundle', () => {
    test('the part\'s, the abstract numbering\'s and the level\'s details typed', () => {
        expect(read.numbering.numIdMacAtCleanup).toBe(3);
        const an = read.numbering.abstractNums[0];
        expect([an.nsid, an.tmpl, an._extras]).toEqual(['1A2B3C4D', '0409000F', undefined]);
        const lvl = an.levels[0];
        expect({ suff: lvl.suff, pStyle: lvl.pStyle, isLgl: lvl.isLgl, lvlRestart: lvl.lvlRestart, legacy: lvl.legacy, extras: lvl._extras })
            .toEqual({ suff: 'space', pStyle: 'Heading1', isLgl: true, lvlRestart: 0, legacy: { legacy: '1', legacySpace: '0', legacyIndent: '360' }, extras: undefined });
    });
});

describe('docxLargeBundle reads them as before', () => {
    test('a level\'s details and a style\'s flags stay in _extras', () => {
        const r = large.resolve('docxLargeBundle').read(docx.write(body, { styles, numbering }));
        expect(r.numbering.abstractNums[0].levels[0]._extras.map((c) => c.name)).toContain('w:suff');
        expect(r.styles.styles.find((s) => s.styleId === 'Heading1')._extras.map((c) => c.name)).toContain('w:uiPriority');
    });
});

describe('the save-back writes the styles and numbering as read', () => {
    test('every element of the two parts, the same', () => {
        const first = opc.read(docx.write(body, { styles, numbering })).parts;
        const again = opc.read(docx.write(read.document, { styles: read.styles, numbering: read.numbering })).parts;
        for (const part of ['/word/styles.xml', '/word/numbering.xml']) {
            const a = xml.parse(dec.decode(first[part])), b = xml.parse(dec.decode(again[part]));
            expect(props.sameElement(a, b)).toBe(true);
        }
    });
});
