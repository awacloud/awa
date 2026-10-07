// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview md-walker visitor tests.
 */

import { test, expect, describe } from 'bun:test';
import { createMd } from './_helpers/build.js';
import { mdWalk as walk, mdWalker } from './_helpers/build.js';

const md = createMd({ extendedAutolinks: false });

describe('md-walker', () => {
    test('walk dispatches enter/exit per type', () => {
        const ast = md.parse('# hi\n\nbody\n');
        const events = [];
        walk(ast, {
            heading: {
                enter(n) { events.push(['enter', 'heading', n.level]); },
                exit(n)  { events.push(['exit',  'heading', n.level]); }
            },
            text: {
                enter(n) { events.push(['enter', 'text', n.literal]); }
            }
        });
        expect(events).toContainEqual(['enter', 'heading', 1]);
        expect(events).toContainEqual(['exit', 'heading', 1]);
        expect(events.some(e => e[0] === 'enter' && e[1] === 'text' && e[2] === 'hi')).toBe(true);
    });

    test('wildcard visitor is invoked for every node', () => {
        const ast = md.parse('# h\n');
        const types = [];
        walk(ast, { '*': { enter(n) { types.push(n.type); } } });
        expect(types).toContain('document');
        expect(types).toContain('heading');
        expect(types).toContain('text');
    });

    test('ctx.stop() halts traversal', () => {
        const ast = md.parse('# h\n\np1\n\np2\n');
        const seen = [];
        walk(ast, {
            heading: { enter(n, ctx) { seen.push('h'); ctx.stop(); } },
            paragraph: { enter() { seen.push('p'); } }
        });
        expect(seen).toEqual(['h']);
    });

    test('ctx.skipChildren() skips descent', () => {
        const ast = md.parse('# h *e* x\n');
        const seen = [];
        walk(ast, {
            heading: { enter(_n, ctx) { ctx.skipChildren(); } },
            text:    { enter(n) { seen.push(n.literal); } },
            emph:    { enter() { seen.push('emph'); } }
        });
        expect(seen.length).toBe(0);
    });

    test('factory createWalker.use composes extensions', () => {
        const factory = mdWalker.factory();
        const w = factory.createWalker();
        const log = [];
        w.use({ visitors: { heading: { enter(n) { log.push('ext-h-' + n.level); } } } });
        const ast = md.parse('## hello\n');
        w.walk(ast, { heading: { enter(n) { log.push('local-h-' + n.level); } } });
        expect(log).toContain('ext-h-2');
        expect(log).toContain('local-h-2');
    });
});
