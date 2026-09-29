// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Core methods mixin for {@link UISession} - lifecycle, lookup
 * and structural mutations : parse, get/iterate/query, add/append/prepend,
 * hydrate, remove/clear/move/replace, adopt/onUnmount/onMount, and portal.
 *
 * Distributed as a standalone fw module so the factory is serializable
 * (worker-safe) and can be resolved independently by tooling.
 *
 */

import { template } from './template.js';
import { render } from './render.js';
import { parser } from './parser.js';
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

/**
 * Core lifecycle / lookup / mutation methods mixed onto the `UISession`
 * prototype. `this` is a `UISession`; chainable mutators return that instance.
 * @typedef {object} UiSessionCoreMethods
 * @property {(htmlString: string) => object} parse Shortcut for `parser.fromHTML`; returns a parse result.
 * @property {(blockId: string, logicalId?: string) => (Element|null)} get Resolve a block/element pair to a live DOM node.
 * @property {(parentBlockId: string, slotName: string) => (Element|null)} _resolveSlotElement Resolve a declared `${slot}` to its container element.
 * @property {(blockId: string, logicalId: string, selector: string) => (Element|null)} query First selector match inside the addressed node.
 * @property {(blockId: string, logicalId: string, selector: string) => (NodeList|Array)} queryAll All selector matches inside the addressed node.
 * @property {(blockId: string) => IterableIterator<[string, Element]>} iterate Generator yielding `[logicalId, element]` pairs.
 * @property {(blockId: string, logicalId?: string) => boolean} exists Whether a block (or descendant) is registered.
 * @property {(items: Array, opts?: object) => object} hydrate Adopt SSR DOM; returns the session (`this`).
 * @property {(items: Array) => object} add Render and append items; returns the session (`this`).
 * @property {(items: Array) => object} append Alias for `add`; returns the session (`this`).
 * @property {(items: Array) => object} prepend Render items before existing children; returns the session (`this`).
 * @property {(blockId: string, slotName: (string|null), factory: (element: Element, blockId: string) => object) => (object|null)} mount Resolve an element, call `factory`, adopt the controller; returns the controller.
 * @property {(blockId: string, resource: (Function|object)) => (Function|object)} adopt Register a cleanup resource; returns the resource.
 * @property {(blockId: string, fn?: Function) => object} onUnmount Set/clear an unmount hook; returns the session (`this`).
 * @property {(blockId: string, fn?: Function) => object} onMount Set/fire a mount hook; returns the session (`this`).
 * @property {(ids: Array<string>) => void} _fireMount Fire queued mount hooks for the given ids.
 * @property {(blockId: string) => void} _fireUnmount Fire and clear the unmount hook for a block.
 * @property {(name: string) => object} off Remove a managed listener by name; returns the session (`this`).
 * @property {(blockId: string, logicalId?: string) => void} _offTracked Remove tracked listeners for a block/descendant.
 * @property {(blockId: string, logicalId?: string) => object} remove Remove a descendant element; returns the session (`this`).
 * @property {(blockId?: string, logicalId?: string) => object} clear Clear all / a block / a descendant; returns the session (`this`).
 * @property {(blockId: string, logicalId: string, targetBlockId: string, targetLogicalId: string) => object} move Move a node under a new parent; returns the session (`this`).
 * @property {(blockId: string, items: Array) => object} replace Clear a block then add items; returns the session (`this`).
 * @property {(name: string, opts?: object) => object} portal Open/return an out-of-tree portal session.
 * @property {(name: string) => object} closePortal Close a portal; returns the session (`this`).
 * @property {(blockId: string) => void} _disposeListsFor Dispose any `UIList`s owned by a block.
 */

/**
 * Value returned by `uiSessionCore.factory()`.
 * @typedef {object} UiSessionCoreAPI
 * @property {UiSessionCoreMethods} methods Methods mixed onto the `UISession` prototype.
 * @property {(item: object) => object} resolveTemplate Resolve a render item's `template` field; shared by `add`/`hydrate`.
 */

export const uiSessionCore = {
    name: 'uiSessionCore',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['template', 'render', 'parser', 'dom', 'events'],
    deps: [template, render, parser, dom, events],

    /** @returns {UiSessionCoreAPI} */
    factory(template, render, parser, dom, events) {

        /**
         * Resolve a render item's `template` field from either an explicit
         * `item.template` array or from an iterate-block slot inside
         * `item.block`. Shared between `add` and `hydrate`.
         *
         * @param {Object} item - Input render item.
         * @returns {Object} Resolved item guaranteed to have a `template` array.
         */
        function resolveTemplate(item) {
            if (item.template) return item;
            if (!item.block) return item;

            const name = item.attach?.name;
            const tmpl = (name && item.block.iterates?.[name])
                ? item.block.iterates[name]
                : item.block.template;

            const resolved = { ...item, template: tmpl };
            delete resolved.block;
            return resolved;
        }

        const methods = {

            // ── Parsing ──────────────────────────────────────────────────────

            /** Shortcut for `parser.fromHTML(htmlString)`. */
            parse(htmlString) {
                return parser.fromHTML(htmlString);
            },

            // ── Read ─────────────────────────────────────────────────────────

            /**
             * Resolve a logical block/element pair to a live DOM node.
             *
             * **Two-arg form** `get(blockId, logicalId)` looks up the descendant
             * identified by `logicalId` inside the block.
             *
             * **One-arg form** `get(blockId)` returns the **root** element of
             * the block. Loop-rendered blocks (`add({data: <array>})`) return
             * `null` for both forms.
             */
            get(blockId, logicalId) {
                const blockMap = this._map.get(blockId);
                if (!blockMap) return null;
                if (Array.isArray(blockMap)) return null;

                if (logicalId !== undefined) {
                    const realId = blockMap.get(logicalId);
                    if (!realId) return null;
                    return template.get(this._container, realId);
                }
                const realId = blockMap.get(blockId) ?? blockMap.values().next().value;
                if (!realId) return null;
                return template.get(this._container, realId);
            },

            /**
             * Resolve a `${slotName}` declared in `parentBlockId`'s template to
             * its live DOM container. Internal helper for `list()`.
             */
            _resolveSlotElement(parentBlockId, slotName) {
                const realId = this._attach.get(parentBlockId)?.content?.get(slotName);
                if (!realId) return null;
                return template.get(this._container, realId);
            },

            /** First match of selector inside (blockId, logicalId) → Element | null */
            query(blockId, logicalId, selector) {
                const node = this.get(blockId, logicalId);
                if (!node) return null;
                return dom.query(node, selector);
            },

            /** All matches of selector inside (blockId, logicalId) → NodeList | [] */
            queryAll(blockId, logicalId, selector) {
                const node = this.get(blockId, logicalId);
                if (!node) return [];
                return dom.queryAll(node, selector);
            },

            /**
             * Yield each `(logicalId, element)` pair for a mounted block, in
             * registration order.
             */
            *iterate(blockId) {
                const blockMap = this._map.get(blockId);
                if (!blockMap || Array.isArray(blockMap)) return;
                for (const [logicalId, realId] of blockMap) {
                    const node = template.get(this._container, realId);
                    if (node) yield [logicalId, node];
                }
            },

            exists(blockId, logicalId) {
                const m = this._map.get(blockId);
                if (!m) return false;
                if (Array.isArray(m)) {
                    if (logicalId == null) return m.length > 0;
                    return false;
                }
                if (logicalId == null) return true;
                return m.has(logicalId);
            },

            // ── Write : render & mount ───────────────────────────────────────

            /**
             * Adopt an SSR-rendered DOM tree - instead of materialising new
             * elements, walks the existing DOM under the session's container
             * to find nodes marked with `data-fw-id` and registers them in
             * the session's internal maps.
             *
             * Pre-requisite : the HTML must have been produced by
             * `render.toHTML(items, data, { hydrate: true, idPrefix })`.
             *
             * **Iterate blocks** (`<!-- $name -->…<!-- name$ -->`) : `hydrate`
             * adopts the wrapper element of the iterate but **not** the
             * per-row children (their parser ids collide across rows so they
             * cannot be addressed by `data-fw-id` alone). To reuse SSR rows :
             *
             *     ui.hydrate([{ id: 'panel', block: panelTpl, data: vars }],
             *                { idPrefix: 'app' });
             *     const rows = ui.list('panel', 'rows', { keyFn, block: rowTpl });
             *     rows.adopt(initialRows, { idPrefix: 'app' });   // ← takes ownership
             *
             * See `UIList#adopt` (`uiSession-list.js`) for full semantics.
             *
             * **Mismatch recovery (v2)** : pass `opts.onMismatch` to control
             * what happens when a `data-fw-id` expected by the client is
             * absent from the SSR markup (typical : server / client deployed
             * different templates).
             *   - `'throw'` (default) : abort with a detailed error.
             *   - `'rebuild'` : the impacted item is queued for `ui.add()`
             *     after the hydrate pass - client-side render replaces any
             *     leftover SSR DOM.
             *   - `'skip'` : silently drop the item ; subsequent ui.text/attr
             *     calls targeting it will be no-ops.
             *   - `function(info)` : custom decision, returns one of the
             *     above strings. `info = { blockId, elm, realId, item, idPrefix }`.
             *
             * @param {Array}  items
             * @param {Object} [opts]
             * @param {string} [opts.idPrefix='']
             * @param {'throw'|'rebuild'|'skip'|Function} [opts.onMismatch='throw']
             */
            hydrate(items, opts = {}) {
                if (!Array.isArray(items))
                    throw new Error('uiSession.hydrate: items must be an array');

                const idPrefix = opts.idPrefix || '';
                const root     = template.container(this._container);
                if (!root)
                    throw new Error(
                        `uiSession.hydrate: container '${this._container}' is not initialized ` +
                        `(call template.init first)`
                    );

                const fwId = (parserId) => idPrefix ? `${idPrefix}:${parserId}` : parserId;
                const findNode = (parserId) => {
                    const sel = `[data-fw-id="${CSS.escape(fwId(parserId))}"]`;
                    return root.querySelector(sel);
                };

                // ── Mismatch policy ─────────────────────────────────────────
                // Options :
                //   'throw'   (default) - strict ; abort the entire hydrate call
                //   'rebuild' - fall back to ui.add() for the impacted item
                //   function  - custom : `(info) => 'throw' | 'rebuild' | 'skip'`
                //     info = { blockId, elm, realId, item, idPrefix }
                //
                // Returns an array of items that need a rebuild after the loop.
                const onMismatch = opts.onMismatch || 'throw';
                const _rebuildQueue = [];

                function _decideMismatch(info) {
                    if (typeof onMismatch === 'function') {
                        try { return onMismatch(info); }
                        catch { return 'throw'; }
                    }
                    return onMismatch;
                }

                outer:
                for (const rawItem of items) {
                    const item = resolveTemplate(rawItem);
                    const tmpl = item.template;
                    if (!tmpl) continue;

                    const blockId  = item.id;
                    const blockMap = new Map();
                    const slotMap  = new Map();

                    for (const elm of tmpl) {
                        const realId = fwId(elm.id);
                        const node   = findNode(elm.id);
                        if (!node) {
                            const decision = _decideMismatch({
                                blockId, elm, realId, item, idPrefix,
                            });
                            if (decision === 'rebuild') {
                                _rebuildQueue.push(rawItem);
                                continue outer;
                            }
                            if (decision === 'skip') {
                                continue outer;
                            }
                            // 'throw' or unknown decision : strict default.
                            throw new Error(
                                `uiSession.hydrate: no DOM node found for ` +
                                `data-fw-id="${realId}" (block '${blockId ?? '<anonymous>'}', ` +
                                `template elm id='${elm.id}'). ` +
                                `Check that SSR was rendered with idPrefix='${idPrefix}' ` +
                                `and the same template as the client. ` +
                                `Pass opts.onMismatch='rebuild' to fall back to client render.`
                            );
                        }
                        const parentRealId = elm.parent ? fwId(elm.parent) : undefined;
                        // Hydrate is idempotent on the same nodes : skip the
                        // strict adoptNode call when this id is already in
                        // the map. template.adoptNode itself throws on
                        // duplicates (audit fix : was a silent no-op that
                        // hid SSR mismatches), so we filter here.
                        if (!template.has(this._container, realId)) {
                            template.adoptNode(this._container, realId, node, parentRealId);
                        }

                        blockMap.set(elm.id, realId);
                        if (elm.content) slotMap.set(elm.content, realId);
                    }

                    if (blockId) {
                        this._map.set(blockId, blockMap);
                        if (slotMap.size > 0) {
                            this._attach.set(blockId, { content: slotMap });
                        }
                    }
                    if (blockId && item.attach && item.attach.elm) {
                        let kids = this._children.get(item.attach.elm);
                        if (!kids) { kids = new Set(); this._children.set(item.attach.elm, kids); }
                        kids.add(blockId);
                    }
                }
                // Fire mount hooks for items that were successfully hydrated.
                this._fireMount(items.map(i => i && i.id).filter(Boolean));
                // Now rebuild the items that failed hydration. ui.add will
                // render fresh DOM and replace any leftover SSR markers.
                if (_rebuildQueue.length > 0) {
                    this.add(_rebuildQueue);
                }
                return this;
            },

            /** Render and append items into the context (or their attach slot). */
            add(items) {
                const resolved = items.map(resolveTemplate);
                for (const item of items) {
                    if (item && item.id && item.attach && item.attach.elm) {
                        let kids = this._children.get(item.attach.elm);
                        if (!kids) { kids = new Set(); this._children.set(item.attach.elm, kids); }
                        kids.add(item.id);
                    }
                }
                const result = render.full(resolved, this._attach, this._map);
                template.elms(this._container, result.arr);
                this._fireMount(items.map(i => i && i.id).filter(Boolean));
                return this;
            },

            append(items) {
                return this.add(items);
            },

            prepend(items) {
                return this.add(items.map(item => ({ prepend: true, ...item })));
            },

            // ── Lifecycle hooks (adopt / onUnmount / onMount) ───────────────

            /**
             * Generic mount helper - resolve a slot (or the block root), call
             * `factory(element, blockId)`, then `adopt()` the returned
             * controller so its `dispose()` fires automatically when the
             * block is unmounted.
             *
             * Designed as the standalone-friendly integration point for
             * external widgets : `virtualScroll`, `chart`, `eventBus.scope`,
             * any future module exposing `{ dispose | destroy | abort | close | stop }`.
             * The framework never depends on these modules - the consumer
             * passes the factory, fw bridges lifecycle.
             *
             * @example
             *   ui.mount('panel', 'list-slot', el =>
             *       virtualScroll.create({ container: el, total, itemHeight, renderItem })
             *   );
             *
             *   ui.mount('chart-block', 'canvas-slot', el =>
             *       chart.line({ el, data })
             *   );
             *
             *   const bus = ui.mount('panel', null, () => eventBus.scope());
             *   bus.on('app:notify', show);
             *
             * @param {string}      blockId   - Block to bind lifecycle to.
             * @param {string|null} slotName  - Slot name inside the block, or
             *   `null`/`undefined` to use the block root.
             * @param {(element: Element, blockId: string) => object} factory
             *   - Receives the resolved element + the blockId. Should return
             *   the controller (anything with a dispose-like method, or `null`
             *   when no cleanup is needed).
             * @returns {object|null} The factory's return value, unmodified.
             */
            mount(blockId, slotName, factory) {
                if (typeof factory !== 'function')
                    throw new Error('uiSession.mount: factory must be a function');
                const el = slotName
                    ? this._resolveSlotElement(blockId, slotName)
                    : this.get(blockId);
                if (!el) {
                    throw new Error(
                        `uiSession.mount: no ${slotName ? `slot '${slotName}'` : 'root'} ` +
                        `resolved for block '${blockId}' (mount the block before calling mount)`
                    );
                }
                const ctrl = factory(el, blockId);
                if (ctrl && (typeof ctrl === 'object' || typeof ctrl === 'function')) {
                    // Only adopt if the controller exposes a recognizable
                    // cleanup hook (dispose/destroy/abort/close/stop or fn).
                    const hasCleanup = typeof ctrl === 'function'
                        || ctrl.dispose || ctrl.destroy || ctrl.abort
                        || ctrl.close || ctrl.stop || ctrl.clear;
                    if (hasCleanup) this.adopt(blockId, ctrl);
                }
                return ctrl;
            },

            adopt(blockId, resource) {
                const cleanup = typeof resource === 'function' ? resource
                    : (resource && (resource.dispose || resource.destroy
                                 || resource.abort   || resource.close
                                 || resource.stop    || resource.clear));
                if (typeof cleanup !== 'function') {
                    throw new Error(
                        'uiSession.adopt: resource must be a function or expose ' +
                        'one of {dispose, destroy, abort, close, stop, clear}'
                    );
                }
                const prev = this._unmount.get(blockId);
                this._unmount.set(blockId, () => {
                    try { cleanup.call(resource); } catch { /* swallow */ }
                    if (prev) prev();
                });
                return resource;
            },

            onUnmount(blockId, fn) {
                if (typeof fn === 'function') this._unmount.set(blockId, fn);
                else this._unmount.delete(blockId);
                return this;
            },

            onMount(blockId, fn) {
                if (typeof fn !== 'function') {
                    this._mount.delete(blockId);
                    return this;
                }
                if (this._map.has(blockId)) {
                    try { fn(); } catch { /* swallow */ }
                } else {
                    this._mount.set(blockId, fn);
                }
                return this;
            },

            _fireMount(ids) {
                for (const id of ids) {
                    if (!id) continue;
                    const fn = this._mount.get(id);
                    if (!fn) continue;
                    this._mount.delete(id);
                    try { fn(); } catch { /* swallow */ }
                }
            },

            _fireUnmount(blockId) {
                const fn = this._unmount.get(blockId);
                if (!fn) return;
                this._unmount.delete(blockId);
                try { fn(); } catch { /* swallow ; never break unmount */ }
            },

            // ── Listener tracking ───────────────────────────────────────────

            off(name) {
                events.off(name);
                for (const [, blockMap] of this._listeners) {
                    for (const [, set] of blockMap) {
                        set.delete(name);
                    }
                }
                return this;
            },

            _offTracked(blockId, logicalId) {
                const blockMap = this._listeners.get(blockId);
                if (!blockMap) return;
                if (logicalId == null) {
                    for (const set of blockMap.values()) {
                        for (const lname of set) events.off(lname);
                    }
                    this._listeners.delete(blockId);
                } else {
                    const set = blockMap.get(logicalId);
                    if (set) {
                        for (const lname of set) events.off(lname);
                        blockMap.delete(logicalId);
                    }
                }
            },

            // ── Mutation : remove / clear / move / replace ──────────────────

            remove(blockId, logicalId) {
                const realId = this._map.get(blockId)?.get(logicalId);
                if (realId) {
                    template.clearElm(this._container, realId);
                    this._map.get(blockId).delete(logicalId);
                    this._offTracked(blockId, logicalId);
                    if (this._map.get(blockId)?.size === 0) {
                        this._fireUnmount(blockId);
                        this._map.delete(blockId);
                        this._disposeListsFor(blockId);
                    }
                }
                return this;
            },

            clear(blockId, logicalId) {
                if (blockId == null) {
                    for (const bid of [...this._unmount.keys()]) this._fireUnmount(bid);
                    if (this._portals) {
                        for (const n of [...this._portals.keys()]) this.closePortal(n);
                    }
                    template.clearAll(this._container);
                    this._map.clear();
                    this._attach.clear();
                    this._children.clear();
                    for (const bid of [...this._listeners.keys()]) this._offTracked(bid);
                    this._listeners.clear();
                    for (const bid of [...this._lists.keys()])     this._disposeListsFor(bid);
                    this._lists.clear();
                } else if (logicalId != null) {
                    const realId = this._map.get(blockId)?.get(logicalId);
                    if (realId) template.clearIn(this._container, realId);
                } else {
                    const childIds = this._children.get(blockId);
                    if (childIds) {
                        for (const cid of [...childIds]) this.clear(cid);
                        this._children.delete(blockId);
                    }
                    this._fireUnmount(blockId);
                    const blockMap = this._map.get(blockId);
                    if (blockMap) {
                        blockMap.forEach(realId => template.clearElm(this._container, realId));
                        this._map.delete(blockId);
                    }
                    this._offTracked(blockId);
                    this._disposeListsFor(blockId);
                }
                return this;
            },

            move(blockId, logicalId, targetBlockId, targetLogicalId) {
                const node      = this.get(blockId, logicalId);
                const newParent = this.get(targetBlockId, targetLogicalId);
                if (node && newParent) template.move(this._container, node, newParent);
                return this;
            },

            replace(blockId, items) {
                this.clear(blockId);
                return this.add(items);
            },

            // ── Portal (out-of-tree rendering) ──────────────────────────────

            portal(name, opts = {}) {
                if (!this._portals) this._portals = new Map();
                const existing = this._portals.get(name);
                if (existing) return existing;

                const target = opts.to ?? (typeof document !== 'undefined' ? document.body : null);
                if (!target) throw new Error(`uiSession.portal: no target element resolved for '${name}'`);

                const portalCtxName = `${this._container}\x1fportal\x1f${name}`;
                template.init(portalCtxName, { to: target });

                // `this.constructor` avoids a circular dep on the orchestrator.
                // @ts-ignore - this is a constructor function; TS cannot verify dynamic class construction pattern
                const portalSession = new this.constructor(portalCtxName);
                portalSession._isPortal     = true;
                portalSession._portalParent = this;
                portalSession._portalName   = name;
                this._portals.set(name, portalSession);
                return portalSession;
            },

            closePortal(name) {
                const portal = this._portals?.get(name);
                if (!portal) return this;
                portal.clear();
                template.clearContext?.(portal._container);
                this._portals.delete(name);
                return this;
            },

            _disposeListsFor(blockId) {
                const slots = this._lists.get(blockId);
                if (!slots) return;
                for (const list of slots.values()) list._dispose();
                this._lists.delete(blockId);
            },
        };

        return /** @type {UiSessionCoreAPI} */ (/** @type {any} */ ({ methods, resolveTemplate }));
    },
};
