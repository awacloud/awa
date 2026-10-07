// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { odfMeta } from './meta.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';

const xml = fwXml.factory();
const _errors = odfErrors.factory();
const _shared = odfShared.factory(_errors, xml);
const { ParseError } = _errors;
const meta = odfMeta.factory(_errors, _shared, xml);

const META_XML = `<?xml version="1.0"?>
<office:document-meta
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  office:version="1.4">
  <office:meta>
    <dc:title>My Doc</dc:title>
    <dc:creator>Alice</dc:creator>
    <dc:date>2026-05-13T10:00:00</dc:date>
    <meta:generator>libreoffice</meta:generator>
    <meta:initial-creator>Bob</meta:initial-creator>
    <meta:creation-date>2026-05-12T09:00:00</meta:creation-date>
  </office:meta>
</office:document-meta>`;

describe('odfMeta module', () => {
    test('has the expected factory shape', () => {
        expect(odfMeta.name).toBe('odfMeta');
        expect(odfMeta.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
        expect(typeof odfMeta.factory).toBe('function');
    });

    describe('parse', () => {
        test('extracts standard fields', () => {
            const m = meta.parse(META_XML);
            expect(m.title).toBe('My Doc');
            expect(m.creator).toBe('Alice');
            expect(m.date).toBe('2026-05-13T10:00:00');
            expect(m.generator).toBe('libreoffice');
            expect(m.initialCreator).toBe('Bob');
            expect(m.creationDate).toBe('2026-05-12T09:00:00');
        });

        test('throws on unexpected root', () => {
            expect(() => meta.parse('<wrong/>')).toThrow(ParseError);
        });

        test('preserves unknown children in _extras', () => {
            const m = meta.parse(
                '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">' +
                '<office:meta><custom:foo>bar</custom:foo></office:meta>' +
                '</office:document-meta>');
            expect(m._extras.children).toHaveLength(1);
        });
    });

    describe('serialize', () => {
        test('roundtrips parsed meta', () => {
            const m = meta.parse(META_XML);
            const back = meta.parse(meta.serialize(m));
            expect(back.title).toBe(m.title);
            expect(back.creator).toBe(m.creator);
            expect(back.creationDate).toBe(m.creationDate);
        });

        test('emits ODF namespaces', () => {
            const s = meta.serialize(meta.empty());
            expect(s).toContain('xmlns:office');
            expect(s).toContain('xmlns:dc');
            expect(s).toContain('xmlns:meta');
        });
    });
});

describe('odfMeta — namespace declarations', () => {
    test('serialize without opts keeps the three own declarations', () => {
        const root = xml.parse(meta.serialize({ title: 'T', generator: 'g' }));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:office', 'xmlns:meta', 'xmlns:dc', 'office:version']);
    });

    test('opts.namespaces declares a carried prefix used by a kept child', () => {
        const m = { generator: 'g', _extras: { children: [xml.el('ooo:note', { 'acme:k': '1' }, [])] } };
        const root = xml.parse(meta.serialize(m, { namespaces: { acme: 'urn:example:acme' } }));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:office', 'xmlns:meta', 'xmlns:dc',
            'xmlns:acme', 'xmlns:ooo', 'office:version']);
        expect(root.attrs['xmlns:acme']).toBe('urn:example:acme');
        expect(root.attrs['xmlns:ooo']).toBe('http://openoffice.org/2004/office');
    });

    test('a prefix nobody declares throws RenderError', () => {
        const m = { _extras: { children: [xml.el('zzz:x', {}, [])] } };
        let err = null;
        try { meta.serialize(m); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(_errors.RenderError);
        expect(err.context).toEqual({ module: 'meta', part: 'meta.xml', prefix: 'zzz' });
    });
});
