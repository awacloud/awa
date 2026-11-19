// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The constructible helpers share ONE runtime.
 *
 * `createPageflip` and `createHypertree` each resolve the composed module on a
 * runtime they build themselves. Two runtimes resolve two `graphic.scheduler`
 * singletons: a page using both helpers would run two animation-frame loops.
 * The helpers share one lazily built runtime instead, released when the last
 * helper instance is disposed.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { createPageflip } from '../pageflip/create.js';
import { createHypertree } from '../hypertree/create.js';

const tree = () => ({ id: 'root', children: [{ id: 'a' }, { id: 'b', children: [{ id: 'b1' }] }] });

describe('the helpers share one runtime', () => {
    test('a pageflip turn and a hypertree run on the SAME default scheduler', () => {
        const pf = createPageflip(document.createElement('div'), {
            pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], width: 320, height: 480, duration: 100,
        });
        const ht = createHypertree(document.createElement('div'), { tree: tree(), duration: 100 });
        try {
            pf.instance.next();
            const turns = [...pf.instance._active];
            expect(turns.length).toBe(1);
            expect(turns[0]._scheduler).toBe(ht.instance._scheduler);
        } finally {
            pf.dispose();
            ht.dispose();
        }
    });

    test('a second round after every helper was disposed still works', () => {
        const ht = createHypertree(document.createElement('div'), { tree: tree(), duration: 100 });
        expect(ht.instance.rootId).toBe('root');
        ht.dispose();
    });
});
