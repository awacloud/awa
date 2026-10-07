// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { legacyStaroffice } from './legacy-staroffice.js';

const xml = fwXml.factory();
const ext = legacyStaroffice.factory(xml);

describe('legacyStaroffice', () => {
    test('contract', () => {
        expect(legacyStaroffice.name).toBe('legacyStaroffice');
        expect(legacyStaroffice.dependencies).toEqual(['xml']);
        expect(ext.LEGACY_PREFIXES).toContain('so:');
    });
    test('isLegacy', () => {
        expect(ext.isLegacy('so:foo')).toBe(true);
        expect(ext.isLegacy('ooow:bar')).toBe(true);
        expect(ext.isLegacy('text:p')).toBe(false);
    });
    test('parse/render roundtrip', () => {
        const el = xml.el('so:custom', { 'so:id': '7' });
        const p = ext.parseLegacy(el);
        expect(p._legacy).toBe(true);
        expect(p.kind).toBe('so:custom');
        const back = ext.renderLegacy(p);
        expect(back.name).toBe('so:custom');
    });
    test('hydrateParagraph + dehydrateParagraph', () => {
        const p = { type: 'paragraph', _extras: [xml.el('ooow:extra', {})] };
        ext.hydrateParagraph(p);
        expect(p.legacyNodes).toHaveLength(1);
        const out = ext.dehydrateParagraph(p);
        expect(out._extras[0].name).toBe('ooow:extra');
    });
});
