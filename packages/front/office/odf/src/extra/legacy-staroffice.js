// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in catch-all : preserves any element belonging to a
 * legacy StarOffice 5.x/6.x namespace as a typed
 * `{ kind, attrs, children, _legacy: true }` bag, so they survive a
 * roundtrip even though they have no ODF 1.4 counterpart.
 *
 * Recognised namespace prefixes :
 *   - `so:`   StarOffice common
 *   - `so20:` StarOffice 2.0
 *   - `so52:` StarOffice 5.2
 *   - `ooo:`  OpenOffice early
 *   - `ooow:` OpenOffice Writer
 *   - `oooc:` OpenOffice Calc
 *
 * @module odf/extra/legacy-staroffice
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const legacyStaroffice = {
    name: 'legacyStaroffice',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const LEGACY_PREFIXES = ['so:', 'so20:', 'so52:', 'ooo:', 'ooow:', 'oooc:'];

        function isLegacy(name) {
            if (typeof name !== 'string') return false;
            for (const p of LEGACY_PREFIXES) { if (name.startsWith(p)) return true; }
            return false;
        }

        function parseLegacy(el) {
            if (!el || el.type !== 'element' || !isLegacy(el.name)) return null;
            const kids = [];
            for (const c of el.children || []) {
                if (c && c.type === 'element' && isLegacy(c.name)) {
                    kids.push(parseLegacy(c));
                } else { kids.push(c); }
            }
            return {
                _legacy: true,
                kind: el.name,
                attrs: { ...(el.attrs || {}) },
                children: kids
            };
        }

        function renderLegacy(obj) {
            if (!obj || obj.kind == null) return null;
            const kids = [];
            for (const c of obj.children || []) {
                if (c && c._legacy) kids.push(renderLegacy(c));
                else kids.push(c);
            }
            return xml.el(obj.kind, { ...(obj.attrs || {}) }, kids);
        }

        function hydrate(node) {
            if (!node || !node._extras) return node;
            const extras = Array.isArray(node._extras) ? node._extras : (node._extras.children || []);
            if (!extras.length) return node;
            const remaining = [];
            const promoted = node.legacyNodes || [];
            for (const c of extras) {
                if (c && c.type === 'element' && isLegacy(c.name)) {
                    promoted.push(parseLegacy(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) node.legacyNodes = promoted;
            if (Array.isArray(node._extras)) {
                if (remaining.length) node._extras = remaining; else delete node._extras;
            } else {
                if (remaining.length) node._extras.children = remaining; else delete node._extras.children;
                if (!Object.keys(node._extras).length) delete node._extras;
            }
            return node;
        }

        function dehydrate(node) {
            if (!node || !node.legacyNodes || !node.legacyNodes.length) return node;
            const out = { ...node };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.legacyNodes) extras.push(renderLegacy(n));
            delete out.legacyNodes;
            if (Array.isArray(node._extras) || !node._extras) out._extras = extras;
            else out._extras = { ...node._extras, children: extras };
            return out;
        }

        return {
            parseLegacy, renderLegacy, isLegacy,
            hydrateParagraph: hydrate, dehydrateParagraph: dehydrate,
            hydrateMetadata: hydrate, dehydrateMetadata: dehydrate,
            hydrateStyles: hydrate, dehydrateStyles: dehydrate,
            hydrateFrame: hydrate, dehydrateFrame: dehydrate,
            LEGACY_PREFIXES
        };
    }
};
