// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { markupCompatibility } from './markupCompatibility.js';

const xml = ooxmlXml.factory();
const mc = markupCompatibility.factory(xml);

describe('markupCompatibility — AlternateContent resolution', () => {
    test('selects Fallback when no Choice prefix is supported', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14"><w14:thing/></mc:Choice>'
            + '<mc:Fallback><plain/></mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</root>');
        mc.process(root);
        expect(root.children).toHaveLength(1);
        expect(root.children[0].name).toBe('plain');
    });

    test('selects Choice when its prefix is supported', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14"><w14:special/></mc:Choice>'
            + '<mc:Fallback><plain/></mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</root>');
        mc.process(root, { supportedPrefixes: ['w14'] });
        expect(root.children).toHaveLength(1);
        expect(root.children[0].name).toBe('w14:special');
    });

    test('picks the first matching Choice', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14"><w14:a/></mc:Choice>'
            + '<mc:Choice Requires="w15"><w15:b/></mc:Choice>'
            + '<mc:Fallback><plain/></mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</root>');
        mc.process(root, { supportedPrefixes: ['w14', 'w15'] });
        expect(root.children[0].name).toBe('w14:a');
    });

    test('Choice requiring multiple prefixes — all must match', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14 w16"><w16:wow/></mc:Choice>'
            + '<mc:Fallback><plain/></mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</root>');
        mc.process(root, { supportedPrefixes: ['w14'] });
        // w16 not supported → Fallback selected.
        expect(root.children[0].name).toBe('plain');
    });

    test('AlternateContent with no Fallback and no matching Choice → empty', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<keepme/>'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="w14"><w14:thing/></mc:Choice>'
            + '</mc:AlternateContent>'
            + '<andme/>'
            + '</root>');
        mc.process(root);
        expect(root.children.map(c => c.name)).toEqual(['keepme', 'andme']);
    });

    test('preserveAlternateContent leaves the wrapper untouched', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<mc:AlternateContent>'
            + '<mc:Fallback><plain/></mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</root>');
        mc.process(root, { preserveAlternateContent: true });
        expect(root.children[0].name).toBe('mc:AlternateContent');
    });

    test('nested AlternateContent inside Fallback gets resolved', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<mc:AlternateContent>'
            + '<mc:Choice Requires="missing"><x/></mc:Choice>'
            + '<mc:Fallback>'
            +   '<mc:AlternateContent>'
            +     '<mc:Fallback><inner/></mc:Fallback>'
            +   '</mc:AlternateContent>'
            + '</mc:Fallback>'
            + '</mc:AlternateContent>'
            + '</root>');
        mc.process(root);
        expect(root.children).toHaveLength(1);
        expect(root.children[0].name).toBe('inner');
    });
});

describe('markupCompatibility — Ignorable', () => {
    test('drops elements from prefixes listed in mc:Ignorable', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + '      mc:Ignorable="w14">'
            + '<keep/><w14:drop/><w14:also-drop/>'
            + '</root>');
        mc.process(root);
        expect(root.attrs['mc:Ignorable']).toBeUndefined();
        expect(root.children.map(c => c.name)).toEqual(['keep']);
    });

    test('strips Ignorable-namespaced attributes', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + '      mc:Ignorable="w14"'
            + '      w14:foo="bar" plain="kept"/>');
        mc.process(root);
        expect(root.attrs['w14:foo']).toBeUndefined();
        expect(root.attrs.plain).toBe('kept');
    });

    test('does not drop elements when prefix is in supportedPrefixes', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + '      mc:Ignorable="w14">'
            + '<w14:keep/>'
            + '</root>');
        mc.process(root, { supportedPrefixes: ['w14'] });
        expect(root.children[0].name).toBe('w14:keep');
    });

    test('Ignorable scope inherits down the tree', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + '      mc:Ignorable="w14">'
            + '<inner><w14:drop-me/></inner>'
            + '</root>');
        mc.process(root);
        expect(root.children[0].children).toEqual([]);
    });

    test('mc:ProcessContent unwraps content of an ignored element', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + '      mc:Ignorable="w14"'
            + '      mc:ProcessContent="w14:wrapper">'
            + '<w14:wrapper><kept/></w14:wrapper>'
            + '</root>');
        mc.process(root);
        // <w14:wrapper> is dropped but its <kept> child surfaces to the parent.
        expect(root.children.map(c => c.name)).toEqual(['kept']);
    });
});

describe('markupCompatibility — keepElements', () => {
    const DOC = '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
        + ' mc:Ignorable="w15" w15:rootAttr="x">'
        + '<w15:keep w15:flag="1" plain="p">'
        +   '<w15:child w:val="Rows"><w15:grand/></w15:child>'
        + '</w15:keep>'
        + '<w15:other><w15:inner/></w15:other>'
        + '<plain><w15:keep/><w15:drop/></plain>'
        + '</root>';

    test('a listed element survives under mc:Ignorable with its attributes and descendants', () => {
        const root = xml.parse(DOC);
        mc.process(root, { keepElements: ['w15:keep'] });
        const kept = root.children[0];
        expect(kept.name).toBe('w15:keep');
        expect(kept.attrs).toEqual({ 'w15:flag': '1', plain: 'p' });
        expect(kept.children[0].name).toBe('w15:child');
        expect(kept.children[0].attrs['w:val']).toBe('Rows');
        expect(kept.children[0].children[0].name).toBe('w15:grand');
        // Nested occurrence under a non-ignorable parent: kept too.
        expect(root.children[1].name).toBe('plain');
        expect(root.children[1].children.map(c => c.name)).toEqual(['w15:keep']);
    });

    test('a non-listed sibling of the same prefix is still dropped', () => {
        const root = xml.parse(DOC);
        mc.process(root, { keepElements: ['w15:keep'] });
        expect(root.children.map(c => c.name)).toEqual(['w15:keep', 'plain']);
        expect(root.attrs['w15:rootAttr']).toBeUndefined();
        expect(root.attrs['mc:Ignorable']).toBeUndefined();
    });

    test('keepElements absent or empty: output identical to the default processing', () => {
        const baseline = xml.parse(DOC);
        mc.process(baseline);
        const empty = xml.parse(DOC);
        mc.process(empty, { keepElements: [] });
        const other = xml.parse(DOC);
        mc.process(other, { supportedPrefixes: [] });
        // Literal captured from the module before the option existed.
        const before = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
            + '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            + '<plain/></root>';
        expect(xml.serialize(baseline)).toBe(before);
        expect(xml.serialize(empty)).toBe(before);
        expect(xml.serialize(other)).toBe(before);
    });

    test('mc constructs inside a kept element are still resolved', () => {
        const root = xml.parse(
            '<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
            + ' mc:Ignorable="w15">'
            + '<w15:keep><mc:AlternateContent>'
            +   '<mc:Choice Requires="w16"><w16:x/></mc:Choice>'
            +   '<mc:Fallback><w15:fallback/></mc:Fallback>'
            + '</mc:AlternateContent></w15:keep>'
            + '</root>');
        mc.process(root, { keepElements: ['w15:keep'] });
        expect(root.children[0].children.map(c => c.name)).toEqual(['w15:fallback']);
    });
});

describe('markupCompatibility — wrapAlternateContent', () => {
    test('builds a complete AlternateContent wrapper', () => {
        const wrapper = mc.wrapAlternateContent({
            choices: [{
                requires: 'w14',
                element: xml.el('w14:special', { val: '1' })
            }],
            fallback: xml.el('plain', {})
        });
        expect(wrapper.name).toBe('mc:AlternateContent');
        expect(wrapper.children[0].name).toBe('mc:Choice');
        expect(wrapper.children[0].attrs.Requires).toBe('w14');
        expect(wrapper.children[0].children[0].name).toBe('w14:special');
        expect(wrapper.children[1].name).toBe('mc:Fallback');
    });

    test('multiple choices + array of fallback elements', () => {
        const wrapper = mc.wrapAlternateContent({
            choices: [
                { requires: 'w14', element: xml.el('w14:a') },
                { requires: 'w15', element: xml.el('w15:b') }
            ],
            fallback: [xml.el('p1'), xml.el('p2')]
        });
        expect(wrapper.children).toHaveLength(3);
        expect(wrapper.children[2].children.map(c => c.name)).toEqual(['p1', 'p2']);
    });
});

describe('markupCompatibility — setIgnorable', () => {
    test('adds xmlns:mc + mc:Ignorable to a root element', () => {
        const root = xml.el('root');
        mc.setIgnorable(root, ['w14', 'w15']);
        expect(root.attrs['xmlns:mc']).toBe(mc.MC_NS);
        expect(root.attrs['mc:Ignorable']).toBe('w14 w15');
    });

    test('merges with existing mc:Ignorable', () => {
        const root = xml.el('root', {
            'xmlns:mc': mc.MC_NS,
            'mc:Ignorable': 'w14'
        });
        mc.setIgnorable(root, 'w15');
        expect(root.attrs['mc:Ignorable'].split(/\s+/).sort())
            .toEqual(['w14', 'w15']);
    });
});
