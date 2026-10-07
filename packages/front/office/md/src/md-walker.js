// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Visitor-style tree walker for the Markdown AST (strict factory-only).
 *
 * @module md/md-walker
 */

import { mdNode } from './ast/node.js';

export const mdWalker = {
    name: 'mdWalker',
    dependencies: ['mdNode'],
    deps: [mdNode],
    factory(_mdNodeAPI) {
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
            resumeAt(node, entering) {
                this.current = node;
                this.entering = entering === true;
            }
        }

        function walk(root, visitors) {
            if (!root) return;
            visitors = visitors || {};
            const wildcard = visitors['*'];
            const w = new WalkerLocal(root);
            let stopped = false;
            const skipSet = new Set();
            let depth = 0;
            let ev;
            while ((ev = w.next()) !== null) {
                if (stopped) break;
                const node = ev.node;
                const entering = ev.entering;
                const isCont = isContainerType(node.type);
                const handler = visitors[node.type];
                const ctx = {
                    depth,
                    parent: node.parent,
                    stop() { stopped = true; },
                    skipChildren() { skipSet.add(node); }
                };
                if (entering) {
                    if (wildcard && typeof wildcard.enter === 'function') wildcard.enter(node, ctx);
                    if (handler && typeof handler.enter === 'function') handler.enter(node, ctx);
                    if (skipSet.has(node) && isCont) {
                        w.resumeAt(node, false);
                        skipSet.delete(node);
                        continue;
                    }
                    if (isCont) depth++;
                } else {
                    if (isCont) depth--;
                    if (handler && typeof handler.exit === 'function') handler.exit(node, ctx);
                    if (wildcard && typeof wildcard.exit === 'function') wildcard.exit(node, ctx);
                }
            }
        }

        function createWalker() {
            const _exts = [];
            function use(...extensions) {
                for (const ext of extensions) {
                    if (ext && !_exts.includes(ext)) _exts.push(ext);
                }
            }
            function run(root, extraVisitors) {
                const merged = {};
                function mergeInto(target, src) {
                    if (!src) return;
                    for (const k of Object.keys(src)) {
                        if (!target[k]) target[k] = {};
                        if (src[k].enter) {
                            const prev = target[k].enter;
                            target[k].enter = prev
                                ? function(n, ctx) { prev(n, ctx); src[k].enter(n, ctx); }
                                : src[k].enter;
                        }
                        if (src[k].exit) {
                            const prev = target[k].exit;
                            target[k].exit = prev
                                ? function(n, ctx) { src[k].exit(n, ctx); prev(n, ctx); }
                                : src[k].exit;
                        }
                    }
                }
                for (const ext of _exts) mergeInto(merged, ext.visitors);
                mergeInto(merged, extraVisitors);
                walk(root, merged);
            }
            return {
                use,
                walk: run,
                get extensions() { return _exts.slice(); },
                get hasExtensions() { return _exts.length > 0; }
            };
        }
        return { createWalker, walk };
    }
};
