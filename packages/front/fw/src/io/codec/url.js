// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Querystring and URL parsing/serialization. Complement to the native
 * `URL` / `URLSearchParams`, which handle neither structured arrays
 * (`?a[]=1&a[]=2`), nor nested objects (`?user[name]=Alice`), nor
 * alternative array formats (`comma`, `indices`).
 *
 * API:
 *   - `parseQuery(str, options)` → object (string, array, or nested values)
 *   - `stringifyQuery(obj, options)` → string (no leading `?`)
 *   - `parseURL(str)` → `{ protocol, host, hostname, port, pathname, search,
 *     query, hash, username, password, origin, href }`
 *   - `buildURL(parts)` → string
 *
 * @example
 * const url = registry.resolve('url');
 *
 * url.parseQuery('a=1&b=2');
 * // { a: '1', b: '2' }
 *
 * url.parseQuery('tags[]=js&tags[]=web', { arrayFormat: 'brackets' });
 * // { tags: ['js', 'web'] }
 *
 * url.stringifyQuery({ q: 'hello world', page: 2 });
 * // 'q=hello%20world&page=2'
 *
 * url.parseURL('https://u:p@example.com:8080/a/b?x=1#top');
 * // { protocol: 'https:', hostname: 'example.com', port: '8080', pathname: '/a/b', ... }
 */
/**
 * @typedef {object} ParsedURL
 * @property {string} protocol
 * @property {string} username
 * @property {string} password
 * @property {string} hostname
 * @property {string} port
 * @property {string} host
 * @property {string} pathname
 * @property {string} search
 * @property {string} hash
 * @property {string} origin
 * @property {string} href
 * @property {Object} query
 */
/**
 * @typedef {object} UrlAPI
 * @property {(str: string, options?: { arrayFormat?: 'repeat' | 'brackets' | 'indices' | 'comma' | 'none', nested?: boolean, space?: 'plus' | 'percent', delimiter?: string }) => Object} parseQuery
 * @property {(obj: Object, options?: { arrayFormat?: 'repeat' | 'brackets' | 'indices' | 'comma', nested?: boolean, space?: 'plus' | 'percent', delimiter?: string, skipNull?: boolean, sort?: boolean }) => string} stringifyQuery
 * @property {(str: string, base?: string) => ParsedURL} parseURL
 * @property {(parts: Object) => string} buildURL
 * @property {(s: string, options?: { safe?: string }) => string} encodeSafe
 * @property {(s: string) => string} decodeSafe
 */
export const url = {
    name: 'url',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /**
     * @returns {UrlAPI}
     */
    factory() {

        // ---------- encoding helpers ----------

        // application/x-www-form-urlencoded uses '+' for spaces (HTML forms).
        // Generic query uses %20. The `space: 'plus' | 'percent'` flag selects.
        function encodeComponent(s, space) {
            const out = encodeURIComponent(String(s));
            return space === 'plus' ? out.replace(/%20/g, '+') : out;
        }
        function decodeComponent(s, space) {
            try {
                if (space === 'plus') s = s.replace(/\+/g, ' ');
                return decodeURIComponent(s);
            } catch { return s; }
        }

        // ---------- nested key paths ----------

        // "a[b][c]" → ['a', 'b', 'c'] ; "a[]" → ['a', ''] ; "a[0]" → ['a', '0']
        function splitPath(key) {
            // Fast path - no brackets.
            if (key.indexOf('[') < 0) return [key];
            const path = [];
            const firstIdx = key.indexOf('[');
            path.push(key.slice(0, firstIdx));
            let i = firstIdx;
            const len = key.length;
            while (i < len && key[i] === '[') {
                const end = key.indexOf(']', i);
                if (end < 0) { // malformed - treat the remainder as a literal segment
                    path.push(key.slice(i));
                    return path;
                }
                path.push(key.slice(i + 1, end));
                i = end + 1;
            }
            return path;
        }

        function setAtPath(obj, path, value) {
            let cur = obj;
            for (let i = 0; i < path.length; i++) {
                const seg = path[i];
                const last = i === path.length - 1;
                if (seg === '') {
                    // a[] → push onto array
                    if (!Array.isArray(cur)) {
                        // Shouldn't normally happen (root never '').
                        return;
                    }
                    if (last) cur.push(value);
                    else {
                        const next = {};
                        cur.push(next);
                        cur = next;
                    }
                    continue;
                }
                if (last) {
                    if (Array.isArray(cur)) {
                        // Numeric index.
                        const idx = /^\d+$/.test(seg) ? parseInt(seg, 10) : null;
                        if (idx !== null) cur[idx] = value;
                        else { /* string key on array: ignore */ }
                    } else {
                        if (seg in cur) {
                            const existing = cur[seg];
                            if (Array.isArray(existing)) existing.push(value);
                            else cur[seg] = [existing, value];
                        } else {
                            cur[seg] = value;
                        }
                    }
                } else {
                    // Determine whether the next segment denotes an array.
                    const nextSeg = path[i + 1];
                    const nextIsArray = nextSeg === '' || /^\d+$/.test(nextSeg);
                    if (Array.isArray(cur)) {
                        const idx = /^\d+$/.test(seg) ? parseInt(seg, 10) : cur.length;
                        if (!cur[idx]) cur[idx] = nextIsArray ? [] : {};
                        cur = cur[idx];
                    } else {
                        if (!(seg in cur)) cur[seg] = nextIsArray ? [] : {};
                        cur = cur[seg];
                    }
                }
            }
        }

        // ---------- parseQuery ----------

        /**
         * Parse a querystring into an object.
         *
         * @param {string} str Query (with or without leading '?').
         * @param {Object} [options]
         * @param {'repeat'|'brackets'|'indices'|'comma'|'none'} [options.arrayFormat='repeat']
         *   - `'repeat'` : `a=1&a=2` → `{a:['1','2']}`
         *   - `'brackets'` : `a[]=1&a[]=2` → `{a:['1','2']}`
         *   - `'indices'` : `a[0]=1&a[1]=2` → `{a:['1','2']}`
         *   - `'comma'` : `a=1,2` → `{a:['1','2']}`
         *   - `'none'` : duplicate keys → last value wins.
         * @param {boolean} [options.nested=false] Treat `a[b]=1` → `{a:{b:'1'}}`.
         * @param {'plus'|'percent'} [options.space='percent'] `+` = space (forms) or literal.
         * @param {string} [options.delimiter='&'] Pair separator.
         * @returns {Object}
         */
        function parseQuery(str, options) {
            options = options || {};
            const arrayFormat = options.arrayFormat || 'repeat';
            const nested = !!options.nested;
            const space = options.space || 'percent';
            const delimiter = options.delimiter || '&';

            const out = {};
            if (!str) return out;
            if (str[0] === '?' || str[0] === '#') str = str.slice(1);
            if (!str) return out;

            const pairs = str.split(delimiter);
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                if (pair === '') continue;
                const eqIdx = pair.indexOf('=');
                let rawKey, rawVal;
                if (eqIdx < 0) { rawKey = pair; rawVal = ''; }
                else { rawKey = pair.slice(0, eqIdx); rawVal = pair.slice(eqIdx + 1); }
                const key = decodeComponent(rawKey, space);
                let value = decodeComponent(rawVal, space);

                if (arrayFormat === 'comma' && value.indexOf(',') >= 0) {
                    value = value.split(',');
                }

                if (nested || arrayFormat === 'brackets' || arrayFormat === 'indices') {
                    const path = splitPath(key);
                    if (path.length > 1) {
                        if (Array.isArray(value)) {
                            for (let j = 0; j < value.length; j++) setAtPath(out, path, value[j]);
                        } else {
                            setAtPath(out, path, value);
                        }
                        continue;
                    }
                }

                // simple key
                if (arrayFormat === 'none') {
                    out[key] = Array.isArray(value) ? value[value.length - 1] : value;
                } else {
                    if (key in out) {
                        const existing = out[key];
                        if (Array.isArray(existing)) {
                            if (Array.isArray(value)) for (const v of value) existing.push(v);
                            else existing.push(value);
                        } else {
                            out[key] = Array.isArray(value) ? [existing, ...value] : [existing, value];
                        }
                    } else {
                        out[key] = value;
                    }
                }
            }
            return out;
        }

        // ---------- stringifyQuery ----------

        function pushPair(pairs, key, val, space) {
            if (val === undefined) return;
            if (val === null) { pairs.push(encodeComponent(key, space) + '='); return; }
            pairs.push(encodeComponent(key, space) + '=' + encodeComponent(val, space));
        }

        /**
         * Serialize an object into a querystring.
         *
         * Interaction notes:
         * - `skipNull` drops top-level entries where the value itself is
         *   `null`/`undefined`, and also drops `null`/`undefined` elements
         *   inside arrays for the `repeat`, `brackets`, and `indices` formats.
         * - **`arrayFormat: 'comma'` is an exception**: because a comma-joined
         *   list cannot represent "missing slot" without an empty token, nulls
         *   inside the array are always rendered as empty strings (the joined
         *   form is `a=1,,2`), regardless of `skipNull`. If you need
         *   `skipNull` to strip nulls *inside* arrays, pre-filter the array or
         *   choose another `arrayFormat`.
         * - Empty arrays produce no entry at all (cannot be expressed in any format).
         *
         * @param {Object} obj
         * @param {Object} [options]
         * @param {'repeat'|'brackets'|'indices'|'comma'} [options.arrayFormat='repeat']
         * @param {boolean} [options.nested=false]
         * @param {'plus'|'percent'} [options.space='percent']
         * @param {string} [options.delimiter='&']
         * @param {boolean} [options.skipNull=false] Omit `null`/`undefined` entries entirely (see interaction with `comma` mode above).
         * @param {boolean} [options.sort=false] Sort keys lexicographically (stable).
         * @returns {string}
         */
        function stringifyQuery(obj, options) {
            options = options || {};
            const arrayFormat = options.arrayFormat || 'repeat';
            const nested = !!options.nested;
            const space = options.space || 'percent';
            const delimiter = options.delimiter || '&';
            const skipNull = !!options.skipNull;
            if (!obj || typeof obj !== 'object') return '';

            const pairs = [];

            const emit = (keyExpr, val) => {
                if (val === undefined && skipNull) return;
                if (val === null && skipNull) return;
                if (Array.isArray(val)) {
                    if (val.length === 0) return;
                    switch (arrayFormat) {
                        case 'brackets':
                            for (const v of val) emit(keyExpr + '[]', v);
                            return;
                        case 'indices':
                            for (let i = 0; i < val.length; i++) emit(keyExpr + '[' + i + ']', val[i]);
                            return;
                        case 'comma':
                            pairs.push(encodeComponent(keyExpr, space) + '=' +
                                val.map(v => encodeComponent(v == null ? '' : v, space)).join(','));
                            return;
                        case 'repeat':
                        default:
                            for (const v of val) pushPair(pairs, keyExpr, v, space);
                            return;
                    }
                }
                if (nested && val && typeof val === 'object' && !(val instanceof Date)) {
                    for (const k of Object.keys(val)) emit(keyExpr + '[' + k + ']', val[k]);
                    return;
                }
                // primitive / Date
                if (val instanceof Date) val = val.toISOString();
                pushPair(pairs, keyExpr, val, space);
            };

            const keys = options.sort ? Object.keys(obj).sort() : Object.keys(obj);
            for (const k of keys) emit(k, obj[k]);
            return pairs.join(delimiter);
        }

        // ---------- parseURL / buildURL ----------

        /**
         * Parse a URL into a plain object (mirror of the native fields +
         * decomposed query).
         *
         * Uses native `URL` when available, falls back to a manual regex.
         *
         * @param {string} str
         * @param {string} [base] Optional base URL (passed to `URL`).
         * @returns {{
         *   protocol: string, hostname: string, port: string, host: string,
         *   pathname: string, search: string, hash: string, username: string,
         *   password: string, origin: string, href: string, query: Object
         * }}
         */
        function parseURL(str, base) {
            if (typeof URL === 'function') {
                const u = base ? new URL(str, base) : new URL(str);
                return {
                    protocol: u.protocol,
                    username: u.username,
                    password: u.password,
                    hostname: u.hostname,
                    port: u.port,
                    host: u.host,
                    pathname: u.pathname,
                    search: u.search,
                    hash: u.hash,
                    origin: u.origin,
                    href: u.href,
                    query: parseQuery(u.search)
                };
            }
            // Minimal fallback.
            const m = /^(?:([a-z][a-z0-9+\-.]*:))?(?:\/\/((?:([^:@/]*)(?::([^@/]*))?@)?([^:/?#]*)(?::(\d+))?))?([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(str);
            if (!m) throw new Error('url: cannot parse');
            const protocol = m[1] || '';
            const username = m[3] || '';
            const password = m[4] || '';
            const hostname = m[5] || '';
            const port = m[6] || '';
            const pathname = m[7] || '';
            const search = m[8] || '';
            const hash = m[9] || '';
            const host = hostname + (port ? ':' + port : '');
            const origin = protocol && hostname ? protocol + '//' + host : '';
            return {
                protocol, username, password, hostname, port, host,
                pathname, search, hash, origin,
                href: str,
                query: parseQuery(search)
            };
        }

        /**
         * Build a URL from parts. Recognized fields:
         * `protocol`, `hostname` (or `host`), `port`, `pathname`, `query`
         * (object or string), `hash`, `username`, `password`.
         *
         * @param {Object} parts
         * @returns {string}
         */
        function buildURL(parts) {
            if (!parts) return '';
            let out = '';
            if (parts.protocol) {
                out += parts.protocol;
                if (!out.endsWith(':')) out += ':';
                out += '//';
            }
            if (parts.username) {
                out += encodeURIComponent(parts.username);
                if (parts.password) out += ':' + encodeURIComponent(parts.password);
                out += '@';
            }
            if (parts.host) {
                out += parts.host;
            } else if (parts.hostname) {
                out += parts.hostname;
                if (parts.port) out += ':' + parts.port;
            }
            if (parts.pathname) {
                out += parts.pathname.startsWith('/') || !parts.hostname ? parts.pathname : '/' + parts.pathname;
            }
            if (parts.query !== undefined && parts.query !== null && parts.query !== '') {
                const qs = typeof parts.query === 'string' ? parts.query : stringifyQuery(parts.query);
                if (qs) out += '?' + qs;
            } else if (parts.search) {
                out += parts.search.startsWith('?') ? parts.search : '?' + parts.search;
            }
            if (parts.hash) {
                out += parts.hash.startsWith('#') ? parts.hash : '#' + parts.hash;
            }
            return out;
        }

        // ---------- encodeSafe / decodeSafe ----------

        /**
         * Default safe-set : ASCII alphanumerics + CommonMark punctuation.
         * Mirrors mdurl@2 `DEFAULT_CHARS`.
         *
         * @type {string}
         */
        const DEFAULT_SAFE = ";/?:@&=+$,-_.!~*'()#";

        /**
         * Build a per-safe-set lookup table (code 0..127 → literal | '%HH').
         * Alphanumerics always pass through.
         *
         * @param {string} safe
         * @returns {string[]}
         */
        function buildTable(safe) {
            const t = new Array(128);
            for (let i = 0; i < 128; i++) {
                const ch = String.fromCharCode(i);
                if (/[0-9A-Za-z]/.test(ch)) {
                    t[i] = ch;
                } else {
                    t[i] = '%' + ('0' + i.toString(16).toUpperCase()).slice(-2);
                }
            }
            for (let i = 0; i < safe.length; i++) {
                t[safe.charCodeAt(i)] = safe[i];
            }
            return t;
        }

        /** Cached table for the default safe set. */
        const DEFAULT_TABLE = buildTable(DEFAULT_SAFE);

        /** Matches exactly two hex digits after a `%`. */
        const RE_HEX2 = /^[0-9a-fA-F]{2}$/;

        /**
         * Percent-encode a URI string using the CommonMark / `mdurl@2` algorithm.
         *
         * - ASCII alphanumerics and chars in `options.safe` (default:
         *   `";/?:@&=+$,-_.!~*'()#"`) pass through verbatim.
         * - Existing valid `%HH` sequences pass through (no double-encoding).
         * - Invalid `%` sequences (e.g. `%G1`) are re-encoded to `%25G1`.
         * - Non-ASCII codepoints are UTF-8-percent-encoded.
         * - Lone surrogates are replaced by `%EF%BF%BD` (U+FFFD encoded as UTF-8).
         *
         * @param {string} s URI string to encode.
         * @param {{ safe?: string }} [options] - options.safe: custom safe-set of ASCII chars to keep verbatim.
         * @returns {string}
         */
        function encodeSafe(s, options) {
            if (!s) return s === '' ? '' : String(s);
            const table = (options && options.safe !== undefined)
                ? buildTable(options.safe)
                : DEFAULT_TABLE;

            let out = '';
            const len = s.length;
            for (let i = 0; i < len; i++) {
                const code = s.charCodeAt(i);

                // Pass-through already-valid %HH triplets.
                if (code === 0x25 /* % */ && i + 2 < len) {
                    if (RE_HEX2.test(s.slice(i + 1, i + 3))) {
                        out += s.slice(i, i + 3);
                        i += 2;
                        continue;
                    }
                }

                if (code < 128) {
                    out += table[code];
                    continue;
                }

                // Surrogate handling.
                if (code >= 0xD800 && code <= 0xDFFF) {
                    if (code <= 0xDBFF && i + 1 < len) {
                        const next = s.charCodeAt(i + 1);
                        if (next >= 0xDC00 && next <= 0xDFFF) {
                            out += encodeURIComponent(s[i] + s[i + 1]);
                            i++;
                            continue;
                        }
                    }
                    // Lone surrogate → U+FFFD encoded as UTF-8.
                    out += '%EF%BF%BD';
                    continue;
                }

                out += encodeURIComponent(s[i]);
            }
            return out;
        }

        /**
         * Best-effort percent-decoder - symmetric complement to `encodeSafe`.
         *
         * Decodes valid `%HH` sequences (including multi-byte UTF-8 chains).
         * Invalid sequences are left intact (fail-soft, same behaviour as
         * `decodeComponent`).
         *
         * @param {string} s String to decode.
         * @returns {string}
         */
        function decodeSafe(s) {
            if (!s) return s === '' ? '' : String(s);
            try {
                return decodeURIComponent(s);
            } catch {
                return s;
            }
        }

        return { parseQuery, stringifyQuery, parseURL, buildURL, encodeSafe, decodeSafe };
    }
};
