// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `odt.read(bytes, { framesInRuns: true })` keeps a paragraph's
 * `<draw:frame>` at its place in the text, as a typed `{ type: 'frame',
 * ...drawFrame model }` run (paragraphs, headings, spans, links, list items,
 * table cells); `write` renders a frame run in place. Without the option the
 * 1.0.0 model is unchanged: a paragraph frame stays in `_extras.children`
 * (re-emitted after the runs), a span frame stays a raw element entry.
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
    + ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
    + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
    + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
    + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
const FRAME = '<draw:frame draw:name="P1" text:anchor-type="as-char" svg:width="1cm" svg:height="1cm">'
    + '<draw:image xlink:href="Pictures/a.png"/><svg:title>Logo</svg:title></draw:frame>';
const FRAME_RUN = {
    type: 'frame', anchorType: 'as-char', name: 'P1', width: '1cm', height: '1cm',
    child: { kind: 'image', href: 'Pictures/a.png' },
    _extras: { children: [expect.objectContaining({ name: 'svg:title' })] }
};

/** An .odt whose content.xml body is `bodyXml`. */
function odtWith(bodyXml) {
    const p = pkg.read(odt.write({ body: [] }));
    p.parts['content.xml'] = enc.encode('<?xml version="1.0" encoding="UTF-8"?>'
        + `<office:document-content ${NS} office:version="1.3"><office:body><office:text>`
        + `${bodyXml}</office:text></office:body></office:document-content>`);
    return pkg.write(p);
}
const contentOf = (bytes) => dec.decode(pkg.read(bytes).parts['content.xml']);

describe('odt frames — default read keeps the 1.0.0 model', () => {
    test('a paragraph frame stays in _extras.children; the runs hold the text only', () => {
        const p = odt.read(odtWith(`<text:p>before ${FRAME} after</text:p>`)).body[0];
        expect(p.runs).toEqual([{ type: 'text', value: 'before ' }, { type: 'text', value: ' after' }]);
        expect(p._extras.children.map(c => c.name)).toEqual(['draw:frame']);
    });

    test('a span frame stays a raw element entry', () => {
        const p = odt.read(odtWith(`<text:p><text:span>a${FRAME}b</text:span></text:p>`)).body[0];
        expect(p.runs[0].runs[1]).toMatchObject({ type: 'element', name: 'draw:frame' });
    });
});

describe('odt frames — framesInRuns: true', () => {
    const OPT = { framesInRuns: true };

    test('a paragraph frame is a frame run at its place; nothing in _extras', () => {
        const p = odt.read(odtWith(`<text:p>before ${FRAME} after</text:p>`), OPT).body[0];
        expect(p.runs).toEqual([
            { type: 'text', value: 'before ' }, FRAME_RUN, { type: 'text', value: ' after' }
        ]);
        expect(p._extras).toBeUndefined();
    });

    test('headings, spans, links, list items and table cells place their frames too', () => {
        const body = odt.read(odtWith(
            `<text:h text:outline-level="1">H${FRAME}</text:h>`
            + `<text:p><text:span>a${FRAME}b</text:span><text:a xlink:href="https://e.x">l${FRAME}</text:a></text:p>`
            + `<text:list><text:list-item><text:p>i${FRAME}</text:p></text:list-item></text:list>`
            + `<table:table><table:table-row><table:table-cell><text:p>c${FRAME}</text:p></table:table-cell></table:table-row></table:table>`
        ), OPT).body;
        expect(body[0].runs[1]).toEqual(FRAME_RUN);
        expect(body[1].runs[0].runs[1]).toEqual(FRAME_RUN);
        expect(body[1].runs[1].runs[1]).toEqual(FRAME_RUN);
        expect(body[2].items[0].children[0].runs[1]).toEqual(FRAME_RUN);
        expect(body[3].rows[0].cells[0].children[0].runs[1]).toEqual(FRAME_RUN);
    });

    test('write renders a frame run in place; a second read gives the same model', () => {
        const doc = odt.read(odtWith(`<text:p>before ${FRAME} after</text:p>`), OPT);
        const bytes = odt.write(doc);
        expect(contentOf(bytes)).toMatch(/before <draw:frame[^>]*>.*?<\/draw:frame> after<\/text:p>/);
        expect(odt.read(bytes, OPT).body).toEqual(doc.body);
    });

    test('toText reads frame runs as it reads raw frames (text boxes, titles, spans, links)', () => {
        const BOX = '<draw:frame draw:name="B" text:anchor-type="paragraph"><draw:text-box>'
            + '<text:p>boxed</text:p></draw:text-box><svg:title>T</svg:title></draw:frame>';
        const bytes = odtWith(`<text:p>before ${FRAME} after${BOX}</text:p>`
            + `<text:p><text:span>s${BOX}${FRAME}</text:span><text:a xlink:href="https://e.x">l${BOX}</text:a></text:p>`);
        const plain = odt.toText(odt.read(bytes));
        expect(plain).toBe('before  after\nboxed\nsboxedTLogol\nboxed');
        expect(odt.toText(odt.read(bytes, OPT))).toBe(plain);
    });
});
