// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./task-list.js — GFM task list detection.
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime } from './_test-runtime.js';

const { Node } = testRuntime.resolve('mdNode');
const { detectTaskLists } = testRuntime.resolve('mdBlockTaskList');

function makeListWithItemText(text) {
    const doc = new Node('document');
    const list = new Node('list');
    const item = new Node('item');
    const para = new Node('paragraph');
    para.stringContent = text;
    item.appendChild(para);
    list.appendChild(item);
    doc.appendChild(list);
    return { doc, item, para };
}

describe('task-list module', () => {
    test('tags unchecked task list item', () => {
        const { doc, item, para } = makeListWithItemText('[ ] do the thing');
        detectTaskLists(doc);
        expect(item.checked).toBe(false);
        expect(para.stringContent).toBe('do the thing');
    });

    test('tags checked task list item (lowercase x)', () => {
        const { doc, item, para } = makeListWithItemText('[x] done');
        detectTaskLists(doc);
        expect(item.checked).toBe(true);
        expect(para.stringContent).toBe('done');
    });

    test('tags checked task list item (uppercase X)', () => {
        const { doc, item } = makeListWithItemText('[X] done');
        detectTaskLists(doc);
        expect(item.checked).toBe(true);
    });

    test('leaves plain item alone', () => {
        const { doc, item, para } = makeListWithItemText('plain item');
        detectTaskLists(doc);
        // Node's default `checked` slot is null; we only assert the
        // detector did not flip it to a boolean.
        expect(typeof item.checked).not.toBe('boolean');
        expect(para.stringContent).toBe('plain item');
    });
});
