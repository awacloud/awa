// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./sourcepos.js — backfill of sourcepos
 * on inline nodes left unstamped after the main parse.
 */

import { describe, test, expect } from 'bun:test';
import { Node, runtime } from '../../tests/_helpers/build.js';

const { backfillSourcepos } = runtime.resolve('mdInlineSourcepos');

describe('sourcepos module', () => {
    test('exported function is callable', () => {
        expect(typeof backfillSourcepos).toBe('function');
    });

    test('container inherits span from first..last child', () => {
        const root = new Node('paragraph');
        root.sourcepos = [[1, 1], [1, 10]];
        const container = new Node('emph');
        const a = new Node('text'); a.sourcepos = [[1, 3], [1, 4]];
        const b = new Node('text'); b.sourcepos = [[1, 5], [1, 8]];
        container.appendChild(a);
        container.appendChild(b);
        root.appendChild(container);
        backfillSourcepos(root);
        expect(container.sourcepos[0]).toEqual([1, 3]);
        expect(container.sourcepos[1]).toEqual([1, 8]);
    });

    test('leaf without sourcepos inherits from parent', () => {
        const root = new Node('paragraph');
        root.sourcepos = [[1, 1], [1, 10]];
        const leaf = new Node('text');
        root.appendChild(leaf);
        backfillSourcepos(root);
        expect(leaf.sourcepos).toEqual([[1, 1], [1, 10]]);
    });

    test('does not overwrite an existing sourcepos', () => {
        const root = new Node('paragraph');
        root.sourcepos = [[1, 1], [1, 10]];
        const leaf = new Node('text');
        leaf.sourcepos = [[2, 1], [2, 5]];
        root.appendChild(leaf);
        backfillSourcepos(root);
        expect(leaf.sourcepos).toEqual([[2, 1], [2, 5]]);
    });
});
