// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { pkgMimetype } from '../pkg/mimetype.js';
import { pkgManifest } from '../pkg/manifest.js';
import { pkgPackage } from '../pkg/package.js';
import { odfMeta } from '../meta/meta.js';
import { odfSettings } from '../settings/settings.js';
import { odfStyles } from '../style/styles.js';
import { textParagraph } from '../text/paragraph.js';
import { textHeading } from '../text/heading.js';
import { textList } from '../text/list.js';
import { textSection } from '../text/section.js';
import { textContent } from '../text/content.js';
import { tableCell } from '../table/cell.js';
import { tableRow } from '../table/row.js';
import { tableTable } from '../table/table.js';
import { odt } from './odt.js';
import { odtWalker } from './odt-walker.js';
import { odfWalker } from '../_shared/walker.js';
import { odfShared } from '../_shared/index.js';
import { odfErrors } from '../errors.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { textStyleRegistry } from '../text/style-registry.js';
import { drawImage } from '../draw/image.js';
import { drawFrame } from '../draw/frame.js';

const runtime = new ModuleRuntime();
for (const m of [bitstream, huffman, lz77, deflate, crc32, zip,
                 fwXml, odfErrors, odfShared, odfWalker, pkgMimetype, pkgManifest, pkgPackage,
                 odfMeta, odfSettings, odfStyles,
                 textParagraph, textHeading, textList, textSection,
                 tableCell, tableRow, tableTable, textContent,
                 styleAutomatic, textStyleRegistry,
                 drawImage, drawFrame,
                 odtWalker, odt]) {
    runtime.register(m);
}
const o = runtime.resolve('odt');
const { ParseError, ContractError } = runtime.resolve('odfErrors');

const xmlInst = runtime.resolve('xml');
const pkgInst = runtime.resolve('pkgPackage');
const stylesInst = runtime.resolve('odfStyles');
const contentInst = runtime.resolve('textContent');

/** Decode the `content.xml` part of a written `.odt`. */
function contentOf(bytes) {
    return new TextDecoder().decode(pkgInst.read(bytes).parts['content.xml']);
}

function faceEl(attrs) { return xmlInst.el('style:font-face', attrs, []); }

/**
 * A second `odt` instance whose `textContent` is wrapped so it actually
 * exercises the style seam: on read it resolves every `text:style-name`
 * it meets, on write it turns a `styleFlags` field into a registry-issued
 * style name. `textParagraph`/`textList` only opt into `ctx` in a later
 * task, so this stands in for them here.
 */
function makeProbe() {
    const seen = [];
    const probe = {
        ...contentInst,
        parseBody(officeTextEl, ctx) {
            if (ctx) {
                const visit = el => {
                    if (!el || el.type !== 'element') return;
                    const sn = el.attrs && el.attrs['text:style-name'];
                    if (sn) {
                        seen.push([sn, el.name === 'text:list'
                            ? ctx.listNumbering(sn) : ctx.textFlags(sn)]);
                    }
                    for (const c of el.children || []) visit(c);
                };
                visit(officeTextEl);
            }
            return contentInst.parseBody(officeTextEl, ctx);
        },
        renderBody(nodes, ctx) {
            const mapped = (nodes || []).map(n => {
                if (!ctx || !n || !n.styleFlags) return n;
                const { styleFlags, ...rest } = n;
                return { ...rest, styleName: ctx.textStyle(styleFlags) };
            });
            return contentInst.renderBody(mapped, ctx);
        }
    };
    const inst = odt.factory(
        runtime.resolve('odfErrors'), runtime.resolve('odfShared'), pkgInst, xmlInst,
        runtime.resolve('pkgMimetype'), runtime.resolve('pkgManifest'),
        runtime.resolve('odfMeta'), runtime.resolve('odfSettings'), stylesInst,
        runtime.resolve('textParagraph'), probe, runtime.resolve('odtWalker'),
        runtime.resolve('styleAutomatic'), runtime.resolve('textStyleRegistry'),
        runtime.resolve('drawFrame'), runtime.resolve('drawImage'));
    return { odt: inst, seen };
}

describe('odt module', () => {
    test('has the expected factory shape', () => {
        expect(odt.name).toBe('odt');
        expect(odt.dependencies).toContain('pkgPackage');
        expect(odt.dependencies).toContain('textParagraph');
        expect(odt.dependencies).toContain('drawFrame');
        expect(typeof odt.factory).toBe('function');
    });

    describe('empty', () => {
        test('produces a single empty paragraph', () => {
            const d = o.empty();
            expect(d.body).toHaveLength(1);
            expect(d.body[0].type).toBe('paragraph');
        });
    });

    describe('write + read roundtrip', () => {
        test('hello world', () => {
            const doc = { body: [o.paragraph('Hello, world.')] };
            const bytes = o.write(doc);
            expect(bytes).toBeInstanceOf(Uint8Array);
            const back = o.read(bytes);
            expect(back.mimetype).toBe(o.CT_ODT);
            expect(back.body).toHaveLength(1);
            expect(back.body[0].runs[0].value).toBe('Hello, world.');
        });

        test('multi-paragraph + style names', () => {
            const doc = {
                body: [
                    o.paragraph('Title', { styleName: 'Title' }),
                    o.paragraph('First paragraph.'),
                    o.paragraph('Second paragraph.')
                ]
            };
            const back = o.read(o.write(doc));
            expect(back.body).toHaveLength(3);
            expect(back.body[0].styleName).toBe('Title');
            expect(back.body[2].runs[0].value).toBe('Second paragraph.');
        });

        test('meta survives roundtrip', () => {
            const doc = { body: [o.paragraph('x')] };
            const bytes = o.write(doc, {
                meta: { title: 'My Doc', creator: 'Alice' }
            });
            const back = o.read(bytes);
            expect(back.meta.title).toBe('My Doc');
            expect(back.meta.creator).toBe('Alice');
        });
    });

    describe('fromText / toText', () => {
        test('roundtrips a string array', () => {
            const doc = o.fromText(['Line one', 'Line two']);
            const back = o.read(o.write(doc));
            expect(o.toText(back)).toBe('Line one\nLine two');
        });

        test('includes the text of a text box anchored in a paragraph', () => {
            const bytes = o.write(o.fromText(['Hello']));
            const p = pkgInst.read(bytes);
            const patched = contentOf(bytes).replace(
                '<text:p>Hello</text:p>',
                '<text:p>Hello<draw:frame><draw:text-box><text:p>Boxed</text:p></draw:text-box></draw:frame></text:p>');
            expect(patched).toContain('Boxed');
            pkgInst.setPart(p, 'content.xml', new TextEncoder().encode(patched), 'text/xml');
            const back = o.read(pkgInst.write(p));
            expect(o.toText(back)).toBe('Hello\nBoxed');
        });
    });

    describe('read errors', () => {
        test('throws on missing content.xml', () => {
            const mimetypeMod = runtime.resolve('pkgMimetype');
            const pkg = runtime.resolve('pkgPackage');
            const p = pkg.empty(mimetypeMod.CT_ODT);
            const bytes = pkg.write(p);
            expect(() => o.read(bytes)).toThrow(/content\.xml/);
        });

        test('throws on wrong mimetype', () => {
            const mimetypeMod = runtime.resolve('pkgMimetype');
            const pkg = runtime.resolve('pkgPackage');
            const p = pkg.empty(mimetypeMod.CT_ODS);
            pkg.setPart(p, 'content.xml', new TextEncoder().encode('<x/>'), 'text/xml');
            const bytes = pkg.write(p);
            expect(() => o.read(bytes)).toThrow(/mimetype/);
        });
    });

    // ------------------------------------------------------------------
    describe('style seam — automatic styles', () => {
        const FOREIGN = {
            styles: [{
                name: 'P1', family: 'paragraph',
                properties: { paragraph: { 'fo:margin-left': '1cm' } }
            }]
        };

        test('writes <office:automatic-styles> before <office:body> and reads it back', () => {
            const doc = { body: [o.paragraph('x', { styleName: 'P1' })], autoStyles: FOREIGN };
            const bytes = o.write(doc);
            const xmlStr = contentOf(bytes);
            expect(xmlStr).toContain('<office:automatic-styles>');
            expect(xmlStr.indexOf('<office:automatic-styles'))
                .toBeLessThan(xmlStr.indexOf('<office:body'));
            expect(o.read(bytes).autoStyles).toEqual(FOREIGN);
        });

        test('a raw text:list-style in _extras survives the roundtrip', () => {
            const model = {
                styles: [],
                _extras: {
                    children: [xmlInst.el('text:list-style', { 'style:name': 'L9' }, [
                        xmlInst.el('text:list-level-style-bullet',
                            { 'text:level': '1', 'text:bullet-char': '-' }, [])
                    ])]
                }
            };
            const back = o.read(o.write({ body: [o.paragraph('x')], autoStyles: model }));
            expect(back.autoStyles).toEqual(model);
        });

        test('a document with no styles is byte-identical to the pre-change output', () => {
            const xmlStr = contentOf(o.write({ body: [o.paragraph('Hello, world.')] }));
            // Literal measured on `master` before this change.
            expect(xmlStr).toBe(
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
                + '<office:document-content'
                + ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
                + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
                + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
                + ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
                + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
                + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
                + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'
                + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
                + ' office:version="1.4">'
                + '<office:body><office:text><text:p>Hello, world.</text:p></office:text>'
                + '</office:body></office:document-content>');
            expect(xmlStr).not.toContain('office:automatic-styles');
            expect(xmlStr).not.toContain('office:font-face-decls');
            const back = o.read(o.write({ body: [o.paragraph('Hello, world.')] }));
            expect(back.autoStyles).toBeUndefined();
            expect(back.fontFaces).toBeUndefined();
        });

        test('fully consumed automatic styles leave no autoStyles key', () => {
            const { odt: probe, seen } = makeProbe();
            const auto = {
                styles: [{
                    name: 'T1', family: 'text',
                    properties: { text: { 'fo:font-weight': 'bold' } }
                }]
            };
            const back = probe.read(probe.write({
                body: [probe.paragraph('x', { styleName: 'T1' })], autoStyles: auto
            }));
            expect(seen).toEqual([['T1', { bold: true, source: 'auto' }]]);
            expect(back.autoStyles).toBeUndefined();
        });

        test('unproven automatic styles stay surfaced', () => {
            const { odt: probe } = makeProbe();
            const auto = {
                styles: [
                    { name: 'T1', family: 'text', properties: { text: { 'fo:font-weight': 'bold' } } },
                    { name: 'T2', family: 'text', properties: { text: { 'fo:color': '#f00' } } }
                ]
            };
            const back = probe.read(probe.write({
                body: [probe.paragraph('a', { styleName: 'T1' }),
                       probe.paragraph('b', { styleName: 'T2' })],
                autoStyles: auto
            }));
            expect(back.autoStyles).toEqual({ styles: [auto.styles[1]] });
        });
    });

    describe('style seam — font faces (RULING A)', () => {
        test('registry emission: face decls, then automatic styles, then body', () => {
            const { odt: probe, seen } = makeProbe();
            const bytes = probe.write({
                body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'code' }],
                         styleFlags: { monospace: true, bold: true } }]
            });
            const xmlStr = contentOf(bytes);
            expect(xmlStr.indexOf('<office:font-face-decls'))
                .toBeLessThan(xmlStr.indexOf('<office:automatic-styles'));
            expect(xmlStr.indexOf('<office:automatic-styles'))
                .toBeLessThan(xmlStr.indexOf('<office:body'));
            expect(xmlStr).toContain('style:name="awa-mono"');
            expect(xmlStr).toContain('svg:font-family="monospace"');
            expect(xmlStr).toContain('text:style-name="awa-t-bm"');

            const back = probe.read(bytes);
            expect(seen).toEqual([['awa-t-bm', { bold: true, monospace: true, source: 'auto' }]]);
            expect(back.autoStyles).toBeUndefined();
            expect(back.fontFaces).toBeUndefined();
        });

        test('a consumed face is stripped, a still-referenced one is kept', () => {
            const { odt: probe } = makeProbe();
            const face = faceEl({ 'style:name': 'Mono', 'style:font-pitch': 'fixed' });
            const consumable = {
                name: 'T1', family: 'text',
                properties: { text: { 'style:font-name': 'Mono' } }
            };
            // (a) nothing else references the face → dropped
            const a = probe.read(probe.write({
                body: [probe.paragraph('x', { styleName: 'T1' })],
                autoStyles: { styles: [consumable] }, fontFaces: [face]
            }));
            expect(a.autoStyles).toBeUndefined();
            expect(a.fontFaces).toBeUndefined();

            // (b) a surviving foreign style still names it → kept
            const survivor = {
                name: 'P9', family: 'paragraph',
                properties: { text: { 'style:font-name': 'Mono' } }
            };
            const b = probe.read(probe.write({
                body: [probe.paragraph('x', { styleName: 'T1' })],
                autoStyles: { styles: [consumable, survivor] }, fontFaces: [face]
            }));
            expect(b.autoStyles).toEqual({ styles: [survivor] });
            expect(b.fontFaces).toEqual([face]);
        });

        test('unresolved faces round-trip verbatim', () => {
            const faces = [faceEl({ 'style:name': 'Arial', 'svg:font-family': 'Arial' })];
            const back = o.read(o.write({ body: [o.paragraph('x')], fontFaces: faces }));
            expect(back.fontFaces).toEqual(faces);
        });

        test('a foreign face with neither monospace marker is not resolved', () => {
            const { odt: probe, seen } = makeProbe();
            const face = faceEl({ 'style:name': 'Arial', 'svg:font-family': 'Arial' });
            const back = probe.read(probe.write({
                body: [probe.paragraph('x', { styleName: 'T1' })],
                autoStyles: {
                    styles: [{ name: 'T1', family: 'text',
                               properties: { text: { 'style:font-name': 'Arial' } } }]
                },
                fontFaces: [face]
            }));
            expect(seen).toEqual([['T1', null]]);
            expect(back.fontFaces).toEqual([face]);
            expect(back.autoStyles.styles).toHaveLength(1);
        });
    });

    describe('style seam — styles.xml (RULING B) and read order', () => {
        function strongStyle() {
            return xmlInst.el('style:style',
                { 'style:name': 'Strong', 'style:family': 'text' },
                [xmlInst.el('style:text-properties', { 'fo:font-weight': 'bold' }, [])]);
        }

        test('a styles.xml named style resolves, and is never consumed or stripped', () => {
            const { odt: probe, seen } = makeProbe();
            const stylesModel = {
                styles: [strongStyle()], automaticStyles: [], masterStyles: []
            };
            const bytes = probe.write(
                { body: [probe.paragraph('x', { styleName: 'Strong' })] },
                { styles: stylesModel });
            const back = probe.read(bytes);
            expect(seen).toEqual([['Strong', { bold: true, source: 'named' }]]);
            expect(back.styles.styles).toHaveLength(1);
            expect(back.styles.styles[0].attrs['style:name']).toBe('Strong');
        });

        test('the sidecar model is unchanged by the sidecars-first read order', () => {
            const stylesModel = {
                styles: [strongStyle()], automaticStyles: [], masterStyles: []
            };
            const bytes = o.write({ body: [o.paragraph('x', { styleName: 'Strong' })] },
                { styles: stylesModel });
            const back = o.read(bytes);
            // Independent oracle: parse the very same part directly.
            const direct = stylesInst.parse(
                new TextDecoder().decode(back.package.parts['styles.xml']));
            expect(back.styles).toEqual(direct);
            expect(back.meta).toEqual(
                runtime.resolve('odfMeta').parse(
                    new TextDecoder().decode(back.package.parts['meta.xml'])));
            expect(back.settings).toEqual(
                runtime.resolve('odfSettings').parse(
                    new TextDecoder().decode(back.package.parts['settings.xml'])));
        });

        test('a styles.xml font-face-decls feeds monospace resolution', () => {
            const { odt: probe, seen } = makeProbe();
            const decls = xmlInst.el('office:font-face-decls', {}, [
                faceEl({ 'style:name': 'Mono', 'style:font-family-generic': 'modern' })
            ]);
            const stylesModel = {
                styles: [], automaticStyles: [], masterStyles: [],
                _extras: { children: [decls] }
            };
            const back = probe.read(probe.write({
                body: [probe.paragraph('x', { styleName: 'T1' })],
                autoStyles: {
                    styles: [{ name: 'T1', family: 'text',
                               properties: { text: { 'style:font-name': 'Mono' } } }]
                }
            }, { styles: stylesModel }));
            expect(seen).toEqual([['T1', { monospace: true, source: 'auto' }]]);
            expect(back.autoStyles).toBeUndefined();
            // styles.xml material is untouched.
            expect(back.styles._extras.children[0].name).toBe('office:font-face-decls');
        });
    });

    // ------------------------------------------------------------------
    // office/BATCH_48/01 — typed styles.xml specs + body-table grid seam
    describe('typed presentation — grid tables and named-style specs', () => {
        function gridTable() {
            return {
                type: 'table', grid: true,
                columns: [{ repeated: 3 }],
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', children: [o.paragraph('a')] },
                        { type: 'cell', children: [o.paragraph('b')] },
                        { type: 'cell', children: [o.paragraph('c')] }
                    ] },
                    { type: 'row', cells: [
                        { type: 'cell', colSpan: 2, children: [o.paragraph('d')] },
                        { type: 'cell', covered: true, children: [] },
                        { type: 'cell', children: [o.paragraph('e')] }
                    ] }
                ]
            };
        }
        const SPECS = [
            { name: 'Heading_20_1', displayName: 'Heading 1', family: 'paragraph',
              nextStyleName: 'Text_20_body', defaultOutlineLevel: 1, class: 'text',
              properties: { text: { 'fo:font-size': '16pt', 'fo:font-weight': 'bold' } } },
            { name: 'Text_20_body', displayName: 'Text body', family: 'paragraph',
              properties: { paragraph: { 'fo:margin-bottom': '0.247cm' } } }
        ];

        test('write emits the specs in styles.xml and the grid auto styles in content.xml', () => {
            const bytes = o.write({ body: [gridTable()] },
                { styles: { styles: SPECS, automaticStyles: [], masterStyles: [] } });
            const stylesXml = new TextDecoder().decode(pkgInst.read(bytes).parts['styles.xml']);
            expect(stylesXml).toContain('<office:styles><style:style style:name="Heading_20_1" '
                + 'style:display-name="Heading 1" style:family="paragraph" '
                + 'style:next-style-name="Text_20_body" style:default-outline-level="1" style:class="text">'
                + '<style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>'
                + '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph">'
                + '<style:paragraph-properties fo:margin-bottom="0.247cm"/></style:style></office:styles>');
            const content = contentOf(bytes);
            expect(content).toContain('<office:automatic-styles>'
                + '<style:style style:name="awa-c-b" style:family="table-cell">'
                + '<style:table-cell-properties fo:border="0.5pt solid #000000" fo:padding="0.097cm"/></style:style>'
                + '<style:style style:name="awa-tb-m" style:family="table">'
                + '<style:table-properties table:align="margins"/></style:style></office:automatic-styles>');
            expect(content).toContain('<table:table table:style-name="awa-tb-m">');
            expect(content.split('<table:table-cell table:style-name="awa-c-b"').length - 1).toBe(5);
            expect(content).toContain('<table:covered-table-cell/>');
        });

        test('read recovers grid:true, drops the auto styles, keeps styles.xml raw', () => {
            const T = gridTable();
            const back = o.read(o.write({ body: [T] },
                { styles: { styles: SPECS, automaticStyles: [], masterStyles: [] } }));
            expect(back.body).toEqual([T]);
            expect(back.body[0].grid).toBe(true);
            for (const row of back.body[0].rows) {
                for (const c of row.cells) expect(c.styleName).toBeUndefined();
            }
            expect(back.autoStyles).toBeUndefined();
            expect(back.styles.styles.map(e => e.type)).toEqual(['element', 'element']);
            expect(back.styles.styles.map(e => e.attrs['style:name'])).toEqual(['Heading_20_1', 'Text_20_body']);
        });

        test('odt.read(odt.write({ body: [T] })).autoStyles is undefined', () => {
            const T = gridTable();
            const back = o.read(o.write({ body: [T] }));
            expect(back.autoStyles).toBeUndefined();
            expect(back.body).toEqual([T]);
        });

        test('a re-write of the read model is byte-identical (stable round trip)', () => {
            const once = o.write({ body: [gridTable()] });
            const twice = o.write({ body: o.read(once).body });
            expect(contentOf(twice)).toBe(contentOf(once));
        });

        test('a non-grid table referencing awa-c-b keeps its names and the auto style stays surfaced', () => {
            const T = gridTable();
            const once = o.write({ body: [T] });
            // Strip one cell's style name in content.xml → the table no longer qualifies.
            const p = pkgInst.read(once);
            const xmlText = contentOf(once).replace(
                '<table:table-cell table:style-name="awa-c-b"><text:p>e</text:p>',
                '<table:table-cell><text:p>e</text:p>');
            expect(xmlText).not.toBe(contentOf(once));
            pkgInst.setPart(p, 'content.xml', new TextEncoder().encode(xmlText), 'text/xml');
            const back = o.read(pkgInst.write(p));
            expect(back.body[0].grid).toBeUndefined();
            expect(back.body[0].styleName).toBe('awa-tb-m');
            expect(back.body[0].rows[0].cells[0].styleName).toBe('awa-c-b');
            expect(back.autoStyles.styles.map(s => s.name)).toEqual(['awa-c-b', 'awa-tb-m']);
        });
    });

    // ------------------------------------------------------------------
    describe('typed image write', () => {
        // 8-byte PNG signature + 16 bytes; JPEG magic + padding.
        const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            ...new Array(16).fill(0).map((_, i) => i + 1)]);
        const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0]);
        const RANDOM = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

        function imageRun(extra) {
            return { type: 'image', href: 'Pictures/a.png', width: '4cm', height: '3cm',
                     name: 'img1', mimeType: 'image/png', ...(extra || {}) };
        }

        function inlineDoc(pictures) {
            const doc = { body: [{ type: 'paragraph', runs: [
                { type: 'text', value: 'Before ' },
                imageRun(),
                { type: 'text', value: ' after' }
            ] }] };
            if (pictures) doc.pictures = pictures;
            return doc;
        }

        /** The `text:p` elements of a written document's `content.xml`, parsed with `xml`. */
        function paragraphsOf(bytes) {
            const root = xmlInst.parse(contentOf(bytes));
            const textEl = xmlInst.findChild(xmlInst.findChild(root, 'office:body'), 'office:text');
            return xmlInst.findAll(textEl, 'text:p');
        }

        function attempt(fn) {
            try { return { value: fn() }; } catch (error) { return { error }; }
        }

        test('inline: [text, draw:frame, text] in order, frame + image attributes', () => {
            const [p] = paragraphsOf(o.write(inlineDoc()));
            const kids = p.children;
            expect(kids.map(c => c.type === 'element' ? c.name : c.type))
                .toEqual(['text', 'draw:frame', 'text']);
            expect(kids[0].value).toBe('Before ');
            expect(kids[2].value).toBe(' after');
            const frame = kids[1];
            expect(frame.attrs['text:anchor-type']).toBe('as-char');
            expect(frame.attrs['svg:width']).toBe('4cm');
            expect(frame.attrs['svg:height']).toBe('3cm');
            expect(frame.attrs['draw:name']).toBe('img1');
            const imgs = frame.children.filter(c => c.type === 'element');
            expect(imgs).toHaveLength(1);
            expect(imgs[0].name).toBe('draw:image');
            expect(imgs[0].attrs['xlink:href']).toBe('Pictures/a.png');
            expect(imgs[0].attrs['xlink:type']).toBe('simple');
            expect(imgs[0].attrs['xlink:show']).toBe('embed');
            expect(imgs[0].attrs['xlink:actuate']).toBe('onLoad');
            expect(imgs[0].attrs['draw:mime-type']).toBe('image/png');
        });

        test('an explicit anchorType / styleName reach the frame', () => {
            const [p] = paragraphsOf(o.write({ body: [{ type: 'paragraph', runs: [
                imageRun({ anchorType: 'paragraph', styleName: 'fr1' })
            ] }] }));
            const frame = p.children.find(c => c.type === 'element');
            expect(frame.attrs['text:anchor-type']).toBe('paragraph');
            expect(frame.attrs['draw:style-name']).toBe('fr1');
        });

        test('doc.pictures become parts with sniffed manifest media types', () => {
            const bytes = o.write(inlineDoc({
                'Pictures/a.png': PNG,
                'Pictures/b.jpg': JPEG,
                'Pictures/c.bin': RANDOM
            }));
            const back = pkgInst.read(bytes);
            expect(back.parts['Pictures/a.png']).toEqual(PNG);
            expect(back.parts['Pictures/b.jpg']).toEqual(JPEG);
            expect(back.parts['Pictures/c.bin']).toEqual(RANDOM);
            expect(back.manifest.entries).toContainEqual({ fullPath: 'Pictures/a.png', mediaType: 'image/png' });
            expect(back.manifest.entries).toContainEqual({ fullPath: 'Pictures/b.jpg', mediaType: 'image/jpeg' });
            expect(back.manifest.entries).toContainEqual({ fullPath: 'Pictures/c.bin', mediaType: 'application/octet-stream' });
        });

        test('block image: a paragraph whose only run is an image has exactly one draw:frame child', () => {
            const [p] = paragraphsOf(o.write({
                body: [{ type: 'paragraph', runs: [imageRun()] }],
                pictures: { 'Pictures/a.png': PNG }
            }));
            const elements = p.children.filter(c => c.type === 'element');
            expect(elements).toHaveLength(1);
            expect(elements[0].name).toBe('draw:frame');
            expect(p.children.filter(c => c.type === 'text' && c.value)).toHaveLength(0);
        });

        test('read-side asymmetry: the frame stays untyped in _extras.children', () => {
            const back = o.read(o.write(inlineDoc({ 'Pictures/a.png': PNG })));
            expect(back.body[0].runs).toEqual([
                { type: 'text', value: 'Before ' },
                { type: 'text', value: ' after' }
            ]);
            expect(back.body[0]._extras.children[0].name).toBe('draw:frame');
            expect(back.package.parts['Pictures/a.png']).toBeDefined();
            expect(back.package.parts['Pictures/a.png']).toEqual(PNG);
        });

        test('contract errors: reserved / invalid paths and non-Uint8Array values', () => {
            const cases = [
                { 'Pictures/a.png': [1, 2, 3] },
                { 'content.xml': PNG },
                { '../x.png': PNG },
                { '/abs.png': PNG }
            ];
            for (const pictures of cases) {
                const r = attempt(() => o.write(inlineDoc(pictures)));
                expect(r.error).toBeInstanceOf(ContractError);
                expect(r.error.code).toBe('odf/contract-error/odt');
            }
        });

        test('an external href without pictures: frame emitted, no extra part, no throw', () => {
            const href = 'https://awa.example/logo.png';
            const r = attempt(() => o.write({ body: [{ type: 'paragraph', runs: [
                { type: 'image', href, width: '2cm', height: '1cm' }
            ] }] }));
            expect(r.error).toBeUndefined();
            const [p] = paragraphsOf(r.value);
            const frame = p.children.find(c => c.type === 'element');
            expect(frame.name).toBe('draw:frame');
            expect(xmlInst.findChild(frame, 'draw:image').attrs['xlink:href']).toBe(href);
            expect(Object.keys(pkgInst.read(r.value).parts).sort())
                .toEqual(['content.xml', 'meta.xml', 'settings.xml', 'styles.xml']);
        });

        test('byte stability: no image run and no pictures = textContent.renderBody wrapped by the same root', () => {
            const { ODF_NS, ODF_VERSION } = runtime.resolve('odfShared');
            const doc = { body: [
                { type: 'paragraph', runs: [
                    { type: 'text', value: 'a ' },
                    { type: 'span', value: 'B', bold: true }
                ] },
                o.paragraph('plain')
            ] };
            const registry = runtime.resolve('textStyleRegistry').createRegistry({
                styles: new Set(), fontFaces: new Set()
            });
            const body = contentInst.renderBody(doc.body, registry);
            const rootChildren = [];
            const faces = registry.toFontFaceDecls();
            if (faces) rootChildren.push(faces);
            const auto = registry.toAutomaticStyles();
            if (auto) rootChildren.push(runtime.resolve('styleAutomatic').render(auto));
            rootChildren.push(xmlInst.el('office:body', {}, [xmlInst.el('office:text', {}, body)]));
            const expected = xmlInst.serialize(xmlInst.el('office:document-content', {
                'xmlns:office': ODF_NS.OFFICE,
                'xmlns:text':   ODF_NS.TEXT,
                'xmlns:style':  ODF_NS.STYLE,
                'xmlns:table':  ODF_NS.TABLE,
                'xmlns:draw':   ODF_NS.DRAW,
                'xmlns:fo':     ODF_NS.FO,
                'xmlns:svg':    ODF_NS.SVG,
                'xmlns:xlink':  ODF_NS.XLINK,
                'office:version': ODF_VERSION
            }, rootChildren));
            expect(auto).not.toBeNull();
            const bytes = o.write(doc);
            expect(contentOf(bytes)).toBe(expected);
            expect(Object.keys(pkgInst.read(bytes).parts).sort())
                .toEqual(['content.xml', 'meta.xml', 'settings.xml', 'styles.xml']);
        });
    });

    test('write(undefined) throws ContractError', () => {
        expect(() => o.write(undefined)).toThrow(ContractError);
    });

    // ensure ParseError import stays referenced (unused-deps guard)
    test('ParseError class is reachable', () => { expect(typeof ParseError).toBe('function'); });
});

describe('odt — meta:generator on write', () => {
    test('an opts.meta without a generator gets @awacloud/odf', () => {
        const bytes = o.write(o.fromText(['x']), { meta: { title: 'T' } });
        const meta = o.read(bytes).meta;
        expect(meta.title).toBe('T');
        expect(meta.generator).toBe('@awacloud/odf');
    });

    test('write(readDoc) replaces the read generator', () => {
        const foreign = o.write(o.fromText(['x']), { meta: { title: 'T', generator: 'LibreOffice/24.2' } });
        const readDoc = o.read(foreign);
        expect(readDoc.meta.generator).toBe('LibreOffice/24.2');
        const meta = o.read(o.write(readDoc)).meta;
        expect(meta.generator).toBe('@awacloud/odf');
        expect(meta.title).toBe('T');
    });

    test('an explicit opts.meta.generator is kept', () => {
        const bytes = o.write(o.fromText(['x']), { meta: { generator: 'MyApp/1' } });
        expect(o.read(bytes).meta.generator).toBe('MyApp/1');
    });
});

describe('odt — read(bytes, opts) forwards the zip caps', () => {
    const p = pkgInst.read(o.write(o.fromText(['x'])));
    pkgInst.setPart(p, 'Pictures/pad.bin', new Uint8Array(1024 * 1024));
    const padded = pkgInst.write(p);

    test('the default maxRatio rejects a 1 MiB zero pad', () => {
        let err = null;
        try { o.read(padded); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('odf/parse-error/zip-bomb');
        expect(err.context.limit).toBe('maxRatio');
    });

    test('maxRatio: 0 disables the check and the part is read', () => {
        const doc = o.read(padded, { maxRatio: 0 });
        expect(o.toText(doc)).toBe('x');
        expect(doc.package.parts['Pictures/pad.bin'].length).toBe(1024 * 1024);
    });

    test('a 1100-entry package reads with defaults; an explicit maxParts: 1024 still trips', () => {
        const many = pkgInst.read(o.write(o.fromText(['x'])));
        for (let i = 0; i < 1100; i++) {
            pkgInst.setPart(many, 'Object ' + i + '/content.xml', new Uint8Array([0x3c, 0x78, 0x2f, 0x3e]));
        }
        const bytes = pkgInst.write(many);
        expect(o.toText(o.read(bytes))).toBe('x');
        let err = null;
        try { o.read(bytes, { maxParts: 1024 }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('odf/parse-error/zip-bomb');
        expect(err.context.limit).toBe('maxParts');
        expect(err.context.max).toBe(1024);
    });
});
