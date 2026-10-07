// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared helpers for parsers and renderers : HTML tag
 * regex pieces, backslash-escape / HTML-entity unescaping, URL
 * normalization, HTML escaping / URL encoding for renderers,
 * character-code constants — exposed as the `mdCommon` module factory.
 *
 * Originally ported from commonmark.js (BSD-2) `lib/common.js`. The full
 * named-entity table and the CommonMark URL percent-encoder are now
 * delegated to `@awacloud/fw/io/text/html-entities.js` and
 * `@awacloud/fw/io/codec/url.js` (no npm dependencies).
 *
 * Worker-safe : **full**. The factory closes over its declared
 * dependencies (`htmlEntities`, `url`) and emits a self-contained value
 * object holding character-code constants, regex fragments, and pure
 * functions. Strict factory-only : no top-level materialisation. The
 * canonical instance is materialised by `main.js` (the sole bootstrap
 * site allowed to call `factory()`) and seeded into the package-level
 * `ModuleRuntime` for all consumers.
 *
 * @module md/common
 */

import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url } from '@awacloud/fw/io/codec/url.js';

export const mdCommon = {
    name: 'mdCommon',
    dependencies: ['htmlEntities', 'url'],
    deps: [htmlEntities, url],
    factory(htmlEntitiesMod, urlMod) {
        const { decodeHtmlStrict: decodeHTMLStrict } = htmlEntitiesMod;
        const { encodeSafe: mdurlEncode } = urlMod;

        // -------------------------------------------------------------------
        // Character codes
        // -------------------------------------------------------------------

        const C_NEWLINE       = 10;
        const C_SPACE         = 32;
        const C_TAB           = 9;
        const C_BANG          = 33;
        const C_DOUBLEQUOTE   = 34;
        const C_SINGLEQUOTE   = 39;
        const C_OPEN_PAREN    = 40;
        const C_CLOSE_PAREN   = 41;
        const C_ASTERISK      = 42;
        const C_COLON         = 58;
        const C_LESSTHAN      = 60;
        const C_GREATERTHAN   = 62;
        const C_OPEN_BRACKET  = 91;
        const C_BACKSLASH     = 92;
        const C_CLOSE_BRACKET = 93;
        const C_UNDERSCORE    = 95;
        const C_BACKTICK      = 96;
        const C_AMPERSAND     = 38;

        // -------------------------------------------------------------------
        // HTML tag regex pieces
        // -------------------------------------------------------------------

        const TAGNAME                 = '[A-Za-z][A-Za-z0-9-]*';
        const ATTRIBUTENAME           = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
        const UNQUOTEDVALUE           = '[^"\'=<>`\\x00-\\x20]+';
        const SINGLEQUOTEDVALUE       = "'[^']*'";
        const DOUBLEQUOTEDVALUE       = '"[^"]*"';
        const ATTRIBUTEVALUE          =
            '(?:' + UNQUOTEDVALUE + '|' + SINGLEQUOTEDVALUE + '|' + DOUBLEQUOTEDVALUE + ')';
        const ATTRIBUTEVALUESPEC      = '(?:\\s*=\\s*' + ATTRIBUTEVALUE + ')';
        const ATTRIBUTE               = '(?:\\s+' + ATTRIBUTENAME + ATTRIBUTEVALUESPEC + '?)';
        const OPENTAG                 = '<' + TAGNAME + ATTRIBUTE + '*' + '\\s*/?>';
        const CLOSETAG                = '</' + TAGNAME + '\\s*[>]';
        const HTMLCOMMENT             = '<!-->|<!--->|<!--[\\s\\S]*?-->';
        const PROCESSINGINSTRUCTION   = '[<][?][\\s\\S]*?[?][>]';
        const DECLARATION             = '<![A-Za-z]+[^>]*>';
        const CDATA                   = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
        const HTMLTAG                 =
            '(?:' + OPENTAG + '|' + CLOSETAG + '|' + HTMLCOMMENT +
            '|' + PROCESSINGINSTRUCTION + '|' + DECLARATION + '|' + CDATA + ')';
        const reHtmlTag               = new RegExp('^' + HTMLTAG);

        // -------------------------------------------------------------------
        // Backslash-escape / entity unescape
        // -------------------------------------------------------------------

        const ENTITY    = '&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});';
        const ESCAPABLE = '[!"#$%&\'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]';

        const reBackslashOrAmp      = /[\\&]/;
        const reEntityOrEscapedChar = new RegExp('\\\\' + ESCAPABLE + '|' + ENTITY, 'gi');

        function unescapeChar(s) {
            if (s.charCodeAt(0) === C_BACKSLASH) return s.charAt(1);
            return decodeHTMLStrict(s);
        }

        /** Replace HTML entities and backslash escapes with literal characters. */
        function unescapeString(s) {
            if (reBackslashOrAmp.test(s)) {
                return s.replace(reEntityOrEscapedChar, unescapeChar);
            }
            return s;
        }

        /** Percent-encode a URL per CommonMark (`mdurl.encode`). On encoding
         *  failure (rare — only on truly invalid surrogate sequences) we fall
         *  back to the raw URI to preserve CommonMark's "always parses" promise.
         *  The original error is intentionally swallowed (silent contract) — if
         *  callers need a strict mode they can pass `opts.maxUrlLength` to throw
         *  early instead. */
        function normalizeURI(uri) {
            try { return mdurlEncode(uri); } catch { return uri; }
        }

        // -------------------------------------------------------------------
        // HTML escaping (for renderers — re-export-friendly)
        // -------------------------------------------------------------------

        const XMLSPECIAL = '[&<>"]';
        const reXmlSpecial = new RegExp(XMLSPECIAL, 'g');

        function replaceUnsafeChar(s) {
            switch (s) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                default:  return s;
            }
        }

        function escapeXml(s) {
            if (reXmlSpecial.test(s)) return s.replace(reXmlSpecial, replaceUnsafeChar);
            return s;
        }

        /** Alias — renderers expect `escapeHtml` semantically. */
        const escapeHtml = escapeXml;

        // -------------------------------------------------------------------
        // URL encoding for renderers (HTML attribute context)
        // -------------------------------------------------------------------

        const UNRESERVED_URL = new Set();
        for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&'()*+,;=") {
            UNRESERVED_URL.add(c.charCodeAt(0));
        }

        function isHex(c) {
            return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
        }

        // Module-level singleton — avoids `new TextEncoder()` per non-ASCII char.
        const _urlEncoder = new TextEncoder();

        /**
         * Encode a URL for use in an HTML attribute (CommonMark behavior).
         * Preserves already-percent-encoded triples, percent-encodes ASCII
         * unsafe ranges, percent-encodes multi-byte UTF-8, and finally
         * HTML-escapes `& < > "` for attribute safety.
         */
        function encodeUrl(url) {
            let out = '';
            for (let i = 0; i < url.length; i++) {
                const c = url.charCodeAt(i);
                if (c === 0x25 /* % */
                    && i + 2 < url.length
                    && isHex(url.charCodeAt(i + 1))
                    && isHex(url.charCodeAt(i + 2))) {
                    out += url.substr(i, 3);
                    i += 2;
                    continue;
                }
                if (c < 0x80) {
                    if (UNRESERVED_URL.has(c)) {
                        out += url[i];
                    } else {
                        out += '%' + c.toString(16).toUpperCase().padStart(2, '0');
                    }
                } else {
                    // Encode multi-byte UTF-8 via singleton encoder.
                    const bytes = _urlEncoder.encode(url[i]);
                    for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
                }
            }
            return escapeXml(out);
        }

        return {
            // Character codes
            C_NEWLINE, C_SPACE, C_TAB, C_BANG, C_DOUBLEQUOTE, C_SINGLEQUOTE,
            C_OPEN_PAREN, C_CLOSE_PAREN, C_ASTERISK, C_COLON,
            C_LESSTHAN, C_GREATERTHAN, C_OPEN_BRACKET, C_BACKSLASH,
            C_CLOSE_BRACKET, C_UNDERSCORE, C_BACKTICK, C_AMPERSAND,
            // HTML tag regex pieces
            TAGNAME, OPENTAG, CLOSETAG, reHtmlTag,
            // Backslash / entity
            ENTITY, ESCAPABLE, unescapeString, normalizeURI,
            // HTML / URL escaping
            escapeXml, escapeHtml, encodeUrl
        };
    }
};
