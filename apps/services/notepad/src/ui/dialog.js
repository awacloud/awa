// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The notepad's one question box ("Save the changes?",
 * "This is not a text file"): a native modal `<dialog>` — focus is trapped
 * and Escape cancels for free; fw `focus` stashes the focus before and
 * restores it after. `window.confirm` / `alert` are not an option: fw
 * sanity `base` blocks them on the standalone page.
 *
 * @module notepad/ui/dialog
 */
import { h } from './dom.js';

/**
 * @typedef {{value: string, label: string, primary?: boolean}} Choice
 */

/**
 * @param {{id: string, focus: {stash: () => {restore: () => void}}}} opts `focus`: fw `focus`.
 */
export function createDialog({ id, focus }) {
    const title = h('h2', { class: 'awn-dialog-title', id: `${id}-dialog-title` });
    const message = h('p', { class: 'awn-dialog-msg', id: `${id}-dialog-msg` });
    const actions = h('div', { class: 'awn-dialog-actions' });
    const dialog = /** @type {HTMLDialogElement} */ (h('dialog', {
        class: 'awn-dialog', 'aria-labelledby': title.id, 'aria-describedby': message.id
    }, [title, message, actions]));

    /** @type {((value: string) => void)|null} */
    let settle = null;
    /** @type {{restore: () => void}|null} */
    let stashed = null;

    /** @param {string} value */
    function finish(value) {
        if (!settle) return;
        const done = settle;
        settle = null;
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        dialog.removeAttribute('open');
        if (stashed) stashed.restore();
        stashed = null;
        done(value);
    }
    // Escape (the native `cancel`) is always the "cancel" answer.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish('cancel'); });

    return {
        element: dialog,
        /** Whether a question is waiting for its answer. */
        get open() { return settle !== null; },
        /**
         * Ask a question; resolves with the chosen value (`cancel` on Escape).
         * @param {{title: string, message: string, choices: Choice[]}} q
         * @returns {Promise<string>}
         */
        ask(q) {
            finish('cancel');
            title.textContent = q.title;
            message.textContent = q.message;
            const buttons = q.choices.map((c) => {
                const b = h('button', { type: 'button', class: c.primary ? 'awn-btn awn-btn--primary' : 'awn-btn awn-btn--text', text: c.label });
                b.addEventListener('click', () => finish(c.value));
                return b;
            });
            actions.replaceChildren(...buttons);
            stashed = focus.stash();
            return new Promise((resolve) => {
                settle = resolve;
                if (typeof dialog.showModal === 'function') {
                    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
                } else {
                    dialog.setAttribute('open', '');
                }
                (buttons.find((b) => b.classList.contains('awn-btn--primary')) || buttons[0])?.focus();
            });
        },
        /** Answer the open question (tests, `destroy()`). @param {string} value */
        answer(value) { finish(value); }
    };
}
