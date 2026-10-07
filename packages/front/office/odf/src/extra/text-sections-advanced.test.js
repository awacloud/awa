// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { textSectionsAdvanced } from './text-sections-advanced.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = textSectionsAdvanced.factory(xml, helper);

describe('textSectionsAdvanced', () => {
    test('contract', () => {
        expect(textSectionsAdvanced.name).toBe('textSectionsAdvanced');
        expect(textSectionsAdvanced.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('parse/render text:section-source', () => {
        const el = xml.el('text:section-source', { 'xlink:href': 'a.odt' });
        const p = ext.parseElement(el);
        expect(p.kind).toBe('section-source');
        expect(ext.renderElement(p).attrs['xlink:href']).toBe('a.odt');
    });
    test('hydrate/dehydrate section protection attrs', () => {
        const s = { type: 'section', attrs: { 'text:protected': 'true', 'text:condition': 'foo' } };
        ext.hydrateSection(s);
        expect(s.protection['text:protected']).toBe('true');
        const out = ext.dehydrateSection(s);
        expect(out.attrs['text:protected']).toBe('true');
    });
});
