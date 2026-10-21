// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The undo / redo history: deltas apply and invert, a diff
 * finds the one change, typing and deleting coalesce into steps (not
 * across a line break, a pause, a caret move or a save), the saved point
 * survives undo and redo and is lost once redone away, the size is capped.
 *
 * @module notepad/core/history.test
 */
import { describe, test, expect } from 'bun:test';
import { apply, invert, diff, createHistory, COALESCE_MS } from './history.js';

/** A typed character at `at` in a text, at time `t`. */
const typed = (at, ch, t = 0) => ({ at, removed: '', inserted: ch, before: [at, at], after: [at + 1, at + 1], time: t, kind: 'type' });
/** A Backspace removing `ch` before `at + 1`. */
const back = (at, ch, t = 0) => ({ at, removed: ch, inserted: '', before: [at + 1, at + 1], after: [at, at], time: t, kind: 'delete' });

/** Run a history's undo / redo steps over a text. */
function replay(text, step) { return step ? apply(text, step) : text; }

describe('deltas', () => {
    test('apply, invert, round trip', () => {
        const e = { at: 4, removed: 'cat', inserted: 'dog', before: [4, 7], after: [7, 7] };
        expect(apply('the cat sat', e)).toBe('the dog sat');
        expect(apply(apply('the cat sat', e), invert(e))).toBe('the cat sat');
        expect(invert(e).before).toEqual([7, 7]);
    });
    test('diff finds the one change, common ends kept out', () => {
        expect(diff('the cat sat', 'the dog sat')).toEqual({ at: 4, removed: 'cat', inserted: 'dog' });
        expect(diff('aaa', 'aaaa')).toEqual({ at: 3, removed: '', inserted: 'a' });
        expect(diff('abc', 'abc')).toEqual({ at: 3, removed: '', inserted: '' });
        expect(diff('', 'x')).toEqual({ at: 0, removed: '', inserted: 'x' });
    });
});

describe('steps', () => {
    test('typing is one step; a line break, a pause or a seal starts another', () => {
        const h = createHistory();
        let text = '';
        for (const [i, ch] of [...'hello'].entries()) { const e = typed(i, ch, i * 100); text = apply(text, e); h.record(e); }
        expect(h.edits.length).toBe(1);
        const nl = { at: 5, removed: '', inserted: '\n', before: [5, 5], after: [6, 6], time: 600, kind: 'other' };
        text = apply(text, nl); h.record(nl);
        h.record(typed(6, 'w', 700)); text = apply(text, typed(6, 'w'));
        h.record(typed(7, 'x', 700 + COALESCE_MS + 1)); text = apply(text, typed(7, 'x'));
        expect(h.edits.length).toBe(4);
        h.seal();
        h.record(typed(8, 'y', 700 + COALESCE_MS + 2)); text = apply(text, typed(8, 'y'));
        expect(h.edits.length).toBe(5);
        expect(text).toBe('hello\nwxy');
        // Undo walks back step by step.
        text = replay(text, h.undo()); expect(text).toBe('hello\nwx');
        text = replay(text, h.undo()); expect(text).toBe('hello\nw');
        text = replay(text, h.undo()); expect(text).toBe('hello\n');
        text = replay(text, h.undo()); expect(text).toBe('hello');
        text = replay(text, h.undo()); expect(text).toBe('');
        expect(h.undo()).toBe(null);
        text = replay(text, h.redo()); expect(text).toBe('hello');
    });

    test('Backspaces in a row are one step, and so are Deletes', () => {
        const h = createHistory();
        let text = 'abcdef';
        for (const [at, ch] of [[5, 'f'], [4, 'e'], [3, 'd']]) { const e = back(at, ch); text = apply(text, e); h.record(e); }
        expect(text).toBe('abc');
        expect(h.edits.length).toBe(1);
        const del = (ch) => ({ at: 0, removed: ch, inserted: '', before: [0, 0], after: [0, 0], time: 0, kind: 'delete' });
        h.seal();
        for (const ch of 'ab') { const e = del(ch); text = apply(text, e); h.record(e); }
        expect(text).toBe('c');
        expect(h.edits.length).toBe(2);
        text = replay(text, h.undo());
        expect(text).toBe('abc');
        text = replay(text, h.undo());
        expect(text).toBe('abcdef');
    });

    test('a new edit after undo drops the redo branch', () => {
        const h = createHistory();
        h.record({ ...typed(0, 'a'), kind: 'other' });
        h.undo();
        expect(h.canRedo).toBe(true);
        h.record({ ...typed(0, 'b'), kind: 'other' });
        expect(h.canRedo).toBe(false);
    });
});

describe('the saved point', () => {
    test('undo back to it is clean; past it, or redone to it, too', () => {
        const h = createHistory();
        expect(h.atSaved).toBe(true);
        h.record({ ...typed(0, 'a'), kind: 'other' });
        expect(h.atSaved).toBe(false);
        h.markSaved();
        h.record(typed(1, 'b', 10));
        expect(h.atSaved).toBe(false);
        expect(h.edits.length).toBe(2);   // a save ends the typing step
        h.undo();
        expect(h.atSaved).toBe(true);
        h.undo();
        expect(h.atSaved).toBe(false);
        h.redo();
        expect(h.atSaved).toBe(true);
    });
    test('once redone away, the saved point cannot come back', () => {
        const h = createHistory();
        h.record({ ...typed(0, 'a'), kind: 'other' });
        h.markSaved();
        h.undo();
        h.record({ ...typed(0, 'z'), kind: 'other' });
        h.undo();
        expect(h.atSaved).toBe(false);
    });
    test('a restored draft is unsaved from the start', () => {
        const h = createHistory();
        h.reset(true);
        expect(h.atSaved).toBe(false);
        h.reset();
        expect(h.atSaved).toBe(true);
    });
    test('the cap drops the oldest steps, the saved point with them', () => {
        const h = createHistory({ max: 3 });
        for (let i = 0; i < 5; i++) { h.record({ ...typed(i, 'x'), kind: 'other' }); }
        expect(h.edits.length).toBe(3);
        let undos = 0;
        while (h.undo()) undos++;
        expect(undos).toBe(3);
        expect(h.atSaved).toBe(false);
    });
});
