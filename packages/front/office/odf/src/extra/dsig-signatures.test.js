// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { dsigSignatures } from './dsig-signatures.js';

const xml = fwXml.factory();
const ext = dsigSignatures.factory(xml);

describe('dsigSignatures', () => {
    test('contract', () => {
        expect(dsigSignatures.name).toBe('dsigSignatures');
        expect(dsigSignatures.dependencies).toEqual(['xml']);
    });
    test('parse/render preserves subtree verbatim', () => {
        const sig = xml.el('Signature', {}, [xml.el('SignedInfo', {}, [])]);
        const el = xml.el('dsig:document-signatures', {}, [sig]);
        const s = ext.parseSignatures(el);
        expect(s.type).toBe('dsig-signatures');
        expect(s.body).toHaveLength(1);
        expect(ext.renderSignatures(s).name).toBe('dsig:document-signatures');
    });
    test('manifestEntries', () => {
        const ents = ext.manifestEntries();
        expect(ents[0].fullPath).toBe('META-INF/documentsignatures.xml');
    });
    test('hydrate/dehydrateMetadata roundtrip', () => {
        const m = { _extras: [xml.el('dsig:document-signatures', {}, [])] };
        ext.hydrateMetadata(m);
        expect(m.signatures).toBeDefined();
        const out = ext.dehydrateMetadata(m);
        expect(out._extras[0].name).toBe('dsig:document-signatures');
    });
});
