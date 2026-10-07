// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { textStyleRegistry } from './style-registry.js';

function build() {
    const xml = fwXml.factory();
    return { xml, reg: textStyleRegistry.factory(xml), auto: styleAutomatic.factory(xml) };
}

/** All 15 non-empty emphasis combinations, with their canonical suffix. */
const FLAGS = ['bold', 'italic', 'strike', 'monospace'];
const LETTER = { bold: 'b', italic: 'i', strike: 's', monospace: 'm' };
const COMBOS = [];
for (let mask = 1; mask < 16; mask++) {
    const on = FLAGS.filter((_, i) => mask & (1 << i));
    const flags = {};
    for (const f of on) flags[f] = true;
    COMBOS.push({ flags, on, suffix: on.map(f => LETTER[f]).join('') });
}

function el(xml, name, attrs, children) { return xml.el(name, attrs, children || []); }

function namedStyle(xml, attrs, textAttrs) {
    const kids = textAttrs ? [el(xml, 'style:text-properties', textAttrs)] : [];
    return el(xml, 'style:style', attrs, kids);
}

/** The label-alignment indent per list level 1..10 (BL-1799). */
const LEVEL_ML = ['1.27cm', '1.905cm', '2.54cm', '3.175cm', '3.81cm',
    '4.445cm', '5.08cm', '5.715cm', '6.35cm', '6.985cm'];

function levelProps(ml) {
    return {
        type: 'element', name: 'style:list-level-properties',
        attrs: { 'text:list-level-position-and-space-mode': 'label-alignment' },
        children: [{
            type: 'element', name: 'style:list-level-label-alignment',
            attrs: {
                'text:label-followed-by': 'listtab',
                'text:list-tab-stop-position': ml,
                'fo:text-indent': '-0.635cm',
                'fo:margin-left': ml
            },
            children: []
        }]
    };
}

const MONO_FACE_ATTRS = {
    'style:name': 'awa-mono',
    'svg:font-family': 'monospace',
    'style:font-family-generic': 'modern',
    'style:font-pitch': 'fixed'
};

describe('textStyleRegistry module', () => {
    test('should have correct module metadata', () => {
        expect(textStyleRegistry.name).toBe('textStyleRegistry');
        expect(textStyleRegistry.dependencies).toEqual(['xml']);
        expect(typeof textStyleRegistry.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const { reg } = build();
            expect(typeof reg.createRegistry).toBe('function');
            expect(typeof reg.createResolver).toBe('function');
        });

        test('registry exposes the frozen write surface', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            // Re-pinned by office/BATCH_48/01: the grid seam adds
            // cellStyle/tableStyle (exhaustive pin kept).
            expect(Object.keys(r).sort()).toEqual(
                ['cellStyle', 'listStyle', 'tableStyle', 'textStyle',
                    'toAutomaticStyles', 'toFontFaceDecls']);
        });

        test('resolver exposes the frozen read surface', () => {
            const { reg } = build();
            const r = reg.createResolver(null, [], null);
            expect(typeof r.textFlags).toBe('function');
            expect(typeof r.listNumbering).toBe('function');
            expect(r.consumed).toBeInstanceOf(Set);
        });
    });

    // ------------------------------------------------------------------
    describe('textStyle', () => {
        test('is deterministic for every flag combination', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            for (const c of COMBOS) {
                expect(r.textStyle(c.flags)).toBe(`awa-t-${c.suffix}`);
            }
        });

        test('is order-independent and deduplicated', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            const a = r.textStyle({ bold: true, italic: true });
            const b = r.textStyle({ italic: true, bold: true });
            const c = r.textStyle({ italic: true, bold: true, strike: false });
            expect(a).toBe('awa-t-bi');
            expect(b).toBe(a);
            expect(c).toBe(a);
        });

        test('suffixes on collision with a reserved style name', () => {
            const { reg } = build();
            const r = reg.createRegistry({ styles: new Set(['awa-t-b', 'awa-t-b-2']) });
            expect(r.textStyle({ bold: true })).toBe('awa-t-b-3');
            expect(r.textStyle({ bold: true })).toBe('awa-t-b-3');
            expect(r.textStyle({ italic: true })).toBe('awa-t-i');
        });
    });

    describe('listStyle', () => {
        test('names ordered and bullet styles deterministically', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            expect(r.listStyle({ ordered: true })).toBe('awa-l-n1');
            expect(r.listStyle({ ordered: true, numFormat: '1' })).toBe('awa-l-n1');
            expect(r.listStyle({ ordered: true, numFormat: 'a' })).toBe('awa-l-na');
            expect(r.listStyle({ ordered: true, numFormat: 'I' })).toBe('awa-l-nI');
            expect(r.listStyle({ ordered: false })).toBe('awa-l-b');
            expect(r.listStyle({ ordered: false })).toBe('awa-l-b');
        });

        test('suffixes on collision with a reserved style name', () => {
            const { reg } = build();
            const r = reg.createRegistry({ styles: new Set(['awa-l-b']) });
            expect(r.listStyle({ ordered: false })).toBe('awa-l-b-2');
        });
    });

    // ------------------------------------------------------------------
    describe('toAutomaticStyles', () => {
        test('returns null when nothing was requested', () => {
            const { reg } = build();
            expect(reg.createRegistry().toAutomaticStyles()).toBeNull();
        });

        test('emits the exact style:style bag per flag', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ bold: true });
            r.textStyle({ italic: true });
            r.textStyle({ strike: true });
            r.textStyle({ monospace: true });
            expect(r.toAutomaticStyles()).toEqual({
                styles: [
                    { name: 'awa-t-b', family: 'text', properties: { text: { 'fo:font-weight': 'bold' } } },
                    { name: 'awa-t-i', family: 'text', properties: { text: { 'fo:font-style': 'italic' } } },
                    { name: 'awa-t-s', family: 'text', properties: { text: { 'style:text-line-through-style': 'solid' } } },
                    { name: 'awa-t-m', family: 'text', properties: { text: { 'style:font-name': 'awa-mono' } } }
                ]
            });
        });

        test('combined flags land in one bag, in b/i/s/m order', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ bold: true, italic: true, strike: true, monospace: true });
            const bag = r.toAutomaticStyles().styles[0].properties.text;
            expect(Object.keys(bag)).toEqual([
                'fo:font-weight', 'fo:font-style',
                'style:text-line-through-style', 'style:font-name']);
        });

        test('list styles are raw elements with levels 1..10', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.listStyle({ ordered: true, numFormat: 'a' });
            r.listStyle({ ordered: false });
            const model = r.toAutomaticStyles();
            expect(model.styles).toEqual([]);
            const kids = model._extras.children;
            expect(kids).toHaveLength(2);

            expect(kids[0].name).toBe('text:list-style');
            expect(kids[0].attrs).toEqual({ 'style:name': 'awa-l-na' });
            expect(kids[0].children).toHaveLength(10);
            // Re-pinned by office/BATCH_48/01 (BL-1799 odt share): every
            // level now carries exactly one label-alignment
            // style:list-level-properties child.
            kids[0].children.forEach((lvl, i) => {
                expect(lvl).toEqual({
                    type: 'element', name: 'text:list-level-style-number',
                    attrs: { 'text:level': String(i + 1), 'style:num-format': 'a', 'style:num-suffix': '.' },
                    children: [levelProps(LEVEL_ML[i])]
                });
            });
            expect(kids[0].children[9].attrs['text:level']).toBe('10');

            kids[1].children.forEach((lvl, i) => {
                expect(lvl).toEqual({
                    type: 'element', name: 'text:list-level-style-bullet',
                    attrs: { 'text:level': String(i + 1), 'text:bullet-char': '•' },
                    children: [levelProps(LEVEL_ML[i])]
                });
            });
            expect(kids[1].children.map(c => c.attrs['text:level']))
                .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
        });
    });

    describe('toFontFaceDecls', () => {
        test('is null while no monospace style was requested', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ bold: true, italic: true, strike: true });
            r.listStyle({ ordered: true });
            expect(r.toFontFaceDecls()).toBeNull();
        });

        test('declares one face as soon as monospace is requested', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ monospace: true });
            expect(r.toFontFaceDecls()).toEqual({
                type: 'element', name: 'office:font-face-decls', attrs: {},
                children: [{
                    type: 'element', name: 'style:font-face',
                    attrs: MONO_FACE_ATTRS, children: []
                }]
            });
        });

        test('suffixes the face name on collision with a reserved face', () => {
            const { reg } = build();
            const r = reg.createRegistry({ fontFaces: new Set(['awa-mono', 'awa-mono-2']) });
            const name = r.textStyle({ monospace: true });
            expect(r.toFontFaceDecls().children[0].attrs['style:name']).toBe('awa-mono-3');
            expect(r.toAutomaticStyles().styles[0].properties.text['style:font-name'])
                .toBe('awa-mono-3');
            expect(name).toBe('awa-t-m');
        });
    });

    // ------------------------------------------------------------------
    describe('round-trip registry → resolver', () => {
        test('recovers every emphasis combination from the auto styles', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            const names = COMBOS.map(c => r.textStyle(c.flags));
            const decls = r.toFontFaceDecls();
            const res = reg.createResolver(r.toAutomaticStyles(), decls.children, null);
            COMBOS.forEach((c, i) => {
                expect(res.textFlags(names[i])).toEqual({ ...c.flags, source: 'auto' });
            });
            expect([...res.consumed].sort()).toEqual([...names].sort());
        });

        test('recovers list numbering from the emitted list styles', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            const ordered = r.listStyle({ ordered: true, numFormat: 'I' });
            const bullet = r.listStyle({ ordered: false });
            const res = reg.createResolver(r.toAutomaticStyles(), [], null);
            expect(res.listNumbering(ordered)).toEqual({ ordered: true, numFormat: 'I', source: 'auto' });
            expect(res.listNumbering(bullet)).toEqual({ ordered: false, source: 'auto' });
            expect([...res.consumed].sort()).toEqual(['awa-l-b', 'awa-l-nI']);
        });

        test('consumed stays empty until something resolves', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ bold: true });
            const res = reg.createResolver(r.toAutomaticStyles(), [], null);
            expect([...res.consumed]).toEqual([]);
            expect(res.textFlags('nope')).toBeNull();
            expect([...res.consumed]).toEqual([]);
            res.textFlags('awa-t-b');
            expect([...res.consumed]).toEqual(['awa-t-b']);
        });
    });

    // ------------------------------------------------------------------
    describe('textFlags — the honesty rule', () => {
        function resolverFor(styleEl, faces) {
            const { xml, reg, auto } = build();
            void xml;
            const model = auto.parse({ type: 'element', name: 'office:automatic-styles', attrs: {}, children: [styleEl] });
            return reg.createResolver(model, faces || [], null);
        }

        test('rejects a non-text family', () => {
            const { xml } = build();
            const res = resolverFor(namedStyle(xml,
                { 'style:name': 'P1', 'style:family': 'paragraph' },
                { 'fo:font-weight': 'bold' }));
            expect(res.textFlags('P1')).toBeNull();
            expect([...res.consumed]).toEqual([]);
        });

        test('rejects a style with a parent-style-name', () => {
            const { xml } = build();
            const res = resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text', 'style:parent-style-name': 'Base' },
                { 'fo:font-weight': 'bold' }));
            expect(res.textFlags('T1')).toBeNull();
        });

        test('rejects an unknown attribute in the text bag', () => {
            const { xml } = build();
            const res = resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' },
                { 'fo:font-weight': 'bold', 'fo:color': '#ff0000' }));
            expect(res.textFlags('T1')).toBeNull();
        });

        test('rejects a numeric font-weight', () => {
            const { xml } = build();
            const res = resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' },
                { 'fo:font-weight': '600' }));
            expect(res.textFlags('T1')).toBeNull();
        });

        test('rejects line-through-style "none" and accepts other values', () => {
            const { xml } = build();
            expect(resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' },
                { 'style:text-line-through-style': 'none' })).textFlags('T1')).toBeNull();
            expect(resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' },
                { 'style:text-line-through-style': 'dash' })).textFlags('T1'))
                .toEqual({ strike: true, source: 'auto' });
        });

        test('rejects an empty text bag and a style with no properties', () => {
            const { xml } = build();
            expect(resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' }, {})).textFlags('T1')).toBeNull();
            expect(resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' })).textFlags('T1')).toBeNull();
        });

        test('rejects an unknown attribute on the style element itself', () => {
            const { xml } = build();
            const res = resolverFor(namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text', 'style:list-style-name': 'L1' },
                { 'fo:font-weight': 'bold' }));
            expect(res.textFlags('T1')).toBeNull();
        });

        test('returns null for an unknown style name and for a falsy name', () => {
            const { reg } = build();
            const res = reg.createResolver(null, [], null);
            expect(res.textFlags('nope')).toBeNull();
            expect(res.textFlags('')).toBeNull();
            expect(res.textFlags(undefined)).toBeNull();
        });
    });

    describe('monospace resolution (RULING A / OQ-A1)', () => {
        function monoResolver(xml, reg, auto, faceAttrs, fontName) {
            const styleEl = namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' },
                { 'style:font-name': fontName });
            const model = auto.parse(el(xml, 'office:automatic-styles', {}, [styleEl]));
            const faces = faceAttrs ? [el(xml, 'style:font-face', faceAttrs)] : [];
            return reg.createResolver(model, faces, null);
        }

        test('resolves a face declared with font-pitch fixed only', () => {
            const { xml, reg, auto } = build();
            const res = monoResolver(xml, reg, auto,
                { 'style:name': 'Courier', 'style:font-pitch': 'fixed' }, 'Courier');
            expect(res.textFlags('T1')).toEqual({ monospace: true, source: 'auto' });
        });

        test('resolves a face declared with font-family-generic modern only', () => {
            const { xml, reg, auto } = build();
            const res = monoResolver(xml, reg, auto,
                { 'style:name': 'Courier', 'style:font-family-generic': 'modern' }, 'Courier');
            expect(res.textFlags('T1')).toEqual({ monospace: true, source: 'auto' });
        });

        test('rejects a face carrying neither marker', () => {
            const { xml, reg, auto } = build();
            const res = monoResolver(xml, reg, auto,
                { 'style:name': 'Arial', 'svg:font-family': 'Arial' }, 'Arial');
            expect(res.textFlags('T1')).toBeNull();
            expect([...res.consumed]).toEqual([]);
        });

        test('rejects a font-name with no declared face at all', () => {
            const { xml, reg, auto } = build();
            const res = monoResolver(xml, reg, auto, null, 'Ghost');
            expect(res.textFlags('T1')).toBeNull();
        });

        test('fo:font-family is NOT part of the mapping', () => {
            const { xml, reg, auto } = build();
            const styleEl = namedStyle(xml,
                { 'style:name': 'T1', 'style:family': 'text' },
                { 'fo:font-family': 'monospace' });
            const model = auto.parse(el(xml, 'office:automatic-styles', {}, [styleEl]));
            expect(reg.createResolver(model, [], null).textFlags('T1')).toBeNull();
        });
    });

    describe('listNumbering', () => {
        function listResolver(xml, reg, listEl) {
            const model = { styles: [], _extras: { children: [listEl] } };
            void xml;
            return reg.createResolver(model, [], null);
        }

        test('reads the num-format of the first level', () => {
            const { xml, reg } = build();
            const listEl = el(xml, 'text:list-style', { 'style:name': 'L1' }, [
                el(xml, 'text:list-level-style-number',
                    { 'text:level': '1', 'style:num-format': 'A' })
            ]);
            expect(listResolver(xml, reg, listEl).listNumbering('L1'))
                .toEqual({ ordered: true, numFormat: 'A', source: 'auto' });
        });

        test('defaults an absent num-format to "1"', () => {
            const { xml, reg } = build();
            const listEl = el(xml, 'text:list-style', { 'style:name': 'L1' }, [
                el(xml, 'text:list-level-style-number', { 'text:level': '1' })
            ]);
            expect(listResolver(xml, reg, listEl).listNumbering('L1'))
                .toEqual({ ordered: true, numFormat: '1', source: 'auto' });
        });

        test('returns null for an unknown name', () => {
            const { xml, reg } = build();
            const listEl = el(xml, 'text:list-style', { 'style:name': 'L1' }, [
                el(xml, 'text:list-level-style-bullet', { 'text:level': '1' })
            ]);
            const res = listResolver(xml, reg, listEl);
            expect(res.listNumbering('L2')).toBeNull();
            expect(res.listNumbering('')).toBeNull();
        });

        test('returns null when the first element child is unexpected', () => {
            const { xml, reg } = build();
            const listEl = el(xml, 'text:list-style', { 'style:name': 'L1' }, [
                el(xml, 'text:list-level-style-image', { 'text:level': '1' }),
                el(xml, 'text:list-level-style-bullet', { 'text:level': '2' })
            ]);
            const res = listResolver(xml, reg, listEl);
            expect(res.listNumbering('L1')).toBeNull();
            expect([...res.consumed]).toEqual([]);
        });

        test('returns null for a list style with no element children', () => {
            const { xml, reg } = build();
            const listEl = el(xml, 'text:list-style', { 'style:name': 'L1' }, []);
            expect(listResolver(xml, reg, listEl).listNumbering('L1')).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    describe('named styles (RULING B)', () => {
        test('resolves a fully-mapped office:styles entry, without consuming it', () => {
            const { xml, reg } = build();
            const strong = namedStyle(xml,
                { 'style:name': 'Strong', 'style:family': 'text' },
                { 'fo:font-weight': 'bold' });
            const res = reg.createResolver(null, [], [strong]);
            expect(res.textFlags('Strong')).toEqual({ bold: true, source: 'named' });
            expect(res.consumed.has('Strong')).toBe(false);
            expect([...res.consumed]).toEqual([]);
        });

        test('tolerates style:display-name and style:class only', () => {
            const { xml, reg } = build();
            const ok = namedStyle(xml, {
                'style:name': 'Strong', 'style:family': 'text',
                'style:display-name': 'Strong Emphasis', 'style:class': 'text'
            }, { 'fo:font-weight': 'bold' });
            expect(reg.createResolver(null, [], [ok]).textFlags('Strong'))
                .toEqual({ bold: true, source: 'named' });

            const ko = namedStyle(xml, {
                'style:name': 'Strong', 'style:family': 'text',
                'style:next-style-name': 'Standard'
            }, { 'fo:font-weight': 'bold' });
            expect(reg.createResolver(null, [], [ko]).textFlags('Strong')).toBeNull();
        });

        test('rejects a parent-chained named style (OQ-B3 residual)', () => {
            const { xml, reg } = build();
            const derived = namedStyle(xml, {
                'style:name': 'Strong', 'style:family': 'text',
                'style:parent-style-name': 'Emphasis'
            }, { 'fo:font-weight': 'bold' });
            expect(reg.createResolver(null, [], [derived]).textFlags('Strong')).toBeNull();
        });

        test('rejects a named style with an extra element child', () => {
            const { xml, reg } = build();
            const withExtra = el(xml, 'style:style',
                { 'style:name': 'Strong', 'style:family': 'text' }, [
                    el(xml, 'style:text-properties', { 'fo:font-weight': 'bold' }),
                    el(xml, 'style:map', { 'style:condition': 'x' })
                ]);
            expect(reg.createResolver(null, [], [withExtra]).textFlags('Strong')).toBeNull();
        });

        test('resolves a text:list-style from office:styles with source named', () => {
            const { xml, reg } = build();
            const listEl = el(xml, 'text:list-style', { 'style:name': 'ListNumber' }, [
                el(xml, 'text:list-level-style-number',
                    { 'text:level': '1', 'style:num-format': 'i' })
            ]);
            const res = reg.createResolver(null, [], [listEl]);
            expect(res.listNumbering('ListNumber'))
                .toEqual({ ordered: true, numFormat: 'i', source: 'named' });
            expect([...res.consumed]).toEqual([]);
        });

        test('content automatic styles are tried before named styles', () => {
            const { xml, reg, auto } = build();
            const autoEl = namedStyle(xml,
                { 'style:name': 'X', 'style:family': 'text' },
                { 'fo:font-style': 'italic' });
            const named = namedStyle(xml,
                { 'style:name': 'X', 'style:family': 'text' },
                { 'fo:font-weight': 'bold' });
            const model = auto.parse(el(xml, 'office:automatic-styles', {}, [autoEl]));
            const res = reg.createResolver(model, [], [named]);
            expect(res.textFlags('X')).toEqual({ italic: true, source: 'auto' });
            expect([...res.consumed]).toEqual(['X']);
        });

        test('named styles are searched when the automatic style does not map', () => {
            const { xml, reg, auto } = build();
            const autoEl = namedStyle(xml,
                { 'style:name': 'X', 'style:family': 'paragraph' },
                { 'fo:color': '#000' });
            const named = namedStyle(xml,
                { 'style:name': 'X', 'style:family': 'text' },
                { 'fo:font-weight': 'bold' });
            const model = auto.parse(el(xml, 'office:automatic-styles', {}, [autoEl]));
            const res = reg.createResolver(model, [], [named]);
            expect(res.textFlags('X')).toEqual({ bold: true, source: 'named' });
            expect([...res.consumed]).toEqual([]);
        });

        test('ignores unrelated raw elements in the office:styles bucket', () => {
            const { xml, reg } = build();
            const other = el(xml, 'style:default-style', { 'style:family': 'text' });
            expect(reg.createResolver(null, [], [other]).textFlags('x')).toBeNull();
        });

        test('a named face declaration feeds monospace resolution', () => {
            const { xml, reg } = build();
            const named = namedStyle(xml,
                { 'style:name': 'Code', 'style:family': 'text' },
                { 'style:font-name': 'Liberation Mono' });
            const face = el(xml, 'style:font-face',
                { 'style:name': 'Liberation Mono', 'style:font-pitch': 'fixed' });
            expect(reg.createResolver(null, [face], [named]).textFlags('Code'))
                .toEqual({ monospace: true, source: 'named' });
        });
    });

    // ------------------------------------------------------------------
    describe('drift vs styleAutomatic.parseStyle', () => {
        test('only style:text-properties is read as the text bag', () => {
            const { xml, reg, auto } = build();
            const tags = Object.keys(auto.PROP_TAGS);
            expect(tags.length).toBeGreaterThan(1);
            for (const tag of tags) {
                const styleEl = el(xml, 'style:style',
                    { 'style:name': 'S', 'style:family': 'text' },
                    [el(xml, tag, { 'fo:font-weight': 'bold' })]);
                const got = reg.createResolver(null, [], [styleEl]).textFlags('S');
                if (tag === 'style:text-properties') {
                    expect(got).toEqual({ bold: true, source: 'named' });
                } else {
                    expect(got).toBeNull();
                }
            }
        });

        test('the mirrored typing agrees with styleAutomatic on the auto path', () => {
            const { xml, reg, auto } = build();
            // Same raw element resolved through the typed (auto) path and the
            // raw (named) path must give the same flags.
            const raw = namedStyle(xml,
                { 'style:name': 'S', 'style:family': 'text' },
                { 'fo:font-weight': 'bold', 'fo:font-style': 'italic' });
            const model = auto.parse(el(xml, 'office:automatic-styles', {}, [raw]));
            const viaAuto = reg.createResolver(model, [], null).textFlags('S');
            const viaNamed = reg.createResolver(null, [], [raw]).textFlags('S');
            expect(viaAuto).toEqual({ bold: true, italic: true, source: 'auto' });
            expect(viaNamed).toEqual({ bold: true, italic: true, source: 'named' });
        });
    });

    // ------------------------------------------------------------------
    // office/BATCH_48/01 — list-level properties (BL-1799 odt share)
    describe('list-level properties', () => {
        test('no level carries style:text-properties or a forced font', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.listStyle({ ordered: false });
            r.listStyle({ ordered: true });
            for (const ls of r.toAutomaticStyles()._extras.children) {
                for (const lvl of ls.children) {
                    expect(lvl.children.map(c => c.name)).toEqual(['style:list-level-properties']);
                    expect(JSON.stringify(lvl)).not.toContain('style:text-properties');
                    expect(JSON.stringify(lvl)).not.toContain('font');
                }
            }
        });

        test('the number level keeps num-format and num-suffix', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.listStyle({ ordered: true, numFormat: 'i' });
            for (const lvl of r.toAutomaticStyles()._extras.children[0].children) {
                expect(lvl.attrs['style:num-format']).toBe('i');
                expect(lvl.attrs['style:num-suffix']).toBe('.');
            }
        });

        test('the generated styles still resolve through listNumbering', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            const bullet = r.listStyle({ ordered: false });
            const num = r.listStyle({ ordered: true, numFormat: 'A' });
            const res = reg.createResolver(r.toAutomaticStyles(), [], null);
            expect(res.listNumbering(bullet)).toEqual({ ordered: false, source: 'auto' });
            expect(res.listNumbering(num)).toEqual({ ordered: true, numFormat: 'A', source: 'auto' });
        });

        test('serialises with the literal per-level indent', () => {
            const { xml, reg } = build();
            const r = reg.createRegistry();
            r.listStyle({ ordered: false });
            const out = xml.serialize(r.toAutomaticStyles()._extras.children[0]);
            for (const ml of LEVEL_ML) {
                expect(out).toContain(`text:list-tab-stop-position="${ml}" fo:text-indent="-0.635cm" fo:margin-left="${ml}"`);
            }
            expect(out.split('<style:list-level-properties ').length - 1).toBe(10);
        });
    });

    // ------------------------------------------------------------------
    // office/BATCH_48/01 — table grid seam (write)
    describe('cellStyle / tableStyle', () => {
        test('names are deterministic and deduplicated', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            expect(r.cellStyle({ bordered: true })).toBe('awa-c-b');
            expect(r.cellStyle({ bordered: true })).toBe('awa-c-b');
            expect(r.tableStyle({ align: 'margins' })).toBe('awa-tb-m');
            expect(r.tableStyle({ align: 'margins' })).toBe('awa-tb-m');
        });

        test('suffixes on collision with a reserved style name', () => {
            const { reg } = build();
            const r = reg.createRegistry({ styles: new Set(['awa-c-b', 'awa-tb-m', 'awa-tb-m-2']) });
            expect(r.cellStyle({ bordered: true })).toBe('awa-c-b-2');
            expect(r.tableStyle({ align: 'margins' })).toBe('awa-tb-m-3');
            expect(r.cellStyle({ bordered: true })).toBe('awa-c-b-2');
        });

        test('toAutomaticStyles emits cell then table after the awa-t-* entries', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.tableStyle({ align: 'margins' });
            r.cellStyle({ bordered: true });
            r.textStyle({ bold: true });
            r.listStyle({ ordered: false });
            const model = r.toAutomaticStyles();
            expect(model.styles).toEqual([
                { name: 'awa-t-b', family: 'text', properties: { text: { 'fo:font-weight': 'bold' } } },
                { name: 'awa-c-b', family: 'table-cell', properties: {
                    tableCell: { 'fo:border': '0.5pt solid #000000', 'fo:padding': '0.097cm' } } },
                { name: 'awa-tb-m', family: 'table', properties: { table: { 'table:align': 'margins' } } }
            ]);
            expect(model._extras.children).toHaveLength(1);
        });

        test('a cell style alone is enough to leave null behind', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.cellStyle({ bordered: true });
            expect(r.toAutomaticStyles()).toEqual({ styles: [
                { name: 'awa-c-b', family: 'table-cell', properties: {
                    tableCell: { 'fo:border': '0.5pt solid #000000', 'fo:padding': '0.097cm' } } }
            ] });
            const t = reg.createRegistry();
            t.tableStyle({ align: 'margins' });
            expect(t.toAutomaticStyles()).toEqual({ styles: [
                { name: 'awa-tb-m', family: 'table', properties: { table: { 'table:align': 'margins' } } }
            ] });
        });

        test('without cell/table requests the text-only set is unchanged', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ italic: true });
            expect(r.toAutomaticStyles()).toEqual({ styles: [
                { name: 'awa-t-i', family: 'text', properties: { text: { 'fo:font-style': 'italic' } } }
            ] });
        });
    });

    // ------------------------------------------------------------------
    // office/BATCH_48/01 — table grid seam (read)
    describe('cellBorders / tableAlign — the honesty rule', () => {
        function autoResolver(styleEls) {
            const { xml, reg, auto } = build();
            const model = auto.parse(el(xml, 'office:automatic-styles', {}, styleEls));
            return reg.createResolver(model, [], null);
        }
        function cellEl(attrs, cellAttrs, extraKids) {
            const { xml } = build();
            const kids = cellAttrs ? [el(xml, 'style:table-cell-properties', cellAttrs)] : [];
            return el(xml, 'style:style', attrs, kids.concat(extraKids || []));
        }
        const C = { 'style:name': 'C1', 'style:family': 'table-cell' };
        const BORDER = { 'fo:border': '0.5pt solid #000000', 'fo:padding': '0.097cm' };

        test('round trip registry → resolver, consumed', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            const c = r.cellStyle({ bordered: true });
            const t = r.tableStyle({ align: 'margins' });
            const res = reg.createResolver(r.toAutomaticStyles(), [], null);
            expect(res.cellBorders(c)).toEqual({ bordered: true, source: 'auto' });
            expect(res.tableAlign(t)).toEqual({ align: 'margins', source: 'auto' });
            expect([...res.consumed].sort()).toEqual(['awa-c-b', 'awa-tb-m']);
        });

        test('cellBorders accepts fo:border alone and any visible border', () => {
            const res = autoResolver([cellEl(C, { 'fo:border': '1pt dashed #ff0000' })]);
            expect(res.cellBorders('C1')).toEqual({ bordered: true, source: 'auto' });
            expect(res.consumed.has('C1')).toBe(true);
        });

        test('cellBorders rejects an extra key fo:background-color', () => {
            const res = autoResolver([cellEl(C, { ...BORDER, 'fo:background-color': '#eeeeee' })]);
            expect(res.cellBorders('C1')).toBeNull();
            expect([...res.consumed]).toEqual([]);
        });

        test('cellBorders rejects fo:border none, empty, and padding alone', () => {
            expect(autoResolver([cellEl(C, { 'fo:border': 'none' })]).cellBorders('C1')).toBeNull();
            expect(autoResolver([cellEl(C, { 'fo:border': '' })]).cellBorders('C1')).toBeNull();
            expect(autoResolver([cellEl(C, { 'fo:padding': '0.097cm' })]).cellBorders('C1')).toBeNull();
        });

        test('cellBorders rejects family text, a parent chain and an extra child', () => {
            expect(autoResolver([cellEl({ 'style:name': 'C1', 'style:family': 'text' }, BORDER)])
                .cellBorders('C1')).toBeNull();
            expect(autoResolver([cellEl({ ...C, 'style:parent-style-name': 'Base' }, BORDER)])
                .cellBorders('C1')).toBeNull();
            const { xml } = build();
            expect(autoResolver([cellEl(C, BORDER, [el(xml, 'style:map', { 'style:condition': 'x' })])])
                .cellBorders('C1')).toBeNull();
        });

        test('cellBorders rejects a second properties bag and an unknown name', () => {
            const { xml } = build();
            const two = el(xml, 'style:style', C, [
                el(xml, 'style:table-cell-properties', BORDER),
                el(xml, 'style:paragraph-properties', { 'fo:text-align': 'center' })
            ]);
            const res = autoResolver([two]);
            expect(res.cellBorders('C1')).toBeNull();
            expect(res.cellBorders('nope')).toBeNull();
            expect(res.cellBorders('')).toBeNull();
        });

        test('cellBorders resolves a named style with tolerated attrs, without consuming', () => {
            const { xml, reg } = build();
            const ok = el(xml, 'style:style', {
                ...C, 'style:display-name': 'Grid Cell', 'style:class': 'table'
            }, [el(xml, 'style:table-cell-properties', BORDER)]);
            const res = reg.createResolver(null, [], [ok]);
            expect(res.cellBorders('C1')).toEqual({ bordered: true, source: 'named' });
            expect([...res.consumed]).toEqual([]);

            const ko = el(xml, 'style:style', { ...C, 'style:next-style-name': 'X' },
                [el(xml, 'style:table-cell-properties', BORDER)]);
            expect(reg.createResolver(null, [], [ko]).cellBorders('C1')).toBeNull();
        });

        test('tableAlign accepts exactly table:align margins', () => {
            const { xml } = build();
            const T = { 'style:name': 'T1', 'style:family': 'table' };
            const ok = el(xml, 'style:style', T, [el(xml, 'style:table-properties', { 'table:align': 'margins' })]);
            const res = autoResolver([ok]);
            expect(res.tableAlign('T1')).toEqual({ align: 'margins', source: 'auto' });
            expect([...res.consumed]).toEqual(['T1']);
        });

        test('tableAlign negatives: other align, extra key, family, parent, named', () => {
            const { xml, reg } = build();
            const T = { 'style:name': 'T1', 'style:family': 'table' };
            const mk = (attrs, bag) => el(xml, 'style:style', attrs, [el(xml, 'style:table-properties', bag)]);
            expect(autoResolver([mk(T, { 'table:align': 'center' })]).tableAlign('T1')).toBeNull();
            expect(autoResolver([mk(T, { 'table:align': 'margins', 'style:width': '17cm' })]).tableAlign('T1')).toBeNull();
            expect(autoResolver([mk(T, {})]).tableAlign('T1')).toBeNull();
            expect(autoResolver([mk({ ...T, 'style:family': 'table-cell' }, { 'table:align': 'margins' })])
                .tableAlign('T1')).toBeNull();
            expect(autoResolver([mk({ ...T, 'style:parent-style-name': 'B' }, { 'table:align': 'margins' })])
                .tableAlign('T1')).toBeNull();
            expect(reg.createResolver(null, [], [mk(T, { 'table:align': 'margins' })]).tableAlign('T1'))
                .toEqual({ align: 'margins', source: 'named' });
        });

        test('the text and cell mappings never cross-resolve', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.textStyle({ bold: true });
            r.cellStyle({ bordered: true });
            const res = reg.createResolver(r.toAutomaticStyles(), [], null);
            expect(res.cellBorders('awa-t-b')).toBeNull();
            expect(res.textFlags('awa-c-b')).toBeNull();
            expect(res.tableAlign('awa-c-b')).toBeNull();
            expect([...res.consumed]).toEqual([]);
        });

        test('falsification twin: dropping fo:border from the cell style → null', () => {
            const { reg } = build();
            const r = reg.createRegistry();
            r.cellStyle({ bordered: true });
            const model = r.toAutomaticStyles();
            delete model.styles[0].properties.tableCell['fo:border'];
            const res = reg.createResolver(model, [], null);
            expect(res.cellBorders('awa-c-b')).toBeNull();
            expect([...res.consumed]).toEqual([]);
        });
    });
});
