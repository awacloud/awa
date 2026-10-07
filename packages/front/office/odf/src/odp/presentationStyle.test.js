// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { presentationStyle } from './presentationStyle.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    return { xml, p: presentationStyle.factory(xml) };
}

describe('presentationStyle module', () => {
    test('factory shape', () => {
        expect(presentationStyle.name).toBe('presentationStyle');
        expect(presentationStyle.dependencies).toEqual(['xml']);
        expect(typeof presentationStyle.factory).toBe('function');
    });

    describe('placeholder', () => {
        test('parse', () => {
            const { xml, p } = build();
            const el = xml.parse('<presentation:placeholder presentation:object="title" svg:x="1cm" svg:y="2cm" svg:width="10cm" svg:height="3cm"/>');
            const ph = p.parsePlaceholder(el);
            expect(ph.type).toBe('placeholder');
            expect(ph.objectType).toBe('title');
            expect(ph.x).toBe('1cm');
            expect(ph.width).toBe('10cm');
        });
        test('render', () => {
            const { xml, p } = build();
            const out = xml.serialize(p.renderPlaceholder({ objectType: 'outline', x: '0cm', y: '5cm' }));
            expect(out).toContain('presentation:object="outline"');
            expect(out).toContain('svg:y="5cm"');
        });
        test('roundtrip unknown attrs', () => {
            const { xml, p } = build();
            const back = p.parsePlaceholder(xml.parse(xml.serialize(p.renderPlaceholder(
                p.parsePlaceholder(xml.parse('<presentation:placeholder presentation:object="title" foo:bar="x"/>'))
            ))));
            expect(back._extras.attrs['foo:bar']).toBe('x');
        });
    });

    describe('notes', () => {
        test('parse body as raw children', () => {
            const { xml, p } = build();
            const el = xml.parse('<presentation:notes presentation:style-name="N1"><text:p>note text</text:p></presentation:notes>');
            const n = p.parseNotes(el);
            expect(n.type).toBe('notes');
            expect(n.styleName).toBe('N1');
            expect(n.body).toHaveLength(1);
        });
        test('render with body', () => {
            const { xml, p } = build();
            const para = xml.el('text:p', {}, [xml.text('hi')]);
            const out = xml.serialize(p.renderNotes({ body: [para], styleName: 'N' }));
            expect(out).toContain('<presentation:notes');
            expect(out).toContain('presentation:style-name="N"');
            expect(out).toContain('hi');
        });
    });
});
