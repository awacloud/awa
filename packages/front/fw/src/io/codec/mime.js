// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * MIME helpers for HTTP web context - structured header parsing and
 * `multipart/*` encode/decode (form-data, mixed, byteranges).
 *
 * Depends on `random` (CSPRNG) for boundary generation: even though
 * multipart framing only requires intra-message uniqueness, using a
 * crypto-strong source eliminates any risk of collision with
 * attacker-controlled payloads (boundary-splitting variant).
 *
 *   - header value ↔ `{ value, params }` (RFC 7231 §3.1.1, quoted-string,
 *     RFC 5987 extended param `name*=UTF-8''...`)
 *   - header block (CRLF-separated) ↔ object
 *   - multipart body (bytes) ↔ list of parts `{ headers, body }`
 *
 * Main use cases: `multipart/form-data` (upload), `multipart/mixed`
 * (multi-resource HTTP response), extraction of `Content-Disposition`,
 * `Content-Type`, etc.
 *
 * @example
 * const mime = registry.resolve('mime');
 *
 * mime.parseHeader('multipart/form-data; boundary=abc');
 * // { value: 'multipart/form-data', params: { boundary: 'abc' } }
 *
 * const { body, contentType } = mime.encode([
 *   { headers: { 'Content-Disposition': 'form-data; name="file"; filename="a.txt"',
 *                'Content-Type': 'text/plain' },
 *     body: new TextEncoder().encode('hello') }
 * ]);
 *
 * mime.decode(body, mime.parseHeader(contentType).params.boundary);
 * // [{ headers: {...}, body: Uint8Array }]
 */
import { utf8 } from './utf8.js';
import { random } from '../../crypto/utils/random.js';

/**
 * @typedef {object} MimePart
 * @property {Object<string,string>} headers
 * @property {Uint8Array} body
 */
/**
 * @typedef {object} MimeAPI
 * @property {(s: string) => { value: string, params: Object<string,string> }} parseHeader
 * @property {(value: string | { value: string, params?: Object }, params?: Object) => string} formatHeader
 * @property {(text: string) => Object<string,string>} parseHeaders
 * @property {(headers: Object<string,string>) => string} formatHeaders
 * @property {(parts: Array<{ headers?: Object, body: Uint8Array | string }>, options?: { boundary?: string, type?: string }) => { body: Uint8Array, boundary: string, contentType: string }} encode
 * @property {(bytes: Uint8Array, boundary: string) => MimePart[]} decode
 * @property {() => string} randomBoundary
 */
export const mime = {
    name: 'mime',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: ['utf8', 'random'],
    deps: [utf8, random],

    /**
     * @param {Object} utf8 UTF-8 codec.
     * @param {Object} random CSPRNG (provides `bytes(n)`).
     * @returns {MimeAPI}
     */
    factory(utf8, random) {

        // ---------- low-level bytes search ----------

        // Find first index of needle (Uint8Array) in haystack starting at `from`.
        function indexOfBytes(hay, needle, from) {
            const nLen = needle.length;
            const hLen = hay.length;
            if (nLen === 0) return from;
            const last = hLen - nLen;
            outer: for (let i = from; i <= last; i++) {
                for (let j = 0; j < nLen; j++) {
                    if (hay[i + j] !== needle[j]) continue outer;
                }
                return i;
            }
            return -1;
        }

        function concatBytes(chunks) {
            let total = 0;
            for (let i = 0; i < chunks.length; i++) total += chunks[i].length;
            const out = new Uint8Array(total);
            let o = 0;
            for (let i = 0; i < chunks.length; i++) {
                out.set(chunks[i], o);
                o += chunks[i].length;
            }
            return out;
        }

        // ---------- header value parsing (RFC 7231 §3.1.1) ----------

        // RFC 5987: decode "UTF-8''foo%20bar" → "foo bar"
        function decodeExtValue(s) {
            // Format: charset "'" [language] "'" value-chars
            const m = /^([^']*)'[^']*'(.*)$/.exec(s);
            if (!m) return s;
            const charset = m[1].toLowerCase();
            const raw = m[2];
            try {
                // decodeURIComponent handles UTF-8; fall back for ISO-8859-1.
                if (charset === 'utf-8' || charset === '') return decodeURIComponent(raw);
                // ISO-8859-1: no conversion needed (each byte = one code unit).
                return raw.replace(/%([0-9a-fA-F]{2})/g,
                    (_, h) => String.fromCharCode(parseInt(h, 16)));
            } catch { return raw; }
        }

        /**
         * Parse a structured header value (RFC 7231 §3.1.1):
         * `value; p1=v1; p2="v 2"; p3*=UTF-8''encoded`.
         *
         * @param {string} s
         * @returns {{value: string, params: Object<string,string>}}
         */
        function parseHeader(s) {
            if (typeof s !== 'string') return { value: '', params: {} };
            const params = {};
            const extParams = {};
            let i = 0;
            const len = s.length;
            const readToken = (stopChars) => {
                let out = '';
                while (i < len && stopChars.indexOf(s[i]) < 0) {
                    out += s[i]; i++;
                }
                return out;
            };
            const skipWs = () => { while (i < len && (s[i] === ' ' || s[i] === '\t')) i++; };
            const readQuoted = () => {
                // s[i] === '"'
                i++;
                let out = '';
                while (i < len) {
                    const c = s[i];
                    if (c === '\\' && i + 1 < len) { out += s[i + 1]; i += 2; continue; }
                    if (c === '"') { i++; return out; }
                    out += c; i++;
                }
                return out;
            };

            skipWs();
            const value = readToken(';').trim();
            while (i < len) {
                if (s[i] !== ';') { i++; continue; }
                i++; // consume ';'
                skipWs();
                const name = readToken('=;').trim().toLowerCase();
                if (!name) continue;
                let paramValue;
                if (s[i] === '=') {
                    i++;
                    skipWs();
                    if (s[i] === '"') paramValue = readQuoted();
                    else paramValue = readToken(';').trim();
                } else {
                    paramValue = '';
                }
                if (name.endsWith('*')) {
                    extParams[name.slice(0, -1)] = decodeExtValue(paramValue);
                } else if (!(name in params)) {
                    params[name] = paramValue;
                }
            }
            // RFC 5987: *-form takes precedence over the simple form when both exist.
            for (const k of Object.keys(extParams)) params[k] = extParams[k];
            // @ts-ignore - {} accumulates string values at runtime; TS requires typed declaration
            return { value, params };
        }

        // Token chars per RFC 7230 §3.2.6 - must be quoted if absent.
        const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

        /**
         * Serialize `{ value, params }` or `(value, params)` to a header value.
         *
         * @param {string|{value:string,params?:Object}} value
         * @param {Object} [params]
         * @returns {string}
         */
        function formatHeader(value, params) {
            if (value && typeof value === 'object') { params = value.params; value = value.value; }
            let out = String(value || '');
            if (params) {
                for (const k of Object.keys(params)) {
                    const v = params[k];
                    if (v === undefined || v === null) continue;
                    const sv = String(v);
                    out += '; ' + k + '=' + (TOKEN_RE.test(sv)
                        ? sv
                        : '"' + sv.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
                }
            }
            return out;
        }

        // ---------- header block parsing ----------

        /**
         * Parse a text header block (CRLF- or LF-separated). Names are
         * lowercased. Multi-line values (obsolete line-folding,
         * RFC 7230 §3.2.4) are joined with a single space.
         *
         * @param {string} text
         * @returns {Object<string,string>}
         */
        function parseHeaders(text) {
            const headers = {};
            // @ts-ignore - {} accumulates string values at runtime; TS requires typed declaration
            if (!text) return headers;
            // Normalize line endings.
            const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            let currentName = null;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === '') continue;
                if ((line[0] === ' ' || line[0] === '\t') && currentName) {
                    headers[currentName] += ' ' + line.trim();
                    continue;
                }
                const idx = line.indexOf(':');
                if (idx < 0) continue;
                const name = line.slice(0, idx).trim().toLowerCase();
                const val = line.slice(idx + 1).trim();
                // Multiple occurrences → join with ", " (RFC 7230 §3.2.2).
                if (name in headers) headers[name] += ', ' + val;
                else headers[name] = val;
                currentName = name;
            }
            // @ts-ignore - {} accumulates string values at runtime; TS requires typed declaration
            return headers;
        }

        /**
         * Serialize a headers object into a text block (`Name: value\r\n`).
         * Names are emitted in simple Title-Case.
         *
         * @param {Object<string,string>} headers
         * @returns {string}
         */
        function formatHeaders(headers) {
            if (!headers) return '';
            let out = '';
            for (const k of Object.keys(headers)) {
                const name = k.replace(/(^|-)([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
                out += name + ': ' + headers[k] + '\r\n';
            }
            return out;
        }

        // ---------- multipart decode ----------

        // CRLF bytes
        const CRLF = new Uint8Array([0x0d, 0x0a]);

        /**
         * Decode a `multipart/*` body into a list of parts.
         *
         * @param {Uint8Array} bytes Raw body.
         * @param {string} boundary Boundary without the leading dashes.
         * @returns {Array<{headers: Object<string,string>, body: Uint8Array}>}
         * @throws {Error} If the body is malformed (initial boundary absent).
         */
        function decode(bytes, boundary) {
            if (!(bytes instanceof Uint8Array)) throw new Error('mime: decode expects Uint8Array');
            if (!boundary) throw new Error('mime: boundary required');
            const sep = utf8.toBytes('--' + boundary);
            // Find the first boundary: may be at the start or after a preamble.
            let start = indexOfBytes(bytes, sep, 0);
            if (start < 0) throw new Error('mime: boundary not found');

            // Precompute the inter-part needle (\r\n--boundary) once.
            const needle = concatBytes([CRLF, sep]);

            const parts = [];
            let i = start + sep.length;
            while (i < bytes.length) {
                // Detect closing (--boundary--) vs part (--boundary\r\n).
                if (bytes[i] === 0x2d && bytes[i + 1] === 0x2d) break; // closing
                // Skip CRLF or LF after the boundary.
                if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) i += 2;
                else if (bytes[i] === 0x0a) i += 1;

                // Locate the next \r\n--boundary.
                const next = indexOfBytes(bytes, needle, i);
                if (next < 0) throw new Error('mime: unterminated part');

                // Between i and next: headers + CRLF CRLF + body.
                const partBytes = bytes.subarray(i, next);
                // Split headers / body on double CRLF (double LF tolerated).
                let sepIdx = -1;
                for (let k = 0; k < partBytes.length - 3; k++) {
                    if (partBytes[k] === 0x0d && partBytes[k + 1] === 0x0a &&
                        partBytes[k + 2] === 0x0d && partBytes[k + 3] === 0x0a) {
                        sepIdx = k; break;
                    }
                }
                let headerText, bodyBytes;
                if (sepIdx >= 0) {
                    headerText = utf8.fromBytes(partBytes.subarray(0, sepIdx));
                    bodyBytes = partBytes.subarray(sepIdx + 4);
                } else {
                    // No headers.
                    headerText = '';
                    bodyBytes = partBytes;
                }
                parts.push({ headers: parseHeaders(headerText), body: bodyBytes });
                i = next + needle.length;
            }
            return parts;
        }

        // ---------- multipart encode ----------

        /**
         * Random boundary, compatible with most implementations.
         * Format: `----FwBoundary` + 16 hex chars (8 bytes from CSPRNG).
         *
         * @returns {string} The boundary string.
         * @throws {Error} If the entropy source is unavailable.
         */
        function randomBoundary() {
            const bytes = random.bytes(8);
            if (bytes === false || !bytes) {
                throw new Error('mime: CSPRNG entropy unavailable for boundary generation');
            }
            let hex = '';
            for (let i = 0; i < bytes.length; i++) {
                const v = bytes[i];
                hex += (v < 16 ? '0' : '') + v.toString(16);
            }
            return '----FwBoundary' + hex;
        }

        /**
         * Encode a list of parts into a `multipart/*` body.
         *
         * Each part: `{ headers?: Object, body: Uint8Array|string }`.
         *
         * @param {Array<{headers?: Object, body: Uint8Array|string}>} parts
         * @param {{boundary?: string, type?: string}} [options]
         * @returns {{body: Uint8Array, boundary: string, contentType: string}}
         * @throws {Error} If `options.boundary` is absent and the CSPRNG is unavailable.
         */
        function encode(parts, options) {
            options = options || {};
            const boundary = options.boundary || randomBoundary();
            const type = options.type || 'multipart/form-data';
            const chunks = [];
            const sepStart = utf8.toBytes('--' + boundary + '\r\n');
            const sepEnd = utf8.toBytes('\r\n--' + boundary + '--\r\n');
            const midSep = utf8.toBytes('\r\n--' + boundary + '\r\n');

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                chunks.push(i === 0 ? sepStart : midSep);
                chunks.push(utf8.toBytes(formatHeaders(part.headers || {}) + '\r\n'));
                const body = part.body;
                if (typeof body === 'string') chunks.push(utf8.toBytes(body));
                else if (body instanceof Uint8Array) chunks.push(body);
                else if (body == null) { /* empty part */ }
                else throw new Error('mime: part body must be string or Uint8Array');
            }
            if (parts.length === 0) {
                // Empty: just the closing boundary.
                chunks.push(utf8.toBytes('--' + boundary + '--\r\n'));
            } else {
                chunks.push(sepEnd);
            }

            return {
                body: concatBytes(chunks),
                boundary,
                contentType: type + '; boundary=' + boundary
            };
        }

        return {
            parseHeader,
            formatHeader,
            parseHeaders,
            formatHeaders,
            encode,
            decode,
            randomBoundary
        };
    }
};
