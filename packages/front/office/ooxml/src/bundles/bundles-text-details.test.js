// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `pptxFullBundle` types the DrawingML text details and the
 * theme's script fonts the core leaves raw (T60 (d), `dmlTextDetails`); the
 * pptx walker reaches table cells and visits paragraphs and the theme.
 * `pptxLargeBundle` reads them in `_extras` as before; the save-back writes
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
const theme = rt.resolve('pptxTheme');
const table = rt.resolve('pptxTable');
const { createWalker } = rt.resolve('pptxWalker');
const bundle = (desc, name) => { const r = new ModuleRuntime(); r.registerDeep(desc); return r.resolve(name); };
const full = bundle(ooxmlMods.pptxFullBundle, 'pptxFullBundle');
const large = bundle(ooxmlMods.pptxLargeBundle, 'pptxLargeBundle');
const dec = new TextDecoder();
const el = (name, attrs = {}, children = []) => xml.el(name, attrs, children);

const pPrExtras = () => [
    el('a:lnSpc', {}, [el('a:spcPct', { val: '90000' })]), el('a:spcBef', {}, [el('a:spcPts', { val: '600' })]),
    el('a:buClr', {}, [el('a:schemeClr', { val: 'accent1' })]), el('a:buSzPct', { val: '80000' }),
    el('a:buFont', { typeface: 'Arial', pitchFamily: '34', charset: '0' }), el('a:tabLst', {}, [el('a:tab', { pos: '914400', algn: 'l' })])
];
const rPrExtras = () => [
    el('a:solidFill', {}, [el('a:schemeClr', { val: 'tx1' }, [el('a:lumMod', { val: '75000' })])]),
    el('a:effectLst', {}, [el('a:outerShdw', { blurRad: '38100', dist: '38100', dir: '2700000', algn: 'tl' }, [el('a:srgbClr', { val: '000000' }, [el('a:alpha', { val: '43137' })])])]),
    el('a:ea', { typeface: 'MS Gothic' }), el('a:cs', { typeface: 'Arial' }), el('a:uFillTx')
];
const endPara = () => el('a:endParaRPr', { lang: 'en-US', dirty: '0' }, [el('a:solidFill', {}, [el('a:schemeClr', { val: 'tx2' })]), el('a:ea', { typeface: 'Yu Gothic' })]);
const paragraph = () => ({ pPr: { _extras: pPrExtras() }, runs: [{ type: 'text', value: 'x', rPr: { lang: 'en-US', _extras: rPrExtras() } }], _extras: [endPara()] });

const cellTable = table.tableFromRows([['a']]);
cellTable.rows[0].cells[0].txBody = { paragraphs: [paragraph()] };
const th = theme.defaults();
th.fontScheme.majorFont._extras = [el('a:font', { script: 'Jpan', typeface: 'Yu Gothic Light' }), el('a:font', { script: 'Hang', typeface: 'Malgun Gothic' })];
th.fontScheme.minorFont._extras = [el('a:font', { script: 'Jpan', typeface: 'Yu Gothic' })];
const pres = { slides: [{ shapes: [{ type: 'shape', id: 2, name: 'T', txBody: { paragraphs: [paragraph()] } }, cellTable] }], theme: th };
const bytes = full.write(structuredClone(pres));
const read = full.read(bytes).presentation;

describe('dmlTextDetails through pptxFullBundle', () => {
    test('a run\'s properties: colour, effects, script fonts, underline fill', () => {
        const r = read.slides[0].shapes[0].txBody.paragraphs[0].runs[0].rPr;
        expect(r.solidFill).toEqual({ kind: 'schemeClr', attrs: { val: 'tx1' }, mods: [{ kind: 'lumMod', attrs: { val: '75000' } }] });
        expect(r.effectLst.effects[0].kind).toBe('outerShdw');
        expect([r.ea, r.cs, r.uFillTx, r._extras]).toEqual([{ typeface: 'MS Gothic' }, { typeface: 'Arial' }, true, undefined]);
    });
    test('a paragraph\'s properties: spacing, bullets, tabs', () => {
        const p = read.slides[0].shapes[0].txBody.paragraphs[0].pPr;
        expect([p.lnSpc, p.spcBef, p.buSzPct, p.buFont, p.tabLst, p._extras]).toEqual([
            { pct: 90000 }, { pts: 600 }, 80000, { typeface: 'Arial', pitchFamily: '34', charset: '0' }, [{ pos: '914400', algn: 'l' }], undefined]);
        expect(p.buClr).toEqual({ kind: 'schemeClr', attrs: { val: 'accent1' }, mods: [] });
    });
    test('a paragraph\'s end properties, in a shape and in a table cell', () => {
        for (const p of [read.slides[0].shapes[0].txBody.paragraphs[0], read.slides[0].shapes[1].rows[0].cells[0].txBody.paragraphs[0]]) {
            expect(p._extras).toBeUndefined();
            expect(p.endParaRPr.lang).toBe('en-US');
            expect(p.endParaRPr.ea).toEqual({ typeface: 'Yu Gothic' });
            expect(p.pPr.lnSpc).toEqual({ pct: 90000 });
            expect(p.runs[0].rPr.cs).toEqual({ typeface: 'Arial' });
        }
    });
    test('the theme\'s script fonts', () => {
        expect(read.theme.fontScheme.majorFont.fonts).toEqual([{ script: 'Jpan', typeface: 'Yu Gothic Light' }, { script: 'Hang', typeface: 'Malgun Gothic' }]);
        expect(read.theme.fontScheme.minorFont.fonts).toEqual([{ script: 'Jpan', typeface: 'Yu Gothic' }]);
        expect(read.theme.fontScheme.majorFont._extras).toBeUndefined();
    });
    test('pptxLargeBundle reads them in _extras as before', () => {
        const l = large.read(bytes).presentation;
        const p = l.slides[0].shapes[0].txBody.paragraphs[0];
        expect(p._extras.map((c) => c.name)).toEqual(['a:endParaRPr']);
        expect(p.runs[0].rPr._extras.map((c) => c.name)).toContain('a:ea');
        expect(l.theme.fontScheme.majorFont._extras.length).toBe(2);
    });
    test('the save-back writes the slide and the theme as read', () => {
        const again = opc.read(full.write(read)).parts;
        const first = opc.read(bytes).parts;
        for (const part of ['/ppt/slides/slide1.xml', '/ppt/theme/theme1.xml']) {
            expect(props.sameElement(xml.parse(dec.decode(again[part])), xml.parse(dec.decode(first[part])))).toBe(true);
        }
    });
});

describe('a field\'s paragraph properties (T62 b)', () => {
    test('typed as a paragraph\'s through pptxFullBundle', () => {
        const fld = { type: 'field', id: '{F}', fieldType: 'slidenum', value: '1', pPr: { _extras: [el('a:spcBef', {}, [el('a:spcPts', { val: '600' })])] } };
        const deck = { slides: [{ shapes: [{ type: 'shape', id: 2, name: 'F', txBody: { paragraphs: [{ runs: [fld] }] } }] }] };
        const r = full.read(full.write(deck)).presentation.slides[0].shapes[0].txBody.paragraphs[0].runs[0];
        expect(r.pPr.spcBef).toEqual({ pts: 600 });
        expect(r.pPr._extras).toBeUndefined();
    });
});

describe('the pptx walker\'s reach', () => {
    test('table cells, paragraphs and the theme are visited', () => {
        const log = [];
        const w = createWalker();
        w.use({
            hydrateParagraph(p) { log.push('p'); return p; },
            hydrateParagraphProperties(p) { log.push('pPr'); return p; },
            hydrateRunProperties(r) { log.push('rPr'); return r; },
            hydrateTheme(t) { log.push('theme'); return t; }
        });
        w.applyHydrate(structuredClone(pres));
        expect(log.filter((x) => x === 'p').length).toBe(2);
        expect(log.filter((x) => x === 'rPr').length).toBe(2);
        expect(log.filter((x) => x === 'pPr').length).toBe(2);
        expect(log.filter((x) => x === 'theme').length).toBe(1);
    });
});
