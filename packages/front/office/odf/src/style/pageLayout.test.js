// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { stylePageLayout } from './pageLayout.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';

function build() {
    const xml = fwXml.factory();
    return { xml, p: stylePageLayout.factory(xml) };
}

describe('stylePageLayout module', () => {
    test('factory shape', () => {
        expect(stylePageLayout.name).toBe('stylePageLayout');
        expect(stylePageLayout.dependencies).toEqual(['xml']);
        expect(typeof stylePageLayout.factory).toBe('function');
    });

    describe('parsePageLayout / renderPageLayout', () => {
        test('full roundtrip', () => {
            const { xml, p } = build();
            const el = xml.parse('<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait"/><style:header-style><style:header-footer-properties fo:min-height="1cm"/></style:header-style></style:page-layout>');
            const m = p.parsePageLayout(el);
            expect(m.name).toBe('pm1');
            expect(m.properties['fo:page-width']).toBe('21cm');
            expect(m.headerStyle.properties['fo:min-height']).toBe('1cm');
            const out = xml.serialize(p.renderPageLayout(m));
            expect(out).toContain('style:name="pm1"');
            expect(out).toContain('fo:page-width="21cm"');
            expect(out).toContain('<style:header-style>');
        });
    });
});
