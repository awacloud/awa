// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcRelationships } from './relationships.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
const _errors = _ooxmlErrors.factory();

describe('opcRelationships', () => {
    const rels = opcRelationships.factory(_errors, ooxmlXml.factory());

    test('parse / serialize roundtrip', () => {
        const r = [
            { Id: 'rId1', Type: 'http://example/officeDocument', Target: 'word/document.xml' },
            { Id: 'rId2', Type: 'http://example/hyperlink', Target: 'http://x', TargetMode: 'External' }
        ];
        const xml = rels.serialize(r);
        expect(rels.parse(xml)).toEqual(r);
    });

    test('relsPathFor', () => {
        expect(rels.relsPathFor('')).toBe('_rels/.rels');
        expect(rels.relsPathFor('/')).toBe('_rels/.rels');
        expect(rels.relsPathFor('/word/document.xml'))
            .toBe('word/_rels/document.xml.rels');
        expect(rels.relsPathFor('/foo.xml'))
            .toBe('_rels/foo.xml.rels');
    });

    test('resolveTarget handles relative and absolute', () => {
        expect(rels.resolveTarget('/word/document.xml', 'styles.xml'))
            .toBe('/word/styles.xml');
        expect(rels.resolveTarget('/word/document.xml', '/customXml/item1.xml'))
            .toBe('/customXml/item1.xml');
        expect(rels.resolveTarget('/word/document.xml', '../docProps/app.xml'))
            .toBe('/docProps/app.xml');
    });
});
