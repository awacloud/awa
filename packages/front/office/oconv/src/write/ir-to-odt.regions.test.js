// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T80 (D58 A, a): the odt writer's headers and footers (the
 * master page `Standard`'s `style:header`, `-left`, `-first` and the
 * footers') and its page fields (`text:page-number`, `text:page-count`).
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as odfFwRequire, modules as odfModules } from '@awacloud/odf';
import { oconvIr } from '../ir/ir.js';
import { oconvIrToOdt } from './ir-to-odt.js';

const runtime = new ModuleRuntime();
for (const m of odfFwRequire) runtime.register(m);
for (const m of odfModules) runtime.register(m);
runtime.register(oconvIr);
runtime.register(oconvIrToOdt);

const { irToOdt } = runtime.resolve('oconvIrToOdt');
const odt = runtime.resolve('odt');
const zipApi = runtime.resolve('zip');
const xmlApi = runtime.resolve('xml');
const { node, doc } = oconvIr.factory();

const PNG = new Uint8Array(readFileSync(fileURLToPath(new URL('../../tests/_fixtures/corpus/assets/px.png', import.meta.url))));

const partText = (bytes, name) => new TextDecoder().decode(zipApi.unzipSync(bytes)[name]);
const partXml = (bytes, name) => xmlApi.parse(partText(bytes, name));
const para = (text, props) => node('paragraph', props || {}, [node('run', { text })]);
const PAGE = { width: 595.3, height: 841.9, orientation: 'portrait', margins: null };

/** Every descendant element of `root` named `name`, document order. */
function descendants(root, name, out = []) {
    for (const c of (root && root.children) || []) {
        if (c.type !== 'element') continue;
        if (c.name === name) out.push(c);
        descendants(c, name, out);
    }
    return out;
}

/** The text of an element's tree. */
function textOf(el) {
    let s = '';
    for (const c of (el && el.children) || []) s += c.type === 'text' ? c.value : textOf(c);
    return s;
}

/** The master page `Standard` of the written `styles.xml`. */
function standard(bytes) {
    return descendants(partXml(bytes, 'styles.xml'), 'style:master-page').find((m) => m.attrs['style:name'] === 'Standard');
}

describe('oconvIrToOdt — headers and footers (T80)', () => {
    test('the slots are written in the master page Standard, in the schema order, with their text', () => {
        const header = { default: [para('Head', { align: 'center' })], first: [], even: [para('Even')] };
        const footer = {
            default: [node('paragraph', {}, [node('run', { text: 'Page ' }), node('field', { name: 'page', text: '3' }),
                node('run', { text: ' of ' }), node('field', { name: 'pages', text: '9' })])],
            first: null, even: null
        };
        const { bytes, losses } = irToOdt(doc([para('Body')], { page: PAGE, header, footer }));
        expect(losses).toEqual([]);
        const mp = standard(bytes);
        const kids = mp.children.filter((c) => c.type === 'element');
        expect(kids.map((c) => c.name)).toEqual(['style:header', 'style:header-left', 'style:header-first', 'style:footer']);
        expect(kids.map(textOf)).toEqual(['Head', 'Even', '', 'Page 3 of 9']);
        expect(odt.read(bytes).body.map((b) => b.runs)).toEqual([[{ type: 'text', value: 'Body' }]]);
    });

    test('odf reads the regions back with headerFooterContent', () => {
        const header = { default: [para('Top')], first: null, even: null };
        const { bytes } = irToOdt(doc([para('Body')], { page: PAGE, header }));
        const read = odt.read(bytes, { headerFooterContent: true });
        const mp = read.styles.masterStyles.find((m) => m.name === 'style:master-page');
        const h = mp.children.find((c) => c.name === 'style:header');
        expect(h.content.map((b) => b.runs)).toEqual([[{ type: 'text', value: 'Top' }]]);
    });

    test('a field writes text:page-number (current) or text:page-count, holding its text', () => {
        const footer = { default: [node('paragraph', {}, [node('field', { name: 'page', text: '1' }), node('run', { text: '/' }), node('field', { name: 'pages', text: '' })])], first: null, even: null };
        const { bytes } = irToOdt(doc([node('paragraph', {}, [node('field', { name: 'page', text: '7' })])], { page: PAGE, footer }));
        const f = standard(bytes).children.find((c) => c.name === 'style:footer');
        const pn = descendants(f, 'text:page-number');
        expect(pn.map((e) => [e.attrs['text:select-page'], textOf(e)])).toEqual([['current', '1']]);
        expect(descendants(f, 'text:page-count').map(textOf)).toEqual(['']);
        const body = descendants(partXml(bytes, 'content.xml'), 'text:page-number');
        expect(body.map((e) => [e.attrs['text:select-page'], textOf(e)])).toEqual([['current', '7']]);
    });

    test("a slot's alignment and run values are styles.xml automatic styles MP<n> and MT<n>", () => {
        const header = { default: [node('paragraph', { align: 'end' }, [node('run', { text: 'Small', size: 8 })])], first: null, even: null };
        const { bytes } = irToOdt(doc([para('Body', { align: 'center' })], { page: PAGE, header }));
        const autos = (name) => descendants(partXml(bytes, name), 'office:automatic-styles')[0];
        const styleNames = (name) => descendants(autos(name), 'style:style').map((s) => s.attrs['style:name']);
        expect(styleNames('styles.xml').sort()).toEqual(['MP1', 'MT1']);
        expect(styleNames('content.xml')).toEqual(['P1']);
        const mp1 = descendants(autos('styles.xml'), 'style:style').find((s) => s.attrs['style:name'] === 'MP1');
        expect(descendants(mp1, 'style:paragraph-properties')[0].attrs['fo:text-align']).toBe('end');
        const h = standard(bytes).children.find((c) => c.name === 'style:header');
        const p = descendants(h, 'text:p')[0];
        expect(p.attrs['text:style-name']).toBe('MP1');
        expect(descendants(p, 'text:span')[0].attrs['text:style-name']).toBe('MT1');
    });

    test('a region without a page writes the page layout pm1 with no properties', () => {
        const footer = { default: [para('f')], first: null, even: null };
        const { bytes } = irToOdt(doc([para('Body')], { footer }));
        const layouts = descendants(partXml(bytes, 'styles.xml'), 'style:page-layout');
        expect(layouts.map((l) => [l.attrs['style:name'], descendants(l, 'style:page-layout-properties').length])).toEqual([['pm1', 0]]);
        const mp = standard(bytes);
        expect(mp.attrs['style:page-layout-name']).toBe('pm1');
        expect(mp.children.filter((c) => c.type === 'element').map((c) => c.name)).toEqual(['style:footer']);
    });

    test("a slot's image is placed in Pictures/, its frame name unique across the document", () => {
        const header = { default: [node('paragraph', {}, [node('image', { name: 'logo', alt: '' })])], first: null, even: null };
        const { bytes, losses } = irToOdt(doc([node('image', { name: 'logo', alt: '' })], { page: PAGE, header }), { assets: { logo: PNG } });
        expect(losses).toEqual([]);
        const files = Object.keys(zipApi.unzipSync(bytes)).filter((p) => p.startsWith('Pictures/'));
        expect(files).toEqual(['Pictures/image1.png']);
        const bodyFrames = descendants(partXml(bytes, 'content.xml'), 'draw:frame');
        const headFrames = descendants(standard(bytes), 'draw:frame');
        expect([...bodyFrames, ...headFrames].map((f) => f.attrs['draw:name'])).toEqual(['logo', 'logo (2)']);
        expect(descendants(headFrames[0], 'draw:image')[0].attrs['xlink:href']).toBe('Pictures/image1.png');
    });
});

describe('oconvIrToOdt — a field is styled as a run is (T80, amended)', () => {
    test('a sized, bold field is written inside its flags span and its T<n> span', () => {
        const { bytes } = irToOdt(doc([node('paragraph', {}, [node('field', { text: '5', bold: true, size: 9 })])]));
        const pn = descendants(partXml(bytes, 'content.xml'), 'text:page-number');
        expect(pn).toHaveLength(1);
        const spans = descendants(partXml(bytes, 'content.xml'), 'text:span');
        const sized = spans.find((s) => s.attrs['text:style-name'] === 'T1');
        expect(sized).toBeDefined();
        expect(descendants(sized, 'text:page-number')).toHaveLength(1);
        const t1 = descendants(partXml(bytes, 'content.xml'), 'style:style').find((s) => s.attrs['style:name'] === 'T1');
        expect(descendants(t1, 'style:text-properties')[0].attrs['fo:font-size']).toBe('9pt');
        expect(spans.length).toBe(2);
    });
});
