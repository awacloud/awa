// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML settings part — `word/settings.xml`
 * (ECMA-376 part 1 §17.15).
 *
 * The settings part has dozens of optional flags and configuration
 * elements. The vast majority are simple `<w:flag/>` toggles or
 * `<w:flag w:val="…"/>` value bindings. We expose a flat property bag :
 *
 * ```js
 * {
 *   defaultTabStop?: number,
 *   evenAndOddHeaders?: boolean,
 *   updateFields?: boolean,
 *   trackChanges?: boolean,
 *   zoom?: { val?: string, percent?: number },
 *   _extras?: [xmlNode]    // verbatim for unknown elements
 * }
 * ```
 *
 * Anything we don't model lands in `_extras` so a roundtrip preserves
 * settings injected by other tools (Word writes ~30 of these).
 *
 * @module ooxml/docx/settings
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxSettings = {
    name: 'docxSettings',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError, RenderError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText } = shared;

        const W_NS = NS.W;
        const REL_TYPE_SETTINGS = REL_TYPE.SETTINGS;
        const CT_SETTINGS = CT.SETTINGS;

        // Namespaces of the prefixes a Word-saved settings part uses besides
        // `w`, in declaration order (the URIs are those Word itself writes).
        const SETTINGS_PREFIXES = Object.freeze({
            'r':        NS.R,
            'm':        NS.M,
            'o':        'urn:schemas-microsoft-com:office:office',
            'v':        'urn:schemas-microsoft-com:vml',
            'w10':      'urn:schemas-microsoft-com:office:word',
            'w14':      'http://schemas.microsoft.com/office/word/2010/wordml',
            'w15':      NS.W15,
            'w16cex':   'http://schemas.microsoft.com/office/word/2018/wordml/cex',
            'w16cid':   'http://schemas.microsoft.com/office/word/2016/wordml/cid',
            'w16':      'http://schemas.microsoft.com/office/word/2018/wordml',
            'w16sdtdh': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
            'w16se':    'http://schemas.microsoft.com/office/word/2015/wordml/symex',
            'sl':       'http://schemas.openxmlformats.org/schemaLibrary/2006/main',
            'mc':       NS.MC
        });
        // Office extension prefixes: declared ignorable through `mc:Ignorable`.
        const EXTENSION_PREFIXES = new Set(
            ['w14', 'w15', 'w16cex', 'w16cid', 'w16', 'w16sdtdh', 'w16se']);

        /**
         * Collects, in document order, the prefix of every element and
         * attribute name in `nodes` (recursively). Namespace declarations,
         * `xml:*` names, unprefixed names and non-element nodes are skipped.
         * @param {Array<object>} nodes
         * @param {Set<string>} used - receives the prefixes
         */
        function collectPrefixes(nodes, used) {
            for (const node of nodes) {
                if (!node || node.type !== 'element') continue;
                addPrefix(node.name, used);
                for (const k of Object.keys(node.attrs || {})) {
                    if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
                    addPrefix(k, used);
                }
                if (node.children) collectPrefixes(node.children, used);
            }
        }

        function addPrefix(qname, used) {
            const i = qname.indexOf(':');
            if (i < 0) return;
            const prefix = qname.slice(0, i);
            if (prefix === 'xml' || prefix === 'xmlns') return;
            used.add(prefix);
        }

        /**
         * Root attributes of `w:settings` for the tree it is about to emit:
         * `xmlns:w`, one declaration per other prefix used (table order),
         * then `xmlns:mc` and `mc:Ignorable` when an Office extension
         * prefix is used. Pure: `children` is only read.
         * @param {Array<object>} children
         * @returns {Record<string, string>}
         * @throws {RenderError} `docx/settings-unknown-prefix` when a used
         *   prefix has no known namespace (first one in document order).
         */
        function rootAttrs(children) {
            const used = new Set();
            collectPrefixes(children, used);
            for (const prefix of used) {
                if (prefix !== 'w' && !Object.hasOwn(SETTINGS_PREFIXES, prefix)) {
                    throw new RenderError('docx/settings-unknown-prefix',
                        `docx settings: the settings tree uses the prefix "${prefix}", which has no known namespace`,
                        { context: { prefix } });
                }
            }
            const attrs = { 'xmlns:w': W_NS };
            const ignorable = [];
            for (const [prefix, uri] of Object.entries(SETTINGS_PREFIXES)) {
                if (!used.has(prefix)) continue;
                attrs[`xmlns:${prefix}`] = uri;
                if (EXTENSION_PREFIXES.has(prefix)) ignorable.push(prefix);
            }
            if (ignorable.length) {
                if (!attrs['xmlns:mc']) attrs['xmlns:mc'] = SETTINGS_PREFIXES.mc;
                attrs['mc:Ignorable'] = ignorable.join(' ');
            }
            return attrs;
        }

        function readToggle(el) {
            const v = el.attrs['w:val'];
            if (v === undefined) return true;
            return !(v === '0' || v === 'false' || v === 'off');
        }

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'w:settings') {
                throw new ParseError('docx/settings-bad-root', `docx settings: expected <w:settings>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = {};
            const extras = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:defaultTabStop':
                        out.defaultTabStop = Number(c.attrs['w:val']);
                        break;
                    case 'w:evenAndOddHeaders':
                        out.evenAndOddHeaders = readToggle(c);
                        break;
                    case 'w:updateFields':
                        out.updateFields = readToggle(c);
                        break;
                    case 'w:trackChanges':
                        out.trackChanges = readToggle(c);
                        break;
                    case 'w:zoom': {
                        const z = {};
                        if (c.attrs['w:val'])     z.val = c.attrs['w:val'];
                        if (c.attrs['w:percent']) z.percent = Number(c.attrs['w:percent']);
                        out.zoom = z;
                        break;
                    }
                    default:
                        extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function serialize(obj) {
            const children = [];
            if (obj.defaultTabStop != null) {
                children.push(xml.el('w:defaultTabStop',
                    { 'w:val': String(obj.defaultTabStop) }));
            }
            if (obj.evenAndOddHeaders === true) {
                children.push(xml.el('w:evenAndOddHeaders', {}));
            }
            if (obj.updateFields === true) {
                children.push(xml.el('w:updateFields', {}));
            }
            if (obj.trackChanges === true) {
                children.push(xml.el('w:trackChanges', {}));
            }
            if (obj.zoom) {
                const a = {};
                if (obj.zoom.val) a['w:val'] = obj.zoom.val;
                if (obj.zoom.percent != null) a['w:percent'] = String(obj.zoom.percent);
                children.push(xml.el('w:zoom', a));
            }
            if (obj._extras) for (const ex of obj._extras) children.push(ex);
            return xml.serialize(xml.el('w:settings', rootAttrs(children), children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        return {
            parse, serialize, bytesOf,
            REL_TYPE_SETTINGS, CT_SETTINGS
        };
    }
};
