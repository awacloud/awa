// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The notepad toolbar — a WAI-ARIA toolbar (one tab stop,
 * arrow keys move between controls, Home / End jump to the ends), like the
 * viewer's. Every icon button is named by `aria-label` with the same text
 * as a tooltip (`title`, the shortcut included); the toolbar only renders
 * and reports — the controller decides what each action does. The document
 * name sits at its end.
 *
 * @module notepad/ui/toolbar
 */
import { h, iconButton } from './dom.js';

/**
 * @typedef {'new'|'open'|'save'|'saveAs'|'find'|'replace'|'goto'|'wrap'|'zoomOut'|'zoomIn'|'rename'|'help'} Action
 */

/** @type {Action[][]} The buttons, by group. */
const GROUPS = [['new', 'open', 'save', 'saveAs'], ['find', 'replace', 'goto'], ['wrap', 'zoomOut', 'zoomIn']];

/**
 * @param {{t: (k: string, p?: object) => string, onAction: (a: Action) => void, help?: boolean}} opts
 *   `help`: a Help button (the host has a help page to open).
 */
export function createToolbar({ t, onAction, help = false }) {
    /** @type {Record<string, HTMLButtonElement>} */
    const btn = {};
    const groups = [...GROUPS, ...(help ? [/** @type {Action[]} */ (['help'])] : [])].map((actions) => h('div', { class: 'awn-group' }, actions.map((a) => {
        btn[a] = iconButton(a, a);
        btn[a].tabIndex = -1;
        return btn[a];
    })));
    btn.wrap.setAttribute('aria-pressed', 'false');
    // The document's name: a button that turns into a field to rename it.
    const name = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'awn-name', 'data-action': 'rename' }));
    name.tabIndex = -1;
    const nameText = h('span', { class: 'awn-name-text' });
    const dirtyMark = h('span', { class: 'awn-dirty', 'aria-hidden': 'true', text: '●' });
    const dirtyText = h('span', { class: 'awn-visually-hidden' });
    name.append(dirtyMark, nameText, dirtyText);
    const nameField = /** @type {HTMLInputElement} */ (h('input', {
        type: 'text', class: 'awn-field awn-name-field', hidden: true, spellcheck: 'false', autocomplete: 'off'
    }));
    const bar = h('div', { class: 'awn-bar', role: 'toolbar' }, [...groups, name, nameField]);
    /** Save writes to the file, or (without the File System Access API) downloads a copy. */
    let saveMode = 'save';
    let shownName = '';

    /** The controls in order, for the roving tab stop. */
    const controls = () => /** @type {HTMLButtonElement[]} */ (
        [...bar.querySelectorAll('button')].filter((c) => !c.disabled && !c.closest('[hidden]')));

    /** @param {HTMLElement} target */
    function rove(target) {
        for (const c of controls()) c.tabIndex = c === target ? 0 : -1;
    }

    bar.addEventListener('click', (e) => {
        const b = /** @type {HTMLElement} */ (e.target).closest('button[data-action]');
        if (!b) return;
        rove(/** @type {HTMLElement} */ (b));
        onAction(/** @type {Action} */ (/** @type {HTMLElement} */ (b).dataset.action));
    });
    bar.addEventListener('focusin', (e) => {
        if (/** @type {HTMLElement} */ (e.target).matches('button')) rove(/** @type {HTMLElement} */ (e.target));
    });
    bar.addEventListener('keydown', (e) => {
        const list = controls();
        const at = list.indexOf(/** @type {HTMLButtonElement} */ (e.target));
        if (at < 0) return;
        let next = -1;
        if (e.key === 'ArrowRight') next = (at + 1) % list.length;
        else if (e.key === 'ArrowLeft') next = (at - 1 + list.length) % list.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = list.length - 1;
        if (next < 0) return;
        e.preventDefault();
        list[next].focus();
    });

    /** Re-render the labels in the current locale. */
    function label() {
        bar.setAttribute('aria-label', t('toolbar.label'));
        for (const [action, b] of Object.entries(btn)) {
            const key = saveMode === 'download' && (action === 'save' || action === 'saveAs')
                ? `toolbar.${action === 'save' ? 'download' : 'downloadAs'}` : `toolbar.${action}`;
            const text = t(key);
            b.setAttribute('aria-label', text);
            b.setAttribute('title', text);
        }
        dirtyText.textContent = ' ' + t('doc.modified');
        nameField.setAttribute('aria-label', t('doc.nameField'));
        const rename = t('toolbar.rename', { name: shownName });
        name.setAttribute('title', rename);
        name.setAttribute('aria-label', rename + (dirtyMark.hidden ? '' : ` (${t('doc.modified')})`));
    }

    /** @type {((next: string|null) => void)|null} */
    let onNamed = null;
    /** @param {string|null} value */
    function endEdit(value) {
        if (nameField.hidden) return;
        nameField.hidden = true;
        name.hidden = false;
        const done = onNamed;
        onNamed = null;
        if (done) done(value);
    }
    nameField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); endEdit(nameField.value); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endEdit(null); }
    });
    nameField.addEventListener('blur', () => endEdit(nameField.value));

    label();
    rove(btn.new);

    return {
        element: bar,
        buttons: btn,
        label,
        /** @param {{name: string, dirty: boolean, wrap: boolean, panel: string|null}} s */
        update(s) {
            shownName = s.name;
            nameText.textContent = s.name;
            dirtyMark.hidden = !s.dirty;
            dirtyText.hidden = !s.dirty;
            const rename = t('toolbar.rename', { name: s.name });
            name.setAttribute('title', rename);
            name.setAttribute('aria-label', rename + (s.dirty ? ` (${t('doc.modified')})` : ''));
            btn.wrap.setAttribute('aria-pressed', String(s.wrap));
            btn.find.setAttribute('aria-pressed', String(s.panel === 'find'));
            btn.replace.setAttribute('aria-pressed', String(s.panel === 'replace'));
            btn.goto.setAttribute('aria-pressed', String(s.panel === 'goto'));
        },
        /**
         * Edit the name in place: the field takes the button's place, Enter
         * or leaving it answers the new name, Escape `null`.
         * @param {string} value The name to start from.
         * @param {(next: string|null) => void} done
         */
        editName(value, done) {
            onNamed = done;
            name.hidden = true;
            nameField.hidden = false;
            nameField.value = value;
            nameField.focus();
            // Select the name without its extension, as file managers do.
            const dot = value.lastIndexOf('.');
            nameField.setSelectionRange(0, dot > 0 ? dot : value.length);
        },
        /** @param {'save'|'download'} mode */
        setSaveMode(mode) {
            if (mode === saveMode) return;
            saveMode = mode;
            label();
        }
    };
}
