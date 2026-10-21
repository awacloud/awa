// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The status bar, like Windows Notepad's: caret position,
 * length, text size, and the two menus that decide how the file is
 * written — its line endings and its encoding.
 *
 * @module notepad/ui/status
 */
import { h } from './dom.js';
import { ENCODINGS, EOLS } from '../core/text.js';

/**
 * @param {{id: string, t: (k: string, p?: object) => string,
 *   tn: (k: string, n: number, p?: object) => string,
 *   number: (v: number, o?: Intl.NumberFormatOptions) => string,
 *   onEol: (eol: import('../core/text.js').Eol) => void,
 *   onEncoding: (encoding: import('../core/text.js').Encoding) => void}} opts
 */
export function createStatus({ id, t, tn, number, onEol, onEncoding }) {
    const position = h('span', { class: 'awn-status-item awn-status-pos' });
    const chars = h('span', { class: 'awn-status-item' });
    const zoom = h('span', { class: 'awn-status-item' });
    const eol = /** @type {HTMLSelectElement} */ (h('select', { class: 'awn-field awn-status-select', id: `${id}-eol` }));
    const encoding = /** @type {HTMLSelectElement} */ (h('select', { class: 'awn-field awn-status-select', id: `${id}-encoding` }));
    const eolLabel = h('label', { class: 'awn-visually-hidden', for: eol.id });
    const encodingLabel = h('label', { class: 'awn-visually-hidden', for: encoding.id });
    // A notice: an opening's progress (with Cancel), or a note about the document.
    const noticeText = h('span', { class: 'awn-status-notice-text' });
    const noticeAction = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'awn-btn awn-btn--text awn-status-action', hidden: true }));
    const notice = h('span', { class: 'awn-status-item awn-status-notice', role: 'status', hidden: true }, [noticeText, noticeAction]);
    /** @type {(() => void)|null} */
    let onNoticeAction = null;
    noticeAction.addEventListener('click', () => { if (onNoticeAction) onNoticeAction(); });
    const element = h('div', { class: 'awn-status' }, [
        notice, position, chars, zoom,
        h('span', { class: 'awn-status-item awn-status-end' }, [eolLabel, eol]),
        h('span', { class: 'awn-status-item' }, [encodingLabel, encoding])
    ]);
    eol.addEventListener('change', () => onEol(/** @type {any} */ (eol.value)));
    encoding.addEventListener('change', () => onEncoding(/** @type {any} */ (encoding.value)));

    /** @type {{line: number, col: number, length: number, zoom: number, eol: string, encoding: string}} */
    let shown = { line: 1, col: 1, length: 0, zoom: 1, eol: 'lf', encoding: 'utf-8' };

    function label() {
        element.setAttribute('aria-label', t('status.label'));
        eolLabel.textContent = t('status.eol');
        encodingLabel.textContent = t('status.encoding');
        eol.replaceChildren(...EOLS.map((e) => h('option', { value: e, text: t(`eol.${e}`) })));
        encoding.replaceChildren(...ENCODINGS.map((e) => h('option', { value: e, text: t(`encoding.${e}`) })));
        update(shown);
    }

    /** @param {typeof shown} s */
    function update(s) {
        shown = s;
        position.textContent = t('status.position', { line: number(s.line), col: number(s.col) });
        chars.textContent = tn('status.chars', s.length, { count: number(s.length) });
        zoom.textContent = number(s.zoom, { style: 'percent', maximumFractionDigits: 0 });
        zoom.setAttribute('title', t('status.zoom', { zoom: zoom.textContent }));
        if (eol.value !== s.eol) eol.value = s.eol;
        if (encoding.value !== s.encoding) encoding.value = s.encoding;
    }

    /**
     * Show a notice (or none, with `null`); with `action`, a button beside it.
     * @param {string|null} text
     * @param {{label: string, run: () => void}} [action]
     */
    function note(text, action) {
        notice.hidden = text === null;
        noticeText.textContent = text || '';
        noticeAction.hidden = !action;
        noticeAction.textContent = action ? action.label : '';
        onNoticeAction = action ? action.run : null;
    }

    label();
    return { element, label, update, note, selects: { eol, encoding } };
}
