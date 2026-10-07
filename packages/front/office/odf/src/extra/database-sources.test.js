// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { databaseSources } from './database-sources.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const typed = odfTypedHelper.factory(xml);
const ext = databaseSources.factory(typed);

describe('databaseSources', () => {
    test('contract', () => {
        expect(databaseSources.name).toBe('databaseSources');
        expect(databaseSources.dependencies).toEqual(['odfTypedHelper']);
        expect(ext.ELEMENTS.size).toBeGreaterThan(40);
    });
    test('parse/render db:data-source with nested driver-settings', () => {
        const el = xml.el('db:data-source', {}, [
            xml.el('db:driver-settings', { 'db:show-deleted': 'false' }, []),
            xml.el('db:queries', {}, [xml.el('db:query', { 'db:name': 'Q' })])
        ]);
        const p = ext.parseDb(el);
        expect(p.kind).toBe('data-source');
        expect(p._passthrough).toBe(true);
        expect(p.children).toHaveLength(2);
        expect(p.children[1].children[0].kind).toBe('query');
        const back = ext.renderDb(p);
        expect(back.name).toBe('db:data-source');
    });
});
