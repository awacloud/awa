// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odpAnimations } from './animations.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const a = odpAnimations.factory(xml);
    return { xml, a };
}

describe('odpAnimations module', () => {
    test('factory shape', () => {
        expect(odpAnimations.name).toBe('odpAnimations');
        expect(odpAnimations.dependencies).toEqual(['xml']);
    });

    test('isAnimName recognises anim: prefix', () => {
        const { a } = build();
        expect(a.isAnimName('anim:par')).toBe(true);
        expect(a.isAnimName('anim:animateMotion')).toBe(true);
        expect(a.isAnimName('text:p')).toBe(false);
    });

    test('parses nested anim:par > anim:seq > anim:set', () => {
        const { xml, a } = build();
        const src =
            '<anim:par presentation:node-type="timing-root">' +
            '<anim:seq presentation:node-type="main-sequence">' +
            '<anim:set smil:attributeName="visibility" smil:to="visible" smil:dur="1s"/>' +
            '<anim:animate smil:attributeName="opacity" smil:from="0" smil:to="1"/>' +
            '</anim:seq>' +
            '</anim:par>';
        const tree = a.parseAnimations(xml.parse(src));
        expect(tree.kind).toBe('anim:par');
        expect(tree.children).toHaveLength(1);
        expect(tree.children[0].kind).toBe('anim:seq');
        expect(tree.children[0].children).toHaveLength(2);
        expect(tree.children[0].children[0].kind).toBe('anim:set');
    });

    test('render roundtrip preserves attrs', () => {
        const { xml, a } = build();
        const tree = {
            kind: 'anim:par',
            attrs: { 'presentation:node-type': 'timing-root' },
            children: [
                { kind: 'anim:seq', attrs: {}, children: [
                    { kind: 'anim:set', attrs: { 'smil:dur': '2s' }, children: [] }
                ] }
            ]
        };
        const out = xml.serialize(a.renderAnimations(tree));
        expect(out).toContain('presentation:node-type="timing-root"');
        expect(out).toContain('smil:dur="2s"');
        expect(out).toContain('<anim:set');
    });

    test('preserves non-anim children verbatim', () => {
        const { xml, a } = build();
        const src = '<anim:par><foo:bar baz="1"/></anim:par>';
        const tree = a.parseAnimations(xml.parse(src));
        expect(tree.children).toHaveLength(1);
        const out = xml.serialize(a.renderAnimations(tree));
        expect(out).toContain('<foo:bar baz="1"/>');
    });

    test('parseTransition / renderTransition', () => {
        const { xml, a } = build();
        const el = xml.parse('<presentation:transition presentation:type="fade" presentation:speed="medium"/>');
        const t = a.parseTransition(el);
        expect(t.attrs['presentation:type']).toBe('fade');
        const out = xml.serialize(a.renderTransition(t));
        expect(out).toContain('presentation:speed="medium"');
    });
});
