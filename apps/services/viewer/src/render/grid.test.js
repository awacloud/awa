// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The sheet and slide painters on real files.
 *
 * @module viewer/render/grid.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { corpus, fixture, renderContext, withPart } from '../../tests/context.js';
import { renderOds as paintOds, renderXlsx as paintXlsx, columnName, parseRef, tint } from './sheet.js';

/** Render, then show every sheet once (the stage paints a sheet's rows when it is first shown). */
const shown = async (/** @type {Promise<any>} */ rendering) => {
    const view = await rendering;
    for (const sheet of view.sheets || []) sheet.prepare?.();
    return view;
};
const renderXlsx = (/** @type {any[]} */ ...a) => shown(paintXlsx(...a));
const renderOds = (/** @type {any[]} */ ...a) => shown(paintOds(...a));
import { colourMods, renderOdp, renderPptx } from './slides.js';

/** Text of the cell at a spreadsheet reference in a painted sheet. */
function cellText(sheet, ref) {
    const pos = /** @type {{row: number, col: number}} */ (parseRef(ref));
    const row = sheet.querySelectorAll('tbody tr')[pos.row];
    // Walk the row, honouring colspans, to the column.
    let col = 0;
    for (const td of row.querySelectorAll('td')) {
        if (col === pos.col) return td;
        col += Number(td.getAttribute('colspan') || 1);
    }
    return null;
}

describe('sheet helpers', () => {
    test('column names and references', () => {
        expect(columnName(0)).toBe('A');
        expect(columnName(25)).toBe('Z');
        expect(columnName(26)).toBe('AA');
        expect(parseRef('$AB$12')).toEqual({ row: 11, col: 27 });
        expect(parseRef('nope')).toBe(null);
    });
    test('tint lightens and darkens through HSL', () => {
        expect(tint('#4472c4', 0)).toBe('#4472c4');
        expect(tint('#000000', 0.5)).toBe('#808080');
        expect(tint('#ffffff', -0.5)).toBe('#808080');
    });
});

describe('xlsx', () => {
    test('styles, number formats, merges, theme colours, hidden sheets', async () => {
        const view = await renderXlsx(fixture('rich.xlsx'), renderContext('en-GB'));
        expect(view.kind).toBe('sheets');
        expect(view.sheets?.map((s) => s.name)).toEqual(['Budget', 'Notes']);   // 'Masquée' is hidden
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        const title = /** @type {HTMLElement} */ (cellText(sheet, 'A1'));
        expect(title.getAttribute('colspan')).toBe('4');
        expect(title.style.color).toBe('#4472c4');          // theme 4 = accent1
        const header = /** @type {HTMLElement} */ (cellText(sheet, 'A2'));
        expect(header.style.backgroundColor).toBe('#00263d');
        expect(header.style.textAlign).toBe('center');
        expect(cellText(sheet, 'B3')?.textContent).toBe('12,500.00 €');
        expect(cellText(sheet, 'D3')?.textContent).toBe('-4%');
        expect(cellText(sheet, 'B8')?.textContent).toBe('10 October 2026');
        expect(/** @type {HTMLElement} */ (cellText(sheet, 'A9')).style.whiteSpace).toBe('pre-wrap');
        // Column widths: 24 characters → about 173 px.
        expect(sheet.querySelectorAll('col')[1].getAttribute('style')).toContain('173px');
        expect(view.omissions).toEqual([{ code: 'sheet/formula', count: 2 }]);
    });
    test('a hostile whole-sheet merge is clamped, not walked', async () => {
        const ctx = renderContext();
        const { xlsx } = await ctx.engine('xlsx');
        const bytes = xlsx.write({
            type: 'workbook',
            sheets: [{ name: 'Big', merges: ['A1:XFD1048576'], rows: [[{ type: 'cell', value: 'x', t: 'inlineStr' }]] }]
        });
        const started = Date.now();
        const view = await renderXlsx(bytes, ctx);
        expect(Date.now() - started).toBeLessThan(5000);
        const first = /** @type {HTMLElement} */ (view.sheets?.[0].element.querySelector('tbody td'));
        expect(Number(first.getAttribute('colspan'))).toBe(200);
        expect(Number(first.getAttribute('rowspan'))).toBe(2000);
        expect(view.omissions.map((o) => o.code)).toContain('sheet/truncated');
    });
    test('a plain workbook', async () => {
        const view = await renderXlsx(corpus('xlsx/poi-simple-multicell.xlsx'), renderContext());
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        expect(cellText(sheet, 'E5')?.textContent).toBe('15');
        expect(view.sheets?.[1].element.querySelector('.awv-sheet-empty')).not.toBe(null);
    });
});

describe('ods', () => {
    test('display text, repeated rows, spans, styles', async () => {
        const view = await renderOds(fixture('rich.ods'), renderContext());
        expect(view.sheets?.map((s) => s.name)).toEqual(['Ventes', 'Notes']);
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        expect(cellText(sheet, 'B2')?.textContent).toBe('1 234,50');
        const head = /** @type {HTMLElement} */ (cellText(sheet, 'A1'));
        expect(head.style.backgroundColor).toBe('#1c3a5e');
        expect(head.style.color).toBe('#ffffff');
        // Two repeated empty rows, then the merged note on row 7.
        const note = /** @type {HTMLElement} */ (cellText(sheet, 'A7'));
        expect(note.getAttribute('colspan')).toBe('3');
        expect(cellText(sheet, 'D7')?.textContent).toBe('10/10/2026');
        expect(view.omissions).toEqual([{ code: 'sheet/formula', count: 5 }]);
    });
});

describe('pptx', () => {
    test('slides at the deck size, placeholders positioned from the layout', async () => {
        const view = await renderPptx(corpus('pptx/poi-sampleshow.pptx'), renderContext());
        expect(view.kind).toBe('paged');
        expect(view.pageLabel).toBe('slide');
        expect(view.pages?.length).toBe(2);
        const host = document.createElement('div');
        host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
        await view.pages?.[0].draw(host, 0.5);
        const slide = /** @type {HTMLElement} */ (host.querySelector('.awv-slide'));
        expect(slide.style.transform).toBe('scale(0.5)');
        expect(slide.textContent).toContain('Title of the first slide');
        const green = [...slide.querySelectorAll('span')].find((s) => s.textContent === 'This bit is in italic green');
        expect(green?.style.color).toBe('#92d050');
        expect(green?.style.fontStyle).toBe('italic');
        const title = [...slide.querySelectorAll('.awv-shape')].find((s) => s.textContent === 'Title of the first slide');
        expect(Number.parseFloat(title?.style.width || '0')).toBeGreaterThan(100);
    });
    test('a table slide', async () => {
        const view = await renderPptx(corpus('pptx/poi-table.pptx'), renderContext());
        const host = document.createElement('div');
        await view.pages?.[0].draw(host, 1);
        expect(host.querySelectorAll('table.awv-slide-table tr').length).toBeGreaterThan(1);
    });
});

describe('odp', () => {
    test('page size, backgrounds, text, lists, shapes, image', async () => {
        const view = await renderOdp(fixture('rich.odp'), renderContext());
        expect(view.pages?.length).toBe(2);
        expect(Math.round(view.pages?.[0].width || 0)).toBe(1058);   // 28 cm
        const host = document.createElement('div');
        await view.pages?.[0].draw(host, 1);
        expect(/** @type {HTMLElement} */ (host.querySelector('.awv-slide')).style.background).toContain('#00263d');
        await view.pages?.[1].draw(host, 1);
        const slide = /** @type {HTMLElement} */ (host.querySelector('.awv-slide'));
        expect(slide.querySelectorAll('ul li').length).toBe(3);
        const shape = [...slide.querySelectorAll('.awv-shape')].find((s) => s.textContent === 'Forme avec texte');
        expect(shape?.style.backgroundColor).toBe('#b3dfef');
        expect(shape?.style.borderRadius).not.toBe('');
        expect(slide.querySelector('img')?.getAttribute('alt')).toBe('Carré de test');
        view.dispose();
    });
});

describe('hostile sizes', () => {
    test('a column range with a huge negative start does not loop', async () => {
        const bytes = withPart(fixture('rich.xlsx'), 'xl/worksheets/sheet1.xml', (x) => x.replace(/<col min="\d+"/, '<col min="-99999999"'));
        const t0 = performance.now();
        const view = await renderXlsx(bytes, renderContext());
        expect(performance.now() - t0).toBeLessThan(2000);
        expect(view.sheets?.length).toBeGreaterThan(0);
    });
    test('ODS whole-column styling repeated a million times is filler, not cells', async () => {
        const filler = '<table:table-row table:number-rows-repeated="1048000"><table:table-cell table:style-name="ce1" table:number-columns-repeated="16384"/></table:table-row>';
        const bytes = withPart(fixture('rich.ods'), 'content.xml', (x) => x.replace(/<table:table-row\b/, `${filler}<table:table-row`));
        const t0 = performance.now();
        const view = await renderOds(bytes, renderContext());
        expect(performance.now() - t0).toBeLessThan(3000);
        const tds = view.sheets?.[0].element.querySelectorAll('td').length || 0;
        expect(tds).toBeLessThan(5000);
    });
    test('a sheet paints at most 100,000 cells, and says so', async () => {
        const many = '<table:table-row table:number-rows-repeated="5000"><table:table-cell office:value-type="string" table:number-columns-repeated="300"><text:p>x</text:p></table:table-cell></table:table-row>';
        const bytes = withPart(fixture('rich.ods'), 'content.xml', (x) => x.replace(/<table:table-row\b/, `${many}<table:table-row`));
        const view = await renderOds(bytes, renderContext());
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        // The first slice of rows at once, the rest in later turns.
        expect(sheet.querySelectorAll('tbody tr').length).toBe(250);
        while (sheet.querySelectorAll('tbody tr').length < 500) await new Promise((r) => setTimeout(r, 0));
        expect(sheet.querySelectorAll('td').length).toBeLessThanOrEqual(100_000);
        expect(sheet.querySelectorAll('tbody tr').length).toBe(500);
        expect(view.omissions.map((o) => o.code)).toContain('sheet/truncated');
    });
    test('slide sizes out of range fall back to the default', async () => {
        const odp = withPart(fixture('rich.odp'), 'styles.xml', (x) => x.replace(/fo:page-width="[^"]+"/, 'fo:page-width="-5cm"').replace(/fo:page-height="[^"]+"/, 'fo:page-height="99999cm"'));
        const o = await renderOdp(odp, renderContext());
        expect(o.pages?.[0].width).toBe(1058);
        expect(o.pages?.[0].height).toBe(595);
        const pptx = withPart(corpus('pptx/poi-sampleshow.pptx'), 'ppt/presentation.xml', (x) => x.replace(/<p:sldSz[^>]*>/, '<p:sldSz cx="999999999999" cy="1"/>'));
        const p = await renderPptx(pptx, renderContext());
        expect(p.pages?.[0].width).toBe(1280);
        expect(p.pages?.[0].height).toBe(720);
    });
});

describe('slide text inheritance', () => {
    test('a layout level without a size keeps the master size; theme tints apply', async () => {
        const view = await renderPptx(corpus('pptx/poi-sampleshow.pptx'), renderContext());
        const host = document.createElement('div');
        host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
        await /** @type {any} */ (view.pages)[0].draw(host, 1);
        const sub = /** @type {HTMLElement} */ ([...host.querySelectorAll('.awv-slide-p span')].find((s) => s.textContent === 'Subtitle of the first slide'));
        // Master body style: 32 pt; the layout's subtitle style: tx1 at 75 % tint.
        expect(parseFloat(sub.style.fontSize)).toBe(32);
        expect(sub.style.color).toBe('#404040');
    });
    test('colour transforms', () => {
        const node = (...mods) => ({ children: mods.map(([name, val]) => ({ name, attrs: { val: String(val) } })) });
        expect(colourMods('#000000', node(['a:tint', 75000]))).toBe('#404040');
        expect(colourMods('#ffffff', node(['a:shade', 50000]))).toBe('#808080');
        expect(colourMods('#4472c4', node(['a:lumMod', 60000], ['a:lumOff', 40000]))).toBe('#8faadc');
    });
    test('a theme-coloured run takes the theme colour', async () => {
        const ctx = renderContext();
        const { pptx } = await ctx.engine('pptx');
        const bytes = pptx.write({ slides: [{ shapes: [{ type: 'shape', id: 2, name: 'T',
            shapeProps: { geom: 'rect', cx: 4000000, cy: 1000000, offsetX: 0, offsetY: 0 }, txBody: {
            paragraphs: [{ runs: [{ type: 'text', value: 'accent', rPr: { color: { schemeColor: 'accent1' } } }] }]
        } }] }] });
        const view = await renderPptx(bytes, ctx);
        const host = document.createElement('div');
        host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
        await /** @type {any} */ (view.pages)[0].draw(host, 1);
        const span = /** @type {HTMLElement} */ ([...host.querySelectorAll('.awv-slide-p span')].find((s) => s.textContent === 'accent'));
        expect(span.style.color).toBe('#4472c4');
    });
});

describe('slide size', () => {
    test('the typed size, also from the p:sldSize that ooxml 1.0.0 wrote', async () => {
        const pptx = withPart(corpus('pptx/poi-sampleshow.pptx'), 'ppt/presentation.xml', (x) => x.replace(/<p:sldSz[^>]*>/, '<p:sldSize cx="9144000" cy="6858000"/>'));
        const view = await renderPptx(pptx, renderContext());
        expect([view.pages?.[0].width, view.pages?.[0].height]).toEqual([960, 720]);
    });
});

describe('typed DrawingML colours', () => {
    /** One slide, one rectangle per entry, each with a fill and a coloured run. */
    async function paint(shapes) {
        const ctx = renderContext();
        const { pptx } = await ctx.engine('pptx');
        const bytes = pptx.write({ slides: [{ shapes: shapes.map((s, i) => ({ type: 'shape', id: i + 2, name: `S${i}`,
            shapeProps: { geom: 'rect', cx: 2000000, cy: 1000000, offsetX: i * 2100000, offsetY: 0, ...(s.fill ? { fill: s.fill } : {}) },
            txBody: { paragraphs: [{ runs: [{ type: 'text', value: s.text, rPr: s.color ? { color: s.color } : {} }] }] } })) }] });
        const view = await renderPptx(bytes, ctx);
        const host = document.createElement('div');
        host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
        await /** @type {any} */ (view.pages)[0].draw(host, 1);
        const span = (text) => /** @type {HTMLElement} */ ([...host.querySelectorAll('.awv-slide-p span')].find((e) => e.textContent === text));
        const shape = (text) => /** @type {HTMLElement} */ ([...host.querySelectorAll('.awv-shape')].find((e) => e.textContent === text));
        return { span, shape };
    }
    const accent60 = [{ name: 'lumMod', val: 60000 }, { name: 'lumOff', val: 40000 }];
    test('an sRGB shape fill is painted', async () => {
        const { shape } = await paint([{ text: 'red', fill: { rgb: 'FF0000' } }]);
        expect(shape('red').style.backgroundColor).toBe('#ff0000');
    });
    test('fills apply their transforms, sRGB and theme alike', async () => {
        const { shape } = await paint([
            { text: 'srgb', fill: { rgb: '4472C4', mods: accent60 } },
            { text: 'theme', fill: { schemeColor: 'accent1', mods: accent60 } }
        ]);
        expect(shape('srgb').style.backgroundColor).toBe('#8faadc');
        expect(shape('theme').style.backgroundColor).toBe('#8faadc');
    });
    test('run colours apply their transforms, sRGB and theme alike', async () => {
        const { span } = await paint([
            { text: 'srgb', color: { rgb: '4472C4', mods: accent60 } },
            { text: 'theme', color: { schemeColor: 'accent1', mods: [{ name: 'shade', val: 50000 }] } },
            { text: 'plain', color: '00B050' }
        ]);
        expect(span('srgb').style.color).toBe('#8faadc');
        expect(span('theme').style.color).toBe('#223962');
        expect(span('plain').style.color).toBe('#00b050');
    });
});

describe('sheet painting', () => {
    test('rows past the first slice stop when the View is disposed', async () => {
        const many = '<table:table-row table:number-rows-repeated="1500"><table:table-cell office:value-type="string"><text:p>x</text:p></table:table-cell></table:table-row>';
        const bytes = withPart(fixture('rich.ods'), 'content.xml', (x) => x.replace(/<table:table-row\b/, `${many}<table:table-row`));
        const view = await renderOds(bytes, renderContext());
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        const first = sheet.querySelectorAll('tbody tr').length;
        expect(first).toBe(250);
        view.dispose();
        await new Promise((r) => setTimeout(r, 20));
        expect(sheet.querySelectorAll('tbody tr').length).toBe(first);
    });
});

describe('hidden columns', () => {
    test('an XLSX column marked hidden is left out, letters keep their gap', async () => {
        const bytes = withPart(fixture('rich.xlsx'), 'xl/worksheets/sheet1.xml', (x) => x.replace(/<col min="2" max="4"[^>]*\/>/, '<col min="2" max="2" width="14" customWidth="1" hidden="1"/><col min="3" max="4" width="14" customWidth="1"/>'));
        const view = await renderXlsx(bytes, renderContext());
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        const letters = [...sheet.querySelectorAll('thead th.awv-grid-col')].map((th) => th.textContent);
        expect(letters.slice(0, 3)).toEqual(['A', 'C', 'D']);
        expect(sheet.textContent).not.toContain('12,500');      // column B (Prévu) is hidden
        // The title merged over A1:D1 now spans the three columns left.
        expect(sheet.querySelector('tbody tr td')?.getAttribute('colspan')).toBe('3');
    });
});

describe('hidden and sized rows', () => {
    /** The row labels of a painted sheet, in order. */
    const rowLabels = (sheet) => [...sheet.querySelectorAll('tbody th.awv-grid-row')].map((th) => th.textContent);
    test('an XLSX row height is applied and a hidden row is left out, numbers keep their gap', async () => {
        const bytes = withPart(fixture('rich.xlsx'), 'xl/worksheets/sheet1.xml', (x) => x
            .replace('<row r="2">', '<row r="2" ht="30" customHeight="1">')
            .replace('<row r="4">', '<row r="4" hidden="1">'));
        const view = await renderXlsx(bytes, renderContext('en-GB'));
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        expect(rowLabels(sheet).slice(0, 4)).toEqual(['1', '2', '3', '5']);
        const row2 = /** @type {HTMLElement} */ (sheet.querySelectorAll('tbody tr')[1]);
        expect(row2.style.height).toBe('40px');               // 30 pt
    });
    test('ODS columns and rows that are collapsed or filtered are left out', async () => {
        const bytes = withPart(fixture('rich.ods'), 'content.xml', (x) => x
            .replace('<table:table-column table:style-name="co2" table:number-columns-repeated="3"/>',
                '<table:table-column table:style-name="co2" table:visibility="collapse"/><table:table-column table:style-name="co2" table:number-columns-repeated="2"/>')
            .replace('<table:table-row table:style-name="ro1"><table:table-cell office:value-type="string"><text:p>Nord',
                '<table:table-row table:style-name="ro1" table:visibility="filter"><table:table-cell office:value-type="string"><text:p>Nord'));
        const view = await renderOds(bytes, renderContext());
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        const letters = [...sheet.querySelectorAll('thead th.awv-grid-col')].map((th) => th.textContent);
        expect(letters.slice(0, 3)).toEqual(['A', 'C', 'D']);
        expect(rowLabels(sheet).slice(0, 3)).toEqual(['1', '3', '4']);
        expect(sheet.textContent).not.toContain('Nord');
        expect(sheet.textContent).not.toContain('T1');
    });
});

describe('general alignment', () => {
    test('booleans and errors are centred, as Excel shows them', async () => {
        const bytes = withPart(fixture('rich.xlsx'), 'xl/worksheets/sheet1.xml', (x) => x.replace('</sheetData>', '<row r="12"><c r="A12" t="b"><v>1</v></c><c r="B12" t="e"><v>#DIV/0!</v></c></row></sheetData>'));
        const view = await renderXlsx(bytes, renderContext());
        const sheet = /** @type {HTMLElement} */ (view.sheets?.[0].element);
        const a12 = /** @type {HTMLElement} */ (cellText(sheet, 'A12'));
        const b12 = /** @type {HTMLElement} */ (cellText(sheet, 'B12'));
        expect([a12.textContent, a12.style.textAlign]).toEqual(['TRUE', 'center']);
        expect([b12.textContent, b12.style.textAlign]).toEqual(['#DIV/0!', 'center']);
    });
});
