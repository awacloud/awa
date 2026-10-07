// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AST `Node` class — the core data structure manipulated
 * by the block parser, inline parser, and renderers.
 *
 * Mirrors the CommonMark `Node` shape (firstChild / lastChild / prev /
 * next / parent linked-list of children) for compatibility, but uses
 * public fields rather than mangled `_name` slots.
 *
 * Strict factory-only : the canonical `Node` / `Walker` classes live
 * inside the `mdNode` descriptor's `factory()` body. No top-level
 * materialisation — the canonical instance is produced by `main.js`
 * (sole bootstrap site) and seeded into the package-level `ModuleRuntime`.
 *
 * @module md/ast/node
 */

export const mdNode = {
    name: 'mdNode',
    dependencies: [],
    factory() {
        // Self-contained CommonMark container-type set (worker-safe).
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
        class Node {
            constructor(type, sourcepos) {
                this.type        = type;
                this.parent      = null;
                this.firstChild  = null;
                this.lastChild   = null;
                this.prev        = null;
                this.next        = null;
                this.sourcepos   = sourcepos || null;
                this.open        = true;
                this.stringContent = null;
                this.literal     = null;
                this.level       = null;
                this.info        = null;
                this.isFenced    = false;
                this.fenceChar   = null;
                this.fenceLength = 0;
                this.fenceOffset = 0;
                this.htmlBlockType = null;
                this.destination = null;
                this.title       = null;
                this.listType       = null;
                this.listStart      = null;
                this.listTight      = true;
                this.listDelimiter  = null;
                this.listBulletChar = null;
                this.listPadding    = 0;
                this.listMarkerOffset = 0;
                this.checked = null;
                this.align     = null;
                this.cellAlign = null;
                this.isHeader  = false;
                this.data = null;
            }
            get isContainer() { return isContainerType(this.type); }
            appendChild(child) {
                child.unlink();
                child.parent = this;
                if (this.lastChild) {
                    this.lastChild.next = child;
                    child.prev = this.lastChild;
                    this.lastChild = child;
                } else {
                    this.firstChild = child;
                    this.lastChild  = child;
                }
            }
            prependChild(child) {
                child.unlink();
                child.parent = this;
                if (this.firstChild) {
                    this.firstChild.prev = child;
                    child.next = this.firstChild;
                    this.firstChild = child;
                } else {
                    this.firstChild = child;
                    this.lastChild  = child;
                }
            }
            insertAfter(sibling) {
                sibling.unlink();
                sibling.next = this.next;
                if (sibling.next) sibling.next.prev = sibling;
                sibling.prev   = this;
                this.next      = sibling;
                sibling.parent = this.parent;
                if (!sibling.next && sibling.parent) sibling.parent.lastChild = sibling;
            }
            insertBefore(sibling) {
                sibling.unlink();
                sibling.prev = this.prev;
                if (sibling.prev) sibling.prev.next = sibling;
                sibling.next   = this;
                this.prev      = sibling;
                sibling.parent = this.parent;
                if (!sibling.prev && sibling.parent) sibling.parent.firstChild = sibling;
            }
            unlink() {
                if (this.prev) this.prev.next = this.next;
                else if (this.parent) this.parent.firstChild = this.next;
                if (this.next) this.next.prev = this.prev;
                else if (this.parent) this.parent.lastChild = this.prev;
                this.parent = null;
                this.next   = null;
                this.prev   = null;
            }
            walker() { return new Walker(this); }
        }
        class Walker {
            constructor(root) {
                this.current  = root;
                this.root     = root;
                this.entering = true;
            }
            next() {
                const cur = this.current;
                if (cur === null) return null;
                const entering = this.entering;
                const container = cur.isContainer;
                if (entering && container) {
                    if (cur.firstChild) {
                        this.current  = cur.firstChild;
                        this.entering = true;
                    } else {
                        this.entering = false;
                    }
                } else if (cur === this.root) {
                    this.current = null;
                } else if (cur.next === null) {
                    this.current  = cur.parent;
                    this.entering = false;
                } else {
                    this.current  = cur.next;
                    this.entering = true;
                }
                return { entering, node: cur };
            }
            resumeAt(node, entering) {
                this.current  = node;
                this.entering = entering === true;
            }
        }
        function makeNode(type, sourcepos) { return new Node(type, sourcepos); }
        /**
         * Build an `html_inline` node an extension authors itself. It carries
         * the internal trust marker `render/html.js` honours under the `safe`
         * default; the parser never sets it, so Markdown text cannot forge it.
         * @param {*} literal  HTML text (coerced with `String()`); the caller escapes any untrusted part
         * @returns {Node}
         */
        function trustedHtmlInline(literal) {
            const n = new Node('html_inline'); n.literal = String(literal); n._mdTrustedHtml = true; return n;
        }
        /**
         * Build an `html_block` node (`htmlBlockType` 6) an extension authors
         * itself; kept by `render/html.js` under `safe` (see `trustedHtmlInline`).
         * @param {*} literal  HTML text (coerced with `String()`); the caller escapes any untrusted part
         * @returns {Node}
         */
        function trustedHtmlBlock(literal) {
            const n = new Node('html_block'); n.literal = String(literal); n.htmlBlockType = 6; n._mdTrustedHtml = true; return n;
        }
        return { Node, Walker, makeNode, trustedHtmlInline, trustedHtmlBlock };
    }
};
