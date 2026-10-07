// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AST → CommonMark XML renderer (strict factory-only).
 *
 * @module md/render/xml
 */

import { mdErrors } from '../errors.js';

export const renderXmlMod = {
    name: 'renderXmlMod',
    dependencies: ['mdErrors'],
    deps: [mdErrors],
    factory(errors) {
        const { RenderError } = errors;
        const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        const RE_XML = /[&<>"]/g;
        function esc(s) { return String(s).replace(RE_XML, c => XML_ESCAPES[c]); }

        const LEAF_TYPES = new Set([
            'thematic_break', 'text', 'softbreak', 'linebreak',
            'code', 'html_inline', 'code_block', 'html_block'
        ]);

        const BLOCK_CONTAINERS = new Set([
            'document', 'block_quote', 'list', 'item',
            'table', 'table_row', 'admonition', 'footnote_def'
        ]);
        const INLINE_CONTAINERS = new Set([
            'paragraph', 'heading', 'emph', 'strong', 'link', 'image',
            'strikethrough', 'table_cell',
            'highlight', 'subscript', 'superscript'
        ]);
        function isContainerType(type) {
            return BLOCK_CONTAINERS.has(type) || INLINE_CONTAINERS.has(type);
        }

        class WalkerLocal {
            constructor(root) { this.current = root; this.root = root; this.entering = true; }
            next() {
                const cur = this.current;
                if (cur === null) return null;
                const entering = this.entering;
                const container = isContainerType(cur.type);
                if (entering && container) {
                    if (cur.firstChild) { this.current = cur.firstChild; this.entering = true; }
                    else { this.entering = false; }
                } else if (cur === this.root) {
                    this.current = null;
                } else if (cur.next === null) {
                    this.current = cur.parent; this.entering = false;
                } else {
                    this.current = cur.next; this.entering = true;
                }
                return { entering, node: cur };
            }
        }

        function attrsFor(node) {
            const a = [];
            switch (node.type) {
                case 'heading':
                    if (node.level) a.push(['level', node.level]); break;
                case 'list':
                    if (node.listType) a.push(['type', node.listType]);
                    if (node.listType === 'ordered') {
                        if (node.listStart != null) a.push(['start', node.listStart]);
                        if (node.listDelimiter) a.push(['delim', node.listDelimiter === ')' ? 'paren' : 'period']);
                    } else if (node.listBulletChar) {
                        a.push(['bullet_char', node.listBulletChar]);
                    }
                    a.push(['tight', node.listTight ? 'true' : 'false']);
                    break;
                case 'code_block':
                    if (node.info) a.push(['info', node.info]); break;
                case 'html_block':
                    if (node.htmlBlockType != null) a.push(['type', node.htmlBlockType]); break;
                case 'link':
                case 'image':
                    if (node.destination != null) a.push(['destination', node.destination]);
                    if (node.title) a.push(['title', node.title]);
                    break;
                case 'table_cell':
                    if (node.cellAlign) a.push(['align', node.cellAlign]);
                    if (node.isHeader) a.push(['header', 'true']);
                    break;
            }
            if (node.sourcepos) {
                const sp = node.sourcepos;
                a.push(['sourcepos', sp[0][0] + ':' + sp[0][1] + '-' + sp[1][0] + ':' + sp[1][1]]);
            }
            return a;
        }
        function attrStr(attrs) {
            return attrs.map(([k, v]) => ' ' + k + '="' + esc(v) + '"').join('');
        }

        function renderXml(root, opts) {
            if (!root || typeof root !== 'object' || !root.type) {
                const gotType = root === null ? 'null' : (typeof root);
                throw new RenderError('md/render-invalid-root',
                    'renderXml: invalid AST root (expected document node, got ' + gotType + ')',
                    { context: { gotType } });
            }
            const step = (opts && Number.isInteger(opts.indent)) ? opts.indent : 2;
            const buf = ['<?xml version="1.0" encoding="UTF-8"?>\n',
                         '<!DOCTYPE document SYSTEM "CommonMark.dtd">\n'];
            let depth = 0;
            const w = new WalkerLocal(root);
            let event;
            while ((event = w.next()) !== null) {
                const { node, entering } = event;
                const pad = ' '.repeat(depth * step);
                const isLeaf = LEAF_TYPES.has(node.type);
                if (entering) {
                    buf.push(pad);
                    buf.push('<' + node.type);
                    if (node.type === 'document') buf.push(' xmlns="http://commonmark.org/xml/1.0"');
                    buf.push(attrStr(attrsFor(node)));
                    if (isLeaf) {
                        if (node.literal) {
                            buf.push('>' + esc(node.literal) + '</' + node.type + '>\n');
                        } else {
                            buf.push(' />\n');
                        }
                    } else {
                        buf.push('>\n');
                        depth++;
                    }
                } else if (!isLeaf) {
                    depth--;
                    buf.push(' '.repeat(depth * step));
                    buf.push('</' + node.type + '>\n');
                }
            }
            return buf.join('');
        }
        return { renderXml };
    }
};
