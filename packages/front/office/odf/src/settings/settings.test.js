// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { odfSettings } from './settings.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';

const xml = fwXml.factory();
const _errors = odfErrors.factory();
const _shared = odfShared.factory(_errors, xml);
const { ParseError } = _errors;
const s = odfSettings.factory(_errors, _shared, xml);

const SETTINGS_XML = `<?xml version="1.0"?>
<office:document-settings
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"
  office:version="1.4">
  <office:settings>
    <config:config-item-set config:name="ooo:view-settings">
      <config:config-item config:name="ViewAreaTop" config:type="int">0</config:config-item>
    </config:config-item-set>
    <config:config-item-set config:name="ooo:configuration-settings">
      <config:config-item config:name="PrinterName" config:type="string">PDF</config:config-item>
    </config:config-item-set>
  </office:settings>
</office:document-settings>`;

describe('odfSettings module', () => {
    test('has the expected factory shape', () => {
        expect(odfSettings.name).toBe('odfSettings');
        expect(odfSettings.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
        expect(typeof odfSettings.factory).toBe('function');
    });

    describe('parse', () => {
        test('extracts itemSets as raw nodes', () => {
            const o = s.parse(SETTINGS_XML);
            expect(o.itemSets).toHaveLength(2);
            expect(o.itemSets[0].name).toBe('config:config-item-set');
            expect(o.itemSets[0].attrs['config:name']).toBe('ooo:view-settings');
        });

        test('throws on unexpected root', () => {
            expect(() => s.parse('<wrong/>')).toThrow(ParseError);
        });

        test('empty settings file', () => {
            const o = s.parse('<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>');
            expect(o.itemSets).toEqual([]);
        });
    });

    describe('serialize', () => {
        test('roundtrips itemSets', () => {
            const o = s.parse(SETTINGS_XML);
            const back = s.parse(s.serialize(o));
            expect(back.itemSets).toHaveLength(2);
            expect(back.itemSets[0].attrs['config:name']).toBe('ooo:view-settings');
        });

        test('empty itemSets list', () => {
            const out = s.serialize(s.empty());
            expect(out).toContain('<office:settings');
        });
    });
});

describe('odfSettings — namespace declarations', () => {
    test('serialize without opts keeps the two own declarations', () => {
        const root = xml.parse(s.serialize(s.empty()));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:office', 'xmlns:config', 'office:version']);
    });

    test('opts.namespaces declares a carried prefix used by a kept child', () => {
        const m = { itemSets: [], _extras: { children: [xml.el('acme:view', {}, [])] } };
        const root = xml.parse(s.serialize(m, { namespaces: { acme: 'urn:example:acme' } }));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:office', 'xmlns:config', 'xmlns:acme', 'office:version']);
        expect(root.attrs['xmlns:acme']).toBe('urn:example:acme');
    });

    test('a prefix nobody declares throws RenderError', () => {
        const m = { itemSets: [], _extras: { children: [xml.el('acme:view', {}, [])] } };
        let err = null;
        try { s.serialize(m); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(_errors.RenderError);
        expect(err.context).toEqual({ module: 'settings', part: 'settings.xml', prefix: 'acme' });
    });
});
