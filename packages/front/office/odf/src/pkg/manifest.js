// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `META-INF/manifest.xml`.
 *
 * Each ODF package declares its file entries through a manifest XML at
 * `META-INF/manifest.xml`. The first entry MUST be the root `/` entry
 * whose `media-type` identifies the document type (ODT/ODS/ODP).
 *
 * Model:
 * ```js
 * {
 *   version: '1.4',
 *   entries: [
 *     { fullPath: '/', mediaType: '<doc mimetype>', version: '1.4' },
 *     { fullPath: 'content.xml', mediaType: 'text/xml' },
 *     ...
 *   ],
 *   _extras: { attrs?, children? }  // preserve-unknowns
 * }
 * ```
 *
 * @module odf/pkg/manifest
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const pkgManifest = {
    name: 'pkgManifest',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        const { ParseError } = errors;
        const { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared;
        const MANIFEST_NS = ODF_NS.MANIFEST;

        const KNOWN_ROOT_ATTRS = new Set(['manifest:version', 'xmlns:manifest']);
        const KNOWN_ENTRY_ATTRS = new Set([
            'manifest:full-path', 'manifest:media-type', 'manifest:version',
            'manifest:size'
        ]);

        /**
         * Parse a manifest XML string.
         *
         * @param {string} xmlString
         * @returns {{ version: string, entries: Array, _extras?: object }}
         */
        function parse(xmlString) {
            const root = parseXmlOrThrow(xmlString, 'manifest',
                { part: 'META-INF/manifest.xml', module: 'manifest' });
            if (root.name !== 'manifest:manifest') {
                throw new ParseError('odf/parse-error/manifest',
                    `manifest: unexpected root <${root.name}>`,
                    { context: { part: 'META-INF/manifest.xml', module: 'manifest' } });
            }
            const version = root.attrs['manifest:version'] || ODF_VERSION;
            const entries = [];
            const extraChildren = [];
            const extraAttrs = {};

            for (const k of Object.keys(root.attrs)) {
                if (!KNOWN_ROOT_ATTRS.has(k)) extraAttrs[k] = root.attrs[k];
            }

            for (const c of root.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'manifest:file-entry') {
                    entries.push(parseEntry(c));
                } else {
                    extraChildren.push(c);
                }
            }

            const out = { version, entries };
            const extras = {};
            if (Object.keys(extraAttrs).length) extras.attrs = extraAttrs;
            if (extraChildren.length) extras.children = extraChildren;
            if (Object.keys(extras).length) out._extras = extras;
            return out;
        }

        function parseEntry(el) {
            const e = {
                fullPath: el.attrs['manifest:full-path'] || '',
                mediaType: el.attrs['manifest:media-type'] || ''
            };
            if (el.attrs['manifest:version']) {
                e.version = el.attrs['manifest:version'];
            }
            if (el.attrs['manifest:size']) {
                e.size = el.attrs['manifest:size'];
            }
            // Preserve unknown attrs + children
            const extraAttrs = {};
            for (const k of Object.keys(el.attrs)) {
                if (!KNOWN_ENTRY_ATTRS.has(k)) extraAttrs[k] = el.attrs[k];
            }
            const extraChildren = (el.children || []).filter(c => c.type === 'element');
            const extras = {};
            if (Object.keys(extraAttrs).length) extras.attrs = extraAttrs;
            if (extraChildren.length) extras.children = extraChildren;
            if (Object.keys(extras).length) e._extras = extras;
            return e;
        }

        /**
         * Render a manifest model to an XML string (with prolog). The root
         * declares every namespace prefix the output uses (the source root's
         * declarations come back through `_extras.attrs`, the rest from the
         * known table); a prefix nobody declares throws
         * `RenderError('odf/render-error/namespace')`.
         *
         * @param {object} manifest
         * @returns {string}
         */
        function serialize(manifest) {
            const m = manifest || { version: ODF_VERSION, entries: [] };
            const attrs = {
                'xmlns:manifest': MANIFEST_NS,
                'manifest:version': m.version || ODF_VERSION
            };
            if (m._extras && m._extras.attrs) {
                for (const k of Object.keys(m._extras.attrs)) {
                    attrs[k] = m._extras.attrs[k];
                }
            }
            const children = (m.entries || []).map(renderEntry);
            if (m._extras && m._extras.children) {
                for (const c of m._extras.children) children.push(c);
            }
            const root = xml.el('manifest:manifest', attrs, children);
            declareNamespaces(root, { part: 'META-INF/manifest.xml', module: 'manifest' });
            return xml.serialize(root);
        }

        function renderEntry(e) {
            const attrs = {
                'manifest:full-path': e.fullPath,
                'manifest:media-type': e.mediaType || ''
            };
            if (e.version) attrs['manifest:version'] = e.version;
            if (e.size != null) attrs['manifest:size'] = String(e.size);
            if (e._extras && e._extras.attrs) {
                for (const k of Object.keys(e._extras.attrs)) {
                    attrs[k] = e._extras.attrs[k];
                }
            }
            const children = (e._extras && e._extras.children) || [];
            return xml.el('manifest:file-entry', attrs, children);
        }

        /**
         * Build a minimal manifest with just the root entry for a given mimetype.
         */
        function empty(mimetype) {
            return {
                version: ODF_VERSION,
                entries: [{ fullPath: '/', mediaType: mimetype, version: ODF_VERSION }]
            };
        }

        /**
         * Add or replace an entry in a manifest. Mutates in place.
         */
        function setEntry(manifest, fullPath, mediaType) {
            const idx = manifest.entries.findIndex(e => e.fullPath === fullPath);
            const entry = { fullPath, mediaType };
            if (idx >= 0) manifest.entries[idx] = entry;
            else manifest.entries.push(entry);
            return manifest;
        }

        return { parse, serialize, empty, setEntry, MANIFEST_NS };
    }
};
