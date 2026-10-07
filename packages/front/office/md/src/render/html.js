// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview HTML renderer — strict factory-only.
 *
 * Walks the AST and emits an HTML string matching `cmark`'s reference output.
 * Security model :
 *   - `safe` is ON by default: raw HTML from the Markdown source is
 *     stripped and `javascript:` / `vbscript:` / `file:` / `data:` URLs
 *     are neutralised. `safe: false` restores the CommonMark raw
 *     passthrough (spec-exact output).
 *   - `allowDataImage: true` (under `safe`) re-permits `data:image/*`.
 *   - Trusted extension nodes: an `html_block` / `html_inline` node an
 *     extra BUILDS itself (admonitions, footnotes, highlight, math,
 *     subsuper) carries the internal own-property `_mdTrustedHtml = true`,
 *     set at construction. `safe` strips only the raw HTML that came from
 *     the source, never those nodes. The flag is not a public option and
 *     is built with `mdNode.trustedHtmlInline` / `trustedHtmlBlock`; the
 *     parser never sets the flag, so Markdown text cannot forge it.
 *
 * @module md/render/html
 */

import { mdErrors } from '../errors.js';

export const renderHtmlMod = {
    name: 'renderHtmlMod',
    dependencies: ['mdErrors'],
    deps: [mdErrors],
    factory(errors) {
        const { RenderError } = errors;

        // --- AST traversal (local Walker) ---
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

        // --- HTML / URL escapers (mirrors common.js) ---
        const RE_XML_SPECIAL = /[&<>"]/g;
        function replaceUnsafeChar(s) {
            switch (s) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                default:  return s;
            }
        }
        function escapeHtml(s) {
            if (RE_XML_SPECIAL.test(s)) return s.replace(RE_XML_SPECIAL, replaceUnsafeChar);
            return s;
        }
        const UNRESERVED_URL = new Set();
        for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&'()*+,;=") {
            UNRESERVED_URL.add(c.charCodeAt(0));
        }
        function isHex(c) {
            return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
        }
        const _urlEncoder = new TextEncoder();
        function encodeUrl(url) {
            let out = '';
            for (let i = 0; i < url.length; i++) {
                const c = url.charCodeAt(i);
                if (c === 0x25
                    && i + 2 < url.length
                    && isHex(url.charCodeAt(i + 1))
                    && isHex(url.charCodeAt(i + 2))) {
                    out += url.substr(i, 3);
                    i += 2;
                    continue;
                }
                if (c < 0x80) {
                    if (UNRESERVED_URL.has(c)) out += url[i];
                    else out += '%' + c.toString(16).toUpperCase().padStart(2, '0');
                } else {
                    const bytes = _urlEncoder.encode(url[i]);
                    for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
                }
            }
            return escapeHtml(out);
        }

        const RE_SAFE_DATA_IMAGE = /^\s*data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico|avif|apng)[;,]/i;
        const RE_DANGEROUS_SCHEME = /^\s*(javascript|vbscript|file|data):/i;
        const DISALLOWED_RAW_HTML =
            /<(\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:\s|>|\/>|$))/gi;
        function filterDisallowedRawHtml(s) {
            return s.replace(DISALLOWED_RAW_HTML, '&lt;$1');
        }

        function renderHtml(root, opts) {
            if (!root || typeof root !== 'object' || !root.type) {
                const gotType = root === null ? 'null' : (typeof root);
                throw new RenderError('md/render-invalid-root',
                    'renderHtml: invalid AST root (expected document node, got ' + gotType + ')',
                    { context: { gotType } });
            }
            const safe = !(opts && opts.safe === false);
            const allowDataImage = !!(opts && opts.allowDataImage);
            const softbreak = (opts && opts.softbreak) || '\n';
            const disallowedRawHtml = !(opts && opts.disallowedRawHtml === false);
            const filterHtml = disallowedRawHtml ? filterDisallowedRawHtml : (s => s);
            const buf = [];
            const w = new WalkerLocal(root);
            let event, node, entering;
            let lastOut = '\n';
            let disableTags = 0;

            function lit(s) {
                buf.push(s);
                if (s.length > 0) lastOut = s.charAt(s.length - 1);
            }
            function out(s) {
                if (disableTags > 0) lit(s.replace(/<[^>]*>/g, ''));
                else lit(s);
            }
            function tag(s) { if (disableTags > 0) return; lit(s); }
            function cr() { if (lastOut !== '\n') lit('\n'); }
            function isDangerousUrl(url) {
                if (!RE_DANGEROUS_SCHEME.test(url)) return false;
                if (allowDataImage && RE_SAFE_DATA_IMAGE.test(url)) return false;
                return true;
            }

            while ((event = w.next()) !== null) {
                node = event.node;
                entering = event.entering;
                switch (node.type) {
                    case 'document': break;
                    case 'paragraph': {
                        const grandparent = node.parent && node.parent.parent;
                        const inTightList = grandparent
                            && grandparent.type === 'list'
                            && grandparent.listTight === true;
                        if (!inTightList) {
                            if (entering) { cr(); out('<p>'); }
                            else          { out('</p>'); cr(); }
                        }
                        break;
                    }
                    case 'heading': {
                        const t = 'h' + node.level;
                        if (entering) { cr(); out('<' + t + '>'); }
                        else          { out('</' + t + '>'); cr(); }
                        break;
                    }
                    case 'thematic_break':
                        cr(); out('<hr />'); cr();
                        break;
                    case 'block_quote':
                        if (entering) { cr(); out('<blockquote>'); cr(); }
                        else          { cr(); out('</blockquote>'); cr(); }
                        break;
                    case 'list': {
                        const t = node.listType === 'ordered' ? 'ol' : 'ul';
                        if (entering) {
                            cr();
                            out('<' + t);
                            if (node.listType === 'ordered'
                                && typeof node.listStart === 'number'
                                && node.listStart !== 1) {
                                out(' start="' + node.listStart + '"');
                            }
                            out('>');
                            cr();
                        } else {
                            cr(); out('</' + t + '>'); cr();
                        }
                        break;
                    }
                    case 'item':
                        if (entering) {
                            out('<li>');
                            if (node.checked === true) out('<input checked="" disabled="" type="checkbox"> ');
                            else if (node.checked === false) out('<input disabled="" type="checkbox"> ');
                        } else {
                            out('</li>'); cr();
                        }
                        break;
                    case 'code_block': {
                        let info = node.info;
                        let attr = '';
                        if (info) {
                            const lang = info.split(/\s+/)[0];
                            if (lang) attr = ' class="language-' + escapeHtml(lang) + '"';
                        }
                        cr();
                        out('<pre><code' + attr + '>');
                        out(escapeHtml(node.literal || ''));
                        out('</code></pre>');
                        cr();
                        break;
                    }
                    case 'html_block':
                        cr();
                        out(safe && !node._mdTrustedHtml ? '' : filterHtml(node.literal || ''));
                        cr();
                        break;
                    case 'text':
                        out(escapeHtml(node.literal || ''));
                        break;
                    case 'code':
                        tag('<code>'); out(escapeHtml(node.literal || '')); tag('</code>');
                        break;
                    case 'softbreak':
                        lit(softbreak);
                        break;
                    case 'linebreak':
                        tag('<br />'); cr();
                        break;
                    case 'emph':
                        tag(entering ? '<em>' : '</em>'); break;
                    case 'strong':
                        tag(entering ? '<strong>' : '</strong>'); break;
                    case 'strikethrough':
                        tag(entering ? '<del>' : '</del>'); break;
                    case 'link':
                        if (entering) {
                            const url = node.destination || '';
                            if (safe && isDangerousUrl(url)) {
                                tag('<a href="">');
                            } else {
                                let s = '<a href="' + encodeUrl(url) + '"';
                                if (node.title) s += ' title="' + escapeHtml(node.title) + '"';
                                s += '>';
                                tag(s);
                            }
                        } else {
                            tag('</a>');
                        }
                        break;
                    case 'image':
                        if (entering) {
                            if (disableTags === 0) {
                                const url = node.destination || '';
                                const safeUrl = (safe && isDangerousUrl(url)) ? '' : encodeUrl(url);
                                lit('<img src="' + safeUrl + '" alt="');
                            }
                            disableTags++;
                        } else {
                            disableTags--;
                            if (disableTags === 0) {
                                lit('"');
                                if (node.title) lit(' title="' + escapeHtml(node.title) + '"');
                                lit(' />');
                            }
                        }
                        break;
                    case 'html_inline':
                        tag(safe && !node._mdTrustedHtml ? '' : filterHtml(node.literal || ''));
                        break;
                    case 'table':
                        if (entering) { cr(); out('<table>'); cr(); }
                        else {
                            if (node.firstChild && node.firstChild.next) {
                                out('</tbody>'); cr();
                            }
                            cr(); out('</table>'); cr();
                        }
                        break;
                    case 'table_row':
                        if (entering) {
                            cr();
                            if (node.isHeader) { out('<thead>'); cr(); }
                            else if (!node.prev || node.prev.isHeader) {
                                out('<tbody>'); cr();
                            }
                            out('<tr>'); cr();
                        } else {
                            cr(); out('</tr>'); cr();
                            if (node.isHeader) { out('</thead>'); cr(); }
                        }
                        break;
                    case 'table_cell': {
                        const t = node.isHeader ? 'th' : 'td';
                        if (entering) {
                            let attr = '';
                            if (node.cellAlign) attr = ' align="' + node.cellAlign + '"';
                            out('<' + t + attr + '>');
                        } else {
                            out('</' + t + '>'); cr();
                        }
                        break;
                    }
                    default: break;
                }
            }
            return buf.join('');
        }
        return { renderHtml, escapeHtml, encodeUrl };
    }
};
