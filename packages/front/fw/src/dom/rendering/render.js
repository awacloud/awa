// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Elm-array data transformer that applies variable bindings and
 * rewrites element IDs before the array is handed off to `template.js` for DOM
 * insertion.
 *
 * None of the functions in this module touch the DOM; they operate exclusively
 * on plain JavaScript objects ({@link ElmNode} arrays).
 *
 */

/**
 * A single node in the flat elm-array representation.
 * Defined in full in `parser.js`; imported here by reference.
 *
 * @typedef {import('./parser').ElmNode} ElmNode
 */

/**
 * A variable-binding descriptor attached to an elm node.
 * Defined in full in `parser.js`; imported here by reference.
 *
 * @typedef {import('./parser').MapEntry} MapEntry
 */

/**
 * Parse result from `parser.js`, containing a template elm-array and optional
 * iterate sub-templates. Imported by reference so render.js stays dependency-free.
 *
 * @typedef {import('./parser').ParseResult} ParseResult
 */

/**
 * Result produced by `rewrite`: a rewritten elm array together with
 * the ID-translation maps needed by callers to resolve logical IDs later.
 *
 * @typedef {Object} RenderResult
 * @property {ElmNode[]}          arr     - Elm array with new collision-safe IDs.
 * @property {Map<string,string>} map     - Original ID → new ID translation map.
 * @property {Map<string,string>} content - Slot/iterate-block name → container
 *                                          element's new ID.
 */

/**
 * Aggregate result produced by `full`: the merged elm array for the
 * whole render pass plus maps used by subsequent `attach` lookups.
 *
 * @typedef {Object} FullResult
 * @property {ElmNode[]}                              arr    - Combined, rewritten
 *                                                            elm array for all items.
 * @property {Map<string, Map<string,string>|false>}  map    - Logical-item ID →
 *                                                            {@link RenderResult#map}
 *                                                            (or `false` when an
 *                                                            attach slot was not found).
 * @property {Map<string, {content: Map<string,string>}>} attach - Updated attach-slot
 *                                                            registry for nested items.
 */

/**
 * Public surface returned by `render.factory()`: the elm-array transform and
 * SSR helpers. All functions are pure (no DOM access).
 *
 * @typedef {Object} RenderAPI
 * @property {(elm_array: ElmNode[], options: Object, attach?: string|false) => ElmNode[]} elms - Apply bindings to a cloned elm array.
 * @property {(elm_array: ElmNode[]) => RenderResult} rewrite - Rewrite element IDs to collision-safe values.
 * @property {(elm_array: ElmNode[], options?: Object, attach?: string|false) => RenderResult} parts - `rewrite(elms(...))` in one call.
 * @property {(elm_array: ElmNode[], options?: Object[], attach?: string|false) => RenderResult[]} loop - Render once per options entry.
 * @property {(data: Object[], attach_parent?: Map<string, {content: Map<string,string>}>, id_parent?: Map<string, Map<string,string>|false>) => FullResult} full - Full structured render pass.
 * @property {(mapEntry: MapEntry, data: Object, base: *) => *} computeBoundValue - Resolve one binding against data.
 * @property {(parsedElm: ElmNode, data: Object) => { data: Object, [prop: string]: * }} applyParsedElm - Re-resolve a single elm's bindings.
 * @property {(input: ParseResult|ElmNode[], data?: Object, opts?: Object) => string} toHTML - Server-side render to an HTML string.
 */

import { secPolicy } from './secPolicy.js';

export const render = {
    name: 'render',
    type: 'fw.dom.rendering',
    dependencies: ['secPolicy'],
    deps: [secPolicy],

    /** @returns {RenderAPI} */
    factory(secPolicy) {

        /**
         * Apply a single {@link MapEntry} to a base value, returning the new
         * resolved value. Handles `default` lookup, `prepend`/`append`/full-replace
         * positioning, and returns the unchanged `base` when no value is available.
         *
         * Pure function - used by both the array-oriented `elms` pass and the
         * single-elm `applyParsedElm` helper (the latter being the primitive
         * consumed by `uiSession.list`'s patch mode).
         *
         * @param {MapEntry} mapEntry - Binding descriptor (`{ name, prop, data?,
         *   append?, prepend?, tail?, default? }`).
         * @param {Object}   data     - Variable values keyed by `name`.
         * @param {*}        base     - Static base value to combine with.
         * @returns {*} Resolved value. Returns `base` unchanged when neither
         *   `data[name]` nor `mapEntry.default` is defined.
         */
        const computeBoundValue = function(mapEntry, data, base){
            const has = data != null && Object.prototype.hasOwnProperty.call(data, mapEntry.name);
            const value = has ? data[mapEntry.name] : mapEntry.default;
            let result;
            if (value === undefined) result = base;
            else if (mapEntry.append)  result = (base ?? '') + value;
            else if (mapEntry.prepend) result = value + (base ?? '');
            else result = value;
            // `tail` is an unconditional static run following this variable
            // (see MapEntry). It is preserved even when the value is absent so
            // that interleaved static segments survive a missing binding.
            if (mapEntry.tail != null) result = (result ?? '') + mapEntry.tail;
            return result;
        };

        /**
         * Apply all map entries of a single parsed elm to `data`, returning a
         * fresh object with resolved `data[prop]` (attributes) and top-level
         * `[prop]` (text) values. Does not mutate the input elm.
         *
         * Intended for `uiSession.list` patch mode (re-resolving an item's
         * bindings against new data without rebuilding the DOM). For full
         * array rendering, use {@link elms} instead.
         *
         * @param {ElmNode} parsedElm - Parsed elm carrying optional `map`, `data`,
         *   and `text` properties.
         * @param {Object}  data      - Variable values.
         * @returns {{ data: Object, [prop: string]: * }} Object with `.data` (attrs)
         *   and any text-target props applied. Properties not affected by `map`
         *   keep the elm's static base values.
         */
        const applyParsedElm = function(parsedElm, data){
            const out = {
                data: parsedElm.data ? { ...parsedElm.data } : {},
            };
            if (parsedElm.text != null) out.text = parsedElm.text;

            if (parsedElm.map && parsedElm.map.length > 0) {
                for (const m of parsedElm.map) {
                    if (m.data) {
                        out.data[m.prop] = computeBoundValue(m, data, out.data[m.prop]);
                    } else {
                        out[m.prop] = computeBoundValue(m, data, out[m.prop]);
                    }
                }
            }
            return out;
        };

        /**
         * Perform a shallow clone of an elm array, deep-copying only the mutable
         * `data` object and `map` entry objects so that downstream mutations do not
         * affect the original template.
         *
         * @param {ElmNode[]} array - Source elm array to clone.
         * @returns {ElmNode[]} New array of partially cloned elm nodes.
         */
        const cloneElmArray = function(array){
            return array.map(function(elm){
                return {
                    ...elm,
                    data: elm.data ? { ...elm.data } : elm.data,
                    map: elm.map ? elm.map.map(function(m){ return { ...m }; }) : elm.map
                };
            });
        }

        /**
         * Apply variable bindings from `options` onto a cloned elm array, mutating
         * `elm.data[prop]` (attributes) or `elm[prop]` (text) according to each
         * {@link MapEntry}'s positioning flags (`append`, `prepend`, or full replace),
         * then appending the entry's static `tail` run when present. Applying the
         * ordered entries left-to-right reconstructs interleaved static/var segments
         * (e.g. `"prefix#{v}suffix"`, `"a#{v1}b#{v2}c"`).
         *
         * If `attach` is provided, root-level elements (those without a `parent`
         * property) receive that value as their `parent`, so the batch can be
         * inserted under a specific slot in the DOM.
         *
         * @param {ElmNode[]} elm_array - Source elm array (will be cloned internally).
         * @param {Object}    options   - Key/value pairs for `#{var}` substitution.
         * @param {string|false} [attach=false] - ID of the parent element to attach
         *   root nodes to, or `false` to leave them as roots.
         * @returns {ElmNode[]} New elm array with bindings applied.
         */
        const elms = function(elm_array, options, attach= false){
            const elm_build = cloneElmArray(elm_array);

            elm_build.forEach(function(elm){
                if(attach !== false){
                    if(!Object.prototype.hasOwnProperty.call(elm, 'parent')){
                        elm.parent = attach;
                    }
                }

                if(elm.map && elm.map.length > 0){
                    elm.map.forEach(function(map){
                        let value = (Object.prototype.hasOwnProperty.call(options, map.name) ? options[map.name] : map.default);
                        if(value !== undefined){
                            if(map.data){
                                if(map.append) {
                                    elm.data[map.prop] += value
                                } else if(map.prepend){
                                    elm.data[map.prop] = value + elm.data[map.prop];
                                } else {
                                    elm.data[map.prop] = value;
                                }
                            } else {
                                if(map.append) {
                                    elm[map.prop] = elm[map.prop] + value
                                } else if(map.prepend){
                                    elm[map.prop] = value + elm[map.prop];
                                } else {
                                    elm[map.prop] = value;
                                }
                            }
                        }
                        // Static trailing run: appended unconditionally so
                        // interleaved static segments survive a missing value.
                        if(map.tail != null){
                            if(map.data){
                                elm.data[map.prop] = (elm.data[map.prop] ?? '') + map.tail;
                            } else {
                                elm[map.prop] = (elm[map.prop] ?? '') + map.tail;
                            }
                        }
                    });
                }
            });

            return elm_build;
        }

        /**
         * Rewrite every element ID in a cloned elm array to a new collision-safe
         * value, updating `parent` references and `content` slot names accordingly.
         *
         * New IDs are composed of a base-36 timestamp, the element's positional
         * index, and a cryptographically random 32-bit number to avoid collisions
         * across concurrent render passes.
         *
         * Note: ID randomness uses `crypto.getRandomValues` when available, falling
         * back to `Math.random` in environments without Web Crypto (Deno default,
         * minimal workers). The timestamp + index prefix keeps the collision risk
         * negligible in both cases.
         *
         * **Precondition:** elements must be ordered parents-before-children.
         */
        function _randomU32() {
            const g = (typeof globalThis !== 'undefined' ? globalThis : {});
            if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
                const buf = new Uint32Array(1);
                g.crypto.getRandomValues(buf);
                return buf[0];
            }
            // Last-resort fallback : Math.random. Only reached when crypto is
            // entirely absent — i.e. non-browser envs where sanity (which blocks
            // Math.random) is not active. Under sanity, the crypto path above runs.
            // eslint-disable-next-line no-restricted-properties -- guarded fallback; crypto path used whenever sanity is active
            return (Math.random() * 0xffffffff) >>> 0;
        }

        /**
         * Rewrite element IDs in a cloned elm array to collision-safe values.
         * @param {ElmNode[]} elm_array - Elm array (will be cloned internally).
         * @returns {RenderResult} Object with `arr`, `map`, and `content`.
         */
        // element must be ordered: parent always before child
        const rewrite = function(elm_array){
            const elm_build = cloneElmArray(elm_array);

            const id_map = new Map();
            const content = new Map();
            elm_build.forEach(function(elm, index) {

                id_map.set(elm.id, Date.now().toString(36) + index.toString() + _randomU32().toString(36));
                elm.id = id_map.get(elm.id);
                if (Object.prototype.hasOwnProperty.call(elm, 'parent') && id_map.has(elm.parent)) {
                    elm.parent = id_map.get(elm.parent);
                }
                if(elm.content) {
                    content.set(elm.content, elm.id);
                }
            });
            return {
                arr:elm_build,
                map:id_map,
                content:content
            };
        }

        /**
         * Convenience wrapper: apply `options` bindings then rewrite IDs in one call.
         *
         * Equivalent to `rewrite(elms(elm_array, options, attach))`.
         *
         * @param {ElmNode[]} elm_array        - Source elm array.
         * @param {Object}    [options={}]     - Variable bindings.
         * @param {string|false} [attach=false] - Parent element ID for root nodes.
         * @returns {RenderResult} Bound and rewritten result.
         */
        const parts = function(elm_array, options = {}, attach = false){
            return rewrite(elms(elm_array, options, attach));
        }

        /**
         * Render an elm array repeatedly, once per entry in `options`, producing an
         * independent {@link RenderResult} for each iteration (unique IDs, own maps).
         *
         * Used to populate iterate blocks where `data` is an array of objects.
         *
         * @param {ElmNode[]}  elm_array        - Template elm array for one iteration.
         * @param {Object[]}   [options=[]]     - Array of variable-binding objects,
         *   one per rendered instance.
         * @param {string|false} [attach=false] - Parent element ID for root nodes
         *   of every instance.
         * @returns {RenderResult[]} Array of per-iteration render results.
         */
        const loop = function(elm_array, options = [], attach = false){
            const elm_build = [];
            options.forEach(function(item){
                elm_build.push( rewrite(elms(elm_array, item, attach)) );
            });
            return elm_build;
        }

        /**
         * Perform a full render pass over a structured data array, resolving attach
         * slots, handling iterate blocks, and accumulating all output into a single
         * merged elm array.
         *
         * Each `item` in `data` describes one render unit:
         * ```
         * {
         *   template : ElmNode[],           // required - elm template to render
         *   data     : Object | Object[],   // bindings; array triggers loop mode
         *   id       : string,              // optional logical key → stored in id_map
         *   attach   : { elm: string, name: string }, // optional slot attachment
         * }
         * ```
         *
         * When `item.data` is an **array**, each entry is rendered with {@link loop}
         * and the resulting ID maps are stored as an array under `id_map.get(item.id)`.
         *
         * When an `attach` slot cannot be found in `attach_map`, the item is skipped
         * and its `id_map` entry is set to `false`.
         *
         * @param {Object[]}  data                                  - Array of render
         *   descriptors (see structure above).
         * @param {Map<string, {content: Map<string,string>}>} [attach_parent] - Existing
         *   attach-slot registry; pass the `attach` property from a previous `full()`
         *   call to chain nested renders.
         * @param {Map<string, Map<string,string>|false>}      [id_parent]    - Existing
         *   logical-ID map; pass the `map` from a previous call to extend it.
         * @returns {FullResult} Combined elm array, updated ID map, and attach registry.
         */
        const full = function(data, attach_parent, id_parent){
            const attach_map = attach_parent || new Map();
            const id_map= id_parent || new Map();
            const elm_build= [];
            data.forEach(function(item){
                /** @type {string|false} */
                let attach = false;
                let next = true;
                if(item.attach && attach_map.has(item.attach.elm)){
                    if(attach_map.get(item.attach.elm).content.has(item.attach.name)){
                        attach = attach_map.get(item.attach.elm).content.get(item.attach.name);
                    } else {
                        next = false;
                    }
                }

                if(next) {
                    if (Array.isArray(item.data)) {
                        const elms_loop = loop(item.template, item.data, attach);
                        if (Object.prototype.hasOwnProperty.call(item, 'id')){
                            id_map.set(item.id, []);
                            elms_loop.forEach(function (elm) {
                                elm_build.push(...elm.arr);
                                id_map.get(item.id).push(elm.map)
                            });
                        } else {
                            elms_loop.forEach(function (elm) {
                                elm_build.push(...elm.arr);
                            });
                        }
                    } else {
                        const elms = parts(item.template, item.data, attach);
                        if (Object.prototype.hasOwnProperty.call(item, 'id')) {
                            id_map.set(item.id, elms.map);
                            if(elms.content.size > 0) {
                                attach_map.set(item.id, {content: elms.content});
                            }
                        }
                        elm_build.push(...elms.arr);
                    }
                } else {
                    if (Object.prototype.hasOwnProperty.call(item, 'id')) {
                        id_map.set(item.id, false);
                    }
                }
            });

            return {
                arr: elm_build,
                map: id_map,
                attach: attach_map
            };
        }

        // ── Server-side rendering (SSR) ─────────────────────────────────────────

        // Set of HTML void elements whose tag self-closes in serialised output.
        // Mirrors the list in `parser.js`/`template.js`. (Not a security concern,
        // so it stays inlined here rather than in secPolicy.)
        const VOID_TAGS_SSR = new Set([
            'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr',
        ]);

        // All security primitives below are sourced from `secPolicy` - single
        // source of truth shared with `template.applyAttributes` (DOM path),
        // `sanitize` (HTML user-input path) and `dom.styleApply` (CSS path).
        const URL_ATTRS_SSR     = secPolicy.URL_ATTRS;
        const SSR_CLOBBER_NAMES = secPolicy.CLOBBER_NAMES;
        const SSR_CLOBBER_ATTRS = secPolicy.CLOBBER_ATTRS;
        const SSR_ATTR_RE       = secPolicy.SAFE_ATTR_NAME_RE;
        const SSR_EVENT_RE      = secPolicy.EVENT_ATTR_RE;
        const _ssrIsSafeUrl     = (url) => secPolicy.isSafeUrl(url);

        /**
         * Escape a string for safe insertion as HTML text content. Encodes
         * `& < > " '` to their entity equivalents.
         */
        function _ssrEscape(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        /**
         * Internal-tag → output HTML tag. Mirrors `parser.htmlTagName`.
         */
        function _ssrTagFor(internalTag) {
            if (internalTag === 'text') return 'span';
            if (internalTag.startsWith('svg_')) return internalTag.slice(4);
            return internalTag;
        }

        /**
         * Build the children-by-parent index for a flat elm-array.
         */
        function _ssrIndex(arr) {
            const byId = new Map();
            const kids = new Map();
            const roots = [];
            for (const el of arr) byId.set(el.id, el);
            for (const el of arr) {
                if (el.parent != null) {
                    if (!kids.has(el.parent)) kids.set(el.parent, []);
                    kids.get(el.parent).push(el);
                } else {
                    roots.push(el);
                }
            }
            return { byId, kids, roots };
        }

        /**
         * Serialise one node + its descendants to an HTML string.
         *
         * @param {ElmNode} elm           - Bound elm node (data/text already applied).
         * @param {Map}     kidsByParent  - Map<parentId, ElmNode[]>.
         * @param {Object}  opts          - SSR options (slots, iterates, hydrate, idPrefix).
         */
        function _ssrNode(elm, kidsByParent, opts) {
            const outTag = _ssrTagFor(elm.tag);
            const isVoid = VOID_TAGS_SSR.has(outTag);

            // --- Attributes ---
            const parts = [];
            if (elm.attrs) {
                for (const attr of elm.attrs) {
                    if (SSR_EVENT_RE.test(attr) || !SSR_ATTR_RE.test(attr)) continue;
                    const v = elm.data?.[attr];
                    if (v === null || v === false || v === undefined) continue;
                    // URL safety mirrors template.applyAttributes.
                    if (URL_ATTRS_SSR.has(attr) && !_ssrIsSafeUrl(String(v))) continue;
                    if (SSR_CLOBBER_ATTRS.has(attr) && SSR_CLOBBER_NAMES.has(String(v))) continue;
                    // Empty string : emit as boolean attr (open, disabled, …).
                    if (v === '') parts.push(' ' + attr);
                    else          parts.push(' ' + attr + '="' + _ssrEscape(v) + '"');
                }
            }

            // --- Hydration marker (data-fw-id) ---
            if (opts.hydrate && elm.id) {
                const id = opts.idPrefix ? opts.idPrefix + ':' + elm.id : elm.id;
                parts.push(' data-fw-id="' + _ssrEscape(id) + '"');
            }

            const openTag = '<' + outTag + parts.join('');

            if (isVoid) return openTag + ' />';

            // --- Body : text, slot, iterate, or children. ---
            let body = '';
            if (elm.text != null) {
                body = _ssrEscape(elm.text);
            } else if (elm.content != null) {
                // Slot or iterate placeholder.
                const slotName = elm.content;
                // Check iterates first (consumer-provided data array).
                if (opts.iterates && opts.iterates[slotName] != null) {
                    const subTpl = opts.iteratesTemplates?.[slotName];
                    if (subTpl) {
                        // Render the sub-template once per data row.
                        const rows = opts.iterates[slotName];
                        const lines = [];
                        for (let i = 0; i < rows.length; ++i) {
                            const rowData = rows[i];
                            // Clone + bind sub-template against this row.
                            const bound = elms(subTpl, rowData);
                            const bIdx = _ssrIndex(bound);
                            for (const root of bIdx.roots) {
                                lines.push(_ssrNode(root, bIdx.kids, opts));
                            }
                        }
                        body = lines.join('');
                    }
                } else if (opts.slots && opts.slots[slotName] != null) {
                    const slot = opts.slots[slotName];
                    body = typeof slot === 'function' ? String(slot()) : String(slot);
                }
                // Unfilled slot → empty body. Caller can hydrate later.
            } else {
                const kids = kidsByParent.get(elm.id);
                if (kids && kids.length) {
                    const out = [];
                    for (const child of kids) out.push(_ssrNode(child, kidsByParent, opts));
                    body = out.join('');
                }
            }

            return openTag + '>' + body + '</' + outTag + '>';
        }

        /**
         * Render a parsed template to a final HTML string - **server-side**.
         *
         * Pure function : no DOM access. Applies `data` bindings, escapes text,
         * filters URL / clobbering / event attributes (mirrors `template.js`
         * defences), and optionally embeds `data-fw-id` markers so a future
         * `uiSession.hydrate(root)` call can match the server-rendered DOM to
         * a client-side session.
         *
         * @param {ParseResult | ElmNode[]} input - A {@link ParseResult} (with
         *   optional `iterates`) or a raw elm-array.
         * @param {Object} [data]    - Variable bindings for `#{var}`.
         * @param {Object} [opts]
         * @param {boolean} [opts.hydrate=true] - Emit `data-fw-id` markers.
         * @param {string}  [opts.idPrefix]     - Namespace prefix for `data-fw-id`,
         *   useful when multiple SSR blocks coexist on one page.
         * @param {Object<string,string|Function>} [opts.slots] - Map of
         *   `${slotName}` → static HTML or `() => string` provider. Unfilled
         *   slots render empty.
         * @param {Object<string,Array>} [opts.iterates] - Per-iterate-block
         *   data : `{ item: [row1, row2, …] }`. The corresponding sub-template
         *   from `parseResult.iterates` is rendered once per row.
         * @returns {string} Serialised HTML.
         */
        const toHTML = function (input, data, opts) {
            const isArr     = Array.isArray(input);
            const tmpl      = isArr ? input : (input.template || []);
            const iterates  = isArr ? null  : input.iterates;
            const options   = {
                hydrate:           true,
                idPrefix:          '',
                slots:             {},
                iterates:          {},
                ...opts,
                iteratesTemplates: iterates || {},
            };

            // Bind data into a fresh copy of the template.
            const bound = elms(tmpl, data || {});
            const idx = _ssrIndex(bound);
            const out = [];
            for (const root of idx.roots) out.push(_ssrNode(root, idx.kids, options));
            return out.join('');
        };

        return { elms, rewrite, parts, loop, full, computeBoundValue, applyParsedElm, toHTML };
    }
};
