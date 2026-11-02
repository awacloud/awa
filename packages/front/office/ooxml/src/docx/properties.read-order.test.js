// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The run, paragraph and table property bags read their preserved
 * children (`_extras`) in the schema order their writer emits, so a
 * source that lists them out of order reads as its written form does:
 * parse → render → parse is a fixed point.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const p = runtime.resolve('docxProperties');
const xml = runtime.resolve('xml');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const el = (s) => xml.parse(s.replace(/^<(w:\w+)/, `<$1 ${NS}`));
const again = (rendered) => el(xml.serialize(rendered).replace(/^<\?xml[^>]*>\s*/, ''));
const names = (bag) => bag._extras.map((n) => n.name);

describe('docxProperties — preserved children read in schema order', () => {
    test('rPr: webHidden before vanish (and rStyle after both) reads vanish, webHidden', () => {
        const once = p.parseRunProperties(el('<w:rPr><w:webHidden/><w:rStyle w:val="IndexLink"/><w:vanish w:val="false"/></w:rPr>'));
        expect(once.rStyle).toBe('IndexLink');
        expect(names(once)).toEqual(['w:vanish', 'w:webHidden']);
        expect(p.parseRunProperties(again(p.renderRunProperties(once)))).toEqual(once);
    });

    test('pPr: widowControl before keepNext reads keepNext, widowControl', () => {
        const once = p.parseParagraphProperties(el('<w:pPr><w:widowControl/><w:jc w:val="center"/><w:keepNext/></w:pPr>'));
        expect(names(once)).toEqual(['w:keepNext', 'w:widowControl']);
        expect(p.parseParagraphProperties(again(p.renderParagraphProperties(once)))).toEqual(once);
    });

    test('tblPr: tblLook before tblLayout reads tblLayout, tblLook', () => {
        const once = p.parseTableProperties(el('<w:tblPr><w:tblLook w:val="04A0"/><w:tblStyle w:val="Grid"/><w:tblLayout w:type="fixed"/></w:tblPr>'));
        expect(names(once)).toEqual(['w:tblLayout', 'w:tblLook']);
        expect(p.parseTableProperties(again(p.renderTableProperties(once)))).toEqual(once);
    });

    test('a bag already in schema order reads as before', () => {
        const once = p.parseRunProperties(el('<w:rPr><w:noProof/><w:vanish/><w:webHidden/></w:rPr>'));
        expect(names(once)).toEqual(['w:noProof', 'w:vanish', 'w:webHidden']);
    });

    test('a child the sequence does not list reads where the writer puts it: after the listed ones, before the change entry', () => {
        const once = p.parseRunProperties(el('<w:rPr><w:noProof/><w:xUnknown/><w:webHidden/></w:rPr>'));
        expect(names(once)).toEqual(['w:noProof', 'w:webHidden', 'w:xUnknown']);
        expect(p.parseRunProperties(again(p.renderRunProperties(once)))).toEqual(once);
    });
});
