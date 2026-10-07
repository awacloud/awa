// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odfShared } from './index.js';
import { odfErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

const errors = odfErrors.factory();
const xmlMod = xml.factory();
const shared = odfShared.factory(errors, xmlMod);

describe('odfShared — factory shape', () => {
    test('descriptor contract', () => {
        expect(odfShared.name).toBe('odfShared');
        expect(odfShared.dependencies).toEqual(['odfErrors', 'xml']);
        expect(typeof odfShared.factory).toBe('function');
    });
});

describe('odfShared — constants', () => {
    test('ODF_NS is frozen and exposes the canonical URIs', () => {
        expect(Object.isFrozen(shared.ODF_NS)).toBe(true);
        expect(shared.ODF_NS.OFFICE).toBe('urn:oasis:names:tc:opendocument:xmlns:office:1.0');
        expect(shared.ODF_NS.TEXT).toMatch(/^urn:oasis:names:tc:opendocument:xmlns:text:1\.0$/);
        expect(shared.ODF_NS.DC).toBe('http://purl.org/dc/elements/1.1/');
        expect(shared.ODF_NS.XLINK).toBe('http://www.w3.org/1999/xlink');
    });

    test('ODF_VERSION = 1.4', () => {
        expect(shared.ODF_VERSION).toBe('1.4');
    });

    test('XML_DECL variants', () => {
        expect(shared.XML_DECL).toBe('<?xml version="1.0" encoding="UTF-8"?>');
        expect(shared.XML_DECL_STANDALONE).toBe(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    });

    test('CT MIME table', () => {
        expect(Object.isFrozen(shared.CT)).toBe(true);
        expect(shared.CT.ODT).toBe('application/vnd.oasis.opendocument.text');
        expect(shared.CT.ODS).toBe('application/vnd.oasis.opendocument.spreadsheet');
        expect(shared.CT.ODP).toBe('application/vnd.oasis.opendocument.presentation');
        expect(shared.CT.XML).toBe('text/xml');
        expect(shared.CT.FORMULA).toBe('application/vnd.oasis.opendocument.formula');
    });
});

describe('odfShared — text codec', () => {
    test('encodeText / decodeText round-trip', () => {
        const b = shared.encodeText('héllo €');
        expect(b).toBeInstanceOf(Uint8Array);
        expect(shared.decodeText(b)).toBe('héllo €');
    });
});

describe('odfShared — parseXmlOrThrow', () => {
    test('returns the parsed root on valid input', () => {
        const node = shared.parseXmlOrThrow('<root/>', 'test');
        expect(node.name).toBe('root');
    });

    test('throws ParseError on malformed input', () => {
        try {
            shared.parseXmlOrThrow('<oops', 'test', { module: 't' });
            throw new Error('expected throw');
        } catch (e) {
            expect(e.code).toBe('odf/parse-error/test');
        }
    });
});

describe('odfShared — sidecars', () => {
    const fakeMeta = {
        empty: () => ({ kind: 'meta-empty' }),
        parse: (s) => ({ parsedMeta: s }),
        serialize: (m) => 'META:' + (m.kind || '?')
    };
    const fakeSettings = {
        empty: () => ({ kind: 'settings-empty' }),
        parse: (s) => ({ parsedSettings: s }),
        serialize: (m) => 'SET:' + (m.kind || '?')
    };
    const fakeStyles = {
        empty: () => ({ kind: 'styles-empty' }),
        parse: (s) => ({ parsedStyles: s }),
        serialize: (m) => 'STY:' + (m.kind || '?')
    };

    test('readSidecars reads meta/settings/styles when present', () => {
        const target = {};
        const pkgModel = {
            parts: {
                'meta.xml':     shared.encodeText('m'),
                'settings.xml': shared.encodeText('s'),
                'styles.xml':   shared.encodeText('y')
            }
        };
        shared.readSidecars(target, pkgModel, {
            metaMod: fakeMeta, settingsMod: fakeSettings, stylesMod: fakeStyles
        });
        expect(target.meta).toEqual({ parsedMeta: 'm' });
        expect(target.settings).toEqual({ parsedSettings: 's' });
        expect(target.styles).toEqual({ parsedStyles: 'y' });
    });

    test('readSidecars skips absent parts', () => {
        const target = {};
        const pkgModel = { parts: {} };
        shared.readSidecars(target, pkgModel, {
            metaMod: fakeMeta, settingsMod: fakeSettings, stylesMod: fakeStyles
        });
        expect(target.meta).toBeUndefined();
    });

    test('writeSidecars sets all three parts on the package', () => {
        const setCalls = [];
        const fakePkg = { setPart(p, path, bytes, ct) { setCalls.push({ path, ct, text: shared.decodeText(bytes) }); } };
        shared.writeSidecars({}, {}, {}, {
            pkg: fakePkg, metaMod: fakeMeta, settingsMod: fakeSettings, stylesMod: fakeStyles
        }, 'text/xml');
        expect(setCalls.length).toBe(3);
        expect(setCalls[0].path).toBe('meta.xml');
        expect(setCalls[1].path).toBe('settings.xml');
        expect(setCalls[2].path).toBe('styles.xml');
        expect(setCalls.every(c => c.ct === 'text/xml')).toBe(true);
    });
});

describe('odfShared — findDeep', () => {
    test('returns the matching descendant element', () => {
        const root = xmlMod.parse(
            '<a><b><c name="x"/></b><d/></a>');
        const c = shared.findDeep(root, 'c');
        expect(c).toBeTruthy();
        expect(c.name).toBe('c');
    });

    test('returns null when not found', () => {
        const root = xmlMod.parse('<a><b/></a>');
        expect(shared.findDeep(root, 'z')).toBeNull();
    });

    test('returns the root itself when it matches', () => {
        const root = xmlMod.parse('<a/>');
        expect(shared.findDeep(root, 'a')).toBe(root);
    });
});

describe('odfShared — attr helpers', () => {
    test('intAttr returns parsed integer / undefined', () => {
        const el = { attrs: { 'x': '42', 'y': 'nope' } };
        expect(shared.intAttr(el, 'x')).toBe(42);
        expect(shared.intAttr(el, 'y')).toBeUndefined();
        expect(shared.intAttr(el, 'z')).toBeUndefined();
        expect(shared.intAttr({}, 'x')).toBeUndefined();
    });

    test('boundedIntAttr respects max and minStrict', () => {
        const el = { attrs: { 'r': '5', 'big': '99' } };
        expect(shared.boundedIntAttr(el, 'r')).toBe(5);
        expect(shared.boundedIntAttr(el, 'r', { max: 10 })).toBe(5);
        try {
            shared.boundedIntAttr(el, 'big', { max: 10, label: 'rep', module: 'test' });
            throw new Error('expected throw');
        } catch (e) {
            expect(e.code).toBe('odf/parse-error/limit');
        }
        // minStrict default = 1 → value 1 returns undefined
        expect(shared.boundedIntAttr({ attrs: { 'r': '1' } }, 'r')).toBeUndefined();
    });
});

describe('odfShared — writeSidecars fallbacks and generator', () => {
    const OURS = '@awacloud/odf';
    const metaMod = {
        empty: () => ({ generator: OURS }),
        serialize: (m) => JSON.stringify(m)
    };
    const settingsMod = { empty: () => ({ kind: 'settings-empty' }), serialize: (m) => JSON.stringify(m) };
    const stylesMod = { empty: () => ({ kind: 'styles-empty' }), serialize: (m) => JSON.stringify(m) };

    function run(doc, opts) {
        const out = {};
        const pkg = { setPart(p, path, bytes) { out[path] = JSON.parse(shared.decodeText(bytes)); } };
        shared.writeSidecars({}, doc, opts, { pkg, metaMod, settingsMod, stylesMod }, 'text/xml');
        return out;
    }

    test('doc.styles / doc.settings are used when opts lacks them', () => {
        const out = run({ styles: { kind: 'doc-styles' }, settings: { kind: 'doc-settings' } }, {});
        expect(out['styles.xml']).toEqual({ kind: 'doc-styles' });
        expect(out['settings.xml']).toEqual({ kind: 'doc-settings' });
    });

    test('opts.styles / opts.settings win over doc.*', () => {
        const out = run(
            { styles: { kind: 'doc-styles' }, settings: { kind: 'doc-settings' } },
            { styles: { kind: 'opt-styles' }, settings: { kind: 'opt-settings' } });
        expect(out['styles.xml']).toEqual({ kind: 'opt-styles' });
        expect(out['settings.xml']).toEqual({ kind: 'opt-settings' });
    });

    test('empty() is the last fallback', () => {
        const out = run({}, {});
        expect(out['styles.xml']).toEqual({ kind: 'styles-empty' });
        expect(out['settings.xml']).toEqual({ kind: 'settings-empty' });
        expect(out['meta.xml']).toEqual({ generator: OURS });
    });

    test('doc.meta generator is overwritten, other fields kept, doc.meta not mutated', () => {
        const docMeta = { title: 'T', generator: 'LibreOffice/24.2' };
        const out = run({ meta: docMeta }, {});
        expect(out['meta.xml']).toEqual({ title: 'T', generator: OURS });
        expect(docMeta).toEqual({ title: 'T', generator: 'LibreOffice/24.2' });
    });

    test('opts.meta without a generator gets ours, caller object not mutated', () => {
        const optMeta = { title: 'O' };
        const out = run({ meta: { title: 'D', generator: 'X' } }, { meta: optMeta });
        expect(out['meta.xml']).toEqual({ title: 'O', generator: OURS });
        expect(optMeta).toEqual({ title: 'O' });
    });

    test('an explicit opts.meta.generator is kept: the caller object is serialized untouched', () => {
        const optMeta = { title: 'O', generator: 'MyApp/1' };
        let seen = null;
        const pkg = { setPart() {} };
        const spyMeta = { ...metaMod, serialize: (m) => { if (!seen) seen = m; return '{}'; } };
        shared.writeSidecars({}, {}, { meta: optMeta }, { pkg, metaMod: spyMeta, settingsMod, stylesMod });
        expect(seen).toBe(optMeta);
        expect(optMeta).toEqual({ title: 'O', generator: 'MyApp/1' });
    });
});

describe('odfShared — carryParts', () => {
    const MIMETYPE_PATH = 'mimetype';
    const MANIFEST_PATH = 'META-INF/manifest.xml';
    function fakes() {
        const setPartCalls = [];
        const setEntryCalls = [];
        const pkg = {
            MIMETYPE_PATH, MANIFEST_PATH,
            setPart(p, path, bytes, mediaType) {
                setPartCalls.push({ path, bytes, mediaType });
                p.parts[path] = bytes;
            }
        };
        const manifestMod = {
            setEntry(manifest, fullPath, mediaType) { setEntryCalls.push({ manifest, fullPath, mediaType }); }
        };
        return { pkg, manifestMod, setPartCalls, setEntryCalls };
    }
    const b = (n) => new Uint8Array([n]);

    test('REGENERATED_PARTS is frozen and names the four XML parts', () => {
        expect(Object.isFrozen(shared.REGENERATED_PARTS)).toBe(true);
        expect([...shared.REGENERATED_PARTS]).toEqual(['content.xml', 'meta.xml', 'settings.xml', 'styles.xml']);
    });

    test('regenerated, mimetype and manifest paths are skipped', () => {
        const f = fakes();
        const p = { parts: {}, manifest: { entries: [] } };
        const source = {
            manifest: { entries: [] },
            parts: {
                'content.xml': b(1), 'meta.xml': b(2), 'settings.xml': b(3), 'styles.xml': b(4),
                [MIMETYPE_PATH]: b(5), [MANIFEST_PATH]: b(6), 'Thumbnails/t.png': b(7)
            }
        };
        shared.carryParts(p, source, f);
        expect(f.setPartCalls.map(c => c.path)).toEqual(['Thumbnails/t.png']);
    });

    test('a part already present on p is not overwritten', () => {
        const f = fakes();
        const mine = b(9);
        const p = { parts: { 'Pictures/a.png': mine }, manifest: { entries: [] } };
        shared.carryParts(p, { parts: { 'Pictures/a.png': b(1) } }, f);
        expect(f.setPartCalls.length).toBe(0);
        expect(p.parts['Pictures/a.png']).toBe(mine);
    });

    test('media type from the source manifest, fallback octet-stream, bytes carried as-is', () => {
        const f = fakes();
        const p = { parts: {}, manifest: { entries: [] } };
        const png = b(1);
        const blob = b(2);
        shared.carryParts(p, {
            manifest: { entries: [{ fullPath: 'Pictures/a.png', mediaType: 'image/png' }] },
            parts: { 'Pictures/a.png': png, 'blob.bin': blob }
        }, f);
        const byPath = Object.fromEntries(f.setPartCalls.map(c => [c.path, c]));
        expect(byPath['Pictures/a.png'].mediaType).toBe('image/png');
        expect(byPath['Pictures/a.png'].bytes).toBe(png);
        expect(byPath['blob.bin'].mediaType).toBe('application/octet-stream');
        expect(byPath['blob.bin'].bytes).toBe(blob);
    });

    test('directory entries are re-declared via setEntry; root and file entries are not', () => {
        const f = fakes();
        const p = { parts: {}, manifest: { entries: [] } };
        shared.carryParts(p, {
            manifest: { entries: [
                { fullPath: '/', mediaType: 'application/vnd.oasis.opendocument.text' },
                { fullPath: 'Configurations2/', mediaType: 'application/vnd.sun.xml.ui.configuration' },
                { fullPath: 'Object 1/' },
                { fullPath: 'x.xml', mediaType: 'text/xml' }
            ] },
            parts: {}
        }, f);
        expect(f.setEntryCalls.map(c => [c.fullPath, c.mediaType])).toEqual([
            ['Configurations2/', 'application/vnd.sun.xml.ui.configuration'],
            ['Object 1/', '']
        ]);
        expect(f.setEntryCalls.every(c => c.manifest === p.manifest)).toBe(true);
    });

    test('no-op without source or source.parts', () => {
        const f = fakes();
        const p = { parts: {}, manifest: { entries: [] } };
        expect(shared.carryParts(p, undefined, f)).toBe(p);
        expect(shared.carryParts(p, null, f)).toBe(p);
        expect(shared.carryParts(p, { manifest: { entries: [{ fullPath: 'D/' }] } }, f)).toBe(p);
        expect(f.setPartCalls.length).toBe(0);
        expect(f.setEntryCalls.length).toBe(0);
    });
});

describe('odfShared — namespace declarations', () => {
    const { ODF_NS, ODF_PREFIXES, sourceNamespaces, declareNamespaces } = shared;
    const { RenderError } = errors;
    const ser = el => xmlMod.serializeNode(el);

    test('ODF_PREFIXES is frozen and derived from ODF_NS, plus the extension prefixes', () => {
        expect(Object.isFrozen(ODF_PREFIXES)).toBe(true);
        for (const k of Object.keys(ODF_NS)) expect(ODF_PREFIXES[k.toLowerCase()]).toBe(ODF_NS[k]);
        expect(ODF_PREFIXES.of).toBe(ODF_NS.OF);
        expect(ODF_PREFIXES.dr3d).toBe(ODF_NS.DR3D);
        expect(ODF_PREFIXES.loext).toBe('urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0');
        expect(ODF_PREFIXES.ooow).toBe('http://openoffice.org/2004/writer');
        expect(ODF_PREFIXES.formx).toBe('urn:openoffice:names:experimental:ooxml-odf-interop:xmlns:form:1.0');
        expect(Object.keys(ODF_PREFIXES)).toHaveLength(Object.keys(ODF_NS).length + 12);
        for (const p of ['officeooo', 'tableooo', 'drawooo', 'calcext', 'field']) {
            expect(ODF_PREFIXES[p]).toBeUndefined();
        }
    });

    test('missing declarations go right after the last xmlns:* attribute, sorted by prefix', () => {
        const root = xmlMod.el('office:x', {
            'xmlns:office': ODF_NS.OFFICE, 'office:a': '1', 'xmlns:style': ODF_NS.STYLE, 'office:version': '1.4'
        }, [xmlMod.el('text:p', { 'draw:k': '1', 'style:n': 'P' }, [])]);
        declareNamespaces(root);
        expect(Object.keys(root.attrs)).toEqual([
            'xmlns:office', 'office:a', 'xmlns:style', 'xmlns:draw', 'xmlns:text', 'office:version'
        ]);
        expect(root.attrs['xmlns:draw']).toBe(ODF_NS.DRAW);
        expect(root.attrs['xmlns:text']).toBe(ODF_NS.TEXT);
    });

    test('a root without any xmlns:* attribute gets the declarations first', () => {
        const root = xmlMod.el('office:x', { 'office:version': '1.4' }, [xmlMod.el('text:p', {}, [])]);
        declareNamespaces(root);
        expect(Object.keys(root.attrs)).toEqual(['xmlns:office', 'xmlns:text', 'office:version']);
    });

    test('nothing missing: same keys in the same order, in a new attrs object', () => {
        const attrs = { 'xmlns:office': ODF_NS.OFFICE, 'xmlns:text': ODF_NS.TEXT, 'office:version': '1.4' };
        const root = xmlMod.el('office:x', attrs, [xmlMod.el('text:p', {}, [])]);
        const before = ser(root);
        expect(declareNamespaces(root)).toBe(root);
        expect(root.attrs).not.toBe(attrs);
        expect(Object.keys(root.attrs)).toEqual(Object.keys(attrs));
        expect(ser(root)).toBe(before);
    });

    test('idempotent: twice equals once', () => {
        const make = () => xmlMod.el('office:x', {}, [xmlMod.el('draw:frame', { 'svg:width': '1cm' }, [])]);
        const once = ser(declareNamespaces(make()));
        expect(ser(declareNamespaces(declareNamespaces(make())))).toBe(once);
    });

    test('xml is implicit and xmlns attributes are not uses', () => {
        const root = xmlMod.el('x', { xmlns: 'urn:default', 'xml:id': 'a' }, []);
        declareNamespaces(root);
        expect(Object.keys(root.attrs)).toEqual(['xmlns', 'xml:id']);
    });

    test('a descendant-local declaration covers that subtree only', () => {
        const inner = () => xmlMod.el('acme:a', { 'xmlns:acme': 'urn:local' }, [xmlMod.el('acme:b', {}, [])]);
        const covered = declareNamespaces(xmlMod.el('office:x', {}, [inner()]));
        expect(covered.attrs['xmlns:acme']).toBeUndefined();
        const outside = declareNamespaces(xmlMod.el('office:x', {}, [inner(), xmlMod.el('acme:c', {}, [])]),
            { carried: { acme: 'urn:carried' } });
        expect(outside.attrs['xmlns:acme']).toBe('urn:carried');
    });

    test('carried declarations win over the known table', () => {
        const root = declareNamespaces(xmlMod.el('office:x', {}, [xmlMod.el('loext:y', {}, [])]),
            { carried: { loext: 'urn:example:source-loext' } });
        expect(root.attrs['xmlns:loext']).toBe('urn:example:source-loext');
    });

    test('an unresolvable prefix throws RenderError odf/render-error/namespace', () => {
        let err = null;
        try {
            declareNamespaces(xmlMod.el('office:x', {}, [xmlMod.el('text:p', { 'zzz:a': '1' }, [])]),
                { part: 'content.xml', module: 'odt' });
        } catch (e) { err = e; }
        expect(err).toBeInstanceOf(RenderError);
        expect(err.code).toBe('odf/render-error/namespace');
        expect(err.message).toBe('odf: namespace prefix "zzz" is used but not declared');
        expect(err.context).toEqual({ module: 'odt', part: 'content.xml', prefix: 'zzz' });
    });

    test('formula values: a resolvable value prefix is declared, an unknown one is left alone', () => {
        const root = declareNamespaces(xmlMod.el('office:x', { 'xmlns:table': ODF_NS.TABLE, 'xmlns:text': ODF_NS.TEXT }, [
            xmlMod.el('table:table-cell', { 'table:formula': 'ooow:<A1>+1' }, []),
            xmlMod.el('text:p', { 'text:condition': 'zz:page==1' }, []),
            xmlMod.el('text:p', { 'text:formula': 'acme:x', 'text:name': 'of:not-a-formula' }, [])
        ]), { carried: { acme: 'urn:carried' } });
        expect(root.attrs['xmlns:ooow']).toBe('http://openoffice.org/2004/writer');
        expect(root.attrs['xmlns:acme']).toBe('urn:carried');
        expect(root.attrs['xmlns:zz']).toBeUndefined();
        expect(root.attrs['xmlns:of']).toBeUndefined();
    });

    test('sourceNamespaces reads the root xmlns:* declarations only', () => {
        const text = '﻿<?xml version="1.0"?>\n<!-- c -->\n'
            + '<office:document-content xmlns="urn:default" xmlns:office="u-office" xmlns:acme=\'urn:a&amp;b\''
            + ' office:version="1.3"><office:body xmlns:inner="u-inner"/></office:document-content>';
        const ns = sourceNamespaces({ parts: { 'content.xml': shared.encodeText(text) } }, 'content.xml');
        expect(Object.isFrozen(ns)).toBe(true);
        expect(ns).toEqual({ office: 'u-office', acme: 'urn:a&b' });
    });

    test('sourceNamespaces finds a root start tag beyond the first decoded slice', () => {
        const text = '<?xml version="1.0"?><!--' + 'x'.repeat(9000) + '--><r:root xmlns:r="u-r"><r:k/></r:root>';
        const ns = sourceNamespaces({ parts: { 'a.xml': shared.encodeText(text) } }, 'a.xml');
        expect(ns).toEqual({ r: 'u-r' });
    });

    test('sourceNamespaces: missing package / part / garbage → {} (never throws)', () => {
        expect(sourceNamespaces(undefined, 'content.xml')).toEqual({});
        expect(sourceNamespaces({}, 'content.xml')).toEqual({});
        expect(sourceNamespaces({ parts: {} }, 'content.xml')).toEqual({});
        const garbage = new Uint8Array([0xff, 0x00, 0x3c, 0x61, 0x20, 0x62, 0x3d, 0x22, 0xfe]);
        expect(sourceNamespaces({ parts: { 'content.xml': garbage } }, 'content.xml')).toEqual({});
        const bad = shared.encodeText('<r:root xmlns:r=u-r>');
        expect(sourceNamespaces({ parts: { 'content.xml': bad } }, 'content.xml')).toEqual({});
        expect(Object.isFrozen(sourceNamespaces(undefined, 'x'))).toBe(true);
    });

    test('writeSidecars forwards each source part\'s declarations to its serializer', () => {
        const seen = {};
        const spy = (name) => ({
            empty: () => ({}),
            serialize: (m, opts) => { seen[name] = opts; return ''; }
        });
        const doc = { package: { parts: {
            'meta.xml': shared.encodeText('<office:document-meta xmlns:ooo="u-ooo"/>'),
            'styles.xml': shared.encodeText('<office:document-styles xmlns:draw="u-draw"/>')
        } } };
        shared.writeSidecars({}, doc, {}, {
            pkg: { setPart() {} }, metaMod: spy('meta'), settingsMod: spy('settings'), stylesMod: spy('styles')
        });
        expect(seen.meta).toEqual({ namespaces: { ooo: 'u-ooo' } });
        expect(seen.settings).toEqual({ namespaces: {} });
        expect(seen.styles).toEqual({ namespaces: { draw: 'u-draw' } });
    });
});
