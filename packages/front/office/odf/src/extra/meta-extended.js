// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : extended typing for `<office:meta>`
 * contents — the full `meta:*` and `dc:*` element sets.
 *
 * Covered :
 *   meta:generator, meta:initial-creator, meta:creation-date,
 *   meta:printed-by, meta:print-date, meta:template, meta:auto-reload,
 *   meta:hyperlink-behaviour, meta:document-statistic,
 *   meta:user-defined, meta:keyword, meta:editing-cycles,
 *   meta:editing-duration,
 *   dc:title, dc:creator, dc:date, dc:description, dc:subject,
 *   dc:language, dc:rights.
 *
 * @module odf/extra/meta-extended
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const metaExtended = {
    name: 'metaExtended',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const META_TEXT = new Set([
            'meta:generator', 'meta:initial-creator', 'meta:creation-date',
            'meta:printed-by', 'meta:print-date', 'meta:editing-cycles',
            'meta:editing-duration', 'meta:keyword',
            'dc:title', 'dc:creator', 'dc:date', 'dc:description', 'dc:subject',
            'dc:language', 'dc:rights'
        ]);

        const META_ATTR = new Set([
            'meta:template', 'meta:auto-reload', 'meta:hyperlink-behaviour',
            'meta:document-statistic', 'meta:user-defined'
        ]);

        function camel(name) {
            const local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
            return local.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        }

        function parseMetaBody(el) {
            const out = { type: 'meta-extended', text: {}, attrs: {} };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (META_TEXT.has(c.name)) {
                    const key = camel(c.name);
                    if (c.name === 'meta:keyword') {
                        (out.text.keywords = out.text.keywords || []).push(xml.textContent(c));
                    } else if (c.name === 'meta:user-defined') {
                        (out.attrs.userDefined = out.attrs.userDefined || []).push({
                            attrs: { ...(c.attrs || {}) }, text: xml.textContent(c)
                        });
                    } else {
                        out.text[key] = xml.textContent(c);
                    }
                } else if (META_ATTR.has(c.name)) {
                    const key = camel(c.name);
                    if (c.name === 'meta:user-defined') {
                        (out.attrs.userDefined = out.attrs.userDefined || []).push({
                            attrs: { ...(c.attrs || {}) }, text: xml.textContent(c)
                        });
                    } else {
                        out.attrs[key] = { ...(c.attrs || {}) };
                    }
                }
            }
            return out;
        }

        function renderMetaBody(m) {
            const kids = [];
            for (const [name, asText] of [
                ['meta:generator', 'generator'],
                ['meta:initial-creator', 'initialCreator'],
                ['meta:creation-date', 'creationDate'],
                ['meta:printed-by', 'printedBy'],
                ['meta:print-date', 'printDate'],
                ['meta:editing-cycles', 'editingCycles'],
                ['meta:editing-duration', 'editingDuration'],
                ['dc:title', 'title'], ['dc:creator', 'creator'],
                ['dc:date', 'date'], ['dc:description', 'description'],
                ['dc:subject', 'subject'], ['dc:language', 'language'],
                ['dc:rights', 'rights']
            ]) {
                if (m.text && m.text[asText] != null) {
                    kids.push(xml.el(name, {}, [xml.text(String(m.text[asText]))]));
                }
            }
            if (m.text && Array.isArray(m.text.keywords)) {
                for (const k of m.text.keywords) kids.push(xml.el('meta:keyword', {}, [xml.text(String(k))]));
            }
            for (const [name, asAttr] of [
                ['meta:template', 'template'],
                ['meta:auto-reload', 'autoReload'],
                ['meta:hyperlink-behaviour', 'hyperlinkBehaviour'],
                ['meta:document-statistic', 'documentStatistic']
            ]) {
                if (m.attrs && m.attrs[asAttr]) kids.push(xml.el(name, { ...m.attrs[asAttr] }));
            }
            if (m.attrs && Array.isArray(m.attrs.userDefined)) {
                for (const u of m.attrs.userDefined) {
                    kids.push(xml.el('meta:user-defined', { ...(u.attrs || {}) },
                        u.text != null ? [xml.text(String(u.text))] : []));
                }
            }
            return xml.el('office:meta', {}, kids);
        }

        function hydrateMetadata(meta) {
            if (!meta || !meta._rawMeta) return meta;
            meta.metaExtended = parseMetaBody(meta._rawMeta);
            return meta;
        }
        function dehydrateMetadata(meta) { return meta; }

        return {
            parseMetaBody, renderMetaBody,
            hydrateMetadata, dehydrateMetadata,
            META_TEXT, META_ATTR
        };
    }
};
