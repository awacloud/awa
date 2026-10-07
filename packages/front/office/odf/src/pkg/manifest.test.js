// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { pkgManifest } from './manifest.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';

const xml = fwXml.factory();
const _errors = odfErrors.factory();
const _shared = odfShared.factory(_errors, xml);
const { ParseError } = _errors;
const man = pkgManifest.factory(_errors, _shared, xml);

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.4">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text" manifest:version="1.4"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

describe('pkgManifest module', () => {
    test('has the expected factory shape', () => {
        expect(pkgManifest.name).toBe('pkgManifest');
        expect(pkgManifest.dependencies).toEqual(['odfErrors', 'odfShared', 'xml']);
        expect(typeof pkgManifest.factory).toBe('function');
    });

    describe('parse', () => {
        test('extracts version + entries', () => {
            const m = man.parse(MANIFEST_XML);
            expect(m.version).toBe('1.4');
            expect(m.entries).toHaveLength(3);
            expect(m.entries[0].fullPath).toBe('/');
            expect(m.entries[0].mediaType).toBe('application/vnd.oasis.opendocument.text');
            expect(m.entries[0].version).toBe('1.4');
            expect(m.entries[1].fullPath).toBe('content.xml');
            expect(m.entries[1].mediaType).toBe('text/xml');
        });

        test('throws on unexpected root', () => {
            expect(() => man.parse('<wrong/>')).toThrow(ParseError);
        });

        test('preserves unknown entry attrs in _extras', () => {
            const m = man.parse(
                '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.4">' +
                '<manifest:file-entry manifest:full-path="x.xml" manifest:media-type="text/xml" custom:foo="bar"/>' +
                '</manifest:manifest>');
            expect(m.entries[0]._extras.attrs['custom:foo']).toBe('bar');
        });
    });

    describe('serialize', () => {
        test('roundtrips parsed input', () => {
            const m = man.parse(MANIFEST_XML);
            const s = man.serialize(m);
            const m2 = man.parse(s);
            expect(m2.entries).toEqual(m.entries);
            expect(m2.version).toBe(m.version);
        });

        test('emits manifest namespace', () => {
            const s = man.serialize(man.empty('application/vnd.oasis.opendocument.text'));
            expect(s).toContain('xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"');
            expect(s).toContain('manifest:version="1.4"');
        });
    });

    describe('empty', () => {
        test('produces a minimal valid manifest with root entry', () => {
            const m = man.empty('application/vnd.oasis.opendocument.text');
            expect(m.entries).toHaveLength(1);
            expect(m.entries[0].fullPath).toBe('/');
            expect(m.entries[0].mediaType).toBe('application/vnd.oasis.opendocument.text');
        });
    });

    describe('setEntry', () => {
        test('adds a new entry', () => {
            const m = man.empty('application/vnd.oasis.opendocument.text');
            man.setEntry(m, 'content.xml', 'text/xml');
            expect(m.entries).toHaveLength(2);
            expect(m.entries[1].fullPath).toBe('content.xml');
        });

        test('replaces an existing entry', () => {
            const m = man.empty('application/vnd.oasis.opendocument.text');
            man.setEntry(m, 'content.xml', 'text/xml');
            man.setEntry(m, 'content.xml', 'application/xml');
            expect(m.entries).toHaveLength(2);
            expect(m.entries[1].mediaType).toBe('application/xml');
        });
    });
});

describe('pkgManifest — namespace declarations', () => {
    test('a parsed source declaration comes back through _extras.attrs, unchanged order', () => {
        const src = '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"'
            + ' manifest:version="1.3" xmlns:loext="urn:example:source-loext">'
            + '<manifest:file-entry manifest:full-path="/" manifest:media-type="x" loext:k="1"/>'
            + '</manifest:manifest>';
        const root = xml.parse(man.serialize(man.parse(src)));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:manifest', 'manifest:version', 'xmlns:loext']);
        expect(root.attrs['xmlns:loext']).toBe('urn:example:source-loext');
    });

    test('a known prefix used without a declaration is declared from the known table', () => {
        const m = { version: '1.4', entries: [
            { fullPath: '/', mediaType: 'x', _extras: { attrs: { 'loext:k': '1' } } }
        ] };
        const root = xml.parse(man.serialize(m));
        expect(Object.keys(root.attrs)).toEqual(['xmlns:manifest', 'xmlns:loext', 'manifest:version']);
        expect(root.attrs['xmlns:loext'])
            .toBe('urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0');
    });

    test('a prefix nobody declares throws RenderError', () => {
        const m = { version: '1.4', entries: [{ fullPath: '/', mediaType: 'x', _extras: { attrs: { 'zzz:k': '1' } } }] };
        let err = null;
        try { man.serialize(m); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(_errors.RenderError);
        expect(err.context).toEqual({ module: 'manifest', part: 'META-INF/manifest.xml', prefix: 'zzz' });
    });
});
