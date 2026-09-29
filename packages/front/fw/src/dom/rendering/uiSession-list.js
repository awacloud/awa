// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Keyed-list controller (`UIList`) and the session-level
 * `list()` method that wires it into {@link UISession}. Each list manages a
 * `${slotName}` of a parent block and exposes incremental + reconciling
 * mutations (`sync`/`upsert`/`update`/`remove`/`move`/`clear` …) plus
 * per-item proxies onto `UISession`.
 *
 * Distributed as a standalone fw module so its factory is serializable
 * (worker-safe).
 *
 */

import { template } from './template.js';
import { render } from './render.js';
import { dom } from '../query/dom.js';

/**
 * Result delta returned by `UIList#sync`.
 * @typedef {object} UiListSyncDelta
 * @property {Set<string>} added Keys added this sync.
 * @property {Set<string>} kept Keys unchanged this sync.
 * @property {Set<string>} updated Keys whose data changed.
 * @property {Set<string>} removed Keys removed this sync.
 * @property {boolean} reordered Whether the DOM order was rebuilt.
 */

/**
 * Keyed-list controller managing one `${slot}` of a parent block.
 * @typedef {object} UiListInstance
 * @property {number} size Current item count (getter).
 * @property {(key: *) => boolean} has Whether a key is present.
 * @property {(key: *) => *} get Item data for a key, or `undefined`.
 * @property {() => IterableIterator<string>} keys Iterate keys in order.
 * @property {() => IterableIterator<[string, *]>} entries Iterate `[key, item]` pairs in order.
 * @property {() => IterableIterator<*>} values Iterate items in order.
 * @property {(key: *) => (Element|null)} element Live root element for a key, or `null`.
 * @property {(key: *) => string} itemId Internal block id for a key.
 * @property {(key: *) => *} meta Meta value computed by `metaFn`, or `undefined`.
 * @property {(key: *, ...rest: *[]) => *} attr Proxy onto `ui.attr` for a row.
 * @property {(key: *, ...rest: *[]) => *} text Proxy onto `ui.text` for a row.
 * @property {(key: *, ...rest: *[]) => *} on Proxy onto `ui.on` for a row.
 * @property {(key: *, selector: string) => (Element|null)} query First selector match inside a row.
 * @property {(key: *, selector: string) => (NodeList|Array)} queryAll All selector matches inside a row.
 * @property {(item: *) => string} push Append an item; returns its key.
 * @property {(item: *) => string} prepend Prepend an item; returns its key.
 * @property {(item: *, beforeKey?: *) => string} insert Insert before `beforeKey` (or append); returns its key.
 * @property {(item: *) => ('added'|'updated'|'unchanged')} upsert Add or update by key.
 * @property {(key: *, item: *) => ('updated'|'unchanged')} update Update an existing key; throws if absent.
 * @property {(key: *) => boolean} remove Remove a key; returns whether it existed.
 * @property {(key: *, beforeKey?: *) => boolean} move Reorder a key before `beforeKey` (or to the end).
 * @property {() => void} clear Remove all items.
 * @property {(items: Array, opts?: { idPrefix?: string }) => UiListInstance} adopt Adopt SSR rows without touching the DOM; returns `this`.
 * @property {(items: Array) => UiListSyncDelta} sync Reconcile the list against `items`; returns the change delta.
 */

/**
 * Constructor signature of the `UIList` class returned by the factory.
 * @typedef {new (session: object, parentBlockId: string, slotName: string, opts: object) => UiListInstance} UiListCtor
 */

/**
 * `list()` method mixed onto the `UISession` prototype.
 * @typedef {object} UiSessionListMethods
 * @property {(parentBlockId: string, slotName: string, options: object) => UiListInstance} list Get or create the keyed list for a `(parentBlockId, slotName)` slot.
 */

/**
 * Value returned by `uiSessionList.factory()`.
 * @typedef {object} UiSessionListAPI
 * @property {UiListCtor} UIList The keyed-list controller class.
 * @property {UiSessionListMethods} methods Methods mixed onto the `UISession` prototype.
 */

export const uiSessionList = {
    name: 'uiSessionList',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['template', 'render', 'dom'],
    deps: [template, render, dom],

    /** @returns {UiSessionListAPI} */
    factory(template, render, dom) {

        // ── eqFn presets ────────────────────────────────────────────────────
        // Accept a string preset, a function, or undefined (→ Object.is).
        // Presets :
        //   'shallow' - Object.is on each key of the two objects, with same
        //               key set. Fast, allocation-free in the equal path.
        //   'deep'    - recursive structural compare for plain objects, arrays
        //               and primitives. Bounded to depth 8 to avoid runaway
        //               on cycles ; cycles return false.

        function _shallowEq(a, b) {
            if (Object.is(a, b)) return true;
            if (a == null || b == null) return false;
            if (typeof a !== 'object' || typeof b !== 'object') return false;
            const ka = Object.keys(a);
            const kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (const k of ka) {
                if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
                if (!Object.is(a[k], b[k])) return false;
            }
            return true;
        }

        function _deepEq(a, b, depth) {
            if (Object.is(a, b)) return true;
            if (depth <= 0) return false;
            if (a == null || b == null) return false;
            if (typeof a !== 'object' || typeof b !== 'object') return false;
            const aIsArr = Array.isArray(a);
            const bIsArr = Array.isArray(b);
            if (aIsArr !== bIsArr) return false;
            if (aIsArr) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; ++i) {
                    if (!_deepEq(a[i], b[i], depth - 1)) return false;
                }
                return true;
            }
            const ka = Object.keys(a);
            const kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (const k of ka) {
                if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
                if (!_deepEq(a[k], b[k], depth - 1)) return false;
            }
            return true;
        }

        function _resolveEqFn(eqFn) {
            if (typeof eqFn === 'function') return eqFn;
            if (eqFn === 'shallow') return _shallowEq;
            if (eqFn === 'deep')    return (a, b) => _deepEq(a, b, 8);
            // Default - reference / value identity. Safe but conservative ;
            // re-fetches always look "changed" until a custom or preset eqFn
            // is configured.
            return Object.is;
        }

        class UIList {
            constructor(session, parentBlockId, slotName, opts) {
                if (!opts || typeof opts.keyFn !== 'function')
                    throw new Error('uiSession.list: options.keyFn is required');
                if (!opts.block || !Array.isArray(opts.block.template))
                    throw new Error('uiSession.list: options.block (ParseResult) is required');

                this._ui       = session;
                this._parent   = parentBlockId;
                this._slot     = slotName;
                this._keyFn    = opts.keyFn;
                this._block    = opts.block;
                this._eq       = _resolveEqFn(opts.eqFn);
                this._onMount  = typeof opts.onMount  === 'function' ? opts.onMount  : null;
                this._onRemove = typeof opts.onRemove === 'function' ? opts.onRemove : null;
                this._onEnter  = typeof opts.onEnter  === 'function' ? opts.onEnter  : null;
                this._onLeave  = typeof opts.onLeave  === 'function' ? opts.onLeave  : null;
                // onUpdate: 'replace' (default) | 'patch' | 'none' | function.
                this._onUpdate = opts.onUpdate ?? 'replace';
                // Sub-iterates aren't safe to patch in place.
                if (this._onUpdate === 'patch' &&
                    opts.block?.iterates &&
                    Object.keys(opts.block.iterates).length > 0) {
                    this._onUpdate = 'replace';
                }
                this._dataFn   = typeof opts.dataFn === 'function' ? opts.dataFn : null;
                this._metaFn   = typeof opts.metaFn === 'function' ? opts.metaFn : null;
                this._order    = [];
                this._data     = new Map();
                this._meta     = new Map();
                this._disposed = false;
                this._slotEl   = null;
            }

            // Internal - called by uiSession when the parent block is removed.
            _dispose() {
                this._order = [];
                this._data.clear();
                this._meta.clear();
                this._slotEl = null;
                this._disposed = true;
            }

            _ensureAlive() {
                if (this._disposed)
                    throw new Error(
                        `uiSession.list: list on (${this._parent}, ${this._slot}) is disposed ` +
                        `(its parent block was removed). Create a new list after re-mounting the parent.`
                    );
            }

            // ── Internals ────────────────────────────────────────────────────

            _itemId(key) {
                // Namespaced id using the Unit Separator (U+001F).
                return `${this._parent}\x1flist\x1f${this._slot}\x1f${key}`;
            }

            _key(item) {
                const k = this._keyFn(item);
                if (k === undefined || k === null)
                    throw new Error('uiSession.list: keyFn returned null/undefined');
                return String(k);
            }

            _slotElement() {
                if (this._slotEl) return this._slotEl;
                const el = this._ui._resolveSlotElement(this._parent, this._slot);
                if (!el) throw new Error(
                    `uiSession.list: slot '${this._slot}' not resolved on block '${this._parent}' ` +
                    `(parent must be rendered with a \${${this._slot}} slot before creating the list)`
                );
                this._slotEl = el;
                return el;
            }

            _addItem(key, item, prepend = false) {
                this._slotElement();
                const data = this._dataFn ? this._dataFn(item) : item;
                this._ui.add([{
                    id:     this._itemId(key),
                    attach: { elm: this._parent, name: this._slot },
                    block:  this._block,
                    data,
                    prepend,
                }]);
                this._data.set(key, item);
                if (this._metaFn) this._meta.set(key, this._metaFn(item));
                if (this._onMount) this._onMount(key, item);
                if (this._onEnter) {
                    const el = this._ui.get(this._itemId(key));
                    if (el) {
                        try { Promise.resolve(this._onEnter(key, el, item)); }
                        catch { /* never break the add flow */ }
                    }
                }
            }

            _removeItem(key) {
                if (this._onRemove) {
                    const item = this._data.get(key);
                    try { this._onRemove(key, item); }
                    catch { /* user hook ; never break the removal flow */ }
                }
                if (this._onLeave) {
                    const el = this._ui.get(this._itemId(key));
                    const item = this._data.get(key);
                    if (el) {
                        let res;
                        try { res = this._onLeave(key, el, item); }
                        catch { res = null; }
                        if (res && typeof res.then === 'function') {
                            this._meta.delete(key);
                            res.then(
                                () => this._ui.clear(this._itemId(key)),
                                () => this._ui.clear(this._itemId(key)),
                            );
                            return;
                        }
                    }
                }
                this._ui.clear(this._itemId(key));
                this._meta.delete(key);
            }

            // Returns 'replaced' | 'patched' | 'unchanged'.
            _replaceItem(key, item) {
                const old = this._data.get(key);
                if (this._onUpdate === 'none') {
                    this._data.set(key, item);
                    if (this._metaFn) this._meta.set(key, this._metaFn(item));
                    return 'unchanged';
                }
                if (this._onUpdate === 'patch') {
                    this._patchItem(key, old, item);
                    return 'patched';
                }
                if (typeof this._onUpdate === 'function') {
                    const r = this._onUpdate(key, old, item, this);
                    this._data.set(key, item);
                    if (this._metaFn) this._meta.set(key, this._metaFn(item));
                    return r === 'patched' || r === 'replaced' || r === 'unchanged' ? r : 'unchanged';
                }
                // Default 'replace' - clear+add.
                this._removeItem(key);
                this._addItem(key, item, false);
                return 'replaced';
            }

            _patchItem(key, oldItem, newItem) {
                const oldData = this._dataFn ? this._dataFn(oldItem) : oldItem;
                const newData = this._dataFn ? this._dataFn(newItem) : newItem;
                const blockId = this._itemId(key);
                const blockMap = this._ui._map.get(blockId);
                if (!blockMap) {
                    this._addItem(key, newItem, false);
                    return;
                }
                for (const parsedElm of this._block.template) {
                    if (!parsedElm.map || parsedElm.map.length === 0) continue;
                    const realId = blockMap.get(parsedElm.id);
                    if (!realId) continue;
                    const node = template.get(this._ui._container, realId);
                    if (!node) continue;

                    const newOut = render.applyParsedElm(parsedElm, newData);
                    const oldOut = render.applyParsedElm(parsedElm, oldData);

                    const handled = new Set();
                    for (const m of parsedElm.map) {
                        const key2 = (m.data ? 'a:' : 't:') + m.prop;
                        if (handled.has(key2)) continue;
                        handled.add(key2);
                        if (m.data) {
                            const nv = newOut.data[m.prop];
                            const ov = oldOut.data[m.prop];
                            if (nv === ov) continue;
                            if (nv === null || nv === false || nv === undefined)
                                dom.attrRemove(node, m.prop);
                            else
                                dom.attr(node, m.prop, nv);
                        } else {
                            const nv = newOut[m.prop];
                            const ov = oldOut[m.prop];
                            if (nv === ov) continue;
                            if (m.prop === 'text') dom.text(node, nv);
                            else                   dom.attr(node, m.prop, nv);
                        }
                    }
                }
                this._data.set(key, newItem);
                if (this._metaFn) this._meta.set(key, this._metaFn(newItem));
            }

            _reorderDom() {
                const slotEl = this._slotElement();
                const nodes  = this._order
                    .map(k => this._ui.get(this._itemId(k)))
                    .filter(Boolean);
                dom.reorder(slotEl, nodes);
            }

            // ── Read ─────────────────────────────────────────────────────────

            get size() { return this._order.length; }

            has(key)  { return this._data.has(String(key)); }
            get(key)  { return this._data.get(String(key)); }

            *keys()    { yield* this._order; }
            *entries() { for (const k of this._order) yield [k, this._data.get(k)]; }
            *values()  { for (const k of this._order) yield this._data.get(k); }
            [Symbol.iterator]() { return this.entries(); }

            element(key) {
                const k = String(key);
                if (!this._data.has(k)) return null;
                return this._ui.get(this._itemId(k));
            }

            itemId(key) { return this._itemId(String(key)); }

            meta(key) { return this._meta.get(String(key)); }

            // ── Per-item proxies onto uiSession ──────────────────────────────
            // `Reflect` is blocked by sanity/base.js - use native spread.

            attr(key, ...rest) {
                return this._ui.attr(this._itemId(String(key)), ...rest);
            }
            text(key, ...rest) {
                return this._ui.text(this._itemId(String(key)), ...rest);
            }
            on(key, ...rest) {
                return this._ui.on(this._itemId(String(key)), ...rest);
            }

            query(key, selector) {
                const node = this._ui.get(this._itemId(String(key)));
                if (!node) return null;
                return dom.query(node, selector);
            }

            queryAll(key, selector) {
                const node = this._ui.get(this._itemId(String(key)));
                if (!node) return [];
                return dom.queryAll(node, selector);
            }

            // ── Mutations ────────────────────────────────────────────────────

            push(item) {
                this._ensureAlive();
                const k = this._key(item);
                if (this._data.has(k))
                    throw new Error(`uiSession.list.push: duplicate key '${k}'`);
                this._addItem(k, item, false);
                this._order.push(k);
                return k;
            }

            prepend(item) {
                this._ensureAlive();
                const k = this._key(item);
                if (this._data.has(k))
                    throw new Error(`uiSession.list.prepend: duplicate key '${k}'`);
                this._addItem(k, item, true);
                this._order.unshift(k);
                return k;
            }

            insert(item, beforeKey) {
                this._ensureAlive();
                const k = this._key(item);
                if (this._data.has(k))
                    throw new Error(`uiSession.list.insert: duplicate key '${k}'`);
                this._addItem(k, item, false);
                const beforeIdx = beforeKey == null ? -1 : this._order.indexOf(String(beforeKey));
                if (beforeIdx === -1) {
                    this._order.push(k);
                } else {
                    this._order.splice(beforeIdx, 0, k);
                    this._reorderDom();
                }
                return k;
            }

            upsert(item) {
                this._ensureAlive();
                const k = this._key(item);
                if (this._data.has(k)) {
                    const old = this._data.get(k);
                    if (this._eq(old, item)) return 'unchanged';
                    const r = this._replaceItem(k, item);
                    // 'replaced' == clear+add : _addItem always appends at the
                    // slot's end, so the row's DOM position no longer matches
                    // its (unchanged) index in `_order` - restore it.
                    if (r === 'replaced') this._reorderDom();
                    return r === 'unchanged' ? 'unchanged' : 'updated';
                }
                this._addItem(k, item, false);
                this._order.push(k);
                return 'added';
            }

            update(key, item) {
                this._ensureAlive();
                const k = String(key);
                if (!this._data.has(k))
                    throw new Error(`uiSession.list.update: key '${k}' not found`);
                const old = this._data.get(k);
                if (this._eq(old, item)) return 'unchanged';
                const r = this._replaceItem(k, item);
                // See upsert() above : a 'replaced' row lands at the slot's end
                // regardless of its position in `_order` - restore it.
                if (r === 'replaced') this._reorderDom();
                return r === 'unchanged' ? 'unchanged' : 'updated';
            }

            remove(key) {
                this._ensureAlive();
                const k = String(key);
                if (!this._data.has(k)) return false;
                this._removeItem(k);
                this._data.delete(k);
                const idx = this._order.indexOf(k);
                if (idx !== -1) this._order.splice(idx, 1);
                return true;
            }

            move(key, beforeKey) {
                this._ensureAlive();
                const k = String(key);
                if (!this._data.has(k)) return false;
                const cur = this._order.indexOf(k);
                if (cur === -1) return false;
                this._order.splice(cur, 1);
                const beforeIdx = beforeKey == null ? -1 : this._order.indexOf(String(beforeKey));
                if (beforeIdx === -1) this._order.push(k);
                else this._order.splice(beforeIdx, 0, k);
                this._reorderDom();
                return true;
            }

            clear() {
                this._ensureAlive();
                for (const k of this._order) this._removeItem(k);
                this._order = [];
                this._data.clear();
            }

            /**
             * Adopt server-rendered (SSR) row nodes into the list's internal state -
             * dual of `sync()`. Where `sync` starts from a possibly empty state and
             * applies a diff (creating DOM as needed), `adopt` starts from an
             * SSR-rendered DOM and installs the list state **without touching the DOM**.
             *
             * Typical flow :
             *
             *   1. SSR  : `render.toHTML(panelTpl, vars, {
             *               iterates: { rows: initialRows }, idPrefix: 'app' })`
             *   2. Client : `ui.hydrate([{ id: 'panel', block: panelTpl }], { idPrefix: 'app' })`
             *   3. `const list = ui.list('panel', 'rows', { keyFn, block: rowTpl })`
             *   4. **`list.adopt(initialRows, { idPrefix: 'app' })`** ← reuses SSR DOM
             *   5. Later : `list.sync(newRows)` - unchanged items keep their SSR DOM
             *      node (focus / scroll / transitions intact).
             *
             * Prerequisites :
             *   - The slot must contain **exactly** `items.length` child element nodes
             *     (the SSR rows), in the same order as `items`. Throws otherwise.
             *   - The sub-template `options.block` must have a **single root** (standard
             *     case : `<li>`, `<tr>`, …). Multi-root sub-templates are not supported
             *     here ; SSR interleaving makes them ambiguous to adopt.
             *   - Each descendant of the root must carry the `data-fw-id` attribute
             *     produced by `render.toHTML` - the parser elm id, prefixed by
             *     `idPrefix:`.
             *
             * Effects :
             *   - The `onMount(key, item)` hook fires for each row (parity with
             *     `_addItem`).
             *   - The `onEnter` hook is **not** called : rows are already mounted on
             *     the client, replaying the enter animation would be jarring.
             *
             * @param {Array} items
             * @param {Object} [opts]
             * @param {string} [opts.idPrefix=''] - Same prefix passed to
             *   `render.toHTML(... { idPrefix })`.
             * @returns {this}
             */
            adopt(items, opts = {}) {
                this._ensureAlive();
                if (!Array.isArray(items))
                    throw new Error('uiSession.list.adopt: items must be an array');
                if (this._order.length > 0)
                    throw new Error(
                        `uiSession.list.adopt: list on (${this._parent}, ${this._slot}) ` +
                        `is not empty (${this._order.length} item(s)). adopt() must run ` +
                        `on a freshly-created list, before any push/sync/upsert.`
                    );

                const idPrefix = opts.idPrefix || '';
                const slotEl   = this._slotElement();
                // Single-root row templates : the row's parser-time root element
                // is the slot's direct child. Filter to element nodes (skip text /
                // comment nodes possibly left by formatters).
                const rowRoots = Array.from(slotEl.children);
                if (rowRoots.length !== items.length) {
                    throw new Error(
                        `uiSession.list.adopt: row count mismatch - slot '${this._slot}' ` +
                        `contains ${rowRoots.length} child element(s) but ${items.length} ` +
                        `item(s) were passed. SSR and client must agree on the initial set.`
                    );
                }

                // Validate the row template has a single root (the common case).
                const tmpl     = this._block.template;
                const tmplRoots = tmpl.filter(e => e.parent == null);
                if (tmplRoots.length !== 1) {
                    throw new Error(
                        `uiSession.list.adopt: row template must have exactly one root ` +
                        `(found ${tmplRoots.length}). Multi-root row templates can't be ` +
                        `unambiguously adopted - recreate via push/sync instead.`
                    );
                }
                const rootParserId = tmplRoots[0].id;
                const containerName = this._ui._container;
                const fwId = (parserId) => idPrefix ? `${idPrefix}:${parserId}` : parserId;

                // Seen-keys guard (mirror sync's invariant).
                const seen = new Set();

                for (let i = 0; i < items.length; ++i) {
                    const item    = items[i];
                    const rowNode = rowRoots[i];
                    const key     = this._key(item);
                    if (seen.has(key))
                        throw new Error(`uiSession.list.adopt: duplicate key '${key}'`);
                    seen.add(key);

                    const blockId  = this._itemId(key);
                    const blockMap = new Map();   // parserId → realId

                    // The realId namespace is rooted on the item's blockId so
                    // multiple rows sharing the same parser ids (collision is
                    // expected in iterate SSR output) end up with unique realIds
                    // in the template context map.
                    for (const elm of tmpl) {
                        let node;
                        if (elm.id === rootParserId) {
                            node = rowNode;
                        } else {
                            // Search within the row subtree to avoid cross-row
                            // collisions on data-fw-id (SSR iterate emits the
                            // same id for the same elm across all rows).
                            node = rowNode.querySelector(
                                `[data-fw-id="${CSS.escape(fwId(elm.id))}"]`
                            );
                        }
                        if (!node) {
                            throw new Error(
                                `uiSession.list.adopt: row ${i} (key='${key}'): no DOM ` +
                                `node found for data-fw-id="${fwId(elm.id)}" ` +
                                `(elm.id='${elm.id}'). Check that SSR was rendered with ` +
                                `idPrefix='${idPrefix}' and the same row template.`
                            );
                        }
                        const realId       = `${blockId}\x1f${elm.id}`;
                        const parentRealId = elm.parent != null
                            ? `${blockId}\x1f${elm.parent}`
                            : undefined;
                        template.adoptNode(containerName, realId, node, parentRealId);
                        blockMap.set(elm.id, realId);
                    }

                    // Register in session : block map + parent→child tracking
                    // so ui.clear(parent) cascades into adopted rows.
                    this._ui._map.set(blockId, blockMap);
                    let kids = this._ui._children.get(this._parent);
                    if (!kids) { kids = new Set(); this._ui._children.set(this._parent, kids); }
                    kids.add(blockId);

                    // List-internal bookkeeping.
                    this._data.set(key, item);
                    if (this._metaFn) this._meta.set(key, this._metaFn(item));
                    this._order.push(key);

                    // Fire onMount (parity with _addItem). onEnter intentionally
                    // skipped - the row is already mounted on the client; running
                    // the enter animation here would be jarring.
                    if (this._onMount) {
                        try { this._onMount(key, item); }
                        catch { /* never break the adopt flow */ }
                    }
                }

                return this;
            }

            sync(items) {
                this._ensureAlive();
                if (!Array.isArray(items))
                    throw new Error('uiSession.list.sync: items must be an array');

                const newKeys = new Array(items.length);
                const seen = new Set();
                for (let i = 0; i < items.length; ++i) {
                    const k = this._key(items[i]);
                    if (seen.has(k))
                        throw new Error(`uiSession.list.sync: duplicate key '${k}'`);
                    seen.add(k);
                    newKeys[i] = k;
                }

                const delta = {
                    added:    new Set(),
                    kept:     new Set(),
                    updated:  new Set(),
                    removed:  new Set(),
                    reordered: false,
                };

                // Phase 1 : prune disappeared keys.
                this._order = this._order.filter(k => {
                    if (seen.has(k)) return true;
                    this._removeItem(k);
                    this._data.delete(k);
                    delta.removed.add(k);
                    return false;
                });

                // Phase 2 : add / update / keep.
                let anyReplaced = false;
                for (let i = 0; i < items.length; ++i) {
                    const k = newKeys[i];
                    const item = items[i];
                    if (!this._data.has(k)) {
                        this._addItem(k, item, false);
                        delta.added.add(k);
                    } else {
                        const old = this._data.get(k);
                        if (this._eq(old, item)) {
                            delta.kept.add(k);
                        } else {
                            const r = this._replaceItem(k, item);
                            if (r === 'unchanged') {
                                delta.kept.add(k);
                            } else {
                                delta.updated.add(k);
                                // 'replaced' == clear+add : the row lands at the
                                // slot's end regardless of its key-sequence
                                // position, so the key-sequence diff below can't
                                // see it - force the reorder pass.
                                if (r === 'replaced') anyReplaced = true;
                            }
                        }
                    }
                }

                // Phase 3 : compute effective order vs newKeys ; reorder if needed.
                const phase2Order = [...this._order];
                for (const k of newKeys) {
                    if (delta.added.has(k)) phase2Order.push(k);
                }
                let needsReorder = anyReplaced;
                if (!needsReorder) {
                    for (let i = 0; i < newKeys.length; ++i) {
                        if (phase2Order[i] !== newKeys[i]) { needsReorder = true; break; }
                    }
                }
                this._order = newKeys;
                if (needsReorder) {
                    this._reorderDom();
                    delta.reordered = true;
                }
                return delta;
            }
        }

        // The `list()` method installed on UISession.prototype. Idempotent
        // per `(parentBlockId, slotName)`.
        const methods = {
            list(parentBlockId, slotName, options) {
                let slots = this._lists.get(parentBlockId);
                if (slots && slots.has(slotName)) {
                    const existing = slots.get(slotName);
                    if (options && options.block && options.block !== existing._block)
                        throw new Error(
                            `uiSession.list: list on (${parentBlockId}, ${slotName}) ` +
                            `already exists with a different block - pass the same ` +
                            `ParseResult, or remove the parent first.`
                        );
                    return existing;
                }
                const list = new UIList(this, parentBlockId, slotName, options);
                if (!slots) {
                    slots = new Map();
                    this._lists.set(parentBlockId, slots);
                }
                slots.set(slotName, list);
                return list;
            },
        };

        return /** @type {UiSessionListAPI} */ (/** @type {any} */ ({ UIList, methods }));
    },
};
