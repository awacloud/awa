// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of
 * `<dsig:document-signatures>` and its child XML-DSig elements
 * (`Signature`, `SignedInfo`, `SignatureValue`, `KeyInfo`,
 * `X509Data`, `Object`, …). The DSig subtree is preserved verbatim
 * as raw XML children so that signature integrity is unaffected.
 *
 * @module odf/extra/dsig-signatures
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dsigSignatures = {
    name: 'dsigSignatures',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {

        function parseSignatures(el) {
            if (!el || el.type !== 'element' || el.name !== 'dsig:document-signatures') {
                return null;
            }
            return {
                type: 'dsig-signatures',
                attrs: { ...(el.attrs || {}) },
                body: [...(el.children || [])]
            };
        }

        function renderSignatures(obj) {
            if (!obj || obj.type !== 'dsig-signatures') return null;
            return xml.el('dsig:document-signatures',
                { ...(obj.attrs || {}) }, obj.body || []);
        }

        function isSignatures(name) { return name === 'dsig:document-signatures'; }

        function manifestEntries() {
            return [
                { fullPath: 'META-INF/documentsignatures.xml', mediaType: '' }
            ];
        }

        function hydrateMetadata(meta) {
            if (!meta || !meta._extras) return meta;
            const extras = Array.isArray(meta._extras) ? meta._extras : (meta._extras.children || []);
            const remaining = [];
            for (const c of extras) {
                if (c && c.type === 'element' && c.name === 'dsig:document-signatures') {
                    meta.signatures = parseSignatures(c);
                } else { remaining.push(c); }
            }
            if (Array.isArray(meta._extras)) {
                if (remaining.length) meta._extras = remaining; else delete meta._extras;
            } else {
                if (remaining.length) meta._extras.children = remaining; else delete meta._extras.children;
                if (!Object.keys(meta._extras).length) delete meta._extras;
            }
            return meta;
        }

        function dehydrateMetadata(meta) {
            if (!meta || !meta.signatures) return meta;
            const out = { ...meta };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            extras.push(renderSignatures(out.signatures));
            delete out.signatures;
            if (Array.isArray(meta._extras) || !meta._extras) out._extras = extras;
            else out._extras = { ...meta._extras, children: extras };
            return out;
        }

        return {
            parseSignatures, renderSignatures, isSignatures,
            manifestEntries,
            hydrateMetadata, dehydrateMetadata
        };
    }
};
