// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The recovery journal over map-backed stores and fake
 * locks: nothing is written before there is something to lose; deltas are
 * written in batches and rebuild the text; a window that went away leaves
 * an orphan the next window adopts (most recent first), with its handle;
 * a live window's session is never taken; back at the saved text the
 * session is dropped; without Web Locks, staleness decides.
 *
 * @module notepad/core/journal.test
 */
import { describe, test, expect } from 'bun:test';
import { createJournal, STALE_MS } from './journal.js';

/** A Map-backed store with the fw `indexedDB` accessor's shape. */
function store() {
    const map = new Map();
    return {
        map,
        get: async (k) => structuredClone(map.get(k)),
        set: async (k, v) => { map.set(k, structuredClone(v)); return k; },
        del: async (k) => { map.delete(k); },
        getAllKeys: async () => [...map.keys()]
    };
}

/** Locks shared by every "window" of a test; `release` is the window going away. */
function lockRoom() {
    const held = new Set();
    return {
        held,
        locks: { hold: (name) => held.add(name), held: async () => new Set(held) },
        release: (id) => held.delete(`awa-notepad-session:${id}`)
    };
}

/** Manual timers: `tick()` runs what is due. */
function timers() {
    let next = 1;
    const due = new Map();
    return {
        setTimer: (fn) => { const id = next++; due.set(id, fn); return id; },
        clearTimer: (id) => { due.delete(id); },
        tick() { const fns = [...due.values()]; due.clear(); for (const fn of fns) fn(); }
    };
}

/** Let pending promise chains run (timers in ms). @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const doc = (text, extra = {}) => ({ name: 'notes.txt', text, encoding: 'utf-8', eol: 'lf', handle: null, dirty: false, ...extra });
const ins = (at, inserted) => ({ at, removed: '', inserted });
const settle = () => sleep(5);

describe('journal', () => {
    test('nothing is written for a document without edits', async () => {
        const sessions = store(), edits = store(), room = lockRoom(), t = timers();
        const j = createJournal({ sessions, edits, locks: room.locks, ...t });
        await j.start();
        j.base(doc('hello'));
        t.tick();
        await j.flush();
        expect(sessions.map.size).toBe(0);
        expect(edits.map.size).toBe(0);
    });

    test('deltas are written in batches once typing pauses, and rebuild the text in the next window', async () => {
        const sessions = store(), edits = store(), room = lockRoom(), t = timers();
        const handle = { kind: 'file', name: 'notes.txt' };
        const a = createJournal({ sessions, edits, locks: room.locks, ...t });
        await a.start();
        a.base(doc('hello', { handle }));
        a.edit(ins(5, ' wor'));
        a.edit(ins(9, 'ld'));
        expect(edits.map.size).toBe(0);           // not before the pause
        t.tick();
        await a.flush();
        a.edit({ at: 0, removed: 'h', inserted: 'H' });
        await a.flush();                          // leaving: written now
        expect(edits.map.size).toBe(2);
        expect(sessions.map.get(a.id).text).toBe('hello');   // the base, once

        // A live window's session is not an orphan.
        const b0 = createJournal({ sessions, edits, locks: room.locks, ...t });
        expect(await b0.start()).toEqual([]);

        room.release(a.id);
        const b = createJournal({ sessions, edits, locks: room.locks, ...t });
        const orphans = await b.start();
        expect(orphans.map((s) => s.id)).toEqual([a.id]);
        const back = await b.adopt(orphans[0]);
        expect(back).toEqual({ name: 'notes.txt', text: 'Hello world', encoding: 'utf-8', eol: 'lf', handle });
        await settle();
        expect(sessions.map.has(a.id)).toBe(false);
        expect(edits.map.size).toBe(0);
    });

    test('the most recent orphan comes first', async () => {
        const sessions = store(), edits = store(), room = lockRoom();
        let clock = 1000;
        const make = () => createJournal({ sessions, edits, locks: room.locks, now: () => clock });
        const older = make(); await older.start(); older.base(doc('a')); older.edit(ins(1, '1')); await older.flush();
        clock = 2000;
        const newer = make(); await newer.start(); newer.base(doc('b')); newer.edit(ins(1, '2')); await newer.flush();
        room.release(older.id);
        room.release(newer.id);
        const c = make();
        expect((await c.start()).map((s) => s.id)).toEqual([newer.id, older.id]);
    });

    test('back at the saved text, the session is dropped; a later edit writes it again', async () => {
        const sessions = store(), edits = store(), room = lockRoom(), t = timers();
        const j = createJournal({ sessions, edits, locks: room.locks, ...t });
        await j.start();
        j.base(doc('x'));
        j.edit(ins(1, 'y'));
        await j.flush();
        expect(sessions.map.size).toBe(1);
        j.clean();
        await settle();
        expect(sessions.map.size).toBe(0);
        expect(edits.map.size).toBe(0);
        j.edit(ins(1, 'z'));
        await j.flush();
        expect(sessions.map.get(j.id).text).toBe('x');
    });

    test('a recovered (unsaved) base is written at once; a save drops it', async () => {
        const sessions = store(), edits = store(), room = lockRoom(), t = timers();
        const j = createJournal({ sessions, edits, locks: room.locks, ...t });
        await j.start();
        j.base(doc('recovered', { dirty: true }));
        await settle();
        expect(sessions.map.get(j.id).text).toBe('recovered');
        j.base(doc('recovered'));                // saved
        await settle();
        expect(sessions.map.size).toBe(0);
    });

    test('without Web Locks, a session untouched for a while is an orphan', async () => {
        const sessions = store(), edits = store();
        let clock = 0;
        const a = createJournal({ sessions, edits, now: () => clock });
        await a.start();
        a.base(doc(''));
        a.edit(ins(0, 'kept'));
        await a.flush();
        a.stop();
        const b = createJournal({ sessions, edits, now: () => clock });
        expect(await b.start()).toEqual([]);
        clock = STALE_MS + 1;
        expect((await b.start()).map((s) => s.id)).toEqual([a.id]);
        b.stop();
    });
});
