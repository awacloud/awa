// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The recovery journal of the standalone notepad: unsaved
 * work kept on the device as a base text plus the deltas typed since,
 * so text comes back after the window was closed, crashed or reloaded
 * for an update.
 *
 * - One SESSION per window: the document's base (the text as opened or
 *   last saved, its name, encoding, line endings and — where the browser
 *   has them — its file handle, so a recovered document still saves back
 *   to its file), then its deltas, written in batches.
 * - Written only once there is something to lose: a document without
 *   edits costs nothing; back at its saved text (saved, or undone to it),
 *   its session is dropped.
 * - A window holds a lock named after its session while it lives (Web
 *   Locks); a session whose lock nobody holds is an orphan. At start, a
 *   window adopts the most recent orphan; the others wait for the next
 *   window. Without Web Locks, a session untouched for `STALE_MS` is an
 *   orphan (live windows touch theirs every `TOUCH_MS`).
 *
 * Storage is injected (`kv`): the page passes two fw `indexedDB` stores;
 * the tests pass maps. IndexedDB rather than localStorage (chosen
 * deliberately): asynchronous (a 15 MB draft written to localStorage on
 * every pause froze the page), a large quota, and it keeps file handles.
 *
 * @module notepad/core/journal
 */

/** Deltas are written once typing pauses this long. */
export const FLUSH_MS = 300;
/** Without Web Locks: a live window touches its session this often… */
export const TOUCH_MS = 5000;
/** …and a session untouched this long is an orphan. */
export const STALE_MS = 15000;

/**
 * @typedef {object} Base
 * @property {string|null} name
 * @property {string} text
 * @property {string} encoding
 * @property {string} eol
 * @property {any} handle A FileSystemFileHandle, or null.
 * @property {boolean} dirty Unsaved already (a recovered document).
 */

/**
 * @typedef {object} Session
 * @property {string} id
 * @property {number} updated
 * @property {string|null} name
 * @property {string} encoding
 * @property {string} eol
 * @property {any} handle
 * @property {string} text The base text.
 * @property {number} batches How many delta batches follow it.
 */

/**
 * @typedef {object} Store
 * @property {(key: string) => Promise<any>} get
 * @property {(key: string, value: any) => Promise<any>} set
 * @property {(key: string) => Promise<void>} del
 * @property {() => Promise<string[]>} getAllKeys
 */

/** A fresh session id (fw sanity blocks `crypto.randomUUID`, not `getRandomValues`). */
function freshId() {
    const words = globalThis.crypto.getRandomValues(new Uint32Array(4));
    return [...words].map((w) => w.toString(36)).join('');
}

const batchKey = (id, n) => `${id}/${String(n).padStart(9, '0')}`;

/**
 * @param {{sessions: Store, edits: Store,
 *   locks?: {hold: (name: string) => void, held: () => Promise<Set<string>>}|null,
 *   now?: () => number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout}} kv
 */
export function createJournal({ sessions, edits, locks = null, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
    const id = freshId();
    const lockName = (sessionId) => `awa-notepad-session:${sessionId}`;
    /** @type {Base|null} The base in memory; written with the first delta. */
    let base = null;
    let written = false;
    let batches = 0;
    /** @type {object[]} Deltas not written yet. */
    let queue = [];
    /** @type {any} */
    let timer = null;
    /** @type {Promise<void>} Writes run one after the other. */
    let chain = Promise.resolve();
    const serial = (fn) => (chain = chain.then(fn, fn));

    /** Write the session record (base included). */
    function writeSession() {
        if (!base) return Promise.resolve();
        return sessions.set(id, {
            id, updated: now(), name: base.name, encoding: base.encoding, eol: base.eol,
            handle: base.handle, text: base.text, batches
        });
    }

    async function dropStored(sessionId, count) {
        for (let n = 0; n < count; n++) await edits.del(batchKey(sessionId, n));
        await sessions.del(sessionId);
    }

    function flush() {
        if (timer) { clearTimer(timer); timer = null; }
        if (!queue.length || !base) return chain;
        const batch = queue;
        queue = [];
        return serial(async () => {
            if (!written) {
                written = true;
                await writeSession();
            }
            await edits.set(batchKey(id, batches), batch);
            batches++;
            await writeSession();
        });
    }

    let touching = null;
    return {
        id,
        /**
         * Start: hold this window's lock, and list the orphans to recover,
         * most recent first.
         * @returns {Promise<Session[]>}
         */
        async start() {
            if (locks) locks.hold(lockName(id));
            else touching = setInterval(() => { if (written) void serial(writeSession); }, TOUCH_MS);
            const all = /** @type {Session[]} */ ((await Promise.all(
                (await sessions.getAllKeys()).map((k) => sessions.get(k)))).filter(Boolean));
            const held = locks ? await locks.held() : null;
            return all
                .filter((s) => s.id !== id && (held ? !held.has(lockName(s.id)) : now() - s.updated > STALE_MS))
                .sort((a, b) => b.updated - a.updated);
        },
        /**
         * Take an orphan over: its text rebuilt from base and deltas; its
         * stored copy dropped (this window journals it from now on).
         * @param {Session} session
         */
        async adopt(session) {
            let text = session.text;
            for (let n = 0; n < session.batches; n++) {
                const batch = (await edits.get(batchKey(session.id, n))) || [];
                for (const e of batch) text = text.slice(0, e.at) + e.inserted + text.slice(e.at + e.removed.length);
            }
            await serial(() => dropStored(session.id, session.batches));
            return { name: session.name, text, encoding: session.encoding, eol: session.eol, handle: session.handle || null };
        },
        /**
         * A new base: a document shown or saved. A clean one drops what was
         * stored; an unsaved one (recovered) is written at once.
         * @param {Base} next
         */
        base(next) {
            if (timer) { clearTimer(timer); timer = null; }
            queue = [];
            const count = batches;
            const had = written;
            base = { ...next };
            written = false;
            batches = 0;
            void serial(async () => {
                if (had) await dropStored(id, count);
                if (next.dirty) {
                    written = true;
                    await writeSession();
                }
            });
        },
        /**
         * A delta of the text since the base.
         * @param {{at: number, removed: string, inserted: string}} edit
         */
        edit(edit) {
            if (!base) return;
            queue.push({ at: edit.at, removed: edit.removed, inserted: edit.inserted });
            if (timer) clearTimer(timer);
            timer = setTimer(() => { timer = null; void flush(); }, FLUSH_MS);
        },
        /** Back at the saved text: nothing to recover any more. */
        clean() {
            if (timer) { clearTimer(timer); timer = null; }
            queue = [];
            if (!base) return;
            // The text is the base again only if the base was the saved text.
            if (base.dirty) return;
            const count = batches;
            const had = written;
            written = false;
            batches = 0;
            if (had) void serial(() => dropStored(id, count));
        },
        /** Write what waits now (leaving, updating). */
        flush,
        /** Stop (tests, an embedding host). */
        stop() {
            if (touching) clearInterval(touching);
            if (timer) clearTimer(timer);
        }
    };
}
