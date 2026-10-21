// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `<awa-viewer>` — the viewer as a custom element, for pages
 * that prefer markup to a script call. Light DOM (no shadow root): the host
 * page's awaforge tokens apply, and fw's live regions stay reachable.
 *
 * ```html
 * <link rel="stylesheet" href="…/viewer/src/styles/viewer.css">
 * <awa-viewer locale="fr" src="/docs/report.pdf" style="height: 80vh"></awa-viewer>
 * <script type="module">
 *   import { defineViewerElement } from '@awacloud/viewer/element.js';
 *   defineViewerElement();
 * </script>
 * ```
 *
 * Attributes: `locale`, `heading-offset`, `src` (a SAME-ORIGIN document to
 * open; a cross-origin URL is refused, the viewer never contacts a third
 * party). Methods: `open(file)`, `close()`. Events: `awa-viewer-open`,
 * `awa-viewer-error` (`detail` as the `onOpen` / `onError` callbacks).
 *
 * Nothing registers at import: call `defineViewerElement()` once.
 *
 * @module viewer/element
 */
import { mountViewer } from './viewer.js';

/**
 * Register `<awa-viewer>` (or another tag name). Idempotent.
 * @param {string} [tag]
 * @returns {CustomElementConstructor}
 */
export function defineViewerElement(tag = 'awa-viewer') {
    const existing = customElements.get(tag);
    if (existing) return existing;

    class AwaViewerElement extends HTMLElement {
        static get observedAttributes() { return ['locale', 'src']; }

        connectedCallback() {
            if (this.viewer) return;
            const offset = Number(this.getAttribute('heading-offset'));
            this.viewer = mountViewer(this, {
                locale: this.getAttribute('locale') || undefined,
                headingOffset: Number.isFinite(offset) && this.hasAttribute('heading-offset') ? offset : undefined,
                onOpen: (detail) => this.dispatchEvent(new CustomEvent('awa-viewer-open', { detail, bubbles: true })),
                onError: (detail) => this.dispatchEvent(new CustomEvent('awa-viewer-error', { detail, bubbles: true }))
            });
            if (this.getAttribute('src')) void this.load(/** @type {string} */ (this.getAttribute('src')));
        }

        disconnectedCallback() {
            this.viewer?.destroy();
            this.viewer = null;
        }

        /**
         * @param {string} name
         * @param {string|null} _old
         * @param {string|null} value
         */
        attributeChangedCallback(name, _old, value) {
            if (!this.viewer) return;
            if (name === 'locale' && value) this.viewer.setLocale(value);
            if (name === 'src' && value) void this.load(value);
        }

        /**
         * Open a same-origin document by URL. Cross-origin URLs and
         * redirects are refused (`mode: 'same-origin'`, `redirect: 'error'`);
         * a later `load()` supersedes a slower earlier one. Failures show the
         * viewer's own translated error and dispatch `awa-viewer-error`.
         * @param {string} src
         * @returns {Promise<boolean>}
         */
        async load(src) {
            const token = (this.loadToken = (this.loadToken || 0) + 1);
            const fail = (code) => {
                if (token === this.loadToken) this.viewer?.showSourceError(src, code);
                return false;
            };
            let url;
            try { url = new URL(src, document.baseURI); } catch { return fail('E_SOURCE_URL'); }
            if (url.origin !== location.origin) return fail('E_CROSS_ORIGIN');
            let bytes;
            try {
                const response = await fetch(url, { mode: 'same-origin', credentials: 'same-origin', redirect: 'error' });
                if (!response.ok) return fail(`E_HTTP_${response.status}`);
                bytes = new Uint8Array(await response.arrayBuffer());
            } catch {
                return fail('E_NETWORK');
            }
            if (token !== this.loadToken || !this.viewer) return false;
            let name = url.pathname.split('/').pop() || 'document';
            try { name = decodeURIComponent(name); } catch { /* keep it encoded */ }
            return this.viewer.open({ name, bytes });
        }

        /** @param {File|Blob|{name: string, bytes: Uint8Array}} file */
        open(file) { return this.viewer ? this.viewer.open(file) : Promise.resolve(false); }

        close() { this.viewer?.close(); }
    }
    customElements.define(tag, AwaViewerElement);
    return AwaViewerElement;
}
