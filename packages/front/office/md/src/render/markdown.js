// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AST → Markdown renderer (strict factory-only, roundtrip-safe).
 *
 * Serialises CommonMark + GFM, plus the three extension inline types
 * `subscript` (`~x~`), `superscript` (`^x^`) and `highlight` (`==x==`).
 * Every other extension node (`math_*`, `footnote_*`, `admonition`,
 * extension-built `html_*`) is emitted as the empty string, content
 * included: the round-trip guarantee covers CommonMark + GFM only.
 *
 * @module md/render/markdown
 */

import { mdErrors } from '../errors.js';

export const renderMarkdownMod = {
    name: 'renderMarkdownMod',
    dependencies: ['mdErrors'],
    deps: [mdErrors],
    factory(errors) {
        const { RenderError } = errors;
        function escapeText(s) {
            return s.replace(/([\\`*_[\]<>~])/g, '\\$1').replace(/!\[/g, '\\!\\[');
        }
        /**
         * Escape a block marker at the start of ONE line of a paragraph's
         * rendered inline text, so the line re-parses as paragraph text:
         * an ordered-list marker `1.` / `1)` gets its delimiter
         * escaped (`1\.`), a bullet `-` / `+` / `*`, an ATX heading
         * `#`..`######` and a blockquote `>` get a leading backslash. A
         * marker counts only when followed by whitespace or the end of the
         * line. A line made only of `-` or `=` characters (a setext
         * underline / thematic break) gets a leading backslash too. The
         * marker may be preceded by 1-3 spaces (a block marker may be
         * indented that far): the indent is kept and the escape goes after
         * it. Four or more leading spaces are out of scope (a parsed
         * paragraph never carries leading whitespace). Any other line is
         * returned unchanged.
         */
        function escapeLineStart(line) {
            const lead = /^ {1,3}(?=\S)/.exec(line);
            const indent = lead ? lead[0] : '';
            const rest = line.slice(indent.length);
            if (/^(-+|=+)[ \t]*$/.test(rest)) return indent + '\\' + rest;          // setext underline / thematic break
            const ord = /^(\d{1,9})([.)])(?=\s|$)/.exec(rest);
            if (ord) return indent + ord[1] + '\\' + ord[2] + rest.slice(ord[0].length);
            if (/^[-+*](?=\s|$)/.test(rest) || /^#{1,6}(?=\s|$)/.test(rest) || rest.charCodeAt(0) === 0x3e /* > */) {
                return indent + '\\' + rest;
            }
            return line;
        }
        /**
         * CommonMark link destination: bare form when possible, `<…>` when
         * the text needs it (whitespace, a control character or a leading
         * `<`). In the `<…>` form `<`, `>` and `\` are escaped and a line
         * ending becomes `%0A` (a destination cannot span lines). The bare
         * form escapes only parentheses.
         */
        function renderDestination(dest) {
            const d = dest || '';
            if (d !== '' && /[\s<\u0000-\u001f\u007f]/.test(d)) {
                return '<' + d.replace(/([<>\\])/g, '\\$1').replace(/\r\n|\r|\n/g, '%0A') + '>';
            }
            return d.replace(/([()])/g, '\\$1');
        }
        /**
         * A paragraph's rendered inline text with a leading block marker
         * escaped on EVERY line — the first one and the one after each soft
         * or hard break. Lives in the paragraph renderer, not in
         * `escapeText`: only a line start can open a block.
         */
        function escapeParagraphLines(s) {
            return s.split('\n').map(escapeLineStart).join('\n');
        }
        /**
         * A table cell's rendered inline text with every `|` escaped as `\|`
         * — the single owner of pipe escaping (the inline renderer leaves
         * pipes alone). No backslash is doubled: the table splitter turns
         * each `\|` back into `|` before the inline parse, so the escapes
         * the inline renderer already produced survive intact.
         */
        function escapeTableCell(s) {
            return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        }
        function renderInlines(node, inTable) {
            let out = '';
            let child = node.firstChild;
            while (child) { out += renderInline(child, inTable); child = child.next; }
            return out;
        }
        function renderInline(node, inTable) {
            switch (node.type) {
                case 'text': {
                    return escapeText(node.literal || '');
                }
                case 'softbreak':  return inTable ? ' ' : '\n';
                case 'linebreak':  return inTable ? ' ' : '\\\n';
                case 'code': {
                    const lit = node.literal || '';
                    const runs = lit.match(/`+/g) || [];
                    let n = 1;
                    for (const r of runs) if (r.length >= n) n = r.length + 1;
                    const fence = '`'.repeat(n);
                    const pad = (lit.startsWith('`') || lit.endsWith('`') || /^\s|\s$/.test(lit)) ? ' ' : '';
                    return fence + pad + lit + pad + fence;
                }
                case 'emph':          return '*' + renderInlines(node, inTable) + '*';
                case 'strong':        return '**' + renderInlines(node, inTable) + '**';
                case 'strikethrough': {
                    // Own `delimiterCount === 1` (parsed `~x~`) keeps one tilde; any other
                    // value, or none (hand-built nodes), emits the canonical `~~`.
                    const run = (Object.prototype.hasOwnProperty.call(node, 'delimiterCount') && node.delimiterCount === 1) ? '~' : '~~';
                    return run + renderInlines(node, inTable) + run;
                }
                case 'link': {
                    const inner = renderInlines(node, inTable);
                    const url = renderDestination(node.destination);
                    const title = node.title ? ' "' + (node.title || '').replace(/"/g, '\\"') + '"' : '';
                    return '[' + inner + '](' + url + title + ')';
                }
                case 'image': {
                    const inner = renderInlines(node, inTable);
                    const url = renderDestination(node.destination);
                    const title = node.title ? ' "' + (node.title || '').replace(/"/g, '\\"') + '"' : '';
                    return '![' + inner + '](' + url + title + ')';
                }
                case 'subscript':   return '~'  + renderInlines(node, inTable) + '~';
                case 'superscript': return '^'  + renderInlines(node, inTable) + '^';
                case 'highlight':   return '==' + renderInlines(node, inTable) + '==';
                case 'html_inline': return node.literal || '';
                default: return '';
            }
        }
        function indent(s, prefix) {
            if (!s) return '';
            return s.split('\n').map((l, i) => (i === 0 ? l : (l.length ? prefix + l : prefix.replace(/\s+$/, '')))).join('\n');
        }
        function renderBlock(node, ctx) {
            switch (node.type) {
                case 'document': {
                    let out = '';
                    let child = node.firstChild;
                    while (child) {
                        out += renderBlock(child, ctx);
                        if (child.next) out += '\n';
                        child = child.next;
                    }
                    return out;
                }
                case 'heading':  return '#'.repeat(node.level) + ' ' + renderInlines(node, false) + '\n';
                case 'paragraph':return escapeParagraphLines(renderInlines(node, false)) + '\n';
                case 'thematic_break': return '---\n';
                case 'code_block': {
                    const info = node.info || '';
                    const literal = (node.literal || '').replace(/\n$/, '');
                    const runs = literal.match(/^`{3,}|\n`{3,}/g) || [];
                    let n = 3;
                    for (const r of runs) {
                        const len = r.replace(/\n/, '').length;
                        if (len >= n) n = len + 1;
                    }
                    const fence = '`'.repeat(n);
                    return fence + info + '\n' + literal + (literal ? '\n' : '') + fence + '\n';
                }
                case 'html_block': return (node.literal || '') + '\n';
                case 'block_quote': {
                    let inner = '';
                    let child = node.firstChild;
                    while (child) {
                        inner += renderBlock(child, ctx);
                        if (child.next) inner += '\n';
                        child = child.next;
                    }
                    return inner.split('\n').map(l => l.length ? '> ' + l : '>').join('\n').replace(/>\n$/, '\n');
                }
                case 'list': {
                    const tight = node.listTight !== false;
                    let out = '';
                    let item = node.firstChild;
                    let idx = 0;
                    while (item) {
                        const marker = node.listType === 'ordered'
                            ? ((node.listStart || 1) + idx) + (node.listDelimiter || '.') + ' '
                            : (node.listBulletChar || '-') + ' ';
                        const itemBody = renderItemContents(item, tight);
                        const prefix = ' '.repeat(marker.length);
                        let taskPrefix = '';
                        if (item.checked === true) taskPrefix = '[x] ';
                        else if (item.checked === false) taskPrefix = '[ ] ';
                        out += marker + taskPrefix + indent(itemBody, prefix).replace(/\n$/, '') + '\n';
                        if (!tight && item.next) out += '\n';
                        idx++;
                        item = item.next;
                    }
                    return out;
                }
                case 'table': return renderTable(node);
                default: return '';
            }
        }
        function renderItemContents(item, tight) {
            let out = '';
            let child = item.firstChild;
            while (child) {
                out += renderBlock(child, {});
                if (child.next) out += tight ? '' : '\n';
                child = child.next;
            }
            return out;
        }
        function renderTable(table) {
            const aligns = table.align || [];
            const rows = [];
            let row = table.firstChild;
            while (row) {
                const cells = [];
                let cell = row.firstChild;
                while (cell) {
                    cells.push(escapeTableCell(renderInlines(cell, true)));
                    cell = cell.next;
                }
                rows.push({ cells, isHeader: row.isHeader });
                row = row.next;
            }
            if (rows.length === 0) return '';
            const header = rows[0];
            let out = '| ' + header.cells.join(' | ') + ' |\n';
            const delims = aligns.map(a => {
                if (a === 'left') return ':---';
                if (a === 'right') return '---:';
                if (a === 'center') return ':---:';
                return '---';
            });
            while (delims.length < header.cells.length) delims.push('---');
            out += '| ' + delims.join(' | ') + ' |\n';
            for (let i = 1; i < rows.length; i++) {
                out += '| ' + rows[i].cells.join(' | ') + ' |\n';
            }
            return out;
        }
        function renderMarkdown(root, opts) {
            if (!root || typeof root !== 'object' || !root.type) {
                const gotType = root === null ? 'null' : (typeof root);
                throw new RenderError('md/render-invalid-root',
                    'renderMarkdown: invalid AST root (expected document node, got ' + gotType + ')',
                    { context: { gotType } });
            }
            const ctx = Object.assign({}, opts || {});
            return renderBlock(root, ctx);
        }
        return { renderMarkdown };
    }
};
