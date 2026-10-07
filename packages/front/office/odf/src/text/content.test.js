// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { textParagraph } from './paragraph.js';
import { textHeading } from './heading.js';
import { textList } from './list.js';
import { textSection } from './section.js';
import { textContent } from './content.js';
import { tableCell } from '../table/cell.js';
import { tableRow } from '../table/row.js';
import { tableTable } from '../table/table.js';
import { textStyleRegistry } from './style-registry.js';

function build() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const para = textParagraph.factory(xml);
    const heading = textHeading.factory(xml, para);
    const list = textList.factory(xml, para);
    const section = textSection.factory(xml);
    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);
    const content = textContent.factory(xml, para, heading, list, section, table);
    return { xml, para, heading, list, section, table, content };
}

/**
 * Same wiring, but `textParagraph` is wrapped by a spy that records the
 * trailing `ctx` argument it receives.
 */
function buildSpy() {
    const xml = fwXml.factory();
    const errors = odfErrors.factory();
    const shared = odfShared.factory(errors, xml);
    const real = textParagraph.factory(xml);
    const calls = { parse: [], render: [] };
    const para = {
        ...real,
        parseParagraph: (el, ctx) => { calls.parse.push(ctx); return real.parseParagraph(el); },
        renderParagraph: (node, ctx) => { calls.render.push(ctx); return real.renderParagraph(node); }
    };
    const heading = textHeading.factory(xml, para);
    const list = textList.factory(xml, para);
    const section = textSection.factory(xml);
    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);
    const content = textContent.factory(xml, para, heading, list, section, table);
    return { xml, content, calls };
}

describe('textContent module', () => {
    test('factory shape', () => {
        expect(textContent.name).toBe('textContent');
        expect(textContent.dependencies).toEqual([
            'xml', 'textParagraph', 'textHeading', 'textList', 'textSection', 'tableTable']);
        expect(typeof textContent.factory).toBe('function');
    });

    describe('parseBody / renderBody', () => {
        test('typed paragraph + heading', () => {
            const { xml, content } = build();
            const root = xml.parse('<office:text><text:h text:outline-level="1">T</text:h><text:p>body</text:p></office:text>');
            const nodes = content.parseBody(root);
            expect(nodes).toHaveLength(2);
            expect(nodes[0].type).toBe('heading');
            expect(nodes[1].type).toBe('paragraph');
        });

        test('list + section roundtrip', () => {
            const { xml, content } = build();
            const src = '<office:text><text:list><text:list-item><text:p>a</text:p></text:list-item></text:list><text:section text:name="S"><text:p>inside</text:p></text:section></office:text>';
            const nodes = content.parseBody(xml.parse(src));
            expect(nodes[0].type).toBe('list');
            expect(nodes[1].type).toBe('section');
            const rendered = content.renderBody(nodes);
            const wrapper = xml.el('office:text', {}, rendered);
            const out = xml.serialize(wrapper);
            expect(out).toContain('<text:list>');
            expect(out).toContain('text:name="S"');
            expect(out).toContain('inside');
        });

        test('soft-page-break roundtrip', () => {
            const { xml, content } = build();
            const nodes = content.parseBody(xml.parse('<office:text><text:soft-page-break/></office:text>'));
            expect(nodes[0].type).toBe('soft-page-break');
            const rendered = content.renderBody(nodes);
            expect(rendered[0].name).toBe('text:soft-page-break');
        });
    });

    describe('ctx threading', () => {
        const SRC = '<office:text><text:p>a</text:p>'
            + '<text:list><text:list-item><text:p>li</text:p></text:list-item></text:list>'
            + '<text:section text:name="S"><text:p>sec</text:p></text:section></office:text>';

        test('parseBody forwards ctx to parseParagraph, through lists and sections', () => {
            const { xml, content, calls } = buildSpy();
            const ctx = { marker: 'seam' };
            const nodes = content.parseBody(xml.parse(SRC), ctx);
            expect(nodes).toHaveLength(3);
            expect(calls.parse).toHaveLength(3);
            for (const seen of calls.parse) expect(seen).toBe(ctx);
        });

        test('renderBody forwards ctx to renderParagraph, through lists and sections', () => {
            const { xml, content, calls } = buildSpy();
            const ctx = { marker: 'seam' };
            const nodes = content.parseBody(xml.parse(SRC));
            calls.parse.length = 0;
            content.renderBody(nodes, ctx);
            expect(calls.render).toHaveLength(3);
            for (const seen of calls.render) expect(seen).toBe(ctx);
        });

        test('ctx-less calls pass undefined — today\'s behaviour', () => {
            const { xml, content, calls } = buildSpy();
            const nodes = content.parseBody(xml.parse(SRC));
            content.renderBody(nodes);
            expect(calls.parse).toEqual([undefined, undefined, undefined]);
            expect(calls.render).toEqual([undefined, undefined, undefined]);
        });

        test('parseNode / renderNode accept ctx directly', () => {
            const { xml, content, calls } = buildSpy();
            const ctx = { marker: 'direct' };
            const p = xml.parse('<text:p>x</text:p>');
            const node = content.parseNode(p, ctx);
            content.renderNode(node, ctx);
            expect(calls.parse).toEqual([ctx]);
            expect(calls.render).toEqual([ctx]);
        });

        test('output is identical with and without a ctx', () => {
            const { xml, content } = buildSpy();
            const withCtx = xml.serialize(xml.el('office:text', {},
                content.renderBody(content.parseBody(xml.parse(SRC), { a: 1 }), { a: 1 })));
            const without = xml.serialize(xml.el('office:text', {},
                content.renderBody(content.parseBody(xml.parse(SRC)))));
            expect(withCtx).toBe(without);
        });
    });

    describe('table', () => {
        test('2x2 with header row, string cells holding paragraphs — parseBody(renderBody(model)) deep-equal', () => {
            const { xml, para, content } = build();
            const model = [{
                type: 'table',
                name: 'T1',
                columns: [{}, {}],
                headerRows: 1,
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', children: [para.paragraph('H1')] },
                        { type: 'cell', children: [para.paragraph('H2')] }
                    ] },
                    { type: 'row', cells: [
                        { type: 'cell', children: [para.paragraph('a')] },
                        { type: 'cell', children: [para.paragraph('b')] }
                    ] }
                ]
            }];
            const wrapper = xml.el('office:text', {}, content.renderBody(model));
            const back = content.parseBody(wrapper);
            expect(back).toEqual(model);
        });

        test('a cell containing a list and a nested table — ctx recurses through both hooks', () => {
            const { xml, content, calls } = buildSpy();
            const ctx = { marker: 'nested' };
            const src = '<office:text><table:table><table:table-row><table:table-cell>'
                + '<text:list><text:list-item><table:table><table:table-row><table:table-cell>'
                + '<text:p>deep</text:p></table:table-cell></table:table-row></table:table>'
                + '</text:list-item></text:list>'
                + '</table:table-cell></table:table-row></table:table></office:text>';
            const nodes = content.parseBody(xml.parse(src), ctx);
            expect(nodes).toHaveLength(1);
            const outer = nodes[0];
            expect(outer.type).toBe('table');
            const listNode = outer.rows[0].cells[0].children[0];
            expect(listNode.type).toBe('list');
            const nestedTable = listNode.items[0].children[0];
            expect(nestedTable.type).toBe('table');
            const deepParagraph = nestedTable.rows[0].cells[0].children[0];
            expect(deepParagraph.type).toBe('paragraph');
            // The innermost text:p was reached through table -> list -> table -> cell,
            // and the enclosing ctx travelled with it unchanged.
            expect(calls.parse).toEqual([ctx]);

            // Render back through the same nesting and confirm ctx propagates on write too.
            calls.render.length = 0;
            content.renderBody(nodes, ctx);
            expect(calls.render).toEqual([ctx]);
        });

        test('covered cell + repeated/colSpan attrs preserved; covered cell children forced to []', () => {
            const { xml, content } = build();
            const src = '<office:text><table:table><table:table-row>'
                + '<table:table-cell table:number-columns-spanned="2" table:number-columns-repeated="3"><text:p>x</text:p></table:table-cell>'
                + '<table:covered-table-cell><text:p>should be dropped</text:p></table:covered-table-cell>'
                + '</table:table-row></table:table></office:text>';
            const nodes = content.parseBody(xml.parse(src));
            const [normal, covered] = nodes[0].rows[0].cells;
            expect(normal.colSpan).toBe(2);
            expect(normal.repeated).toBe(3);
            expect(normal.children).toHaveLength(1);
            expect(normal.children[0].type).toBe('paragraph');
            expect(covered.covered).toBe(true);
            expect(covered.children).toEqual([]);

            // Round-trip: attrs survive render, covered cell stays childless.
            const rendered = content.renderBody(nodes);
            const out = xml.serialize(xml.el('office:text', {}, rendered));
            expect(out).toContain('table:number-columns-spanned="2"');
            expect(out).toContain('table:number-columns-repeated="3"');
            expect(out).toContain('<table:covered-table-cell/>');
        });

        test('renderBody does not mutate the typed input model (input-mutation guard)', () => {
            const { para, content } = build();
            const model = [{
                type: 'table',
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', children: [para.paragraph('a')] }
                    ] }
                ]
            }];
            const snapshot = structuredClone(model);
            content.renderBody(model, { marker: 'seam' });
            expect(model).toEqual(snapshot);
        });

        test('an old-model {type: unknown, element} table node still renders verbatim', () => {
            const { xml, content } = build();
            const tableEl = xml.parse('<table:table table:name="Old"><table:table-row><table:table-cell/></table:table-row></table:table>');
            const node = { type: 'unknown', element: tableEl };
            const rendered = content.renderNode(node);
            expect(rendered).toBe(tableEl);
        });

        test('bodyText covers table text', () => {
            const { para, content } = build();
            const model = [
                para.paragraph('before'),
                {
                    type: 'table',
                    rows: [
                        { type: 'row', cells: [
                            { type: 'cell', children: [para.paragraph('t1')] },
                            { type: 'cell', children: [para.paragraph('t2')] }
                        ] }
                    ]
                }
            ];
            expect(content.bodyText(model)).toBe('before\nt1\nt2');
        });
    });

    describe('bodyText', () => {
        test('walks headings, paragraphs, lists, sections', () => {
            const { xml, content } = build();
            const root = xml.parse('<office:text><text:h>Title</text:h><text:p>p1</text:p><text:list><text:list-item><text:p>li1</text:p></text:list-item><text:list-item><text:p>li2</text:p></text:list-item></text:list><text:section text:name="S"><text:p>insec</text:p></text:section></office:text>');
            const nodes = content.parseBody(root);
            expect(content.bodyText(nodes)).toBe('Title\np1\nli1\nli2\ninsec');
        });

        describe('text boxes (draw:frame > draw:text-box) kept raw by the reader', () => {
            const BOX = t => `<draw:frame><draw:text-box><text:p>${t}</text:p></draw:text-box></draw:frame>`;
            const textOf = body => {
                const { xml, content } = build();
                const root = xml.parse(`<office:text>${body}</office:text>`);
                return content.bodyText(content.parseBody(root));
            };

            test('paragraph: box text follows the paragraph line', () => {
                expect(textOf(`<text:p>Before ${BOX('InsideBox')} after</text:p>`))
                    .toBe('Before  after\nInsideBox');
            });

            test('heading', () => {
                expect(textOf(`<text:h>Head ${BOX('InHeading')}</text:h>`))
                    .toBe('Head \nInHeading');
            });

            test('list item', () => {
                expect(textOf(`<text:list><text:list-item><text:p>Item ${BOX('InList')}</text:p></text:list-item></text:list>`))
                    .toBe('Item \nInList');
            });

            test('table cell', () => {
                expect(textOf(`<table:table><table:table-row><table:table-cell><text:p>Cell ${BOX('InCell')}</text:p></table:table-cell></table:table-row></table:table>`))
                    .toBe('Cell \nInCell');
            });

            test('box in a box', () => {
                expect(textOf(`<text:p>Outer ${BOX('L1 ' + BOX('L2'))}</text:p>`))
                    .toBe('Outer \nL1 \nL2');
            });

            test('body-level frame after a paragraph', () => {
                expect(textOf(`<text:p>P</text:p>${BOX('BodyLevel')}`))
                    .toBe('P\nBodyLevel');
            });

            test('image frame with alternative text contributes nothing', () => {
                expect(textOf('<text:p>Img <draw:frame><draw:image xlink:href="Pictures/a.png"/><svg:title>Alt title</svg:title><svg:desc>Alt desc</svg:desc></draw:frame></text:p>'))
                    .toBe('Img ');
            });

            test('text inside a span stays inline and is not duplicated', () => {
                expect(textOf(`<text:p>Before <text:span>${BOX('InSpan')}</text:span> after</text:p>`))
                    .toBe('Before InSpan after');
            });

            test('spacing inside a span is honoured', () => {
                expect(textOf('<text:p><text:span>B<text:s text:c="3"/>C</text:span></text:p>'))
                    .toBe('B   C');
            });

            test('frame inside a link inside a span is reached once', () => {
                expect(textOf(`<text:p>See <text:span><text:a xlink:href="u">here ${BOX('InLink')}</text:a></text:span></text:p>`))
                    .toBe('See here \nInLink');
            });

            test('frame inside a link run is reached once', () => {
                expect(textOf(`<text:p>See <text:a xlink:href="u">here ${BOX('InLink')}</text:a></text:p>`))
                    .toBe('See here \nInLink');
            });

            test('title / desc beside a text box are skipped, the box is kept', () => {
                expect(textOf('<text:p>X<draw:frame><svg:title>T</svg:title><draw:text-box><text:p>Kept</text:p></draw:text-box><svg:desc>D</svg:desc></draw:frame></text:p>'))
                    .toBe('X\nKept');
            });

            test('several boxes keep document order', () => {
                expect(textOf(`<text:p>A${BOX('one')}${BOX('two')}</text:p><text:p>B</text:p>`))
                    .toBe('A\none\ntwo\nB');
            });
        });
    });

    // ------------------------------------------------------------------
    // office/BATCH_48/01 — table grid seam
    describe('grid tables', () => {
        const REG = textStyleRegistry.factory(fwXml.factory());

        /** A grid table: 2 rows x 3 cols, one covered cell, no style names. */
        function gridTable(para) {
            return {
                type: 'table', grid: true,
                columns: [{ repeated: 3 }],
                rows: [
                    { type: 'row', cells: [
                        { type: 'cell', colSpan: 2, children: [para.paragraph('a')] },
                        { type: 'cell', covered: true, children: [] },
                        { type: 'cell', children: [para.paragraph('b')] }
                    ] },
                    { type: 'row', cells: [
                        { type: 'cell', children: [para.paragraph('c')] },
                        { type: 'cell', children: [para.paragraph('d')] },
                        { type: 'cell', children: [para.paragraph('e')] }
                    ] }
                ]
            };
        }

        /** Every `name` cell element under the rows of a rendered table. */
        function cellEls(xml, tableEl, name) {
            return xml.findAll(tableEl, 'table:table-row')
                .flatMap(r => xml.findAll(r, name));
        }

        function renderWith(content, xml, model, registry) {
            const out = content.renderBody(model, registry);
            return { els: out, xmlText: xml.serialize(xml.el('office:text', {}, out)) };
        }

        test('render with grid + ctx names every non-covered cell and the table', () => {
            const { xml, para, content } = build();
            const registry = REG.createRegistry();
            const { els, xmlText } = renderWith(content, xml, [gridTable(para)], registry);
            const tableEl = els[0];
            expect(tableEl.attrs).toEqual({ 'table:style-name': 'awa-tb-m' });
            const cells = cellEls(xml, tableEl, 'table:table-cell');
            expect(cells).toHaveLength(5);
            for (const c of cells) expect(c.attrs['table:style-name']).toBe('awa-c-b');
            const covered = cellEls(xml, tableEl, 'table:covered-table-cell');
            expect(covered).toHaveLength(1);
            expect(covered[0].attrs).toEqual({});
            expect(xmlText).not.toContain('grid');
            expect(registry.toAutomaticStyles().styles.map(s => s.name)).toEqual(['awa-c-b', 'awa-tb-m']);
        });

        test('explicit cell and table styleName win over the grid names', () => {
            const { xml, para, content } = build();
            const t = gridTable(para);
            t.styleName = 'MyTable';
            t.rows[0].cells[0].styleName = 'MyCell';
            const registry = REG.createRegistry();
            const { els } = renderWith(content, xml, [t], registry);
            expect(els[0].attrs['table:style-name']).toBe('MyTable');
            const names = cellEls(xml, els[0], 'table:table-cell').map(c => c.attrs['table:style-name']);
            expect(names).toEqual(['MyCell', 'awa-c-b', 'awa-c-b', 'awa-c-b', 'awa-c-b']);
            expect(registry.toAutomaticStyles().styles.map(s => s.name)).toEqual(['awa-c-b']);
        });

        test('without ctx a grid table carries no style attributes', () => {
            const { xml, para, content } = build();
            const { els, xmlText } = renderWith(content, xml, [gridTable(para)], undefined);
            expect(els[0].attrs).toEqual({});
            expect(xmlText).not.toContain('table:style-name');
            // byte-identical to the same table without the grid field
            const plain = gridTable(para);
            delete plain.grid;
            expect(xmlText).toBe(renderWith(content, xml, [plain], undefined).xmlText);
        });

        test('with ctx but without grid the output is unchanged', () => {
            const { xml, para, content } = build();
            const plain = gridTable(para);
            delete plain.grid;
            const registry = REG.createRegistry();
            const a = renderWith(content, xml, [plain], registry).xmlText;
            expect(a).toBe(renderWith(content, xml, [plain], undefined).xmlText);
            expect(registry.toAutomaticStyles()).toBeNull();
        });

        test('render does not mutate the grid input model', () => {
            const { para, content } = build();
            const model = [gridTable(para)];
            const snapshot = structuredClone(model);
            content.renderBody(model, REG.createRegistry());
            expect(model).toEqual(snapshot);
        });

        test('parse(render(T)) deep-equals T through the registry/resolver seam', () => {
            const { xml, para, content } = build();
            const T = gridTable(para);
            const registry = REG.createRegistry();
            const wrapper = xml.el('office:text', {}, content.renderBody([T], registry));
            const resolver = REG.createResolver(registry.toAutomaticStyles(), [], null);
            const back = content.parseBody(wrapper, resolver);
            expect(back).toEqual([T]);
            expect([...resolver.consumed].sort()).toEqual(['awa-c-b', 'awa-tb-m']);
        });

        test('named cell styles are kept and still gain grid', () => {
            const { xml, para, content } = build();
            const named = xml.el('style:style', { 'style:name': 'GridCell', 'style:family': 'table-cell' },
                [xml.el('style:table-cell-properties', { 'fo:border': '0.5pt solid #000000' }, [])]);
            const t = gridTable(para);
            for (const row of t.rows) for (const c of row.cells) if (!c.covered) c.styleName = 'GridCell';
            const registry = REG.createRegistry();
            const wrapper = xml.el('office:text', {}, content.renderBody([t], registry));
            const resolver = REG.createResolver(registry.toAutomaticStyles(), [], [named]);
            const back = content.parseBody(wrapper, resolver)[0];
            expect(back.grid).toBe(true);
            expect(back.styleName).toBeUndefined();
            for (const row of back.rows) {
                for (const c of row.cells) {
                    if (c.covered) expect(c.styleName).toBeUndefined();
                    else expect(c.styleName).toBe('GridCell');
                }
            }
            expect([...resolver.consumed]).toEqual(['awa-tb-m']);
        });

        test('ONE unstyled cell among bordered ones → no grid, names kept, nothing consumed', () => {
            const { xml, para, content } = build();
            const registry = REG.createRegistry();
            const els = content.renderBody([gridTable(para)], registry);
            // strip the style name of the last cell in the rendered XML
            const cells = cellEls(xml, els[0], 'table:table-cell');
            delete cells[4].attrs['table:style-name'];
            const resolver = REG.createResolver(registry.toAutomaticStyles(), [], null);
            const back = content.parseBody(xml.el('office:text', {}, els), resolver)[0];
            expect(back.grid).toBeUndefined();
            expect(back.styleName).toBe('awa-tb-m');
            const names = back.rows.flatMap(r => r.cells.filter(c => !c.covered).map(c => c.styleName));
            expect(names).toEqual(['awa-c-b', 'awa-c-b', 'awa-c-b', 'awa-c-b', undefined]);
            expect([...resolver.consumed]).toEqual([]);
        });

        test('a cell whose style does not resolve releases the styles it consumed', () => {
            const { xml, para, content } = build();
            const registry = REG.createRegistry();
            const els = content.renderBody([gridTable(para)], registry);
            const cells = cellEls(xml, els[0], 'table:table-cell');
            cells[4].attrs['table:style-name'] = 'Foreign';
            const resolver = REG.createResolver(registry.toAutomaticStyles(), [], null);
            const back = content.parseBody(xml.el('office:text', {}, els), resolver)[0];
            expect(back.grid).toBeUndefined();
            expect(back.rows[0].cells[0].styleName).toBe('awa-c-b');
            expect([...resolver.consumed]).toEqual([]);
        });

        test('falsification twin: a cell style without fo:border → no grid', () => {
            const { xml, para, content } = build();
            const registry = REG.createRegistry();
            const els = content.renderBody([gridTable(para)], registry);
            const auto = registry.toAutomaticStyles();
            delete auto.styles[0].properties.tableCell['fo:border'];
            const resolver = REG.createResolver(auto, [], null);
            const back = content.parseBody(xml.el('office:text', {}, els), resolver)[0];
            expect(back.grid).toBeUndefined();
            expect(back.styleName).toBe('awa-tb-m');
            expect(back.rows[1].cells[2].styleName).toBe('awa-c-b');
            expect([...resolver.consumed]).toEqual([]);
        });

        test('a table with only covered cells never becomes a grid', () => {
            const { xml, content } = build();
            const src = '<office:text><table:table><table:table-row>'
                + '<table:covered-table-cell/></table:table-row></table:table></office:text>';
            const resolver = REG.createResolver(null, [], null);
            const back = content.parseBody(xml.parse(src), resolver)[0];
            expect(back.grid).toBeUndefined();
        });

        test('a ctx without cellBorders leaves parsing untouched', () => {
            const { xml, para, content } = build();
            const registry = REG.createRegistry();
            const wrapper = xml.el('office:text', {}, content.renderBody([gridTable(para)], registry));
            const back = content.parseBody(wrapper, { marker: 'no-seam' })[0];
            expect(back.grid).toBeUndefined();
            expect(back.styleName).toBe('awa-tb-m');
        });
    });
});
