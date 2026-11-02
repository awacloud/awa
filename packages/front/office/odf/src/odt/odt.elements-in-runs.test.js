// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `odt.read(bytes, { elementsInRuns: true })` keeps every untyped element
 * of a paragraph, heading or link body — a comment and its end, bookmarks,
 * fields, a soft page break, a frame when `framesInRuns` does not type it —
 * at its place, as a raw `element` run (the node read, as a span body keeps
 * it). Without the option the model is the 1.1.0 one: they sit in
 * `_extras.children`, written back after the runs. Derived views (`textOf`
 * through `odt.toText`) are equal in both modes.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odfMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...odfMods.fw_require, ...odfMods.modules]) runtime.register(m);
const odt = runtime.resolve('odt');
const pkg = runtime.resolve('pkgPackage');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
    + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
    + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
const NOTE = '<office:annotation office:name="c1"><text:p>A remark</text:p></office:annotation>';
const NOTE_END = '<office:annotation-end office:name="c1"/>';
const BOX = '<draw:frame draw:name="F1" text:anchor-type="as-char"><draw:text-box><text:p>Boxed</text:p></draw:text-box></draw:frame>';

/** An .odt whose content.xml body is `bodyXml`. */
function odtWith(bodyXml) {
    const p = pkg.read(odt.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3"><office:body><office:text>`
        + `${bodyXml}</office:text></office:body></office:document-content>`);
    return pkg.write(p);
}
const kinds = (runs) => runs.map((r) => (r.type === 'element' ? r.name : r.type === 'text' ? `"${r.value}"` : r.type));
const ON = { elementsInRuns: true };

describe('elementsInRuns — default read keeps the 1.1.0 model', () => {
    test('the comment stays in _extras.children; the runs hold the text only', () => {
        const p = odt.read(odtWith(`<text:p>Aaa ${NOTE}comment${NOTE_END} ccc.</text:p>`)).body[0];
        expect(kinds(p.runs)).toEqual(['"Aaa "', '"comment"', '" ccc."']);
        expect(p._extras.children.map((c) => c.name)).toEqual(['office:annotation', 'office:annotation-end']);
    });

    test('elementsInRuns: false is the default', () => {
        const bytes = odtWith(`<text:p>a<text:bookmark text:name="b"/>b</text:p>`);
        expect(odt.read(bytes, { elementsInRuns: false })).toEqual(odt.read(bytes));
    });
});

describe('elementsInRuns — read', () => {
    test('a comment and its end sit where they were; nothing is left in _extras', () => {
        const p = odt.read(odtWith(`<text:p>Aaa ${NOTE}comment${NOTE_END} ccc.</text:p>`), ON).body[0];
        expect(kinds(p.runs)).toEqual(['"Aaa "', 'office:annotation', '"comment"', 'office:annotation-end', '" ccc."']);
        expect(p._extras).toBeUndefined();
        expect(p.runs[1]).toMatchObject({ type: 'element', name: 'office:annotation', attrs: { 'office:name': 'c1' } });
    });

    test('a heading, a link body, bookmarks, a field and a soft page break', () => {
        const body = odt.read(odtWith('<text:h text:outline-level="1">Ti<text:bookmark text:name="t"/>tle</text:h>'
            + '<text:p>See <text:a xlink:type="simple" xlink:href="#x">the <text:bookmark-start text:name="k"/>key'
            + '<text:bookmark-end text:name="k"/></text:a> on page <text:page-number>3</text:page-number>.'
            + '<text:soft-page-break/>Next</text:p>'), ON).body;
        expect(kinds(body[0].runs)).toEqual(['"Ti"', 'text:bookmark', '"tle"']);
        const p = body[1];
        expect(kinds(p.runs)).toEqual(['"See "', 'link', '" on page "', 'text:page-number', '"."', 'text:soft-page-break', '"Next"']);
        expect(kinds(p.runs[1].runs)).toEqual(['"the "', 'text:bookmark-start', '"key"', 'text:bookmark-end']);
        expect(p.runs[1]._extras).toBeUndefined();
    });

    test('a frame is an element run without framesInRuns, a frame run with it', () => {
        const bytes = odtWith(`<text:p>x${BOX}y</text:p>`);
        expect(kinds(odt.read(bytes, ON).body[0].runs)).toEqual(['"x"', 'draw:frame', '"y"']);
        expect(kinds(odt.read(bytes, { ...ON, framesInRuns: true }).body[0].runs)).toEqual(['"x"', 'frame', '"y"']);
    });

    test('in a list item and a table cell too', () => {
        const body = odt.read(odtWith('<text:list><text:list-item><text:p>i<text:bookmark text:name="l"/>j</text:p></text:list-item></text:list>'
            + '<table:table xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"><table:table-column/><table:table-row><table:table-cell>'
            + '<text:p>c<text:bookmark text:name="c"/>d</text:p></table:table-cell></table:table-row></table:table>'), ON).body;
        expect(kinds(body[0].items[0].children[0].runs)).toEqual(['"i"', 'text:bookmark', '"j"']);
        expect(kinds(body[1].rows[0].cells[0].children[0].runs)).toEqual(['"c"', 'text:bookmark', '"d"']);
    });
});

describe('elementsInRuns — write and views', () => {
    const SRC = `<text:p>Aaa ${NOTE}comment${NOTE_END} ccc.<text:soft-page-break/>x${BOX}y</text:p>`
        + '<text:p>See <text:a xlink:type="simple" xlink:href="#x">the <text:bookmark text:name="k"/>key</text:a>.</text:p>';

    test('write keeps each element at its place: read, write, read gives the same body', () => {
        const m1 = odt.read(odtWith(SRC), ON);
        const m2 = odt.read(odt.write(m1), ON);
        expect(m2.body).toEqual(m1.body);
        const xml = dec.decode(pkg.read(odt.write(m1)).parts['content.xml']);
        expect(xml).toContain('Aaa <office:annotation office:name="c1">');
        expect(xml).toContain('</office:annotation>comment<office:annotation-end office:name="c1"/> ccc.');
    });

    test('odt.toText is the same in both modes, with and without framesInRuns', () => {
        const bytes = odtWith(SRC);
        const base = odt.toText(odt.read(bytes));
        expect(base).toContain('Boxed');
        expect(odt.toText(odt.read(bytes, ON))).toBe(base);
        expect(odt.toText(odt.read(bytes, { ...ON, framesInRuns: true }))).toBe(odt.toText(odt.read(bytes, { framesInRuns: true })));
    });
});
