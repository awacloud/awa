// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';

const xml = ooxmlXml.factory();
const props = docxProperties.factory(xml);

describe('docxProperties — toggles', () => {
    test('absent attribute reads as true (toggle on)', () => {
        const node = xml.parse('<w:b xmlns:w="x"/>');
        expect(props.readToggle(node)).toBe(true);
    });
    test('w:val=0 reads as false', () => {
        const node = xml.parse('<w:b xmlns:w="x" w:val="0"/>');
        expect(props.readToggle(node)).toBe(false);
    });
    test('w:val=false reads as false', () => {
        const node = xml.parse('<w:b xmlns:w="x" w:val="false"/>');
        expect(props.readToggle(node)).toBe(false);
    });
});

describe('docxProperties — rPr', () => {
    test('roundtrip preserves all known fields', () => {
        const rPr = {
            bold: true, italic: true, strike: true,
            underline: 'double', color: '00FF00',
            size: 24, font: 'Times', vertAlign: 'subscript',
            highlight: 'yellow', rStyle: 'Strong'
        };
        const el = props.renderRunProperties(rPr);
        expect(el.name).toBe('w:rPr');
        const parsed = props.parseRunProperties(el);
        expect(parsed).toEqual(rPr);
    });

    test('returns undefined for null input', () => {
        expect(props.parseRunProperties(null)).toBeUndefined();
        expect(props.renderRunProperties(null)).toBeNull();
    });

    test('preserves unknown children in _extras', () => {
        const xmlText = '<w:rPr xmlns:w="x"><w:b/><w:lang w:val="fr"/></w:rPr>';
        const el = xml.parse(xmlText);
        const r = props.parseRunProperties(el);
        expect(r.bold).toBe(true);
        expect(r._extras).toHaveLength(1);
        expect(r._extras[0].name).toBe('w:lang');
    });
});

describe('docxProperties — pPr', () => {
    test('roundtrip alignment + indent + spacing', () => {
        const pPr = {
            align: 'center',
            indent: { left: 720, right: 360, firstLine: 180 },
            spacing: { before: 100, after: 200, line: 360 },
            pStyle: 'Heading1'
        };
        const el = props.renderParagraphProperties(pPr);
        const back = props.parseParagraphProperties(el);
        expect(back).toEqual(pPr);
    });

    test('numPr', () => {
        const pPr = { numPr: { ilvl: 2, numId: 5 } };
        const el = props.renderParagraphProperties(pPr);
        const back = props.parseParagraphProperties(el);
        expect(back).toEqual(pPr);
    });

    test('nested rPr inside pPr', () => {
        const pPr = { rPr: { bold: true, color: 'FF0000' } };
        const el = props.renderParagraphProperties(pPr);
        const back = props.parseParagraphProperties(el);
        expect(back).toEqual(pPr);
    });
});

describe('docxProperties — tblPr (BL-1766)', () => {
    const edge = { val: 'single', sz: 4, space: 0, color: 'auto' };
    const grid = () => ({
        top: { ...edge }, left: { ...edge }, bottom: { ...edge },
        right: { ...edge }, insideH: { ...edge }, insideV: { ...edge }
    });

    test('exposes parseTableProperties and renderTableProperties', () => {
        expect(typeof props.parseTableProperties).toBe('function');
        expect(typeof props.renderTableProperties).toBe('function');
    });

    test('render: style + six-edge borders serialise in schema order', () => {
        const el = props.renderTableProperties({ style: 'TableGrid', borders: grid() });
        expect(el.name).toBe('w:tblPr');
        expect(el.children.map(c => c.name)).toEqual(['w:tblStyle', 'w:tblBorders']);
        const b = el.children[1];
        expect(b.children.map(c => c.name)).toEqual(
            ['w:top', 'w:left', 'w:bottom', 'w:right', 'w:insideH', 'w:insideV']);
        expect(xml.serializeNode(el)).toBe(
            '<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '</w:tblBorders></w:tblPr>');
    });

    test('render: edge order follows the schema whatever the key order of the input', () => {
        const el = props.renderTableProperties({
            borders: { insideV: { val: 'single' }, top: { val: 'single' }, right: { val: 'nil' } }
        });
        expect(el.children[0].children.map(c => c.name))
            .toEqual(['w:top', 'w:right', 'w:insideV']);
    });

    test('render: a Border with only val renders only w:val (no undefined attribute)', () => {
        const el = props.renderTableProperties({ borders: { top: { val: 'nil' } } });
        const top = el.children[0].children[0];
        expect(top.attrs).toEqual({ 'w:val': 'nil' });
        expect(Object.keys(top.attrs)).toEqual(['w:val']);
        expect(xml.serializeNode(el)).not.toContain('undefined');
    });

    test('render: width emits w:tblW between style and borders', () => {
        const el = props.renderTableProperties({
            borders: { top: { val: 'single' } },
            width: { w: 5000, type: 'pct' },
            style: 'X'
        });
        expect(el.children.map(c => c.name)).toEqual(['w:tblStyle', 'w:tblW', 'w:tblBorders']);
        expect(el.children[1].attrs).toEqual({ 'w:w': '5000', 'w:type': 'pct' });
    });

    test('render: width without type defaults to auto', () => {
        const el = props.renderTableProperties({ width: { w: 0 } });
        expect(el.children[0].attrs).toEqual({ 'w:w': '0', 'w:type': 'auto' });
    });

    test('render: falsy / empty / childless input yields null', () => {
        expect(props.renderTableProperties(undefined)).toBeNull();
        expect(props.renderTableProperties(null)).toBeNull();
        expect(props.renderTableProperties({})).toBeNull();
        expect(props.renderTableProperties({ borders: {} })).toBeNull();
    });

    test('parse: typed fields, unknown border child and unknown tblPr child go to _extras', () => {
        const el = xml.parse(
            '<w:tblPr xmlns:w="x">'
            + '<w:tblStyle w:val="TableGrid"/>'
            + '<w:tblW w:w="5000" w:type="pct"/>'
            + '<w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="dotted"/>'
            + '<w:shd w:val="clear"/>'
            + '</w:tblBorders>'
            + '<w:tblLook w:val="04A0"/>'
            + '</w:tblPr>');
        const t = props.parseTableProperties(el);
        expect(t.style).toBe('TableGrid');
        expect(t.width).toEqual({ w: 5000, type: 'pct' });
        expect(t.borders.top).toEqual({ val: 'single', sz: 4, space: 0, color: 'auto' });
        expect(t.borders.insideH).toEqual({ val: 'dotted' });
        expect(t.borders._extras).toHaveLength(1);
        expect(t.borders._extras[0].name).toBe('w:shd');
        expect(t._extras).toHaveLength(1);
        expect(t._extras[0].name).toBe('w:tblLook');
    });

    test('parse: non-numeric width stays a string; missing type defaults to auto', () => {
        const t = props.parseTableProperties(xml.parse(
            '<w:tblPr xmlns:w="x"><w:tblW w:w="50%"/></w:tblPr>'));
        expect(t.width).toEqual({ w: '50%', type: 'auto' });
    });

    test('parse: an element without element children returns undefined', () => {
        expect(props.parseTableProperties(xml.parse('<w:tblPr xmlns:w="x"/>'))).toBeUndefined();
        expect(props.parseTableProperties(undefined)).toBeUndefined();
    });

    test('render after parse keeps all four groups, extras after their typed siblings', () => {
        const el = xml.parse(
            '<w:tblPr xmlns:w="x">'
            + '<w:tblStyle w:val="TableGrid"/>'
            + '<w:tblW w:w="5000" w:type="pct"/>'
            + '<w:tblBorders><w:top w:val="single"/><w:shd w:val="clear"/></w:tblBorders>'
            + '<w:tblLook w:val="04A0"/>'
            + '</w:tblPr>');
        const out = props.renderTableProperties(props.parseTableProperties(el));
        expect(out.children.map(c => c.name))
            .toEqual(['w:tblStyle', 'w:tblW', 'w:tblBorders', 'w:tblLook']);
        expect(out.children[2].children.map(c => c.name)).toEqual(['w:top', 'w:shd']);
    });

    test('parse then render is a fixed point on the typed model', () => {
        const model = { style: 'TableGrid', width: { w: 9000, type: 'dxa' }, borders: grid() };
        const back = props.parseTableProperties(props.renderTableProperties(model));
        expect(back).toEqual(model);
    });

    test('extraAttrs: unmodelled border attributes are parsed in source order and omitted when absent', () => {
        const el = xml.parse(
            '<w:tblPr xmlns:w="x"><w:tblBorders>'
            + '<w:top w:val="single" w:themeShade="BF" w:color="auto" w:themeColor="accent1"/>'
            + '<w:left w:val="nil"/></w:tblBorders></w:tblPr>');
        const t = props.parseTableProperties(el);
        expect(t.borders.top.extraAttrs).toEqual({ 'w:themeShade': 'BF', 'w:themeColor': 'accent1' });
        expect(Object.keys(t.borders.top.extraAttrs)).toEqual(['w:themeShade', 'w:themeColor']);
        expect('extraAttrs' in t.borders.left).toBe(false);
    });

    test('extraAttrs: rendered verbatim after w:color, never overriding a modelled attribute, undefined skipped', () => {
        const el = props.renderTableProperties({ borders: { top: {
            val: 'single', color: 'auto',
            extraAttrs: { 'w:themeColor': 'accent1', 'w:frame': '1', 'w:val': 'IGNORED', 'w:shadow': undefined }
        } } });
        const top = el.children[0].children[0];
        expect(Object.keys(top.attrs)).toEqual(['w:val', 'w:color', 'w:themeColor', 'w:frame']);
        expect(top.attrs['w:val']).toBe('single');
    });

    test('extraAttrs: parse then render is a fixed point', () => {
        const src = '<w:tblPr xmlns:w="x"><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto" w:themeColor="accent1" w:shadow="1"/></w:tblBorders></w:tblPr>';
        const t = props.parseTableProperties(xml.parse(src));
        expect(props.parseTableProperties(props.renderTableProperties(t))).toEqual(t);
    });
});

describe('docxProperties — tblPr cellMargins (office/BATCH_48 follow-up)', () => {
    const dxa = (w) => ({ w, type: 'dxa' });

    test('render: cellMargins serialise as <w:tblCellMar> after tblBorders, edges in schema order', () => {
        const el = props.renderTableProperties({
            style: 'TableGrid',
            borders: { top: { val: 'single' } },
            cellMargins: { right: dxa(108), left: dxa(108), bottom: dxa(0), top: dxa(0) }
        });
        expect(el.children.map(c => c.name)).toEqual(['w:tblStyle', 'w:tblBorders', 'w:tblCellMar']);
        expect(xml.serializeNode(el.children[2])).toBe(
            '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>'
            + '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>');
    });

    test('render: start/end edges keep the strict schema order top, start, bottom, end', () => {
        const el = props.renderTableProperties({ cellMargins: { end: dxa(5), start: dxa(4), top: dxa(3) } });
        expect(el.children[0].children.map(c => c.name)).toEqual(['w:top', 'w:start', 'w:end']);
    });

    test('render: an empty cellMargins bag renders nothing', () => {
        expect(props.renderTableProperties({ cellMargins: {} })).toBeNull();
    });

    test('parse: <w:tblCellMar> is typed (numeric w), unknown margin child goes to cellMargins._extras', () => {
        const t = props.parseTableProperties(xml.parse(
            '<w:tblPr xmlns:w="x"><w:tblCellMar>'
            + '<w:left w:w="108" w:type="dxa"/><w:right w:w="10%"/><w:foo/>'
            + '</w:tblCellMar></w:tblPr>'));
        expect(t.cellMargins.left).toEqual({ w: 108, type: 'dxa' });
        expect(t.cellMargins.right).toEqual({ w: '10%', type: 'auto' });
        expect(t.cellMargins._extras.map(c => c.name)).toEqual(['w:foo']);
        expect(t._extras).toBeUndefined();
    });

    test('render after parse keeps schema order: tblLayout before tblCellMar, tblLook after', () => {
        const src = '<w:tblPr xmlns:w="x"><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
            + '<w:tblBorders><w:top w:val="single"/></w:tblBorders>'
            + '<w:tblLayout w:type="fixed"/>'
            + '<w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>'
            + '<w:tblLook w:val="04A0"/></w:tblPr>';
        const out = props.renderTableProperties(props.parseTableProperties(xml.parse(src)));
        expect(out.children.map(c => c.name)).toEqual(
            ['w:tblStyle', 'w:tblW', 'w:tblBorders', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook']);
    });

    test('parse then render is a fixed point on the typed model', () => {
        const model = { style: 'TableGrid', cellMargins: { left: dxa(108), right: dxa(108) } };
        expect(props.parseTableProperties(props.renderTableProperties(model))).toEqual(model);
    });
});
