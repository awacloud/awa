// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML custom XML data parts (ECMA-376
 * part 1 §17.5.2 + §22.4).
 *
 * A docx can carry arbitrary XML data alongside the document, and
 * bind specific places in the body to XPath expressions over that
 * data via Structured Document Tags (SDTs, "content controls").
 *
 * Each data store item lives in **two parts** :
 *
 * | Part | Role |
 * |------|------|
 * | `customXml/item{N}.xml` | The actual user XML (opaque to docx). |
 * | `customXml/itemProps{N}.xml` | A `<ds:datastoreItem ds:itemID="{GUID}">` plus optional `<ds:schemaRefs>`. The GUID is the lookup key SDT `dataBinding`s reference via `storeItemID`. |
 *
 * The chain of relationships is :
 *
 * ```
 * /word/document.xml
 *   └─ rel customXml      → /customXml/item1.xml
 *
 * /customXml/item1.xml
 *   └─ rel customXmlProps → /customXml/itemProps1.xml
 * ```
 *
 * This module handles both parts. The item is stored as raw XML
 * string ; the props are typed (`{ storeItemID, schemaRefs }`).
 *
 * @module ooxml/docx/customXml
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxCustomXml = {
    name: 'docxCustomXml',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError, RenderError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText } = shared;

        const DS_NS = NS.DS;
        const REL_TYPE_CUSTOM_XML = REL_TYPE.CUSTOM_XML;
        const REL_TYPE_CUSTOM_XML_PROPS = REL_TYPE.CUSTOM_XML_PROPS;
        const CT_CUSTOM_XML_PROPS = CT.CUSTOM_XML_PROPS;

        /**
         * Parse a `customXml/itemProps{N}.xml` part.
         *
         * @param {string|Uint8Array} input
         * @returns {{ storeItemID: string, schemaRefs?: [string] }}
         */
        function parseProps(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'ds:datastoreItem') {
                throw new ParseError('docx/customxml-bad-root', `docx customXml props: expected <ds:datastoreItem>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = {
                storeItemID: root.attrs['ds:itemID']
                    || root.attrs['itemID']
                    || ''
            };
            const schemaRefs = [];
            const refsEl = xml.findChild(root, 'ds:schemaRefs');
            if (refsEl) {
                for (const r of xml.findAll(refsEl, 'ds:schemaRef')) {
                    if (r.attrs['ds:uri']) schemaRefs.push(r.attrs['ds:uri']);
                }
            }
            if (schemaRefs.length) out.schemaRefs = schemaRefs;
            return out;
        }

        /**
         * Serialize an itemProps object back to XML.
         *
         * @param {{storeItemID, schemaRefs?}} props
         * @returns {string}
         */
        function renderProps(props) {
            const refs = (props.schemaRefs || []).map(uri =>
                xml.el('ds:schemaRef', { 'ds:uri': uri }));
            const children = [];
            children.push(xml.el('ds:schemaRefs', {}, refs));
            return xml.serialize(xml.el('ds:datastoreItem',
                { 'xmlns:ds': DS_NS, 'ds:itemID': props.storeItemID || '' },
                children));
        }

        function propsBytes(props) { return encodeText(renderProps(props)); }

        /**
         * Generate a fresh `{...}` GUID. Word expects 38-character form
         * with curly braces, uppercase letters separated by hyphens —
         * 8-4-4-4-12.
         */
        function generateStoreItemID() {
            // RFC 4122 v4 (random) GUID, then wrap in braces.
            // Read at call time (worker-safe); fail closed, never a weak fallback.
            const c = globalThis.crypto;
            if (!c || typeof c.getRandomValues !== 'function') {
                throw new RenderError('docx/no-random-source', 'docx: no cryptographic random source (crypto.getRandomValues is unavailable); pass storeItemID explicitly');
            }
            const b = new Uint8Array(16);
            c.getRandomValues(b);
            // Set version (4) and variant (10xx).
            b[6] = (b[6] & 0x0F) | 0x40;
            b[8] = (b[8] & 0x3F) | 0x80;
            const hex = Array.from(b, x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
            return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
        }

        return {
            parseProps, renderProps, propsBytes,
            generateStoreItemID,
            DS_NS,
            REL_TYPE_CUSTOM_XML, REL_TYPE_CUSTOM_XML_PROPS,
            CT_CUSTOM_XML_PROPS
        };
    }
};
