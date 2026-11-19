// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T84: a span without an emphasis flag whose style is defined
 * and whose chain states no emphasis property reads with no
 * `run/format-unresolved`; an undefined style, or one stating an emphasis
 * the reader did not resolve, keeps the loss.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll(oconvFwRequire);
rt.registerAll(oconvModules);
const { node, doc } = rt.resolve('oconvIr');
const { odtToIr } = rt.resolve('oconvOdtToIr');
const { irToOdt } = rt.resolve('oconvIrToOdt');
const odt = rt.resolve('odt');
const oconv = rt.resolve('oconv');

const span = (styleName, value) => ({ type: 'span', value, styleName });
const para = (runs) => ({ type: 'paragraph', runs });
const auto = (name, text, parentStyleName) => ({ name, family: 'text', ...(parentStyleName ? { parentStyleName } : {}), properties: { text } });
const named = (name, text) => ({ type: 'element', name: 'style:style', attrs: { 'style:name': name, 'style:family': 'text' },
    children: [{ type: 'element', name: 'style:text-properties', attrs: text, children: [] }] });
const unresolved = (losses) => losses.filter((l) => l.code === 'run/format-unresolved');

describe('oconvOdtToIr — a defined style stating no emphasis (T84)', () => {
    test('a span of a defined automatic style stating only a size and a colour reads with no loss', () => {
        const { ir, losses } = odtToIr({ body: [para([span('T1', 'x')])], autoStyles: { styles: [auto('T1', { 'fo:font-size': '9pt', 'fo:color': '#ff0000' })] } });
        expect(ir.children[0].children[0]).toMatchObject({ kind: 'run', text: 'x', bold: false });
        expect(unresolved(losses)).toEqual([]);
    });

    test("a style whose styles.xml parent states only a size reads with no loss; a span's own runs too", () => {
        const styles = { styles: [named('Small', { 'fo:font-size': '8pt' })], automaticStyles: [] };
        const { losses } = odtToIr({ body: [para([span('T2', 'y'), { type: 'span', styleName: 'Small', value: 'z', runs: [{ type: 'text', value: 'z' }] }])],
            autoStyles: { styles: [auto('T2', { 'fo:color': '#00ff00' }, 'Small')] }, styles });
        expect(unresolved(losses)).toEqual([]);
    });

    test('an undefined style keeps the loss; so does a style stating an emphasis property', () => {
        const { losses } = odtToIr({ body: [para([span('Gone', 'a'), span('T3', 'b'), span('T4', 'c')])],
            autoStyles: { styles: [auto('T3', { 'fo:font-weight': 'normal' }), auto('T4', { 'fo:font-size': '9pt' }, 'Heavy')] },
            styles: { styles: [named('Heavy', { 'style:text-line-through-style': 'solid' })], automaticStyles: [] } });
        expect(unresolved(losses)).toEqual([
            { code: 'run/format-unresolved', detail: 'Gone' },
            { code: 'run/format-unresolved', detail: 'T3' },
            { code: 'run/format-unresolved', detail: 'T4' }
        ]);
    });

    test("oconv's own docx -> odt runs read back with no run/format-unresolved", async () => {
        const bytes = irToOdt(doc([node('paragraph', {}, [node('run', { text: 'x', size: 9, color: '#ff0000' }), node('run', { text: 'b', bold: true, size: 9 })])])).bytes;
        const { losses } = odtToIr(odt.read(bytes, { framesInRuns: true, elementsInRuns: true, semanticStyles: true, notes: true }));
        expect(unresolved(losses)).toEqual([]);
        const md = await oconv.toMd({ name: 'a.odt', bytes, convertedAt: '2026-01-01T00:00:00Z' });
        expect(md.losses).toEqual([]);
    });
});
