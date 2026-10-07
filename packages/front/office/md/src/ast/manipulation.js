// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AST manipulation helpers — md-specific.
 *
 * Md-specific helpers preserved here :
 *
 * - `cloneNode` — preserves the md `Node` prototype and the explicit
 *   CommonMark scalar slot list.
 * - `wrapNode` — accepts a wrapper **instance** (md API), not a
 *   wrapper-factory function (fw API).
 * - `replaceNode` / `flattenNode` / `findFirst` / `findAll` — md-flavored
 *   helpers that throw md's `ContractError` (instead of fw's generic
 *   named-Error), keep the md error-code prefix (`md/...`), and rely on
 *   the local CommonMark `Walker` semantics for tree traversal.
 *
 * Note : these helpers do **not** delegate to `@awacloud/fw/io/structures/tree-walker.js`.
 * They operate directly on the md `Node` linked-tree shape (parent / firstChild /
 * lastChild / prev / next + insertBefore / unlink / appendChild), which has the
 * same shape as fw's tree-walker contract but preserves CommonMark event-order
 * semantics. Use `treeWalker` (fw) for generic, framework-agnostic traversal.
 *
 * Strict factory-only : the canonical helpers live inside the
 * `mdAstManipulation` descriptor's `factory()` body. No top-level
 * materialisation — the canonical instance is produced by `main.js`
 * (sole bootstrap site) and seeded into the package-level `ModuleRuntime`.
 *
 * @module md/ast/manipulation
 */

/** Factory binding.
 *
 *  Strict factory-only. The factory body captures none of the top-level
 *  descriptor imports (they feed the generated `deps:` field). The factory
 *  re-declares the helpers locally and sources `ContractError` and
 *  `Node` from its injected `mdErrors` and `mdNode` dependencies. Must
 *  be invoked with its deps (either via DI through the `ModuleRuntime`,
 *  or explicitly by passing the resolved `mdErrors` and `mdNode` APIs).
 */
import { mdErrors } from '../errors.js';
import { mdNode } from './node.js';

export const mdAstManipulation = {
    name: 'mdAstManipulation',
    dependencies: ['mdErrors', 'mdNode'],
    deps: [mdErrors, mdNode],
    factory(errors, mdNodeAPI) {
        const { ContractError } = errors;
        const { Node: NodeCtor } = mdNodeAPI;

        function replaceNode(oldNode, newNode) {
            if (!oldNode || !newNode) throw new TypeError('replaceNode: both args required');
            if (!oldNode.parent) throw new ContractError('md/replace-node-no-parent', 'replaceNode: oldNode has no parent');
            oldNode.insertBefore(newNode);
            oldNode.unlink();
            return newNode;
        }
        function wrapNode(node, wrapper) {
            if (!node || !wrapper) throw new TypeError('wrapNode: both args required');
            if (!node.parent) throw new ContractError('md/wrap-node-no-parent', 'wrapNode: node has no parent');
            node.insertBefore(wrapper);
            node.unlink();
            wrapper.appendChild(node);
            return wrapper;
        }
        function flattenNode(node) {
            if (!node || !node.parent) throw new ContractError('md/flatten-node-no-parent', 'flattenNode: node must have a parent');
            let cursor = node.firstChild;
            let lastInserted = node;
            while (cursor) {
                const next = cursor.next;
                cursor.unlink();
                lastInserted.insertAfter(cursor);
                lastInserted = cursor;
                cursor = next;
            }
            node.unlink();
        }
        function findFirst(root, predicate) {
            const w = root.walker();
            let ev;
            while ((ev = w.next())) {
                if (ev.entering && predicate(ev.node)) return ev.node;
            }
            return null;
        }
        function findAll(root, predicate) {
            const out = [];
            const w = root.walker();
            let ev;
            while ((ev = w.next())) {
                if (ev.entering && predicate(ev.node)) out.push(ev.node);
            }
            return out;
        }
        const SCALAR_KEYS = [
            'literal', 'level', 'info', 'isFenced', 'fenceChar', 'fenceLength',
            'fenceOffset', 'htmlBlockType', 'destination', 'title',
            'listType', 'listStart', 'listTight', 'listDelimiter',
            'listBulletChar', 'listPadding', 'listMarkerOffset',
            'checked', 'align', 'cellAlign', 'isHeader', 'delimiterCount'
        ];
        function cloneNode(node, deep) {
            if (!node) throw new TypeError('cloneNode: node required');
            const copy = new NodeCtor(node.type, node.sourcepos ? [
                node.sourcepos[0].slice(),
                node.sourcepos[1].slice()
            ] : null);
            for (const k of SCALAR_KEYS) copy[k] = node[k];
            copy.data = node.data ? Object.assign({}, node.data) : null;
            if (deep) {
                let c = node.firstChild;
                while (c) {
                    copy.appendChild(cloneNode(c, true));
                    c = c.next;
                }
            }
            return copy;
        }
        return {
            replaceNode, wrapNode, flattenNode, findFirst, findAll, cloneNode,
            ContractError
        };
    }
};

export default mdAstManipulation;
