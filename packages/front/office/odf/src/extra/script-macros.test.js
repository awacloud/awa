// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { scriptMacros } from './script-macros.js';

const xml = fwXml.factory();
const ext = scriptMacros.factory(xml);

describe('scriptMacros', () => {
    test('contract', () => {
        expect(scriptMacros.name).toBe('scriptMacros');
        expect(scriptMacros.dependencies).toEqual(['xml']);
    });
    test('parse/render office:scripts → script:event-listener', () => {
        const el = xml.el('office:scripts', {}, [
            xml.el('office:script', { 'script:language': 'JavaScript' }, []),
            xml.el('office:event-listeners', {}, [
                xml.el('script:event-listener',
                    { 'script:event-name': 'dom:load', 'xlink:href': '#m' })
            ])
        ]);
        const s = ext.parseScript(el);
        expect(s.kind).toBe('office:scripts');
        expect(s.children).toHaveLength(2);
        expect(s.children[1].children[0].kind).toBe('script:event-listener');
        const back = ext.renderScript(s);
        expect(back.name).toBe('office:scripts');
    });
    test('hydrate/dehydrateMetadata', () => {
        const meta = { _extras: [xml.el('office:scripts', {}, [])] };
        ext.hydrateMetadata(meta);
        expect(meta.scripts).toHaveLength(1);
        const out = ext.dehydrateMetadata(meta);
        expect(out._extras[0].name).toBe('office:scripts');
    });
});
