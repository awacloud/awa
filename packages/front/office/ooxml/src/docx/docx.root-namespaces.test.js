// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `word/document.xml` written by `docx.write` declares every prefix it uses
 * (BL-2456: inline and anchored pictures were emitted as `wp:` elements with
 * no `xmlns:wp` in scope, which Word refuses).
 *
 * The oracle is an independent namespace-scope checker (the same shape as
 * `docx.story-markup.test.js`): it walks the written part with a stack of the
 * prefixes declared by each element and its ancestors and lists every element
 * or attribute prefix used outside the scope of a declaration.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const docx = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const xml = runtime.resolve('xml');
const decoder = new TextDecoder();

const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

/** Prefixes used outside the scope of a declaration, in document order. */
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

function documentXml(body) {
    const pkg = opc.read(docx.write({ body }));
    return decoder.decode(pkg.parts['/word/document.xml']);
}

const para = (...children) => ({ type: 'paragraph', children });
const run = (children) => ({ type: 'run', children });
const picture = (mode, docId) => run([{
    type: 'drawing', mode, cx: 914400, cy: 685800, docId,
    docName: `Picture ${docId}`, description: 'alt', image: { data: PNG, contentType: 'image/png' },
}]);

describe('docx.write — document root namespaces (BL-2456)', () => {
    test('the oracle goes red on an undeclared wp element (non-vacuity)', () => {
        expect(undeclaredPrefixes('<w:document xmlns:w="u"><wp:inline/></w:document>'))
            .toEqual(['wp (wp:inline)']);
    });

    test('an inline picture: every prefix is declared, wp on the root', () => {
        const text = documentXml([para(picture('inline', 1))]);
        expect(text).toContain('<wp:inline');
        expect(undeclaredPrefixes(text)).toEqual([]);
        expect(xml.parse(text).attrs['xmlns:wp']).toBe(NS_WP);
    });

    test('an anchored picture: every prefix is declared', () => {
        const text = documentXml([para(picture('anchor', 2))]);
        expect(text).toContain('<wp:anchor');
        expect(undeclaredPrefixes(text)).toEqual([]);
    });

    test('a document without drawings keeps the w + r root', () => {
        const text = documentXml([para(run([{ type: 'text', value: 'plain' }]))]);
        expect(Object.keys(xml.parse(text).attrs)).toEqual(['xmlns:w', 'xmlns:r']);
    });
});

// Word-shaped roots: every declaration a real Word part carries.
const WORD_ROOT = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"'
    + ' mc:Ignorable="w14"';

describe('docx styles and numbering parts — root namespaces (BL-2456 audit)', () => {
    const stylesMod = runtime.resolve('docxStyles');
    const numberingMod = runtime.resolve('docxNumbering');

    test('styles keeping a w14 run property declare w14 (ignorable)', () => {
        const src = `<w:styles ${WORD_ROOT}><w:docDefaults><w:rPrDefault><w:rPr>`
            + '<w:sz w:val="24"/><w14:ligatures w14:val="standardContextual"/>'
            + '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
        const text = stylesMod.serialize(stylesMod.parse(src));
        expect(text).toContain('<w14:ligatures');
        expect(undeclaredPrefixes(text)).toEqual([]);
        expect(xml.parse(text).attrs['mc:Ignorable']).toBe('w14');
    });

    test('numbering keeping an mc:AlternateContent declares mc and the Requires prefix', () => {
        const src = `<w:numbering ${WORD_ROOT}><w:abstractNum w:abstractNumId="0">`
            + '<w:lvl w:ilvl="0"><w:start w:val="1"/>'
            + '<mc:AlternateContent><mc:Choice Requires="w14">'
            + '<w:numFmt w:val="custom" w:format="α, β, γ, ..."/></mc:Choice>'
            + '<mc:Fallback><w:numFmt w:val="decimal"/></mc:Fallback></mc:AlternateContent>'
            + '<w:lvlText w:val="%1."/></w:lvl></w:abstractNum>'
            + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
        const text = numberingMod.serialize(numberingMod.parse(src));
        expect(text).toContain('<mc:Choice Requires="w14">');
        expect(undeclaredPrefixes(text)).toEqual([]);
        const attrs = xml.parse(text).attrs;
        expect(attrs['xmlns:mc']).toBeDefined();
        expect(attrs['xmlns:w14']).toBe('http://schemas.microsoft.com/office/word/2010/wordml');
    });

    test('plain styles and numbering keep the w-only root', () => {
        const styles = stylesMod.serialize(stylesMod.defaults());
        expect(Object.keys(xml.parse(styles).attrs)).toEqual(['xmlns:w']);
        const numbering = numberingMod.serialize(numberingMod.decimalList());
        expect(Object.keys(xml.parse(numbering).attrs)).toEqual(['xmlns:w']);
    });
});
