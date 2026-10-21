// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The notepad's own undo / redo history, as a list of edits
 * (deltas): where, what was removed, what was inserted, and the selection
 * before and after.
 *
 * Why its own: the browser's undo stack of a textarea is wiped by any edit
 * made from script (`setRangeText`, `value =`), so Insert date, Replace and
 * Replace all made Ctrl+Z do nothing at all; and fw sanity `base` blocks
 * `document.execCommand`, the one native way to keep it. The same deltas
 * feed the recovery journal (`journal.js`): the text is its base plus its
 * edits.
 *
 * Typing coalesces: characters typed one after the other (no line break in
 * between, no pause over two seconds) are one step; so are characters
 * deleted one after the other. Everything else is a step of its own.
 *
 * Pure: no DOM; the controller applies what `undo` / `redo` return.
 *
 * @module notepad/core/history
 */

/**
 * @typedef {object} Edit
 * @property {number} at Offset of the change in the text before it.
 * @property {string} removed The text the change removed (at `at`).
 * @property {string} inserted The text it put there.
 * @property {[number, number]} before Selection before the change.
 * @property {[number, number]} after Selection after the change.
 * @property {number} [time] When it was made (ms), for coalescing.
 * @property {'type'|'delete'|'other'} [kind] What coalesces with what.
 */

/** Typing paused longer than this starts a new step. */
export const COALESCE_MS = 2000;
/** The history keeps at most this many steps (the oldest go first). */
export const MAX_STEPS = 500;

/**
 * Apply an edit to a text.
 * @param {string} text
 * @param {{at: number, removed: string, inserted: string}} edit
 */
export function apply(text, edit) {
    return text.slice(0, edit.at) + edit.inserted + text.slice(edit.at + edit.removed.length);
}

/**
 * The edit that undoes `edit`.
 * @param {Edit} edit
 * @returns {Edit}
 */
export function invert(edit) {
    return { at: edit.at, removed: edit.inserted, inserted: edit.removed, before: edit.after, after: edit.before };
}

/**
 * The one edit that turns `before` into `after` (common start and end kept
 * out). O(length) — for the rare cases where the change is not known.
 * @param {string} before
 * @param {string} after
 * @returns {{at: number, removed: string, inserted: string}}
 */
export function diff(before, after) {
    const max = Math.min(before.length, after.length);
    let start = 0;
    while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
    let end = 0;
    while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
    return { at: start, removed: before.slice(start, before.length - end), inserted: after.slice(start, after.length - end) };
}

/** May `next` extend `last` as one step? @param {Edit} last @param {Edit} next */
function joins(last, next) {
    if (!last.kind || last.kind !== next.kind || last.kind === 'other') return false;
    if ((next.time ?? 0) - (last.time ?? 0) > COALESCE_MS) return false;
    if (next.kind === 'type') {
        return last.removed === '' && next.removed === '' && !next.inserted.includes('\n')
            && !last.inserted.endsWith('\n') && next.at === last.at + last.inserted.length;
    }
    // Deleting backwards (Backspace) or forwards (Delete), one after the other.
    return last.inserted === '' && next.inserted === ''
        && (next.at + next.removed.length === last.at || next.at === last.at);
}

/** @param {Edit} last @param {Edit} next @returns {Edit} */
function join(last, next) {
    if (next.kind === 'type') return { ...last, inserted: last.inserted + next.inserted, after: next.after, time: next.time };
    if (next.at + next.removed.length === last.at) {
        return { ...last, at: next.at, removed: next.removed + last.removed, after: next.after, time: next.time };
    }
    return { ...last, removed: last.removed + next.removed, after: next.after, time: next.time };
}

/**
 * An undo / redo history.
 * @param {{max?: number}} [opts]
 */
export function createHistory({ max = MAX_STEPS } = {}) {
    /** @type {Edit[]} */
    let done = [];
    /** @type {Edit[]} */
    let undone = [];
    /** How many steps were dropped from the bottom (the saved mark counts them). */
    let dropped = 0;
    /** The position (dropped + done.length) where the text was last saved; -1: unreachable. */
    let savedAt = 0;
    let sealed = false;

    const position = () => dropped + done.length;

    return {
        /**
         * Record an edit the text just received.
         * @param {Edit} edit
         */
        record(edit) {
            if (edit.removed === '' && edit.inserted === '') return;
            // A step redone away from the saved point can never reach it again.
            if (savedAt > position()) savedAt = -1;
            undone = [];
            const last = done[done.length - 1];
            if (last && !sealed && position() !== savedAt && joins(last, edit)) {
                done[done.length - 1] = join(last, edit);
            } else {
                done.push(edit);
                if (done.length > max) {
                    done.shift();
                    dropped++;
                }
            }
            sealed = false;
        },
        /** Close the current step: the next edit starts a new one (a caret move, a save). */
        seal() { sealed = true; },
        /** The edit that undoes the last step, or null. Apply it, then its `after` selection. */
        undo() {
            const edit = done.pop();
            if (!edit) return null;
            undone.push(edit);
            sealed = true;
            return invert(edit);
        },
        /** The edit that redoes the last undone step, or null. */
        redo() {
            const edit = undone.pop();
            if (!edit) return null;
            done.push(edit);
            sealed = true;
            return edit;
        },
        get canUndo() { return done.length > 0; },
        get canRedo() { return undone.length > 0; },
        /** The text as it stands is the saved one. */
        markSaved() { savedAt = position(); sealed = true; },
        /** Whether the history stands where the text was last saved. */
        get atSaved() { return savedAt === position(); },
        /** Forget everything (a new document); the text as it stands is the saved one unless `dirty`. */
        reset(dirty = false) {
            done = [];
            undone = [];
            dropped = 0;
            savedAt = dirty ? -1 : 0;
            sealed = false;
        },
        /** The steps since the start, oldest first (the journal's deltas). */
        get edits() { return done.slice(); }
    };
}
