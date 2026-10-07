// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { textSection } from './section.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    const s = textSection.factory(xml);
    return { xml, s };
}

describe('textSection module', () => {
    test('factory shape', () => {
        expect(textSection.name).toBe('textSection');
        expect(textSection.dependencies).toEqual(['xml']);
        expect(typeof textSection.factory).toBe('function');
    });

    describe('parseSection', () => {
        test('extracts name + style + opaque children', () => {
            const { xml, s } = build();
            const el = xml.parse('<text:section text:name="S1" text:style-name="Sec"><text:p>inside</text:p></text:section>');
            const sec = s.parseSection(el);
            expect(sec.type).toBe('section');
            expect(sec.name).toBe('S1');
            expect(sec.styleName).toBe('Sec');
            expect(sec.children).toHaveLength(1);
            expect(sec.children[0].name).toBe('text:p');
        });
    });

    describe('renderSection', () => {
        test('roundtrip opaque children', () => {
            const { xml, s } = build();
            const el = xml.parse('<text:section text:name="S1"><text:p>x</text:p></text:section>');
            const sec = s.parseSection(el);
            const out = xml.serialize(s.renderSection(sec));
            expect(out).toContain('<text:section text:name="S1">');
            expect(out).toContain('<text:p>x</text:p>');
        });
    });
});
