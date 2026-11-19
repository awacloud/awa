// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — a line's colour typed with the `typedLineColors` read option
 * (T23, BL-2881), in the `typedRunColors` pattern; the default unchanged.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const shape = rt.resolve('drawingmlShape');
const props = rt.resolve('docxProperties');
const opc = rt.resolve('opcPackage');
const pptx = rt.resolve('pptx');
const xlsx = rt.resolve('xlsx');
const drawings = rt.resolve('xlsxDrawings');
const dec = new TextDecoder();

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const spPr = (fill) => xml.parse(`<p:spPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ${A}>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill>${fill}</a:solidFill></a:ln></p:spPr>`);
const SCHEME = '<a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr>';
const SRGB_ALPHA = '<a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr>';
const lineOf = (fill, opts) => shape.parseShapeProperties(spPr(fill), opts).line;
const lnOut = (line) => shape.renderShapeProperties({ geom: 'rect', line }, 'p:spPr').children.find(c => c.name === 'a:ln');

describe('a line colour — the default (unchanged)', () => {
    test('a scheme colour stays verbatim; an srgbClr reads as its RRGGBB', () => {
        const l = lineOf(SCHEME);
        expect(l.color).toBeUndefined();
        expect(l._extras.map(e => e.name)).toEqual(['a:solidFill']);
        expect(lineOf(SRGB_ALPHA).color).toBe('FF0000');
    });
});

describe('a line colour — typedLineColors', () => {
    const o = { typedLineColors: true };
    test('a scheme colour with its transforms', () => {
        const l = lineOf(SCHEME, o);
        expect(l.color).toEqual({ schemeColor: 'tx1', mods: [{ name: 'lumMod', val: 75000 }, { name: 'lumOff', val: 25000 }] });
        expect(l._extras).toBeUndefined();
    });
    test('an srgbClr keeps its transforms; a bare one is its RRGGBB', () => {
        expect(lineOf(SRGB_ALPHA, o).color).toEqual({ rgb: 'FF0000', mods: [{ name: 'alpha', val: 50000 }] });
        expect(lineOf('<a:srgbClr val="00FF00"/>', o).color).toBe('00FF00');
    });
    test('a colour the codec does not type stays verbatim', () => {
        const l = lineOf('<a:prstClr val="black"/>', o);
        expect(l.color).toBeUndefined();
        expect(l._extras.map(e => e.name)).toEqual(['a:solidFill']);
    });
    test('a typed colour is written back as read', () => {
        for (const fill of [SCHEME, SRGB_ALPHA]) {
            const src = spPr(fill).children.find(c => c.name === 'a:ln');
            expect(props.sameElement(lnOut(lineOf(fill, o)), src)).toBe(true);
        }
    });
});

describe('typedLineColors through pptx.read and xlsx.read', () => {
    test('pptx', () => {
        const node = spPr(SCHEME);
        const bytes = pptx.write({ slides: [{ shapes: [{ type: 'shape', id: 2, name: 'Box', spPr: node }] }] });
        expect(pptx.read(bytes).presentation.slides[0].shapes[0].shapeProps.line.color).toBeUndefined();
        const typed = pptx.read(bytes, { typedLineColors: true }).presentation.slides[0].shapes[0].shapeProps.line.color;
        expect(typed.schemeColor).toBe('tx1');
    });
    test('xlsx', () => {
        const bytes = xlsx.write({ sheets: [{ name: 'S', rows: [['x']], drawings: [{
            anchor: drawings.oneCell({ col: 1, row: 1 }, { cx: 100, cy: 100 }), name: 'Box',
            shapeProps: { geom: 'rect', cx: 100, cy: 100, offsetX: 0, offsetY: 0, line: { color: { schemeColor: 'accent1', mods: [{ name: 'shade', val: 50000 }] } } }
        }] }] });
        const ln = dec.decode(opc.read(bytes).parts['/xl/drawings/drawing1.xml']);
        expect(ln).toContain('<a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr>');
        const d = xlsx.read(bytes, { typedLineColors: true }).workbook.sheets[0].drawings[0];
        expect(d.shapeProps.line.color).toEqual({ schemeColor: 'accent1', mods: [{ name: 'shade', val: 50000 }] });
        expect(xlsx.read(bytes).workbook.sheets[0].drawings[0].shapeProps.line.color).toBeUndefined();
    });
});
