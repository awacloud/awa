// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Attaches CSS text to a document through one of two channels: a `<style>`
 * element (mode `'element'`, the default) or a constructable stylesheet in
 * `document.adoptedStyleSheets` (mode `'adopted'`), which a CSP `style-src`
 * without `'unsafe-inline'` and without a nonce does not refuse.
 *
 * The module never detects a CSP and never retries another channel when one
 * is refused: the consumer chooses the mode. It only feature-detects the
 * platform API, and falls back to the element channel where the constructable
 * one does not exist (`handle.mode` tells which one ran).
 *
 * Mode state: one variable in factory scope. Its lifetime is one `factory()`
 * call, i.e. one per runtime container; two instances do not share it.
 *
 * Platform notes: a constructed sheet ignores `@import` rules; adopted sheets
 * come after the document's own sheets in the cascade, so a rule of equal
 * specificity wins where a `<style>` in `<head>` might not.
 *
 * Worker-safe: no - needs `document`. It imports cleanly and `attach` returns
 * an inert handle (`mode: 'none'`) where there is none.
 *
 * @example
 * const styleSheet = runtime.resolve('styleSheet');
 * styleSheet.mode('adopted');
 * const h = styleSheet.attach('.card { color: red }', { id: 'card-css' });
 * h.set('.card { color: blue }');
 * h.detach();
 */

/**
 * @typedef {Object} StyleAttachOptions
 * @property {'element'|'adopted'} [mode] - Per-call override of the instance mode.
 * @property {Element} [head] - Element that receives the `<style>` (default `document.head`); its `ownerDocument` is the target document.
 * @property {string} [id] - Element mode sets `el.id`; kept on the handle in both modes.
 * @property {Record<string, string>} [attrs] - Own string keys set with `setAttribute` (element mode only).
 * @property {string} [nonce] - CSP nonce (`''` = none); `undefined` uses the factory default (element mode only).
 */

/**
 * @typedef {Object} StyleHandle
 * @property {'element'|'adopted'|'none'} mode - Channel that actually ran (`'none'` = inert, no document).
 * @property {string|null} id
 * @property {HTMLStyleElement|null} element
 * @property {CSSStyleSheet|null} sheet
 * @property {(css: string) => void} set - Replace the CSS text; no-op after `detach()`.
 * @property {() => void} detach - Remove the style; idempotent.
 */

/**
 * Surface returned by `factory()`.
 * @typedef {Object} StyleSheetAPI
 * @property {() => {constructable: boolean}} support - Whether constructable stylesheets are available now.
 * @property {(value?: 'element'|'adopted') => ('element'|'adopted'|void)} mode - Get (no argument) or set the default mode of this instance.
 * @property {(css: string, opts?: StyleAttachOptions) => StyleHandle} attach - Attach CSS text to a document.
 */

export const styleSheet = {
    name: 'styleSheet',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: [],

    /**
     * @returns {StyleSheetAPI}
     */
    factory() {

        // Default mode of this instance (lifetime: this factory() call).
        /** @type {'element'|'adopted'} */
        let _mode = 'element';

        // CSP nonce default, read once at factory time (as component/template do).
        const _cspNonce = (typeof document !== 'undefined')
            ? (document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? '')
            : '';

        /**
         * @param {any} value
         * @returns {'element'|'adopted'}
         */
        function _checkMode(value) {
            if (value !== 'element' && value !== 'adopted') {
                throw new TypeError(`styleSheet: unknown mode '${value}'`);
            }
            return value;
        }

        function _checkCss(css) {
            if (typeof css !== 'string') throw new TypeError('styleSheet: css must be a string');
        }

        function support() {
            const constructable = typeof document !== 'undefined'
                && 'adoptedStyleSheets' in document
                && typeof CSSStyleSheet === 'function'
                && typeof CSSStyleSheet.prototype.replaceSync === 'function';
            return { constructable };
        }

        /**
         * @param {'element'|'adopted'} [value]
         * @returns {'element'|'adopted'|void}
         */
        function mode(value) {
            if (arguments.length === 0 || value === undefined) return _mode;
            _mode = _checkMode(value);
        }

        /**
         * @param {string} css
         * @param {Element} head
         * @param {string|null} id
         * @param {StyleAttachOptions} opts
         * @returns {StyleHandle}
         */
        function _elementHandle(css, head, id, opts) {
            const doc = head.ownerDocument;
            const el = doc.createElement('style');
            if (id !== null) el.id = id;
            el.textContent = css;
            const attrs = opts.attrs;
            if (attrs) {
                for (const key of Object.keys(attrs)) el.setAttribute(key, String(attrs[key]));
            }
            const nonce = typeof opts.nonce === 'string' ? opts.nonce : _cspNonce;
            if (nonce) el.setAttribute('nonce', nonce);
            head.appendChild(el);

            let detached = false;
            return {
                mode: 'element',
                id,
                element: el,
                sheet: null,
                set(next) {
                    _checkCss(next);
                    if (detached) return;
                    el.textContent = next;
                    if (!el.isConnected) head.appendChild(el);
                },
                detach() {
                    if (detached) return;
                    detached = true;
                    el.remove();
                },
            };
        }

        /**
         * @param {string} css
         * @param {Document} doc
         * @param {string|null} id
         * @returns {StyleHandle}
         */
        function _adoptedHandle(css, doc, id) {
            const sheet = new doc.defaultView.CSSStyleSheet();
            sheet.replaceSync(css);
            doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];

            let detached = false;
            return {
                mode: 'adopted',
                id,
                element: null,
                sheet,
                set(next) {
                    _checkCss(next);
                    if (detached) return;
                    sheet.replaceSync(next);
                },
                detach() {
                    if (detached) return;
                    detached = true;
                    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
                },
            };
        }

        /**
         * @param {string} css
         * @param {StyleAttachOptions} [opts]
         * @returns {StyleHandle}
         */
        function attach(css, opts) {
            _checkCss(css);
            /** @type {StyleAttachOptions} */
            const o = opts || {};
            const wanted = o.mode === undefined ? _mode : _checkMode(o.mode);
            const id = typeof o.id === 'string' ? o.id : null;

            const head = o.head || (typeof document !== 'undefined' ? document.head : null);
            if (!head) {
                /** @type {StyleHandle} */
                const inert = { mode: 'none', id, element: null, sheet: null, set() {}, detach() {} };
                return inert;
            }
            const doc = head.ownerDocument;

            if (wanted === 'adopted') {
                const Ctor = doc.defaultView && doc.defaultView.CSSStyleSheet;
                if (typeof Ctor === 'function'
                    && typeof Ctor.prototype.replaceSync === 'function'
                    && 'adoptedStyleSheets' in doc) {
                    return _adoptedHandle(css, doc, id);
                }
            }
            return _elementHandle(css, head, id, o);
        }

        return { support, mode, attach };
    },
};
