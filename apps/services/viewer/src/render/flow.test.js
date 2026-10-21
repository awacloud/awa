// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The flow painters (text, Markdown, DOCX, ODT) on real files:
 * the DOM they build, their safety passes and their omission ledgers.
 *
 * @module viewer/render/flow.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { corpus, fixture, renderContext, withPart } from '../../tests/context.js';
import { renderText, decodeText } from './text.js';
import { renderMarkdown } from './markdown.js';
import { renderDocx } from './docx.js';
import { renderOdt } from './odt.js';
import { bulletChar, fontStack, formatCounter } from './flow.js';
import { demoteHeadings, hardenLinks } from './html.js';

const enc = (s) => new TextEncoder().encode(s);

describe('text', () => {
    test('decodes UTF-8 and UTF-16 by BOM', () => {
        expect(decodeText(enc('﻿hé'))).toBe('hé');
        expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]))).toBe('hé');
        // Not UTF-8: read as windows-1252.
        expect(decodeText(new Uint8Array([0x52, 0xe9, 0x67, 0x69, 0x6f, 0x6e, 0x3b, 0x80]))).toBe('Région;€');
    });
    test('one paper sheet holding a <pre>, text set as text', async () => {
        const view = await renderText(enc('<b>not html</b>\n\tindented'), renderContext());
        expect(view.kind).toBe('flow');
        const pre = view.element?.querySelector('pre');
        expect(pre?.textContent).toBe('<b>not html</b>\n\tindented');
        expect(view.element?.querySelector('b')).toBe(null);
    });
});

describe('markdown', () => {
    test('headings demoted, raw HTML dropped, links hardened, remote images not loaded', async () => {
        const md = [
            '# Title', '', 'Text with <script>alert(1)</script> and [a link](https://example.org) and [bad](javascript:alert(1)).',
            '', '![remote](https://tracker.example/p.png)', '', '| a | b |', '|---|---|', '| 1 | 2 |'
        ].join('\n');
        const view = await renderMarkdown(enc(md), renderContext());
        const el = /** @type {HTMLElement} */ (view.element);
        expect(el.querySelector('h1')).toBe(null);
        expect(el.querySelector('h2')?.textContent).toBe('Title');
        expect(el.querySelector('h2')?.getAttribute('data-level')).toBe('1');
        expect(el.querySelector('script')).toBe(null);
        const links = [...el.querySelectorAll('a')];
        const good = links.find((a) => a.textContent === 'a link');
        expect(good?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(good?.getAttribute('target')).toBe('_blank');
        for (const a of links) expect(a.getAttribute('href') || '').not.toMatch(/^javascript:/i);
        expect(el.querySelector('img')).toBe(null);
        expect(el.querySelector('.awv-blocked')?.getAttribute('aria-label')).toBe('remote');
        expect(view.omissions).toEqual([{ code: 'md/remote-image', count: 1 }]);
        expect(el.querySelectorAll('table td').length).toBe(2);
        expect(view.meta.title).toBe('Title');
    });
    test('table column alignment reaches the page (attribute and style sheet)', async () => {
        const view = await renderMarkdown(enc('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |'), renderContext());
        const cells = [...(view.element?.querySelectorAll('td') || [])].map((td) => td.getAttribute('align'));
        expect(cells).toEqual(['left', 'center', 'right']);
        const css = readFileSync(new URL('../styles/viewer.css', import.meta.url), 'utf8');
        expect(css).toContain('.awv-prose [align="center"] { text-align: center; }');
        expect(css).toContain('.awv-prose [align="right"] { text-align: right; }');
    });
    test('an image without alternative text is still named', async () => {
        const view = await renderMarkdown(enc('![](https://tracker.example/p.png)'), renderContext());
        expect(/** @type {HTMLElement} */ (view.element).querySelector('.awv-blocked')?.getAttribute('aria-label')).toBe('Image');
    });
    test('past the renderer limits, the text is shown as plain text', async () => {
        const deep = `Intro\n\n${'> '.repeat(5000)}deep`;
        const view = await renderMarkdown(enc(deep), renderContext());
        expect(view.element?.querySelector('pre')?.textContent).toContain('Intro');
        expect(view.omissions).toEqual([{ code: 'md/too-complex', count: 1 }]);
    });
});

describe('docx', () => {
    test('numbering: counters, nesting, restart, formats', async () => {
        const view = await renderDocx(corpus('real/poi-numbering.docx'), renderContext());
        const markers = [...(view.element?.querySelectorAll('.awv-marker') || [])].map((m) => m.textContent);
        // Level 3 uses the Wingdings square (U+F0A7), shown as Word shows it.
        expect(markers.slice(0, 4)).toEqual(['•', 'o', '▪', '•']);
        expect(markers).toContain('1.1.');
        expect(markers).toContain('1.1.1.');
        expect(markers).toContain('a)');
        // A marker in a hanging indent is followed by the text, nothing else.
        expect(view.element?.textContent).not.toContain('null');
    });
    test('the space after a paragraph adds to the space before the next, as in Word', async () => {
        const view = await renderDocx(fixture('rich.docx'), renderContext());
        const heading = /** @type {HTMLElement} */ ([...(view.element?.querySelectorAll('[data-level]') || [])].find((x) => x.textContent === 'Lists'));
        // 8 pt after the paragraph above + 12 pt before the heading = 20 pt.
        expect(parseFloat(heading.style.marginTop)).toBeCloseTo(26.7, 1);
        expect(/** @type {HTMLElement} */ (heading.previousElementSibling).style.marginBottom).toBe('0px');
    });
    test('header and footer sit at their own distance from the paper edge', async () => {
        const view = await renderDocx(fixture('rich.docx'), renderContext());
        // w:header 567 twips = 37.8 px, w:footer 850 twips = 56.7 px.
        expect(/** @type {HTMLElement} */ (/** @type {HTMLElement} */ (view.element).querySelector('.awv-doc-header')).style.top).toBe('38px');
        expect(/** @type {HTMLElement} */ (/** @type {HTMLElement} */ (view.element).querySelector('.awv-doc-footer')).style.bottom).toBe('57px');
    });
    test('a numbered paragraph reads marker then text', async () => {
        const view = await renderDocx(fixture('rich.docx'), renderContext());
        const items = [...(view.element?.querySelectorAll('.awv-p') || [])].filter((p) => p.querySelector('.awv-marker'));
        expect(items.map((p) => p.textContent)).toEqual(['1.First point', 'a.A sub-point', 'b.Another sub-point', '2.Second point']);
    });
    test('a direct numPr giving only the level keeps the numbering its style names', async () => {
        let bytes = withPart(fixture('rich.docx'), 'word/styles.xml', (x) => x.replace(
            '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr>',
            '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'));
        bytes = withPart(bytes, 'word/document.xml', (x) => x.replace(
            '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">A sub-point',
            '<w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">A sub-point'));
        const view = await renderDocx(bytes, renderContext());
        const items = [...(view.element?.querySelectorAll('.awv-p') || [])].filter((p) => p.querySelector('.awv-marker'));
        expect(items.map((p) => p.textContent)).toEqual(['1.First point', 'a.A sub-point', 'b.Another sub-point', '2.Second point']);
    });
    test('a run names its East Asian and complex-script faces after its Latin one', async () => {
        const bytes = withPart(fixture('rich.docx'), 'word/document.xml', (x) => x.replace(
            '<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Bold',
            '<w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="MS Mincho" w:cs="Arial"/><w:b/></w:rPr><w:t xml:space="preserve">Bold'));
        const view = await renderDocx(bytes, renderContext());
        const bold = /** @type {HTMLElement} */ ([...(view.element?.querySelectorAll('span') || [])].find((s) => s.textContent === 'Bold'));
        const families = bold.style.fontFamily.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
        expect(families.slice(0, 3)).toEqual(['Georgia', 'MS Mincho', 'Arial']);
        expect(families.at(-1)).toBe('serif');
    });
    test('tables: widths, shading, header row borders from the grid style', async () => {
        const view = await renderDocx(corpus('real/poi-table-alignment.docx'), renderContext());
        const tables = view.element?.querySelectorAll('table.awv-table') || [];
        expect(tables.length).toBeGreaterThan(3);
        const first = /** @type {HTMLTableElement} */ (tables[0]);
        const cell = /** @type {HTMLElement} */ (first.querySelector('td'));
        expect(cell.style.backgroundColor).toBe('#e97132');
        expect(cell.style.borderTop).toContain('solid');
        expect(cell.textContent).toBe('Loren');
    });
    test('localised heading styles become headings, demoted', async () => {
        const view = await renderDocx(corpus('docx/docx-fr-styles.docx'), renderContext());
        const el = /** @type {HTMLElement} */ (view.element);
        expect(el.querySelector('h1')).toBe(null);
        expect(el.querySelectorAll('h2, h3, h4').length).toBeGreaterThan(0);
        expect(el.querySelector('[data-title]')).not.toBe(null);
    });
    test('table styles: their paragraph spacing, and the conditional formats of the look', async () => {
        const view = await renderDocx(fixture('rich.docx'), renderContext());
        const tables = /** @type {HTMLTableElement[]} */ ([...(view.element?.querySelectorAll('table.awv-table') || [])]);
        expect(tables).toHaveLength(2);
        // "Table Grid" sets 0 pt after: the document default (8 pt) does not apply in its cells.
        const p = /** @type {HTMLElement} */ (tables[0].querySelector('td .awv-p'));
        expect(p.style.marginBottom).toBe('0px');
        // "Grid Table 4": header row filled, white and bold; band 1 filled; the first column bold.
        const rows = [...tables[1].querySelectorAll('tr')];
        const head = /** @type {HTMLElement} */ (rows[0].querySelector('td'));
        expect(head.style.backgroundColor).toBe('#4472c4');
        expect(/** @type {HTMLElement} */ (head.querySelector('.awv-p')).style.color).toBe('#ffffff');
        expect(/** @type {HTMLElement} */ (head.querySelector('.awv-p')).style.fontWeight).toBe('700');
        expect(/** @type {HTMLElement} */ (rows[1].querySelectorAll('td')[1]).style.backgroundColor).toBe('#d9e2f3');
        expect(/** @type {HTMLElement} */ (rows[2].querySelectorAll('td')[1]).style.backgroundColor).toBe('');
        expect(/** @type {HTMLElement} */ (rows[2].querySelector('td .awv-p')).style.fontWeight).toBe('700');
        expect(/** @type {HTMLElement} */ (rows[2].querySelectorAll('td .awv-p')[1]).style.fontWeight).toBe('');
    });
    test('a floating picture with no wrapping sits over its paragraph at its offset', async () => {
        const view = await renderDocx(corpus('real/poi-with-gif.docx'), renderContext());
        const img = /** @type {HTMLElement} */ (view.element?.querySelector('img'));
        // wp:anchor, wrapNone, posOffset 1882747 EMU from the column, -104609 from the paragraph.
        expect(img.classList.contains('awv-anchor')).toBe(true);
        expect(parseFloat(img.style.left)).toBeCloseTo(197.7, 1);
        expect(parseFloat(img.style.top)).toBeCloseTo(-11, 1);
        // Its alternative text is the author's description, never the automatic name.
        expect(img.getAttribute('alt')).not.toBe('Grafik 1');
    });
    test('images become object URLs released by dispose()', async () => {
        const view = await renderDocx(corpus('real/poi-with-gif.docx'), renderContext());
        const img = view.element?.querySelector('img');
        expect(img?.getAttribute('src')).toMatch(/^blob:/);
        view.dispose();
    });
    test('the page size and margins come from the section', async () => {
        const view = await renderDocx(corpus('docx/docx-structured.docx'), renderContext());
        expect(view.width).toBeGreaterThan(700);
        const sheet = /** @type {HTMLElement} */ (view.element?.querySelector('.awv-doc'));
        expect(sheet.style.width).toBe(`${Math.round(/** @type {number} */ (view.width))}px`);
    });
    test('a block equation as Word writes it (a paragraph holding m:oMathPara) is reported', async () => {
        const math = '<w:p><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></m:oMathPara></w:p>';
        const bytes = withPart(fixture('rich.docx'), 'word/document.xml', (x) => x.replace(/<w:body>/, `<w:body>${math}`));
        const view = await renderDocx(bytes, renderContext());
        expect(view.omissions).toContainEqual({ code: 'doc/math', count: 1 });
    });
});

describe('odt', () => {
    test('styles, lists, table spans, image, page break', async () => {
        const view = await renderOdt(fixture('rich.odt'), renderContext());
        const el = /** @type {HTMLElement} */ (view.element);
        expect(view.meta.title).toBe('Rapport trimestriel');
        // One h2 per Heading 1 (demoted), Heading 2 → h3.
        expect(el.querySelector('h2')?.textContent).toBe('1. Introduction');
        expect(el.querySelectorAll('h3').length).toBe(2);
        // Character styles from automatic text styles.
        const red = [...el.querySelectorAll('span')].find((s) => s.textContent === 'texte rouge en gras');
        expect(red?.style.color).toBe('#c00000');
        expect(red?.style.fontWeight).toBe('700');
        // Lists: an ordered list with a nested lower-alpha list, then a bullet list.
        const ol = el.querySelector('ol');
        expect(ol?.style.listStyleType).toBe('decimal');
        expect(ol?.querySelector('ol')?.style.listStyleType).toBe('lower-alpha');
        expect(el.querySelector('ul')?.children.length).toBe(2);
        // Table: a cell spanning two columns, the header shaded.
        expect(el.querySelector('td[colspan="2"]')?.textContent).toBe('Fusion sur deux colonnes');
        expect(/** @type {HTMLElement} */ (el.querySelector('td')).style.backgroundColor).toBe('#1c3a5e');
        // Image from the package, with its title as alt text.
        expect(el.querySelector('img')?.getAttribute('alt')).toBe('Carré de test');
        // `fo:break-before="page"` starts a second sheet.
        expect(el.querySelectorAll('.awv-doc').length).toBe(2);
        expect(el.getAttribute('lang')).toBe('fr-FR');
        view.dispose();
    });

    test('a span of the typed model (bold, no style name) is bold; the default style and heading bands apply', async () => {
        // AWA Convert's sample: Markdown converted (bold leads as typed spans), then its reference stylesheet.
        const bytes = new Uint8Array(readFileSync(new URL('../../public/samples/en/awa-convert.odt', import.meta.url)));
        const view = await renderOdt(bytes, renderContext());
        const el = /** @type {HTMLElement} */ (view.element);
        const lead = [...el.querySelectorAll('span')].find((s) => s.textContent === 'Read');
        expect(lead?.style.fontWeight).toBe('700');
        const title = /** @type {HTMLElement} */ (el.querySelector('h2'));
        expect(title.textContent).toBe('AWA Convert');
        expect(title.style.backgroundColor).toBe('#00263d');
        expect(/** @type {HTMLElement} */ (el.querySelector('p')).style.fontFamily).toContain('Liberation Sans');
        view.dispose();
    });
});

describe('helpers', () => {
    test('formatCounter / bulletChar / fontStack', () => {
        expect(formatCounter(4, 'upperRoman')).toBe('IV');
        expect(formatCounter(28, 'lowerLetter')).toBe('ab');
        expect(formatCounter(3, 'decimalZero')).toBe('03');
        expect(bulletChar('')).toBe('•');
        expect(bulletChar('o')).toBe('o');
        expect(fontStack('Courier New')).toContain('monospace');
        expect(fontStack('Cambria')).toContain('serif');
        expect(fontStack(null)).toBe(null);
    });
    test('hardenLinks / demoteHeadings', () => {
        const root = document.createElement('div');
        root.innerHTML = '<h1>a</h1><h6>b</h6><a href="javascript:x">j</a><a href="#n">n</a><a href="mailto:a@b.c">m</a>';
        hardenLinks(root);
        demoteHeadings(root, 1);
        expect(root.querySelector('h2')?.textContent).toBe('a');
        expect(root.querySelector('[role=heading]')?.getAttribute('aria-level')).toBe('7');
        const [js, anchor, mail] = root.querySelectorAll('a');
        expect(js.hasAttribute('href')).toBe(false);
        expect(anchor.getAttribute('href')).toBe('#n');
        expect(mail.getAttribute('rel')).toBe('noopener noreferrer');
    });
});
