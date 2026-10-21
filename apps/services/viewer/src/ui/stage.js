// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The stage: presents one View in the viewer's scroll box and
 * owns zoom, the current page and lazy page drawing.
 *
 * - **flow** — the document element, scaled with CSS `zoom`.
 * - **paged** — one placeholder per page, sized at the current zoom; a page
 *   draws when it comes near the viewport and is released when it moves far
 *   away (an `IntersectionObserver` on the scroll box), so a 500-page PDF
 *   holds a handful of canvases, never 500.
 * - **sheets** — the active sheet's grid, scaled like flow, and a tab list.
 *
 * @module viewer/ui/stage
 */
import { h } from '../render/dom.js';

/** Zoom presets offered by the toolbar (fractions). */
export const ZOOM_STEPS = Object.freeze([0.25, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]);
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 6;

/** Gap between pages and around them, in CSS px (matches `--awv-gap`). */
const GAP = 24;
/** At most this many pages draw at the same time. */
export const MAX_DRAWS = 2;

/**
 * Clamp and round a zoom factor to 2 decimals.
 * @param {number} z
 */
export function clampZoom(z) {
    return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
}

/**
 * The next preset strictly above (`dir > 0`) or below the current zoom.
 * @param {number} zoom
 * @param {1|-1} dir
 */
export function stepZoom(zoom, dir) {
    if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom + 1e-3) ?? ZOOM_MAX;
    return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 1e-3) ?? ZOOM_MIN;
}

/**
 * @param {{scroller: HTMLElement, t: (k: string, p?: object) => string,
 *   onPage: (page: number, count: number) => void,
 *   onDrawError?: (err: unknown) => void, onDrawn?: () => void}} opts
 */
export function createStage({ scroller, t, onPage, onDrawError, onDrawn }) {
    /** @type {import('../render/view.js').View|null} */
    let view = null;
    let zoom = 1;
    let current = 0;
    /** @type {HTMLElement|null} */
    let root = null;
    /** @type {{el: HTMLElement, page: import('../render/view.js').Page, drawn: number, failed: number, busy: Promise<void>|null}[]} */
    let slots = [];
    /** @type {Set<(typeof slots)[number]>} Pages waiting for a free draw. */
    const waiting = new Set();
    /** @type {IntersectionObserver|null} */
    let observer = null;
    /** @type {HTMLElement|null} */
    let tabs = null;
    let activeSheet = 0;
    let scrollQueued = false;

    function pageCount() {
        if (!view) return 0;
        if (view.kind === 'paged') return view.pages?.length || 0;
        if (view.kind === 'sheets') return view.sheets?.length || 0;
        return 1;
    }

    /**
     * Draw one slot at the current zoom unless it already is. A failed draw
     * is not retried at the same zoom (it would fail again, forever). A draw
     * that settles after its View was replaced reports nothing.
     */
    function draw(slot) {
        if (slot.drawn === zoom || slot.failed === zoom || slot.busy) return;
        // At most MAX_DRAWS pages draw at once (zoomed far out, a 500-page
        // PDF has every page "near"): the others wait, nearest first.
        if (slots.filter((s) => s.busy).length >= MAX_DRAWS) {
            waiting.add(slot);
            return;
        }
        waiting.delete(slot);
        const target = zoom;
        const live = () => slots.includes(slot);
        slot.busy = Promise.resolve()
            .then(() => slot.page.draw(slot.el, target))
            .then(() => {
                slot.drawn = target;
                slot.failed = 0;
                slot.el.querySelector(':scope > .awv-page-failed')?.remove();
                if (live() && onDrawn) onDrawn();
            })
            .catch((err) => {
                slot.failed = target;
                if (!live()) return;
                // Honest reporting: never a silent blank page. Say it on the
                // page, and count it in the View's omissions (Details).
                if (!slot.el.querySelector(':scope > .awv-page-failed')) {
                    const note = slot.el.ownerDocument.createElement('p');
                    note.className = 'awv-page-failed';
                    note.textContent = t('error.pageFailed');
                    slot.el.append(note);
                    const failed = view?.omissions.find((o) => o.code === 'page/failed');
                    if (failed) failed.count++;
                    else view?.omissions.push({ code: 'page/failed', count: 1 });
                }
                if (onDrawError) onDrawError(err);
            })
            .finally(() => {
                slot.busy = null;
                if (!live()) return;
                // Scrolled away while drawing: free it now (release skipped a busy slot).
                if (slot.el.dataset.near !== 'true') release(slot);
                // Zoom moved while drawing: draw again.
                else if (slot.drawn !== zoom) draw(slot);
                pump();
            });
    }

    /** Start the waiting pages that are still near, nearest to the current page first. */
    function pump() {
        const ready = [...waiting].filter((s) => {
            const keep = slots.includes(s) && s.el.dataset.near === 'true' && s.drawn !== zoom && s.failed !== zoom;
            if (!keep) waiting.delete(s);
            return keep && !s.busy;
        });
        ready.sort((a, b) => Math.abs(slots.indexOf(a) - current) - Math.abs(slots.indexOf(b) - current));
        for (const s of ready) {
            if (slots.filter((x) => x.busy).length >= MAX_DRAWS) break;
            draw(s);
        }
    }

    /** Free a slot's drawing (it redraws when it comes back). */
    function release(slot) {
        waiting.delete(slot);
        if (slot.busy || slot.drawn === 0) return;
        slot.el.querySelector('.awv-page-surface')?.replaceChildren();
        slot.drawn = 0;
    }

    function sizeSlots() {
        for (const slot of slots) {
            slot.el.style.width = `${Math.round(slot.page.width * zoom)}px`;
            slot.el.style.height = `${Math.round(slot.page.height * zoom)}px`;
        }
    }

    function presentPaged() {
        const pages = view?.pages || [];
        const label = view?.pageLabel === 'slide' ? 'view.slide' : 'view.page';
        root = h('div', { class: 'awv-pages' });
        slots = pages.map((page, i) => {
            const el = h('div', {
                class: 'awv-page', role: 'group',
                'aria-label': t(label, { page: i + 1, count: pages.length }),
                'data-page': i + 1, 'data-near': 'false'
            }, h('div', { class: 'awv-page-surface' }));
            return { el, page, drawn: 0, failed: 0, busy: null };
        });
        root.append(...slots.map((s) => s.el));
        sizeSlots();
        if (typeof IntersectionObserver === 'function') {
            observer = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    const slot = slots[Number(/** @type {HTMLElement} */ (entry.target).dataset.page) - 1];
                    if (!slot) continue;
                    slot.el.dataset.near = String(entry.isIntersecting);
                    if (entry.isIntersecting) draw(slot);
                    else release(slot);
                }
            }, { root: scroller, rootMargin: '150% 0px' });
            for (const slot of slots) observer.observe(slot.el);
        } else {
            // No observer (old engines, test DOMs): draw the first pages only.
            for (const slot of slots.slice(0, 3)) { slot.el.dataset.near = 'true'; draw(slot); }
        }
    }

    function presentSheets() {
        const sheets = view?.sheets || [];
        root = h('div', { class: 'awv-sheetview' });
        tabs = h('div', { class: 'awv-tabs', role: 'tablist', 'aria-label': t('view.sheets') });
        sheets.forEach((sheet, i) => {
            const id = `${scroller.id}-sheet-${i}`;
            sheet.element.id = `${id}-panel`;
            sheet.element.setAttribute('role', 'tabpanel');
            sheet.element.setAttribute('aria-labelledby', `${id}-tab`);
            sheet.element.tabIndex = 0;
            tabs?.append(h('button', {
                type: 'button', class: 'awv-tab', role: 'tab', id: `${id}-tab`,
                'aria-controls': `${id}-panel`, 'aria-selected': 'false', tabindex: '-1', text: sheet.name
            }));
        });
        tabs.addEventListener('click', (e) => {
            const tab = /** @type {HTMLElement} */ (e.target).closest('[role=tab]');
            if (tab) selectSheet([...tabs.children].indexOf(tab));
        });
        tabs.addEventListener('keydown', (e) => {
            const n = sheets.length;
            const moves = { ArrowRight: activeSheet + 1, ArrowLeft: activeSheet - 1, Home: 0, End: n - 1 };
            if (!(e.key in moves)) return;
            e.preventDefault();
            selectSheet((moves[/** @type {keyof typeof moves} */ (e.key)] + n) % n, true);
        });
        selectSheet(0);
    }

    /**
     * @param {number} i
     * @param {boolean} [focus]
     */
    function selectSheet(i, focus = false) {
        const sheets = view?.sheets || [];
        if (!root || !tabs || !sheets[i]) return;
        activeSheet = i;
        [...tabs.children].forEach((tab, k) => {
            tab.setAttribute('aria-selected', String(k === i));
            tab.setAttribute('tabindex', k === i ? '0' : '-1');
        });
        // A sheet paints its rows when first shown.
        /** @type {{prepare?: () => void}} */ (sheets[i]).prepare?.();
        root.replaceChildren(sheets[i].element);
        if (focus) /** @type {HTMLElement} */ (tabs.children[i]).focus();
        current = i;
        onPage(i, sheets.length);
    }

    function trackPage() {
        if (scrollQueued || !view || view.kind !== 'paged') return;
        scrollQueued = true;
        requestAnimationFrame(() => {
            scrollQueued = false;
            const mid = scroller.scrollTop + scroller.clientHeight / 3;
            let idx = 0;
            for (let i = 0; i < slots.length; i++) {
                if (slots[i].el.offsetTop <= mid) idx = i; else break;
            }
            if (idx !== current) { current = idx; onPage(idx, slots.length); }
        });
    }
    scroller.addEventListener('scroll', trackPage, { passive: true });

    return {
        /** @returns {number} */
        get zoom() { return zoom; },
        get page() { return current; },
        get count() { return pageCount(); },
        get tabs() { return tabs; },

        /**
         * Show a View (replacing any previous one).
         * @param {import('../render/view.js').View} next
         * @param {HTMLElement} host Where the stage content goes.
         * @param {HTMLElement} tabsHost Where a sheet tab list goes.
         */
        present(next, host, tabsHost) {
            this.clear();
            view = next;
            current = 0;
            if (view.kind === 'paged') presentPaged();
            else if (view.kind === 'sheets') presentSheets();
            else root = h('div', { class: 'awv-flow' }, view.element);
            if (view.kind !== 'paged') root.style.setProperty('zoom', String(zoom));
            host.replaceChildren(root);
            tabsHost.replaceChildren(...(tabs ? [tabs] : []));
            tabsHost.hidden = !tabs;
            scroller.scrollTo({ top: 0, left: 0 });
            onPage(0, pageCount());
        },

        /** @param {number} z */
        setZoom(z) {
            const next = clampZoom(z);
            if (next === zoom) return zoom;
            // Keep the reading position: same relative scroll after resizing.
            const ratio = scroller.scrollHeight > 0 ? scroller.scrollTop / scroller.scrollHeight : 0;
            zoom = next;
            if (view?.kind === 'paged') {
                sizeSlots();
                for (const slot of slots) if (slot.el.dataset.near === 'true') draw(slot);
            } else if (root) {
                root.style.setProperty('zoom', String(zoom));
            }
            scroller.scrollTop = ratio * scroller.scrollHeight;
            return zoom;
        },

        /** The zoom at which the widest page fills the scroll box. */
        fitWidthZoom() {
            // An unmeasured stage (hidden, not laid out yet) keeps its zoom.
            if (!(scroller.clientWidth > 0)) return zoom;
            const avail = Math.max(120, scroller.clientWidth - 2 * GAP);
            // Natural (zoom 1) widths: paged views size every page; flow and
            // sheet views declare theirs (`view.width`), never measured under zoom.
            const width = view?.kind === 'paged'
                ? Math.max(0, ...(view.pages || []).map((p) => p.width))
                : view?.kind === 'sheets'
                    ? /** @type {{width?: number}} */ (view.sheets?.[activeSheet] || {}).width || 0
                    : view?.width || 0;
            return width > 0 ? clampZoom(avail / width) : zoom;
        },

        /** @param {number} i 0-based page (or sheet) index. */
        go(i) {
            const n = pageCount();
            if (!view || n === 0) return;
            const idx = Math.max(0, Math.min(n - 1, i));
            if (view.kind === 'sheets') { selectSheet(idx, false); return; }
            if (view.kind !== 'paged') return;
            const slot = slots[idx];
            scroller.scrollTo({ top: slot.el.offsetTop - GAP });
            current = idx;
            onPage(idx, n);
        },

        clear() {
            observer?.disconnect();
            observer = null;
            slots = [];
            waiting.clear();
            tabs = null;
            root = null;
            if (view) view.dispose();
            view = null;
        },

        destroy() {
            this.clear();
            scroller.removeEventListener('scroll', trackPage);
        }
    };
}
