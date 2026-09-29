// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Minimal XML parser/serializer - tree of typed nodes, no DTD, no
 * external entities, no exotic processing instructions. Suitable for
 * 90 % of XML processing needs (OOXML parts, ODF content, XMP metadata,
 * RSS/Atom feeds, SVG inline, MathML, config files).
 *
 * Node model :
 *   { type: 'element', name, attrs, children }
 *   { type: 'text',    value }
 *
 * Entities : amp, lt, gt, quot, apos, &#NNN;, &#xHHH;.
 *
 * @example
 * const xml = registry.resolve('xml');
 * const root = xml.parse('<a><b>hello</b></a>');
 * xml.textContent(root.children[0]); // 'hello'
 * xml.serialize(xml.el('root', {}, [xml.text('x')]));
 */

/**
 * An element node in the XML tree.
 * @typedef {object} XmlElement
 * @property {'element'} type
 * @property {string} name
 * @property {Object} attrs
 * @property {Array} children
 */

/**
 * A text node in the XML tree.
 * @typedef {object} XmlText
 * @property {'text'} type
 * @property {string} value
 */

/**
 * Any XML tree node.
 * @typedef {XmlElement|XmlText} XmlNode
 */

/**
 * Public API returned by `xml.factory()`.
 * @typedef {object} XmlAPI
 * @property {(name: string, attrs?: Object, children?: Array) => XmlElement} el Create an element node.
 * @property {(value: string) => XmlText} text Create a text node.
 * @property {(xmlStr: string) => XmlElement} parse Parse an XML string into a node tree (returns the root element).
 * @property {(root: object) => string} serialize Serialize a document with the XML prolog.
 * @property {(node: object) => string} serializeNode Serialize a node tree without the prolog.
 * @property {(node: { children: Array }, name: string) => (object|null)} findChild First direct child element with `name`, or `null`.
 * @property {(node: { children: Array }, name: string) => Array} findAll All direct child elements with `name`.
 * @property {(node: object) => string} textContent Recursively concatenate all descendant text values.
 * @property {(s: string) => string} encodeText Escape `&`, `<`, `>` for text content.
 * @property {(s: string) => string} encodeAttr Escape `&`, `<`, `>`, `"` for attribute values.
 * @property {(s: string) => string} decodeEntities Decode character references and predefined entities.
 * @property {new (code: string, msg: string) => Error} XmlParseError Constructor for parser errors.
 */

export const xml = {
    name: 'xml',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: [],

    /** @returns {XmlAPI} */
    factory() {
        /**
         * Typed error thrown when the XML parser encounters invalid input.
         */
        class XmlParseError extends Error {
            /**
             * @param {string} code  - machine-readable code, e.g. 'xml/parse-error'
             * @param {string} msg   - human-readable message
             */
            constructor(code, msg) {
                super(msg);
                // defineProperty (not `this.name =`) so it survives sanity's
                // frozen Error.prototype (non-writable inherited `name`).
                Object.defineProperty(this, 'name', { value: 'XmlParseError', writable: true, configurable: true });
                this.code = code;
            }
        }

        /** @type {{ amp: string, lt: string, gt: string, quot: string, apos: string }} */
        const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

        /**
         * Decode XML character references and predefined entities.
         * Tolerant: invalid code points (out of range, NaN, surrogates) are
         * returned as the original match literal instead of throwing.
         * @param {string} s
         * @returns {string}
         */
        function decodeEntities(s) {
            return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
                if (body[0] === '#') {
                    const cp = body[1] === 'x'
                        ? parseInt(body.slice(2), 16)
                        : parseInt(body.slice(1), 10);
                    // Reject NaN, negatives, surrogates (0xD800–0xDFFF), and > 0x10FFFF
                    if (
                        isNaN(cp) ||
                        cp < 0 ||
                        cp > 0x10FFFF ||
                        (cp >= 0xD800 && cp <= 0xDFFF)
                    ) {
                        return m;
                    }
                    return String.fromCodePoint(cp);
                }
                return ENTITIES[body] != null ? ENTITIES[body] : m;
            });
        }

        /**
         * Encode text content: escapes `&`, `<`, `>`.
         * @param {string} s
         * @returns {string}
         */
        function encodeText(s) {
            return String(s).replace(/[&<>]/g, c =>
                c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');
        }

        /**
         * Encode attribute value: escapes `&`, `<`, `>`, `"`.
         * @param {string} s
         * @returns {string}
         */
        function encodeAttr(s) {
            return String(s).replace(/[&<>"]/g, c =>
                c === '&' ? '&amp;' : c === '<' ? '&lt;' :
                c === '>' ? '&gt;' : '&quot;');
        }

        /**
         * Create an element node.
         * @param {string} name
         * @param {Object} [attrs={}]
         * @param {Array}  [children=[]]
         * @returns {{ type: 'element', name: string, attrs: Object, children: Array }}
         */
        function el(name, attrs, children) {
            return {
                type: 'element',
                name,
                attrs: attrs || {},
                children: children || []
            };
        }

        /**
         * Create a text node.
         * @param {string} value
         * @returns {{ type: 'text', value: string }}
         */
        function text(value) {
            return { type: 'text', value };
        }

        /**
         * Find the closing `>` of a tag, skipping quoted attribute values.
         * @param {string} s
         * @param {number} from  - index of the opening `<`
         * @returns {number}  index of `>`, or -1
         */
        function findTagEnd(s, from) {
            let i = from + 1;
            const len = s.length;
            let q = '';
            while (i < len) {
                const c = s[i];
                if (q) {
                    if (c === q) q = '';
                } else {
                    if (c === '"' || c === "'") q = c;
                    else if (c === '>') return i;
                }
                i++;
            }
            return -1;
        }

        /**
         * Parse the content of a start tag (everything between `<` and `>`
         * excluding the angle brackets).
         * @param {string} inner
         * @returns {{ type: 'element', name: string, attrs: Object, children: Array }}
         */
        function parseStartTag(inner) {
            let i = 0;
            const len = inner.length;
            while (i < len && !/\s/.test(inner[i])) i++;
            const name = inner.slice(0, i);
            const attrs = {};
            while (i < len) {
                while (i < len && /\s/.test(inner[i])) i++;
                if (i >= len) break;
                let j = i;
                while (j < len && inner[j] !== '=' && !/\s/.test(inner[j])) j++;
                const attrName = inner.slice(i, j);
                if (!attrName) break;
                while (j < len && /\s/.test(inner[j])) j++;
                if (inner[j] !== '=') {
                    // boolean attribute
                    attrs[attrName] = '';
                    i = j;
                    continue;
                }
                j++;
                while (j < len && /\s/.test(inner[j])) j++;
                const q = inner[j];
                if (q !== '"' && q !== "'")
                    throw new XmlParseError('xml/parse-error', `XML: unquoted attribute "${attrName}"`);
                const end = inner.indexOf(q, j + 1);
                if (end < 0)
                    throw new XmlParseError('xml/parse-error', `XML: unterminated attribute "${attrName}"`);
                attrs[attrName] = decodeEntities(inner.slice(j + 1, end));
                i = end + 1;
            }
            return el(name, attrs);
        }

        /**
         * Parse an XML string into a lightweight node tree.
         * Returns the **root element** node.
         *
         * Tolerant parser: no DTD, no external entity resolution, no XSD
         * validation. Handles BOM, CDATA sections, comments, processing
         * instructions, and numeric/predefined character references.
         *
         * @param {string} xmlStr
         * @returns {{ type: 'element', name: string, attrs: Object, children: Array }}
         * @throws {XmlParseError} on structural errors (mismatched tags, etc.)
         */
        function parse(xmlStr) {
            let i = 0;
            const len = xmlStr.length;

            // Skip UTF-8 BOM (U+FEFF)
            if (xmlStr.charCodeAt(0) === 0xFEFF) i = 1;

            const stack = [];
            let root = null;

            while (i < len) {
                if (xmlStr[i] === '<') {
                    // Processing instruction: <?...?>
                    if (xmlStr.startsWith('<?', i)) {
                        const end = xmlStr.indexOf('?>', i + 2);
                        if (end < 0) throw new XmlParseError('xml/parse-error', 'XML: unterminated processing instruction');
                        i = end + 2;
                        continue;
                    }
                    // Comment: <!--...-->
                    if (xmlStr.startsWith('<!--', i)) {
                        const end = xmlStr.indexOf('-->', i + 4);
                        if (end < 0) throw new XmlParseError('xml/parse-error', 'XML: unterminated comment');
                        i = end + 3;
                        continue;
                    }
                    // CDATA section: <![CDATA[...]]>
                    if (xmlStr.startsWith('<![CDATA[', i)) {
                        const end = xmlStr.indexOf(']]>', i + 9);
                        if (end < 0) throw new XmlParseError('xml/parse-error', 'XML: unterminated CDATA');
                        const val = xmlStr.slice(i + 9, end);
                        if (stack.length) stack[stack.length - 1].children.push(text(val));
                        i = end + 3;
                        continue;
                    }
                    // Other declarations: <!...>  (DOCTYPE, etc.) - skip
                    // Special case: internal subset <!DOCTYPE x [ ... ]> contains `>`
                    // so we must look for `]>` then the following `>` if `[` appears first.
                    if (xmlStr.startsWith('<!', i)) {
                        // Scan for `[` or `>` whichever comes first
                        let j = i + 2;
                        let foundBracket = false;
                        while (j < len) {
                            if (xmlStr[j] === '[') { foundBracket = true; break; }
                            if (xmlStr[j] === '>') break;
                            j++;
                        }
                        if (foundBracket) {
                            // Has internal subset: find `]>` - that IS the end of the declaration.
                            // DOCTYPE syntax: <!DOCTYPE name [ internal-subset ]>
                            // The `>` closing the declaration is the one right after `]`.
                            const subsetEnd = xmlStr.indexOf(']>', j + 1);
                            if (subsetEnd < 0) throw new XmlParseError('xml/parse-error', 'XML: unterminated declaration');
                            i = subsetEnd + 2;
                        } else {
                            // Simple declaration: use first `>`
                            if (j >= len) throw new XmlParseError('xml/parse-error', 'XML: unterminated declaration');
                            i = j + 1;
                        }
                        continue;
                    }
                    // End tag: </name>
                    if (xmlStr[i + 1] === '/') {
                        const end = xmlStr.indexOf('>', i);
                        if (end < 0) throw new XmlParseError('xml/parse-error', 'XML: unterminated end tag');
                        const tagName = xmlStr.slice(i + 2, end).trim();
                        const top = stack.pop();
                        if (!top || top.name !== tagName) {
                            throw new XmlParseError(
                                'xml/parse-error',
                                `XML: mismatched end tag </${tagName}> (expected </${top ? top.name : '∅'}>)`
                            );
                        }
                        i = end + 1;
                        continue;
                    }
                    // Start tag (or self-closing)
                    const end = findTagEnd(xmlStr, i);
                    if (end < 0) throw new XmlParseError('xml/parse-error', 'XML: unterminated start tag');
                    const selfClose = xmlStr[end - 1] === '/';
                    const inner = xmlStr.slice(i + 1, selfClose ? end - 1 : end);
                    const node = parseStartTag(inner);
                    if (stack.length) {
                        stack[stack.length - 1].children.push(node);
                    } else {
                        if (root) throw new XmlParseError('xml/parse-error', 'XML: multiple root elements');
                        root = node;
                    }
                    if (!selfClose) {
                        stack.push(node);
                    } else if (!root) {
                        root = node;
                    }
                    i = end + 1;
                } else {
                    // Text content
                    const next = xmlStr.indexOf('<', i);
                    const slice = xmlStr.slice(i, next < 0 ? len : next);
                    if (stack.length && slice.length) {
                        stack[stack.length - 1].children.push(text(decodeEntities(slice)));
                    }
                    if (next < 0) break;
                    i = next;
                }
            }

            if (stack.length)
                throw new XmlParseError('xml/parse-error', `XML: unclosed element <${stack[stack.length - 1].name}>`);
            if (!root)
                throw new XmlParseError('xml/parse-error', 'XML: no root element');
            return root;
        }

        /**
         * Serialize a node tree to an XML string **without** the XML prolog.
         * @param {object} node
         * @returns {string}
         */
        function serializeNode(node) {
            if (node.type === 'text') return encodeText(node.value);
            const attrs = Object.keys(node.attrs)
                .map(k => ` ${k}="${encodeAttr(node.attrs[k])}"`)
                .join('');
            if (!node.children || node.children.length === 0) {
                return `<${node.name}${attrs}/>`;
            }
            const inner = node.children.map(serializeNode).join('');
            return `<${node.name}${attrs}>${inner}</${node.name}>`;
        }

        /**
         * Serialize a document with a UTF-8 standalone prolog.
         * @param {object} root
         * @returns {string}
         */
        function serialize(root) {
            return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
                + serializeNode(root);
        }

        /**
         * Return the first direct child element with the given name, or `null`.
         * @param {{ children: Array }} node
         * @param {string} name
         * @returns {object|null}
         */
        function findChild(node, name) {
            if (!node.children) return null;
            for (const c of node.children) {
                if (c.type === 'element' && c.name === name) return c;
            }
            return null;
        }

        /**
         * Return all direct child elements with the given name (may be empty).
         * @param {{ children: Array }} node
         * @param {string} name
         * @returns {Array}
         */
        function findAll(node, name) {
            const out = [];
            if (!node.children) return out;
            for (const c of node.children) {
                if (c.type === 'element' && c.name === name) out.push(c);
            }
            return out;
        }

        /**
         * Recursively concatenate all text node values under `node`.
         * @param {object} node
         * @returns {string}
         */
        function textContent(node) {
            if (!node) return '';
            if (node.type === 'text') return node.value;
            if (!node.children) return '';
            return node.children.map(textContent).join('');
        }

        return {
            el, text, parse, serialize, serializeNode,
            findChild, findAll, textContent,
            encodeText, encodeAttr, decodeEntities,
            XmlParseError
        };
    }
};
