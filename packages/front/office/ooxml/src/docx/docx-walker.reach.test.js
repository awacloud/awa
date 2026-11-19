// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The docx walker's reach (T60 (b2)): the run and paragraph hooks visit the
 * styles' `docDefaults` and every numbering level's `rPr` / `pPr`; the
 * part hooks `hydrateStyles` / `hydrateNumbering` run before their
 * properties are visited, `dehydrateStyles` / `dehydrateNumbering` after;
 * `docx.write` dehydrates `numbering` and writes the styles and numbering
 * parts from what the hooks return.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const { createWalker } = rt.resolve('docxWalker');
const dec = new TextDecoder();

const log = [];
const tracer = {
    hydrateStyles(s) { log.push('hydrateStyles'); return s; },
    dehydrateStyles(s) { log.push('dehydrateStyles'); return s; },
    hydrateNumbering(n) { log.push('hydrateNumbering'); return n; },
    dehydrateNumbering(n) { log.push('dehydrateNumbering'); return n; },
    hydrateRunProperties(r) { log.push(`run:${r.tag}`); return r; },
    dehydrateRunProperties(r) { log.push(`run:${r.tag}`); return r; },
    hydrateParagraphProperties(p) { log.push(`para:${p.tag}`); return p; },
    dehydrateParagraphProperties(p) { log.push(`para:${p.tag}`); return p; }
};
const model = () => ({
    styles: { docDefaults: { rPr: { tag: 'defaults' }, pPr: { tag: 'defaults' } }, styles: [{ styleId: 'S', rPr: { tag: 'style' } }] },
    numbering: { abstractNums: [{ abstractNumId: 0, levels: [{ ilvl: 0, pPr: { tag: 'level' }, rPr: { tag: 'level' } }] }], nums: [] }
});

describe('docxWalker reach', () => {
    test('hydrate: each part hook, then its docDefaults, styles and levels', () => {
        const w = createWalker();
        w.use(tracer);
        log.length = 0;
        w.applyHydrate(model());
        expect(log).toEqual(['hydrateStyles', 'run:defaults', 'para:defaults', 'run:style',
            'hydrateNumbering', 'para:level', 'run:level']);
    });

    test('dehydrate: the properties, then each part hook', () => {
        const w = createWalker();
        w.use(tracer);
        log.length = 0;
        w.applyDehydrate(model());
        expect(log).toEqual(['run:defaults', 'para:defaults', 'run:style', 'dehydrateStyles',
            'para:level', 'run:level', 'dehydrateNumbering']);
    });

    test('a part hook\'s returned object replaces the part', () => {
        const w = createWalker();
        const swapped = { abstractNums: [], nums: [], swapped: true };
        w.use({ hydrateNumbering: () => swapped, hydrateStyles: () => ({ styles: [], swapped: true }) });
        const m = model();
        w.applyHydrate(m);
        expect(m.numbering).toBe(swapped);
        expect(m.styles.swapped).toBe(true);
    });
});

describe('docx.write and the numbering and styles hooks', () => {
    test('the numbering and styles parts are written from what the dehydrate hooks return', () => {
        const docx = rt.resolve('docx');
        const marker = (part) => ({ ...part, _extras: [...(part._extras || []), xml.el('w:numIdMacAtCleanup', { 'w:val': '7' })] });
        docx.use({ dehydrateNumbering: marker, dehydrateStyles: (s) => ({ ...s, docDefaults: { rPr: { bold: true } } }) });
        const numbering = { abstractNums: [{ abstractNumId: 0, levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.' }] }], nums: [{ numId: 1, abstractNumId: 0 }] };
        const bytes = docx.write({ type: 'document', body: [{ type: 'paragraph', pPr: { numPr: { numId: 1, ilvl: 0 } }, children: [] }] },
            { numbering, styles: { styles: [] } });
        const parts = opc.read(bytes).parts;
        expect(dec.decode(parts['/word/numbering.xml'])).toContain('w:numIdMacAtCleanup w:val="7"');
        expect(dec.decode(parts['/word/styles.xml'])).toContain('<w:b/>');
        expect(numbering._extras).toBeUndefined();
    });

    test('a numbering level\'s tabs are typed by the large bundle and saved back', async () => {
        const { ModuleRuntime } = await import('@awacloud/fw/core/runtime.js');
        const ooxmlMods = await import('../main.js');
        const big = new ModuleRuntime();
        big.registerDeep(ooxmlMods.docxLargeBundle);
        const docx = big.resolve('docxLargeBundle');
        const tab = xml.el('w:tabs', {}, [xml.el('w:tab', { 'w:val': 'num', 'w:pos': '720' })]);
        const numbering = { abstractNums: [{ abstractNumId: 0, levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.', pPr: { _extras: [tab] } }] }], nums: [{ numId: 1, abstractNumId: 0 }] };
        const styles = { docDefaults: { rPr: { _extras: [xml.el('w:szCs', { 'w:val': '24' })] } }, styles: [] };
        const read = docx.read(docx.write({ type: 'document', body: [{ type: 'paragraph', pPr: { numPr: { numId: 1, ilvl: 0 } }, children: [] }] }, { numbering, styles }));
        expect(read.numbering.abstractNums[0].levels[0].pPr.tabs).toBeDefined();
        expect(read.numbering.abstractNums[0].levels[0].pPr._extras).toBeUndefined();
        expect(read.styles.docDefaults.rPr.szCs).toBe(24);
        const again = opc.read(docx.write(read.document, { numbering: read.numbering, styles: read.styles })).parts;
        expect(dec.decode(again['/word/numbering.xml'])).toMatch(/<w:tab w:val="num" w:pos="720"\s*\/>/);
        expect(dec.decode(again['/word/styles.xml'])).toMatch(/<w:szCs w:val="24"\s*\/>/);
    });
});
