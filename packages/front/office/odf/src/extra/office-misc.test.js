// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { officeMisc } from './office-misc.js';
import { odfMiscHelper } from './_misc-helper.js';

const xml = fwXml.factory();
const helper = odfMiscHelper.factory(xml);
const ext = officeMisc.factory(xml, helper);

describe('officeMisc', () => {
    test('contract', () => {
        expect(officeMisc.name).toBe('officeMisc');
        expect(officeMisc.dependencies).toEqual(['xml', 'odfMiscHelper']);
    });
    test('parse/render office:annotation', () => {
        const el = xml.el('office:annotation', {});
        const p = ext.parseElement(el);
        expect(p.kind).toBe('annotation');
        expect(ext.renderElement(p).name).toBe('office:annotation');
    });
    test('hydrate/dehydrateMetadata roundtrip', () => {
        const m = { _extras: [xml.el('office:dde-source', {})] };
        ext.hydrateMetadata(m);
        expect(m.officeNodes).toHaveLength(1);
        const back = ext.dehydrateMetadata(m);
        expect(back._extras[0].name).toBe('office:dde-source');
    });
});
