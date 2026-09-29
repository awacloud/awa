// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Centralised low-level security primitives - URL scheme
 * allow/deny lists, DOM-clobbering name lists, dangerous CSS values, blocked
 * tags, event-handler attribute detection.
 *
 * **Pure data + pure functions.** No DOM, no state. Same instance answers
 * any number of consumers without contention.
 *
 * **Why this module exists.** Before secPolicy, the URL safety check
 * (`_isSafeUrl`), the URL-bearing attribute list, the DOM-clobber names, and
 * the `on*` event regex were duplicated across `template.js` (DOM render
 * path), `render.js` (SSR path, with `_SSR` suffixes), and re-implemented
 * partially in `sanitize.js`. CSS safety lived only in `dom.js`. A change to
 * the policy (e.g. adding `intent:` to dangerous schemes) required edits in
 * 3-4 places, easy to miss one. secPolicy is the single source of truth.
 *
 * **Scope of "security policy".** Defence in depth for:
 *   - URL values in URL-bearing attributes (`href`, `src`, `srcset`, …)
 *   - DOM clobbering : `id`/`name` values masking `document.*` properties
 *   - Event-handler attributes (`on*`) - always rejected
 *   - Attribute names that don't start with a letter - always rejected
 *   - HTML tags considered structurally dangerous (`<script>`, `<iframe>`, …)
 *   - CSS property names (`behavior`) and values (`expression()`,
 *     `url(javascript:)`) considered dangerous
 *
 * **NOT in scope.** This module is the floor of the framework's security
 * policy ; it is not an HTML sanitizer. For user-supplied HTML, use the
 * `sanitize` module (which depends on secPolicy for its URL / event checks
 * and adds its own tag/attr allowlist on top).
 *
 */

/**
 * Public surface returned by `secPolicy.factory()`: the centralised security
 * policy data (sets / regexes) plus the pure predicate functions that consume
 * them. No DOM, no state.
 *
 * @typedef {Object} SecPolicyAPI
 * @property {Set<string>} URL_ATTRS               - Attribute names carrying URL values.
 * @property {RegExp}      SCHEME_DANGEROUS_RE      - Categorically dangerous URL schemes.
 * @property {Set<string>} SAFE_SCHEMES             - Default safe URL schemes.
 * @property {RegExp}      DATA_IMAGE_RE            - Accepted `data:image/*` MIME types.
 * @property {(url: string, schemes?: string[]|Set<string>, allowDataImage?: boolean) => boolean} isSafeUrl - URL safety predicate.
 * @property {Set<string>} CLOBBER_ATTRS            - Attributes (`id`/`name`) vulnerable to DOM clobbering.
 * @property {Set<string>} CLOBBER_NAMES            - Values that would clobber `document.*` properties.
 * @property {(attrName: string, value: *) => boolean} isClobberValue - DOM-clobbering (attr, value) pair test.
 * @property {RegExp}      EVENT_ATTR_RE            - Matches `on*` event-handler attribute names.
 * @property {RegExp}      SAFE_ATTR_NAME_RE        - Acceptable attribute-name shape (starts with a letter).
 * @property {(name: string) => boolean} isEventAttr   - True when the name is an `on*` handler.
 * @property {(name: string) => boolean} isSafeAttrName - True when the attribute name is syntactically acceptable.
 * @property {RegExp}      BLOCKED_TAGS_RE          - Structurally rejected tags (`script`, `object`, `embed`, `iframe`).
 * @property {(tagName: string) => boolean} isBlockedTag - True when the tag name is blocked.
 * @property {RegExp}      CSS_DANGEROUS_RE         - Dangerous CSS value patterns.
 * @property {Set<string>} CSS_BLOCKED_PROPS        - CSS property names dangerous by name alone.
 * @property {(prop: string, val: *) => boolean} isSafeCss - CSS `setProperty(prop, val)` safety predicate.
 */

export const secPolicy = {
    name: 'secPolicy',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: [],

    /** @returns {SecPolicyAPI} */
    factory() {

        // ── URL safety ──────────────────────────────────────────────────────

        /**
         * Attribute names that carry URL values ; their content is validated
         * against {@link isSafeUrl} before being set or serialised.
         */
        const URL_ATTRS = new Set([
            'href', 'src', 'action', 'formaction',
            'srcset', 'xlink:href', 'data', 'codebase',
        ]);

        /**
         * Categorically dangerous URL schemes ; matched by {@link isSafeUrl}
         * to reject the URL outright before any allowlist check.
         */
        const SCHEME_DANGEROUS_RE = /^(javascript|vbscript|file|jar|data:text|data:application)/;

        /**
         * Default safe URL schemes (besides relative / anchor paths) used by
         * {@link isSafeUrl} when no explicit override is passed.
         */
        const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

        /**
         * Accepted `data:image/*` MIME types ; consulted by {@link isSafeUrl}
         * when `allowDataImage` is true.
         */
        const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico|avif|apng);/;

        /**
         * Decide whether `url` may be safely set on a URL-bearing attribute.
         *
         * Logic (in order) :
         *   1. Non-string → unsafe.
         *   2. Empty (after stripping control chars) → safe (means "remove").
         *   3. Starts with `#` / `/` / `?` / `.` → safe (anchor / relative).
         *   4. Matches {@link SCHEME_DANGEROUS_RE} → unsafe.
         *   5. `data:` → safe **only** when `allowDataImage` AND it matches
         *      {@link DATA_IMAGE_RE}.
         *   6. No colon → safe (relative URL).
         *   7. Colon appears AFTER a slash → safe (path containing `:`).
         *   8. Scheme prefix is in `schemes` (or default {@link SAFE_SCHEMES}).
         *
         * Whitespace and ASCII control characters are stripped before checks,
         * matching browser parsing of `JAVA\tSCRIPT:`-style obfuscation.
         *
         * @param {string}   url
         * @param {string[] | Set<string>} [schemes] - Override of {@link SAFE_SCHEMES}. Both `.includes()` (Array) and `.has()` (Set) are accepted.
         * @param {boolean}  [allowDataImage] - Permit `data:image/*` URLs.
         *   Default `true` here (template/render path always accepts images) ;
         *   the sanitize module overrides to `false` by default.
         * @returns {boolean}
         */
        function isSafeUrl(url, schemes, allowDataImage) {
            if (typeof url !== 'string') return false;
            const trimmed = url.replace(/[\x00-\x20\x7f]+/g, '').toLowerCase();
            if (trimmed === '') return true;
            if (trimmed[0] === '#' || trimmed[0] === '/'
                || trimmed[0] === '?' || trimmed[0] === '.') return true;
            if (SCHEME_DANGEROUS_RE.test(trimmed)) return false;
            if (trimmed.startsWith('data:')) {
                const allowImg = allowDataImage !== false;   // default: true ; only explicit `false` rejects data:image
                if (!allowImg) return false;
                return DATA_IMAGE_RE.test(trimmed);
            }
            const colon = trimmed.indexOf(':');
            if (colon === -1) return true;
            const slash = trimmed.indexOf('/');
            if (slash !== -1 && slash < colon) return true;
            const allowed = Array.isArray(schemes) ? schemes : SAFE_SCHEMES;
            const scheme  = trimmed.slice(0, colon);
            return allowed instanceof Set ? allowed.has(scheme) : allowed.includes(scheme);
        }

        // ── DOM clobbering ──────────────────────────────────────────────────

        /**
         * Attributes whose value can cause DOM clobbering when crafted ;
         * paired with {@link CLOBBER_NAMES} by {@link isClobberValue}.
         */
        const CLOBBER_ATTRS = new Set(['id', 'name']);

        /**
         * Values that, set on `id` or `name`, would shadow built-in document /
         * window properties when a script reads them ; consulted by
         * {@link isClobberValue}. Source : OWASP DOM Clobbering wiki +
         * observed exploit surfaces.
         */
        const CLOBBER_NAMES = new Set([
            // Common document properties
            'cookie', 'cookies', 'domain', 'location', 'write', 'writeln',
            'open', 'close', 'body', 'head', 'title', 'URL', 'referrer',
            'documentElement', 'documentURI', 'currentScript', 'designMode',
            'forms', 'images', 'links', 'scripts', 'styleSheets', 'all',
            'embeds', 'plugins', 'anchors', 'applets',
            // Window-ish (some browsers expose document.X for these)
            'parent', 'top', 'self', 'frames', 'frameElement', 'opener',
            // Form-related collisions
            'elements', 'submit', 'reset', 'method', 'action',
        ]);

        /**
         * Quick test : is the (attribute, value) pair a known DOM-clobbering
         * vector ? Returns true when the attribute is `id`/`name` AND the
         * value matches a known clobbering name.
         */
        function isClobberValue(attrName, value) {
            return CLOBBER_ATTRS.has(attrName) && CLOBBER_NAMES.has(String(value));
        }

        // ── Attribute name shape ────────────────────────────────────────────

        /**
         * Matches `on*` event-handler attribute names (case-insensitive) ;
         * used by {@link isEventAttr} and {@link isSafeAttrName} to reject
         * inline-handler injection.
         */
        const EVENT_ATTR_RE = /^on/i;

        /**
         * Acceptable shape for any attribute name (must start with a letter) ;
         * enforced by {@link isSafeAttrName}.
         */
        const SAFE_ATTR_NAME_RE = /^[a-zA-Z]/;

        /** True when the attribute name is an `on*` event handler. */
        function isEventAttr(name) {
            return typeof name === 'string' && EVENT_ATTR_RE.test(name);
        }

        /** True when the attribute name is syntactically acceptable. */
        function isSafeAttrName(name) {
            return typeof name === 'string' && SAFE_ATTR_NAME_RE.test(name) && !EVENT_ATTR_RE.test(name);
        }

        // ── Blocked tags ────────────────────────────────────────────────────

        /**
         * Tags structurally rejected at parse-time and tested by
         * {@link isBlockedTag} : `<script>` for obvious reasons ; `<object>`,
         * `<embed>`, `<iframe>` for embedding-based exfiltration vectors. The
         * sanitize module's wider tag allowlist is built on top of (and
         * supersedes) this minimal set.
         */
        const BLOCKED_TAGS_RE = /^(script|object|embed|iframe)$/;

        /** True when `tagName` (lowercased) is in {@link BLOCKED_TAGS_RE}. */
        function isBlockedTag(tagName) {
            return typeof tagName === 'string' && BLOCKED_TAGS_RE.test(tagName);
        }

        // ── CSS safety ──────────────────────────────────────────────────────

        /**
         * Dangerous CSS value patterns :
         *   - `expression(...)` (IE-only, deprecated but still parsed by old
         *     engines and some tooling).
         *   - `url(javascript:…)` / `url(vbscript:…)` / `url(data:text/…)` -
         *     value-side XSS vectors used in `background`, `cursor`,
         *     `list-style-image`, etc.
         *
         * Detection runs after whitespace + control-char stripping +
         * lower-casing, neutralising obfuscation like `JAVA\tSCRIPT:`,
         * `expre\nssion`, etc. Consumed by {@link isSafeCss}.
         */
        const CSS_DANGEROUS_RE = /expression\(|url\(['"]?(?:javascript|vbscript|data:text|data:application)/;

        /**
         * CSS properties whose **name itself** is dangerous, regardless of
         * value (IE HTC `behavior`) ; rejected by {@link isSafeCss}.
         */
        const CSS_BLOCKED_PROPS = new Set(['behavior', '-ms-behavior']);

        /**
         * Decide whether a `style.setProperty(prop, val)` call is safe.
         * Returns `false` when the property is blocklisted OR when the value
         * matches {@link CSS_DANGEROUS_RE} (after normalisation).
         */
        function isSafeCss(prop, val) {
            if (typeof prop === 'string' && CSS_BLOCKED_PROPS.has(prop.toLowerCase())) return false;
            if (val == null) return true;
            const collapsed = String(val).replace(/[\x00-\x20\x7f]+/g, '').toLowerCase();
            return !CSS_DANGEROUS_RE.test(collapsed);
        }

        return {
            // URL
            URL_ATTRS,
            SCHEME_DANGEROUS_RE,
            SAFE_SCHEMES,
            DATA_IMAGE_RE,
            isSafeUrl,
            // Clobber
            CLOBBER_ATTRS,
            CLOBBER_NAMES,
            isClobberValue,
            // Attr name
            EVENT_ATTR_RE,
            SAFE_ATTR_NAME_RE,
            isEventAttr,
            isSafeAttrName,
            // Tags
            BLOCKED_TAGS_RE,
            isBlockedTag,
            // CSS
            CSS_DANGEROUS_RE,
            CSS_BLOCKED_PROPS,
            isSafeCss,
        };
    },
};
