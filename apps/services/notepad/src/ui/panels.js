// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The two bars that open above the text: Find (and
 * Replace, the same bar with its second field shown) and Go to line.
 * Plain forms: Enter finds next (Shift+Enter previous), Enter in the
 * replace field replaces; the controller binds Escape and F3. The bars
 * only report — the controller searches, replaces and moves the caret.
 *
 * @module notepad/ui/panels
 */
import { h, iconButton } from './dom.js';

/**
 * @param {{id: string, t: (k: string, p?: object) => string,
 *   onFind: (backwards: boolean) => void, onReplace: () => void, onReplaceAll: () => void,
 *   onGoto: (line: number) => void, onClose: () => void, onQuery?: () => void}} opts
 *   `onQuery`: the search text or its case setting changed (live marks).
 */
export function createPanels({ id, t, onFind, onReplace, onReplaceAll, onGoto, onClose, onQuery }) {
    // ── Find / Replace ──────────────────────────────────────────────────
    const query = /** @type {HTMLInputElement} */ (h('input', {
        class: 'awn-field', id: `${id}-find`, type: 'search', autocomplete: 'off', spellcheck: 'false'
    }));
    const replacement = /** @type {HTMLInputElement} */ (h('input', {
        class: 'awn-field', id: `${id}-replace`, type: 'text', autocomplete: 'off', spellcheck: 'false'
    }));
    const matchCase = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id: `${id}-case` }));
    const findLabel = h('label', { for: query.id });
    const replaceLabel = h('label', { for: replacement.id });
    const caseLabel = h('label', { class: 'awn-check', for: matchCase.id });
    const prev = iconButton('prev', 'prev');
    const next = iconButton('next', 'next');
    const replaceOne = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'awn-btn awn-btn--text', 'data-action': 'replaceOne' }));
    const replaceAllBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'awn-btn awn-btn--text', 'data-action': 'replaceAll' }));
    const closeFind = iconButton('close', 'close');
    const findMsg = h('p', { class: 'awn-panel-msg', id: `${id}-find-msg` });
    query.setAttribute('aria-describedby', findMsg.id);
    const replaceRow = h('div', { class: 'awn-panel-row' }, [replaceLabel, replacement, replaceOne, replaceAllBtn]);
    const find = /** @type {HTMLFormElement} */ (h('form', { class: 'awn-panel', role: 'search', hidden: true }, [
        h('div', { class: 'awn-panel-row' }, [findLabel, query, prev, next, h('span', { class: 'awn-check-wrap' }, [matchCase, caseLabel]), closeFind]),
        replaceRow,
        findMsg
    ]));
    find.addEventListener('submit', (e) => { e.preventDefault(); onFind(false); });
    query.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onFind(e.shiftKey); }
    });
    replacement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onReplace(); }
    });
    query.addEventListener('input', () => { findMsg.textContent = ''; if (onQuery) onQuery(); });
    matchCase.addEventListener('change', () => { if (onQuery) onQuery(); });
    prev.addEventListener('click', () => onFind(true));
    next.addEventListener('click', () => onFind(false));
    replaceOne.addEventListener('click', () => onReplace());
    replaceAllBtn.addEventListener('click', () => onReplaceAll());
    closeFind.addEventListener('click', () => onClose());

    // ── Go to line ──────────────────────────────────────────────────────
    const line = /** @type {HTMLInputElement} */ (h('input', {
        class: 'awn-field awn-line', id: `${id}-line`, type: 'text', inputmode: 'numeric', autocomplete: 'off', size: '6'
    }));
    const lineLabel = h('label', { for: line.id });
    const go = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'awn-btn awn-btn--text' }));
    const closeGoto = iconButton('close', 'close');
    const gotoMsg = h('p', { class: 'awn-panel-msg', id: `${id}-goto-msg` });
    line.setAttribute('aria-describedby', gotoMsg.id);
    const gotoForm = /** @type {HTMLFormElement} */ (h('form', { class: 'awn-panel', hidden: true }, [
        h('div', { class: 'awn-panel-row' }, [lineLabel, line, go, closeGoto]),
        gotoMsg
    ]));
    gotoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const n = Number.parseInt(line.value, 10);
        if (Number.isFinite(n) && n >= 1) onGoto(n);
        else line.select();
    });
    line.addEventListener('input', () => { gotoMsg.textContent = ''; });
    closeGoto.addEventListener('click', () => onClose());

    function label() {
        find.setAttribute('aria-label', t('find.label'));
        findLabel.textContent = t('find.find');
        replaceLabel.textContent = t('find.replace');
        caseLabel.textContent = t('find.matchCase');
        for (const [b, key] of /** @type {[HTMLElement, string][]} */ ([[prev, 'find.prev'], [next, 'find.next'], [closeFind, 'find.close'], [closeGoto, 'goto.close']])) {
            b.setAttribute('aria-label', t(key));
            b.setAttribute('title', t(key));
        }
        replaceOne.textContent = t('find.replaceOne');
        replaceAllBtn.textContent = t('find.replaceAll');
        gotoForm.setAttribute('aria-label', t('goto.label'));
        lineLabel.textContent = t('goto.line');
        go.textContent = t('goto.go');
    }
    label();

    return {
        elements: [find, gotoForm],
        label,
        /** The current search settings. */
        get query() { return query.value; },
        get replacement() { return replacement.value; },
        get matchCase() { return matchCase.checked; },
        /**
         * Show one bar (or none) and focus its first field.
         * @param {'find'|'replace'|'goto'|null} which
         * @param {{seed?: string, line?: number}} [o] `seed`: the selection to search; `line`: the current line.
         */
        show(which, o = {}) {
            find.hidden = which !== 'find' && which !== 'replace';
            replaceRow.hidden = which !== 'replace';
            gotoForm.hidden = which !== 'goto';
            findMsg.textContent = '';
            gotoMsg.textContent = '';
            if (which === 'find' || which === 'replace') {
                if (o.seed) query.value = o.seed;
                query.focus();
                query.select();
            } else if (which === 'goto') {
                line.value = String(o.line || 1);
                line.focus();
                line.select();
            }
        },
        /** @param {'find'|'goto'} which @param {string} text */
        message(which, text) {
            (which === 'goto' ? gotoMsg : findMsg).textContent = text;
        },
        /** Whether focus is in one of the bars. */
        contains(/** @type {Node|null} */ node) { return !!node && (find.contains(node) || gotoForm.contains(node)); },
        /** Focus the find field again (after a match was selected in the text). */
        refocus() { if (!find.hidden) query.focus(); }
    };
}
