// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Low-level DOM utility API providing a safe, consistent interface
 * for querying, mutating, and reading DOM elements.
 *
 * All mutating methods accept either a single `Element`, a `NodeList`, or an
 * `Array` of elements as their first argument (`target`), and apply the
 * operation to every node in the collection. Read-only methods always operate
 * on a single `Element` and return `null` / `false` for invalid inputs rather
 * than throwing.
 *
 */

import { secPolicy } from '../rendering/secPolicy.js';

/**
 * Public API returned by `dom.factory()`.
 *
 * Mutating methods accept a single `HTMLElement`, a `NodeList`, or an array of
 * elements as `target` and apply to every node. Read-only methods take a single
 * `Element` and return `null` / `false` for invalid inputs.
 *
 * @typedef {object} DomAPI
 * @property {(node: HTMLElement|SVGElement, selector: string) => (NodeList|never[])} queryAll All matching descendants, or an empty array on invalid input.
 * @property {(node: HTMLElement|SVGElement, selector: string) => (Element|null)} query First matching descendant, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], name: string, value: string) => void} attr Set an attribute on the target(s).
 * @property {(element: Element, name: string) => (string|null)} attrGet Get an attribute value, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], name: string) => void} attrRemove Remove an attribute from the target(s).
 * @property {(element: Element, name: string) => boolean} attrHas Whether the element has the attribute.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], key: string, value: string) => void} data Set a `data-*` attribute (camelCase key).
 * @property {(element: Element, key: string) => (string|null)} dataGet Get a `data-*` value, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], key: string) => void} dataRemove Remove a `data-*` attribute.
 * @property {(element: Element, key: string) => boolean} dataHas Whether the element has the `data-*` key.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], name: string) => void} classAdd Add space-separated class name(s).
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], name: string) => void} classRemove Remove space-separated class name(s).
 * @property {(element: Element, name: string) => boolean} classHas Whether the element has the class.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], name: string) => void} classToggle Toggle a class on the target(s).
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], oldName: string, newName: string) => void} classReplace Replace one class with another.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], prop: string, val: string) => void} style Set an inline CSS property.
 * @property {(element: Element, prop: string) => (string|null)} styleGet Get a computed CSS property value, or `null`.
 * @property {(element: Element) => (CSSStyleDeclaration|null)} styleGetAll Get the full computed style declaration, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], prop: string) => void} styleRemove Remove an inline CSS property.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[]) => void} hide Hide the target(s) via inline `display:none`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], displayVal?: string) => void} show Show the target(s); optional explicit display value.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[]) => void} toggleVisibility Toggle inline `display:none`.
 * @property {(element: Element) => (DOMRect|null)} rect Bounding box relative to the viewport, or `null`.
 * @property {(element: Element) => ({top: number, left: number}|null)} scrollPos Current scroll position, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], top: number|undefined, left: number|undefined) => void} scrollTo Set scroll position (undefined axis skipped).
 * @property {(parent: Element, orderedChildren: Element[]) => void} reorder Reorder existing direct children of `parent` with minimal DOM moves.
 * @property {(nodes: Iterable<Node>) => DocumentFragment} fragment Wrap nodes in a new `DocumentFragment`.
 * @property {(name: string, element: HTMLInputElement, getter: () => *, setter: (v: *) => void, opts?: {event?: string, checked?: boolean}) => {refresh: () => void, destroy: () => void}} bind Two-way bind an input to a getter/setter pair.
 * @property {(element: HTMLElement) => void} focus Move keyboard focus to the element.
 * @property {(element: HTMLElement) => void} blur Remove keyboard focus from the element.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], value: string|Array<{text: string, lang?: string, dir?: string}>) => void} text Set text content (string or multi-fragment array).
 * @property {(element: Element) => (string|null)} textGet Get `textContent`, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], value: string) => void} val Set `value` on form element(s).
 * @property {(element: Element) => (string|null)} valGet Get `value`, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], state: boolean) => void} checked Set `checked` on checkbox/radio input(s).
 * @property {(element: Element) => (boolean|null)} checkedGet Get `checked`, or `null`.
 * @property {(target: HTMLElement|NodeListOf<HTMLElement>|HTMLElement[], state: boolean) => void} disabled Set `disabled` on form element(s).
 * @property {(element: Element) => (boolean|null)} disabledGet Get `disabled`, or `null`.
 */

export const dom = {
    name: 'dom',
    type: 'fw.dom.query',
    dependencies: ['secPolicy'],
    deps: [secPolicy],

    /** @returns {DomAPI} */
    factory(secPolicy) {

        // --- Internal helpers ---

        // CSS safety primitives are centralised in `secPolicy` (single source
        // of truth, also used by `template.applyAttributes` and `render.toHTML`
        // for URL / clobber filtering). `secPolicy.isSafeCss` covers both the
        // value-side checks (`expression(...)`, `url(javascript:...)`) and
        // the property-name blocklist (`behavior`, `-ms-behavior`).
        const styleApply = function(element, prop, val) {
            if (!secPolicy.isSafeCss(prop, val)) return;
            element.style.setProperty(prop, val);
        };

        /**
         * Normalise a single `Element`, a `NodeList`, or an `Array` to a value
         * that supports `length` and index access so iteration loops are uniform.
         *
         * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Input to normalise.
         * @returns {NodeListOf<HTMLElement> | HTMLElement[]} Iterable with numeric index access.
         */
        // Normalize Element, NodeList, or Array to an iterable with .length and index access.
        const toNodes = function(target) {
            // @ts-ignore - return target is NodeList|HTMLElement[]; TS can't narrow the union properly
            if (Array.isArray(target) || target instanceof NodeList) return target;
            // @ts-ignore - wrapping non-list target in array; TS union type too wide
            return [target];
        };

        // --- API ---
        const api = {

            // ── Query ────────────────────────────────────────────────────────────

            /**
             * Return all descendants of `node` matching `selector`.
             *
             * @param {HTMLElement | SVGElement} node     - Root element to search within.
             * @param {string}                  selector - CSS selector string.
             * @returns {NodeList | []} Matching elements, or an empty array when
             *   `node` is not an element or `selector` is not a string.
             */
            // All matching descendants → NodeList (empty if invalid)
            queryAll(node, selector) {
                if ((node instanceof HTMLElement || node instanceof SVGElement) && typeof selector === 'string') {
                    return node.querySelectorAll(selector);
                }
                return [];
            },

            /**
             * Return the first descendant of `node` matching `selector`.
             *
             * @param {HTMLElement | SVGElement} node     - Root element to search within.
             * @param {string}                  selector - CSS selector string.
             * @returns {Element | null} First matching element, or `null` when not
             *   found or when inputs are invalid.
             */
            // First matching descendant → Element | null
            query(node, selector) {
                if ((node instanceof HTMLElement || node instanceof SVGElement) && typeof selector === 'string') {
                    return node.querySelector(selector);
                }
                return null;
            },

            // ── Attributes ───────────────────────────────────────────────────────

            /**
             * Set an attribute to `value` on one or multiple elements.
             *
             * Note : `null`, `false`, and `undefined` are coerced to strings
             * (e.g. `"null"`) by the underlying `setAttribute` - they do NOT
             * remove the attribute. Use `attrRemove()` to actually remove.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} name  - Attribute name.
             * @param {string} value - Attribute value.
             */
            // Set an attribute on one or multiple elements
            attr(target, name, value) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].setAttribute(name, value);
                }
            },

            /**
             * Get an attribute value from a single element.
             *
             * @param {Element} element - Source element.
             * @param {string}  name    - Attribute name.
             * @returns {string | null} Attribute value, or `null` when the attribute
             *   is absent or the input is not an `Element`.
             */
            // Get an attribute value from a single element → string | null
            attrGet(element, name) {
                if (element instanceof Element) return element.getAttribute(name);
                return null;
            },

            /**
             * Remove an attribute from one or multiple elements.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} name - Attribute name to remove.
             */
            // Remove an attribute from one or multiple elements
            attrRemove(target, name) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].removeAttribute(name);
                }
            },

            /**
             * Check whether a single element has the given attribute.
             *
             * @param {Element} element - Element to check.
             * @param {string}  name    - Attribute name.
             * @returns {boolean} `true` when the attribute is present; `false` when
             *   absent or the input is not an `Element`.
             */
            // Does a single element have an attribute? → boolean
            attrHas(element, name) {
                if (element instanceof Element) return element.hasAttribute(name);
                return false;
            },

            // ── Dataset (data-*) ─────────────────────────────────────────────────
            // key is camelCase (e.g. 'myKey' ↔ data-my-key)

            /**
             * Set a `data-*` attribute on one or multiple elements.
             * `key` must be provided in camelCase (e.g. `'myKey'` → `data-my-key`).
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} key   - camelCase dataset key.
             * @param {string} value - Value to assign.
             */
            // Set a data-* attribute on one or multiple elements
            data(target, key, value) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    if ('dataset' in nodes[i]) nodes[i].dataset[key] = value;
                }
            },

            /**
             * Get a `data-*` value from a single element.
             * `key` must be in camelCase.
             *
             * @param {Element} element - Source element.
             * @param {string}  key     - camelCase dataset key.
             * @returns {string | null} The dataset value, or `null` when absent or
             *   the element has no `dataset`.
             */
            // Get a data-* value from a single element → string | undefined
            dataGet(element, key) {
                if ('dataset' in element) return element.dataset[key] ?? null;
                return null;
            },

            /**
             * Remove a `data-*` attribute from one or multiple elements.
             * `key` must be in camelCase.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} key - camelCase dataset key to remove.
             */
            // Remove a data-* attribute from one or multiple elements
            dataRemove(target, key) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    if ('dataset' in nodes[i]) delete nodes[i].dataset[key];
                }
            },

            /**
             * Check whether a single element has a `data-*` key.
             * `key` must be in camelCase.
             *
             * @param {Element} element - Element to check.
             * @param {string}  key     - camelCase dataset key.
             * @returns {boolean} `true` when the key exists in the element's dataset.
             */
            // Does a single element have a data-* key? → boolean
            dataHas(element, key) {
                // @ts-ignore - element narrowed by "dataset" in element check at runtime
                if ('dataset' in element) return key in element.dataset;
                return false;
            },

            // ── Classes ──────────────────────────────────────────────────────────

            /**
             * Add one or more space-separated class names to one or multiple elements.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} name - Space-separated class name(s) to add.
             */
            // Add one or more (space-separated) classes to one or multiple elements
            classAdd(target, name) {
                const names = name.trim().split(/\s+/);
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].classList.add(...names);
                }
            },

            /**
             * Remove one or more space-separated class names from one or multiple
             * elements.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} name - Space-separated class name(s) to remove.
             */
            // Remove one or more (space-separated) classes from one or multiple elements
            classRemove(target, name) {
                const names = name.trim().split(/\s+/);
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].classList.remove(...names);
                }
            },

            /**
             * Check whether a single element has a specific class.
             *
             * @param {Element} element - Element to check.
             * @param {string}  name    - Class name to look for.
             * @returns {boolean} `true` when the class is present; `false` when
             *   absent or the input is not an `Element`.
             */
            // Does a single element have a class? → boolean
            classHas(element, name) {
                if (element instanceof Element) return element.classList.contains(name);
                return false;
            },

            /**
             * Toggle a class on one or multiple elements (adds if absent, removes
             * if present).
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} name - Class name to toggle.
             */
            // Toggle a class on one or multiple elements
            classToggle(target, name) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].classList.toggle(name);
                }
            },

            /**
             * Replace `oldName` with `newName` on one or multiple elements.
             * No-op per element when `oldName` is not present.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target  - Target(s).
             * @param {string}                         oldName - Class to replace.
             * @param {string}                         newName - Replacement class.
             */
            // Replace a class with another on one or multiple elements
            classReplace(target, oldName, newName) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].classList.replace(oldName, newName);
                }
            },

            // ── Style ────────────────────────────────────────────────────────────

            /**
             * Set an inline CSS property on one or multiple elements via
             * `style.setProperty`.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} prop - CSS property name (supports custom properties).
             * @param {string} val  - Property value.
             */
            // Set an inline CSS property on one or multiple elements
            style(target, prop, val) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    styleApply(nodes[i], prop, val);
                }
            },

            /**
             * Get the computed (resolved) value of a CSS property from a single
             * element via `getComputedStyle`.
             *
             * @param {Element} element - Source element.
             * @param {string}  prop    - CSS property name.
             * @returns {string | null} Computed value string, or `null` when the
             *   input is not an `Element`.
             */
            // Get the computed (resolved) value of a CSS property from a single element → string
            styleGet(element, prop) {
                if (element instanceof Element) {
                    return getComputedStyle(element).getPropertyValue(prop);
                }
                return null;
            },

            /**
             * Get the full computed style object of a single element.
             *
             * @param {Element} element - Source element.
             * @returns {CSSStyleDeclaration | null} The computed style declaration,
             *   or `null` when the input is not an `Element`.
             */
            styleGetAll(element){
                if (element instanceof Element) {
                    return getComputedStyle(element);
                }
                return null;
            },

            /**
             * Remove an inline CSS property from one or multiple elements via
             * `style.removeProperty`.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} prop - CSS property name to remove.
             */
            // Remove an inline CSS property from one or multiple elements
            styleRemove(target, prop) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].style.removeProperty(prop);
                }
            },

            // ── Visibility ───────────────────────────────────────────────────────

            /**
             * Hide one or multiple elements by setting `display: none` as an inline
             * style.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s) to hide.
             */
            // Hide one or multiple elements via inline display:none
            hide(target) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    styleApply(nodes[i], 'display', 'none');
                }
            },

            /**
             * Show one or multiple elements by removing the inline `display` property
             * (letting the CSS cascade determine the display mode) or by setting it
             * to a specific value when `displayVal` is provided.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target       - Target(s) to show.
             * @param {string}                         [displayVal] - Explicit display
             *   value to set (e.g. `'flex'`). When omitted the inline property is
             *   removed, restoring stylesheet-defined display.
             */
            // Show one or multiple elements - removes inline display (default '')
            // letting CSS cascade take over; pass a display value to force a specific mode.
            show(target, displayVal) {
                const val = displayVal !== undefined ? displayVal : '';
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    if (val === '') {
                        nodes[i].style.removeProperty('display');
                    } else {
                        styleApply(nodes[i], 'display', val);
                    }
                }
            },

            /**
             * Toggle the `display: none` inline style on one or multiple elements.
             * Operates solely on the inline style - does not read computed styles.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s) to toggle.
             */
            // Toggle display:none on one or multiple elements (inline style only)
            toggleVisibility(target) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].style.display === 'none') {
                        nodes[i].style.removeProperty('display');
                    } else {
                        styleApply(nodes[i], 'display', 'none');
                    }
                }
            },

            // ── Geometry ─────────────────────────────────────────────────────────

            /**
             * Get the bounding box of a single element relative to the viewport.
             *
             * @param {Element} element - Source element.
             * @returns {DOMRect | null} Bounding rectangle, or `null` when the input
             *   is not an `Element`.
             */
            // Bounding box relative to the viewport → DOMRect | null
            rect(element) {
                if (element instanceof Element) return element.getBoundingClientRect();
                return null;
            },

            /**
             * Get the current scroll position of a single element.
             *
             * @param {Element} element - Scrollable element.
             * @returns {{ top: number, left: number } | null} Current scroll offsets,
             *   or `null` when the input is not an `Element`.
             */
            // Current scroll position of a single element → { top, left } | null
            scrollPos(element) {
                if (element instanceof Element) {
                    return { top: element.scrollTop, left: element.scrollLeft };
                }
                return null;
            },

            /**
             * Set the scroll position on one or multiple elements using synchronous
             * property assignment (not `scrollTo()`).
             *
             * Pass `undefined` for an axis to leave it unchanged.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {number | undefined} top  - New `scrollTop` value.
             * @param {number | undefined} left - New `scrollLeft` value.
             */
            // Set scroll position on one or multiple elements (synchronous property assignment)
            // top and left are optional - pass undefined to skip that axis
            scrollTo(target, top, left) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    if (top  !== undefined) nodes[i].scrollTop  = top;
                    if (left !== undefined) nodes[i].scrollLeft = left;
                }
            },

            // ── Children reorder ─────────────────────────────────────────────────

            /**
             * Reorder the direct children of `parent` to match the sequence of
             * `orderedChildren` via a **minimal-move** cursor walk: a child that is
             * already in its target position is left completely untouched (no
             * `insertBefore`/`moveBefore` call at all). An already-ordered list
             * therefore costs zero DOM operations, and a node that doesn't need to
             * move - including one holding keyboard focus or a text selection -
             * is never detached, so focus/selection/scroll/CSS-transition state
             * survives the reorder.
             *
             * Uses `Element.moveBefore` when the browser supports it (state-preserving
             * move - no disconnect/reconnect step for the moved node either); falls
             * back to `insertBefore` otherwise. Both are only invoked for nodes that
             * actually need to move.
             *
             * Only nodes that are **already direct children** of `parent` are moved;
             * no new nodes are inserted and no existing nodes are removed.
             *
             * @param {Element}   parent          - Container whose children to reorder.
             * @param {Element[]} orderedChildren - Desired child order.
             */
            // Reorder existing direct children of parent to match orderedChildren, with
            // minimal DOM moves (cursor walk) - no tree change, no-op for non-Element parent.
            reorder(parent, orderedChildren) {
                if (!(parent instanceof Element)) return;
                // moveBefore (state-preserving move) is newly standardised and absent
                // from the TS DOM lib - cast locally rather than widen the signature.
                const mover = /** @type {Element & { moveBefore?: (node: Node, ref: Node|null) => void }} */ (parent);
                const move = typeof mover.moveBefore === 'function'
                    ? (child, ref) => mover.moveBefore(child, ref)
                    : (child, ref) => parent.insertBefore(child, ref);

                let cursor = parent.firstChild;
                for (let i = 0; i < orderedChildren.length; i++) {
                    const child = orderedChildren[i];
                    if (!(child instanceof Element) || child.parentNode !== parent) continue;
                    if (child === cursor) {
                        cursor = cursor.nextSibling;
                        continue;
                    }
                    move(child, cursor);
                }
            },

            /**
             * Wrap an iterable of nodes in a detached `DocumentFragment`. Useful
             * for composing a sub-tree off-screen before a single batched insertion.
             *
             * @param {Iterable<Node>} nodes - Sequence of DOM nodes (Elements,
             *   text nodes, comments, …). Non-Node items are silently skipped.
             * @returns {DocumentFragment} A new fragment containing the nodes.
             */
            fragment(nodes) {
                const frag = document.createDocumentFragment();
                if (nodes && typeof nodes[Symbol.iterator] === 'function') {
                    for (const n of nodes) {
                        if (n instanceof Node) frag.appendChild(n);
                    }
                }
                return frag;
            },

            /**
             * Two-way bind a DOM input to a getter/setter pair. Returns a handle
             * `{ refresh, destroy }` that re-syncs the element from the getter
             * or detaches the listener. Idempotent destroy.
             *
             * Low-level primitive used by `form.create(...)` and friends. For a
             * full form state machine (touched/dirty/errors), use `form` directly.
             *
             * @param {string}   name     - Listener name (cf. cmd.on registry).
             *   The implementation uses a stable name derived from this so that
             *   the handle's `destroy()` can detach via `eventTarget.removeEventListener`.
             * @param {HTMLInputElement}  element  - input/select/textarea element.
             * @param {()=>*}    getter   - Initial value source ; also used by refresh().
             * @param {(v:*)=>void} setter - Called on each input event.
             * @param {Object}   [opts]
             * @param {string}   [opts.event='input'] - DOM event source. Default
             *   `'input'` suits text inputs ; for checkboxes pass
             *   `{ event: 'change', checked: true }`.
             * @param {boolean}  [opts.checked=false] - Sync `.checked` instead of `.value`.
             * @returns {{refresh: ()=>void, destroy: ()=>void}}
             */
            bind(name, element, getter, setter, opts) {
                if (!(element instanceof Element)) {
                    throw new Error('dom.bind: element must be an Element');
                }
                if (typeof getter !== 'function' || typeof setter !== 'function') {
                    throw new Error('dom.bind: getter and setter must be functions');
                }
                const ev      = (opts && opts.event)   || 'input';
                const checked = !!(opts && opts.checked);
                const apply = checked
                    ? () => { const v = getter(); element.checked = !!v; }
                    : () => { const v = getter(); element.value = v == null ? '' : String(v); };
                apply();
                const handler = () => {
                    setter(checked ? element.checked : element.value);
                };
                element.addEventListener(ev, handler);
                let destroyed = false;
                return {
                    refresh: apply,
                    destroy() {
                        if (destroyed) return;
                        destroyed = true;
                        element.removeEventListener(ev, handler);
                    },
                };
            },

            // ── Focus ────────────────────────────────────────────────────────────

            /**
             * Move keyboard focus to the element.
             *
             * @param {HTMLElement} element - Element to focus.
             */
            focus(element) {
                if (element instanceof Element) element.focus();
            },

            /**
             * Remove keyboard focus from the element.
             *
             * @param {HTMLElement} element - Element to blur.
             */
            blur(element) {
                if (element instanceof Element) element.blur();
            },

            // ── Text content ─────────────────────────────────────────────────────

            /**
             * Set the text content on one or multiple elements.
             *
             * Two forms :
             *
             *   `text(node, 'hello world')`                              → simple string
             *   `text(node, [{text:'Bonjour ',lang:'fr'}, {text:'Hi',lang:'en'}])`
             *                                                            → multi-fragment
             *
             * **Multi-fragment mode** : pass an array of `{ text, lang? }`
             * descriptors. Each fragment becomes either a bare text node
             * (when `lang` is absent) or a `<span lang="…">` wrapping the
             * text. Useful for multilingual / accessibility-aware content
             * without resorting to HTML strings.
             *
             * The element's existing content is replaced atomically - the
             * single-string form keeps its O(1) behaviour, the array form
             * builds the new children then replaces in one shot.
             *
             * **Security** : every value is set via `textContent` /
             * `setAttribute`. No HTML parsing, no script execution surface.
             *
             * Note : when `part.lang` is present but `part.text` is null or
             * undefined, a `<span lang="…">` with empty text content is still
             * created - intentional, useful for screen-reader language context.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string | Array<{text:string, lang?:string, dir?:string}>} value
             */
            text(target, value) {
                const nodes = toNodes(target);

                if (Array.isArray(value)) {
                    // Multi-fragment mode. Build the new children once,
                    // then clone them per target (cheap : small DOM,
                    // structural cloneNode preserves attributes).
                    const buildFragments = (doc) => {
                        const frag = doc.createDocumentFragment();
                        for (const part of value) {
                            if (part == null) continue;
                            const t = String(part.text == null ? '' : part.text);
                            if (part.lang) {
                                const span = doc.createElement('span');
                                span.setAttribute('lang', String(part.lang));
                                if (part.dir) span.setAttribute('dir', String(part.dir));
                                span.textContent = t;
                                frag.appendChild(span);
                            } else {
                                frag.appendChild(doc.createTextNode(t));
                            }
                        }
                        return frag;
                    };

                    for (let i = 0; i < nodes.length; i++) {
                        const n = nodes[i];
                        if (!(n instanceof Element)) continue;
                        // Wipe in one go, then append fresh fragments.
                        n.textContent = '';
                        n.appendChild(buildFragments(n.ownerDocument || document));
                    }
                    return;
                }

                // Single-string fast path.
                const str = value == null ? '' : String(value);
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i] instanceof Node) nodes[i].textContent = str;
                }
            },

            /**
             * Get the `textContent` of a single element.
             *
             * @param {Element} element - Source element.
             * @returns {string | null} Current text content, or `null` when the
             *   element is not a `Node`.
             */
            // Get textContent from a single element → string | null
            textGet(element) {
                if (element instanceof Node) return element.textContent;
                return null;
            },

            // ── Form values ──────────────────────────────────────────────────────

            /**
             * Set the `value` property on one or multiple form elements
             * (`input`, `select`, `textarea`, etc.).
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {string} value - Value to assign.
             */
            // Set value on one or multiple input/select/textarea elements
            val(target, value) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    // @ts-ignore - 'value' guard ensures the property exists; HTMLElement lacks it in TS types
                    if ('value' in nodes[i]) nodes[i].value = value;
                }
            },

            /**
             * Get the `value` property of a single form element.
             *
             * @param {Element} element - Source form element.
             * @returns {string | null} Current value, or `null` when the element
             *   does not have a `value` property or is not an `Element`.
             */
            // Get value from a single input/select/textarea → string | null
            valGet(element) {
                // @ts-ignore - 'value' guard ensures property exists; Element lacks it in TS types
                if (element instanceof Element && 'value' in element) return /** @type {string} */ (element.value);
                return null;
            },

            /**
             * Set the `checked` state on one or multiple checkbox or radio inputs.
             * The `state` value is coerced to boolean.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {boolean} state - Desired checked state.
             */
            // Set checked state on one or multiple checkbox/radio inputs
            checked(target, state) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    // @ts-ignore - 'checked' guard ensures the property exists; HTMLElement lacks it in TS types
                    if ('checked' in nodes[i]) nodes[i].checked = !!state;
                }
            },

            /**
             * Get the `checked` state of a single checkbox or radio input.
             *
             * @param {Element} element - Source input element.
             * @returns {boolean | null} Checked state, or `null` when the element
             *   does not have a `checked` property or is not an `Element`.
             */
            // Get checked state from a single input → boolean | null
            checkedGet(element) {
                // @ts-ignore - 'checked' guard ensures property exists; Element lacks it in TS types
                if (element instanceof Element && 'checked' in element) return /** @type {boolean} */ (element.checked);
                return null;
            },

            /**
             * Set the `disabled` state on one or multiple form elements.
             * The `state` value is coerced to boolean.
             *
             * @param {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[]} target - Target(s).
             * @param {boolean} state - Desired disabled state.
             */
            // Set disabled state on one or multiple form elements
            disabled(target, state) {
                const nodes = toNodes(target);
                for (let i = 0; i < nodes.length; i++) {
                    // @ts-ignore - 'disabled' guard ensures the property exists; HTMLElement lacks it in TS types
                    if ('disabled' in nodes[i]) nodes[i].disabled = !!state;
                }
            },

            /**
             * Get the `disabled` state of a single form element.
             *
             * @param {Element} element - Source form element.
             * @returns {boolean | null} Disabled state, or `null` when the element
             *   does not have a `disabled` property or is not an `Element`.
             */
            // Get disabled state from a single element → boolean | null
            disabledGet(element) {
                // @ts-ignore - 'disabled' guard ensures property exists; Element lacks it in TS types
                if (element instanceof Element && 'disabled' in element) return /** @type {boolean} */ (element.disabled);
                return null;
            }
        };

        return api;
    }
};
