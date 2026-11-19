// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A short-lived card over the document, the visual echo of an
 * action that changes nothing on screen (a copy to the clipboard). It is
 * `aria-hidden`: the same words reach a screen reader through
 * `a11y.announce`, and a second live region would speak them twice.
 *
 * One card at a time: a new message replaces the current one and restarts
 * its timer. A `busy` message stays until the next one.
 *
 * @module oview/ui/toast
 */
import { h } from '../render/dom.js';

/** How long a settled message stays, in milliseconds. */
export const TOAST_MS = { done: 3000, error: 6000 };

/**
 * @typedef {'busy'|'done'|'error'} ToastTone
 */

/**
 * @param {{id: string, ms?: {done: number, error: number}}} opts `ms`
 *   overrides {@link TOAST_MS} (tests).
 * @returns {{element: HTMLElement, show: (text: string, tone: ToastTone) => void,
 *   hide: () => void, destroy: () => void}}
 */
export function createToast({ id, ms = TOAST_MS }) {
    const text = h('p', { class: 'awv-toast-text' });
    const element = h('div', {
        class: 'awv-toast', id: `${id}-toast`, 'aria-hidden': 'true', 'data-tone': 'busy', hidden: true
    }, [text]);
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer = null;

    function clear() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    }

    function hide() {
        clear();
        element.hidden = true;
    }

    /**
     * @param {string} message
     * @param {ToastTone} tone
     */
    function show(message, tone) {
        clear();
        text.textContent = message;
        element.dataset.tone = tone;
        element.hidden = false;
        if (tone !== 'busy') timer = setTimeout(hide, ms[tone]);
    }

    return {
        element, show, hide,
        destroy() { hide(); element.remove(); }
    };
}
