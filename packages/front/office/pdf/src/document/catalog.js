// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Catalog typing per ISO 32000-2:2020 §7.7.2.
 *
 * The Catalog (`/Type /Catalog`) is the root of the document tree
 * referenced by the trailer's `/Root` entry. It holds the entry point
 * to pages, outlines, form fields, structure tree, metadata, version
 * override and viewer preferences.
 *
 * The L0 typing exposes the most common, well-defined entries:
 * `version`, `pages`, `pageLabels`, `names`, `dests`, `viewerPrefs`,
 * `pageLayout`, `pageMode`, `outlines`, `metadata`, `structTreeRoot`,
 * `markInfo`, `lang`, `acroForm`, `oCProperties`, `outputIntents`.
 *
 * Unknown entries are preserved in `_extras`.
 *
 * @module pdf/document/catalog
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfCatalog = {
    name: 'pdfCatalog',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const KNOWN = new Set([
            'Type', 'Version', 'Pages', 'PageLabels', 'Names', 'Dests',
            'ViewerPreferences', 'PageLayout', 'PageMode', 'Outlines',
            'Threads', 'OpenAction', 'AA', 'URI', 'AcroForm', 'Metadata',
            'StructTreeRoot', 'MarkInfo', 'Lang', 'SpiderInfo', 'OutputIntents',
            'PieceInfo', 'OCProperties', 'Perms', 'Legal', 'Requirements',
            'Collection', 'NeedsRendering', 'DSS', 'AF', 'DPartRoot'
        ]);

        function typeCatalog(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/catalog/not-dict',
                    'Catalog must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;

            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Catalog')) {
                throw new ParseError('pdf/catalog/bad-type',
                    '/Type entry must be /Catalog',
                    { context: { actual: e.Type.value } });
            }

            if (!e.Pages || e.Pages.type !== 'ref') {
                throw new ParseError('pdf/catalog/missing-pages',
                    'Catalog is missing required /Pages reference',
                    { context: { type: e.Pages && e.Pages.type } });
            }

            const out = {
                pages: { num: e.Pages.num, gen: e.Pages.gen },
                raw:   dict,
                _extras: {}
            };

            if (e.Version && e.Version.type === 'name') out.version = e.Version.value;
            if (e.PageLayout && e.PageLayout.type === 'name') out.pageLayout = e.PageLayout.value;
            if (e.PageMode   && e.PageMode.type   === 'name') out.pageMode   = e.PageMode.value;
            if (e.Lang       && e.Lang.type === 'string')     out.lang       = e.Lang.value;

            if (e.Outlines       && e.Outlines.type === 'ref')       out.outlines = e.Outlines;
            if (e.Metadata       && e.Metadata.type === 'ref')       out.metadata = e.Metadata;
            if (e.StructTreeRoot && e.StructTreeRoot.type === 'ref') out.structTreeRoot = e.StructTreeRoot;
            if (e.AcroForm) out.acroForm = e.AcroForm;
            if (e.Names) out.names = e.Names;
            if (e.Dests) out.dests = e.Dests;
            if (e.ViewerPreferences) out.viewerPrefs = e.ViewerPreferences;
            if (e.PageLabels) out.pageLabels = e.PageLabels;
            if (e.MarkInfo)   out.markInfo   = e.MarkInfo;
            if (e.OCProperties) out.ocProperties = e.OCProperties;
            if (e.OutputIntents) out.outputIntents = e.OutputIntents;

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }

            return out;
        }

        return { typeCatalog };
    }
};
