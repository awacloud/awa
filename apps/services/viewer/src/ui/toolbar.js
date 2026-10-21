// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The viewer toolbar — a WAI-ARIA toolbar (one tab stop,
 * arrow keys move between controls, Home / End jump to the ends). Inside
 * the page field and the zoom menu the arrow keys keep their own meaning.
 *
 * Every icon button is named by `aria-label` and shows the same text as a
 * tooltip (`title`); the toolbar only renders and reports — the controller
 * decides what each action does.
 *
 * @module viewer/ui/toolbar
 */
import { h, icon } from '../render/dom.js';
import { ZOOM_STEPS } from './stage.js';

/**
 * @typedef {'open'|'close'|'prev'|'next'|'zoomOut'|'zoomIn'|'fitWidth'|'fullscreen'|'download'|'info'|'help'} Action
 */

/**
 * @param {{id: string, t: (k: string, p?: object) => string,
 *   number: (v: number, o?: Intl.NumberFormatOptions) => string,
 *   onAction: (a: Action) => void, onPage: (page: number) => void,
 *   onZoom: (zoom: number | 'fit') => void, help?: boolean}} opts `help`: show
 *   the Help button (the host has a help page to open).
 */
export function createToolbar({ id, t, number, onAction, onPage, onZoom, help = false }) {
    /** @param {Action} action @param {keyof import('../render/dom.js').ICONS} glyph */
    const button = (action, glyph) => h('button', {
        type: 'button', class: 'awv-btn awv-btn--icon', 'data-action': action, tabindex: '-1'
    }, icon(glyph));

    const btn = {
        open: button('open', 'open'),
        close: button('close', 'close'),
        prev: button('prev', 'prev'),
        next: button('next', 'next'),
        zoomOut: button('zoomOut', 'zoomOut'),
        zoomIn: button('zoomIn', 'zoomIn'),
        fitWidth: button('fitWidth', 'fitWidth'),
        fullscreen: button('fullscreen', 'fullscreen'),
        download: button('download', 'download'),
        info: button('info', 'info'),
        help: button('help', 'help')
    };
    btn.info.setAttribute('aria-expanded', 'false');
    btn.info.setAttribute('aria-controls', `${id}-info`);

    const pageInput = /** @type {HTMLInputElement} */ (h('input', {
        class: 'awv-field awv-page-input', id: `${id}-page`, type: 'text', inputmode: 'numeric',
        autocomplete: 'off', size: '3', tabindex: '-1', value: '1'
    }));
    const pageTotal = h('span', { class: 'awv-page-total', id: `${id}-page-total` });
    pageInput.setAttribute('aria-describedby', pageTotal.id);
    const zoomSelect = /** @type {HTMLSelectElement} */ (h('select', {
        class: 'awv-field awv-zoom', id: `${id}-zoom`, tabindex: '-1'
    }));

    const pager = h('div', { class: 'awv-group awv-group--pager' }, [btn.prev, pageInput, pageTotal, btn.next]);
    // Groups that only make sense with a document open: hidden, not merely
    // disabled, on the empty state.
    const docGroups = [
        h('div', { class: 'awv-group' }, [btn.zoomOut, zoomSelect, btn.zoomIn, btn.fitWidth]),
        h('div', { class: 'awv-group awv-group--end' }, [btn.fullscreen, btn.download, btn.info])
    ];
    // Help: always there (the empty state too), when the host has a help page.
    const helpGroup = h('div', { class: 'awv-group awv-group--help', hidden: !help }, [btn.help]);
    const bar = h('div', { class: 'awv-bar', role: 'toolbar' }, [
        h('div', { class: 'awv-group' }, [btn.open, btn.close]),
        pager,
        ...docGroups,
        helpGroup
    ]);

    /** The controls in tab order, for the roving tab stop. */
    const controls = () => /** @type {HTMLElement[]} */ (
        [...bar.querySelectorAll('button, input, select')].filter((c) =>
            !(/** @type {HTMLButtonElement} */ (c).disabled) && !c.closest('[hidden]')));

    /** @param {HTMLElement} target */
    function rove(target) {
        for (const c of controls()) c.tabIndex = c === target ? 0 : -1;
    }

    bar.addEventListener('click', (e) => {
        const b = /** @type {HTMLElement} */ (e.target).closest('button[data-action]');
        if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
        rove(/** @type {HTMLElement} */ (b));
        onAction(/** @type {Action} */ (b.dataset.action));
    });
    bar.addEventListener('focusin', (e) => rove(/** @type {HTMLElement} */ (e.target)));
    bar.addEventListener('keydown', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const inField = target === pageInput || target === zoomSelect;
        if (inField && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) return;
        const list = controls();
        const at = list.indexOf(target);
        let next = -1;
        if (e.key === 'ArrowRight') next = (at + 1) % list.length;
        else if (e.key === 'ArrowLeft') next = (at - 1 + list.length) % list.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = list.length - 1;
        if (next < 0) return;
        e.preventDefault();
        e.stopPropagation();
        list[next].focus();
    });

    pageInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const n = Number.parseInt(pageInput.value, 10);
        if (Number.isFinite(n)) onPage(n - 1);
    });
    pageInput.addEventListener('change', () => {
        const n = Number.parseInt(pageInput.value, 10);
        if (Number.isFinite(n)) onPage(n - 1);
    });
    zoomSelect.addEventListener('change', () => {
        onZoom(zoomSelect.value === 'fit' ? 'fit' : Number(zoomSelect.value));
    });

    /** Re-render the labels in the current locale. */
    function label() {
        bar.setAttribute('aria-label', t('toolbar.label'));
        for (const [action, b] of Object.entries(btn)) {
            const text = t(`toolbar.${action}`);
            b.setAttribute('aria-label', text);
            b.setAttribute('title', text);
        }
        pageInput.setAttribute('aria-label', t('toolbar.page'));
        zoomSelect.setAttribute('aria-label', t('toolbar.zoom'));
        // Percentages and "Fit to width" follow the locale.
        zoomOptions(shownZoom, true);
    }

    /** The zoom the menu shows: rebuilding it on every update would close an open menu. */
    let shownZoom = 1;

    /**
     * @param {number} zoom
     * @param {boolean} [force] rebuild even when the zoom is unchanged
     */
    function zoomOptions(zoom, force = false) {
        if (!force && zoom === shownZoom) return;
        shownZoom = zoom;
        const steps = ZOOM_STEPS.includes(zoom) ? ZOOM_STEPS : [...ZOOM_STEPS, zoom].sort((a, b) => a - b);
        const pct = (z) => number(z, { style: 'percent', maximumFractionDigits: 0 });
        zoomSelect.replaceChildren(
            ...steps.map((z) => h('option', { value: String(z), text: pct(z), selected: z === zoom })),
            h('option', { value: 'fit', text: t('toolbar.fitWidth') })
        );
    }

    label();
    rove(btn.open);

    return {
        element: bar,
        buttons: btn,
        label,
        /**
         * @param {{loaded: boolean, paged: boolean, page: number, count: number,
         *   zoom: number, fullscreen: boolean, info: boolean, fullscreenAvailable: boolean}} s
         */
        update(s) {
            btn.close.hidden = !s.loaded;
            for (const group of docGroups) group.hidden = !s.loaded;
            pager.hidden = !s.loaded || !s.paged;
            const held = document.activeElement;
            btn.prev.disabled = s.page <= 0;
            btn.next.disabled = s.page >= s.count - 1;
            // A pager button disabled under the keyboard would drop the
            // focus to the page: hand it to the other end of the pager.
            if ((held === btn.prev || held === btn.next) && /** @type {HTMLButtonElement} */ (held).disabled) {
                const other = held === btn.next ? btn.prev : btn.next;
                const target = other.disabled ? pageInput : other;
                rove(target);
                target.focus();
            }
            // Never overwrite digits being typed.
            if (document.activeElement !== pageInput) pageInput.value = String(s.page + 1);
            pageTotal.textContent = t('toolbar.of', { count: s.count });
            btn.fullscreen.hidden = !s.fullscreenAvailable;
            const fs = s.fullscreen ? 'exitFullscreen' : 'fullscreen';
            btn.fullscreen.replaceChildren(icon(fs));
            btn.fullscreen.setAttribute('aria-label', t(`toolbar.${fs}`));
            btn.fullscreen.setAttribute('title', t(`toolbar.${fs}`));
            btn.info.setAttribute('aria-expanded', String(s.info));
            zoomOptions(s.zoom);
            // A disabled control cannot hold the tab stop.
            const list = controls();
            if (!list.some((c) => c.tabIndex === 0) && list[0]) list[0].tabIndex = 0;
        }
    };
}
