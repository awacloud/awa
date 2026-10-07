// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { fw_require, modules } from '@awacloud/odf';
import { textParagraph } from './paragraph.js';
import { textStyleRegistry } from './style-registry.js';

const xml = fwXml.factory();
const para = textParagraph.factory(xml);
const reg = textStyleRegistry.factory(xml);

/** Serialize a paragraph model straight to its `<text:p>` string. */
function ser(p, ctx) {
    return xml.serializeNode(para.renderParagraph(p, ctx));
}

/** Parse a `<text:p>` source string with an optional style seam. */
function parse(src, ctx) {
    return para.parseParagraph(xml.parse(src), ctx);
}

/** A composed odf runtime — the same wiring a consumer gets. */
function odfRuntime() {
    const runtime = new ModuleRuntime();
    runtime.registerAll(fw_require);
    runtime.registerAll(modules);
    return runtime;
}

/** Decode `content.xml` out of written `.odt` bytes. */
function contentXmlOf(runtime, bytes) {
    const pkg = runtime.resolve('pkgPackage');
    return new TextDecoder().decode(pkg.read(bytes).parts['content.xml']);
}

describe('textParagraph module', () => {
    test('has the expected factory shape', () => {
        expect(textParagraph.name).toBe('textParagraph');
        expect(textParagraph.dependencies).toEqual(['xml']);
        expect(typeof textParagraph.factory).toBe('function');
    });

    describe('parseParagraph', () => {
        test('extracts plain text', () => {
            const el = xml.parse('<text:p>Hello, world.</text:p>');
            const p = para.parseParagraph(el);
            expect(p.type).toBe('paragraph');
            expect(p.runs).toHaveLength(1);
            expect(p.runs[0]).toEqual({ type: 'text', value: 'Hello, world.' });
        });

        test('extracts style name', () => {
            const el = xml.parse('<text:p text:style-name="P1">Hi</text:p>');
            const p = para.parseParagraph(el);
            expect(p.styleName).toBe('P1');
        });

        test('extracts spans with style', () => {
            const el = xml.parse('<text:p>A <text:span text:style-name="T1">B</text:span> C</text:p>');
            const p = para.parseParagraph(el);
            expect(p.runs).toHaveLength(3);
            expect(p.runs[0]).toEqual({ type: 'text', value: 'A ' });
            expect(p.runs[1]).toEqual({ type: 'span', value: 'B', styleName: 'T1' });
            expect(p.runs[2]).toEqual({ type: 'text', value: ' C' });
        });

        test('handles text:s / text:tab / text:line-break', () => {
            const el = xml.parse('<text:p>A<text:s text:c="3"/>B<text:tab/>C<text:line-break/>D</text:p>');
            const p = para.parseParagraph(el);
            const types = p.runs.map(r => r.type);
            expect(types).toEqual(['text', 'space', 'text', 'tab', 'text', 'line-break', 'text']);
            expect(p.runs[1].count).toBe(3);
        });

        test('preserves unknown children in _extras', () => {
            const el = xml.parse('<text:p>x<text:bookmark text:name="A"/></text:p>');
            const p = para.parseParagraph(el);
            expect(p._extras.children).toHaveLength(1);
            expect(p._extras.children[0].name).toBe('text:bookmark');
        });
    });

    describe('renderParagraph', () => {
        test('roundtrips plain text', () => {
            const src = '<text:p>Hello</text:p>';
            const el = xml.parse(src);
            const p = para.parseParagraph(el);
            const back = para.renderParagraph(p);
            expect(xml.serializeNode(back)).toBe(src);
        });

        test('emits style and runs', () => {
            const p = {
                type: 'paragraph',
                styleName: 'P1',
                runs: [
                    { type: 'text', value: 'A ' },
                    { type: 'span', value: 'B', styleName: 'T1' },
                    { type: 'tab' },
                    { type: 'line-break' },
                    { type: 'space', count: 3 }
                ]
            };
            const out = xml.serializeNode(para.renderParagraph(p));
            expect(out).toContain('text:style-name="P1"');
            expect(out).toContain('<text:span text:style-name="T1">B</text:span>');
            expect(out).toContain('<text:tab/>');
            expect(out).toContain('<text:line-break/>');
            expect(out).toContain('<text:s text:c="3"/>');
        });
    });

    describe('textOf', () => {
        test('concatenates all run kinds', () => {
            const p = {
                type: 'paragraph',
                runs: [
                    { type: 'text', value: 'A' },
                    { type: 'space', count: 2 },
                    { type: 'span', value: 'B' },
                    { type: 'tab' },
                    { type: 'text', value: 'C' },
                    { type: 'line-break' },
                    { type: 'text', value: 'D' }
                ]
            };
            expect(para.textOf(p)).toBe('A  B\tC\nD');
        });
    });

    describe('paragraph helper', () => {
        test('builds a single-text paragraph', () => {
            const p = para.paragraph('Hello');
            expect(p.runs).toEqual([{ type: 'text', value: 'Hello' }]);
        });

        test('accepts a styleName', () => {
            const p = para.paragraph('Hello', { styleName: 'P1' });
            expect(p.styleName).toBe('P1');
        });
    });
});

describe('textParagraph — span emphasis flags (GAP-ODF-3)', () => {
    test('flags round-trip parse<->render through a real registry/resolver pair', () => {
        const registry = reg.createRegistry();
        const p = {
            type: 'paragraph',
            runs: [
                { type: 'text', value: 'a ' },
                { type: 'span', value: 'B', bold: true, italic: true },
                { type: 'text', value: ' c' }
            ]
        };
        const node = para.renderParagraph(p, registry);
        expect(xml.serializeNode(node))
            .toBe('<text:p>a <text:span text:style-name="awa-t-bi">B</text:span> c</text:p>');

        const resolver = reg.createResolver(registry.toAutomaticStyles(), [], null);
        // 'auto' source: the style is consumed, so no styleName survives.
        expect(para.parseParagraph(node, resolver)).toEqual(p);
        expect([...resolver.consumed]).toEqual(['awa-t-bi']);
    });

    test('maps bold / italic / strike each to its own property', () => {
        for (const [flag, prop, value] of [
            ['bold', 'fo:font-weight', 'bold'],
            ['italic', 'fo:font-style', 'italic'],
            ['strike', 'style:text-line-through-style', 'solid']
        ]) {
            const registry = reg.createRegistry();
            const run = { type: 'span', value: 'x' };
            run[flag] = true;
            const node = para.renderParagraph({ type: 'paragraph', runs: [run] }, registry);
            const auto = registry.toAutomaticStyles();
            expect(auto.styles[0].properties.text[prop]).toBe(value);
            const resolver = reg.createResolver(auto, [], null);
            expect(para.parseParagraph(node, resolver).runs[0]).toEqual(run);
        }
    });

    test('monospace resolves only when the declared face is monospace', () => {
        const registry = reg.createRegistry();
        const run = { type: 'span', value: 'code', monospace: true };
        const node = para.renderParagraph({ type: 'paragraph', runs: [run] }, registry);
        const faces = registry.toFontFaceDecls();
        expect(faces.children[0].attrs['style:name']).toBe('awa-mono');

        const resolver = reg.createResolver(registry.toAutomaticStyles(), faces.children, null);
        expect(para.parseParagraph(node, resolver).runs[0]).toEqual(run);

        // Without the face declaration the font name is unprovable → passthrough.
        const blind = reg.createResolver(registry.toAutomaticStyles(), [], null);
        expect(para.parseParagraph(node, blind).runs[0])
            .toEqual({ type: 'span', value: 'code', styleName: 'awa-t-m' });
    });

    test('precedence: an explicit styleName beats the flags on write', () => {
        const registry = reg.createRegistry();
        const p = {
            type: 'paragraph',
            runs: [{ type: 'span', value: 'B', styleName: 'T1', bold: true, italic: true }]
        };
        expect(ser(p, registry))
            .toBe('<text:p><text:span text:style-name="T1">B</text:span></text:p>');
        // The registry was never asked for a name, so it materialises nothing.
        expect(registry.toAutomaticStyles()).toBeNull();
    });

    test('flags without ctx degrade to a plain span, value intact', () => {
        const p = {
            type: 'paragraph',
            runs: [{ type: 'span', value: 'B', bold: true, monospace: true }]
        };
        expect(ser(p)).toBe('<text:p><text:span>B</text:span></text:p>');
    });

    test('a foreign span styleName stays an opaque passthrough', () => {
        const src = '<text:p><text:span text:style-name="Foreign">x</text:span></text:p>';
        const resolver = reg.createResolver(
            { styles: [{ name: 'awa-t-b', family: 'text', properties: { text: { 'fo:font-weight': 'bold' } } }] },
            [], null);
        const withCtx = parse(src, resolver);
        expect(withCtx).toEqual(parse(src));
        expect(withCtx.runs[0]).toEqual({ type: 'span', value: 'x', styleName: 'Foreign' });
        expect(resolver.consumed.size).toBe(0);
    });

    test('falsification: a mutated property value defeats resolution (not name-based)', () => {
        const src = '<text:p><text:span text:style-name="awa-t-b">B</text:span></text:p>';
        const styleOf = weight => ({
            styles: [{
                name: 'awa-t-b', family: 'text',
                properties: { text: { 'fo:font-weight': weight } }
            }]
        });
        // Positive control — the honest value resolves.
        expect(parse(src, reg.createResolver(styleOf('bold'), [], null)).runs[0])
            .toEqual({ type: 'span', value: 'B', bold: true });
        // One mutated value and the same NAME no longer resolves.
        expect(parse(src, reg.createResolver(styleOf('bolder'), [], null)).runs[0])
            .toEqual({ type: 'span', value: 'B', styleName: 'awa-t-b' });
    });

    test('keep-and-gain (Ruling B): a named style keeps styleName AND gains flags', () => {
        const named = [xml.el('style:style', {
            'style:name': 'Emphasis',
            'style:family': 'text',
            'style:display-name': 'Emphasis'
        }, [xml.el('style:text-properties', { 'fo:font-style': 'italic' }, [])])];
        const resolver = reg.createResolver(null, [], named);
        const p = parse('<text:p><text:span text:style-name="Emphasis">i</text:span></text:p>', resolver);
        expect(p.runs[0]).toEqual({ type: 'span', value: 'i', styleName: 'Emphasis', italic: true });
        // Named styles are never consumed — styles.xml is left untouched.
        expect(resolver.consumed.size).toBe(0);

        // Write side re-emits the ORIGINAL binding and never allocates.
        let allocations = 0;
        const spy = { textStyle() { allocations++; return 'awa-t-i'; } };
        expect(ser(p, spy))
            .toBe('<text:p><text:span text:style-name="Emphasis">i</text:span></text:p>');
        expect(allocations).toBe(0);

        // …and re-reading the re-emitted span derives the same flags: idempotent.
        expect(parse(ser(p, spy), resolver)).toEqual(p);
    });
});

describe('textParagraph — link runs (GAP-ODF-4)', () => {
    test('renders the exact <text:a> element, inner runs in order', () => {
        const p = {
            type: 'paragraph',
            runs: [
                { type: 'text', value: 'see ' },
                {
                    type: 'link',
                    href: 'https://awa.example/doc#anchor',
                    runs: [
                        { type: 'span', value: 'here', styleName: 'T1' },
                        { type: 'text', value: ' now' }
                    ]
                },
                { type: 'text', value: '.' }
            ]
        };
        expect(ser(p)).toBe(
            '<text:p>see <text:a xlink:type="simple" xlink:href="https://awa.example/doc#anchor">'
            + '<text:span text:style-name="T1">here</text:span> now</text:a>.</text:p>');
        expect(parse(ser(p))).toEqual(p);
    });

    test('parses a missing href to the empty string', () => {
        const p = parse('<text:p><text:a>x</text:a></text:p>');
        expect(p.runs).toEqual([
            { type: 'link', href: '', runs: [{ type: 'text', value: 'x' }] }
        ]);
        expect(ser(p)).toBe('<text:p><text:a xlink:type="simple" xlink:href="">x</text:a></text:p>');
    });

    test('preserves every unknown attribute in _extras.attrs', () => {
        const src = '<text:p><text:a xlink:href="u" office:name="n" xlink:type="new">x</text:a></text:p>';
        const p = parse(src);
        expect(p.runs[0]._extras.attrs).toEqual({ 'office:name': 'n', 'xlink:type': 'new' });
        // Round-trip is byte-stable: the extras override the canonical defaults.
        expect(ser(p)).toBe(
            '<text:p><text:a xlink:type="new" xlink:href="u" office:name="n">x</text:a></text:p>');
        expect(parse(ser(p))).toEqual(p);
    });

    test('a nested text:a is preserved raw in the outer link _extras.children', () => {
        const p = parse('<text:p><text:a xlink:href="u">'
            + '<text:a xlink:href="v">inner</text:a>tail</text:a></text:p>');
        expect(p.runs).toHaveLength(1);
        expect(p.runs[0].href).toBe('u');
        expect(p.runs[0].runs).toEqual([{ type: 'text', value: 'tail' }]);
        expect(p.runs[0]._extras.children).toHaveLength(1);
        expect(p.runs[0]._extras.children[0].name).toBe('text:a');
        expect(p.runs[0]._extras.attrs).toBeUndefined();
    });

    test('a link body carries the full run vocabulary, flags included', () => {
        const registry = reg.createRegistry();
        const p = {
            type: 'paragraph',
            runs: [{
                type: 'link',
                href: 'u',
                runs: [
                    { type: 'span', value: 'B', bold: true },
                    { type: 'space', count: 2 },
                    { type: 'tab' },
                    { type: 'line-break' },
                    { type: 'text', value: 'z' }
                ]
            }]
        };
        const node = para.renderParagraph(p, registry);
        expect(xml.serializeNode(node)).toContain('<text:span text:style-name="awa-t-b">B</text:span>');
        const resolver = reg.createResolver(registry.toAutomaticStyles(), [], null);
        expect(para.parseParagraph(node, resolver)).toEqual(p);
    });

    test('textOf recurses into link runs', () => {
        const p = {
            type: 'paragraph',
            runs: [
                { type: 'text', value: 'a ' },
                { type: 'link', href: 'u', runs: [
                    { type: 'span', value: 'B' },
                    { type: 'tab' },
                    { type: 'text', value: 'c' }
                ] },
                { type: 'text', value: ' d' }
            ]
        };
        expect(para.textOf(p)).toBe('a B\tc d');
    });

    test('an unknown inline element still lands in the paragraph _extras', () => {
        const p = parse('<text:p>x<text:bookmark text:name="A"/>'
            + '<text:a xlink:href="u">y</text:a></text:p>');
        expect(p.runs.map(r => r.type)).toEqual(['text', 'link']);
        expect(p._extras.children[0].name).toBe('text:bookmark');
        // Unchanged pre-seam behaviour: paragraph extras are re-emitted last.
        expect(ser(p)).toBe('<text:p>x<text:a xlink:type="simple" xlink:href="u">y</text:a>'
            + '<text:bookmark text:name="A"/></text:p>');
    });
});

describe('textParagraph — image runs (write side)', () => {
    const IMG = { type: 'image', href: 'Pictures/a.png', width: '4cm', height: '3cm' };

    test('without a ctx sink an image run produces no element', () => {
        const p = { type: 'paragraph', runs: [
            { type: 'text', value: 'a' }, IMG, { type: 'text', value: 'b' }
        ] };
        const node = para.renderParagraph(p);
        expect(node.children.every(c => c.type === 'text')).toBe(true);
        expect(node.children.filter(c => c.value).map(c => c.value)).toEqual(['a', 'b']);
        expect(xml.serializeNode(node)).toBe('<text:p>ab</text:p>');
        // A registry ctx with no renderImage member degrades the same way.
        expect(ser(p, reg.createRegistry())).toBe('<text:p>ab</text:p>');
    });

    test('with a stub ctx.renderImage the returned node sits at the run position', () => {
        const seen = [];
        const ctx = {
            renderImage(r) { seen.push(r); return xml.el('draw:frame', { 'draw:name': 'stub' }, []); }
        };
        const p = { type: 'paragraph', runs: [
            { type: 'text', value: 'a' }, IMG, { type: 'text', value: 'b' }
        ] };
        const node = para.renderParagraph(p, ctx);
        expect(node.children.map(c => c.type === 'element' ? c.name : c.value))
            .toEqual(['a', 'draw:frame', 'b']);
        expect(seen).toEqual([IMG]);
        expect(xml.serializeNode(node)).toBe('<text:p>a<draw:frame draw:name="stub"/>b</text:p>');
    });

    test('textOf gives an image run no text', () => {
        const p = { type: 'paragraph', runs: [
            { type: 'text', value: 'Before ' }, IMG, { type: 'text', value: ' after' }
        ] };
        expect(para.textOf(p)).toBe('Before  after');
    });

    test('dependency pin unchanged', () => {
        expect(textParagraph.dependencies).toEqual(['xml']);
    });
});

describe('textParagraph — ctx-less callers stay bit-identical', () => {
    test('every pre-seam construct renders identically with and without a ctx', () => {
        const registry = reg.createRegistry();
        const p = {
            type: 'paragraph',
            styleName: 'P1',
            runs: [
                { type: 'text', value: 'A ' },
                { type: 'span', value: 'B', styleName: 'T1' },
                { type: 'tab' },
                { type: 'line-break' },
                { type: 'space', count: 3 }
            ]
        };
        expect(ser(p, registry)).toBe(ser(p));
        expect(registry.toAutomaticStyles()).toBeNull();
        expect(registry.toFontFaceDecls()).toBeNull();
    });

    test('parsing a pre-seam paragraph is identical with and without a resolver', () => {
        const src = '<text:p text:style-name="P1">A <text:span text:style-name="T1">B</text:span>'
            + '<text:s text:c="3"/><text:tab/><text:line-break/>C</text:p>';
        const resolver = reg.createResolver(null, [], null);
        expect(parse(src, resolver)).toEqual(parse(src));
    });
});

describe('textParagraph — end-to-end through odt.write/odt.read', () => {
    test('bold+italic span and a link survive a full .odt round-trip', () => {
        const runtime = odfRuntime();
        const odt = runtime.resolve('odt');
        const body = [{
            type: 'paragraph',
            runs: [
                { type: 'text', value: 'A ' },
                { type: 'span', value: 'B', bold: true, italic: true },
                { type: 'text', value: ' then ' },
                {
                    type: 'link',
                    href: 'https://awa.example/doc',
                    runs: [{ type: 'text', value: 'doc' }]
                }
            ]
        }];
        const bytes = odt.write({ body });
        const content = contentXmlOf(runtime, bytes);
        expect(content).toContain('<text:span text:style-name="awa-t-bi">B</text:span>');
        expect(content).toContain('<style:style style:name="awa-t-bi"');
        expect(content).toContain(
            '<text:a xlink:type="simple" xlink:href="https://awa.example/doc">doc</text:a>');

        const back = odt.read(bytes);
        expect(back.body).toEqual(body);
        // The generated automatic style was fully consumed on read.
        expect('autoStyles' in back).toBe(false);
        expect('fontFaces' in back).toBe(false);
    });

    test('monospace declares an office:font-face-decls face and resolves back (Ruling A)', () => {
        const runtime = odfRuntime();
        const odt = runtime.resolve('odt');
        const body = [{
            type: 'paragraph',
            runs: [{ type: 'span', value: 'code()', monospace: true }]
        }];
        const bytes = odt.write({ body });
        const content = contentXmlOf(runtime, bytes);
        expect(content).toContain('<office:font-face-decls>');
        expect(content).toContain('<style:font-face style:name="awa-mono"');
        expect(content).toContain('style:font-pitch="fixed"');
        expect(content).toContain('<text:span text:style-name="awa-t-m">code()</text:span>');

        const back = odt.read(bytes);
        expect(back.body).toEqual(body);
        expect('autoStyles' in back).toBe(false);
        expect('fontFaces' in back).toBe(false);
    });

    test('headings carry the same run vocabulary end-to-end', () => {
        const runtime = odfRuntime();
        const odt = runtime.resolve('odt');
        const body = [{
            type: 'heading',
            outlineLevel: 2,
            runs: [
                { type: 'span', value: 'Titled', strike: true },
                { type: 'link', href: 'u', runs: [{ type: 'text', value: 'ref' }] }
            ]
        }];
        const back = odt.read(odt.write({ body }));
        expect(back.body).toEqual(body);
    });
});

describe('textParagraph — paragraph attributes survive (_extras.attrs)', () => {
    const SRC = '<text:p text:style-name="P1" xml:id="id1" text:class-names="c1"'
        + ' text:cond-style-name="C1" loext:marker-style-name="M1">x</text:p>';

    test('every attribute but text:style-name lands in _extras.attrs, in read order', () => {
        const p = parse(SRC);
        expect(p).toEqual({
            type: 'paragraph',
            styleName: 'P1',
            runs: [{ type: 'text', value: 'x' }],
            _extras: { attrs: {
                'xml:id': 'id1',
                'text:class-names': 'c1',
                'text:cond-style-name': 'C1',
                'loext:marker-style-name': 'M1'
            } }
        });
        expect(Object.keys(p._extras.attrs)).toEqual(
            ['xml:id', 'text:class-names', 'text:cond-style-name', 'loext:marker-style-name']);
    });

    test('render emits the typed style name first, then _extras.attrs', () => {
        expect(ser(parse(SRC))).toBe(SRC);
    });

    test('parse -> render -> parse is deep-equal', () => {
        const once = parse(SRC);
        expect(para.parseParagraph(para.renderParagraph(once))).toEqual(once);
    });

    test('attributes and untyped children share one _extras object', () => {
        const src = '<text:p xml:id="p9">a<text:bookmark text:name="b"/></text:p>';
        const p = parse(src);
        expect(p._extras).toEqual({
            attrs: { 'xml:id': 'p9' },
            children: [{ type: 'element', name: 'text:bookmark',
                attrs: { 'text:name': 'b' }, children: [] }]
        });
        expect(ser(p)).toBe(src);
    });

    test('a paragraph with only a style name keeps the exact pre-existing shape', () => {
        expect(parse('<text:p text:style-name="P1">x</text:p>')).toEqual(
            { type: 'paragraph', styleName: 'P1', runs: [{ type: 'text', value: 'x' }] });
    });
});

describe('textParagraph — paragraph attributes through odt.read/odt.write', () => {
    const LOEXT = 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0';

    /** A minimal written .odt whose content.xml is replaced by `contentXml`. */
    function odtWithContent(runtime, contentXml) {
        const odt = runtime.resolve('odt');
        const pkg = runtime.resolve('pkgPackage');
        const p = pkg.read(odt.write(odt.empty()));
        p.parts['content.xml'] = new TextEncoder().encode(contentXml);
        return pkg.write(p);
    }

    test('extension attributes survive and their prefix is declared; list and cell paragraphs keep xml:id', () => {
        const runtime = odfRuntime();
        const odt = runtime.resolve('odt');
        const { ODF_NS } = runtime.resolve('odfShared');
        const source = '<?xml version="1.0" encoding="UTF-8"?>\n'
            + '<office:document-content'
            + ` xmlns:office="${ODF_NS.OFFICE}" xmlns:text="${ODF_NS.TEXT}"`
            + ` xmlns:table="${ODF_NS.TABLE}" xmlns:loext="${LOEXT}" office:version="1.3">`
            + '<office:body><office:text>'
            + '<text:p text:style-name="Standard" loext:marker-style-name="M1" xml:id="p1">x</text:p>'
            + '<text:list><text:list-item><text:p xml:id="li1">item</text:p></text:list-item></text:list>'
            + '<table:table table:name="T"><table:table-column/><table:table-row>'
            + '<table:table-cell><text:p xml:id="tc1">cell</text:p></table:table-cell>'
            + '</table:table-row></table:table>'
            + '</office:text></office:body></office:document-content>';
        const written = odt.write(odt.read(odtWithContent(runtime, source)));
        const content = contentXmlOf(runtime, written);
        expect(content).toContain(
            '<text:p text:style-name="Standard" loext:marker-style-name="M1" xml:id="p1">x</text:p>');
        expect(content).toContain(`xmlns:loext="${LOEXT}"`);
        expect(content).toContain('<text:p xml:id="li1">item</text:p>');
        expect(content).toContain('<text:p xml:id="tc1">cell</text:p>');
    });
});

describe('textParagraph — span markup kept positionally (runs)', () => {
    const FRAME = '<draw:frame draw:name="f1"><draw:text-box><text:p>Boxed</text:p></draw:text-box></draw:frame>';
    const CASES = {
        spacingAndFrame: `<text:p><text:span text:style-name="T1">B<text:s text:c="3"/>C${FRAME}</text:span></text:p>`,
        nested: '<text:p><text:span>a<text:span text:style-name="T2">b</text:span><text:tab/>c<text:line-break/>de</text:span></text:p>',
        linkInSpan: '<text:p><text:span>see <text:a xlink:type="simple" xlink:href="u">here</text:a></text:span></text:p>',
        attrs: '<text:p><text:span text:class-names="c1" xml:id="s1">plain</text:span></text:p>'
    };
    const span = src => parse(src).runs[0];

    test('spacing + frame: runs in document order, the frame raw at its position', () => {
        expect(span(CASES.spacingAndFrame)).toEqual({
            type: 'span', value: 'BCBoxed', styleName: 'T1',
            runs: [
                { type: 'text', value: 'B' },
                { type: 'space', count: 3 },
                { type: 'text', value: 'C' },
                xml.parse(FRAME)
            ]
        });
    });

    test('nested span + tab + line-break: the nested span is a span run of its own', () => {
        expect(span(CASES.nested)).toEqual({
            type: 'span', value: 'abcde',
            runs: [
                { type: 'text', value: 'a' },
                { type: 'span', value: 'b', styleName: 'T2' },
                { type: 'tab' },
                { type: 'text', value: 'c' },
                { type: 'line-break' },
                { type: 'text', value: 'de' }
            ]
        });
    });

    test('link in span: a link run exactly as at paragraph level', () => {
        expect(span(CASES.linkInSpan)).toEqual({
            type: 'span', value: 'see here',
            runs: [
                { type: 'text', value: 'see ' },
                { type: 'link', href: 'u', runs: [{ type: 'text', value: 'here' }] }
            ]
        });
    });

    test('span attributes other than text:style-name land in _extras.attrs; no runs without an element child', () => {
        expect(span(CASES.attrs)).toEqual({
            type: 'span', value: 'plain',
            _extras: { attrs: { 'text:class-names': 'c1', 'xml:id': 's1' } }
        });
    });

    test('value is the flattened character data, unchanged', () => {
        expect(span(CASES.spacingAndFrame).value).toBe('BCBoxed');
        expect(span(CASES.nested).value).toBe('abcde');
        expect(span(CASES.linkInSpan).value).toBe('see here');
        expect(span(CASES.attrs).value).toBe('plain');
    });

    test('parse -> render serializes back to the source markup', () => {
        for (const src of Object.values(CASES)) expect(ser(parse(src))).toBe(src);
    });

    test('parse -> render -> parse is deep-equal', () => {
        for (const src of Object.values(CASES)) {
            const once = parse(src);
            expect(para.parseParagraph(para.renderParagraph(once))).toEqual(once);
        }
    });

    test('a plain-text span keeps the exact pre-existing shape', () => {
        expect(span('<text:p><text:span text:style-name="T1">x</text:span></text:p>'))
            .toEqual({ type: 'span', value: 'x', styleName: 'T1' });
    });

    test('a nested span resolves its own automatic style through ctx and re-renders through ctx.textStyle', () => {
        const registry = reg.createRegistry();
        expect(registry.textStyle({ bold: true, italic: false, strike: false, monospace: false }))
            .toBe('awa-t-b');
        const resolver = reg.createResolver(registry.toAutomaticStyles(), [], null);
        const src = '<text:p><text:span>x<text:span text:style-name="awa-t-b">B</text:span></text:span></text:p>';
        const p = parse(src, resolver);
        expect(p.runs[0]).toEqual({
            type: 'span', value: 'xB',
            runs: [{ type: 'text', value: 'x' }, { type: 'span', value: 'B', bold: true }]
        });
        expect(ser(p, reg.createRegistry())).toBe(src);
    });

    test('inside a link, a nested text:a in a span is a raw element entry', () => {
        const inner = '<text:a xlink:href="v">y</text:a>';
        const p = parse(`<text:p><text:a xlink:type="simple" xlink:href="u"><text:span>x${inner}</text:span></text:a></text:p>`);
        expect(p.runs[0]).toEqual({
            type: 'link', href: 'u',
            runs: [{ type: 'span', value: 'xy',
                runs: [{ type: 'text', value: 'x' }, xml.parse(inner)] }]
        });
    });

    test('render ignores value when runs is an array; deleting runs restores the value path', () => {
        const p = parse(CASES.nested);
        p.runs[0].value = 'ignored';
        expect(ser(p)).toBe(CASES.nested);
        delete p.runs[0].runs;
        p.runs[0].value = 'replaced';
        expect(ser(p)).toBe('<text:p><text:span>replaced</text:span></text:p>');
    });

    test('textOf a span with runs is the text of its runs', () => {
        expect(para.textOf(parse(CASES.spacingAndFrame))).toBe('B   CBoxed');
        expect(para.textOf(parse(CASES.nested))).toBe('ab\tc\nde');
        expect(para.textOf(parse(CASES.linkInSpan))).toBe('see here');
        expect(para.textOf(parse(CASES.attrs))).toBe('plain');
    });
});
