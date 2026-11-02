// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `odt.read` option `textBoxes`: each text box of a frame run
 * typed with the body's model (`child.content`), the raw children kept; an
 * untouched box written as read, an edited one from its content.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as odf from '../main.js';

const core = new ModuleRuntime();
for (const m of [...odf.fw_require, ...odf.modules]) core.register(m);
const odt = core.resolve('odt');
const xml = core.resolve('xml');
const pkg = core.resolve('pkgPackage');

const el = (name, attrs = {}, children = []) => ({ type: 'element', name, attrs, children });
const txt = (value) => ({ type: 'text', value });
const p = (...children) => el('text:p', {}, children);
const box = (children) => ({ type: 'frame', anchorType: 'as-char', name: 'Box', width: '4cm', height: '2cm',
    child: { kind: 'text-box', attrs: {}, children } });
const image = el('draw:frame', { 'draw:name': 'Pic', 'text:anchor-type': 'as-char', 'svg:width': '1cm', 'svg:height': '1cm' },
    [el('draw:image', { 'xlink:href': 'Pictures/a.png', 'xlink:type': 'simple' })]);
const nested = el('draw:frame', { 'draw:name': 'Inner', 'text:anchor-type': 'as-char', 'svg:width': '2cm', 'svg:height': '1cm' },
    [el('draw:text-box', {}, [p(txt('inner'))])]);
const table = el('table:table', { 'table:name': 'T' }, [el('table:table-column'),
    el('table:table-row', {}, [el('table:table-cell', { 'office:value-type': 'string' }, [p(txt('cell'))])])]);
const source = odt.write({ body: [{ type: 'paragraph', runs: [
    { type: 'text', value: 'Before ' },
    box([p(txt('Box text '), image, txt(' after')), table, p(nested)])
] }] });
const OPTS = { framesInRuns: true, elementsInRuns: true, textBoxes: true };
const boxOf = (r) => r.body[0].runs.find((x) => x.type === 'frame');
const contentXml = (bytes) => new TextDecoder().decode(pkg.read(bytes).parts['content.xml']);
const boxXml = (bytes) => contentXml(bytes).match(/<draw:text-box[\s\S]*<\/draw:text-box>/)[0];

describe('odt.read textBoxes', () => {
    test('needs framesInRuns; off by default, the frame model as before', () => {
        expect(() => odt.read(source, { textBoxes: true })).toThrow(expect.objectContaining({ code: 'odf/contract-error/odt' }));
        expect('content' in boxOf(odt.read(source, { framesInRuns: true })).child).toBe(false);
    });

    test("a box's paragraphs, table and nested box read as content, the raw children kept", () => {
        const f = boxOf(odt.read(source, OPTS));
        expect(f.child.children.map((c) => c.name)).toEqual(['text:p', 'table:table', 'text:p']);
        expect(f.child.content.map((n) => n.type)).toEqual(['paragraph', 'table', 'paragraph']);
        expect(f.child.content[0].runs.map((r) => r.type)).toEqual(['text', 'frame', 'text']);
        const inner = f.child.content[2].runs.find((r) => r.type === 'frame');
        expect(inner.child.content[0].runs).toEqual([{ type: 'text', value: 'inner' }]);
    });

    test('an untouched box is written as read, byte for byte', () => {
        const r = odt.read(source, OPTS);
        expect(boxXml(odt.write(r))).toBe(boxXml(source));
    });

    test('an edited box paragraph is written from its content, the frame run in place', () => {
        const r = odt.read(source, OPTS);
        boxOf(r).child.content[0].runs[0] = { type: 'text', value: 'Edited ' };
        const back = boxOf(odt.read(odt.write(r), OPTS));
        expect(back.child.content[0].runs.map((x) => x.type === 'text' ? x.value : x.type)).toEqual(['Edited ', 'frame', ' after']);
        expect(back.child.content[1].type).toBe('table');
    });

    test('the text view reads an edited box', () => {
        const r = odt.read(source, OPTS);
        expect(odt.toText(r)).toContain('Box text');
        boxOf(r).child.content[0].runs[0] = { type: 'text', value: 'Edited ' };
        expect(odt.toText(r)).toContain('Edited');
        expect(odt.toText(r)).not.toContain('Box text');
    });
});
