// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — `<w:rFonts>` keeps every attribute through the new optional
 * `rPr.fonts` field (`CT_Fonts`: hint, ascii, hAnsi, eastAsia, cs and the
 * four theme attributes), while `rPr.font` keeps its 1.0.0 meaning.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const props = rt.resolve('docxProperties');
const d = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const numberingMod = rt.resolve('docxNumbering');
const stylesMod = rt.resolve('docxStyles');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const rPrOf = (inner) => props.parseRunProperties(xml.parse(`<w:rPr ${W}>${inner}</w:rPr>`));
const FULL = '<w:rFonts w:hint="eastAsia" w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="MS Mincho" w:cs="Arial"'
    + ' w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi"/>';
/** The attributes of the written `w:rFonts`, or null when there is none. */
function writtenFonts(rPr) {
    const el = props.renderRunProperties(rPr);
    const f = el && el.children.find(c => c.name === 'w:rFonts');
    return f ? f.attrs : null;
}

describe('docx run fonts — read', () => {
    test('every w:rFonts attribute reaches fonts; font is read as before', () => {
        const rPr = rPrOf(FULL);
        expect(rPr.font).toBe('Calibri');
        expect(rPr.fonts).toEqual({
            hint: 'eastAsia', ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'MS Mincho', cs: 'Arial',
            asciiTheme: 'minorHAnsi', hAnsiTheme: 'minorHAnsi', eastAsiaTheme: 'minorEastAsia', cstheme: 'minorBidi'
        });
    });

    test('a hint-only w:rFonts gives fonts and no font', () => {
        const rPr = rPrOf('<w:rFonts w:hint="eastAsia"/>');
        expect(rPr.font).toBeUndefined();
        expect(rPr.fonts).toEqual({ hint: 'eastAsia' });
    });

    test('no w:rFonts, no fonts', () => {
        expect(rPrOf('<w:b/>').fonts).toBeUndefined();
    });
});

describe('docx run fonts — write', () => {
    test('a read model is written back attribute for attribute', () => {
        expect(writtenFonts(rPrOf(FULL))).toEqual({
            'w:hint': 'eastAsia', 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:eastAsia': 'MS Mincho', 'w:cs': 'Arial',
            'w:asciiTheme': 'minorHAnsi', 'w:hAnsiTheme': 'minorHAnsi', 'w:eastAsiaTheme': 'minorEastAsia', 'w:cstheme': 'minorBidi'
        });
        expect(writtenFonts(rPrOf('<w:rFonts w:ascii="Calibri"/>'))).toEqual({ 'w:ascii': 'Calibri' });
        // No ascii: font comes from hAnsi, and an untouched read writes it back as it was.
        const hAnsiOnly = rPrOf('<w:rFonts w:hAnsi="Calibri" w:eastAsia="SimSun"/>');
        expect(hAnsiOnly.font).toBe('Calibri');
        expect(writtenFonts(hAnsiOnly)).toEqual({ 'w:hAnsi': 'Calibri', 'w:eastAsia': 'SimSun' });
    });

    test('a hint-only w:rFonts survives, and keeps its w:rPr alive', () => {
        expect(writtenFonts(rPrOf('<w:rFonts w:hint="eastAsia"/>'))).toEqual({ 'w:hint': 'eastAsia' });
    });

    test('an edited font replaces the three explicit slots and drops their theme attributes', () => {
        const rPr = rPrOf(FULL);
        rPr.font = 'Consolas';
        expect(writtenFonts(rPr)).toEqual({
            'w:hint': 'eastAsia', 'w:ascii': 'Consolas', 'w:hAnsi': 'Consolas', 'w:eastAsia': 'MS Mincho', 'w:cs': 'Consolas',
            'w:eastAsiaTheme': 'minorEastAsia'
        });
    });

    test('a removed font removes the three explicit slots and their themes, keeps the rest', () => {
        const rPr = rPrOf(FULL);
        delete rPr.font;
        expect(writtenFonts(rPr)).toEqual({ 'w:hint': 'eastAsia', 'w:eastAsia': 'MS Mincho', 'w:eastAsiaTheme': 'minorEastAsia' });
        const only = rPrOf('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>');
        delete only.font;
        expect(props.renderRunProperties(only)).toBeNull();
    });

    test('a theme-only w:rFonts (no explicit name, so no font) is written as read', () => {
        const rPr = rPrOf('<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>');
        expect(rPr.font).toBeUndefined();
        expect(writtenFonts(rPr)).toEqual({ 'w:asciiTheme': 'minorHAnsi', 'w:hAnsiTheme': 'minorHAnsi' });
    });

    test('without fonts the output is the 1.0.0 one', () => {
        expect(writtenFonts({ font: 'Arial' })).toEqual({ 'w:ascii': 'Arial', 'w:hAnsi': 'Arial', 'w:cs': 'Arial' });
        expect(writtenFonts({ bold: true })).toBeNull();
    });
});

describe('docx run fonts — round trip of runs, styles, docDefaults and numbering levels', () => {
    function hostPackage() {
        const pkg = opc.empty();
        const run = (rFonts) => `<w:r><w:rPr>${rFonts}</w:rPr><w:t>x</w:t></w:r>`;
        opc.setPart(pkg, '/word/document.xml', encoder.encode(`<w:document ${W}><w:body><w:p>${run(FULL)}${run('<w:rFonts w:hint="eastAsia"/>')}</w:p></w:body></w:document>`), d.CT_DOCUMENT);
        opc.setPart(pkg, '/word/styles.xml', encoder.encode(`<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${FULL}</w:rPr></w:rPrDefault></w:docDefaults>`
            + `<w:style w:type="character" w:styleId="C"><w:name w:val="c"/><w:rPr><w:rFonts w:eastAsia="SimSun" w:hint="eastAsia"/></w:rPr></w:style></w:styles>`), stylesMod.CT_STYLES);
        opc.setPart(pkg, '/word/numbering.xml', encoder.encode(`<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/>`
            + `<w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`), numberingMod.CT_NUMBERING);
        opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
        opc.setRels(pkg, '/word/document.xml', [
            { Id: 'rId2', Type: stylesMod.REL_TYPE_STYLES, Target: 'styles.xml' },
            { Id: 'rId3', Type: numberingMod.REL_TYPE_NUMBERING, Target: 'numbering.xml' }
        ]);
        return opc.write(pkg);
    }
    const write = (r) => d.write(r.document, { styles: r.styles, numbering: r.numbering });
    const part = (bytes, name) => decoder.decode(opc.read(bytes).parts[name]);

    test('every attribute survives read → write → read, the hint-only level rPr included', () => {
        const first = d.read(hostPackage());
        const back = d.read(write(first));
        const runs = back.document.body[0].children;
        expect(runs[0].rPr.fonts).toEqual(first.document.body[0].children[0].rPr.fonts);
        expect(runs[1].rPr.fonts).toEqual({ hint: 'eastAsia' });
        expect(back.styles.docDefaults.rPr.fonts.eastAsiaTheme).toBe('minorEastAsia');
        expect(back.styles.styles.find(s => s.styleId === 'C').rPr.fonts).toEqual({ eastAsia: 'SimSun', hint: 'eastAsia' });
        expect(part(write(first), '/word/numbering.xml')).toContain('<w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr>');
    });

    test('a second write gives the same bytes', () => {
        const once = write(d.read(hostPackage()));
        const twice = write(d.read(once));
        for (const name of ['/word/document.xml', '/word/styles.xml', '/word/numbering.xml']) {
            expect(part(twice, name)).toBe(part(once, name));
        }
    });
});
