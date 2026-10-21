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
        // Containers are rendered with an explicit stack, never by
        // recursion: a document nested tens of thousands of levels deep
        // (the size limits lifted) must not exhaust the call stack.
        const INLINE_CONTAINERS = new Set([
            'emph', 'strong', 'strikethrough', 'link', 'image',
            'subscript', 'superscript', 'highlight'
        ]);
        const BLOCK_CONTAINERS = new Set(['document', 'block_quote', 'list']);
        /** The inline children of `node`, rendered and concatenated. */
        function renderInlines(node, inTable) {
            const stack = [{ node, out: '', child: node.firstChild }];
            for (;;) {
                const top = stack[stack.length - 1];
                const child = top.child;
                if (child) {
                    top.child = child.next;
                    if (INLINE_CONTAINERS.has(child.type)) stack.push({ node: child, out: '', child: child.firstChild });
                    else top.out += renderInlineLeaf(child, inTable);
                    continue;
                }
                stack.pop();
                if (stack.length === 0) return top.out;
                stack[stack.length - 1].out += wrapInline(top.node, top.out);
            }
        }
        function renderInlineLeaf(node, inTable) {
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
                case 'html_inline': return node.literal || '';
                default: return '';
            }
        }
        /** An inline container around its already rendered children. */
        function wrapInline(node, inner) {
            switch (node.type) {
                case 'emph':          return '*' + inner + '*';
                case 'strong':        return '**' + inner + '**';
                case 'strikethrough': {
                    // Own `delimiterCount === 1` (parsed `~x~`) keeps one tilde; any other
                    // value, or none (hand-built nodes), emits the canonical `~~`.
                    const run = (Object.prototype.hasOwnProperty.call(node, 'delimiterCount') && node.delimiterCount === 1) ? '~' : '~~';
                    return run + inner + run;
                }
                case 'link': {
                    const url = renderDestination(node.destination);
                    const title = node.title ? ' "' + (node.title || '').replace(/"/g, '\\"') + '"' : '';
                    return '[' + inner + '](' + url + title + ')';
                }
                case 'image': {
                    const url = renderDestination(node.destination);
                    const title = node.title ? ' "' + (node.title || '').replace(/"/g, '\\"') + '"' : '';
                    return '![' + inner + '](' + url + title + ')';
                }
                case 'subscript':   return '~'  + inner + '~';
                case 'superscript': return '^'  + inner + '^';
                default:            return '==' + inner + '==';   // highlight
            }
        }
        function indent(s, prefix) {
            if (!s) return '';
            return s.split('\n').map((l, i) => (i === 0 ? l : (l.length ? prefix + l : prefix.replace(/\s+$/, '')))).join('\n');
        }
        /**
         * `node` and its descendants as Markdown. A `document`,
         * `block_quote` or `list` frame collects its children's text in
         * `parts`; every child of a list is an item frame, whatever its
         * type, whose children are blocks again.
         */
        function renderBlock(node) {
            if (!BLOCK_CONTAINERS.has(node.type)) return renderLeafBlock(node);
            const stack = [{ node, item: false, tight: true, parts: [], child: node.firstChild }];
            for (;;) {
                const top = stack[stack.length - 1];
                const child = top.child;
                if (child) {
                    top.child = child.next;
                    if (!top.item && top.node.type === 'list') {
                        stack.push({ node: child, item: true, tight: top.node.listTight !== false, parts: [], child: child.firstChild });
                    } else if (BLOCK_CONTAINERS.has(child.type)) {
                        stack.push({ node: child, item: false, tight: true, parts: [], child: child.firstChild });
                    } else {
                        top.parts.push(renderLeafBlock(child));
                    }
                    continue;
                }
                stack.pop();
                const out = finishBlock(top);
                if (stack.length === 0) return out;
                stack[stack.length - 1].parts.push(out);
            }
        }
        function finishBlock(frame) {
            const node = frame.node;
            if (frame.item) return frame.parts.join(frame.tight ? '' : '\n');
            switch (node.type) {
                case 'document': return frame.parts.join('\n');
                case 'block_quote': {
                    // Every inner block ends with a newline: drop that last
                    // (empty) line rather than emit it as a bare `>`.
                    return frame.parts.join('\n').replace(/\n$/, '').split('\n')
                        .map(l => l.length ? '> ' + l : '>').join('\n') + '\n';
                }
                default: {   // list
                    const tight = node.listTight !== false;
                    let out = '';
                    let item = node.firstChild;
                    let idx = 0;
                    while (item) {
                        const marker = node.listType === 'ordered'
                            ? ((node.listStart || 1) + idx) + (node.listDelimiter || '.') + ' '
                            : (node.listBulletChar || '-') + ' ';
                        const itemBody = frame.parts[idx];
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
            }
        }
        function renderLeafBlock(node) {
            switch (node.type) {
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
                case 'table': return renderTable(node);
                default: return '';
            }
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
        // No render option is read today; the parameter keeps the signature.
        function renderMarkdown(root, _opts) {
            if (!root || typeof root !== 'object' || !root.type) {
                const gotType = root === null ? 'null' : (typeof root);
                throw new RenderError('md/render-invalid-root',
                    'renderMarkdown: invalid AST root (expected document node, got ' + gotType + ')',
                    { context: { gotType } });
            }
            return renderBlock(root);
        }
        return { renderMarkdown };
    }
};
