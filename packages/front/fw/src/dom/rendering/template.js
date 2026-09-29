// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview DOM-level rendering engine that materialises elm-array data into
 * real DOM nodes using a pre-built catalogue of `<template>` elements as cloning
 * sources.
 *
 * Each named **context** owns:
 *   - A container element (`ctx`) where nodes are inserted.
 *   - A `map` of live element entries indexed by element ID.
 *   - A reference to a shared template catalogue (`tpl`).
 *   - Optional `head`, `styles`, and `scripts` registries for page-level contexts.
 *
 */

/**
 * An entry in the live element map maintained per context.
 *
 * @typedef {Object} MapEntry
 * @property {Element}   node      - The live DOM node.
 * @property {Element}   target    - The direct DOM parent of `node`.
 * @property {string}    tag       - Internal tag name (e.g. `'div'`, `'text'`).
 * @property {string[]}  children  - Ordered list of child element IDs.
 * @property {string[]}  [childCtxs] - Names of nested contexts whose root node is
 *                                    a child of this element; cleared together with
 *                                    this entry.
 */

/**
 * Descriptor for a single entry in the template catalogue.
 * Entries may be a plain tag-name string or a configuration object.
 *
 * @typedef {string | {
 *   name    : string,
 *   tag    ?: string,
 *   svg    ?: boolean,
 *   child  ?: string,
 *   attrs  ?: Object.<string, string>
 * }} TagSpec
 */

/**
 * Options accepted by `cmd.init`.
 *
 * @typedef {Object} InitOptions
 * @property {string | Element}          to    - CSS selector string or a DOM element
 *   used as the render container.
 * @property {boolean}                   [main] - When `true`, the template catalogue
 *   is stored under the shared `'main'` key so all non-main contexts can share it.
 * @property {boolean}                   [page] - When `true`, the container is treated
 *   as a full page document: `ctx` → `body`, `head` → `head`, plus `styles` / `scripts`
 *   registries are created.
 * @property {string | HTMLElement[] | NodeListOf<HTMLTemplateElement>} [tpl] - Custom
 *   template source. A string is treated as a CSS selector whose children are
 *   `<template>` elements. An array/NodeList is used directly. When omitted,
 *   `DEFAULT_TAGS` are used to auto-generate templates.
 */

/**
 * A render context entry stored in the internal `contexts` map.
 *
 * @typedef {Object} ContextEntry
 * @property {Element}                    ctx     - Root container element.
 * @property {Object.<string, MapEntry>}  map     - Live element map (id → entry).
 * @property {string}                     tpl     - Key into the template catalogue.
 * @property {Document}                   [page]  - Owning document (page contexts only).
 * @property {Element}                    [head]  - `<head>` element (page contexts only).
 * @property {Object.<string, Element>}   [styles]  - `<style>` nodes keyed by id.
 * @property {Object.<string, Element>}   [scripts] - `<script>` nodes keyed by id.
 */

import { secPolicy } from './secPolicy.js';

/**
 * Public API object returned by `template.factory()` (the internal `cmd`).
 * DOM materialiser : clones `<template>` sources into live nodes and tracks
 * them per named context.
 *
 * @typedef {object} TemplateAPI
 * @property {(name: string, options?: InitOptions) => ContextEntry} init Initialise a named render context bound to a container; throws if the name already exists.
 * @property {TagSpec[]} DEFAULT_TAGS Default tag catalogue used when no custom template source is supplied.
 * @property {(tags?: TagSpec[]) => HTMLTemplateElement[]} generateTemplateTags Build detached `<template>` elements from tag specs.
 * @property {(tags: TagSpec[], ctxName?: string) => string[]} registerTags Extend a catalogue; returns the names registered.
 * @property {(tags: TagSpec[], ctxName?: string) => { added: string[], removed: string[] }} reloadTags Replace-set a catalogue; returns added/removed names.
 * @property {(name: string, ctxName?: string) => boolean} unregisterTag Remove one tag entry; returns whether one was removed.
 * @property {(name: string) => (Element|Document|null)} container Container element for a context, or `null`.
 * @property {(ctxName: string, id: string, node: Element, parentId?: string) => void} adoptNode Register an existing DOM node (SSR hydration); throws on duplicate id.
 * @property {(value: (string|null)) => void} setNonce Set/clear the CSP nonce applied to inserted `<style>`/`<script>`.
 * @property {() => string} getNonce Current CSP nonce, or `''`.
 * @property {(name: string) => (object|null)} getCtx Raw internal context entry, or `null`.
 * @property {(name: string, attrs: Object.<string,string>) => void} pageAttr Set whitelisted attributes on a page context's `<body>`.
 * @property {(name: string, data: (import('./parser').ElmNode|import('./parser').ElmNode[]), parent?: string, index?: number) => void} elm Materialise a single elm node (or array) into the DOM.
 * @property {(anchor: string, elm_array: import('./parser').ElmNode[], parent?: string) => void} elms Materialise an ordered elm array into the DOM.
 * @property {(name: string, id: string) => (Element|null)} get Live DOM node for an element id, or `null`.
 * @property {(name: string, id: string) => boolean} has Whether an element id exists in a context.
 * @property {(name: string, node: Element, newParent: Element) => void} move Move a node under a new parent within a context.
 * @property {(name: string, id: string, css: string) => void} style Insert/update a `<style>` in a page context's `<head>`.
 * @property {(name: string, id: string) => void} removeStyle Remove a named `<style>`.
 * @property {(name: string, id: string, options?: { content?: string, type?: string }) => void} script Insert/replace a `<script>` in a page context's `<head>`.
 * @property {(name: string, id: string) => void} removeScript Remove a named `<script>`.
 * @property {(parseResult: { template: import('./parser').ElmNode[], iterates?: Object.<string, import('./parser').ElmNode[]> }) => object} fromParseResult Validate a precompiled ParseResult; returns it unchanged.
 * @property {(name: string) => void} clearContext Tear down a context: remove its container and delete the entry.
 * @property {(name: string) => string[]} clearAll Remove all rendered elements from a context; returns removed ids.
 * @property {(name: string, id: string) => string[]} clearElm Remove an element and its subtree; returns removed ids.
 * @property {(name: string, id: string) => string[]} clearIn Clear an element's children; returns removed descendant ids.
 */

export const template = {
    name: 'template',
    type: 'fw.dom.rendering',
    dependencies: ['secPolicy'],
    deps: [secPolicy],

    /** @returns {TemplateAPI} */
    factory(secPolicy) {

        const contexts = {};
        const tpl = {};
        const nodeIndex = new WeakMap();
        // CSP nonce applied to all `<style>` / `<script>` elements created via
        // `cmd.style` / `cmd.script`. Auto-detected from a `<meta name="csp-nonce">`
        // tag at factory init ; can be overridden at runtime via `cmd.setNonce`.
        let cspNonce = (typeof document !== 'undefined')
            ? (document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? '')
            : '';

        // --- Internal utilities ---
        // All security primitives below are sourced from `secPolicy` - single
        // source of truth, shared with `render.toHTML` (SSR path), `sanitize`
        // (HTML user-input path), `dom.styleApply` (CSS path) and `parser`
        // (parse-time tag/attr rejection). See `secPolicy.js` for the full
        // policy.
        const ATTR_RE      = secPolicy.SAFE_ATTR_NAME_RE;
        const ATTR_EVT     = secPolicy.EVENT_ATTR_RE;
        const URL_ATTRS    = secPolicy.URL_ATTRS;
        const CLOBBER_ATTRS = secPolicy.CLOBBER_ATTRS;
        const CLOBBER_NAMES = secPolicy.CLOBBER_NAMES;
        const _isSafeUrl   = (url) => secPolicy.isSafeUrl(url);

        /**
         * Unwrap the actual element from an SVG `<template>`'s content.
         *
         * When a template's first child is an `<svg>` element that wraps a single
         * child (e.g. a `<use>` inside `<svg>`), return that inner child instead
         * so the clone target is the SVG child element directly.
         *
         * @param {Element} first - First child of a `<template>`'s content fragment.
         * @returns {Element} The element to use as the clone source.
         */
        function resolveTemplateNode(first) {
            return (first instanceof SVGSVGElement && first.children.length === 1)
                ? first.children[0]
                : first;
        }

        /**
         * Apply elm-node data (attributes and text content) to a DOM node.
         * Event handler attributes (`on*`) and attributes not starting with a letter
         * are silently skipped for security.
         *
         * @param {Element} node - Target DOM node to mutate.
         * @param {import('./parser').ElmNode} data - Elm node carrying `attrs`, `data`,
         *   `text`, and `id`.
         * @returns {Element} The mutated `node` (same reference).
         */
        function applyAttributes(node, data) {
            if (data.attrs) {
                for (const attr of data.attrs) {
                    if (ATTR_EVT.test(attr) || !ATTR_RE.test(attr)) continue;
                    const v = data.data?.[attr];
                    // Conditional attribute: omit when null / false / undefined,
                    // set otherwise - including empty string and 0. This lets a
                    // single template handle both presence/absence of boolean
                    // attributes via data bindings (e.g. `<details open="#{o}">`
                    // with `o:''` → open, `o:null` → closed).
                    if (v === null || v === false || v === undefined) continue;
                    // Defence in depth : URL-bearing attributes are filtered
                    // through `_isSafeUrl` to block `javascript:`, `vbscript:`,
                    // and dangerous `data:` schemes that could be injected
                    // via the `#{var}` bindings. Aligns with `sanity/base.js`
                    // intent - sanity blocks HTML mutation but cannot inspect
                    // attribute values set via setAttribute.
                    // Some default-tag templates pre-set `href`/`src` to `''`
                    // (DEFAULT_TAGS spec) - we must REMOVE the attribute when
                    // the value is unsafe rather than just skip setAttribute,
                    // otherwise the pre-set empty value would leak through.
                    if (URL_ATTRS.has(attr) && !_isSafeUrl(String(v))) {
                        node.removeAttribute(attr);
                        continue;
                    }
                    // DOM clobbering defence : reject `id`/`name` values that
                    // collide with built-in document.* properties. Such values
                    // would make `document.cookie` etc. resolve to the element
                    // instead of the native API.
                    if (CLOBBER_ATTRS.has(attr) && CLOBBER_NAMES.has(String(v))) {
                        node.removeAttribute(attr);
                        continue;
                    }
                    node.setAttribute(attr, v);
                }
            }
            if (data.text != null) {
                node.textContent = data.text;
            }
            node.setAttribute('id', data.id);
            return node;
        }

        /**
         * Clone the template node matching `data.tag` from the context's catalogue
         * and apply elm-node data to the clone.
         *
         * The synthetic `'text'` tag is mapped to `'span'` for DOM creation.
         *
         * @param {string} ctxName - Name of the render context.
         * @param {import('./parser').ElmNode} data - Elm node to materialise.
         * @returns {Element|null} The cloned and populated node, or `null` when no
         *   matching template entry exists for the tag.
         */
        function cloneAndApply(ctxName, data) {
            const tplKey = contexts[ctxName].tpl;
            const tag = data.tag === 'text' ? 'span' : data.tag;

            if(!Object.prototype.hasOwnProperty.call(tpl[tplKey], tag)){
                return null;
            } else {
                return applyAttributes(tpl[tplKey][tag].cloneNode(), data);
            }
        }

        /**
         * Insert `node` into `target`, either prepending or appending.
         *
         * @param {Element} target  - Parent element to insert into.
         * @param {Element} node    - Node to insert.
         * @param {boolean} prepend - `true` to insert before the first child;
         *   `false` to append.
         */
        function insertNode(target, node, prepend) {
            if (prepend) {
                target.insertBefore(node, target.firstChild);
            } else {
                target.appendChild(node);
            }
        }

        /**
         * Recursively collect all descendant IDs of the given `ids` from a context
         * map, removing each visited entry from `map` in the process.
         * Nested child contexts encountered during traversal are cleared via
         * {@link cmd.clearContext}.
         *
         * @param {string}   ctxName - Name of the render context.
         * @param {string[]} ids     - Root IDs whose subtrees should be collected.
         * @returns {string[]} All collected descendant IDs (excluding the roots
         *   themselves - callers are responsible for those).
         */
        function collectChildren(ctxName, ids) {
            const map = contexts[ctxName].map;
            const collected = [];
            const stack = [...ids];

            while (stack.length > 0) {
                const id = stack.pop();
                if (map[id]) {
                    stack.push(...map[id].children);
                    if (map[id].childCtxs) {
                        for (const childCtxName of map[id].childCtxs) {
                            cmd.clearContext(childCtxName);
                        }
                    }
                    collected.push(id);
                    delete map[id];
                }
            }

            return collected;
        }

        // --- Template generation ---

        const SVG_NS = 'http://www.w3.org/2000/svg';

        /**
         * Default tag catalogue used when no custom template source is provided.
         * Each entry is either a plain tag-name string or a {@link TagSpec} object.
         *
         * @type {TagSpec[]}
         */
        const DEFAULT_TAGS = [
            'div', 'span',
            'nav', 'header', 'footer', 'section', 'article', 'aside', 'main',
            { name: 'a',       attrs: { href: '' } },
            'button',
            'input', 'form', 'label', 'select', 'option', 'textarea', 'fieldset', 'legend',
            'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'caption',
            'ul', 'li', 'ol',
            'dl', 'dt', 'dd',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'br', 'hr',
            'p', 'i', 'b', 'em', 'strong', 'small', 'pre', 'code', 'kbd', 'samp', 'var', 'mark',
            'abbr', 'cite', 'q', 'blockquote', 's', 'u', 'sub', 'sup', 'time',
            'details', 'summary',
            'figure', 'figcaption',
            'dialog', 'progress', 'meter',
            'video', 'audio',
            'picture',
            { name: 'img',     attrs: { src: '', alt: '' } },
            { name: 'cvs',     tag: 'canvas' },
            { name: 'svg',     svg: true },
            { name: 'svg_use', svg: true, child: 'use' }
        ];

        /**
         * Build an array of detached `<template>` elements from a {@link TagSpec}
         * array, ready to be used as a clone-source catalogue.
         *
         * Each `<template>` element's `className` matches the entry name so it can
         * be looked up by tag name at render time.
         *
         * @param {TagSpec[]} [tags=DEFAULT_TAGS] - Tag specifications to generate
         *   templates for.
         * @returns {HTMLTemplateElement[]} Array of fully configured `<template>`
         *   elements (detached from any document).
         */
        function generateTemplateTags(tags = DEFAULT_TAGS) {
            return tags.map(entry => {
                const t = document.createElement('template');
                const isObj = typeof entry === 'object';
                const name = isObj ? entry.name : entry;
                const tag  = isObj && entry.tag ? entry.tag : (isObj && entry.svg) ? 'svg' : name;

                t.className = name;

                const el = (isObj && entry.svg)
                    ? document.createElementNS(SVG_NS, tag)
                    : document.createElement(tag);

                if (isObj && entry.attrs) {
                    for (const [k, v] of Object.entries(entry.attrs)) {
                        el.setAttribute(k, v);
                    }
                }

                if (isObj && entry.child) {
                    el.appendChild(document.createElementNS(SVG_NS, entry.child));
                }

                t.content.appendChild(el);
                return t;
            });
        }

        // --- Public API ---

        const cmd = {};

        /**
         * Initialise a named render context bound to a container element.
         *
         * - If the container is already tracked by the `nodeIndex` (i.e. it is itself
         *   a rendered element in an existing context), the new context is registered
         *   as a child context of that element so that it is torn down automatically
         *   when the parent element is cleared.
         * - When `options.main` is `true`, the template catalogue is shared under the
         *   `'main'` key; subsequent non-main contexts with no custom `tpl` will
         *   reuse it.
         * - Requires at least one valid template source; no runtime guard is applied.
         *
         * Throws when a context with the same `name` already exists. This is a
         * strict contract - callers who genuinely want hot-reload semantics
         * must call `clearContext(name)` first. Silently overwriting was a
         * latent bug : already-rendered DOM became orphaned (still in the
         * page but no longer in the map).
         *
         * @param {string}      name    - Unique context name.
         * @param {InitOptions} [options={}] - Configuration options.
         * @returns {ContextEntry} The newly created context entry.
         * @throws {Error} When `name` is already registered.
         */
        // ── Container fn
        cmd.init = function (name, /** @type {InitOptions} */ options = /** @type {InitOptions} */ ({})) {
            // if templates empty --> will fail (no catch or check in this factory)

            if (contexts[name]) {
                throw new Error(
                    `template.init: context '${name}' already exists. ` +
                    `Call clearContext('${name}') first if you want to re-init.`
                );
            }

            const { main, page } = options;
            const tplSrc = options.tpl;

            const container = typeof options.to === 'string'
                ? document.querySelector(options.to)
                : options.to;

            const ref = nodeIndex.get(container);
            if (ref) {
                const entry = contexts[ref.ctxName].map[ref.id];
                if (!entry.childCtxs) entry.childCtxs = [];
                entry.childCtxs.push(name);
            }

            if (page) {
                const pageDoc = /** @type {Document} */ (/** @type {*} */ (container));
                contexts[name] = {
                    page: container,
                    head: pageDoc.head,
                    ctx: pageDoc.body,
                    map: {},
                    styles: {},
                    scripts: {}
                };
            } else {
                contexts[name] = {
                    ctx: container,
                    map: {}
                };
            }

            if (main || tplSrc) {
                const tplKey   = main ? 'main' : name;
                const templates = typeof tplSrc === 'string'
                    ? document.querySelectorAll(tplSrc + ' > template')
                    : (tplSrc ?? generateTemplateTags());

                tpl[tplKey] = {};
                /** @type {HTMLTemplateElement[]} */
                const templateArr = /** @type {HTMLTemplateElement[]} */ (Array.from(/** @type {*} */ (templates)));
                for (const t of templateArr) {
                    tpl[tplKey][t.className] = resolveTemplateNode(/** @type {Element} */ (t.content.firstChild));
                }
                contexts[name].tpl = tplKey;

            } else {
                contexts[name].tpl = 'main';
            }

            return contexts[name];
        };

        /** @type {TagSpec[]} */
        cmd.DEFAULT_TAGS = DEFAULT_TAGS;

        /**
         * Expose the template-generation utility for callers that need to extend or
         * pre-build a catalogue outside of `init`.
         *
         * @type {typeof generateTemplateTags}
         */
        cmd.generateTemplateTags = generateTemplateTags;

        /**
         * Extend an existing template catalogue with additional tag entries.
         *
         * Useful when the caller cannot enumerate every tag at `init` time, or when
         * different parts of the app share a single `'main'` catalogue but need to
         * register their own custom tags after bootstrap.
         *
         * @param {TagSpec[]} tags    - Tag specs to add (same shape as `DEFAULT_TAGS`
         *   entries: plain string, or `{ name, tag?, attrs?, svg?, child? }`).
         * @param {string}    [ctxName] - Target context whose catalogue to extend.
         *   Defaults to `'main'` (the shared catalogue created by any `init` with
         *   `{ main: true }`).
         * @returns {string[]} Names of the tags actually registered (after the
         *   add). Already-present names are overwritten silently.
         */
        cmd.registerTags = function (tags, ctxName) {
            const tplKey = ctxName ? (contexts[ctxName]?.tpl ?? ctxName) : 'main';
            if (!tpl[tplKey]) tpl[tplKey] = {};
            const generated = generateTemplateTags(tags);
            const added = [];
            for (const t of generated) {
                tpl[tplKey][t.className] = resolveTemplateNode(/** @type {Element} */ (t.content.firstChild));
                added.push(t.className);
            }
            return added;
        };

        /**
         * Hot-reload the tag catalogue of a context. Like {@link cmd.registerTags}
         * but with **replace-set semantics** : after the call, the context's
         * catalogue contains **exactly** `tags`, no more. Useful for HMR-style
         * scenarios where the template file is re-parsed at dev-time and the
         * old tags must be purged.
         *
         * Already-mounted DOM nodes are **NOT** re-rendered - only the
         * future clone source (the `<template>` registry) is swapped.
         * Consumers wanting full re-render must call `cmd.clearAll(ctxName)`
         * + `ui.add(...)` afterwards. The narrower scope here is intentional
         * (re-rendering on hot-reload is a host-level concern, not fw).
         *
         * Recipe :
         *
         *     // 1. Swap the catalogue.
         *     tpl.reloadTags(newTags, 'main');
         *     // 2. Tear down the old DOM.
         *     tpl.clearAll('main');
         *     // 3. Re-add the items (UI session, app shell, …).
         *     ui.add(items);
         *
         * @param {TagSpec[]} tags
         * @param {string}    [ctxName]
         * @returns {{ added: string[], removed: string[] }}
         */
        cmd.reloadTags = function (tags, ctxName) {
            const tplKey = ctxName ? (contexts[ctxName]?.tpl ?? ctxName) : 'main';
            const before = tpl[tplKey] ? Object.keys(tpl[tplKey]) : [];
            tpl[tplKey] = {};   // wipe
            const added = cmd.registerTags(tags, ctxName);
            const removed = before.filter(n => !added.includes(n));
            return { added, removed };
        };

        /**
         * Remove one tag entry from a context's catalogue. No-op when absent.
         *
         * @param {string} name      - Internal tag name (`'a'`, `'svg_use'`, …).
         * @param {string} [ctxName] - Default `'main'`.
         * @returns {boolean} `true` when an entry was actually removed.
         */
        cmd.unregisterTag = function (name, ctxName) {
            const tplKey = ctxName ? (contexts[ctxName]?.tpl ?? ctxName) : 'main';
            if (tpl[tplKey] && Object.prototype.hasOwnProperty.call(tpl[tplKey], name)) {
                delete tpl[tplKey][name];
                return true;
            }
            return false;
        };

        /**
         * Return the container element associated with a context.
         *
         * Useful when callers need a stable reference to the DOM root for event
         * delegation, intersection observers, etc., without re-querying via
         * `document.getElementById` or a CSS selector.
         *
         * @param {string} name - Context name (created via `cmd.init`).
         * @returns {Element | Document | null} Container element, or `null` if the
         *   context does not exist.
         */
        cmd.container = function (name) {
            return contexts[name]?.ctx ?? null;
        };

        /**
         * Register an **existing** DOM node into a context's live element map
         * without creating a new clone. Used by `uiSession.hydrate(...)` to
         * adopt server-rendered HTML : the nodes are already in the DOM with
         * `data-fw-id` markers ; this method threads them through the same
         * bookkeeping that `cmd.elm` would have done if the node had been
         * created client-side.
         *
         * Strict on duplicate id : throws when `id` is already mapped. This
         * surfaces SSR hydration mismatches immediately rather than silently
         * dropping the second registration (which previously discarded any
         * differing `parentId`, leaving the tree inconsistent).
         *
         * @param {string}  ctxName   - Name of the render context.
         * @param {string}  id        - Logical id under which to register.
         *   Will become the entry's key in `contexts[name].map`.
         * @param {Element} node      - The existing DOM element.
         * @param {string}  [parentId] - Optional parent id (already registered)
         *   to maintain the parent-children tree.
         * @throws {Error} When `ctxName` does not exist or `id` is already adopted.
         */
        cmd.adoptNode = function (ctxName, id, node, parentId) {
            const ctx = contexts[ctxName];
            if (!ctx) throw new Error(`template.adoptNode: unknown context '${ctxName}'`);
            if (ctx.map[id]) {
                throw new Error(
                    `template.adoptNode: id '${id}' is already registered in context '${ctxName}'. ` +
                    `Re-adoption with a different parentId would silently corrupt the tree.`
                );
            }

            const entry = {
                node,
                target: node?.parentNode ?? null,
                tag: typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : 'div',
                children: [],
            };
            ctx.map[id] = entry;
            if (node) nodeIndex.set(node, { ctxName, id });

            if (parentId && ctx.map[parentId]) {
                ctx.map[parentId].children.push(id);
            }
        };

        /**
         * Set or update the CSP nonce applied to all `<style>` and `<script>`
         * elements created via {@link cmd.style} / {@link cmd.script}. Pass `''`
         * or `null` to disable.
         *
         * At factory init, the nonce is auto-read from a
         * `<meta name="csp-nonce" content="…">` tag if present. Call this
         * setter to override (e.g. when the nonce is rotated, or fetched async).
         *
         * Existing `<style>`/`<script>` nodes are NOT retro-actively updated -
         * the nonce only applies to subsequent insertions.
         *
         * @param {string|null} value - Nonce value, or empty/null to disable.
         */
        cmd.setNonce = function (value) {
            cspNonce = value ? String(value) : '';
        };

        /**
         * Read the current CSP nonce applied to inserted `<style>`/`<script>`.
         * @returns {string} Current nonce, or `''` when none is configured.
         */
        cmd.getNonce = function () {
            return cspNonce;
        };

        /**
         * Return the full context entry (raw internal record) for inspection.
         *
         * Intended for debugging or for advanced callers that need the live map of
         * IDs. The returned object is the framework's internal state - do not
         * mutate it directly.
         *
         * @param {string} name - Context name.
         * @returns {Object | null} Internal context entry, or `null` if absent.
         */
        cmd.getCtx = function (name) {
            return contexts[name] ?? null;
        };

        /**
         * Set whitelisted attributes on the `<body>` element of a page context.
         * Only `class`, `style`, and `data-*` attributes are accepted; all others
         * are silently ignored.
         *
         * @param {string}              name  - Page context name.
         * @param {Object.<string,string>} attrs - Attribute key/value pairs.
         */
        cmd.pageAttr = function (name, attrs) {
            const body = contexts[name].ctx;
            for (const [key, value] of Object.entries(attrs)) {
                if (ATTR_RE.test(key) && (key === 'class' || key === 'style' || key.startsWith('data-'))) {
                    body.setAttribute(key, value);
                }
            }
        };

        /**
         * Materialise a single elm node (or a full elm array) into the DOM under
         * the named context.
         *
         * - When `data` is an **array**, delegates to {@link cmd.elms}.
         * - When the element ID already exists in the context map, the existing DOM
         *   node is replaced in-place (children first cleared via {@link cmd.clearIn}).
         * - When the element is new, it is cloned from the catalogue and inserted
         *   into the correct parent (or the context root).
         * - Returns without action if `data.id` or `data.tag` are missing or not
         *   strings.
         *
         * @param {string} name - Context name.
         * @param {import('./parser').ElmNode | import('./parser').ElmNode[]} data -
         *   Single elm node or an array of elm nodes to render.
         */
        // ── Elements fn
        cmd.elm = function (name, data, parent, index = 0) {
            if(Array.isArray(data)){
                cmd.elms(name, data);
            } else {

                if(data.tag && typeof data.tag === 'string') {
                    if(!data.id || typeof data.id !== 'string'){
                        data.id = (Date.now().toString(36) + index.toString() + crypto.getRandomValues(new Uint32Array(1))[0].toString(36))
                    }
                    const ctx = contexts[name];

                    if (ctx.map[data.id]) {
                        // Update existing element
                        cmd.clearIn(name, data.id);
                        const entry = ctx.map[data.id];
                        const newNode = cloneAndApply(name, data);
                        if(newNode !== null) {
                            entry.node.parentNode.replaceChild(newNode, entry.node);
                            entry.node = newNode;
                            nodeIndex.set(newNode, {ctxName: name, id: data.id});
                        }

                        if(data.child && Array.isArray(data.child)){
                            cmd.elms(name, data.child, data.id);
                        }
                    } else {
                        // Create new element
                        const entry = {
                            node: null,
                            target: null,
                            tag: data.tag === 'text' ? 'text' : data.tag,
                            children: []
                        };

                        // Resolve target
                        if (data.parent && ctx.map[data.parent]) {
                            entry.target = ctx.map[data.parent].node;
                            if (data.prepend) {
                                ctx.map[data.parent].children.unshift(data.id);
                            } else {
                                ctx.map[data.parent].children.push(data.id);
                            }
                        } else if (typeof parent === 'string' && ctx.map[parent]) {
                            entry.target = ctx.map[parent].node;
                            if (data.prepend) {
                                ctx.map[parent].children.unshift(data.id);
                            } else {
                                ctx.map[parent].children.push(data.id);
                            }
                        } else {
                            entry.target = ctx.ctx;
                        }

                        // Clone, apply, insert
                        const node = cloneAndApply(name, data);
                        if(node !== null) {
                            insertNode(entry.target, node, data.prepend);
                            entry.node = node;

                            ctx.map[data.id] = entry;
                            nodeIndex.set(node, {ctxName: name, id: data.id});
                        }

                        if(data.child && Array.isArray(data.child)){
                            cmd.elms(name, data.child, data.id);
                        }
                    }
                }
            }
        };

        /**
         * Materialise an ordered array of elm nodes into the DOM, calling
         * {@link cmd.elm} for each entry.
         *
         * Because each elm node carries its own `parent` reference and the array is
         * parent-before-child ordered, nodes are automatically inserted into the
         * correct DOM positions.
         *
         * @param {string} anchor - Context name.
         * @param {import('./parser').ElmNode[]} elm_array - Ordered elm array to render.
         */
        cmd.elms = function(anchor, elm_array, parent){
            elm_array.forEach(function(elm, index){
                cmd.elm(anchor, elm, parent, index);
            });
        }

        /**
         * Retrieve the live DOM node for a given element ID from a context.
         *
         * @param {string} name - Context name.
         * @param {string} id   - Element ID to look up.
         * @returns {Element|null} The live DOM node, or `null` when not found.
         */
        cmd.get = function (name, id) {
            return contexts[name].map[id]?.node || null;
        };

        /**
         * Check whether an element ID exists in a context's live map.
         *
         * @param {string} name - Context name.
         * @param {string} id   - Element ID to check.
         * @returns {boolean} `true` when the element is present.
         */
        cmd.has = function (name, id) {
            return !!(contexts[name]?.map[id]);
        };

        /**
         * Move a DOM node to a new parent within the same context, updating the
         * internal `children` lists and `target` references accordingly.
         *
         * Both `node` and `newParent` must be `Element` instances with an `id`
         * attribute already tracked in the context map; the call is a no-op
         * otherwise.
         *
         * @param {string}  name      - Context name.
         * @param {Element} node      - Element to move (must be in the context map).
         * @param {Element} newParent - Destination parent element (must be in the
         *   context map).
         */
        cmd.move = function (name, node, newParent) {
            const id          = (node      instanceof Element) ? node.getAttribute('id')      : null;
            const newParentId = (newParent instanceof Element) ? newParent.getAttribute('id') : null;
            if (id === null || newParentId === null) return;

            const ctx = contexts[name];
            const entry = ctx.map[id];
            const newParentEntry = ctx.map[newParentId];
            if (!entry || !newParentEntry) return;

            // Remove id from old parent's children list
            const oldParentId = (entry.target instanceof Element) ? entry.target.getAttribute('id') : null;
            if (oldParentId !== null && ctx.map[oldParentId]) {
                const siblings = ctx.map[oldParentId].children;
                const idx = siblings.indexOf(id);
                if (idx !== -1) siblings.splice(idx, 1);
            }

            // Move in DOM, then update the map entry
            newParent.appendChild(node);
            entry.target = newParent;
            newParentEntry.children.push(id);
        };

        // ── Style

        /**
         * Insert or update a `<style>` element in the page context's `<head>`.
         * If a `<style>` with `id` already exists it is updated in place
         * (no new node created).
         *
         * Only available on page contexts (those initialised with `options.page`).
         *
         * @param {string} name - Page context name.
         * @param {string} id   - Identifier for the style block (becomes the element id).
         * @param {string} css  - CSS text content.
         */
        cmd.style = function (name, id, css) {
            const ctx = contexts[name];
            if (ctx.styles[id]) {
                ctx.styles[id].textContent = css;
                return;
            }
            const node = document.createElement('style');
            node.id = id;
            node.textContent = css;
            if (cspNonce) node.setAttribute('nonce', cspNonce);
            ctx.head.appendChild(node);
            ctx.styles[id] = node;
        };

        /**
         * Remove a named `<style>` element from the page context's `<head>`.
         * No-op when the id is not found.
         *
         * @param {string} name - Page context name.
         * @param {string} id   - Identifier of the style block to remove.
         */
        cmd.removeStyle = function (name, id) {
            const ctx = contexts[name];
            if (ctx.styles[id]) {
                ctx.styles[id].remove();
                delete ctx.styles[id];
            }
        };

        // ── Scripts

        /**
         * Insert or replace a `<script>` element in the page context's `<head>`.
         * If a `<script>` with `id` already exists it is removed before the new one
         * is appended.
         *
         * Only inline script content is supported (`options.content`).
         * The `src` attribute path is reserved for future use and intentionally
         * disabled; content must be validated externally before calling this method.
         *
         * @param {string} name            - Page context name.
         * @param {string} id              - Identifier for the script element.
         * @param {Object} [options={}]    - Script options.
         * @param {string} [options.content] - Inline script text.
         * @param {string} [options.type]    - MIME type (e.g. `'module'`).
         */
        // ── Scripts
        cmd.script = function (name, id, options = {}) {
            const ctx = contexts[name];
            if (ctx.scripts[id]) {
                ctx.scripts[id].remove();
            }
            const node = document.createElement('script');
            node.id = id;
            // inline script only with validation before (not part of this factory).
            if (options.content) node.textContent = options.content;
            if (options.type) node.type = options.type;
            if (cspNonce) node.setAttribute('nonce', cspNonce);
            ctx.head.appendChild(node);
            ctx.scripts[id] = node;
        };

        /**
         * Remove a named `<script>` element from the page context's `<head>`.
         * No-op when the id is not found.
         *
         * @param {string} name - Page context name.
         * @param {string} id   - Identifier of the script to remove.
         */
        cmd.removeScript = function (name, id) {
            const ctx = contexts[name];
            if (ctx.scripts[id]) {
                ctx.scripts[id].remove();
                delete ctx.scripts[id];
            }
        };

        // ── Clearing fn

        /**
         * Completely tear down a named context: remove its container element from
         * the DOM and delete the context entry.
         *
         * @param {string} name - Context name to destroy.
         */
        cmd.clearContext = function (name) {
            if (contexts[name]) {
                contexts[name].ctx.remove();
                delete contexts[name];
            }
        };

        /**
         * Remove all rendered elements from a context, reset its live map, and
         * recursively clear any child contexts.
         *
         * The container element itself is kept; only its children are removed via
         * `replaceChildren()`.
         *
         * @param {string} name - Context name.
         * @returns {string[]} Array of all element IDs that were removed.
         */
        cmd.clearAll = function (name) {
            const ctx = contexts[name];
            const ret = [];
            for (const id in ctx.map) {
                if (!ctx.map[id]) continue;  // guard against already-collected children
                if (ctx.map[id].childCtxs) {
                    for (const childCtxName of ctx.map[id].childCtxs) {
                        cmd.clearContext(childCtxName);
                    }
                }
                ret.push(...collectChildren(name, ctx.map[id].children));
                ret.push(id);
            }
            ctx.ctx.replaceChildren();
            ctx.map = {};
            return ret;
        };

        /**
         * Remove a single element and its entire descendant subtree from the DOM
         * and the context map.
         *
         * @param {string} name - Context name.
         * @param {string} id   - ID of the element to remove.
         * @returns {string[]} IDs of all removed elements (the element itself plus
         *   all descendants).
         */
        cmd.clearElm = function (name, id) {
            const ctx = contexts[name];
            if (!ctx.map[id]) return [];

            const entry = ctx.map[id];
            entry.node.remove();
            const ret = collectChildren(name, entry.children);
            ret.push(id);
            delete ctx.map[id];
            return ret;
        };

        /**
         * Clear the children of an element without removing the element itself.
         *
         * The element's DOM children are removed via `replaceChildren()` and its
         * descendant entries are purged from the context map. The element entry
         * remains in `ctx.map` with an empty `children` array.
         *
         * @param {string} name - Context name.
         * @param {string} id   - ID of the element whose children should be cleared.
         * @returns {string[]} IDs of all removed descendant elements.
         */
        /**
         * Adopt a precompiled `ParseResult` JSON (produced by
         * `build/tools/parseresult.js`) directly, bypassing
         * `parser.fromHTML()`. The input shape is identical to what
         * `parser.fromHTML()` returns at runtime.
         *
         * The function performs a shallow shape check and returns the same
         * object unchanged — callers can then feed it to `cmd.elms`,
         * `cmd.elm`, `render.toHTML`, etc. as they would with a freshly
         * parsed result.
         *
         * @param {{ template: import('./parser').ElmNode[],
         *           iterates?: Object.<string, import('./parser').ElmNode[]> }} parseResult
         *   JSON payload from parser precompilation.
         * @returns {object} The same `parseResult` reference, unchanged.
         * @throws {TypeError} When `parseResult` is missing or malformed.
         */
        cmd.fromParseResult = function (parseResult) {
            if (!parseResult || typeof parseResult !== 'object' || Array.isArray(parseResult)) {
                throw new TypeError(
                    'template.fromParseResult: parseResult must be an object with a `template` array'
                );
            }
            if (!Array.isArray(parseResult.template)) {
                throw new TypeError(
                    'template.fromParseResult: parseResult.template must be an array'
                );
            }
            if (parseResult.iterates !== undefined &&
                (typeof parseResult.iterates !== 'object' || parseResult.iterates === null)) {
                throw new TypeError(
                    'template.fromParseResult: parseResult.iterates must be an object when present'
                );
            }
            return parseResult;
        };

        cmd.clearIn = function (name, id) {
            const ctx = contexts[name];
            if (!ctx.map[id]) return [];

            const entry = ctx.map[id];
            entry.node.replaceChildren();
            const ret = collectChildren(name, entry.children);
            entry.children = [];
            return ret;
        };

        return cmd;
    }
};
