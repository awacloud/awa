// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `oconvMdToIr` — markdown text → `oconv-ir/v1` reader.
 *
 * Converts a markdown string into the FROZEN pivot IR (`oconvIr`,
 * `../ir/ir.js`), composing `@awacloud/md`'s public `md.parse` and
 * `mdFrontmatter.stripFrontmatter` — never an `@awacloud/md` internal
 * (a hard design constraint). Pure string/AST/object work,
 * no DOM, no I/O, no crypto — Worker-safe by construction, capture-free
 * factory (`fw/no-factory-capture`).
 *
 * The module has three static imports (`oconvIr`, `mdMod`, `mdFrontmatter`)
 * that mirror its `dependencies` for the generated `deps:` field; the factory
 * itself stays capture-free and reads only its injected parameters.
 *
 * ## Mapping (md AST node → IR), exhaustive
 *
 * | md node | IR | Notes |
 * |---|---|---|
 * | `document` | `document` | root via `irApi.doc(blocks)` |
 * | `heading` (level) | `heading{level}` | levels are 1–6 by construction in CommonMark |
 * | `paragraph` | `paragraph` | inline children flattened to runs |
 * | `text` | text of the current run | |
 * | `emph` / `strong` / `strikethrough` | run flags `italic` / `bold` / `strike` | nesting flattened into per-run boolean flags — a new `run` is emitted whenever the effective flag set or link target changes (`docx-to-ir` run-flattening style) |
 * | `code` (inline) | run flag `code: true` | |
 * | `link` | run prop `link: destination` on every run inside | link title (if any, non-empty) → loss `inline/dropped` detail `link-title` |
 * | `image` | `image{name: destination, alt: <plain text of children>}` | reference-only — no bytes; CommonMark never nests an image outside a paragraph/heading/cell, so it always lands at inline position (the IR schema also allows block position — a forward-looking legality, not a branch this reader takes) |
 * | `softbreak` | single space `' '` appended to the current run text | no loss |
 * | `linebreak` | single space + loss `{code:'inline/linebreak-degraded', detail:'hard break'}` | once per occurrence |
 * | `code_block` | `codeBlock{info: info string or '', text: literal}` | |
 * | `block_quote` | `blockquote` | |
 * | `thematic_break` | `hr` | |
 * | `list` / `item` | `list{ordered: listType==='ordered'}` / `listItem` | nesting PRESERVED (a nested `list` block inside a `listItem` flows through the same block walker); `listStart > 1` on an ordered list → loss `{code:'list/start-dropped', detail:'start='+listStart}` (IR has no start prop); a GFM task-list checkbox on an item → strip the marker (already stripped by `@awacloud/md`'s block-phase post-pass), loss `{code:'list/task-marker-dropped', detail:'[x]'\|'[ ]'}` |
 * | `table` / `table_row` / `table_cell` | `table` / `row{header: row.isHeader===true}` / `cell` | cell inlines wrapped in one `paragraph` block per cell; when `table.align` contains any non-null entry → ONE loss `{code:'table/align-dropped', detail: align.join(',')}` |
 * | `html_block` | dropped → loss `{code:'block/dropped', detail:'html_block'}` | |
 * | any other inline (e.g. `html_inline`) | dropped → loss `{code:'inline/dropped', detail:<type>}` | exhaustive-else: NO node type falls through silently |
 * | any other block | dropped → loss `{code:'block/dropped', detail:<type>}` | exhaustive-else |
 *
 * ## Loss codes emitted by this module
 *
 * | Code | Meaning |
 * |---|---|
 * | `frontmatter/stripped` | a leading `---`/`+++`/`;;;` fence was stripped before parsing; detail = `frontmatter.lang` |
 * | `list/start-dropped` | an ordered list started above 1; the IR `list` node has no start prop |
 * | `list/task-marker-dropped` | a GFM task-list checkbox was stripped from an item |
 * | `table/align-dropped` | a GFM table declared column alignment; the IR `row`/`cell` model has none |
 * | `inline/linebreak-degraded` | a hard line break degraded to a single space |
 * | `inline/dropped` | an unmapped inline node kind (detail = its `type`), or a non-empty link title |
 * | `block/dropped` | an unmapped block node kind (detail = its `type`) |
 *
 * Out of scope: no YAML/TOML/JSON parsing of the
 * stripped front matter content (oconv emits front matter, never
 * parses it), no footnotes/math/emoji handling (their syntax parses as
 * ordinary text/paragraphs under core `md.parse`, which is the correct
 * structural-axis behaviour).
 *
 * @module oconv/read/md-to-ir
 */

import { oconvIr } from '../ir/ir.js';
import { mdMod } from '@awacloud/md';
import { mdFrontmatter } from '@awacloud/md/extra/frontmatter.js';

export const oconvMdToIr = {
    name: 'oconvMdToIr',
    dependencies: ['oconvIr', 'md', 'mdFrontmatter'],
    deps: [oconvIr, mdMod, mdFrontmatter],

    factory(oconvIrMod, mdApi, frontmatterApi) {
        // Keep this factory capture-free (fw/no-factory-capture): every
        // helper it uses is declared inside its own body (mdToIr).
        const { node: irNode, doc: irDoc } = oconvIrMod;

        /**
         * Convert a markdown string into an `oconv-ir/v1` document plus its
         * loss ledger and detected front matter.
         *
         * @param {string} markdown
         * @returns {{ir: object, losses: {code: string, detail: string}[],
         *   frontmatter: {lang: string, content: string}|null}}
         */
        function mdToIr(markdown) {
            if (typeof markdown !== 'string') {
                throw new Error('oconv: markdown must be a string');
            }

            const losses = [];

            /** Plain text of an inline subtree (used for image alt text). */
            function plainText(n) {
                let s = '';
                for (let c = n.firstChild; c; c = c.next) {
                    if (c.type === 'text') s += c.literal || '';
                    else if (c.firstChild) s += plainText(c);
                }
                return s;
            }

            /**
             * Flatten the inline content of one container (`paragraph`,
             * `heading` or `table_cell`) into a flat sequence of IR `run` /
             * `image` leaves, pushed onto `out`. A new run is emitted
             * whenever the effective flag set or link target changes.
             */
            function flattenInlines(container, out) {
                let bufText = '';
                let bufFlags = null;

                function sameFlags(a, b) {
                    return a.bold === b.bold && a.italic === b.italic
                        && a.strike === b.strike && a.code === b.code
                        && a.link === b.link;
                }

                function flush() {
                    if (bufText !== '') {
                        out.push(irNode('run', {
                            text: bufText,
                            bold: bufFlags.bold,
                            italic: bufFlags.italic,
                            strike: bufFlags.strike,
                            code: bufFlags.code,
                            link: bufFlags.link
                        }));
                    }
                    bufText = '';
                    bufFlags = null;
                }

                function appendText(text, flags) {
                    if (!bufFlags || !sameFlags(bufFlags, flags)) {
                        flush();
                        bufFlags = flags;
                    }
                    bufText += text;
                }

                function walkInline(n, flags) {
                    for (let c = n.firstChild; c; c = c.next) {
                        switch (c.type) {
                            case 'text':
                                appendText(c.literal || '', flags);
                                break;
                            case 'softbreak':
                                appendText(' ', flags);
                                break;
                            case 'linebreak':
                                appendText(' ', flags);
                                losses.push({
                                    code: 'inline/linebreak-degraded',
                                    detail: 'hard break'
                                });
                                break;
                            case 'code':
                                flush();
                                out.push(irNode('run', {
                                    text: c.literal || '',
                                    bold: flags.bold,
                                    italic: flags.italic,
                                    strike: flags.strike,
                                    code: true,
                                    link: flags.link
                                }));
                                break;
                            case 'emph':
                                walkInline(c, { ...flags, italic: true });
                                break;
                            case 'strong':
                                walkInline(c, { ...flags, bold: true });
                                break;
                            case 'strikethrough':
                                walkInline(c, { ...flags, strike: true });
                                break;
                            case 'link':
                                if (c.title) {
                                    losses.push({
                                        code: 'inline/dropped', detail: 'link-title'
                                    });
                                }
                                walkInline(c, { ...flags, link: c.destination || '' });
                                break;
                            case 'image':
                                flush();
                                out.push(irNode('image', {
                                    name: c.destination || '',
                                    alt: plainText(c)
                                }));
                                break;
                            default:
                                losses.push({ code: 'inline/dropped', detail: c.type });
                        }
                    }
                }

                walkInline(container, {
                    bold: false, italic: false, strike: false, code: false, link: null
                });
                flush();
            }

            /** One IR `table` node from a `table` AST node. */
            function tableFromNode(t) {
                if (Array.isArray(t.align) && t.align.some(a => a !== null)) {
                    losses.push({
                        code: 'table/align-dropped', detail: t.align.join(',')
                    });
                }
                const rows = [];
                for (let r = t.firstChild; r; r = r.next) {
                    const cells = [];
                    for (let c = r.firstChild; c; c = c.next) {
                        const runs = [];
                        flattenInlines(c, runs);
                        cells.push(irNode('cell', {}, [irNode('paragraph', {}, runs)]));
                    }
                    rows.push(irNode('row', { header: r.isHeader === true }, cells));
                }
                return irNode('table', {}, rows);
            }

            /** One IR `list` node from a `list` AST node. */
            function listFromNode(l) {
                const ordered = l.listType === 'ordered';
                if (ordered && l.listStart != null && l.listStart > 1) {
                    losses.push({
                        code: 'list/start-dropped', detail: 'start=' + l.listStart
                    });
                }
                const items = [];
                for (let it = l.firstChild; it; it = it.next) {
                    if (it.checked !== null) {
                        losses.push({
                            code: 'list/task-marker-dropped',
                            detail: it.checked ? '[x]' : '[ ]'
                        });
                    }
                    items.push(irNode('listItem', {}, blocksFromNodes(it)));
                }
                return irNode('list', { ordered }, items);
            }

            /** Map the block children of a container (document/blockquote/
             * listItem/…) to a sequence of IR blocks. */
            function blocksFromNodes(container) {
                const out = [];
                for (let n = container.firstChild; n; n = n.next) {
                    switch (n.type) {
                        case 'heading': {
                            const runs = [];
                            flattenInlines(n, runs);
                            out.push(irNode('heading', { level: n.level }, runs));
                            break;
                        }
                        case 'paragraph': {
                            const runs = [];
                            flattenInlines(n, runs);
                            out.push(irNode('paragraph', {}, runs));
                            break;
                        }
                        case 'list':
                            out.push(listFromNode(n));
                            break;
                        case 'table':
                            out.push(tableFromNode(n));
                            break;
                        case 'code_block':
                            out.push(irNode('codeBlock', {
                                info: n.info || '', text: n.literal || ''
                            }));
                            break;
                        case 'block_quote':
                            out.push(irNode('blockquote', {}, blocksFromNodes(n)));
                            break;
                        case 'thematic_break':
                            out.push(irNode('hr'));
                            break;
                        case 'html_block':
                            losses.push({ code: 'block/dropped', detail: 'html_block' });
                            break;
                        default:
                            losses.push({ code: 'block/dropped', detail: n.type || 'unknown' });
                    }
                }
                return out;
            }

            const { rest, frontmatter } = frontmatterApi.stripFrontmatter(markdown);
            if (frontmatter) {
                losses.push({ code: 'frontmatter/stripped', detail: frontmatter.lang });
            }

            const ast = mdApi.parse(rest);
            const blocks = blocksFromNodes(ast);
            return { ir: irDoc(blocks), losses, frontmatter };
        }

        return { mdToIr };
    }
};
