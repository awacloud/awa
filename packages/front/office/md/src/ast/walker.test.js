// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Unit tests for the `ast/walker.js` shim — `Walker` re-export
 * and `walk()` generator adapter. The full event-sequence semantics live in
 * `node.test.js`; this file ensures the public shim shape is stable.
 */

import { describe, test, expect } from 'bun:test';
import { walk, Walker, Node, T_DOCUMENT, T_PARAGRAPH, T_TEXT } from '../../tests/_helpers/build.js';

function tinyDoc() {
    const doc = new Node(T_DOCUMENT);
    const p = new Node(T_PARAGRAPH);
    const t = new Node(T_TEXT);
    t.literal = 'hi';
    p.appendChild(t);
    doc.appendChild(p);
    return doc;
}

describe('ast/walker shim', () => {
    test('re-exports Walker class', () => {
        expect(typeof Walker).toBe('function');
        const doc = tinyDoc();
        const w = new Walker(doc);
        expect(typeof w.next).toBe('function');
    });

    test('walk(root) yields { node, entering } events', () => {
        const doc = tinyDoc();
        const events = [];
        for (const ev of walk(doc)) {
            events.push({ type: ev.node.type, entering: ev.entering });
        }
        // document(enter) → paragraph(enter) → text(enter) → text(leave-as-leaf? no) → paragraph(leave) → document(leave)
        // Walker emits entering/leaving for containers; leaf text fires only entering.
        expect(events[0]).toEqual({ type: T_DOCUMENT, entering: true });
        expect(events[events.length - 1]).toEqual({ type: T_DOCUMENT, entering: false });
        expect(events.some(e => e.type === T_TEXT && e.entering)).toBe(true);
    });

    test('walk on empty container still emits leaving event', () => {
        // Property used by renderers : ensures `<ul></ul>` gets a closing tag.
        const empty = new Node(T_DOCUMENT);
        const events = [];
        for (const ev of walk(empty)) {
            events.push(ev.entering);
        }
        expect(events).toEqual([true, false]);
    });
});
