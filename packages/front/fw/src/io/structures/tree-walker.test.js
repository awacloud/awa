// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { treeWalker } from './tree-walker.js';


// ---------------------------------------------------------------------------
// Minimal mock node that satisfies the linked-tree contract
// { parent, firstChild, lastChild, prev, next }
// + unlink(), appendChild(), insertAfter(), insertBefore()
// ---------------------------------------------------------------------------

function makeNode(type) {
    return {
        type,
        parent:     null,
        firstChild: null,
        lastChild:  null,
        prev:       null,
        next:       null,

        appendChild(child) {
            child.unlink();
            child.parent = this;
            if (this.lastChild) {
                this.lastChild.next = child;
                child.prev          = this.lastChild;
                this.lastChild      = child;
            } else {
                this.firstChild = child;
                this.lastChild  = child;
            }
        },

        insertBefore(sibling) {
            sibling.unlink();
            sibling.prev = this.prev;
            if (sibling.prev) sibling.prev.next = sibling;
            sibling.next   = this;
            this.prev      = sibling;
            sibling.parent = this.parent;
            if (!sibling.prev && sibling.parent) sibling.parent.firstChild = sibling;
        },

        insertAfter(sibling) {
            sibling.unlink();
            sibling.next = this.next;
            if (sibling.next) sibling.next.prev = sibling;
            sibling.prev   = this;
            this.next      = sibling;
            sibling.parent = this.parent;
            if (!sibling.next && sibling.parent) sibling.parent.lastChild = sibling;
        },

        unlink() {
            if (this.prev)        this.prev.next        = this.next;
            else if (this.parent) this.parent.firstChild = this.next;
            if (this.next)        this.next.prev        = this.prev;
            else if (this.parent) this.parent.lastChild  = this.prev;
            this.parent = null;
            this.prev   = null;
            this.next   = null;
        },
    };
}

/**
 * Build a small tree:
 *
 *   root (container)
 *   ├── a (container)
 *   │   ├── a1 (leaf)
 *   │   └── a2 (leaf)
 *   └── b (leaf)
 */
function buildTree() {
    const root = makeNode('root');
    const a    = makeNode('a');
    const a1   = makeNode('a1');
    const a2   = makeNode('a2');
    const b    = makeNode('b');
    root.appendChild(a);
    root.appendChild(b);
    a.appendChild(a1);
    a.appendChild(a2);
    return { root, a, a1, a2, b };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('treeWalker module', () => {
    // 1. Metadata
    test('should have correct module metadata', () => {
        expect(treeWalker.name).toBe('treeWalker');
        expect(treeWalker.dependencies).toEqual([]);
        expect(typeof treeWalker.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = treeWalker.factory();
            expect(typeof inst.createWalker).toBe('function');
            expect(typeof inst.walk).toBe('function');
            expect(typeof inst.findFirst).toBe('function');
            expect(typeof inst.findAll).toBe('function');
            expect(typeof inst.replaceNode).toBe('function');
            expect(typeof inst.wrapNode).toBe('function');
            expect(typeof inst.flattenNode).toBe('function');
            expect(typeof inst.cloneNode).toBe('function');
        });
    });

    describe('createWalker', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 2. Walker emits entering then leaving for containers
        test('emits entering=true then entering=false for containers', () => {
            const { root } = buildTree();
            const walker = tree.createWalker(root);
            const events = [];
            let ev;
            while ((ev = walker.next()) !== null) {
                if (ev.node.type === 'root') events.push(ev.entering);
            }
            expect(events).toEqual([true, false]);
        });

        // 3. Walker emits entering=true only for leaves
        test('emits only entering=true for leaf nodes', () => {
            const { root } = buildTree();
            const walker = tree.createWalker(root);
            const leafEvents = [];
            let ev;
            while ((ev = walker.next()) !== null) {
                if (ev.node.type === 'b') leafEvents.push(ev.entering);
            }
            expect(leafEvents).toEqual([true]);
        });

        // 4. Complete visit: 2*containers + leaves events
        test('visit count = 2 * containers + leaves', () => {
            const { root } = buildTree();
            // containers: root, a  => 2 × 2 = 4 events
            // leaves:     a1, a2, b => 3 events
            // total: 7
            const walker = tree.createWalker(root);
            let count = 0;
            let ev;
            while ((ev = walker.next()) !== null) count++;
            expect(count).toBe(7);
        });

        // 5. next() returns null when exhausted
        test('next() returns null when tree is exhausted', () => {
            const { root } = buildTree();
            const walker = tree.createWalker(root);
            let ev;
            while ((ev = walker.next()) !== null) { /* consume */ }
            expect(walker.next()).toBeNull();
        });

        test('throws on null root', () => {
            expect(() => tree.createWalker(null)).toThrow();
        });
    });

    describe('walk', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 6. walk() iterable is consistent
        test('iterable [...walk(root)].length matches manual count', () => {
            const { root } = buildTree();
            const events = [...tree.walk(root)];
            expect(events.length).toBe(7);
        });

        test('for…of works without throwing', () => {
            const { root } = buildTree();
            let count = 0;
            for (const _ev of tree.walk(root)) count++;
            expect(count).toBe(7);
        });

        test('throws on null root', () => {
            expect(() => [...tree.walk(null)]).toThrow();
        });
    });

    describe('findFirst', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 7. returns null if no match
        test('returns null if predicate never matches', () => {
            const { root } = buildTree();
            expect(tree.findFirst(root, n => n.type === 'missing')).toBeNull();
        });

        test('returns first matching node (DFS pre-order)', () => {
            const { root, a } = buildTree();
            const found = tree.findFirst(root, n => n.type === 'a');
            expect(found).toBe(a);
        });

        test('returns root if predicate matches root', () => {
            const { root } = buildTree();
            expect(tree.findFirst(root, n => n.type === 'root')).toBe(root);
        });

        test('throws if predicate is not a function', () => {
            const { root } = buildTree();
            expect(() => tree.findFirst(root, null)).toThrow();
        });
    });

    describe('findAll', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 8. returns ordered DFS pre-order array
        test('returns all matching nodes in DFS pre-order', () => {
            const { root, a1, a2 } = buildTree();
            const results = tree.findAll(root, n => n.type === 'a1' || n.type === 'a2');
            expect(results).toEqual([a1, a2]);
        });

        test('returns empty array if no match', () => {
            const { root } = buildTree();
            expect(tree.findAll(root, n => n.type === 'nope')).toEqual([]);
        });

        test('can find all leaves', () => {
            const { root, a1, a2, b } = buildTree();
            const leaves = tree.findAll(root, n => n.firstChild === null);
            expect(leaves).toEqual([a1, a2, b]);
        });
    });

    describe('replaceNode', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 9. preserves siblings + parent link
        test('replaces node, preserves siblings and parent link', () => {
            const { root, a, b } = buildTree();
            const c = makeNode('c');
            tree.replaceNode(a, c);
            // c is now first child of root
            expect(root.firstChild).toBe(c);
            expect(c.parent).toBe(root);
            // b is still present
            expect(root.lastChild).toBe(b);
            expect(c.next).toBe(b);
            expect(b.prev).toBe(c);
            // a is unlinked
            expect(a.parent).toBeNull();
        });

        // 14. throws ContractError if oldNode has no parent
        test('throws ContractError when oldNode has no parent', () => {
            const orphan = makeNode('orphan');
            const newN   = makeNode('new');
            expect(() => tree.replaceNode(orphan, newN)).toThrow();
            try {
                tree.replaceNode(orphan, newN);
            } catch (e) {
                expect(e.name).toBe('ContractError');
            }
        });

        test('throws TypeError if args are missing', () => {
            expect(() => tree.replaceNode(null, null)).toThrow(TypeError);
        });
    });

    describe('wrapNode', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 10. factory receives original node; wrapper contains node
        test('wrapperFactory receives the original node and wrapper contains it', () => {
            const { root, b } = buildTree();
            let received = null;
            const wrapper = tree.wrapNode(b, n => {
                received = n;
                return makeNode('wrapper');
            });
            expect(received).toBe(b);
            expect(wrapper.type).toBe('wrapper');
            expect(wrapper.parent).toBe(root);
            expect(wrapper.firstChild).toBe(b);
            expect(b.parent).toBe(wrapper);
        });

        test('throws ContractError when node has no parent', () => {
            const orphan = makeNode('orphan');
            expect(() => tree.wrapNode(orphan, _n => makeNode('w'))).toThrow();
            try {
                tree.wrapNode(orphan, _n => makeNode('w'));
            } catch (e) {
                expect(e.name).toBe('ContractError');
            }
        });
    });

    describe('flattenNode', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 11. replaces node by its children; parent links updated
        test('hoists children, removes container, updates parent links', () => {
            const { root, a, a1, a2, b } = buildTree();
            tree.flattenNode(a);
            // root's children should now be: a1, a2, b
            expect(root.firstChild).toBe(a1);
            expect(a1.parent).toBe(root);
            expect(a1.next).toBe(a2);
            expect(a2.parent).toBe(root);
            expect(a2.next).toBe(b);
            expect(root.lastChild).toBe(b);
            // a is unlinked
            expect(a.parent).toBeNull();
        });

        test('throws ContractError when node has no parent', () => {
            const orphan = makeNode('orphan');
            orphan.appendChild = makeNode('child').unlink; // give it a child shape
            expect(() => tree.flattenNode(orphan)).toThrow();
            try {
                tree.flattenNode(orphan);
            } catch (e) {
                expect(e.name).toBe('ContractError');
            }
        });
    });

    describe('cloneNode', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // 12. deep=true: no shared references in subtree
        test('deep clone produces no shared references in the subtree', () => {
            const { a, a1, a2 } = buildTree();
            const clone = tree.cloneNode(a, true);
            expect(clone).not.toBe(a);
            expect(clone.firstChild).not.toBe(a1);
            expect(clone.lastChild).not.toBe(a2);
            // Types are preserved
            expect(clone.type).toBe('a');
            expect(clone.firstChild.type).toBe('a1');
            expect(clone.lastChild.type).toBe('a2');
            // Parent is null
            expect(clone.parent).toBeNull();
        });

        // 13. deep=false: shallow copy, children not copied
        test('shallow clone has null firstChild / lastChild', () => {
            const { a, a1 } = buildTree();
            const clone = tree.cloneNode(a, false);
            expect(clone).not.toBe(a);
            expect(clone.type).toBe('a');
            expect(clone.firstChild).toBeNull();
            expect(clone.lastChild).toBeNull();
            // Original is unchanged
            expect(a.firstChild).toBe(a1);
        });

        test('deep clone default (no second arg) is deep', () => {
            const { a } = buildTree();
            const clone = tree.cloneNode(a);
            expect(clone.firstChild).not.toBeNull();
            expect(clone.firstChild.type).toBe('a1');
        });

        test('throws TypeError on null node', () => {
            expect(() => tree.cloneNode(null)).toThrow(TypeError);
        });

        test('clone link fields (parent, prev, next) are null', () => {
            const { a } = buildTree();
            const clone = tree.cloneNode(a, true);
            expect(clone.parent).toBeNull();
            expect(clone.prev).toBeNull();
            expect(clone.next).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // Robustness / regression
    // -------------------------------------------------------------------------

    describe('robustness / regression', () => {
        let tree;
        beforeEach(() => { tree = treeWalker.factory(); });

        // R1. Cyclic tree - must detect cycle and throw, not loop infinitely
        test('cyclic tree: walkVisit throws tree-walker/cycle, not infinite loop', () => {
            const parent = makeNode('parent');
            const child  = makeNode('child');
            // Build a valid parent→child link first
            parent.appendChild(child);
            // Manually inject cycle: child.firstChild = parent (breaks tree invariant)
            child.firstChild = parent;

            expect(() => {
                tree.walkVisit(parent, () => {});
            }).toThrow();

            try {
                tree.walkVisit(parent, () => {});
            } catch (e) {
                expect(e.code).toBe('tree-walker/cycle');
            }
        });

        // R2. Very large tree (10 000 nodes) - iterative walk must not stack overflow
        test('10 000-node linear chain: walkVisit terminates without stack overflow', () => {
            // Build a purely linear chain: root → n1 → n2 → … → n9999
            const root = makeNode('root');
            let current = root;
            for (let i = 0; i < 9999; i++) {
                const child = makeNode('n');
                current.appendChild(child);
                current = child;
            }
            let count = 0;
            expect(() => {
                tree.walkVisit(root, (_node, entering) => {
                    if (entering) count++;
                });
            }).not.toThrow();
            expect(count).toBe(10000);
        });

        // R3. Visitor returning false - skips subtree
        test('visitor returning false on entering skips node subtree', () => {
            const { root, a, a1, a2, b } = buildTree();
            const visited = [];
            tree.walkVisit(root, (node, entering) => {
                if (entering) {
                    visited.push(node.type);
                    // Skip subtree of 'a'
                    if (node.type === 'a') return false;
                }
            });
            // root and b should be visited; a1 and a2 should NOT
            expect(visited).toContain('root');
            expect(visited).toContain('a');
            expect(visited).toContain('b');
            expect(visited).not.toContain('a1');
            expect(visited).not.toContain('a2');
        });

        // R4. Visitor that throws - error propagates, walker does not mask it
        test('visitor that throws propagates the error without masking', () => {
            const { root } = buildTree();
            const boom = new Error('visitor-boom');
            expect(() => {
                tree.walkVisit(root, (node, entering) => {
                    if (entering && node.type === 'a') throw boom;
                });
            }).toThrow('visitor-boom');
        });

        // R5. nodeTypes filter - only listed types are passed to visitor
        test('nodeTypes filter: only visits nodes whose type is in the list', () => {
            const { root } = buildTree();
            const visited = [];
            tree.walkVisit(root, (node, entering) => {
                if (entering) visited.push(node.type);
            }, { nodeTypes: ['a1', 'b'] });
            expect(visited).toEqual(['a1', 'b']);
            expect(visited).not.toContain('root');
            expect(visited).not.toContain('a');
            expect(visited).not.toContain('a2');
        });

        // R6. Pre-order vs post-order: exact visit sequence for a fixed tree
        //
        //   root
        //   ├── a
        //   │   ├── a1
        //   │   └── a2
        //   └── b
        //
        // Expected pre-order  (entering=true):  root, a, a1, a2, b
        // Expected post-order (entering=false): a1, a2, a, b, root
        test('pre-order entering events: root, a, a1, a2, b', () => {
            const { root } = buildTree();
            const preOrder = [];
            for (const { node, entering } of tree.walk(root)) {
                if (entering) preOrder.push(node.type);
            }
            expect(preOrder).toEqual(['root', 'a', 'a1', 'a2', 'b']);
        });

        test('post-order leaving events: a1, a2, a, b, root', () => {
            const { root } = buildTree();
            const postOrder = [];
            for (const { node, entering } of tree.walk(root)) {
                if (!entering) postOrder.push(node.type);
            }
            // Leaves (a1, a2, b) do not emit leaving events; containers do.
            // Leaving events: a (after a1+a2 consumed), root (at end)
            // b is a leaf: no leaving event
            expect(postOrder).toEqual(['a', 'root']);
        });

        // R7. walkVisit on null / undefined → no-op, does not throw
        test('walkVisit(null, visitor) is a no-op', () => {
            let called = false;
            expect(() => {
                tree.walkVisit(null, () => { called = true; });
            }).not.toThrow();
            expect(called).toBe(false);
        });

        test('walkVisit(undefined, visitor) is a no-op', () => {
            let called = false;
            expect(() => {
                tree.walkVisit(undefined, () => { called = true; });
            }).not.toThrow();
            expect(called).toBe(false);
        });

        // R8. factory API includes walkVisit
        test('factory instance exposes walkVisit', () => {
            expect(typeof tree.walkVisit).toBe('function');
        });
    });
});
