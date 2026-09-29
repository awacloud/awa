// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Keyboard shortcut manager supporting simple bindings (`'Ctrl+S'`),
 * chord keys (`'Ctrl+K Ctrl+P'` - two sequential keystrokes),
 * stackable contexts (`pushContext('modal')` → exclusive bindings),
 * per-binding priority (conflict resolution),
 * and inspection (`list`, `match`).
 *
 * Key strategy: `event.code` for alpha-numeric keys (keyboard layout
 * independent, e.g. `KeyA` always maps to the physical A key), and `event.key`
 * for named keys (`'Escape'`, `'F1'`, `'Tab'`, etc.).
 *
 * Out of MVP scope: persistent user-side remapping.
 * Worker-safe: no - consumes DOM keyboard events.
 *
 * @example
 * const keybindings = runtime.resolve('keybindings');
 * const kb = keybindings.create({ target: document });
 * kb.attach();
 * const unbind = kb.bind('Ctrl+S', () => save(), { preventDefault: true });
 * kb.bind('Ctrl+K Ctrl+P', () => openPalette());
 * // …
 * unbind(); // unregisters
 */
import { events } from '../query/events.js';
import { eventBus } from '../../io/utils/eventBus.js';

/**
 * Public surface returned by the keybindings factory.
 * @typedef {object} KeybindingsAPI
 * @property {(opts?: { target?: EventTarget, layout?: string, chordTimeout?: number }) => object} create - Create a keybindings manager instance (bind/unbind/contexts/attach/detach/...).
 * @property {(combo: string) => ({ modifiers: object, key: string } | Array<{ modifiers: object, key: string }>)} parse - Parse a combo string into a single segment (simple) or an array of segments (chord).
 */

export const keybindings = {
    name: 'keybindings',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: ['events', 'eventBus'],
    deps: [events, eventBus],

    /**
     * @param {Object} events    - Module events (fw)
     * @param {Object} eventBus  - Module eventBus (fw)
     * @returns {KeybindingsAPI}
     */
    factory(events, eventBus) {

        // ── Key mapping constants ────────────────────────────────────────────

        /** Special keys → expected event.key */
        const NAMED_KEYS = new Set([
            'Escape', 'Tab', 'Enter', 'Space', 'Backspace', 'Delete', 'Insert',
            'Home', 'End', 'PageUp', 'PageDown',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
            'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        ]);

        /** Accepted key aliases (case-insensitive) → normalised key */
        const KEY_ALIASES = {
            esc: 'Escape',
            escape: 'Escape',
            return: 'Enter',
            enter: 'Enter',
            tab: 'Tab',
            space: 'Space',
            backspace: 'Backspace',
            del: 'Delete',
            delete: 'Delete',
            insert: 'Insert',
            home: 'Home',
            end: 'End',
            pageup: 'PageUp',
            pagedown: 'PageDown',
            up: 'ArrowUp',
            down: 'ArrowDown',
            left: 'ArrowLeft',
            right: 'ArrowRight',
            arrowup: 'ArrowUp',
            arrowdown: 'ArrowDown',
            arrowleft: 'ArrowLeft',
            arrowright: 'ArrowRight',
        };

        /** Accepted modifier names (lowercase) */
        const MODIFIER_NAMES = new Set(['ctrl', 'shift', 'alt', 'meta', 'cmd', 'super']);

        // ── Parser ─────────────────────────────────────────────────────────

        /**
         * Parse a single combo segment (e.g. `'Ctrl+Shift+P'`).
         * @param {string} segment
         * @returns {{ modifiers: {ctrl, shift, alt, meta}, key: string }}
         */
        function _parseSegment(segment) {
            const parts = segment.split('+');
            const modifiers = { ctrl: false, shift: false, alt: false, meta: false };
            let key = null;

            for (const raw of parts) {
                const lower = raw.toLowerCase();
                if (MODIFIER_NAMES.has(lower)) {
                    if (lower === 'cmd' || lower === 'super') {
                        modifiers.meta = true;
                    } else {
                        modifiers[lower] = true;
                    }
                } else if (raw.length === 0) {
                    // double `+` (e.g. 'Ctrl++')
                    throw new Error('keybindings: invalid combo segment "' + segment + '"');
                } else {
                    if (key !== null) {
                        throw new Error('keybindings: multiple non-modifier keys in segment "' + segment + '"');
                    }
                    // Try alias, then NAMED_KEYS, then letter/digit
                    const alias = KEY_ALIASES[lower];
                    if (alias) {
                        key = alias;
                    } else if (NAMED_KEYS.has(raw)) {
                        key = raw;
                    } else if (/^[a-zA-Z0-9]$/.test(raw)) {
                        key = raw.toLowerCase();
                    } else {
                        throw new Error('keybindings: unknown key "' + raw + '" in segment "' + segment + '"');
                    }
                }
            }

            if (key === null) {
                throw new Error('keybindings: no key specified in segment "' + segment + '"');
            }

            return { modifiers, key };
        }

        /**
         * Parse a full combo string.
         * - simple (`'Ctrl+S'`) → `{modifiers, key}`
         * - chord (`'Ctrl+K Ctrl+P'`) → `[{modifiers, key}, {modifiers, key}]`
         *
         * @param {string} combo
         * @returns {{ modifiers: Object, key: string } | Array<{ modifiers: Object, key: string }>}
         */
        function parse(combo) {
            if (typeof combo !== 'string' || combo.trim().length === 0) {
                throw new TypeError('keybindings: combo must be a non-empty string');
            }
            const segments = combo.trim().split(' ').filter(s => s.length > 0);
            if (segments.length === 1) {
                return _parseSegment(segments[0]);
            }
            return segments.map(s => _parseSegment(s));
        }

        // ── event.key normalisation ──────────────────────────────────────────

        /**
         * Normalise a KeyboardEvent to a key comparable to the one produced by `parse`.
         * For alpha-numeric keys, uses `event.code` (e.g. 'KeyA' → 'a').
         * For named keys, uses `event.key`.
         * @param {KeyboardEvent} event
         * @returns {string|null}
         */
        function _normalizeEventKey(event) {
            // Named keys via event.key
            const key = event.key;
            if (NAMED_KEYS.has(key)) return key;
            // Alias via event.key
            const aliased = KEY_ALIASES[key.toLowerCase()];
            if (aliased) return aliased;
            // Alpha-numeric via event.code (layout-independent)
            const code = event.code;
            if (code && /^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
            if (code && /^Digit[0-9]$/.test(code)) return code.slice(5);
            // Fallback: event.key lowercased if a single character
            if (key.length === 1) return key.toLowerCase();
            return null;
        }

        /**
         * Test whether a KeyboardEvent matches a parsed segment.
         * @param {KeyboardEvent} event
         * @param {{ modifiers: Object, key: string }} seg
         * @returns {boolean}
         */
        function _matchesSegment(event, seg) {
            const { modifiers, key } = seg;
            // Windows merges `Ctrl+Alt` into `AltGr`; Firefox then reports
            // `getModifierState('AltGraph') === true` while `ctrlKey`/`altKey`
            // are `false`. Normalise: AltGr active ⇒ Ctrl and Alt both effective.
            // This makes `Ctrl+Alt+X` match both AltGr (Firefox) and the legacy
            // ctrl+alt (Chrome) without false positives on combos that only
            // require one of the two modifiers.
            const altGr = typeof event.getModifierState === 'function'
                && event.getModifierState('AltGraph');
            const evCtrl = event.ctrlKey || altGr;
            const evAlt  = event.altKey  || altGr;
            if (evCtrl         !== modifiers.ctrl)   return false;
            if (event.shiftKey !== modifiers.shift)  return false;
            if (evAlt          !== modifiers.alt)    return false;
            if (event.metaKey  !== modifiers.meta)   return false;
            return _normalizeEventKey(event) === key;
        }

        // ── Instance factory ─────────────────────────────────────────────────

        /**
         * Create a keyboard shortcut manager instance.
         * @param {Object}   [opts={}]
         * @param {EventTarget} [opts.target]   - Listening target. Defaults to `document`.
         * @param {string}   [opts.layout]      - Keyboard layout: 'us'|'fr'|'auto' (reserved for future use).
         * @param {number}   [opts.chordTimeout=1500] - Chord timeout in ms.
         * @returns {Object} keybindings instance
         */
        function create(opts = {}) {
            const target      = opts.target || document;
            const chordTimeout = typeof opts.chordTimeout === 'number' ? opts.chordTimeout : 1500;

            const _bus = eventBus.create();

            // Bindings list: { combo, parsed, context, priority, preventDefault, repeat, fn }
            const _bindings = [];

            // Context stack
            const _contextStack = [];

            // Pending chord state
            let _chordPending = null;   // { parsed: Array, matched: number, timer: id }

            let _attached = false;

            // ── Bindings management ──────────────────────────────────────────

            /**
             * Registers a keyboard shortcut.
             *
             * **Chord priority tiebreaker.** When multiple chord bindings share
             * the same prefix and identical `priority`, only the first registered
             * candidate fires (deterministic by definition order). Plain
             * (non-chord) bindings at equal max priority all fire - chord
             * arbitration is single-winner by design.
             *
             * @param {string}   combo
             * @param {Function} fn
             * @param {Object}   [opts2={}]
             * @param {string}   [opts2.context]
             * @param {number}   [opts2.priority=0]
             * @param {boolean}  [opts2.preventDefault=true]
             * @param {boolean}  [opts2.repeat=false]
             * @returns {Function} unbind
             */
            function bind(combo, fn, opts2 = {}) {
                if (typeof combo !== 'string') throw new TypeError('keybindings.bind: combo must be a string');
                if (typeof fn !== 'function') throw new TypeError('keybindings.bind: fn must be a function');

                const parsed   = parse(combo);
                const context  = opts2.context || null;
                const priority = typeof opts2.priority === 'number' ? opts2.priority : 0;
                const prev     = opts2.preventDefault !== false; // true by default
                const repeat   = opts2.repeat === true;           // false by default

                const entry = { combo, parsed, context, priority, preventDefault: prev, repeat, fn };
                _bindings.push(entry);

                return function unbind() {
                    const idx = _bindings.indexOf(entry);
                    if (idx !== -1) _bindings.splice(idx, 1);
                };
            }

            /**
             * Unregister a combo (all handlers when `fn` is omitted).
             * @param {string}    combo
             * @param {Function}  [fn]
             */
            function unbind(combo, fn) {
                for (let i = _bindings.length - 1; i >= 0; i--) {
                    if (_bindings[i].combo === combo) {
                        if (!fn || _bindings[i].fn === fn) {
                            _bindings.splice(i, 1);
                        }
                    }
                }
            }

            // ── Context ──────────────────────────────────────────────────────

            /**
             * Push a context onto the stack.
             * @param {string} name
             */
            function pushContext(name) {
                _contextStack.push(name);
            }

            /**
             * Pops the current context.
             * @returns {string} Popped context name.
             * @throws {RangeError} If the context stack is empty.
             */
            function popContext() {
                if (_contextStack.length === 0) {
                    throw new RangeError('keybindings: context stack underflow');
                }
                return _contextStack.pop();
            }

            /**
             * Return a copy of the context stack.
             * @returns {string[]}
             */
            function currentContext() {
                return [..._contextStack];
            }

            // ── Inspection ───────────────────────────────────────────────────

            /**
             * Return the list of all registered bindings.
             * @returns {Array<{combo, context, priority, fn}>}
             */
            function list() {
                return _bindings.map(b => ({
                    combo:    b.combo,
                    context:  b.context,
                    priority: b.priority,
                    fn:       b.fn,
                }));
            }

            /**
             * Return the bindings that would be triggered by this event.
             * @param {KeyboardEvent} event
             * @returns {Array<{combo, context, priority, fn}>}
             */
            function match(event) {
                return _bindings
                    .filter(b => {
                        const parsed = b.parsed;
                        if (Array.isArray(parsed)) {
                            // chord: only the first segment can be matched here
                            return _matchesSegment(event, parsed[0]);
                        }
                        return _matchesSegment(event, parsed);
                    })
                    .map(b => ({ combo: b.combo, context: b.context, priority: b.priority, fn: b.fn }));
            }

            // ── Dispatch logic ───────────────────────────────────────────────

            /**
             * Filter bindings by the current context.
             * Rule: when a context is active (non-empty stack), only bindings
             * whose `context === top of stack` are allowed.
             * In practice: when the stack is non-empty, only bindings from the
             * current context fire; context-less bindings are ignored while a
             * context is active.
             *
             * @param {Array} candidates
             * @returns {Array}
             */
            function _filterByContext(candidates) {
                const ctx = _contextStack.length > 0 ? _contextStack[_contextStack.length - 1] : null;
                if (ctx === null) {
                    // No active context: only context-less bindings
                    return candidates.filter(b => b.context === null);
                }
                // Active context: only bindings for that context
                return candidates.filter(b => b.context === ctx);
            }

            /**
             * Execute the bindings with the highest priority (ties → all of them).
             * @param {Array}         matched - bindings filtered by context
             * @param {KeyboardEvent} event
             */
            function _dispatch(matched, event) {
                if (matched.length === 0) return;

                // Maximum priority
                const maxPriority = matched.reduce((m, b) => Math.max(m, b.priority), -Infinity);
                const toRun = matched.filter(b => b.priority === maxPriority);

                for (const b of toRun) {
                    if (b.preventDefault) event.preventDefault();
                    try {
                        b.fn(event);
                    } catch (e) {
                         
                        console.error('keybindings handler error:', e);
                    }
                    _bus.emit('keybindings:matched', { combo: b.combo, context: b.context, fn: b.fn });
                }
            }

            /**
             * Main keydown handler.
             * @param {KeyboardEvent} event
             */
            function _onKeyDown(event) {
                // Filter event.repeat when binding.repeat === false.
                // Note: filtering happens per binding below, but if all candidates
                // reject repeat we can exit early.

                // ── Phase 1: handle a pending chord ──────────────────────────
                if (_chordPending) {
                    const { parsed, matched, timer, binding } = _chordPending;
                    clearTimeout(timer);
                    _chordPending = null;

                    const nextIdx = matched + 1;
                    if (_matchesSegment(event, parsed[nextIdx])) {
                        if (nextIdx === parsed.length - 1) {
                            // Chord complet
                            const b = binding;
                            if (b.repeat || !event.repeat) {
                                if (b.preventDefault) event.preventDefault();
                                try {
                                    b.fn(event);
                                } catch (e) {
                                     
                                    console.error('keybindings chord handler error:', e);
                                }
                                _bus.emit('keybindings:matched', { combo: b.combo, context: b.context, fn: b.fn });
                            }
                        } else {
                            // More segments still to come
                            _chordPending = {
                                parsed,
                                matched: nextIdx,
                                binding,
                                timer: setTimeout(() => { _chordPending = null; }, chordTimeout),
                            };
                        }
                        return; // Ne pas traiter comme binding simple
                    }
                    // Second keystroke does not match → cancel the chord
                    // and continue normal processing
                }

                // ── Phase 2: look for chord candidates ───────────────────────
                const chordCandidates = _bindings.filter(b => {
                    if (!Array.isArray(b.parsed)) return false;
                    if (!_matchesSegment(event, b.parsed[0])) return false;
                    // Check context
                    const ctx = _contextStack.length > 0 ? _contextStack[_contextStack.length - 1] : null;
                    if (ctx === null) return b.context === null;
                    return b.context === ctx;
                });

                if (chordCandidates.length > 0) {
                    // Start the chord with the first candidate (when several, take the highest priority)
                    const best = chordCandidates.reduce((a, b) => b.priority > a.priority ? b : a, chordCandidates[0]);
                    _chordPending = {
                        parsed:  best.parsed,
                        matched: 0,
                        binding: best,
                        timer:   setTimeout(() => { _chordPending = null; }, chordTimeout),
                    };
                    // Do not trigger a simple binding immediately
                    return;
                }

                // ── Phase 3: simple bindings ──────────────────────────────────
                const simpleCandidates = _bindings.filter(b => {
                    if (Array.isArray(b.parsed)) return false;
                    return _matchesSegment(event, b.parsed);
                });

                const contextFiltered = _filterByContext(simpleCandidates);
                const repeatFiltered  = contextFiltered.filter(b => b.repeat || !event.repeat);

                _dispatch(repeatFiltered, event);
            }

            // ── Attach / detach ───────────────────────────────────────────────

            /**
             * Enable keyboard event listening.
             */
            function attach() {
                if (_attached) return;
                _attached = true;
                target.addEventListener('keydown', _onKeyDown);
            }

            /**
             * Disable keyboard event listening.
             */
            function detach() {
                if (!_attached) return;
                _attached = false;
                target.removeEventListener('keydown', _onKeyDown);
                if (_chordPending) {
                    clearTimeout(_chordPending.timer);
                    _chordPending = null;
                }
            }

            /**
             * Dispose the instance (detach listeners and clear all bindings).
             */
            function dispose() {
                detach();
                _bindings.length = 0;
                _contextStack.length = 0;
            }

            /**
             * Create a scoped sub-controller. Every `bind(...)` called through
             * the returned scope is tracked ; calling `scope.dispose()` (or
             * `scope.clear()`) unbinds them all at once **without** disposing
             * the parent instance.
             *
             * Intended for `ui.mount(blockId, null, () => kb.scope())` so a
             * modal/component's keybindings are auto-detached when the block
             * is cleared.
             *
             * @returns {{
             *   bind: Function, unbind: Function,
             *   pushContext: Function, popContext: Function,
             *   dispose: Function, clear: Function
             * }}
             */
            function scope() {
                const unbinders = new Set();

                function scopeBind(...args) {
                    // @ts-ignore - spread forwarding of variadic handler args
                    const off = bind(...args);
                    unbinders.add(off);
                    return off;
                }

                function clear() {
                    for (const off of unbinders) {
                        try { off(); } catch { /* swallow */ }
                    }
                    unbinders.clear();
                }

                return {
                    bind: scopeBind,
                    unbind,
                    pushContext,
                    popContext,
                    dispose: clear,
                    clear,
                };
            }

            return {
                bind,
                unbind,
                pushContext,
                popContext,
                currentContext,
                list,
                match,
                attach,
                detach,
                dispose,
                scope,
            };
        }

        return { create, parse };
    }
};
