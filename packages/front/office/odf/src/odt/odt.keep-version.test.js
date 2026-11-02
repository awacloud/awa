// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The write option `keepVersion` (A35): each part written
 * with its source part's `office:version`, the manifest with the source's
 * version from ODF 1.2 on and none before; `odt`, `ods`, `odp` alike.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odf from '../main.js';

const rt = new ModuleRuntime();
for (const m of [...odf.fw_require, ...odf.modules]) rt.register(m);
const odt = rt.resolve('odt');
const ods = rt.resolve('ods');
const odp = rt.resolve('odp');
const pkgM = rt.resolve('pkgPackage');
const td = new TextDecoder();
const te = new TextEncoder();

const PARTS = ['content.xml', 'styles.xml', 'meta.xml', 'settings.xml'];
/** The bytes with every part's and the manifest's version set to `version` (none for `null`). */
function restamp(bytes, version) {
    const pkg = pkgM.read(bytes);
    for (const part of PARTS) {
        const text = td.decode(pkg.parts[part]);
        pkg.parts[part] = te.encode(text.replace(/ office:version="[^"]*"/, version ? ` office:version="${version}"` : ''));
    }
    pkg.manifest = { ...pkg.manifest, version: version || pkg.manifest.version };
    return pkgM.write(pkg);
}
const zip = rt.resolve('zip');
const versionOf = (bytes, part) => td.decode(pkgM.read(bytes).parts[part]).match(/office:version="([^"]*)"/)?.[1] ?? null;
/** The manifest as written (raw XML: the package reader fills a missing version in). */
const manifestXml = (bytes) => td.decode(zip.unzipSync(bytes)['META-INF/manifest.xml']);

const odtBytes = odt.write({ body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'Body' }] }] });

describe('odt.write keepVersion', () => {
    test('each part keeps its source part version; off by default', () => {
        const src = restamp(odtBytes, '1.2');
        const r = odt.read(src);
        const kept = odt.write(r, { keepVersion: true });
        for (const part of PARTS) expect(versionOf(kept, part)).toBe('1.2');
        expect(manifestXml(kept)).toContain('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"');
        expect(manifestXml(kept)).toMatch(new RegExp('manifest:full-path="/" [^>]*manifest:version="1.2"'));
        const plain = odt.write(odt.read(src), {});
        for (const part of PARTS) expect(versionOf(plain, part)).toBe('1.4');
        expect(odt.write(odt.read(src), { keepVersion: false })).toEqual(plain);
    });

    test('a source before ODF 1.2: no manifest version', () => {
        const kept = odt.write(odt.read(restamp(odtBytes, '1.1')), { keepVersion: true });
        expect(versionOf(kept, 'content.xml')).toBe('1.1');
        expect(manifestXml(kept).includes('manifest:version=')).toBe(false);
    });

    test('a source part without a version: none written; a part the source lacks: the content version; no source package: 1.4', () => {
        const src = restamp(odtBytes, '1.3');
        const r = odt.read(src);
        const pkg = pkgM.read(src);
        pkg.parts['settings.xml'] = te.encode(td.decode(pkg.parts['settings.xml']).replace(/ office:version="[^"]*"/, ''));
        delete pkg.parts['meta.xml'];
        const kept = odt.write({ ...r, package: pkg }, { keepVersion: true });
        expect(versionOf(kept, 'settings.xml')).toBe(null);
        expect(td.decode(pkgM.read(kept).parts['settings.xml'])).not.toContain('office:version=');
        expect(versionOf(kept, 'meta.xml')).toBe('1.3');
        const fresh = odt.write({ body: [{ type: 'paragraph', runs: [{ type: 'text', value: 'x' }] }] }, { keepVersion: true });
        expect(versionOf(fresh, 'content.xml')).toBe('1.4');
    });

    test('a value other than a boolean throws', () => {
        expect(() => odt.write(odt.read(odtBytes), { keepVersion: 'yes' })).toThrow(/keepVersion/);
    });
});

describe('odt.write keepVersion: an image mime type before ODF 1.3 (A37)', () => {
    /** A source of `version` with a frame whose image carries loext:mime-type. */
    function framed(version) {
        const pkg = pkgM.read(restamp(odtBytes, version));
        const text = td.decode(pkg.parts['content.xml']).replace('<text:p>Body</text:p>',
            '<text:p><draw:frame text:anchor-type="as-char" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
            + ' xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0">'
            + '<draw:image xlink:href="Pictures/a.png" loext:mime-type="image/png"/></draw:frame></text:p>');
        pkg.parts['content.xml'] = te.encode(text);
        return pkgM.write(pkg);
    }
    const image = (bytes) => td.decode(pkgM.read(bytes).parts['content.xml']).match(/<draw:image [^>]*>/)[0];

    test('a 1.2 source: loext:mime-type kept under keepVersion, draw:mime-type by default', () => {
        const src = framed('1.2');
        expect(td.decode(pkgM.read(src).parts['content.xml'])).toContain('loext:mime-type="image/png"');
        const r = () => odt.read(src, { framesInRuns: true });
        expect(image(odt.write(r(), { keepVersion: true }))).toContain('loext:mime-type="image/png"');
        expect(image(odt.write(r(), {}))).toContain('draw:mime-type="image/png"');
    });

    test('a 1.3 source: draw:mime-type under keepVersion too', () => {
        expect(image(odt.write(odt.read(framed('1.3'), { framesInRuns: true }), { keepVersion: true }))).toContain('draw:mime-type="image/png"');
    });
});

describe('ods.write, odp.write keepVersion', () => {
    test('a spreadsheet and a presentation keep their source version', () => {
        for (const [api, empty] of [[ods, ods.empty()], [odp, odp.empty()]]) {
            const src = restamp(api.write(empty), '1.3');
            const kept = api.write(api.read(src), { keepVersion: true });
            for (const part of PARTS) expect(versionOf(kept, part)).toBe('1.3');
            expect(versionOf(api.write(api.read(src), {}), 'content.xml')).toBe('1.4');
        }
    });
});
