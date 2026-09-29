// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview HTML ↔ elm-array parser for the framework's virtual-DOM notation.
 *
 * Notation (see source/index.js MEMO):
 *   - `#{var_name}`                     - variable placeholder (text or attribute value)
 *   - `${slot_name}`                    - content slot (full text of a leaf element)
 *   - `<!-- $name --> … <!-- name$ -->` - iterate block delimited by HTML comments
 *
 * Rules:
 *   - A content slot becomes a `<span>` when it has sibling nodes, otherwise it
 *     is inlined as `elm.content` on the parent element.
 *   - An iterate block must not be used alongside sibling element nodes.
 *
 */

/**
 * A variable-binding descriptor that maps a named placeholder to a rendered target.
 *
 * @typedef {Object} MapEntry
 * @property {string}  name      - Placeholder variable name (from `#{name}`).
 * @property {string}  prop      - Target property: an attribute name, or `'text'`.
 * @property {boolean} [data]    - `true` when the target is `elm.data[prop]` (attribute);
 *                                 omitted / `false` for text content.
 * @property {boolean} [append]  - Value is appended after the static base string.
 * @property {boolean} [prepend] - Value is prepended before the static base string.
 * @property {string}  [tail]    - Static run that immediately follows this variable in
 *                                 the source value. Appended after the resolved value so
 *                                 that interleaved static segments (e.g. the trailing run
 *                                 of `"prefix#{v}suffix"`, or the `"b"` in
 *                                 `"a#{v1}b#{v2}c"`) are preserved. Present only when a
 *                                 non-empty trailing run exists.
 * @property {*}       [default] - Fallback value when the variable is absent from the
 *                                 options passed to `render`.
 */

/**
 * A single node in the flat elm-array representation.
 * Elements are stored in parent-before-child order.
 *
 * @typedef {Object} ElmNode
 * @property {string}               id       - Element identifier, unique within the parsed
 *                                             document (preserves the HTML `id` attribute
 *                                             when present, otherwise auto-generated as
 *                                             `p<n>`, skipping any `p<n>` already used as
 *                                             an explicit id in the same document).
 * @property {string}               tag      - Internal tag name.
 *                                             SVG child elements are prefixed: `svg_use`,
 *                                             `svg_rect`, … The synthetic `'text'` tag
 *                                             represents an inline bare-text node.
 * @property {string}               [parent] - `id` of the parent node (absent for roots).
 * @property {string[]}             [attrs]  - Ordered list of tracked attribute names.
 * @property {Object.<string,*>}[data]  - Attribute values, keyed by attr name (may be string, boolean, null, etc).
 * @property {string}               [text]   - Static text content (leaf nodes only).
 * @property {string}               [content]- Slot or iterate-block name.
 * @property {ElmNode[]}            [child]  - Inline child nodes (runtime extension for nested elms).
 * @property {boolean}              [prepend]- When true, insert before existing children.
 * @property {MapEntry[]}           [map]    - Variable binding descriptors.
 */

/**
 * Result returned by `fromHTML`.
 *
 * @typedef {Object} ParseResult
 * @property {ElmNode[]}                      template  - Flat, parent-ordered array of
 *                                                        elm nodes for the main markup.
 * @property {Object.<string, ElmNode[]>}     [iterates]- Sub-templates for iterate blocks,
 *                                                        keyed by block name. Present only
 *                                                        when at least one iterate block was
 *                                                        found in the HTML.
 */

/**
 * Internal tree structure built by `buildTree` for serialisation.
 *
 * @typedef {Object} ElmTree
 * @property {Map<string, ElmNode>}   byId  - Nodes indexed by id.
 * @property {Map<string, string[]>}  kids  - Children id arrays indexed by parent id.
 * @property {string[]}               roots - Ids of root-level nodes (no parent).
 */

/**
 * Manual cache controls exposed on the parser surface (test / power-user).
 *
 * @typedef {Object} ParserCache
 * @property {() => void}   clear  - Clear all cached entries and reset stats.
 * @property {(n: number) => void} setMax - Set the max cache size; 0 disables caching.
 * @property {() => number} getMax - Current max cache size.
 * @property {() => number} size   - Current number of cached entries.
 * @property {() => { hits: number, misses: number, evictions: number, size: number, max: number }} stats - Cache statistics snapshot.
 */

/**
 * Optional input of `fromHTML`.
 *
 * @typedef {Object} FromHTMLOptions
 * @property {Iterable<string>} [reserveIds] - Explicit ids the caller knows the
 *   assembled document will contain, declared UP FRONT. They are reserved for
 *   the whole parser instance (this call and every later one), so an auto
 *   `p<n>` never collides with an explicit id the instance has not met yet —
 *   the direction per-call and per-instance accumulation cannot cover. Empty
 *   and non-string entries are ignored. Supplying the option BYPASSES the
 *   source-keyed `ParseResult` cache (read and write): the reservation changes
 *   which ids are minted, so a cached entry would violate the contract.
 */

/**
 * Public surface returned by `parser.factory()`.
 *
 * @typedef {Object} ParserAPI
 * @property {(htmlString: string, options?: FromHTMLOptions) => ParseResult} fromHTML - Parse HTML to a (cached) {@link ParseResult}.
 * @property {(input: ElmNode[]|ParseResult) => string} toHTML - Serialise an elm array / ParseResult back to HTML.
 * @property {ParserCache} cache - Manual cache controls.
 */

import { secPolicy } from './secPolicy.js';

export const parser = {
    name: 'parser',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['secPolicy'],
    deps: [secPolicy],

    /** @returns {ParserAPI} */
    factory(secPolicy) {

        // ── Server-side HTML tokenizer (DOMParser fallback) ──────────────────────
        // Used by `fromHTML` when no `DOMParser` is available (Node/Bun without
        // happy-dom). Produces a tree of plain JS objects exposing the subset
        // of the DOM `Node` interface required by `walkElement` :
        //   { nodeType, tagName, attributes, childNodes, nodeValue, namespaceURI }
        // - plus `getAttribute(name)` on element nodes.
        //
        // The tokenizer is **forgiving but minimal**. It handles well-formed
        // HTML5-ish input :
        //   <tag>, <tag/>, </tag>, <tag a="v">, <tag a='v'>, <tag a>, <!-- … -->
        //   void elements (br/img/…), text with #{var} and ${slot} preserved,
        //   basic entities (&amp; &lt; &gt; &quot; &apos; numeric).
        // It deliberately ignores DOCTYPE, CDATA, and processing instructions.
        // For complex/broken HTML, a browser DOMParser polyfill (happy-dom,
        // linkedom) remains a valid drop-in.

        const SVG_TAG = 'svg';

        const ENTITY_MAP = {
            amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
        };

        function _decodeEntities(s) {
            if (s.indexOf('&') === -1) return s;
            return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
                if (body[0] === '#') {
                    const cp = body[1] === 'x' || body[1] === 'X'
                        ? parseInt(body.slice(2), 16)
                        : parseInt(body.slice(1), 10);
                    if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10FFFF) {
                        try { return String.fromCodePoint(cp); }
                        catch { return m; }
                    }
                    return m;
                }
                return ENTITY_MAP[body.toLowerCase()] ?? m;
            });
        }

        function _makeElement(tagName, namespaceURI) {
            const el = {
                nodeType: NODE_ELEMENT,
                tagName: tagName.toUpperCase(),     // browsers report uppercase
                namespaceURI: namespaceURI || null,
                attributes: [],
                childNodes: [],
                _attrMap: null,
                getAttribute(name) {
                    if (!this._attrMap) {
                        this._attrMap = Object.create(null);
                        for (const a of this.attributes) this._attrMap[a.name] = a.value;
                    }
                    return this._attrMap[name] ?? null;
                },
            };
            return el;
        }
        function _makeText(value)    { return { nodeType: NODE_TEXT,    nodeValue: value }; }
        function _makeComment(value) { return { nodeType: NODE_COMMENT, nodeValue: value }; }

        // Parse an opening tag starting at `pos` (which points to '<').
        // Returns { tag, attrs:[{name,value}], selfClose, end } where `end`
        // is the index just past the closing '>'.
        function _parseOpenTag(html, pos) {
            const len = html.length;
            // Expect '<' at pos already verified by caller.
            let i = pos + 1;
            // Tag name
            const tagStart = i;
            while (i < len) {
                const c = html.charCodeAt(i);
                // Letters, digits, '-', '_'
                if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a)
                    || (c >= 0x61 && c <= 0x7a) || c === 0x2d || c === 0x5f) {
                    i++;
                } else break;
            }
            if (i === tagStart) return null;
            const tag = html.slice(tagStart, i).toLowerCase();

            const attrs = [];
            let selfClose = false;

            while (i < len) {
                // Skip whitespace.
                while (i < len && /\s/.test(html[i])) i++;
                if (i >= len) return null;
                const c = html[i];
                if (c === '>') { i++; break; }
                if (c === '/' && html[i + 1] === '>') { selfClose = true; i += 2; break; }
                // Attribute name.
                const nStart = i;
                while (i < len && !/[\s=/>]/.test(html[i])) i++;
                const name = html.slice(nStart, i).toLowerCase();
                if (!name) { i++; continue; }
                // Optional value.
                while (i < len && /\s/.test(html[i])) i++;
                let value = '';
                if (html[i] === '=') {
                    i++;
                    while (i < len && /\s/.test(html[i])) i++;
                    const q = html[i];
                    if (q === '"' || q === "'") {
                        const vStart = ++i;
                        while (i < len && html[i] !== q) i++;
                        value = _decodeEntities(html.slice(vStart, i));
                        if (html[i] === q) i++;
                    } else {
                        const vStart = i;
                        while (i < len && !/[\s>]/.test(html[i])) i++;
                        value = _decodeEntities(html.slice(vStart, i));
                    }
                }
                attrs.push({ name, value });
            }
            return { tag, attrs, selfClose, end: i };
        }

        // ── Constants ────────────────────────────────────────────────────────────

        const SVG_NS = 'http://www.w3.org/2000/svg';

        const VOID_TAGS = new Set([
            'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'
        ]);

        // DOM Node type constants - duplicated locally so `walkElement` runs
        // identically against either a real DOM tree (browser, happy-dom) or
        // the server-side tokenizer tree built below. Avoids reference to the
        // global `Node` interface which is browser-only.
        const NODE_ELEMENT = 1;
        const NODE_TEXT    = 3;
        const NODE_COMMENT = 8;

        // Explicit internal-tag → HTML-tag overrides
        // Generic rule: svg_* → strip prefix (svg_use→use, svg_rect→rect, …)
        // Exception: tag:'text' is a synthetic inline-text wrapper (→ bare text in toHTML,
        //            but rendered as <span> by template.js via its own tag === 'text' guard)
        const INTERNAL_TO_HTML = { text: 'span' };

        // Tags silently dropped during parsing - sourced from secPolicy
        // (single source of truth for blocked tags across the framework).
        const RE_BLOCKED_TAG = secPolicy.BLOCKED_TAGS_RE;

        // ── Regex patterns ───────────────────────────────────────────────────────

        const RE_SLOT    = /^\s*\$\{([^}]+)\}\s*$/;          // ${slot_name} – full text
        const RE_VAR_SEP = /(#\{[^}]+\})/;                    // split token for #{var}
        const RE_VAR_ONE = /^#\{([^}]+)\}$/;                  // single #{var} token
        const RE_IT_S    = /^\s*\$([a-zA-Z_]\w*)\s*$/;        // comment: $name
        const RE_IT_E    = /^\s*([a-zA-Z_]\w*)\$\s*$/;        // comment: name$
        // Attribute-name shape regexes - sourced from secPolicy.
        const RE_SAFE_A  = secPolicy.SAFE_ATTR_NAME_RE;       // attr must start with a letter
        const RE_EVENT   = secPolicy.EVENT_ATTR_RE;           // block on* event attributes

        function parseHTMLString(html) {
            const root = _makeElement('root');
            const stack = [{ el: root, ns: null }];
            let pos = 0;
            const len = html.length;

            while (pos < len) {
                const top = stack[stack.length - 1];
                const ch = html[pos];

                if (ch === '<') {
                    // Comment ?
                    if (html.startsWith('<!--', pos)) {
                        const end = html.indexOf('-->', pos + 4);
                        if (end === -1) break;
                        top.el.childNodes.push(_makeComment(html.slice(pos + 4, end)));
                        pos = end + 3;
                        continue;
                    }
                    // DOCTYPE / processing-instruction : skip.
                    if (html.charCodeAt(pos + 1) === 0x21 /* ! */
                        || html.charCodeAt(pos + 1) === 0x3f /* ? */) {
                        const end = html.indexOf('>', pos);
                        if (end === -1) break;
                        pos = end + 1;
                        continue;
                    }
                    // Closing tag ?
                    if (html[pos + 1] === '/') {
                        const end = html.indexOf('>', pos);
                        if (end === -1) break;
                        const closeName = html.slice(pos + 2, end).trim().toLowerCase();
                        // Pop the stack until we find a matching tag (forgiving).
                        for (let i = stack.length - 1; i > 0; --i) {
                            if (stack[i].el.tagName.toLowerCase() === closeName) {
                                stack.length = i;
                                break;
                            }
                        }
                        pos = end + 1;
                        continue;
                    }
                    // Opening tag.
                    const open = _parseOpenTag(html, pos);
                    if (!open) { pos++; continue; }
                    // SVG namespace propagation : inside <svg>, all descendants are SVG.
                    const parentNS = top.ns;
                    const ns = (open.tag === SVG_TAG) ? SVG_NS : parentNS;
                    const el = _makeElement(open.tag, ns);
                    for (const a of open.attrs) el.attributes.push(a);
                    top.el.childNodes.push(el);
                    const isVoid = VOID_TAGS.has(open.tag) || open.selfClose;
                    if (!isVoid) stack.push({ el, ns });
                    pos = open.end;
                    continue;
                }

                // Text node : up to the next '<'.
                const next = html.indexOf('<', pos);
                const textEnd = next === -1 ? len : next;
                const raw = html.slice(pos, textEnd);
                if (raw) top.el.childNodes.push(_makeText(_decodeEntities(raw)));
                pos = textEnd;
            }
            return root;
        }

        // ── Notation (see source/index.js MEMO) ──────────────────────────────────
        //   #{var_name}                        → variable placeholder (text / attr)
        //   ${slot_name}                       → content slot (full text of a leaf)
        //   <!-- $name --> … <!-- name$ -->    → iterate block (comment delimiters)

        // "content slot" becomes span tag if he has neighbors
        //                else become part of parent tag
        // "iterate block" must not be used with neighbor tag

        // ── ID generator ─────────────────────────────────────────────────────────

        let _seq = 0;

        /**
         * Explicit ids reserved for the WHOLE parser instance: every explicit id
         * seen by a previous `fromHTML` call, plus every id a caller declared up
         * front via {@link FromHTMLOptions}`.reserveIds`.
         *
         * A consumer may assemble ONE logical document from SEVERAL `fromHTML`
         * calls on a shared instance (parsing each block separately). The
         * per-call set alone gives no guarantee across that seam, and the harm
         * is the same as within a call: `buildTree` merges by id with
         * last-write-wins, so a cross-call collision DELETES a subtree from the
         * assembled output.
         *
         * @type {Set<string>}
         */
        const _reservedAll = new Set();

        /**
         * Fold an iterable of explicit ids into the instance-wide reserved set.
         *
         * Empty, whitespace-only and non-string entries are ignored (the same
         * shape filter `collectExplicitIds` applies to `id` attributes).
         *
         * @param {Iterable<string>} [ids] - Ids to reserve; nullish is a no-op.
         * @param {Set<string>} [into] - Optional per-call set to mirror into.
         * @returns {void}
         */
        function reserveInstanceIds(ids, into) {
            if (!ids) return;
            for (const raw of ids) {
                if (typeof raw !== 'string') continue;
                const id = raw.trim();
                if (!id) continue;
                _reservedAll.add(id);
                if (into) into.add(id);
            }
        }

        /**
         * Generate a unique element ID of the form `p<n>`.
         *
         * The counter is scoped to the parser INSTANCE and keeps running across
         * `fromHTML` calls (a site build shares one parser across every
         * document, and the emitted ids are part of the hydrate-key surface —
         * it must not restart per document).
         *
         * A value already used as an explicit `id` is skipped: `buildTree`
         * indexes nodes by id with last-write-wins, so a collision between an
         * auto-minted `pN` and an explicit `pN` silently drops one of the two
         * nodes from the emitted HTML. Two reservation layers are consulted:
         * `reserved` — every explicit id of the current document, collected up
         * front by `collectExplicitIds` so ids appearing AFTER the mint point
         * count too — and `_reservedAll`, the instance-wide set (earlier calls'
         * explicit ids + any caller-supplied `reserveIds`).
         *
         * @param {Set<string>} [reserved] - Explicit ids of the document being
         *   parsed. Omitted / empty means "no document context".
         * @returns {string} Next sequential ID string, unused in this document
         *   and unused anywhere this instance has reserved.
         */
        const nextId = (reserved) => {
            let id = 'p' + (_seq++);
            while ((reserved && reserved.has(id)) || _reservedAll.has(id)) {
                id = 'p' + (_seq++);
            }
            return id;
        };

        /**
         * Collect every explicit `id` attribute of a parsed tree.
         *
         * Walks the whole node tree (DOM tree or internal-tokenizer tree alike)
         * so that `nextId` knows the document's full id set before the first
         * auto id is minted.
         *
         * @param {Node|Object} node - Root node to scan (inclusive of children).
         * @param {Set<string>} [into] - Accumulator set (created when omitted).
         * @returns {Set<string>} Set of trimmed, non-empty explicit ids.
         */
        function collectExplicitIds(node, into) {
            const out = into || new Set();
            const kids = node.childNodes;
            if (!kids) return out;
            for (const c of kids) {
                if (c.nodeType !== NODE_ELEMENT) continue;
                const raw = c.getAttribute ? c.getAttribute('id') : null;
                if (raw && raw.trim()) out.add(raw.trim());
                collectExplicitIds(c, out);
            }
            return out;
        }

        // ── Tag helpers ──────────────────────────────────────────────────────────

        /**
         * Derive the internal tag name from a DOM element.
         *
         * SVG child elements (namespace = SVG_NS, tag ≠ `'svg'`) are prefixed with
         * `svg_` so that `template.js` can clone them from their namespace-aware
         * `<template class="svg_*">` entries.
         *
         * @param {Element} el - The DOM element to inspect.
         * @returns {string} Internal tag name (e.g. `'div'`, `'svg_use'`).
         */
        function internalTag(el) {
            const raw = el.tagName.toLowerCase();
            if (el.namespaceURI === SVG_NS && raw !== 'svg') return 'svg_' + raw;
            return raw;
        }

        /**
         * Convert an internal tag name to its HTML serialisation form.
         *
         * - Looks up an explicit override in `INTERNAL_TO_HTML`.
         * - Strips the `svg_` prefix for SVG child elements.
         * - Falls back to the tag unchanged.
         *
         * @param {string} tag - Internal tag name.
         * @returns {string} HTML tag name to use when serialising.
         */
        function htmlTagName(tag) {
            if (INTERNAL_TO_HTML[tag]) return INTERNAL_TO_HTML[tag];
            if (tag.startsWith('svg_'))  return tag.slice(4);   // svg_rect → rect
            return tag;
        }

        // ── Shared helper: parse a raw string for #{var} placeholders ─────────────
        //
        //   Returns { val, maps } where:
        //     val  – static base stored in elm.data[prop] or elm.text
        //     maps – map-entry objects ready for elm.map
        //
        //   Positioning rules (mirror render.js):
        //     "prefix#{v}"        → append  : true,  val = "prefix"
        //     "#{v}suffix"        → prepend : true,  val = "suffix"
        //     "prefix#{v}suffix"  → append  : true,  val = "prefix", tail = "suffix"
        //     "#{v}"              → full replace,     val = ""
        //     "a#{v1}b#{v2}c"     → val = "a" (leading run); each entry appends its
        //                           resolved value then its trailing run via `tail`
        //                           (v1.tail = "b", v2.tail = "c").

        /**
         * Parse a raw string for `#{var}` placeholders and build the corresponding
         * static base value and {@link MapEntry} descriptors.
         *
         * Positioning rules (mirrored by `render.js`):
         *   - `"prefix#{v}"`       → `append: true`,  `val = "prefix"`
         *   - `"#{v}suffix"`       → `prepend: true`, `val = "suffix"`
         *   - `"prefix#{v}suffix"` → `append: true`,  `val = "prefix"`, `tail = "suffix"`
         *   - `"#{v}"`             → full replace,     `val = ""`
         *   - `"a#{v1}b#{v2}c"`    → `val = "a"` (leading run); each entry `append`s its
         *     resolved value then its trailing static run via `tail` (`v1.tail = "b"`,
         *     `v2.tail = "c"`). Empty runs are omitted.
         *
         * @param {string}  raw    - Raw string potentially containing `#{…}` tokens.
         * @param {string}  prop   - Property name the placeholders map to.
         * @param {boolean} isData - `true` when targeting an attribute (`elm.data[prop]`);
         *                          `false` when targeting text content.
         * @returns {{ val: string, maps: MapEntry[] }} Static base value and binding
         *   descriptors. Returns the original string and an empty array when no
         *   placeholders are found.
         */
        function parseVarString(raw, prop, isData) {
            const parts = raw.split(RE_VAR_SEP);
            if (parts.length === 1) return { val: raw, maps: [] };

            const vars = [];
            parts.forEach((p, i) => {
                const m = p.match(RE_VAR_ONE);
                if (m) vars.push({ name: m[1], idx: i });
            });

            const maps = [];

            // Single var: preserve the historical prefix-only / suffix-only /
            // full-replace shapes byte-for-byte; add `tail` only for the
            // both-sides `"prefix#{v}suffix"` case (previously lost the suffix).
            if (vars.length === 1) {
                const v      = vars[0];
                const before = parts.slice(0, v.idx).join('');
                const after  = parts.slice(v.idx + 1).join('');
                const entry  = { name: v.name, prop };
                if (isData) entry.data = true;

                if (before && !after)      { entry.append  = true; }
                else if (!before && after) { entry.prepend = true; }
                else if (before && after)  { entry.append  = true; entry.tail = after; }
                // else: #{v} alone → full replace

                maps.push(entry);
                const base = entry.prepend ? after : before; // '' for full replace
                return { val: base, maps };
            }

            // Multiple vars: ordered static/var segment sequence. The value is
            //   base + Σ (resolve(var_i) + tail_i)
            // where `base` is the leading static run (before the first var) and
            // each entry appends its resolved value followed by its trailing run.
            const base = parts.slice(0, vars[0].idx).join('');
            vars.forEach((v, i) => {
                const nextIdx = (i + 1 < vars.length) ? vars[i + 1].idx : parts.length;
                const tail    = parts.slice(v.idx + 1, nextIdx).join('');
                const entry   = { name: v.name, prop, append: true };
                if (isData) entry.data = true;
                if (tail) entry.tail = tail;
                maps.push(entry);
            });

            return { val: base, maps };
        }

        /**
         * Reconstruct a raw `#{var}` string from a static base and its
         * {@link MapEntry} descriptors. Inverse of {@link parseVarString},
         * used by `toHTML` to regenerate the original template notation.
         *
         * @param {string}      base   - Static base value (may be `''` or `undefined`).
         * @param {MapEntry[]}  maps   - Full map array; entries for other props are ignored.
         * @param {string}      prop   - Target property to reconstruct.
         * @param {boolean}     isData - `true` for attribute entries; `false` for text.
         * @returns {string} Reconstructed raw string with `#{…}` placeholders.
         */
        function buildVarString(base, maps, prop, isData) {
            const propMaps = (maps || []).filter(m =>
                m.prop === prop && !!m.data === isData
            );
            if (propMaps.length === 0) return base ?? '';

            if (propMaps.length === 1) {
                const m  = propMaps[0];
                const ph = `#{${m.name}}`;
                if (m.append)  return (base || '') + ph + (m.tail || '');
                if (m.prepend) return ph + (base || '');
                return ph;  // full replace
            }

            // Multiple vars: leading static base, then each placeholder followed
            // by its trailing static run (`tail`).
            let result = base || '';
            propMaps.forEach(m => { result += `#{${m.name}}` + (m.tail || ''); });
            return result;
        }

        /**
         * Convert a flat, parent-ordered elm array into an {@link ElmTree} suited
         * for recursive serialisation in `toHTML`.
         *
         * @param {ElmNode[]} elmArray - Flat elm array (parents before children).
         * @returns {ElmTree} Tree representation with `byId`, `kids`, and `roots`.
         */
        function buildTree(elmArray) {
            const byId  = new Map();
            const kids  = new Map();
            const roots = [];

            elmArray.forEach(elm => {
                byId.set(elm.id, elm);
                kids.set(elm.id, []);
            });
            elmArray.forEach(elm => {
                if (elm.parent && byId.has(elm.parent)) {
                    kids.get(elm.parent).push(elm.id);
                } else {
                    roots.push(elm.id);
                }
            });

            return { byId, kids, roots };
        }

        /**
         * Recursively serialise a single elm node and its descendants to an
         * indented HTML string, restoring `#{var}` / `${slot}` / iterate-block
         * notation as required.
         *
         * @param {string}                        id          - Id of the node to serialise.
         * @param {ElmTree}                       tree        - Tree built by `buildTree`.
         * @param {Object.<string, ElmNode[]>}    iteratesMap - Sub-template arrays keyed by
         *                                                       iterate-block name.
         * @param {string}                        pad         - Current indentation prefix.
         * @returns {string} HTML fragment string for this node and its subtree.
         */
        function serializeNode(id, tree, iteratesMap, pad) {
            const elm = tree.byId.get(id);
            if (!elm) return '';

            // ── Synthetic text nodes ──────────────────────────────────────────────
            // tag:'text' is a bare inline-text wrapper created by fromHTML when a
            // text node has element siblings. In the HTML template notation it lives
            // as plain text (no <span>), so we emit it without any wrapping tag.
            if (elm.tag === 'text') {
                return buildVarString(elm.text ?? '', elm.map || [], 'text', false);
            }

            const tag    = htmlTagName(elm.tag);
            const maps   = elm.map || [];
            const indent = pad || '';
            const child0 = indent + '  ';   // one level deeper (children)
            const child1 = child0 + '  ';   // two levels deeper (iterate content)

            // ── Opening tag ──────────────────────────────────────────────────────
            let attrStr = `id="${elm.id}"`;
            if (elm.attrs) {
                elm.attrs.forEach(attr => {
                    const base = elm.data?.[attr] ?? '';
                    attrStr += ` ${attr}="${buildVarString(base, maps, attr, true)}"`;
                });
            }

            if (VOID_TAGS.has(tag)) {
                return `${indent}<${tag} ${attrStr}>`;
            }

            // ── Inner content ────────────────────────────────────────────────────
            let inner = '';

            if (elm.content) {
                const itTpl = iteratesMap && iteratesMap[elm.content];
                if (itTpl) {
                    // Inline the iterate sub-template between comment delimiters
                    const subTree  = buildTree(itTpl);
                    const subLines = subTree.roots
                        .map(rid => serializeNode(rid, subTree, iteratesMap, child1))
                        .join('\n');
                    inner =
                        `\n${child0}<!-- $${elm.content} -->\n` +
                        subLines +
                        `\n${child0}<!-- ${elm.content}$ -->\n${indent}`;
                } else {
                    inner = `\${${elm.content}}`;
                }

            } else if (
                Object.prototype.hasOwnProperty.call(elm, 'text') ||
                maps.some(m => m.prop === 'text' && !m.data)
            ) {
                // Leaf node: reconstruct text with #{var} placeholders
                inner = buildVarString(elm.text ?? '', maps, 'text', false);

            } else {
                // Container: recurse into children
                const childIds = tree.kids.get(id) || [];
                if (childIds.length > 0) {
                    // If ANY child is a synthetic 'text' node the content is mixed
                    // inline/block → use inline mode (no newlines) to avoid adding
                    // spurious whitespace-text between the elements.
                    const hasSyntheticText = childIds.some(cid => {
                        const c = tree.byId.get(cid);
                        return c && c.tag === 'text';
                    });

                    if (hasSyntheticText) {
                        // Inline mode: children concatenated, no wrapping newlines.
                        // 'text' nodes emit bare strings; element nodes emit their tags
                        // without extra indentation inside the parent.
                        inner = childIds
                            .map(cid => serializeNode(cid, tree, iteratesMap, ''))
                            .join('');
                    } else {
                        // Block mode: each child on its own indented line.
                        inner =
                            '\n' +
                            childIds
                                .map(cid => serializeNode(cid, tree, iteratesMap, child0))
                                .join('\n') +
                            '\n' + indent;
                    }
                }
            }

            return `${indent}<${tag} ${attrStr}>${inner}</${tag}>`;
        }

        // ── fromHTML ─────────────────────────────────────────────────────────────

        /**
         * Parse an HTML string into a flat elm-array representation.
         *
         * **Mixed content rules:**
         * - An element whose sole content is a text node is a *leaf*:
         *   - `${slot}` → `elm.content = 'slot'`
         *   - `#{var}` / plain text → `elm.text` + `elm.map`
         * - An element that has element children is a *container*:
         *   - Bare text nodes with element siblings become synthetic children:
         *     - `${slot}` → `{ tag: 'span', content: 'slot' }` (has siblings → span)
         *     - `#{var}` / plain text → `{ tag: 'text', text: …, map: … }`
         *   - Document order is preserved in the flat output array.
         *
         * **SVG:** Child elements of `<svg>` carry `namespaceURI = SVG_NS` and are
         * tagged `svg_<localname>` to match the `template.js` `svg_*` convention.
         *
         * **Security:** Uses `DOMParser` only - never `innerHTML` setter, `eval`,
         * or `Function`.
         *
         * **Id uniqueness:** auto-minted `p<n>` ids skip every explicit id of
         * this document, every explicit id seen by an earlier call on the same
         * instance, and every id passed through `reserveIdsInput`.
         *
         * @param {string} htmlString - HTML markup to parse.
         * @param {Iterable<string>} [reserveIdsInput] - Caller-declared explicit
         *   ids to reserve instance-wide before the walk.
         * @returns {ParseResult} Parsed result containing `template` and optional
         *   `iterates` sub-templates.
         */
        // ── ParseResult cache ──────────────────────────────────────────────
        // Keyed by the raw HTML source string. Bounded LRU-ish : on overflow
        // we drop the oldest insertion (Map preserves insertion order, so the
        // first key is the oldest). `_cacheStats` is exposed via getStats()
        // for instrumentation.
        let _cacheMax     = 64;        // entries; 0 disables caching
        const _cacheMap   = new Map();
        const _cacheStats = { hits: 0, misses: 0, evictions: 0 };

        function _cacheGet(key) {
            if (_cacheMax === 0) return undefined;
            const hit = _cacheMap.get(key);
            if (hit !== undefined) {
                // Bump to most-recent : delete + reinsert.
                _cacheMap.delete(key);
                _cacheMap.set(key, hit);
                _cacheStats.hits++;
            } else {
                _cacheStats.misses++;
            }
            return hit;
        }

        function _cacheSet(key, value) {
            if (_cacheMax === 0) return;
            if (_cacheMap.size >= _cacheMax) {
                // Drop oldest
                const oldest = _cacheMap.keys().next().value;
                _cacheMap.delete(oldest);
                _cacheStats.evictions++;
            }
            _cacheMap.set(key, value);
        }

        const _fromHTMLImpl = function(htmlString, reserveIdsInput) {
            // Resolve a tree root suitable for `walkElement`. In browser /
            // happy-dom contexts we use DOMParser (battle-tested, fast). In
            // pure-Node/Bun (SSR), we fall back to the framework's internal
            // tokenizer (`parseHTMLString` below), which produces a tree
            // matching the same Node-shape interface that walkElement consumes.
            const rootNode = (typeof DOMParser !== 'undefined')
                ? new DOMParser().parseFromString(
                    '<html><body>' + htmlString + '</body></html>',
                    'text/html'
                  ).body
                : parseHTMLString(htmlString);

            // Every explicit id of THIS document, collected before the walk so
            // that an auto-minted `pN` never collides with an explicit `pN` —
            // including one that only appears further down the tree.
            const reserved = collectExplicitIds(rootNode);
            // Cross-call layers, both applied BEFORE the walk as well:
            //  - ids the caller declared up front for the whole assembled
            //    document (covers explicit ids this instance has not met yet);
            //  - this document's explicit ids, folded into the instance set so
            //    a LATER call never re-mints them.
            reserveInstanceIds(reserveIdsInput, reserved);
            for (const id of reserved) _reservedAll.add(id);

            const template = [];
            const iterates = {};

            function walkElement(el, parentId, out) {
                const rawTag = el.tagName.toLowerCase();
                if (RE_BLOCKED_TAG.test(rawTag)) return;

                const tag  = internalTag(el);
                const atId = el.getAttribute('id');
                const id   = (atId && atId.trim()) ? atId.trim() : nextId(reserved);

                const elm     = { id, tag };
                if (parentId !== null && parentId !== undefined) elm.parent = parentId;

                const allMaps = [];
                const attrs   = [];
                const data    = {};

                // ── Attributes ───────────────────────────────────────────────────
                for (const attr of el.attributes) {
                    if (attr.name === 'id') continue;
                    if (!RE_SAFE_A.test(attr.name)) continue;
                    if (RE_EVENT.test(attr.name)) continue;

                    const { val, maps } = parseVarString(attr.value, attr.name, true);
                    attrs.push(attr.name);
                    data[attr.name] = val;
                    allMaps.push(...maps);
                }
                if (attrs.length > 0) {
                    elm.attrs = attrs;
                    elm.data  = { ...data };
                }

                // ── Children: scan for iterate comment blocks ─────────────────────
                const childNodes  = Array.from(el.childNodes);
                let   iterateName = null;
                let   inIter      = false;
                const iterKids    = [];   // elements inside <!-- $name -->...<!-- name$ -->
                const plainKids   = [];   // everything else (in document order)

                for (const c of childNodes) {
                    if (c.nodeType === NODE_COMMENT) {
                        const sm = c.nodeValue.match(RE_IT_S);
                        const em = c.nodeValue.match(RE_IT_E);
                        if (sm) {
                            iterateName = sm[1];
                            inIter      = true;
                        } else if (em && inIter) {
                            inIter = false;
                        }
                    } else if (inIter) {
                        if (c.nodeType === NODE_ELEMENT) iterKids.push(c);
                    } else {
                        plainKids.push(c);
                    }
                }

                // ── Content resolution ───────────────────────────────────────────

                if (iterateName) {
                    // This element is the slot container for an iterate block.
                    // Elements between the comment delimiters form a separate template.
                    elm.content = iterateName;
                    const subOut = [];
                    iterKids.forEach(c => walkElement(c, null, subOut));
                    iterates[iterateName] = subOut;

                    if (allMaps.length > 0) elm.map = allMaps;
                    out.push(elm);

                } else {
                    const elKids = plainKids.filter(c => c.nodeType === NODE_ELEMENT);

                    if (elKids.length === 0) {
                        // ── Leaf: sole text content ───────────────────────────────
                        const text = plainKids
                            .filter(c => c.nodeType === NODE_TEXT)
                            .map(c => c.nodeValue)
                            .join('')
                            .trim();

                        if (text) {
                            const slotM = text.match(RE_SLOT);
                            if (slotM) {
                                elm.content = slotM[1];
                            } else {
                                const { val, maps } = parseVarString(text, 'text', false);
                                elm.text = val;
                                allMaps.push(...maps);
                            }
                        }

                        if (allMaps.length > 0) elm.map = allMaps;
                        out.push(elm);

                    } else {
                        // ── Container: has element children ───────────────────────
                        // Push the parent first (order invariant: parent before children).
                        if (allMaps.length > 0) elm.map = allMaps;
                        out.push(elm);

                        // Process children IN DOCUMENT ORDER.
                        // Non-empty text nodes that live alongside element siblings
                        // cannot be represented as elm.text; they become synthetic
                        // child elements instead.
                        plainKids.forEach(c => {
                            if (c.nodeType === NODE_ELEMENT) {
                                walkElement(c, id, out);

                            } else if (c.nodeType === NODE_TEXT) {
                                const rawText = c.nodeValue.trim();
                                if (!rawText) return; // whitespace-only → skip

                                const slotM = rawText.match(RE_SLOT);
                                if (slotM) {
                                    // ${slot} text node with element siblings → <span>
                                    // (the memo rule: "has neighbours → span tag")
                                    out.push({ id: nextId(reserved), tag: 'span', parent: id, content: slotM[1] });
                                } else {
                                    // Plain text or #{var} with element siblings →
                                    // synthetic 'text' node (rendered as <span> by
                                    // template.js, serialised as bare text by toHTML).
                                    const { val, maps } = parseVarString(rawText, 'text', false);
                                    const syn = { id: nextId(reserved), tag: 'text', parent: id, text: val };
                                    if (maps.length > 0) syn.map = maps;
                                    out.push(syn);
                                }
                            }
                        });
                    }
                }
            }

            Array.from(rootNode.childNodes).forEach(c => {
                if (c.nodeType === NODE_ELEMENT) walkElement(c, null, template);
            });

            const result = { template };
            if (Object.keys(iterates).length > 0) result.iterates = iterates;
            return result;
        };

        // ── toHTML ───────────────────────────────────────────────────────────────

        /**
         * Convert an elm array (or a {@link ParseResult} object) back to an HTML
         * string, reconstructing `#{var}` / `${slot}` / `<!-- $name -->` notation.
         *
         * Accepts either form:
         * ```js
         * toHTML(elmArray)
         * toHTML({ template: elmArray, iterates: { name: elmArray } })
         * ```
         *
         * @param {ElmNode[] | ParseResult} input - Flat elm array or a `ParseResult`
         *   as returned by `fromHTML`.
         * @returns {string} Indented HTML string with the original template notation
         *   restored.
         */
        const toHTML = function(input) {
            const isArr   = Array.isArray(input);
            const tmpl    = isArr ? input : (input.template || []);
            const iterMap = isArr ? {}    : (input.iterates || {});

            const tree = buildTree(tmpl);
            return tree.roots
                .map(id => serializeNode(id, tree, iterMap, ''))
                .join('\n');
        };

        /**
         * Cached `fromHTML` : returns the same ParseResult for identical input
         * strings. The cached object is a frozen reference - callers that need
         * to mutate it should clone first. Cache is bounded; oldest entries are
         * evicted on overflow.
         *
         * Supplying `options.reserveIds` BYPASSES the cache in both directions:
         * the reservation changes which auto ids are minted, so a hit keyed on
         * the source string alone would return a stale `ParseResult` that
         * violates the reservation, and storing the reserved-set result under
         * that same key would poison later plain calls. The reservation itself
         * is still recorded on the instance, so it keeps applying to every
         * subsequent call.
         *
         * @param {string} htmlString - HTML markup to parse.
         * @param {FromHTMLOptions} [options] - Optional parse inputs.
         * @returns {ParseResult} Parsed result.
         */
        const fromHTML = function(htmlString, options) {
            const reserveIdsInput = options ? options.reserveIds : undefined;
            if (typeof htmlString !== 'string') {
                return _fromHTMLImpl(htmlString, reserveIdsInput);
            }
            if (reserveIdsInput !== undefined && reserveIdsInput !== null) {
                return _fromHTMLImpl(htmlString, reserveIdsInput);
            }
            const cached = _cacheGet(htmlString);
            if (cached !== undefined) return cached;
            const result = _fromHTMLImpl(htmlString);
            _cacheSet(htmlString, result);
            return result;
        };

        /**
         * Manual cache controls (test / power-user).
         */
        const cache = {
            /** Clear all cached entries. */
            clear() { _cacheMap.clear(); _cacheStats.hits = 0; _cacheStats.misses = 0; _cacheStats.evictions = 0; },
            /** Get/set the max cache size; 0 disables caching. */
            setMax(n) {
                _cacheMax = Math.max(0, n | 0);
                while (_cacheMap.size > _cacheMax) {
                    const oldest = _cacheMap.keys().next().value;
                    _cacheMap.delete(oldest);
                    _cacheStats.evictions++;
                }
            },
            getMax() { return _cacheMax; },
            size()   { return _cacheMap.size; },
            stats()  { return { ..._cacheStats, size: _cacheMap.size, max: _cacheMax }; },
        };

        return { fromHTML, toHTML, cache };
    }
};
