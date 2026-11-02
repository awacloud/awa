// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Schema order of what the docx writers emit for children
 * they keep verbatim: `w:tcPr` (core), `w:tblPr` and `w:compat` (the
 * docx-large bundle's extensions), `w:uiCompat97To2003` (settings).
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import * as ooxmlMods from '../main.js';

const rt = new ModuleRuntime();
for (const m of [fwXml, ...ooxmlMods.modules, ...ooxmlMods.extras]) rt.register(m);
const xml = rt.resolve('xml');
const structure = rt.resolve('docxStructure');
const settings = rt.resolve('docxSettings');
const tableProps = rt.resolve('wmlTableProperties');
const wmlSettings = rt.resolve('wmlSettings');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const el = (s) => xml.parse(s.replace(/^<([\w:]+)/, `<$1 ${W}`));
const names = (node) => (node.children || []).filter((c) => c.type === 'element').map((c) => c.name);

describe('schema order of kept children', () => {
    test('w:tcPr: a kept cnfStyle goes first, tcBorders and noWrap after vMerge (CT_TcPr)', () => {
        const cell = {
            type: 'cell', children: [{ type: 'paragraph', children: [] }],
            tcPr: {
                width: { w: 2000, type: 'dxa' }, gridSpan: 2, vMerge: 'continue',
                _extras: [el('<w:noWrap/>'), el('<w:cnfStyle w:val="100000000000"/>'), el('<w:tcBorders/>')]
            }
        };
        const tc = structure.renderCell(cell);
        const tcPr = tc.children.find((c) => c.name === 'w:tcPr');
        expect(names(tcPr)).toEqual(['w:cnfStyle', 'w:tcW', 'w:gridSpan', 'w:vMerge', 'w:tcBorders', 'w:noWrap']);
    });

    test('w:tblPr (wmlTableProperties): shd and tblLayout before tblCellMar (CT_TblPr)', () => {
        const node = tableProps.renderTblPr({
            tblStyle: 'Grid', width: { w: 5000, type: 'pct' },
            cellMargins: { left: { w: 108, type: 'dxa' } }, tblLayout: 'fixed',
            tblLook: { 'w:val': '04A0' }, _extras: [el('<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>')]
        });
        expect(names(node)).toEqual(['w:tblStyle', 'w:tblW', 'w:shd', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook']);
    });

    test('w:compat (wmlSettings): the kept legacy toggles before the compatSetting children', () => {
        const node = wmlSettings.renderCompat({
            settings: [{ name: 'compatibilityMode', uri: 'http://schemas.microsoft.com/office/word', val: '15' }],
            _extras: [el('<w:spaceForUL/>'), el('<w:useFELayout/>')]
        });
        expect(names(node)).toEqual(['w:spaceForUL', 'w:useFELayout', 'w:compatSetting']);
    });

    test('settings: w:uiCompat97To2003 after m:mathPr, before w:themeFontLang', () => {
        const parsed = settings.parse(new TextEncoder().encode(
            `<w:settings ${W} xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">`
            + '<w:zoom w:percent="100"/><w:themeFontLang w:val="en-US"/><m:mathPr><m:naryLim m:val="undOvr"/></m:mathPr>'
            + '<w:uiCompat97To2003/></w:settings>'));
        const out = new TextDecoder().decode(settings.bytesOf(parsed));
        const order = [...out.matchAll(/<(w:zoom|m:mathPr|w:uiCompat97To2003|w:themeFontLang)\b/g)].map((m) => m[1]);
        expect(order).toEqual(['w:zoom', 'm:mathPr', 'w:uiCompat97To2003', 'w:themeFontLang']);
    });
});

describe('the last validity defects (A30c)', () => {
    const math = rt.resolve('ooxmlMath');
    const comments = rt.resolve('docxComments');
    const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

    test('m:dPr: begChr, sepChr, endChr (CT_DPr)', () => {
        const d = math.parseMathElement(xml.parse(`<m:d ${M}><m:dPr><m:begChr m:val="["/><m:sepChr m:val=";"/><m:endChr m:val="]"/></m:dPr><m:e><m:r><m:t>a</m:t></m:r></m:e></m:d>`));
        const dPr = math.renderMathElement(d).children.find((c) => c.name === 'm:dPr');
        expect(names(dPr)).toEqual(['m:begChr', 'm:sepChr', 'm:endChr']);
    });

    test('an empty w:author of a revision or a comment is read and written back', () => {
        const p = structure.parseParagraph(el('<w:p><w:ins w:id="1" w:author="" w:date="2013-08-27T08:29:00Z"><w:r><w:t>x</w:t></w:r></w:ins></w:p>'));
        const ins = structure.renderParagraph(p).children.find((c) => c.name === 'w:ins');
        expect(ins.attrs).toEqual({ 'w:id': '1', 'w:author': '', 'w:date': '2013-08-27T08:29:00Z' });
        const noAuthor = structure.renderParagraph(structure.parseParagraph(el('<w:p><w:ins w:id="2"><w:r><w:t>y</w:t></w:r></w:ins></w:p>')));
        expect(noAuthor.children.find((c) => c.name === 'w:ins').attrs).toEqual({ 'w:id': '2' });
        const parsed = comments.parse(new TextEncoder().encode(`<w:comments ${W}><w:comment w:id="0" w:author=""><w:p/></w:comment></w:comments>`));
        expect(new TextDecoder().decode(comments.bytesOf(parsed))).toContain('w:author=""');
    });

    test('wmlSettings: noLineBreaksBefore / After keep w:lang and w:val when unchanged', () => {
        const root = { _extras: [
            el('<w:noLineBreaksAfter w:lang="ja-JP" w:val="$([{"/>'),
            el('<w:noLineBreaksBefore w:lang="ja-JP" w:val="!%),."/>')
        ] };
        wmlSettings.hydrate(root);
        expect([root.noLineBreaksAfter, root.noLineBreaksBefore]).toEqual([true, true]);
        const out = wmlSettings.dehydrate(root);
        const after = out._extras.find((c) => c.name === 'w:noLineBreaksAfter');
        expect([after.attrs['w:lang'], after.attrs['w:val']]).toEqual(['ja-JP', '$([{']);
        const changed = { _extras: [el('<w:noLineBreaksAfter w:lang="ja-JP" w:val="$("/>')] };
        wmlSettings.hydrate(changed);
        changed.noLineBreaksAfter = false;
        expect(wmlSettings.dehydrate(changed)._extras.find((c) => c.name === 'w:noLineBreaksAfter').attrs).toEqual({ 'w:val': '0' });
    });
});
