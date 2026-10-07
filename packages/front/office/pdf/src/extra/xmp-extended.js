// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: minimal XMP packet extractor.
 *
 * Tokenises an XMP RDF/XML packet for a fixed set of well-known
 * namespaces and pulls out tag→value pairs. This is intentionally NOT
 * an RDF parser; it walks the element stream and harvests qualified
 * tag names whose prefix maps to one of the known namespaces.
 *
 * Supported namespaces (by URI):
 *   dc      → http://purl.org/dc/elements/1.1/
 *   xmp     → http://ns.adobe.com/xap/1.0/
 *   xmpMM   → http://ns.adobe.com/xap/1.0/mm/
 *   pdf     → http://ns.adobe.com/pdf/1.3/
 *   pdfaid  → http://www.aiim.org/pdfa/ns/id/
 *   pdfuaid → http://www.aiim.org/pdfua/ns/id/
 *
 * @module pdf/extra/xmp-extended
 */

import { pdfErrors } from '../errors.js';

export const pdfXmpExtended = {
    name: 'pdfXmpExtended',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const KNOWN_NAMESPACES = {
            'http://purl.org/dc/elements/1.1/':  'dc',
            'http://ns.adobe.com/xap/1.0/':      'xmp',
            'http://ns.adobe.com/xap/1.0/mm/':   'xmpMM',
            'http://ns.adobe.com/pdf/1.3/':      'pdf',
            'http://www.aiim.org/pdfa/ns/id/':   'pdfaid',
            'http://www.aiim.org/pdfua/ns/id/':  'pdfuaid'
        };

        function toText(bytes) {
            if (typeof bytes === 'string') return bytes;
            if (bytes instanceof Uint8Array) return new TextDecoder('utf-8').decode(bytes);
            throw new ParseError('pdf/xmp2/bad-input',
                'XMP input must be string or Uint8Array',
                { context: { type: typeof bytes } });
        }

        // Parse xmlns:* attributes from a start-tag inner string.
        function parseNamespaces(attrText) {
            const map = {};
            const rx = /xmlns:([\w-]+)\s*=\s*"([^"]*)"/g;
            let m;
            while ((m = rx.exec(attrText))) {
                map[m[1]] = m[2];
            }
            return map;
        }

        // Parse attr=value pairs.
        function parseAttrs(attrText) {
            const out = {};
            const rx = /([\w:-]+)\s*=\s*"([^"]*)"/g;
            let m;
            while ((m = rx.exec(attrText))) {
                if (!m[1].startsWith('xmlns')) out[m[1]] = m[2];
            }
            return out;
        }

        function decodeEntities(s) {
            return s.replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&apos;/g, "'")
                    .replace(/&amp;/g, '&');
        }

        // Tokenises tag/value pairs. Returns array of
        //   { prefix, ns, localName, value, attrs }.
        function extract(input) {
            const text = toText(input);
            const len = text.length;
            // Top-level ns map from rdf:RDF attributes.
            const tagRx = /<\/?([\w:-]+)([^>]*?)\/?>/g;
            const stack = [{ ns: {} }];
            const pairs = [];

            let i = 0;
            while (i < len) {
                tagRx.lastIndex = i;
                const m = tagRx.exec(text);
                if (!m) break;
                const start = m.index;
                const whole = m[0];
                const qname = m[1];
                const attrText = m[2] || '';
                const isClose = whole.startsWith('</');
                const isSelf = whole.endsWith('/>');

                if (isClose) {
                    stack.pop();
                    i = start + whole.length;
                    continue;
                }

                // Open element. Inherit ns from parent, merge new ns
                // declarations.
                const parentNs = stack[stack.length - 1].ns;
                const newNs = Object.assign({}, parentNs, parseNamespaces(attrText));
                const attrs = parseAttrs(attrText);

                let prefix = null, local = qname;
                const colon = qname.indexOf(':');
                if (colon >= 0) {
                    prefix = qname.slice(0, colon);
                    local = qname.slice(colon + 1);
                }
                const nsUri = prefix ? newNs[prefix] : null;
                const knownPrefix = nsUri ? KNOWN_NAMESPACES[nsUri] : null;

                let value = null;
                if (!isSelf) {
                    // Find matching close tag (simple — no nesting of
                    // same-name tags supported beyond stack).
                    const closeTag = `</${qname}>`;
                    const closeAt = text.indexOf(closeTag, start + whole.length);
                    if (closeAt < 0) {
                        throw new ParseError('pdf/xmp2/unclosed-tag',
                            `unclosed <${qname}>`,
                            { context: { offset: start } });
                    }
                    const inner = text.slice(start + whole.length, closeAt);
                    // If inner has no child element, treat as leaf value.
                    if (!/<[\w]/.test(inner)) {
                        value = decodeEntities(inner.trim());
                    }
                    stack.push({ ns: newNs, qname });
                    if (value !== null) {
                        // Skip past close tag and pop, since we consumed.
                        stack.pop();
                        i = closeAt + closeTag.length;
                    } else {
                        i = start + whole.length;
                    }
                } else {
                    i = start + whole.length;
                }

                if (knownPrefix && (value !== null || Object.keys(attrs).length > 0)) {
                    pairs.push({
                        prefix: knownPrefix,
                        ns: nsUri,
                        localName: local,
                        value,
                        attrs
                    });
                }
            }
            return pairs;
        }

        // Group pairs into a { ns: { local: value | [values] } } map.
        function group(pairs) {
            const out = {};
            for (const p of pairs) {
                if (!out[p.prefix]) out[p.prefix] = {};
                const bag = out[p.prefix];
                if (bag[p.localName] === undefined) bag[p.localName] = p.value;
                else if (Array.isArray(bag[p.localName])) bag[p.localName].push(p.value);
                else bag[p.localName] = [bag[p.localName], p.value];
            }
            return out;
        }

        function parsePacket(input) {
            const pairs = extract(input);
            return { pairs, grouped: group(pairs) };
        }

        return {
            parsePacket,
            extract,
            group,
            KNOWN_NAMESPACES
        };
    }
};
