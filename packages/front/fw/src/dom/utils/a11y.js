// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Accessibility primitives - announcements via ARIA live
 * regions and small helpers for `aria-*` attribute hygiene.
 *
 * **Scope.** This module sticks to mechanical primitives :
 *   - `announce(text, politeness?)` writes to a singleton hidden `aria-live`
 *     region.
 *   - `aria(el, attrs)` batches `aria-*` attribute setters with the framework
 *     conditional semantics (`null`/`false`/`undefined` removes).
 *   - `describedBy(el, ids)` / `labelledBy(el, ids)` sugar for the `aria-…by`
 *     attributes (idempotent ; accepts strings or Elements).
 *   - `setRole(el, role)` / `removeRole(el)` for the `role=` attribute.
 *
 * **Not in scope.** Domain-aware announcements (« 3 items added ») belong to
 * the app or to the sde/sdc layer that knows the locale and the user model.
 * fw provides the plumbing - composing meaningful messages is the consumer's
 * responsibility.
 *
 */

/**
 * Public surface returned by `a11y.factory()`.
 * @typedef {object} A11yAPI
 * @property {(text: string, politeness?: 'polite'|'assertive') => void} announce
 *   Announce `text` to screen readers via a hidden `aria-live` region.
 * @property {() => void} clearAnnouncements Clear both live regions.
 * @property {(el: Element, attrs: Object<string, *>) => void} aria
 *   Batch-set `aria-*` attributes (falsy values remove).
 * @property {(el: Element, idsOrEls: string|Element|Array<string|Element|null|undefined>) => void} labelledBy
 *   Set/remove `aria-labelledby` from ids or elements.
 * @property {(el: Element, idsOrEls: string|Element|Array<string|Element|null|undefined>) => void} describedBy
 *   Set/remove `aria-describedby` from ids or elements.
 * @property {(el: Element, role: string|null|false|undefined) => void} setRole
 *   Set or remove the `role` attribute.
 * @property {(el: Element) => void} removeRole Remove the `role` attribute.
 * @property {() => boolean} prefersReducedMotion
 *   `true` when `prefers-reduced-motion: reduce` is active.
 */

export const a11y = {
    name: 'a11y',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: [],

    /** @returns {A11yAPI} */
    factory() {

        // Single live region pair (polite + assertive). Created lazily on
        // first `announce()` so the module is import-safe in environments
        // without `document` (workers, tests pre-DOM).
        let _politeRegion    = null;
        let _assertiveRegion = null;

        function _ensureRegion(politeness) {
            if (typeof document === 'undefined' || !document.body) return null;
            const existing = politeness === 'assertive' ? _assertiveRegion : _politeRegion;
            if (existing && document.body.contains(existing)) return existing;
            // Clear stale reference before creating a new region.
            if (existing && !document.body.contains(existing)) {
                if (politeness === 'assertive') _assertiveRegion = null;
                else                            _politeRegion    = null;
            }

            const el = document.createElement('div');
            el.setAttribute('aria-live', politeness);
            el.setAttribute('aria-atomic', 'true');
            el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
            // Visually hidden but readable by screen readers (the canonical
            // « sr-only » pattern, inlined so we don't depend on app CSS).
            el.style.cssText =
                'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
                'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
            el.setAttribute('data-fw-a11y', politeness);
            document.body.appendChild(el);
            if (politeness === 'assertive') _assertiveRegion = el;
            else                            _politeRegion    = el;
            return el;
        }

        /**
         * Announce `text` to screen readers. The text is written to a hidden
         * `aria-live` region ; the screen reader reads it asynchronously.
         *
         * Re-using the same text consecutively re-triggers the announcement
         * (we clear then set in a microtask so AT engines pick up the change).
         *
         * @param {string} text - Message to read aloud.
         * @param {'polite'|'assertive'} [politeness='polite']
         *   - `polite` waits for the user to be idle (default)
         *   - `assertive` interrupts the current utterance - reserve for
         *     errors / critical updates.
         * @returns {void}
         */
        function announce(text, politeness) {
            const region = _ensureRegion(politeness === 'assertive' ? 'assertive' : 'polite');
            if (!region) return;
            // Clear first to force re-announce when the same string is sent
            // twice in a row (screen readers de-duplicate identical content).
            region.textContent = '';
            // Microtask defer ; the empty + set must be observed as two
            // mutations by the AT.
            Promise.resolve().then(() => {
                region.textContent = String(text);
            });
        }

        /**
         * Manually clear the live region (e.g. on route change to avoid
         * stale announcements being re-read).
         *
         * @returns {void}
         */
        function clearAnnouncements() {
            if (_politeRegion)    _politeRegion.textContent = '';
            if (_assertiveRegion) _assertiveRegion.textContent = '';
        }

        // ── aria-* attribute helpers ────────────────────────────────────────

        /**
         * Batch-set `aria-*` attributes on an element with conditional
         * semantics : `null`/`false`/`undefined` → remove ; anything else →
         * `setAttribute`. Mirrors the `template.applyAttributes` /
         * `uiSession.attr` behaviour.
         *
         * @param {Element} el - Target element. No-op when null/undefined.
         * @param {Object<string, *>} attrs - Keys without `aria-` prefix
         *   accepted; the prefix is added automatically.
         * @returns {void}
         */
        function aria(el, attrs) {
            if (!el || !attrs || typeof attrs !== 'object') return;
            for (const key of Object.keys(attrs)) {
                const v = attrs[key];
                const name = key.startsWith('aria-') ? key : 'aria-' + key;
                if (v === null || v === false || v === undefined) {
                    el.removeAttribute(name);
                } else {
                    el.setAttribute(name, String(v));
                }
            }
        }

        function _toIdList(idsOrEls) {
            const list = Array.isArray(idsOrEls) ? idsOrEls : [idsOrEls];
            const ids = [];
            for (const x of list) {
                if (x == null) continue;
                if (typeof x === 'string') ids.push(x);
                else if (x && x.id) ids.push(x.id);
                // Skip elements without an id (caller's responsibility to assign).
            }
            return ids.join(' ');
        }

        /**
         * Set `aria-labelledby` from a string id, an Element with `id`, or an
         * array mixing both. Falsy / non-string non-Element entries are skipped.
         * Passing an empty list (or one yielding no ids) removes the attribute.
         *
         * @param {Element} el - Target element. No-op when null/undefined.
         * @param {string|Element|Array<string|Element|null|undefined>} idsOrEls
         * @returns {void}
         */
        function labelledBy(el, idsOrEls) {
            if (!el) return;
            const value = _toIdList(idsOrEls);
            if (value) el.setAttribute('aria-labelledby', value);
            else       el.removeAttribute('aria-labelledby');
        }

        /**
         * Set `aria-describedby` from a string id, an Element with `id`, or an
         * array mixing both. Falsy / non-string non-Element entries are skipped.
         * Passing an empty list (or one yielding no ids) removes the attribute.
         *
         * @param {Element} el - Target element. No-op when null/undefined.
         * @param {string|Element|Array<string|Element|null|undefined>} idsOrEls
         * @returns {void}
         */
        function describedBy(el, idsOrEls) {
            if (!el) return;
            const value = _toIdList(idsOrEls);
            if (value) el.setAttribute('aria-describedby', value);
            else       el.removeAttribute('aria-describedby');
        }

        /**
         * Set or remove the `role` attribute. Pass `null`, `false`, or
         * `undefined` to remove ; any other value is stringified and assigned.
         *
         * @param {Element} el - Target element. No-op when null/undefined.
         * @param {string|null|false|undefined} role - Role token, or a falsy
         *   value to remove the attribute.
         * @returns {void}
         */
        function setRole(el, role) {
            if (!el) return;
            if (role == null || role === false) el.removeAttribute('role');
            else el.setAttribute('role', String(role));
        }

        /**
         * Convenience for `setRole(el, null)` - removes the `role` attribute.
         *
         * @param {Element} el - Target element. No-op when null/undefined.
         * @returns {void}
         */
        function removeRole(el) {
            if (el) el.removeAttribute('role');
        }

        // ── Reduced-motion helper ───────────────────────────────────────────

        /**
         * `true` when the user has indicated a preference for reduced motion
         * (`prefers-reduced-motion: reduce`). Returns `false` outside the
         * browser (workers, SSR).
         *
         * @returns {boolean}
         */
        function prefersReducedMotion() {
            if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
            try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
            catch { return false; }
        }

        return {
            announce,
            clearAnnouncements,
            aria,
            labelledBy,
            describedBy,
            setRole,
            removeRole,
            prefersReducedMotion,
        };
    },
};
