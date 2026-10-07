// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render the body of `<office:text>` — orchestrator
 * over paragraphs, headings, lists, sections, tables, and the
 * soft-page-break marker.
 *
 * Each node has a `type`:
 *
 * | type              | element                |
 * |-------------------|------------------------|
 * | `paragraph`       | `<text:p>`             |
 * | `heading`         | `<text:h>`             |
 * | `list`            | `<text:list>`          |
 * | `section`         | `<text:section>`       |
 * | `table`           | `<table:table>`        |
 * | `soft-page-break` | `<text:soft-page-break/>` |
 * | `unknown`         | (preserved raw)        |
 *
 * **`table` cells are typed, unlike standalone `tableCell`.**
 * `tableCell.parseCell`/`renderCell` carry raw XML element nodes verbatim
 * in `children` (`table/cell.js`) — that module has no notion of
 * paragraphs, lists, or nested tables. WITHIN `textContent`, once a
 * `<table:table>` is parsed via `parseNode`, every non-covered cell's
 * `children` array is replaced with TYPED body nodes (the same node
 * shapes as everywhere else in this module — paragraphs, lists, nested
 * tables, or `unknown` for anything else), produced by recursing through
 * `parseNode`/`renderNode`. Covered cells (`covered: true`) always carry
 * `children: []`.
 *
 * **`ctx` threading.** Every parse/render entry point accepts an optional
 * trailing `ctx` — the style seam object built by `odt` (a
 * `textStyleRegistry` resolver on read, a registry on write). It is passed
 * straight through as an **extra trailing argument** to
 * `parseParagraph`/`renderParagraph`, `parseHeading`/`renderHeading` and
 * `parseList`/`renderList`. All three pairs consume it (typed run emphasis
 * and link runs in `textParagraph`/`textHeading`, ordered/bullet list styles
 * in `textList`); `ctx === undefined` reproduces the previous behaviour
 * exactly, byte for byte.
 * `textSection` never receives a `ctx` — its children reach it through the
 * hooks, which already carry the `ctx` of the enclosing call. Table cell
 * children are typed via `parseNode`/`renderNode` directly, so they too
 * carry the `ctx` of the enclosing call.
 *
 * **Grid tables (`grid?: boolean`).** A body `table` node may carry the
 * semantic `grid: true` field — never serialised as an attribute. On
 * render, with a `ctx` exposing `cellStyle`, the table gets
 * `node.styleName || ctx.tableStyle({align: 'margins'})` and every
 * non-covered cell `cell.styleName || ctx.cellStyle({bordered: true})`
 * (an explicit name always wins). On parse, with a `ctx` exposing
 * `cellBorders`, a table whose EVERY non-covered cell resolves
 * `bordered` regains `grid: true`; auto-resolved cell (and
 * `tableAlign`-resolved table) style names are dropped, named ones kept.
 * Any non-bordered cell leaves the table exactly as without the seam.
 *
 * @module odf/text/content
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { textParagraph } from './paragraph.js';
import { textHeading } from './heading.js';
import { textList } from './list.js';
import { textSection } from './section.js';
import { tableTable } from '../table/table.js';

export const textContent = {
    name: 'textContent',
    dependencies: ['xml', 'textParagraph', 'textHeading', 'textList', 'textSection', 'tableTable'],
    deps: [xml, textParagraph, textHeading, textList, textSection, tableTable],

    factory(xml, para, heading, list, section, table) {

        /**
         * Per-call child hooks — they close over the `ctx` of the enclosing
         * parse/render call so nested content keeps the same style seam.
         *
         * @param {object} [ctx]
         * @returns {{parseChild: Function, renderChild: Function}}
         */
        const mkHooks = ctx => ({
            parseChild: el => parseNode(el, ctx),
            renderChild: node => renderNode(node, ctx)
        });

        /**
         * Parse a single body element node into a typed model.
         * Returns `null` for unrecognised non-element nodes.
         *
         * @param {object} el
         * @param {object} [ctx] — style seam, forwarded as a trailing arg.
         * @returns {object|null}
         */
        function parseNode(el, ctx) {
            if (!el || el.type !== 'element') return null;
            switch (el.name) {
                case 'text:p':              return para.parseParagraph(el, ctx);
                case 'text:h':              return heading.parseHeading(el, ctx);
                case 'text:list':           return list.parseList(el, mkHooks(ctx), ctx);
                case 'text:section':        return section.parseSection(el, mkHooks(ctx));
                case 'table:table':         return parseBodyTable(el, ctx);
                case 'text:soft-page-break':
                    return { type: 'soft-page-break' };
                default:
                    return { type: 'unknown', element: el };
            }
        }

        /**
         * Render a typed body node back to an XML element.
         *
         * @param {object} node
         * @param {object} [ctx] — style seam, forwarded as a trailing arg.
         * @returns {object|null}
         */
        function renderNode(node, ctx) {
            if (!node) return null;
            switch (node.type) {
                case 'paragraph':       return para.renderParagraph(node, ctx);
                case 'heading':         return heading.renderHeading(node, ctx);
                case 'list':            return list.renderList(node, mkHooks(ctx), ctx);
                case 'section':         return section.renderSection(node, mkHooks(ctx));
                case 'table':           return renderBodyTable(node, ctx);
                case 'soft-page-break': return xml.el('text:soft-page-break', {}, []);
                case 'unknown':         return node.element || null;
                default:
                    // Pass-through raw XML element nodes
                    if (node.type === 'element') return node;
                    return null;
            }
        }

        /**
         * Parse a `<table:table>` element, typing every non-covered cell's
         * `children` (raw XML nodes at the `tableTable`/`tableCell` layer)
         * into the same node shapes used everywhere else in this module.
         * Covered cells (`covered: true`) always end up with `children: []`.
         *
         * The table model returned by `tableMod.parseTable` is freshly
         * allocated (rows/cells are not shared with the caller's `el`), so
         * mutating its cells in place here does not touch the input XML
         * node.
         *
         * @param {object} el
         * @param {object} [ctx] — style seam, forwarded to every cell child.
         * @returns {object}
         */
        function parseBodyTable(el, ctx) {
            const t = table.parseTable(el);
            for (const row of t.rows || []) {
                for (const cell of row.cells || []) {
                    cell.children = cell.covered
                        ? []
                        : (cell.children || []).map(c => parseNode(c, ctx)).filter(Boolean);
                }
            }
            if (ctx && typeof ctx.cellBorders === 'function') recogniseGrid(t, ctx);
            return t;
        }

        /**
         * Recognise a grid table: EVERY non-covered cell (at least one)
         * must resolve `bordered` through `ctx.cellBorders`. On success set
         * `t.grid = true`, drop every auto-resolved cell `styleName`
         * (named: keep-and-gain) and the table `styleName` when
         * `ctx.tableAlign` resolves it with `source: 'auto'`. On failure
         * the table is left exactly as parsed, and any automatic style
         * this attempt consumed is released again, so it stays surfaced.
         *
         * @param {object} t parsed table model (mutated in place)
         * @param {object} ctx read-side resolver
         */
        function recogniseGrid(t, ctx) {
            const cells = [];
            for (const row of t.rows || []) {
                for (const cell of row.cells || []) if (!cell.covered) cells.push(cell);
            }
            if (!cells.length) return;
            for (const cell of cells) if (!cell.styleName) return;
            const consumed = ctx.consumed instanceof Set ? ctx.consumed : null;
            const before = consumed ? new Set(consumed) : null;
            const resolved = [];
            for (const cell of cells) {
                const r = ctx.cellBorders(cell.styleName);
                if (!r || !r.bordered) {
                    if (consumed) {
                        for (const n of [...consumed]) if (!before.has(n)) consumed.delete(n);
                    }
                    return;
                }
                resolved.push(r);
            }
            t.grid = true;
            cells.forEach((cell, i) => {
                if (resolved[i].source === 'auto') delete cell.styleName;
            });
            if (t.styleName && typeof ctx.tableAlign === 'function') {
                const a = ctx.tableAlign(t.styleName);
                if (a && a.source === 'auto') delete t.styleName;
            }
        }

        /**
         * Render a typed `table` node back to a `<table:table>` element.
         *
         * Deep-copies the table/rows/cells before swapping each cell's
         * typed `children` for rendered XML nodes, so the caller's model
         * (`node`) is never mutated — a subsequent `odt.write` on the same
         * in-memory doc must see it unchanged.
         *
         * `node.grid === true` with a `ctx` exposing `cellStyle` names the
         * margins table style and the bordered cell style on the copy
         * (explicit `styleName`s win); without `grid` or `ctx` the output
         * is byte-identical to the seam-free render.
         *
         * @param {object} node
         * @param {object} [ctx] — style seam, forwarded to every cell child.
         * @returns {object}
         */
        function renderBodyTable(node, ctx) {
            const grid = node.grid === true && !!ctx && typeof ctx.cellStyle === 'function';
            const copy = {
                ...node,
                rows: (node.rows || []).map(row => ({
                    ...row,
                    cells: (row.cells || []).map(cell => {
                        const c = {
                            ...cell,
                            children: (cell.children || []).map(n => renderNode(n, ctx)).filter(Boolean)
                        };
                        if (grid && !cell.covered) {
                            c.styleName = cell.styleName || ctx.cellStyle({ bordered: true });
                        }
                        return c;
                    })
                }))
            };
            delete copy.grid;
            if (grid) copy.styleName = node.styleName || ctx.tableStyle({ align: 'margins' });
            return table.renderTable(copy);
        }

        /**
         * Parse the body of an `<office:text>` element into typed nodes.
         *
         * @param {object} officeTextEl
         * @param {object} [ctx] — style seam, forwarded to every child.
         * @returns {Array<object>}
         */
        function parseBody(officeTextEl, ctx) {
            const out = [];
            if (!officeTextEl || !officeTextEl.children) return out;
            for (const c of officeTextEl.children) {
                if (c.type !== 'element') continue;
                const node = parseNode(c, ctx);
                if (node) out.push(node);
            }
            return out;
        }

        /**
         * Render a list of typed body nodes to an array of XML elements.
         *
         * @param {Array<object>} nodes
         * @param {object} [ctx] — style seam, forwarded to every child.
         * @returns {Array<object>}
         */
        function renderBody(nodes, ctx) {
            const out = [];
            for (const n of nodes || []) {
                const x = renderNode(n, ctx);
                if (x) out.push(x);
            }
            return out;
        }

        /**
         * Concatenate the visible text of a body sequence (walking into
         * headings, lists, sections and table cells): one line per paragraph
         * or heading, followed by the text of any text box
         * (`draw:frame` / `draw:text-box`) the reader kept raw next to it.
         * Image frames and alternative text (`svg:title` / `svg:desc`)
         * contribute nothing; text inside a `text:span` is emitted inline
         * with the span.
         *
         * @param {Array<object>} nodes
         * @returns {string}
         */
        function bodyText(nodes) {
            const lines = [];
            walk(nodes, lines);
            return lines.join('\n');
        }

        /**
         * Append the text of every `draw:text-box` reachable from a raw
         * element, in document order. A text box's own element children are
         * typed and walked once (which reaches boxes nested in its
         * paragraphs); the box is never descended into by raw recursion, so
         * nothing is counted twice. `svg:title` / `svg:desc` (alternative
         * text) contribute nothing.
         *
         * @param {object} el raw XML node
         * @param {Array<string>} lines output lines
         */
        function boxes(el, lines) {
            if (!el || el.type !== 'element') return;
            if (el.name === 'svg:title' || el.name === 'svg:desc') return;
            if (el.name === 'draw:text-box') {
                const typed = [];
                for (const c of el.children || []) {
                    const t = parseNode(c);
                    if (t) typed.push(t);
                }
                walk(typed, lines);
                return;
            }
            for (const c of el.children || []) boxes(c, lines);
        }

        /**
         * Visit the raw elements a paragraph / heading kept in `_extras`,
         * then those kept by its link runs (recursively), emitting the text
         * of any text box among them.
         *
         * @param {object} n paragraph or heading node
         * @param {Array<string>} lines output lines
         */
        function inlineBoxes(n, lines) {
            const extras = n._extras && n._extras.children;
            if (extras) for (const el of extras) boxes(el, lines);
            // Links — including links nested in a span's `runs` — are visited
            // for the boxes of their untyped children. A span's raw element
            // entries are not: their text is already inline through `textOf`.
            const visitRuns = runs => {
                for (const r of runs || []) {
                    if (!r) continue;
                    if (r.type === 'span' && Array.isArray(r.runs)) {
                        visitRuns(r.runs);
                    } else if (r.type === 'link') {
                        const ex = r._extras && r._extras.children;
                        if (ex) for (const el of ex) boxes(el, lines);
                        visitRuns(r.runs);
                    }
                }
            };
            visitRuns(n.runs);
        }

        function walk(nodes, lines) {
            for (const n of nodes || []) {
                if (!n) continue;
                if (n.type === 'paragraph' || n.type === 'heading') {
                    lines.push(para.textOf(n));
                    inlineBoxes(n, lines);
                } else if (n.type === 'unknown') {
                    boxes(n.element, lines);
                } else if (n.type === 'list') {
                    for (const it of n.items || []) walk(it.children, lines);
                } else if (n.type === 'section') {
                    walk(n.children, lines);
                } else if (n.type === 'table') {
                    for (const row of n.rows || []) {
                        for (const cell of row.cells || []) walk(cell.children, lines);
                    }
                }
            }
        }

        return { parseNode, renderNode, parseBody, renderBody, bodyText };
    }
};
