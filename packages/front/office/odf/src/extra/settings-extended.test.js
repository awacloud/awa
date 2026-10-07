// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { settingsExtended } from './settings-extended.js';

const xml = fwXml.factory();
const ext = settingsExtended.factory(xml);

describe('settingsExtended', () => {
    test('contract', () => {
        expect(settingsExtended.name).toBe('settingsExtended');
        expect(settingsExtended.dependencies).toEqual(['xml']);
    });
    test('parse/render config-item with text', () => {
        const el = xml.el('config:config-item',
            { 'config:name': 'Zoom', 'config:type': 'int' }, [xml.text('100')]);
        const p = ext.parseConfig(el);
        expect(p.kind).toBe('config-item');
        expect(p.text).toBe('100');
        const back = ext.renderConfig(p);
        expect(back.attrs['config:name']).toBe('Zoom');
        expect(xml.textContent(back)).toBe('100');
    });
    test('parse/render config-item-set with nested items', () => {
        const el = xml.el('config:config-item-set', { 'config:name': 'View' }, [
            xml.el('config:config-item', { 'config:name': 'Zoom' }, [xml.text('100')]),
            xml.el('config:config-item-map-named', { 'config:name': 'Views' }, [
                xml.el('config:config-item-map-entry', { 'config:name': 'v1' }, [])
            ])
        ]);
        const p = ext.parseConfig(el);
        expect(p.items).toHaveLength(2);
        expect(p.items[1].items[0].kind).toBe('config-item-map-entry');
        const back = ext.renderConfig(p);
        expect(back.children).toHaveLength(2);
    });
    test('hydrate/dehydrate settings', () => {
        const s = { _extras: [xml.el('config:config-item-set', { 'config:name': 'X' }, [])] };
        ext.hydrateSettings(s);
        expect(s.config).toHaveLength(1);
        const out = ext.dehydrateSettings(s);
        expect(out._extras[0].name).toBe('config:config-item-set');
    });
});
