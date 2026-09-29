// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * HTML sanitizer for safe rendering of user-controlled content. Strips
 * unsafe tags (`<script>`, `<iframe>`, etc.), unsafe attributes
 * (`on*` event handlers, `javascript:` URLs in `href`), and dangerous
 * data URLs. Configurable allowlist for custom usage.
 *
 * Use cases : Markdown → HTML rendering, docx → HTML conversion,
 * any pipeline where user input may contain HTML fragments.
 *
 * Worker-safe: operates purely on strings, no DOM API.
 *
 * @example
 * const s = registry.resolve('sanitize');
 * s.sanitizeHtml('<p onclick="alert(1)">hi</p>');
 * // → '<p>hi</p>'
 */

// ---------------------------------------------------------------------------
// Factory export - only top-level export, per the fw pattern.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} SanitizeInstance
 * @property {(html: string, opts?: SanitizeOptions) => string} sanitizeHtml
 *   Sanitise an HTML fragment against the allowlist. Returns the cleaned string.
 * @property {(url: string, schemes?: string[], allowDataImage?: boolean) => boolean} isSafeUrl
 *   Forwards to `secPolicy.isSafeUrl` with sanitize defaults.
 * @property {{ tags: Set<string>, attributes: Record<string, Set<string>>, urlSchemes: string[] }} defaultAllowlist
 *   Frozen-by-convention default allowlist (do not mutate ; copy if needed).
 *
 * @typedef {object} SanitizeOptions
 * @property {Set<string>|string[]} [allowedTags]
 * @property {Record<string, Set<string>>} [allowedAttributes]
 * @property {string[]} [urlSchemes]
 * @property {boolean} [dropDangerousContent=true]
 */

import { secPolicy } from './secPolicy.js';

export const sanitize = {
    name: 'sanitize',
    type: 'fw.dom.rendering',
    dependencies: ['secPolicy'],
    deps: [secPolicy],
    /**
     * @param {object} secPolicy - Centralised security primitives (URL safety,
     *   event-attr detection, dangerous schemes). See `secPolicy.js`.
     * @returns {SanitizeInstance}
     */
    factory(secPolicy) {
        // -----------------------------------------------------------------------
        // Default allowlist - factory-local, immutable by convention.
        // -----------------------------------------------------------------------

        /**
         * Void HTML elements that cannot have content / closing tags.
         * Hoisted to factory scope (was per-tag allocation in the tokenizer loop).
         */
        const VOID_ELEMENTS = new Set([
            'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'
        ]);

        /** Allowed tag names (lowercased). */
        const DEFAULT_TAGS = new Set([
            'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
            'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
            'em', 'figcaption', 'figure',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre',
            'q', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary',
            'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tfoot', 'tr', 'u', 'ul',
            'var', 'wbr'
        ]);

        /**
         * Allowed attributes per tag (tag → Set<attr>).
         * '*' key applies to all tags.
         */
        const DEFAULT_ATTRIBUTES = {
            '*':     new Set(['class', 'id', 'title', 'dir', 'lang', 'tabindex']),
            'a':     new Set(['href', 'name', 'target', 'rel']),
            'img':   new Set(['src', 'alt', 'width', 'height', 'loading']),
            'td':    new Set(['colspan', 'rowspan', 'align', 'valign']),
            'th':    new Set(['colspan', 'rowspan', 'align', 'valign', 'scope']),
            'col':   new Set(['span']),
            'colgroup': new Set(['span']),
            'ol':    new Set(['start', 'type', 'reversed']),
            'li':    new Set(['value']),
            'q':     new Set(['cite']),
            'blockquote': new Set(['cite']),
            'del':   new Set(['cite', 'datetime']),
            'ins':   new Set(['cite', 'datetime']),
            'details': new Set(['open']),
        };

        /** URL schemes considered safe (no trailing colon). */
        const DEFAULT_URL_SCHEMES = ['http', 'https', 'mailto', 'tel', 'ftp'];

        /** Default allowlist object (plain object - copy before mutating). */
        const defaultAllowlist = {
            tags: DEFAULT_TAGS,
            attributes: DEFAULT_ATTRIBUTES,
            urlSchemes: DEFAULT_URL_SCHEMES
        };

        // -----------------------------------------------------------------------
        // Tags whose entire content must be stripped (not just the wrapper)
        // -----------------------------------------------------------------------
        const DANGEROUS_CONTENT_TAGS = new Set([
            'script', 'style', 'iframe', 'object', 'embed', 'noscript',
            'noembed', 'noframes', 'xmp', 'plaintext', 'textarea',
            'svg', 'math', 'template', 'link', 'meta', 'head', 'frame', 'frameset'
        ]);

        // -----------------------------------------------------------------------
        // Regex - factory-local instances, no shared lastIndex across consumers.
        // -----------------------------------------------------------------------

        // HTML comment matcher (used to strip comments before tag tokenisation).
        const COMMENT_RE = /<!--[\s\S]*?-->/g;

        // Tokenizer : captures end-tag slash, tag name, attribute soup, self-close slash.
        // NOTE : the /g flag is intentional for the exec()-in-loop usage ;
        // `lastIndex` is reset to 0 before each loop (defensive hygiene).
        const TAG_RE = /<\s*(\/\s*)?([a-zA-Z][a-zA-Z0-9-]*)\s*([^>]*?)\s*(\/\s*)?\s*>/g;

        // Attribute tokenizer: name[=value]
        const ATTR_RE = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/g;

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        /**
         * Whether `url` uses a safe scheme. Forwards to `secPolicy.isSafeUrl`
         * - the single source of truth for URL safety across the framework.
         * `data:image/*` is opt-in via `allowDataImage` (sanitize defaults to
         * `false`, unlike template/render which always accept images).
         */
        function isSafeUrl(url, schemes, allowDataImage) {
            return secPolicy.isSafeUrl(url, schemes ?? DEFAULT_URL_SCHEMES, !!allowDataImage);
        }

        /** Parse attribute soup into a plain object {name: value}. */
        function parseAttrs(soup) {
            const result = {};
            if (!soup) return result;
            ATTR_RE.lastIndex = 0; // hygiene : reset before every use
            let m;
            while ((m = ATTR_RE.exec(soup)) !== null) {
                const name = m[1].toLowerCase();
                const value = m[2] !== undefined ? m[2]
                            : m[3] !== undefined ? m[3]
                            : m[4] !== undefined ? m[4]
                            : '';
                result[name] = value;
            }
            return result;
        }

        /**
         * Whether `attrName` is allowed on `tag` for the given `al` allowlist.
         *
         * @param {string} attrName
         * @param {string} tag
         * @param {object} al
         * @returns {boolean}
         */
        // Set of explicitly blocked attribute names. Prefix-based blocks
        // (v-, ng-, :, @) are handled separately below - entries with those
        // prefixes were removed from this Set because the prefix check
        // intercepts them first (dead entries).
        const _BLOCKED_ATTRS = new Set([
            'style', 'srcdoc', 'formaction', 'action', 'ping',
            'xlink:href', 'xmlns', 'xlink:actuate', 'xlink:show',
            'data-bind'
        ]);

        function isAttrAllowed(attrName, tag, al) {
            // Block all on* event handlers unconditionally.
            if (/^on[a-z]/i.test(attrName)) return false;
            // Prefix-based blocks (framework binding syntaxes).
            if (attrName.startsWith('v-') || attrName.startsWith('ng-') || attrName.startsWith(':') || attrName.startsWith('@')) return false;
            if (_BLOCKED_ATTRS.has(attrName)) return false;

            const attrs = al.attributes || DEFAULT_ATTRIBUTES;
            const globalSet = attrs['*'];
            if (globalSet && globalSet.has(attrName)) return true;
            const tagSet = attrs[tag];
            if (tagSet && tagSet.has(attrName)) return true;
            return false;
        }

        /**
         * Build the attribute string to append to a tag, filtering by allowlist.
         *
         * @param {object} attrs - parsed attribute map.
         * @param {string} tag
         * @param {object} al - allowlist bundle.
         * @returns {string}
         */
        function buildAttrs(attrs, tag, al) {
            const schemes = al.urlSchemes || DEFAULT_URL_SCHEMES;
            let out = '';
            for (const name of Object.keys(attrs)) {
                if (!isAttrAllowed(name, tag, al)) continue;
                let value = attrs[name];
                // URL attributes: enforce scheme allowlist.
                // data: image URLs are blocked by default; caller can opt-in via opts.allowDataImage.
                if (name === 'href' || name === 'src') {
                    if (!isSafeUrl(value, schemes, false)) continue;
                }
                // Sanitize value: strip angle brackets and quotes to prevent injection.
                value = String(value).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim();
                // For href/src, also strip newlines/tabs that may sneak through.
                if (name === 'href' || name === 'src') {
                    value = value.replace(/[\r\n\t]/g, '');
                }
                out += ' ' + name + '="' + value + '"';
            }
            // Add rel="noopener noreferrer" to external <a target="_blank"> only.
            // Matches the documented behaviour of mainstream sanitisers
            // (DOMPurify et al.) - the `window.opener` XSS vector only exists
            // when a new browsing context is opened, i.e. when target="_blank"
            // (or other named target). Plain in-place navigation does not
            // create the opener relationship.
            if (tag === 'a') {
                const href   = attrs['href'] || '';
                const target = (attrs['target'] || '').toLowerCase().trim();
                const isExternal = /^https?:\/\//i.test(href.trim());
                const opensNew   = target === '_blank' || (target !== '' && target !== '_self' && target !== '_parent' && target !== '_top');
                if (isExternal && opensNew) {
                    // Merge with existing rel if present.
                    const existingRel = attrs['rel'] ? attrs['rel'].toLowerCase() : '';
                    const hasNoopener = existingRel.includes('noopener');
                    const hasNoreferrer = existingRel.includes('noreferrer');
                    if (!hasNoopener || !hasNoreferrer) {
                        // Remove existing rel from out (already written above) and rebuild.
                        out = out.replace(/ rel="[^"]*"/, '');
                        const relParts = [];
                        if (existingRel) relParts.push(existingRel);
                        if (!hasNoopener) relParts.push('noopener');
                        if (!hasNoreferrer) relParts.push('noreferrer');
                        out += ' rel="' + relParts.join(' ').trim() + '"';
                    }
                }
            }
            return out;
        }

        // -----------------------------------------------------------------------
        // Main sanitizer
        // -----------------------------------------------------------------------

        /**
         * Sanitize an HTML string against an allowlist.
         *
         * @param {string} html - raw HTML string.
         * @param {object} [opts]
         * @param {Set<string>} [opts.allowedTags] - override allowed tags (Set or Array).
         * @param {object} [opts.allowedAttributes] - override allowed attributes map.
         * @param {string[]} [opts.urlSchemes] - override allowed URL schemes.
         * @param {boolean} [opts.dropDangerousContent=true] - strip inner content of
         *        dangerous tags (script, iframe, style…).
         * @returns {string}
         */
        function sanitizeHtml(html, opts) {
            if (typeof html !== 'string' || html.length === 0) return '';

            // Strip null bytes and other control chars that can confuse tag parsers.
            html = html.replace(/\x00/g, '');

            // Strip HTML comments entirely. Comments can carry dangerous
            // payloads in chained-sanitiser pipelines (e.g. `<!-- </style>
            // <script>…` patterns) and the tokenizer below does not recurse
            // into them. Safer to drop them up-front.
            html = html.replace(COMMENT_RE, '');

            // Build effective allowlist.
            const al = {
                tags: (opts && opts.allowedTags)
                    ? (opts.allowedTags instanceof Set ? opts.allowedTags : new Set(opts.allowedTags))
                    : DEFAULT_TAGS,
                attributes: (opts && opts.allowedAttributes !== undefined)
                    ? opts.allowedAttributes
                    : DEFAULT_ATTRIBUTES,
                urlSchemes: (opts && opts.urlSchemes) ? opts.urlSchemes : DEFAULT_URL_SCHEMES
            };
            const dropDangerous = !(opts && opts.dropDangerousContent === false);

            // First pass: strip content of dangerous block tags entirely.
            let s = html;
            if (dropDangerous) {
                for (const t of DANGEROUS_CONTENT_TAGS) {
                    // Remove matched open+close pairs (including content).
                    const re = new RegExp('<\\s*' + t + '(\\s[^>]*)?>([\\s\\S]*?)<\\s*\\/\\s*' + t + '\\s*>', 'gi');
                    s = s.replace(re, '');
                    // Remove unclosed dangerous openers + everything after.
                    const re2 = new RegExp('<\\s*' + t + '\\b[^>]*>[\\s\\S]*$', 'gi');
                    s = s.replace(re2, '');
                    // Remove self-closing / lone opening dangerous tags.
                    const re3 = new RegExp('<\\s*' + t + '\\b[^>]*/>', 'gi');
                    s = s.replace(re3, '');
                    const re4 = new RegExp('<\\s*' + t + '\\b[^>]*>', 'gi');
                    s = s.replace(re4, '');
                }
            }

            // Second pass: walk remaining tags and filter by allowlist.
            const parts = [];
            let lastIndex = 0;
            let m;
            TAG_RE.lastIndex = 0; // hygiene : reset before each loop
            while ((m = TAG_RE.exec(s)) !== null) {
                // Append literal text between tags.
                parts.push(s.slice(lastIndex, m.index));
                lastIndex = m.index + m[0].length;

                const isEnd = !!(m[1] && m[1].trim() === '/');
                const tag = m[2].toLowerCase();
                const attrSoup = m[3] || '';
                const isSelfClose = !!(m[4] && m[4].trim() === '/');

                if (!al.tags.has(tag)) {
                    // Drop tag; text body was already emitted or will be in next iteration.
                    continue;
                }

                if (isEnd) {
                    parts.push('</' + tag + '>');
                    continue;
                }

                const parsedAttrs = parseAttrs(attrSoup);
                const attrStr = buildAttrs(parsedAttrs, tag, al);

                // Void / self-closing elements (VOID_ELEMENTS hoisted to factory scope).
                if (isSelfClose || VOID_ELEMENTS.has(tag)) {
                    parts.push('<' + tag + attrStr + ' />');
                } else {
                    parts.push('<' + tag + attrStr + '>');
                }
            }
            parts.push(s.slice(lastIndex));
            return parts.join('');
        }

        // -----------------------------------------------------------------------
        // Public API
        // -----------------------------------------------------------------------

        return {
            sanitizeHtml,
            isSafeUrl,
            defaultAllowlist
        };
    }
};
