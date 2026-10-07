// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Page typing per ISO 32000-2:2020 §7.7.3.3.
 *
 * A Page dict (`/Type /Page`) carries `/Parent`, `/MediaBox`,
 * `/CropBox`, `/Resources`, `/Contents`, `/Rotate`, optional
 * `/Annots`, `/Group`, `/Thumb`, `/Tabs`, `/StructParents`, `/Metadata`,
 * etc.
 *
 * `/Contents` may be a single stream ref, an array of stream refs, or
 * — rarely — an inline stream. The typed record exposes it as an
 * array of refs (possibly empty).
 *
 * `/Resources` is inheritable from the parent page tree node (§7.7.3.4)
 * — resolution is left to the document layer.
 *
 * @module pdf/document/page
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfPage = {
    name: 'pdfPage',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const KNOWN = new Set([
            'Type', 'Parent', 'LastModified', 'Resources', 'MediaBox',
            'CropBox', 'BleedBox', 'TrimBox', 'ArtBox', 'BoxColorInfo',
            'Contents', 'Rotate', 'Group', 'Thumb', 'B', 'Dur', 'Trans',
            'Annots', 'AA', 'Metadata', 'PieceInfo', 'StructParents',
            'ID', 'PZ', 'SeparationInfo', 'Tabs', 'TemplateInstantiated',
            'PresSteps', 'UserUnit', 'VP', 'AF', 'OutputIntents',
            'DPart', 'AssociatedFiles'
        ]);

        function toBox(v) {
            if (!v || v.type !== 'array' || v.items.length !== 4) return null;
            const r = new Array(4);
            for (let i = 0; i < 4; i++) {
                const it = v.items[i];
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                r[i] = it.value;
            }
            return r;
        }

        function toRotate(v) {
            if (!v || (v.type !== 'int' && v.type !== 'real')) return 0;
            const n = v.value | 0;
            const m = ((n % 360) + 360) % 360;
            if (m % 90 !== 0) return 0;
            return m;
        }

        function toContentsRefs(v) {
            if (!v) return [];
            if (v.type === 'ref') return [{ num: v.num, gen: v.gen }];
            if (v.type === 'array') {
                const out = [];
                for (const it of v.items) {
                    if (it.type === 'ref') out.push({ num: it.num, gen: it.gen });
                }
                return out;
            }
            return [];
        }

        function toAnnots(v) {
            if (!v) return [];
            if (v.type === 'ref') return [v];
            if (v.type === 'array') return v.items.slice();
            return [];
        }

        function typePage(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/page/not-dict',
                    'Page must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Page')) {
                throw new ParseError('pdf/page/bad-type',
                    '/Type must be /Page when present',
                    { context: { actual: e.Type.value } });
            }

            const out = {
                parent: e.Parent && e.Parent.type === 'ref'
                    ? { num: e.Parent.num, gen: e.Parent.gen } : null,
                mediaBox:  toBox(e.MediaBox),
                resources: e.Resources || null,
                contents:  toContentsRefs(e.Contents),
                rotate:    toRotate(e.Rotate),
                annots:    toAnnots(e.Annots),
                raw:       dict,
                _extras:   {}
            };

            if (e.CropBox)  out.cropBox  = toBox(e.CropBox);
            if (e.BleedBox) out.bleedBox = toBox(e.BleedBox);
            if (e.TrimBox)  out.trimBox  = toBox(e.TrimBox);
            if (e.ArtBox)   out.artBox   = toBox(e.ArtBox);
            if (e.UserUnit && e.UserUnit.type === 'real') out.userUnit = e.UserUnit.value;
            if (e.UserUnit && e.UserUnit.type === 'int')  out.userUnit = e.UserUnit.value;
            if (e.Tabs && e.Tabs.type === 'name') out.tabs = e.Tabs.value;
            if (e.Metadata) out.metadata = e.Metadata;
            if (e.Group)    out.group    = e.Group;

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typePage };
    }
};
