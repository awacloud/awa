// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./list-data.js — list-data ↔ Node bridging.
 *
 * `parseListMarker` is tested transitively via the orchestrator-level
 * parser.test.js; here we focus on the pure helpers.
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime } from './_test-runtime.js';

const { Node } = testRuntime.resolve('mdNode');
const { listsMatch, applyListData, listDataFromNode } = testRuntime.resolve('mdBlockListData');

describe('list-data module', () => {
    test('exports are functions', () => {
        expect(typeof listsMatch).toBe('function');
        expect(typeof applyListData).toBe('function');
        expect(typeof listDataFromNode).toBe('function');
    });

    test('listsMatch compares type/delimiter/bulletChar', () => {
        const a = { type: 'bullet', delimiter: null, bulletChar: '-' };
        const b = { type: 'bullet', delimiter: null, bulletChar: '-' };
        const c = { type: 'bullet', delimiter: null, bulletChar: '*' };
        expect(listsMatch(a, b)).toBe(true);
        expect(listsMatch(a, c)).toBe(false);
    });

    test('applyListData / listDataFromNode round-trip', () => {
        const d = {
            type: 'ordered', start: 3, tight: true,
            delimiter: '.', bulletChar: null, padding: 3, markerOffset: 0
        };
        const node = new Node('list');
        applyListData(node, d);
        expect(listDataFromNode(node)).toEqual(d);
    });
});
