// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview High-level session facade that coordinates `parser`, `render`,
 * `template`, and `dom` to provide a unified, stateful interface for building
 * and updating a section of the UI.
 *
 * A `UISession` is created per UI scope (page, panel, component) via the
 * factory function returned by this module. It encapsulates the attach-slot
 * map and the logical-ID map so callers never need to manage raw element IDs
 * directly.
 *
 * Implementation is split across topic-focused fw modules for readability :
 *   - `uiSessionCore`   : lifecycle, lookup, mount/unmount, portals.
 *   - `uiSessionDirect` : `text` / `attr` / `on` / `bind` mutators.
 *   - `uiSessionList`   : `UIList` class + `list()` factory.
 *
 * Each is a standalone fw module whose factory is serializable (worker-safe).
 * This file glues them onto a single `UISession` prototype via the strict
 * dependency-injection pattern.
 *
 */

/**
 * @typedef {Object} RenderItem
 * @property {import('./parser').ElmNode[]}  [template] - Pre-resolved elm template array.
 * @property {import('./parser').ParseResult} [block]   - Raw parse result; `template` is
 *   derived from it using the `attach.name` slot when available.
 * @property {Object | Object[]}              [data]    - Variable bindings. An array
 *   triggers loop (iterate) rendering.
 * @property {string}                         [id]      - Logical block identifier.
 * @property {{ elm: string, name: string }}  [attach]  - Attach descriptor.
 * @property {boolean}                        [prepend] - Insert root before existing children.
 */

import { uiSessionCore } from './uiSession-core.js';
import { uiSessionDirect } from './uiSession-direct.js';
import { uiSessionList } from './uiSession-list.js';

/**
 * Stateful session managing one named template context. Composed from the
 * core (lifecycle/lookup/mutation), direct (text/attr/on/bind) and list
 * mixins. Chainable mutators return the session itself.
 *
 * @typedef {object} UISessionInstance
 * @property {(htmlString: string) => object} parse Shortcut for `parser.fromHTML`.
 * @property {(blockId: string, logicalId?: string) => (Element|null)} get Resolve a block root or descendant to a live DOM node.
 * @property {(blockId: string, logicalId: string, selector: string) => (Element|null)} query First selector match inside the addressed node.
 * @property {(blockId: string, logicalId: string, selector: string) => (NodeList|Array)} queryAll All selector matches inside the addressed node.
 * @property {(blockId: string) => IterableIterator<[string, Element]>} iterate Yield `[logicalId, element]` pairs for a block.
 * @property {(blockId: string, logicalId?: string) => boolean} exists Whether a block (or descendant) is registered.
 * @property {(items: Array, opts?: object) => UISessionInstance} hydrate Adopt SSR DOM; returns the session.
 * @property {(items: Array) => UISessionInstance} add Render and append items; returns the session.
 * @property {(items: Array) => UISessionInstance} append Alias for `add`; returns the session.
 * @property {(items: Array) => UISessionInstance} prepend Render items before existing children; returns the session.
 * @property {(blockId: string, slotName: (string|null), factory: (element: Element, blockId: string) => object) => (object|null)} mount Resolve an element, call `factory`, adopt the controller.
 * @property {(blockId: string, resource: (Function|object)) => (Function|object)} adopt Register a cleanup resource.
 * @property {(blockId: string, fn?: Function) => UISessionInstance} onUnmount Set/clear an unmount hook; returns the session.
 * @property {(blockId: string, fn?: Function) => UISessionInstance} onMount Set/fire a mount hook; returns the session.
 * @property {(name: string) => UISessionInstance} off Remove a managed listener by name; returns the session.
 * @property {(blockId: string, logicalId?: string) => UISessionInstance} remove Remove a descendant element; returns the session.
 * @property {(blockId?: string, logicalId?: string) => UISessionInstance} clear Clear all / a block / a descendant; returns the session.
 * @property {(blockId: string, logicalId: string, targetBlockId: string, targetLogicalId: string) => UISessionInstance} move Move a node under a new parent; returns the session.
 * @property {(blockId: string, items: Array) => UISessionInstance} replace Clear a block then add items; returns the session.
 * @property {(name: string, opts?: object) => UISessionInstance} portal Open/return an out-of-tree portal session.
 * @property {(name: string) => UISessionInstance} closePortal Close a portal; returns the session.
 * @property {(blockId: string, logicalIdOrValue: string, maybeValue?: string) => UISessionInstance} text Set `textContent` on a block root or descendant; returns the session.
 * @property {(blockId: string, logicalIdOrName: string, nameOrValue?: string, value?: *) => UISessionInstance} attr Set/remove an attribute; returns the session.
 * @property {(blockId: string, logicalIdOrType: string, typeOrFn?: *, fnOrName?: *, nameOrOptions?: *, options?: *) => (string|null)} on Register a managed listener; returns the listener name or `null`.
 * @property {(sig: object, blockId: string, logicalIdOrTarget?: string, targetOrOpts?: *, maybeOpts?: object) => (() => void)} bind Subscribe a signal to a DOM surface; returns an unsubscribe function.
 * @property {(parentBlockId: string, slotName: string, options: object) => object} list Get or create the keyed `UIList` for a slot.
 */

export const uiSession = {
    name: 'uiSession',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: [
        'uiSessionCore', 'uiSessionDirect', 'uiSessionList',
    ],
    deps: [uiSessionCore, uiSessionDirect, uiSessionList],

    /** @returns {(containerName: string) => UISessionInstance} */
    factory(core, direct, list) {

        /**
         * Stateful session that manages a named render context and exposes a
         * fluent, block-oriented API. All mutating methods return `this`
         * for chaining.
         */
        class UISession {

            /**
             * Create a session bound to an existing named template context.
             * The `container` must already have been initialised via `template.init`.
             *
             * @param {string} container - Name of the template context to manage.
             */
            constructor(container) {
                this._container = container;
                this._attach    = new Map();
                this._map       = new Map();
                // listeners: blockId → logicalId → Set<listenerName>
                this._listeners = new Map();
                this._lseq      = 0;
                // lists: parentBlockId → slotName → UIList (idempotent registry).
                this._lists     = new Map();
                // unmount hooks: blockId → fn() (single hook per block).
                this._unmount   = new Map();
                // mount hooks: blockId → fn() - fires once when block becomes
                // mounted, then removed.
                this._mount     = new Map();
                // parent tracking: parentBlockId → Set<childBlockId>.
                this._children  = new Map();
            }
        }

        // Install method mixins on the prototype. The three helper modules
        // each return `{ methods }` (plus optional `UIList`, `resolveTemplate`)
        // and never collide on method names.
        Object.assign(
            UISession.prototype,
            core.methods,
            direct.methods,
            list.methods,
        );

        /**
         * Factory function - create a new {@link UISession} bound to the named
         * template context `container`.
         *
         * @param {string} container - Name of an existing template context
         *   (created via `template.init`).
         * @returns {UISessionInstance} A new session instance ready for use.
         */
        return /** @type {(containerName: string) => UISessionInstance} */ (function(container) {
            // `UISession.prototype` is composed via Object.assign of the three
            // mixins above, so tsc sees the bare class (no methods). Cast the
            // instance to the full `UISessionInstance` typedef (real runtime shape).
            return /** @type {UISessionInstance} */ (/** @type {any} */ (new UISession(container)));
        });
    },
};
