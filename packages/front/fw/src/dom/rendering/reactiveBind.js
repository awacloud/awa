// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Explicit signal → uiSession binding controller.
 *
 * `reactiveBind` connects reactive {@link SignalAPI} signals to live DOM nodes
 * through the existing `uiSession`/`UIList` mutators. It follows the
 * Lit ReactiveController pattern: callers register bindings explicitly rather
 * than relying on transparent auto-binding of templates.
 *
 * Each binding wires one `signal.effect` that auto-tracks the source and
 * patches the target node via `uiSession` — never a re-render, never a vdom.
 * All bindings are tracked internally so they can be bulk-disposed.
 *
 * @example
 *   const sig = runtime.resolve('signal');
 *   const rb  = runtime.resolve('reactiveBind');
 *
 *   const name = sig.create('Alice');
 *   const bind = rb.create(ui);
 *
 *   bind.text('card', 'title', name);
 *   bind.attr('card', 'title', 'aria-label', () => `Name: ${name.get()}`);
 *   bind.show('card', 'spinner', sig.create(false));
 *
 *   bind.dispose(); // detach all bindings
 */

/**
 * Public shape returned by `reactiveBind.factory()`.
 * @typedef {object} ReactiveBindAPI
 * @property {(ui: object) => ReactiveBindController} create Create a new binding controller for the given uiSession.
 */

/**
 * A binding controller scoped to one `uiSession` instance.
 * @typedef {object} ReactiveBindController
 * @property {(blockId: string, localId: string, sigOrFn: object|Function) => (() => void)} text Bind a signal/thunk to `textContent` of a node.
 * @property {(blockId: string, localId: string, name: string, sigOrFn: object|Function) => (() => void)} attr Bind a signal/thunk to an attribute of a node.
 * @property {(blockId: string, localId: string, name: string, sigBool: object|Function) => (() => void)} class Toggle a CSS class on a node based on a boolean signal/thunk.
 * @property {(blockId: string, localId: string, prop: string, sigOrFn: object|Function) => (() => void)} style Bind a signal/thunk to an inline style property.
 * @property {(blockId: string, localId: string, sigBool: object|Function) => (() => void)} show Toggle the `hidden` attribute based on a boolean signal/thunk.
 * @property {(blockId: string, localId: string, sig: object, opts?: ReactiveModelOpts) => (() => void)} model Two-way bind an input element to a writable signal.
 * @property {(listController: object, sigArray: object, opts: ReactiveListOpts) => (() => void)} list Bind an array signal to a UIList controller.
 * @property {() => void} dispose Unsubscribe and clean up every registered binding.
 */

/**
 * Options for two-way model binding.
 * @typedef {object} ReactiveModelOpts
 * @property {string}           [event='input']    DOM event type to listen on.
 * @property {(v: string) => *} [parse]            Convert the DOM value to the signal value.
 * @property {(v: *) => string} [format]           Convert the signal value to the DOM value.
 */

/**
 * Options for list binding.
 * @typedef {object} ReactiveListOpts
 * @property {(item: *) => *}          keyFn  Key extractor — forwarded to UIList.sync.
 * @property {object}                  block  ParseResult forwarded to UIList.sync.
 * @property {((a: *, b: *) => boolean)|string} [eqFn] Equality function or preset forwarded to UIList.sync.
 */

import { signal } from '../../io/utils/signal.js';

export const reactiveBind = {
    name: 'reactiveBind',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['signal'],
    deps: [signal],

    /** @returns {ReactiveBindAPI} */
    factory(signal) {

        /**
         * Resolve a `sigOrFn` argument to a zero-argument function whose body
         * auto-tracks the underlying signal when called inside `signal.effect`.
         * - If `sigOrFn` is a signal (has `get`), return `() => sigOrFn.get()`.
         * - If it is already a function, return it as-is (auto-tracks its reads).
         * @param {object|Function} sigOrFn
         * @returns {Function}
         */
        function asGetter(sigOrFn) {
            if (typeof sigOrFn === 'function') return sigOrFn;
            if (sigOrFn && typeof sigOrFn.get === 'function') return () => sigOrFn.get();
            throw new Error('reactiveBind: sigOrFn must be a signal or a function');
        }

        /**
         * Assert that a given uiSession node exists for (blockId, localId).
         * Throws a clear error if not found so callers get a useful message
         * immediately rather than a silent no-op.
         *
         * @param {object} ui     - uiSession instance.
         * @param {string} blockId
         * @param {string} localId
         * @returns {Element} The resolved element.
         */
        function requireNode(ui, blockId, localId) {
            const node = ui.get(blockId, localId);
            if (!node) {
                throw new Error(
                    `reactiveBind: no element found for block="${blockId}", local="${localId}". ` +
                    `Ensure the block is rendered before binding.`
                );
            }
            return node;
        }

        /**
         * Create a new {@link ReactiveBindController} scoped to `ui`.
         *
         * @param {object} ui - A UISession instance.
         * @returns {ReactiveBindController}
         */
        function create(ui) {
            /** @type {Array<() => void>} - All registered stop/unsubscribe functions. */
            const _disposers = [];

            /**
             * Register a disposer and return it as a per-call disposer.
             * @param {() => void} stop
             * @returns {() => void}
             */
            function track(stop) {
                _disposers.push(stop);
                return stop;
            }

            /**
             * Bind a signal or thunk to the `textContent` of an element.
             *
             * @param {string}           blockId  - Block identifier.
             * @param {string}           localId  - Logical element id within the block.
             * @param {object|Function}  sigOrFn  - Signal or auto-tracking thunk.
             * @returns {() => void} Per-call disposer.
             * @throws {Error} If the addressed node is not found.
             */
            function text(blockId, localId, sigOrFn) {
                // Validate existence eagerly so the error points to the right call site.
                requireNode(ui, blockId, localId);
                const getter = asGetter(sigOrFn);
                const stop = signal.effect(() => {
                    const value = getter();
                    ui.text(blockId, localId, value);
                });
                return track(stop);
            }

            /**
             * Bind a signal or thunk to an attribute of an element.
             *
             * @param {string}           blockId  - Block identifier.
             * @param {string}           localId  - Logical element id.
             * @param {string}           name     - Attribute name.
             * @param {object|Function}  sigOrFn  - Signal or auto-tracking thunk.
             * @returns {() => void} Per-call disposer.
             * @throws {Error} If the addressed node is not found.
             */
            function attr(blockId, localId, name, sigOrFn) {
                requireNode(ui, blockId, localId);
                const getter = asGetter(sigOrFn);
                const stop = signal.effect(() => {
                    const value = getter();
                    ui.attr(blockId, localId, name, value);
                });
                return track(stop);
            }

            /**
             * Toggle a CSS class on an element based on a boolean signal/thunk.
             *
             * @param {string}           blockId  - Block identifier.
             * @param {string}           localId  - Logical element id.
             * @param {string}           name     - CSS class name to toggle.
             * @param {object|Function}  sigBool  - Signal or thunk returning a boolean.
             * @returns {() => void} Per-call disposer.
             * @throws {Error} If the addressed node is not found.
             */
            function cls(blockId, localId, name, sigBool) {
                const node = requireNode(ui, blockId, localId);
                const getter = asGetter(sigBool);
                const stop = signal.effect(() => {
                    const on = !!getter();
                    if (on) node.classList.add(name);
                    else    node.classList.remove(name);
                });
                return track(stop);
            }

            /**
             * Bind a signal or thunk to an inline style property of an element.
             *
             * @param {string}           blockId  - Block identifier.
             * @param {string}           localId  - Logical element id.
             * @param {string}           prop     - CSS property name (e.g. `'color'`).
             * @param {object|Function}  sigOrFn  - Signal or auto-tracking thunk.
             * @returns {() => void} Per-call disposer.
             * @throws {Error} If the addressed node is not found.
             */
            function style(blockId, localId, prop, sigOrFn) {
                const node = /** @type {HTMLElement} */ (requireNode(ui, blockId, localId));
                const getter = asGetter(sigOrFn);
                const stop = signal.effect(() => {
                    const value = getter();
                    if (value == null || value === false) {
                        node.style.removeProperty(prop);
                    } else {
                        node.style.setProperty(prop, String(value));
                    }
                });
                return track(stop);
            }

            /**
             * Show or hide an element by toggling the `hidden` attribute.
             *
             * @param {string}           blockId  - Block identifier.
             * @param {string}           localId  - Logical element id.
             * @param {object|Function}  sigBool  - Signal or thunk; truthy = visible, falsy = hidden.
             * @returns {() => void} Per-call disposer.
             * @throws {Error} If the addressed node is not found.
             */
            function show(blockId, localId, sigBool) {
                requireNode(ui, blockId, localId);
                const getter = asGetter(sigBool);
                // Use attr() internally: null removes `hidden` (visible), '' adds it (hidden).
                // Avoid creating an extra disposer entry by calling attr() directly and
                // returning its disposer.
                const stop = signal.effect(() => {
                    const visible = !!getter();
                    ui.attr(blockId, localId, 'hidden', visible ? null : '');
                });
                return track(stop);
            }

            /**
             * Two-way binding between an input element and a writable signal.
             *
             * DOM events update `sig.set(parse(element.value))`.
             * Signal changes are reflected to `element.value` via the effect path.
             * A feedback-loop guard skips the write when the value is unchanged.
             *
             * @param {string}                blockId  - Block identifier.
             * @param {string}                localId  - Logical element id.
             * @param {object}                sig      - Writable signal (must have `.set`).
             * @param {ReactiveModelOpts}     [opts]   - Optional configuration.
             * @returns {() => void} Per-call disposer that removes both the effect and listener.
             * @throws {Error} If the addressed node is not found or sig lacks `.set`.
             */
            function model(blockId, localId, sig, opts) {
                const node = /** @type {HTMLInputElement} */ (requireNode(ui, blockId, localId));
                if (!sig || typeof sig.set !== 'function')
                    throw new Error('reactiveBind.model: sig must be a writable signal (has .set)');

                const eventType = (opts && opts.event)  || 'input';
                const parse     = (opts && typeof opts.parse  === 'function') ? opts.parse  : (v) => v;
                const format    = (opts && typeof opts.format === 'function') ? opts.format : (v) => v == null ? '' : String(v);

                /** Guard: true while the effect is applying a value to the DOM. */
                let _writing = false;

                // Signal → DOM (one-way, via effect)
                const stopEffect = signal.effect(() => {
                    const v = sig.get();
                    const formatted = format(v);
                    // Only update the DOM node if the value differs, to avoid
                    // caret-jump on fast-typing while coalescing is active.
                    if (node.value !== formatted) {
                        _writing = true;
                        try { node.value = formatted; }
                        finally { _writing = false; }
                    }
                });

                // DOM → signal (event listener)
                const onInput = () => {
                    if (_writing) return; // feedback-loop guard
                    const parsed = parse(node.value);
                    // Skip set() if the parsed value equals the current signal value
                    // to avoid triggering a spurious re-run of the effect.
                    if (!Object.is(parsed, sig.peek())) {
                        sig.set(parsed);
                    }
                };

                node.addEventListener(eventType, onInput);

                const stop = () => {
                    stopEffect();
                    node.removeEventListener(eventType, onInput);
                };
                return track(stop);
            }

            /**
             * Bind an array signal to a UIList controller. On each signal change
             * `listController.sync(value, { keyFn, block, eqFn })` is called.
             * Reconciliation is entirely delegated to `UIList` — no diffing here.
             *
             * @param {object}            listController - UIList instance (has `.sync`).
             * @param {object}            sigArray       - Signal whose value is an array.
             * @param {ReactiveListOpts}  opts           - Forwarded to UIList.sync.
             * @returns {() => void} Per-call disposer.
             * @throws {Error} If `listController` lacks a `sync` method.
             */
            function list(listController, sigArray, opts) {
                if (!listController || typeof listController.sync !== 'function')
                    throw new Error('reactiveBind.list: listController must have a sync() method');
                if (!sigArray || typeof sigArray.get !== 'function')
                    throw new Error('reactiveBind.list: sigArray must be a signal');
                if (!opts || typeof opts.keyFn !== 'function')
                    throw new Error('reactiveBind.list: opts.keyFn is required');

                const stop = signal.effect(() => {
                    const arr = sigArray.get();
                    listController.sync(Array.isArray(arr) ? arr : [], opts);
                });
                return track(stop);
            }

            /**
             * Unsubscribe every registered binding and clear the internal registry.
             * Idempotent — safe to call multiple times.
             */
            function dispose() {
                for (const stop of _disposers) {
                    try { stop(); } catch { /* swallow individual errors */ }
                }
                _disposers.length = 0;
            }

            return { text, attr, class: cls, style, show, model, list, dispose };
        }

        return { create };
    },
};
