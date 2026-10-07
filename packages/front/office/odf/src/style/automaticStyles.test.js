// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { styleAutomatic } from './automaticStyles.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    return { xml, s: styleAutomatic.factory(xml) };
}

describe('styleAutomatic module', () => {
    test('factory shape', () => {
        expect(styleAutomatic.name).toBe('styleAutomatic');
        expect(styleAutomatic.dependencies).toEqual(['xml']);
        expect(typeof styleAutomatic.factory).toBe('function');
    });

    describe('parse / render', () => {
        test('typed paragraph style', () => {
            const { xml, s } = build();
            const el = xml.parse('<office:automatic-styles><style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>');
            const m = s.parse(el);
            expect(m.styles).toHaveLength(1);
            expect(m.styles[0].name).toBe('P1');
            expect(m.styles[0].family).toBe('paragraph');
            expect(m.styles[0].parentStyleName).toBe('Standard');
            expect(m.styles[0].properties.paragraph['fo:text-align']).toBe('center');
            expect(m.styles[0].properties.text['fo:font-weight']).toBe('bold');
        });

        test('roundtrip', () => {
            const { xml, s } = build();
            const m = {
                styles: [{
                    name: 'P1', family: 'paragraph',
                    properties: {
                        paragraph: { 'fo:text-align': 'center' },
                        text:      { 'fo:font-weight': 'bold' }
                    }
                }]
            };
            const out = xml.serialize(s.render(m));
            expect(out).toContain('<office:automatic-styles>');
            expect(out).toContain('style:name="P1"');
            expect(out).toContain('fo:text-align="center"');
            expect(out).toContain('fo:font-weight="bold"');
        });

        test('preserves unknown grandchildren', () => {
            const { xml, s } = build();
            const el = xml.parse('<office:automatic-styles><style:style style:name="T1" style:family="text"><foo:unknown/></style:style></office:automatic-styles>');
            const m = s.parse(el);
            expect(m.styles[0]._extras.children).toHaveLength(1);
            const out = xml.serialize(s.render(m));
            expect(out).toContain('<foo:unknown/>');
        });
    });
});
