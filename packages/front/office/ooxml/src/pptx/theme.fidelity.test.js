// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — a theme part is written back as read (T62 (d)): a font's other
 * attributes, a scheme's empty name, the root's other children and the
 * absence of `a:objectDefaults` / `a:extraClrSchemeLst`.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const theme = rt.resolve('pptxTheme');
const props = rt.resolve('docxProperties');

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const CLR = (name) => `<a:clrScheme name="${name}"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme>`;
const FONT = (latin, name = 'Office') => `<a:fontScheme name="${name}"><a:majorFont>${latin}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="X"/></a:majorFont>`
    + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>';
const FMT = '<a:fmtScheme name="Office"><a:fillStyleLst/></a:fmtScheme>';
const themeXml = ({ clr = CLR('Office'), font = FONT('<a:latin typeface="Calibri Light"/>'), tail = '<a:objectDefaults/><a:extraClrSchemeLst/>' } = {}) =>
    `<a:theme ${A} name="T"><a:themeElements>${clr}${font}${FMT}</a:themeElements>${tail}</a:theme>`;
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const backOf = (text) => {
    const model = theme.parse(text);
    return [props.sameElement(noNs(xml.parse(theme.serialize(model))), noNs(xml.parse(text))), model];
};
const EXT = '<a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><x/></a:ext></a:extLst>';

describe('pptx theme — written back as read (T62 d)', () => {
    test('a font\'s attributes beyond typeface are kept in fontAttrs', () => {
        const [ok, model] = backOf(themeXml({ font: FONT('<a:latin typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/>') }));
        expect(model.fontScheme.majorFont.latin).toBe('Arial');
        expect(model.fontScheme.majorFont.fontAttrs).toEqual({ latin: { panose: '020B0604020202020204', pitchFamily: '34', charset: '0' } });
        expect(model.fontScheme.minorFont.fontAttrs).toBeUndefined();
        expect(ok).toBe(true);
    });

    test('a colour or font scheme named "" keeps its empty name; a model without one is still "Office"', () => {
        const [ok, model] = backOf(themeXml({ clr: CLR(''), font: FONT('<a:latin typeface="Calibri"/>', '') }));
        expect(model.clrScheme.name).toBe('');
        expect(ok).toBe(true);
        const built = xml.parse(theme.serialize({ clrScheme: { colors: { dk1: { srgb: '000000' } } }, fontScheme: { majorFont: {}, minorFont: {} } }));
        const els = xml.findChild(built, 'a:themeElements');
        expect(xml.findChild(els, 'a:clrScheme').attrs.name).toBe('Office');
        expect(xml.findChild(els, 'a:fontScheme').attrs.name).toBe('Office');
    });

    test('the root\'s a:custClrLst and a:extLst are kept in _extras, in the schema\'s order', () => {
        const tail = `<a:objectDefaults/><a:extraClrSchemeLst/><a:custClrLst><a:custClr name="c"><a:srgbClr val="112233"/></a:custClr></a:custClrLst>${EXT}`;
        const [ok, model] = backOf(themeXml({ tail }));
        expect((model._extras || []).map(e => e.name)).toEqual(['a:custClrLst', 'a:extLst']);
        expect(ok).toBe(true);
    });

    test('a theme without objectDefaults or extraClrSchemeLst is written without them', () => {
        const [ok, model] = backOf(themeXml({ tail: EXT }));
        expect(model.objectDefaults).toBeNull();
        expect(model.extraClrSchemeLst).toBeNull();
        expect(ok).toBe(true);
    });

    test('a model built without those fields still gets empty ones (unchanged)', () => {
        const root = xml.parse(theme.serialize({ name: 'B', clrScheme: { name: 'C', colors: {} } }));
        expect(root.children.filter(c => c.type === 'element').map(c => c.name)).toEqual(['a:themeElements', 'a:objectDefaults', 'a:extraClrSchemeLst']);
    });

    test('a theme the core wrote itself is written back as read', () => {
        const text = theme.serialize(theme.defaults());
        expect(backOf(text)[0]).toBe(true);
    });
});
