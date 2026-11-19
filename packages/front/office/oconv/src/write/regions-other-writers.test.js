// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview T80 (D58 A, a): the md, docx and pdf writers have no page
 * fields and no regions. A `field` is written as its text; a stated header
 * or footer records `layout/region-dropped` (detail `header` or `footer`),
 * once each.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll(oconvFwRequire);
rt.registerAll(oconvModules);
const { node, doc } = rt.resolve('oconvIr');
const { irToMd } = rt.resolve('oconvIrToMd');
const { irToDocx } = rt.resolve('oconvIrToDocx');
const { irToPdf } = rt.resolve('oconvIrToPdf');
const docxApi = rt.resolve('docx');

const fieldPara = () => node('paragraph', {}, [node('run', { text: 'Page ' }), node('field', { name: 'page', text: '3' }),
    node('run', { text: ' of ' }), node('field', { name: 'pages', text: '9' })]);
const regions = () => ({
    header: { default: [node('paragraph', {}, [node('run', { text: 'Head' })])], first: null, even: null },
    footer: { default: [fieldPara()], first: [], even: null }
});
const regionLosses = (losses) => losses.filter((l) => l.code === 'layout/region-dropped');
const DROPPED = [{ code: 'layout/region-dropped', detail: 'header' }, { code: 'layout/region-dropped', detail: 'footer' }];

describe('the md, docx and pdf writers — fields and regions (T80)', () => {
    test('md writes a field as its text', () => {
        const { markdown, losses } = irToMd(doc([fieldPara()]), {}, { frontMatter: 'none' });
        expect(markdown).toBe('Page 3 of 9\n');
        expect(regionLosses(losses)).toEqual([]);
    });

    test('md records a stated header and footer as layout/region-dropped, once each', () => {
        const { markdown, losses } = irToMd(doc([node('paragraph', {}, [node('run', { text: 'Body' })])], regions()), {}, { frontMatter: 'none' });
        expect(markdown).toBe('Body\n');
        expect(regionLosses(losses)).toEqual(DROPPED);
    });

    test('docx writes a field as its text and records the regions', () => {
        const { bytes, losses } = irToDocx(doc([fieldPara()], regions()));
        expect(docxApi.toText(docxApi.read(bytes).document).trim()).toBe('Page 3 of 9');
        expect(regionLosses(losses)).toEqual(DROPPED);
    });

    test('pdf writes a field-bearing document and records the regions', () => {
        const { bytes, losses } = irToPdf(doc([fieldPara()], { footer: regions().footer }));
        expect(bytes.length).toBeGreaterThan(0);
        expect(regionLosses(losses)).toEqual([DROPPED[1]]);
    });
});
