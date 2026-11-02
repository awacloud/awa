// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Which extras of each bundle type a read (T59 (c), D22 B): an extra types
 * a read only through a hook its format's walker calls; the others are
 * toolkits (parse / render functions one calls on raw nodes). Each bundle
 * page (`docs/api/bundles/*.md`) lists the two groups; this guard keeps the
 * code and those lists together — a bundle that gains or loses a hooked
 * extra fails here until its page says so.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const rt = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules, ...ooxmlMods.extras, ...ooxmlMods.bundle]) rt.register(m);

const WALKER_HOOKS = {
    docx: ['RunProperties', 'ParagraphProperties', 'TcPr', 'Table', 'Row', 'Drawing', 'Settings'],
    xlsx: ['Workbook', 'Sheet', 'Settings'],
    pptx: ['RunProperties', 'ParagraphProperties', 'Settings']
};
// The extras each bundle's page lists as typing a read (its own, not the
// ones of the bundle it builds on).
const DOCUMENTED = {
    docxLargeBundle: ['wmlRunFormatting', 'wmlParagraphFormatting', 'wmlTableProperties', 'wmlSettings', 'dmlWpDrawing'],
    docxFullBundle: [],
    xlsxLargeBundle: [],
    xlsxFullBundle: [],
    pptxLargeBundle: [],
    pptxFullBundle: []
};
const hooked = (name, fmt) => {
    const inst = rt.resolve(name);
    return WALKER_HOOKS[fmt].some((h) => typeof inst['hydrate' + h] === 'function' || typeof inst['dehydrate' + h] === 'function');
};

describe('the bundles\' extras that type a read (T59 c)', () => {
    for (const [bundle, documented] of Object.entries(DOCUMENTED)) {
        test(`${bundle}: the hooked extras are the documented ones`, () => {
            const fmt = bundle.slice(0, 4);
            const desc = ooxmlMods.bundle.find((b) => b.name === bundle);
            const own = desc.dependencies.filter((d) => d !== fmt && !/Bundle$/.test(d));
            expect(own.filter((d) => hooked(d, fmt)).sort()).toEqual([...documented].sort());
        });
    }

    test('a read through docxLargeBundle types a picture drawing', () => {
        const big = new ModuleRuntime();
        big.registerDeep(ooxmlMods.docxLargeBundle);
        const docx = big.resolve('docxLargeBundle');
        const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 7]);
        const bytes = docx.write({ type: 'document', body: [{ type: 'paragraph', children: [docx.imageRun(png, { cx: 914400, cy: 914400 })] }] });
        const drawing = docx.read(bytes).document.body[0].children[0].children[0];
        expect(drawing.type).toBe('drawing');
        expect(drawing.picture).toBeDefined();
        expect(drawing.frame).toBeDefined();
    });
});
