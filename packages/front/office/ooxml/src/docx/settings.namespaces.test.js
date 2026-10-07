// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docxSettings.serialize` writes a namespace-well-formed `word/settings.xml`:
 * the `w:settings` root declares `w` plus every other prefix its tree uses
 * (modelled children and `_extras`), lists the Office extension prefixes in
 * `mc:Ignorable`, and refuses a prefix with no known namespace.
 *
 * The oracle below is an independent namespace-scope checker: it parses a
 * written part, walks it with a stack of the prefixes declared by each
 * element and its ancestors (`xmlns:*` attributes) and lists every element
 * or attribute prefix used outside the scope of a declaration (`xml` and
 * `xmlns` are exempt). It does not use the writer's own code.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const d = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const xml = runtime.resolve('xml');
const settingsMod = runtime.resolve('docxSettings');
const errors = runtime.resolve('ooxmlErrors');
const decoder = new TextDecoder();

const WORD_FIXTURE = new URL('../../tests/_fixtures/word-repeating-section.docx', import.meta.url);
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------------------------------------------------------------------------
// Independent oracle: namespace-scope checker
// ---------------------------------------------------------------------------

/**
 * Every prefix used by an element or attribute name outside the scope of
 * its declaration, as `prefix (qualified name)` strings in document order.
 * `[]` means the part is namespace-well-formed for prefixes.
 */
function undeclaredPrefixes(xmlText) {
    const missing = [];
    function check(qname, scope) {
        const i = qname.indexOf(':');
        if (i < 0) return;
        const prefix = qname.slice(0, i);
        if (prefix === 'xml' || prefix === 'xmlns') return;
        if (!scope.has(prefix)) missing.push(`${prefix} (${qname})`);
    }
    function walk(node, parentScope) {
        if (!node || node.type !== 'element') return;
        const scope = new Set(parentScope);
        const attrs = node.attrs || {};
        for (const k of Object.keys(attrs)) {
            if (k.startsWith('xmlns:')) scope.add(k.slice('xmlns:'.length));
        }
        check(node.name, scope);
        for (const k of Object.keys(attrs)) check(k, scope);
        for (const c of node.children || []) walk(c, scope);
    }
    walk(xml.parse(xmlText), new Set());
    return missing;
}

/** The root element's attributes of a serialized XML part. */
function rootAttrs(xmlText) {
    return xml.parse(xmlText).attrs;
}

/** The `xmlns:<p>` declarations of a root, as a `{ prefix: uri }` map. */
function declaredPrefixes(attrs) {
    const out = {};
    for (const [k, v] of Object.entries(attrs)) {
        if (k.startsWith('xmlns:')) out[k.slice('xmlns:'.length)] = v;
    }
    return out;
}

/** The literal start tag of the `w:settings` root. */
function rootTag(xmlText) {
    const at = xmlText.indexOf('<w:settings');
    return xmlText.slice(at, xmlText.indexOf('>', at) + 1);
}

function fixtureBytes() {
    return new Uint8Array(readFileSync(WORD_FIXTURE));
}

function fixtureSettingsXml() {
    return decoder.decode(opc.read(fixtureBytes()).parts['/word/settings.xml']);
}

function rewriteFixture() {
    const r = d.read(fixtureBytes());
    const out = d.write(r.document, { settings: r.settings, styles: r.styles, numbering: r.numbering });
    return { r, out, settingsXml: decoder.decode(opc.read(out).parts['/word/settings.xml']) };
}

// ---------------------------------------------------------------------------

describe('namespace-scope oracle', () => {
    test('is not vacuous: an undeclared m: element is reported', () => {
        const text = `<w:settings xmlns:w="${NS_W}"><m:mathPr/></w:settings>`;
        expect(undeclaredPrefixes(text)).toEqual(['m (m:mathPr)']);
    });

    test('is not vacuous: an undeclared attribute prefix is reported', () => {
        const text = `<w:settings xmlns:w="${NS_W}"><w:shapeDefaults v:ext="edit"/></w:settings>`;
        expect(undeclaredPrefixes(text)).toEqual(['v (v:ext)']);
    });

    test('the Word fixture source part is clean', () => {
        expect(undeclaredPrefixes(fixtureSettingsXml())).toEqual([]);
    });
});

describe('docxSettings.serialize — Word document rewrite', () => {
    test('word/settings.xml re-written from a Word document declares every prefix it uses', () => {
        const { settingsXml } = rewriteFixture();
        expect(undeclaredPrefixes(settingsXml)).toEqual([]);
    });

    test('the rewritten root declares exactly w, m, o, v, w14, w15, mc and mc:Ignorable="w14 w15"', () => {
        const { settingsXml } = rewriteFixture();
        const attrs = rootAttrs(settingsXml);
        expect(Object.keys(declaredPrefixes(attrs)).sort())
            .toEqual(['m', 'mc', 'o', 'v', 'w', 'w14', 'w15']);
        expect(attrs['mc:Ignorable']).toBe('w14 w15');
    });

    test('a re-read of the rewrite gives back the same settings (extras survive a second pass)', () => {
        const { r, out } = rewriteFixture();
        expect(d.read(out).settings).toEqual(r.settings);
    });
});

describe('docxSettings.serialize — prefix table', () => {
    // One node per table prefix (`mc` is added by the extension prefixes).
    const everyPrefix = () => [
        xml.el('w:attachedSchema', { 'r:id': 'rId1' }),
        xml.el('m:mathPr', {}),
        xml.el('o:shapelayout', {}),
        xml.el('v:fill', {}),
        xml.el('w10:wrap', {}),
        xml.el('w14:docId', {}),
        xml.el('w15:docId', {}),
        xml.el('w16cex:x', {}),
        xml.el('w16cid:x', {}),
        xml.el('w16:x', {}),
        xml.el('w16sdtdh:x', {}),
        xml.el('w16se:x', {}),
        xml.el('sl:schemaLibrary', {})
    ];

    test('table URIs equal the Word fixture root URIs for every prefix both declare', () => {
        const source = declaredPrefixes(rootAttrs(fixtureSettingsXml()));
        const written = declaredPrefixes(rootAttrs(settingsMod.serialize({ _extras: everyPrefix() })));
        const shared = Object.keys(written).filter((p) => p in source);
        expect(shared.sort()).toEqual(Object.keys(source).sort());
        for (const p of shared) expect([p, written[p]]).toEqual([p, source[p]]);
    });

    test('declarations follow the table order, mc:Ignorable placed last in table order', () => {
        const attrs = rootAttrs(settingsMod.serialize({ _extras: everyPrefix().reverse() }));
        expect(Object.keys(attrs)).toEqual([
            'xmlns:w', 'xmlns:r', 'xmlns:m', 'xmlns:o', 'xmlns:v', 'xmlns:w10',
            'xmlns:w14', 'xmlns:w15', 'xmlns:w16cex', 'xmlns:w16cid', 'xmlns:w16',
            'xmlns:w16sdtdh', 'xmlns:w16se', 'xmlns:sl', 'xmlns:mc', 'mc:Ignorable'
        ]);
        expect(attrs['mc:Ignorable']).toBe('w14 w15 w16cex w16cid w16 w16sdtdh w16se');
    });
});

describe('docxSettings.serialize — root attributes', () => {
    test('a w-only tree keeps the plain root', () => {
        const text = settingsMod.serialize({ defaultTabStop: 720 });
        expect(rootTag(text)).toBe(`<w:settings xmlns:w="${NS_W}">`);
    });

    test('a w10 extra declares w10 and no mc:Ignorable', () => {
        const attrs = rootAttrs(settingsMod.serialize({ _extras: [xml.el('w10:foo', {})] }));
        expect(Object.keys(attrs)).toEqual(['xmlns:w', 'xmlns:w10']);
        expect(attrs['xmlns:w10']).toBe('urn:schemas-microsoft-com:office:word');
    });

    test('an attribute-only prefix (v:ext on a w: element) declares v', () => {
        const ex = xml.el('w:shapeDefaults', {}, [xml.el('w:x', { 'v:ext': 'edit' })]);
        const text = settingsMod.serialize({ _extras: [ex] });
        expect(Object.keys(rootAttrs(text))).toEqual(['xmlns:w', 'xmlns:v']);
        expect(undeclaredPrefixes(text)).toEqual([]);
    });

    test('a prefix with no known namespace throws docx/settings-unknown-prefix, obj untouched', () => {
        const obj = {
            defaultTabStop: 720,
            _extras: [xml.el('w:compat', {}), xml.el('zz:foo', {}), xml.el('yy:bar', {})]
        };
        const before = structuredClone(obj);
        let err;
        try { settingsMod.serialize(obj); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(errors.RenderError);
        expect(err.code).toBe('docx/settings-unknown-prefix');
        expect(err.context.prefix).toBe('zz');
        expect(obj).toEqual(before);
    });
});
