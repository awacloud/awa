// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `cascade.js` sub-path: it loads and runs with no DOM,
 * resolves the DOCX and OpenDocument styles as the painters do, and maps
 * them to the CSS the painters apply.
 *
 * No `setup-dom.js` here. Bun runs every test file of a run in one process,
 * so another file's Happy-DOM registration could be visible to this one:
 * the no-DOM import is proven in a child process that installs nothing.
 *
 * @module oview/cascade.test
 */
import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { docxLargeBundle } from '@awacloud/ooxml';
import { odtLargeBundle } from '@awacloud/odf';
import * as cascade from './cascade.js';
import { createDocxCascade, mergeDocxProps, docxRunCss, docxParagraphCss, createOdfCascade, odfTextCss, odfParagraphCss, odfBoxCss, odfCellCss } from './cascade.js';
import { corpus, fixture } from '../tests/context.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** The format engines, on a runtime of their own. */
function engines() {
    const rt = new ModuleRuntime();
    rt.registerDeep(docxLargeBundle);
    rt.registerDeep(odtLargeBundle);
    return { docx: rt.resolve('docxLargeBundle'), odt: rt.resolve('odtLargeBundle') };
}

const NAMES = [
    'createDocxCascade', 'mergeDocxProps', 'docxRunCss', 'docxParagraphCss',
    'createOdfCascade', 'odfTextCss', 'odfParagraphCss', 'odfBoxCss', 'odfCellCss'
];

describe('the entry', () => {
    test('exports exactly the documented names, all functions', () => {
        expect(Object.keys(cascade).sort()).toEqual([...NAMES].sort());
        for (const name of NAMES) expect(typeof cascade[/** @type {keyof typeof cascade} */ (name)]).toBe('function');
    });

    test('imports and runs in a process with no DOM globals', () => {
        const entry = JSON.stringify(new URL('./cascade.js', import.meta.url).href);
        const script = `const before = typeof globalThis.document;
import(${entry}).then((m) => {
    const c = m.createDocxCascade({ docDefaults: { rPr: { bold: true } }, styles: [] });
    const css = m.docxRunCss(c.paragraph({}).r);
    const odf = m.odfParagraphCss(m.createOdfCascade({}).resolve('x', 'paragraph').paragraph);
    console.log(JSON.stringify({ before, after: typeof globalThis.document, window: typeof globalThis.window, css, odf, names: Object.keys(m).length }));
});`;
        const run = spawnSync(execPath, ['-e', script], { cwd: here('..'), encoding: 'utf8' });
        expect(run.stderr).toBe('');
        expect(run.status).toBe(0);
        expect(JSON.parse(run.stdout)).toEqual({
            before: 'undefined', after: 'undefined', window: 'undefined', css: { fontWeight: '700' }, odf: {}, names: NAMES.length
        });
    });

    test('one cascade in the package: the DOCX painter imports it and defines none', () => {
        const painter = readFileSync(here('./render/docx.js'), 'utf8');
        expect(painter).toContain("from './docx-style.js'");
        expect(painter).not.toMatch(/function\s+(createStyles|merge|runStyle|paragraphStyle)\s*\(/);
    });
});

/** A hand-built `docx.read().styles`, in the reader's shape. */
function handStyles() {
    return {
        docDefaults: { rPr: { font: 'Calibri', size: 22 }, pPr: { spacing: { after: 160, line: 259 } } },
        styles: [
            { type: 'paragraph', styleId: 'Normal', name: 'Normal', isDefault: true, pPr: { spacing: { after: 120 } } },
            { type: 'paragraph', styleId: 'Base', name: 'Base', basedOn: 'Normal', pPr: { indent: { left: 360 } }, rPr: { size: 24, color: '111111' } },
            { type: 'paragraph', styleId: 'Middle', name: 'Middle', basedOn: 'Base', pPr: { indent: { firstLine: 180 }, align: 'center' }, rPr: { italic: true, color: '222222' } },
            { type: 'paragraph', styleId: 'Leaf', name: 'Leaf', basedOn: 'Middle', pPr: { align: 'right' }, rPr: { color: '333333' } },
            { type: 'paragraph', styleId: 'Outlined', name: 'Outlined', basedOn: 'Normal', pPr: { outlineLvl: 2 } },
            { type: 'paragraph', styleId: 'Titre1', name: 'heading 1', basedOn: 'Normal', rPr: { size: 32 } },
            { type: 'paragraph', styleId: 'TitreDoc', name: 'Title', basedOn: 'Normal' },
            { type: 'paragraph', styleId: 'LoopA', name: 'LoopA', basedOn: 'LoopB', pPr: { align: 'center' } },
            { type: 'paragraph', styleId: 'LoopB', name: 'LoopB', basedOn: 'LoopA', pPr: { align: 'right' } },
            { type: 'character', styleId: 'Strong', name: 'Strong', basedOn: 'Emph', rPr: { bold: true, color: 'AA0000' } },
            { type: 'character', styleId: 'Emph', name: 'Emph', rPr: { italic: true, size: 28 } }
        ]
    };
}

describe('DOCX cascade', () => {
    test('document defaults and the default paragraph style reach a plain paragraph', () => {
        const { p, r, headingLevel, styleId, title } = createDocxCascade(handStyles()).paragraph(undefined);
        expect(p.spacing).toEqual({ after: 120, line: 259 });
        expect(r).toEqual({ font: 'Calibri', size: 22 });
        expect({ headingLevel, styleId, title }).toEqual({ headingLevel: null, styleId: 'Normal', title: false });
    });

    test('a basedOn chain of three styles resolves root first, nested bags merged per attribute', () => {
        const { p, r, styleId } = createDocxCascade(handStyles()).paragraph({ pStyle: 'Leaf' });
        expect(styleId).toBe('Leaf');
        expect(p.align).toBe('right');
        expect(p.indent).toEqual({ left: 360, firstLine: 180 });
        expect(p.spacing).toEqual({ after: 120, line: 259 });
        expect(r).toEqual({ font: 'Calibri', size: 24, color: '333333', italic: true });
    });

    test('direct paragraph formatting wins over the style, a numbering level sits between', () => {
        const styles = createDocxCascade(handStyles());
        const { p } = styles.paragraph({ pStyle: 'Leaf', align: 'left', indent: { left: 0 } }, { indent: { left: 720, hanging: 360 } });
        expect(p.align).toBe('left');
        expect(p.indent).toEqual({ left: 0, firstLine: 180, hanging: 360 });
    });

    test('a character style sits between the run base and the direct run formatting', () => {
        const styles = createDocxCascade(handStyles());
        const base = styles.paragraph({ pStyle: 'Leaf' }).r;
        const r = styles.run(base, { rStyle: 'Strong', color: '00FF00' });
        // Emph (root) then Strong over the paragraph's base; the direct colour last.
        expect(r).toEqual({ font: 'Calibri', size: 28, italic: true, bold: true, color: '00FF00', rStyle: 'Strong' });
        expect(styles.run(base, { rStyle: 'Strong' }).color).toBe('AA0000');
    });

    test('heading level from outlineLvl, and from a localised style id with an English name', () => {
        const styles = createDocxCascade(handStyles());
        expect(styles.paragraph({ pStyle: 'Outlined' }).headingLevel).toBe(3);
        expect(styles.paragraph({ pStyle: 'Titre1' }).headingLevel).toBe(1);
        expect(styles.paragraph({ pStyle: 'TitreDoc' }).title).toBe(true);
    });

    test('a basedOn cycle terminates', () => {
        const { p, styleId } = createDocxCascade(handStyles()).paragraph({ pStyle: 'LoopA' });
        expect(styleId).toBe('LoopA');
        expect(p.align).toBe('center');
    });

    test('the input is not mutated', () => {
        const styles = handStyles();
        const before = JSON.stringify(styles);
        const c = createDocxCascade(styles);
        c.run(c.paragraph({ pStyle: 'Leaf', indent: { left: 1 } }).r, { rStyle: 'Strong' });
        expect(JSON.stringify(styles)).toBe(before);
    });

    test('mergeDocxProps merges the nested bags and concatenates _extras', () => {
        const out = mergeDocxProps({ spacing: { before: 1 }, fonts: { ascii: 'A' }, _extras: [{ name: 'x' }] }, undefined,
            { spacing: { after: 2 }, fonts: { cs: 'B' }, bold: undefined, _extras: [{ name: 'y' }] });
        expect(out).toEqual({ spacing: { before: 1, after: 2 }, fonts: { ascii: 'A', cs: 'B' }, _extras: [{ name: 'x' }, { name: 'y' }] });
    });

    test('on docx.read(): Word defaults and Heading 1 from a real styles part', () => {
        const d = engines().docx.read(fixture('rich.docx'));
        const styles = createDocxCascade(d.styles);
        const plain = styles.paragraph(undefined);
        expect(plain.p.spacing).toEqual({ after: 160, line: 259, lineRule: 'auto' });
        expect(plain.r.size).toBe(22);
        const h1 = styles.paragraph({ pStyle: 'Heading1' });
        expect(h1.headingLevel).toBe(1);
        expect(h1.p.spacing).toEqual({ before: 240, after: 0, line: 259, lineRule: 'auto' });
        expect(h1.r.font).toBe('Calibri Light');
    });

    test('on docx.read(): localised heading styles of a French document get their level', () => {
        const d = engines().docx.read(corpus('docx/docx-fr-styles.docx'));
        const styles = createDocxCascade(d.styles);
        const localised = (d.styles.styles || []).filter((s) => s.type === 'paragraph' && /^heading\s*\d$/i.test(s.name || '') && !/^heading/i.test(s.styleId));
        expect(localised.length).toBeGreaterThan(0);
        for (const s of localised) expect(styles.paragraph({ pStyle: s.styleId }).headingLevel).toBe(Number(String(s.name).replace(/\D/g, '')));
    });
});

describe('DOCX CSS (the objects the painter applies)', () => {
    test('Heading 1 of rich.docx: paragraph and run CSS', () => {
        const d = engines().docx.read(fixture('rich.docx'));
        const { p, r } = createDocxCascade(d.styles).paragraph({ pStyle: 'Heading1' });
        expect(docxParagraphCss(p)).toEqual({ marginTop: '16.0px', marginBottom: '0.0px', lineHeight: '1.241', breakInside: 'avoid' });
        expect(docxRunCss(r)).toEqual({ color: '#2f5496', fontSize: '16pt', fontFamily: '"Calibri Light", Carlito, "Segoe UI", Arial, sans-serif' });
    });

    test('a paragraph with indents, exact line spacing, shading and a raw border', () => {
        const css = docxParagraphCss({
            align: 'both', indent: { left: 720, hanging: 360 }, spacing: { before: 120, line: 360, lineRule: 'exact' },
            shd: { fill: 'FFF2CC' }, _extras: [{ name: 'w:pBdr', children: [{ type: 'element', name: 'w:bottom', attrs: { 'w:val': 'single', 'w:sz': '8', 'w:color': '4472C4' } }] }]
        });
        expect(css).toEqual({
            textAlign: 'justify', marginLeft: '48.0px', textIndent: '-24.0px', marginTop: '8.0px', marginBottom: '0.0px',
            lineHeight: '24.0px', backgroundColor: '#fff2cc', borderBottom: '1.3px solid #4472c4'
        });
    });

    test('a run: decorations, highlight, script position, East Asian face after the Latin one', () => {
        expect(docxRunCss({ bold: true, italic: true, underline: 'double', strike: true, highlight: 'yellow', vertAlign: 'superscript', size: 20, fonts: { ascii: 'Arial', eastAsia: 'MS Mincho' } })).toEqual({
            fontWeight: '700', fontStyle: 'italic', textDecoration: 'underline line-through', textDecorationStyle: 'double',
            fontSize: '0.75em', fontFamily: '"Arial", "MS Mincho", "Liberation Sans", Arial, sans-serif', verticalAlign: 'super', backgroundColor: '#ffff00'
        });
    });
});

describe('ODF cascade', () => {
    test('a paragraph style with a parent chain resolves to the merged properties, relative size multiplied out', () => {
        const o = engines().odt.read(fixture('rich.odt'));
        const styles = createOdfCascade(o);
        const h1 = styles.resolve('Heading_20_1', 'paragraph');
        expect(h1.paragraph).toEqual({ orphans: '2', 'keep-with-next': 'always', 'margin-top': '0.423cm', 'margin-bottom': '0.212cm' });
        expect(h1.text).toEqual({
            language: 'fr', country: 'FR', 'font-name': 'Liberation Sans', 'font-size': '24.266666666666666px', 'font-weight': 'bold', color: '#1c3a5e'
        });
        expect(h1.outline).toEqual({ level: '1' });
        expect(odfParagraphCss(h1.paragraph)).toEqual({ marginTop: '16.0px', marginBottom: '8.0px' });
        expect(odfTextCss(h1.text, styles.face)).toEqual({
            fontWeight: '700', fontSize: '24.27px', color: '#1c3a5e', fontFamily: '"Liberation Sans", "Liberation Sans", Arial, sans-serif'
        });
    });

    test('an automatic style over a named parent: its own box over the parent spacing, a hairline border floored at 1px', () => {
        const styles = createOdfCascade(engines().odt.read(fixture('rich.odt')));
        const p2 = styles.resolve('P2', 'paragraph').paragraph;
        expect(p2).toMatchObject({ 'margin-bottom': '0.247cm', 'line-height': '115%', 'margin-left': '1cm', border: '0.5pt solid #e0a800' });
        expect(odfBoxCss(p2)).toMatchObject({ borderTop: '1.0px solid #e0a800', paddingLeft: '7.6px' });
        expect(odfCellCss({ 'background-color': '#ABCDEF', 'vertical-align': 'middle', 'wrap-option': 'no-wrap' })).toEqual({
            backgroundColor: '#abcdef', verticalAlign: 'middle', whiteSpace: 'nowrap'
        });
    });
});
