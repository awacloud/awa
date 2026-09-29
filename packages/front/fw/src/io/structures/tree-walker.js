// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Generic visitor pattern for linked-tree nodes. Compatible with any
 * tree where each node exposes { parent, firstChild, lastChild, prev,
 * next } (CommonMark AST convention, but also matches DOM Element
 * shape).
 *
 * Provides Walker iterator (entering / leaving events), iterable
 * adapter (for…of), and manipulation helpers (find, replace, wrap,
 * flatten, clone).
 *
 * @example
 * const tree = registry.resolve('treeWalker');
 * for (const { node, entering } of tree.walk(root)) {
 *     if (entering && node.type === 'heading') console.log(node.level);
 * }
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * A single traversal event produced by the walker.
 * @typedef {Object} TreeWalkEvent
 * @property {object} node - the node being visited
 * @property {boolean} entering - `true` on first visit, `false` once children are consumed
 */

/**
 * Stateful tree-walking iterator returned by `createWalker`.
 * @typedef {Object} TreeWalkerInstance
 * @property {object} current - the node the walker is positioned on (or `null` when exhausted)
 * @property {object} root - the root node the walker was created with
 * @property {boolean} entering - whether the next event is an entering event
 * @property {() => TreeWalkEvent|null} next - advance to the next event
 * @property {(node: object, entering: boolean) => void} resumeAt - resume from a specific position
 */

/**
 * Object returned by `treeWalker.factory()`.
 * @typedef {Object} TreeWalkerApi
 * @property {(root: object) => TreeWalkerInstance} createWalker - create a stateful walker iterator
 * @property {(root: object) => Generator<TreeWalkEvent>} walk - iterable adapter for `for…of`
 * @property {(root: object|null|undefined, visitor: (node: object, entering: boolean) => boolean|void, options?: { nodeTypes?: string[] }) => void} walkVisit - visitor-based DFS with subtree skipping and cycle guard
 * @property {(root: object, predicate: (node: object) => boolean) => object|null} findFirst - first node matching `predicate` (DFS pre-order)
 * @property {(root: object, predicate: (node: object) => boolean) => object[]} findAll - all nodes matching `predicate` (DFS pre-order)
 * @property {(oldNode: object, newNode: object) => object} replaceNode - replace a node in its parent's child list
 * @property {(node: object, wrapperFactory: (node: object) => object) => object} wrapNode - wrap a node in a wrapper produced by `wrapperFactory`
 * @property {(node: object) => void} flattenNode - replace a node with its direct children
 * @property {(node: object, deep?: boolean) => object} cloneNode - clone a node (deep by default)
 */

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const treeWalker = {
    name: 'treeWalker',
    version: '1.0.0',
    type: 'fw.io.structures',
    dependencies: [],
    /** @returns {TreeWalkerApi} */
    factory() {

        // -----------------------------------------------------------------------
        // Internal helpers
        // -----------------------------------------------------------------------

        /**
         * Build a ContractError (named Error, not a custom class - worker-safe).
         * @param {string} code
         * @param {string} msg
         * @returns {Error}
         */
        function contractError(code, msg) {
            const err = new Error(msg);
            err.name  = 'ContractError';
            // @ts-ignore - Error.code/context is a non-standard but widely-used extension
            err.code  = code;
            return err;
        }

        // -----------------------------------------------------------------------
        // Walker class (entering / leaving iterator)
        // -----------------------------------------------------------------------

        /**
         * Tree-walking iterator. Each `next()` call returns `{ node, entering }`
         * where `entering` is `true` the first time a container is visited and
         * `false` once all its children have been consumed.
         *
         * A node is considered a **container** when `node.firstChild` is not null.
         * Leaf nodes (firstChild === null) only emit `entering: true`.
         *
         * Compatible with any node shape that satisfies the minimal contract:
         * `{ parent, firstChild, next }`. `lastChild` and `prev` are used by the
         * manipulation helpers but are not required for plain traversal.
         */
        class TreeWalker {
            /**
             * @param {object} root - Root node of the tree to walk.
             */
            constructor(root) {
                this.current  = root;
                this.root     = root;
                this.entering = true;
            }

            /**
             * Advance to the next event.
             * @returns {{ node: object, entering: boolean }|null}
             */
            next() {
                const cur = this.current;
                if (cur === null) return null;

                const entering  = this.entering;
                const container = cur.firstChild != null;

                if (entering && container) {
                    this.current  = cur.firstChild;
                    this.entering = true;
                } else if (cur === this.root) {
                    this.current = null;
                } else if (cur.next == null) {
                    this.current  = cur.parent;
                    this.entering = false;
                } else {
                    this.current  = cur.next;
                    this.entering = true;
                }

                return { node: cur, entering };
            }

            /**
             * Resume walking from a specific position.
             * @param {object} node
             * @param {boolean} entering
             */
            resumeAt(node, entering) {
                this.current  = node;
                this.entering = entering === true;
            }
        }

        // -----------------------------------------------------------------------
        // Public API functions
        // -----------------------------------------------------------------------

        /**
         * Create a Walker iterator for the given root node.
         * @param {object} root
         * @returns {TreeWalker}
         */
        function createWalker(root) {
            if (root == null) throw new TypeError('createWalker: root node required');
            return new TreeWalker(root);
        }

        /**
         * Iterable adapter - yields `{ node, entering }` events for use in
         * `for…of` loops or spread expressions.
         *
         * @param {object} root
         * @returns {Generator<{ node: object, entering: boolean }>}
         */
        function* walk(root) {
            if (root == null) throw new TypeError('walk: root node required');
            const w = new TreeWalker(root);
            let ev;
            while ((ev = w.next()) !== null) yield ev;
        }

        /**
         * Depth-first (DFS pre-order) search - returns the first node for which
         * `predicate` returns true, or `null` if none match.
         *
         * @param {object} root
         * @param {(node: object) => boolean} predicate
         * @returns {object|null}
         */
        function findFirst(root, predicate) {
            if (root == null) throw new TypeError('findFirst: root node required');
            if (typeof predicate !== 'function') throw new TypeError('findFirst: predicate must be a function');
            const w = new TreeWalker(root);
            let ev;
            while ((ev = w.next()) !== null) {
                if (ev.entering && predicate(ev.node)) return ev.node;
            }
            return null;
        }

        /**
         * Depth-first (DFS pre-order) search - returns all nodes for which
         * `predicate` returns true, in traversal order.
         *
         * @param {object} root
         * @param {(node: object) => boolean} predicate
         * @returns {object[]}
         */
        function findAll(root, predicate) {
            if (root == null) throw new TypeError('findAll: root node required');
            if (typeof predicate !== 'function') throw new TypeError('findAll: predicate must be a function');
            const out = [];
            const w   = new TreeWalker(root);
            let ev;
            while ((ev = w.next()) !== null) {
                if (ev.entering && predicate(ev.node)) out.push(ev.node);
            }
            return out;
        }

        /**
         * Replace `oldNode` with `newNode` in the parent's child list.
         * `oldNode` is unlinked; `newNode` keeps any children it already has.
         *
         * Requires the node to implement `insertBefore(sibling)` and `unlink()`.
         *
         * @param {object} oldNode
         * @param {object} newNode
         * @returns {object} newNode
         * @throws {ContractError} if `oldNode` has no parent
         */
        function replaceNode(oldNode, newNode) {
            if (!oldNode || !newNode) throw new TypeError('replaceNode: both args required');
            if (!oldNode.parent) throw contractError('tw/replace-node-no-parent', 'replaceNode: oldNode has no parent');
            oldNode.insertBefore(newNode);
            oldNode.unlink();
            return newNode;
        }

        /**
         * Wrap `node` in the result of calling `wrapperFactory(node)`.
         *
         * The wrapper takes `node`'s place in the parent's child list, and
         * `node` becomes a child of the wrapper.
         *
         * Requires the node to implement `insertBefore(sibling)`, `unlink()`,
         * and the wrapper to implement `appendChild(child)`.
         *
         * @param {object} node
         * @param {(node: object) => object} wrapperFactory - called with `node`, must return the wrapper object.
         * @returns {object} wrapper
         * @throws {ContractError} if `node` has no parent
         */
        function wrapNode(node, wrapperFactory) {
            if (!node) throw new TypeError('wrapNode: node required');
            if (typeof wrapperFactory !== 'function') throw new TypeError('wrapNode: wrapperFactory must be a function');
            if (!node.parent) throw contractError('tw/wrap-node-no-parent', 'wrapNode: node has no parent');
            const wrapper = wrapperFactory(node);
            if (!wrapper) throw new TypeError('wrapNode: wrapperFactory must return a wrapper node');
            node.insertBefore(wrapper);
            node.unlink();
            wrapper.appendChild(node);
            return wrapper;
        }

        /**
         * Replace `node` with its direct children (lift children up one level).
         * The original `node` is unlinked after all children have been hoisted.
         *
         * Requires the node to implement `insertAfter(sibling)` and `unlink()`,
         * and children to implement `unlink()`.
         *
         * @param {object} node
         * @throws {ContractError} if `node` has no parent
         */
        function flattenNode(node) {
            if (!node) throw new TypeError('flattenNode: node required');
            if (!node.parent) throw contractError('tw/flatten-node-no-parent', 'flattenNode: node must have a parent');
            let cursor       = node.firstChild;
            let lastInserted = node; // insertAfter anchor
            while (cursor) {
                const next = cursor.next;
                cursor.unlink();
                lastInserted.insertAfter(cursor);
                lastInserted = cursor;
                cursor = next;
            }
            node.unlink();
        }

        /**
         * Clone a node.
         *
         * - `deep = true` (default) : recursively copies all descendants.
         *   No reference is shared between the clone subtree and the original.
         * - `deep = false` : shallow copy - the clone has no children (its
         *   own properties are copied but `firstChild` / `lastChild` are null).
         *
         * Preserves the source node's prototype, so class-based nodes keep
         * their prototype methods (e.g. `insertBefore`, `appendChild`, `unlink`)
         * on the clone. All own properties - including non-enumerable ones
         * and getters/setters - are copied via property descriptors.
         * The clone's `parent`, `prev`, and `next` are always set to `null`.
         *
         * Requires cloned children to implement `appendChild(child)`.
         *
         * @param {object} node
         * @param {boolean} [deep=true]
         * @returns {object} clone
         */
        function cloneNode(node, deep = true) {
            if (!node) throw new TypeError('cloneNode: node required');
            // Preserve prototype (class methods) and copy all own property
            // descriptors (including non-enumerable + accessors). This keeps
            // methods like `appendChild` / `unlink` available on the clone.
            const copy = Object.create(
                Object.getPrototypeOf(node),
                Object.getOwnPropertyDescriptors(node),
            );
            // Reset link fields.
            copy.parent     = null;
            copy.prev       = null;
            copy.next       = null;
            copy.firstChild = null;
            copy.lastChild  = null;

            if (deep) {
                let c = node.firstChild;
                while (c) {
                    copy.appendChild(cloneNode(c, true));
                    c = c.next;
                }
            }
            return copy;
        }

        /**
         * Visitor-based DFS walk with extended options.
         *
         * - `visitor(node, entering)` : called for each event.
         *   Return `false` (strict) on `entering=true` to skip the node's subtree.
         *   If visitor throws, the error propagates - walker does not catch it.
         * - `options.nodeTypes` : if provided (array), only nodes whose `type`
         *   property is in the list are passed to visitor (others are traversed
         *   silently so the tree shape is preserved).
         * - Cycle guard: if the same node is entered twice, throws a ContractError
         *   with code `tree-walker/cycle`.
         * - `root == null` → no-op.
         *
         * @param {object|null|undefined} root
         * @param {(node: object, entering: boolean) => boolean|void} visitor
         * @param {{ nodeTypes?: string[] }} [options]
         */
        function walkVisit(root, visitor, options) {
            if (root == null) return;
            if (typeof visitor !== 'function') throw new TypeError('walkVisit: visitor must be a function');

            const nodeTypes = (options && Array.isArray(options.nodeTypes)) ? options.nodeTypes : null;
            const seen      = new Set();

            // Iterative DFS using an explicit stack of { node, entering } events.
            // This avoids call-stack limits for deep trees.
            const stack = [{ node: root, entering: true }];

            while (stack.length > 0) {
                const { node, entering } = stack.pop();

                if (entering) {
                    if (seen.has(node)) {
                        throw contractError('tree-walker/cycle', 'walkVisit: cycle detected in tree');
                    }
                    seen.add(node);
                }

                const isContainer = node.firstChild != null;

                // Call visitor only if nodeTypes filter passes (or no filter).
                let skipSubtree = false;
                if (!nodeTypes || nodeTypes.includes(node.type)) {
                    const result = visitor(node, entering);
                    if (entering && result === false) skipSubtree = true;
                }

                if (entering && isContainer && !skipSubtree) {
                    // Push leaving event for this container.
                    stack.push({ node, entering: false });
                    // Push children in reverse order so first child is processed first.
                    const children = [];
                    let c = node.firstChild;
                    while (c) { children.push(c); c = c.next; }
                    for (let i = children.length - 1; i >= 0; i--) {
                        stack.push({ node: children[i], entering: true });
                    }
                } else if (entering && isContainer && skipSubtree) {
                    // Still need to emit the leaving event for the container when skipping subtree.
                    if (!nodeTypes || nodeTypes.includes(node.type)) {
                        visitor(node, false);
                    }
                }
            }
        }

        return {
            createWalker,
            walk,
            walkVisit,
            findFirst,
            findAll,
            replaceNode,
            wrapNode,
            flattenNode,
            cloneNode,
        };
    }
};
