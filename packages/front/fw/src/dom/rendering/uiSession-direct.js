// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Direct DOM mutators mixin for {@link UISession} - `text`,
 * `attr`, `on`, `bind`. Each method ships with overload disambiguation so
 * callers can target either the block root or a logical descendant with
 * the same name.
 *
 * Distributed as a standalone fw module so its factory is serializable
 * (worker-safe).
 *
 */

import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

/**
 * Direct DOM mutator methods mixed onto the `UISession` prototype. `this` is a
 * `UISession`; the chainable mutators return that session instance.
 * @typedef {object} UiSessionDirectMethods
 * @property {(blockId: string, logicalIdOrValue: string, maybeValue?: string) => object} text Set `textContent` on the block root or a descendant. Returns the session (`this`).
 * @property {(blockId: string, logicalIdOrName: string, nameOrValue?: string, value?: *) => object} attr Set/remove an attribute on the block root or a descendant. Returns the session (`this`).
 * @property {(blockId: string, logicalIdOrType: string, typeOrFn?: *, fnOrName?: *, nameOrOptions?: *, options?: *) => (string|null)} on Register a managed listener; returns the listener name, or `null` if the node is missing.
 * @property {(sig: object, blockId: string, logicalIdOrTarget?: string, targetOrOpts?: *, maybeOpts?: object) => (() => void)} bind Subscribe a signal to a DOM surface; returns an `unsubscribe()` function.
 */

/**
 * Value returned by `uiSessionDirect.factory()`.
 * @typedef {object} UiSessionDirectAPI
 * @property {UiSessionDirectMethods} methods Mutator methods mixed onto the `UISession` prototype.
 */

export const uiSessionDirect = {
    name: 'uiSessionDirect',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['dom', 'events'],
    deps: [dom, events],

    /** @returns {UiSessionDirectAPI} */
    factory(dom, events) {

        const methods = {

            /**
             * Set `textContent` on an element addressed by the session.
             *
             * Overloaded:
             *   - `text(blockId, value)`            → set text on the block's root.
             *   - `text(blockId, logicalId, value)` → set text on a descendant.
             */
            text(blockId, logicalIdOrValue, maybeValue) {
                const isRoot = arguments.length === 2;
                const node   = isRoot ? this.get(blockId)
                                      : this.get(blockId, logicalIdOrValue);
                const value  = isRoot ? logicalIdOrValue : maybeValue;
                if (node) dom.text(node, value);
                return this;
            },

            /**
             * Set an attribute on an element addressed by the session.
             *
             * Overloaded:
             *   - `attr(blockId, name, value)`             → on the block's root.
             *   - `attr(blockId, logicalId, name, value)`  → on a descendant.
             *
             * `null`/`false`/`undefined` removes the attribute.
             */
            attr(blockId, logicalIdOrName, nameOrValue, value) {
                const isRoot = arguments.length === 3;
                const node   = isRoot ? this.get(blockId)
                                      : this.get(blockId, logicalIdOrName);
                const name   = isRoot ? logicalIdOrName : nameOrValue;
                const val    = isRoot ? nameOrValue     : value;
                if (!node) return this;
                if (val === null || val === false || val === undefined) {
                    dom.attrRemove(node, name);
                } else {
                    dom.attr(node, name, val);
                }
                return this;
            },

            /**
             * Register a **managed** event listener.
             *
             * Overloaded:
             *   - `on(blockId, type, fn, name?, options?)`               - block root.
             *   - `on(blockId, logicalId, type, fn, name?, options?)`    - descendant.
             *
             * Disambiguation : the root form is detected when arg-2 is a
             * string AND arg-3 is a function.
             */
            on(blockId, logicalIdOrType, typeOrFn, fnOrName, nameOrOptions, options) {
                const isRoot =
                    typeof logicalIdOrType === 'string'
                    && typeof typeOrFn === 'function';
                const logicalId = isRoot ? blockId : logicalIdOrType;
                const type      = isRoot ? logicalIdOrType : typeOrFn;
                const fn        = isRoot ? typeOrFn  : fnOrName;
                const name      = isRoot ? fnOrName  : nameOrOptions;
                const opts      = isRoot ? nameOrOptions : options;

                const node = isRoot ? this.get(blockId) : this.get(blockId, logicalIdOrType);
                if (!node) return null;
                const lname = name || `fw:ui:${this._container}:${++this._lseq}`;
                events.on(lname, node, type, fn, opts);

                if (!this._listeners.has(blockId)) this._listeners.set(blockId, new Map());
                const blockMap = this._listeners.get(blockId);
                if (!blockMap.has(logicalId)) blockMap.set(logicalId, new Set());
                blockMap.get(logicalId).add(lname);
                return lname;
            },

            /**
             * Subscribe a signal to a DOM surface of an addressed element.
             *
             * Overloaded :
             *   - `bind(signal, blockId, target)`              - root.
             *   - `bind(signal, blockId, logicalId, target)`   - descendant.
             *
             * `target` :
             *   - `'text'`         → `dom.text(node, v)` (default for 3-arg form)
             *   - `'class'`        → class toggle ; signal value is the class name
             *     (string), `null`/empty clears the previously-set class.
             *   - `'class:NAME'`   → toggle a **fixed** class : truthy adds `NAME`,
             *     falsy removes. Most natural when the signal is a boolean.
             *   - `'style:PROP'`   → set `style.PROP` via the security-filtered
             *     `dom.style` (CSS expression/url-js blocked).
             *   - `'prop:NAME'`    → set `node[NAME]` directly (DOM property -
             *     `value`, `checked`, `disabled`, `selected`). Bypasses
             *     `setAttribute` so input bindings work as expected.
             *   - any other string → `dom.attr(node, target, v)` (conditional ;
             *     `null/false` removes).
             *
             * `opts` (optional 4th-arg-when-root, 5th-arg-when-descendant) :
             *   - `transform: (v) => any` - map the signal value before apply.
             *     Lets you bind a number signal to `'text'` and format it,
             *     or convert a status string to a class name.
             *
             * Returns an `unsubscribe()` function. The subscription is also
             * auto-detached when `blockId` is unmounted (added to the
             * unmount chain).
             */
            bind(sig, blockId, logicalIdOrTarget, targetOrOpts, maybeOpts) {
                if (!sig || typeof sig.subscribe !== 'function')
                    throw new Error('uiSession.bind: first arg must be a signal');

                // Disambiguate 3-arg root vs 4-arg descendant + optional opts.
                // Heuristic : if logicalIdOrTarget is a known target ('text',
                // 'class', 'class:*', 'style:*', 'prop:*', or any attr name)
                // AND we have 3 or 4 args with targetOrOpts as an object -
                // it's root form. Otherwise 4-arg descendant form.
                //
                // Cleaner : root form when arguments.length === 3 ; or 4 with
                // 4th being a non-string opts. Else descendant.
                let logical, surface, opts;
                if (arguments.length <= 3) {
                    logical = undefined;
                    surface = logicalIdOrTarget ?? 'text';
                    opts    = undefined;
                } else if (arguments.length === 4 && targetOrOpts !== null && typeof targetOrOpts === 'object') {
                    // bind(sig, blockId, target, opts)
                    logical = undefined;
                    surface = logicalIdOrTarget;
                    opts    = targetOrOpts;
                } else {
                    // bind(sig, blockId, logicalId, target, opts?)
                    logical = logicalIdOrTarget;
                    surface = targetOrOpts ?? 'text';
                    opts    = maybeOpts;
                }

                const transform = opts && typeof opts.transform === 'function'
                    ? opts.transform
                    : null;

                // Parse target prefixes once.
                const colonIdx = typeof surface === 'string' ? surface.indexOf(':') : -1;
                const surfacePrefix = colonIdx > 0 ? surface.slice(0, colonIdx) : null;
                const surfaceArg    = colonIdx > 0 ? surface.slice(colonIdx + 1) : null;

                let lastClass = null;
                const applyValue = (rawV) => {
                    const v = transform ? transform(rawV) : rawV;
                    const node = logical === undefined
                        ? this.get(blockId)
                        : this.get(blockId, logical);
                    if (!node) return;

                    if (surface === 'text') {
                        dom.text(node, v);
                        return;
                    }
                    if (surface === 'class') {
                        // Signal value is the class name (or null/false/'' to clear).
                        if (lastClass != null) dom.classRemove(node, lastClass);
                        lastClass = (v == null || v === false || v === '') ? null : String(v);
                        if (lastClass) dom.classAdd(node, lastClass);
                        return;
                    }
                    if (surfacePrefix === 'class') {
                        // Fixed class name ; signal value is the boolean toggle.
                        if (v) dom.classAdd(node, surfaceArg);
                        else   dom.classRemove(node, surfaceArg);
                        return;
                    }
                    if (surfacePrefix === 'style') {
                        // CSS property. dom.style applies secPolicy filters.
                        if (v == null || v === false) {
                            // Clear : remove the inline rule.
                            node.style.removeProperty(surfaceArg);
                        } else {
                            dom.style(node, surfaceArg, String(v));
                        }
                        return;
                    }
                    if (surfacePrefix === 'prop') {
                        // DOM property - bypasses setAttribute.
                        try { node[surfaceArg] = v; }
                        catch { /* read-only property : silently ignore */ }
                        return;
                    }
                    // Default : conditional attribute setter (null/false/undefined removes).
                    if (v === null || v === false || v === undefined) {
                        dom.attrRemove(node, surface);
                    } else {
                        dom.attr(node, surface, v);
                    }
                };

                applyValue(sig.get());
                const unsub = sig.subscribe(applyValue);

                const prevHook = this._unmount.get(blockId);
                this._unmount.set(blockId, () => {
                    unsub();
                    if (prevHook) prevHook();
                });

                return unsub;
            },
        };

        return { methods };
    },
};
