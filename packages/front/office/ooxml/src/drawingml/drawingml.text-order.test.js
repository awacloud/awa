// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — DrawingML text properties are written in schema order:
 * `a:pPr` in `CT_TextParagraphProperties` order and `a:rPr` / `a:defRPr`
 * in `CT_TextCharacterProperties` order (ECMA-376 Part 1 § 21.1.2), the
 * typed children among the preserved ones.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';
import { drawingml } from './drawingml.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const dml = rt.resolve('drawingml');
const p = rt.resolve('pptx');
const opc = rt.resolve('opcPackage');
const decoder = new TextDecoder();

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const parse = (text) => xml.parse(text.replace(/^<a:(\w+)/, `<a:$1 ${NS}`));
const names = (el) => el.children.filter(c => c.type === 'element').map(c => c.name);

// Children in an order the schema forbids (typed ones as the reader
// leaves them: the renderer used to put them first).
const P_PR = '<a:pPr lvl="6" marL="3024000" indent="-216000"><a:defRPr sz="1800"/><a:buChar char="x"/>'
    + '<a:tabLst/><a:buFont typeface="Wingdings"/><a:buSzPct val="45000"/><a:buClr><a:srgbClr val="000000"/></a:buClr>'
    + '<a:spcAft><a:spcPts val="0"/></a:spcAft><a:spcBef><a:spcPts val="283"/></a:spcBef><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>';
const P_PR_ORDER = ['a:lnSpc', 'a:spcBef', 'a:spcAft', 'a:buClr', 'a:buSzPct', 'a:buFont', 'a:buChar', 'a:tabLst', 'a:defRPr'];

const R_PR = '<a:rPr lang="es-ES" sz="1800"><a:hlinkClick r:id="" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>'
    + '<a:latin typeface="Arial"/><a:cs typeface="Arial"/><a:ea typeface="Arial"/><a:uFillTx/><a:uLnTx/><a:highlight><a:srgbClr val="FFFF00"/></a:highlight>'
    + '<a:effectLst/><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:ln w="1"/></a:rPr>';
const R_PR_ORDER = ['a:ln', 'a:solidFill', 'a:effectLst', 'a:highlight', 'a:uLnTx', 'a:uFillTx', 'a:latin', 'a:ea', 'a:cs', 'a:hlinkClick'];

describe('drawingml — a:pPr children in CT_TextParagraphProperties order', () => {
    test('typed bullet and defRPr take their places among the preserved children', () => {
        const pPr = dml.parseParagraphProperties(parse(P_PR));
        expect(names(dml.renderParagraphProperties(pPr))).toEqual(P_PR_ORDER);
    });

    test('a child the schema does not list goes last, in the order given', () => {
        const pPr = dml.parseParagraphProperties(parse(P_PR.replace('<a:tabLst/>', '<a:zz1/><a:tabLst/><a:zz0/>')));
        expect(names(dml.renderParagraphProperties(pPr))).toEqual([...P_PR_ORDER, 'a:zz1', 'a:zz0']);
    });

    test('an mc:AlternateContent takes the place of what it holds', () => {
        const alt = xml.el('mc:AlternateContent', {}, [xml.el('mc:Choice', { Requires: 'a14' }, [xml.el('a:spcBef', {})]), xml.el('mc:Fallback', {}, [xml.el('a:spcBef', {})])]);
        const pPr = { bullet: 'none', _extras: [xml.el('a:tabLst', {}), alt, xml.el('a:lnSpc', {})] };
        expect(names(dml.renderParagraphProperties(pPr))).toEqual(['a:lnSpc', 'mc:AlternateContent', 'a:buNone', 'a:tabLst']);
    });
});

describe('drawingml — a:rPr children in CT_TextCharacterProperties order', () => {
    test('typed fill and latin take their places among the preserved children', () => {
        const rPr = dml.parseRunProperties(parse(R_PR));
        expect(rPr.color).toBe('000000');
        expect(rPr.font).toBe('Arial');
        expect(names(dml.renderRunProperties(rPr))).toEqual(R_PR_ORDER);
    });

    test('a:defRPr is ordered the same way', () => {
        const pPr = dml.parseParagraphProperties(parse(`<a:pPr>${R_PR.replace(/a:rPr/g, 'a:defRPr')}</a:pPr>`));
        const defRPr = dml.renderParagraphProperties(pPr).children.find(c => c.name === 'a:defRPr');
        expect(names(defRPr)).toEqual(R_PR_ORDER);
    });

    test('properties with only typed children keep their bytes', () => {
        const el = dml.renderRunProperties({ lang: 'en-US', size: 1200, color: 'FF0000', font: 'Calibri' });
        expect(names(el)).toEqual(['a:solidFill', 'a:latin']);
        expect(names(dml.renderParagraphProperties({ level: 1, bullet: { char: '•' } }))).toEqual(['a:buChar']);
    });
});

describe('drawingml — a pptx round trip writes the text properties in order', () => {
    test('slide text: read → write orders, a second write is stable', () => {
        const pPr = dml.parseParagraphProperties(parse(P_PR));
        const rPr = dml.parseRunProperties(parse(R_PR));
        const bytes = p.write({ slides: [{ shapes: [{
            type: 'shape', id: 2, name: 'Body', placeholder: { type: 'body', idx: 1 },
            txBody: { paragraphs: [{ pPr, runs: [{ type: 'text', value: 'Seventh', rPr }] }] }
        }] }] });
        const slideXml = (b) => decoder.decode(opc.read(b).parts['/ppt/slides/slide1.xml']);
        const first = xml.parse(slideXml(bytes));
        const find = (node, name) => {
            if (node.name === name) return node;
            for (const c of node.children || []) if (c.type === 'element') { const h = find(c, name); if (h) return h; }
            return null;
        };
        expect(names(find(first, 'a:pPr'))).toEqual(P_PR_ORDER);
        expect(names(find(first, 'a:rPr'))).toEqual(R_PR_ORDER);
        const again = p.write(p.read(bytes).presentation);
        expect(slideXml(again)).toBe(slideXml(bytes));
    });
});

describe('drawingml — hand-wired without the ordering helper', () => {
    test('keeps the old order (typed children first)', () => {
        const { orderBySequence: _o, sequence: _s, ...older } = rt.resolve('ooxmlShared');
        const mod = drawingml.factory(xml, rt.resolve('ooxmlMath'), older);
        const pPr = mod.parseParagraphProperties(parse(P_PR));
        expect(names(mod.renderParagraphProperties(pPr))).toEqual(['a:buChar', 'a:defRPr', 'a:tabLst', 'a:buFont', 'a:buSzPct', 'a:buClr', 'a:spcAft', 'a:spcBef', 'a:lnSpc']);
        const rPr = mod.parseRunProperties(parse(R_PR));
        expect(names(mod.renderRunProperties(rPr))).toEqual(['a:solidFill', 'a:latin', 'a:hlinkClick', 'a:cs', 'a:ea', 'a:uFillTx', 'a:uLnTx', 'a:highlight', 'a:effectLst', 'a:ln']);
    });
});
