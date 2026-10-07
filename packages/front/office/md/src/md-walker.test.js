// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Sibling tests for the visitor-style md-walker.
 *
 * Complements the existing `tests/md-walker.test.js` integration suite
 * by focusing on the factory contract and the extension-registry
 * primitives that extras rely on.
 */

import { describe, test, expect } from 'bun:test';
import { mdWalker, mdWalk as walk, createMd } from '../tests/_helpers/build.js';

const md = createMd({ extendedAutolinks: false });

describe('mdWalker module', () => {
    test('should have correct module metadata', () => {
        expect(mdWalker.name).toBe('mdWalker');
        expect(mdWalker.dependencies).toEqual(['mdNode']);
        expect(typeof mdWalker.factory).toBe('function');
    });

    describe('factory', () => {
        test('exposes createWalker + walk', () => {
            const inst = mdWalker.factory();
            expect(typeof inst.createWalker).toBe('function');
            expect(typeof inst.walk).toBe('function');
        });

        test('createWalker returns an extensible walker', () => {
            const inst = mdWalker.factory();
            const w = inst.createWalker();
            expect(typeof w.use).toBe('function');
            expect(typeof w.walk).toBe('function');
            expect(Array.isArray(w.extensions)).toBe(true);
            expect(w.hasExtensions).toBe(false);
        });
    });

    describe('walk (standalone)', () => {
        test('dispatches enter/exit hooks per type', () => {
            const ast = md.parse('# hi\n');
            const events = [];
            walk(ast, {
                heading: {
                    enter(n) { events.push(['enter', 'heading', n.level]); },
                    exit(n)  { events.push(['exit',  'heading', n.level]); }
                }
            });
            expect(events).toEqual([
                ['enter', 'heading', 1],
                ['exit',  'heading', 1]
            ]);
        });

        test('wildcard "*" visitor fires for every node', () => {
            const ast = md.parse('a **b**\n');
            let entered = 0;
            walk(ast, { '*': { enter() { entered++; } } });
            expect(entered).toBeGreaterThan(3);
        });

        test('ctx.stop() halts traversal', () => {
            const ast = md.parse('# a\n\n# b\n\n# c\n');
            const seen = [];
            walk(ast, {
                heading: {
                    enter(n, ctx) {
                        seen.push(n.level);
                        ctx.stop();
                    }
                }
            });
            expect(seen).toEqual([1]);
        });

        test('ctx.skipChildren() skips descendants', () => {
            const ast = md.parse('# hi\n\nworld\n');
            const visited = [];
            walk(ast, {
                heading: {
                    enter(_, ctx) { ctx.skipChildren(); }
                },
                text: { enter(n) { visited.push(n.literal); } }
            });
            // 'hi' is inside the heading we skipped; 'world' is in another paragraph.
            expect(visited).not.toContain('hi');
            expect(visited).toContain('world');
        });
    });

    describe('extension registry (used by extras)', () => {
        test('use() registers visitor bundles', () => {
            const inst = mdWalker.factory();
            const w = inst.createWalker();
            const ext = { name: 'spy', visitors: {
                heading: { enter() {} }
            }};
            w.use(ext);
            expect(w.hasExtensions).toBe(true);
            expect(w.extensions).toContain(ext);
        });

        test('use() is idempotent for the same extension instance', () => {
            const inst = mdWalker.factory();
            const w = inst.createWalker();
            const ext = { visitors: {} };
            w.use(ext); w.use(ext);
            expect(w.extensions.length).toBe(1);
        });

        test('registered hooks run when walking', () => {
            const inst = mdWalker.factory();
            const w = inst.createWalker();
            const order = [];
            w.use({ visitors: {
                heading: {
                    enter() { order.push('ext-enter'); },
                    exit() { order.push('ext-exit'); }
                }
            }});
            const ast = md.parse('# x\n');
            w.walk(ast, {
                heading: {
                    enter() { order.push('call-enter'); }
                }
            });
            expect(order).toContain('ext-enter');
            expect(order).toContain('call-enter');
            expect(order).toContain('ext-exit');
        });
    });
});
