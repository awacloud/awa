// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { textHeading } from './heading.js';
import { textParagraph } from './paragraph.js';
import { textStyleRegistry } from './style-registry.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const para = textParagraph.factory(xml);
    const h = textHeading.factory(xml, para);
    const reg = textStyleRegistry.factory(xml);
    return { xml, para, h, reg };
}

describe('textHeading module', () => {
    test('factory shape', () => {
        expect(textHeading.name).toBe('textHeading');
        expect(textHeading.dependencies).toEqual(['xml', 'textParagraph']);
        expect(typeof textHeading.factory).toBe('function');
    });

    describe('parseHeading', () => {
        test('extracts outline level', () => {
            const { xml, h } = build();
            const el = xml.parse('<text:h text:outline-level="2" text:style-name="H2">Title</text:h>');
            const hd = h.parseHeading(el);
            expect(hd.type).toBe('heading');
            expect(hd.outlineLevel).toBe(2);
            expect(hd.styleName).toBe('H2');
            expect(hd.runs[0].value).toBe('Title');
        });
        test('defaults missing level to 1', () => {
            const { xml, h } = build();
            const hd = h.parseHeading(xml.parse('<text:h>x</text:h>'));
            expect(hd.outlineLevel).toBe(1);
        });
    });

    describe('renderHeading', () => {
        test('roundtrip preserves level + style', () => {
            const { xml, h } = build();
            const hd = h.heading('Chap', { outlineLevel: 3, styleName: 'H3' });
            const node = h.renderHeading(hd);
            const out = xml.serialize(node);
            expect(out).toContain('<text:h');
            expect(out).toContain('text:outline-level="3"');
            expect(out).toContain('text:style-name="H3"');
            const back = h.parseHeading(xml.parse(out.replace(/^<\?xml[^?]*\?>\r?\n/, '')));
            expect(back.outlineLevel).toBe(3);
            expect(back.styleName).toBe('H3');
        });
    });

    describe('heading helper', () => {
        test('builds a one-run heading', () => {
            const { h } = build();
            const hd = h.heading('Hi');
            expect(hd.outlineLevel).toBe(1);
            expect(hd.runs).toHaveLength(1);
        });
    });
});

describe('textHeading — ctx pass-through', () => {
    test('renderHeading forwards the registry: flags become an automatic style', () => {
        const { xml, h, reg } = build();
        const registry = reg.createRegistry();
        const hd = {
            type: 'heading',
            outlineLevel: 2,
            runs: [{ type: 'span', value: 'T', bold: true }]
        };
        const node = h.renderHeading(hd, registry);
        expect(xml.serializeNode(node)).toBe(
            '<text:h text:outline-level="2">'
            + '<text:span text:style-name="awa-t-b">T</text:span></text:h>');
        expect(registry.toAutomaticStyles().styles[0].name).toBe('awa-t-b');
    });

    test('parseHeading forwards the resolver: the same flags come back', () => {
        const { h, reg } = build();
        const registry = reg.createRegistry();
        const hd = {
            type: 'heading',
            outlineLevel: 2,
            runs: [{ type: 'span', value: 'T', bold: true }]
        };
        const node = h.renderHeading(hd, registry);
        const resolver = reg.createResolver(registry.toAutomaticStyles(), [], null);
        expect(h.parseHeading(node, resolver)).toEqual(hd);
    });

    test('link runs pass through headings untouched', () => {
        const { xml, h } = build();
        const hd = {
            type: 'heading',
            outlineLevel: 1,
            runs: [{ type: 'link', href: 'u', runs: [{ type: 'text', value: 'x' }] }]
        };
        const out = xml.serializeNode(h.renderHeading(hd));
        expect(out).toBe('<text:h text:outline-level="1">'
            + '<text:a xlink:type="simple" xlink:href="u">x</text:a></text:h>');
        expect(h.parseHeading(xml.parse(out))).toEqual(hd);
    });

    test('without a ctx a flagged run degrades to a plain span (ctx-less callers)', () => {
        const { xml, h } = build();
        const hd = {
            type: 'heading',
            outlineLevel: 1,
            runs: [{ type: 'span', value: 'T', bold: true }]
        };
        expect(xml.serializeNode(h.renderHeading(hd)))
            .toBe('<text:h text:outline-level="1"><text:span>T</text:span></text:h>');
    });
});

describe('textHeading — heading attributes survive (_extras.attrs)', () => {
    const SRC = '<text:h text:style-name="H2" text:outline-level="2"'
        + ' text:is-list-header="true" xml:id="h1">T</text:h>';

    test('outline level is typed once; other attributes land in _extras.attrs', () => {
        const { xml, h } = build();
        const hd = h.parseHeading(xml.parse(SRC));
        expect(hd).toEqual({
            type: 'heading',
            styleName: 'H2',
            outlineLevel: 2,
            runs: [{ type: 'text', value: 'T' }],
            _extras: { attrs: { 'text:is-list-header': 'true', 'xml:id': 'h1' } }
        });
        expect('text:outline-level' in hd._extras.attrs).toBe(false);
    });

    test('render keeps all three attributes; parse -> render -> parse is deep-equal', () => {
        const { xml, h } = build();
        const hd = h.parseHeading(xml.parse(SRC));
        const out = xml.serializeNode(h.renderHeading(hd));
        expect(out).toContain('text:outline-level="2"');
        expect(out).toContain('text:is-list-header="true"');
        expect(out).toContain('xml:id="h1"');
        expect(out).toContain('text:style-name="H2"');
        expect(h.parseHeading(xml.parse(out))).toEqual(hd);
    });

    test('a changed outlineLevel wins on render', () => {
        const { xml, h } = build();
        const hd = h.parseHeading(xml.parse(SRC));
        hd.outlineLevel = 4;
        const out = xml.serializeNode(h.renderHeading(hd));
        expect(out).toContain('text:outline-level="4"');
        expect(out).not.toContain('text:outline-level="2"');
    });

    test('a heading carrying only style name and level keeps the pre-existing shape', () => {
        const { xml, h } = build();
        const hd = h.parseHeading(xml.parse('<text:h text:style-name="H2" text:outline-level="2">T</text:h>'));
        expect(hd).toEqual({ type: 'heading', styleName: 'H2', outlineLevel: 2,
            runs: [{ type: 'text', value: 'T' }] });
    });
});
