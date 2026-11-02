// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// `opcCoreProperties.read(pkg)`: the core-properties part a read package's
// root relationship names (OPC Part 2 § 11), typed.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const core = runtime.resolve('opcCoreProperties');
const { ParseError } = runtime.resolve('ooxmlErrors');

const REL = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
const CORE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + '<dc:title>Board minutes &amp; notes</dc:title><dc:subject>Q3</dc:subject><dc:creator>Ann</dc:creator>'
    + '<cp:keywords>a, b</cp:keywords><dc:description>Desc</dc:description><cp:lastModifiedBy>Bo</cp:lastModifiedBy>'
    + '<cp:revision>4</cp:revision><cp:category>Minutes</cp:category><cp:contentStatus>Final</cp:contentStatus>'
    + '<dc:language>fr-FR</dc:language><dc:identifier>id-1</dc:identifier><cp:version>2</cp:version>'
    + '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-02T03:04:05Z</dcterms:created>'
    + '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-02-03T04:05:06Z</dcterms:modified>'
    + '<cp:lastPrinted>2026-03-04T05:06:07Z</cp:lastPrinted></cp:coreProperties>';
const pkgWith = (xml, target = 'docProps/core.xml') => ({
    contentTypes: {},
    parts: { ['/' + target.replace(/^\//, '')]: new TextEncoder().encode(xml) },
    rels: { '/': [{ Id: 'rId9', Type: REL, Target: target }] }
});

describe('opcCoreProperties.read', () => {
    test('the core part its root relationship names, every field typed', () => {
        expect(core.read(pkgWith(CORE))).toEqual({
            title: 'Board minutes & notes', subject: 'Q3', creator: 'Ann', keywords: 'a, b', description: 'Desc',
            lastModifiedBy: 'Bo', revision: '4', category: 'Minutes', contentStatus: 'Final', language: 'fr-FR',
            identifier: 'id-1', version: '2', created: '2026-01-02T03:04:05Z', modified: '2026-02-03T04:05:06Z',
            lastPrinted: '2026-03-04T05:06:07Z'
        });
        expect(core.read(pkgWith(CORE, '/meta/props.xml')).title).toBe('Board minutes & notes');
    });

    test('an empty element is an empty string; an absent one is absent', () => {
        const xml = CORE.replace(/<dc:title>[^<]*<\/dc:title>/, '<dc:title/>').replace(/<dc:subject>[^<]*<\/dc:subject>/, '');
        const r = core.read(pkgWith(xml));
        expect(r.title).toBe('');
        expect('subject' in r).toBe(false);
    });

    test('no relationship, or no part: null', () => {
        expect(core.read({ contentTypes: {}, parts: {}, rels: { '/': [] } })).toBe(null);
        expect(core.read({ contentTypes: {}, parts: {}, rels: { '/': [{ Id: 'r', Type: REL, Target: 'docProps/core.xml' }] } })).toBe(null);
    });

    test('a part that is not core properties throws opc/core-properties-invalid', () => {
        for (const xml of ['<not-xml', '<?xml version="1.0"?><other/>']) {
            let err;
            try { core.read(pkgWith(xml)); } catch (e) { err = e; }
            expect(err instanceof ParseError).toBe(true);
            expect(err.code).toBe('opc/core-properties-invalid');
        }
    });
});
