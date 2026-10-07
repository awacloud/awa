// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: /Info dict deprecation lint.
 *
 * PDF 2.0 (ISO 32000-2:2020 §14.3.3) deprecates the Document
 * Information Dictionary in favour of XMP metadata streams. This module
 * inspects a Catalog + /Info pair and emits structured warnings when
 * /Info is present on a PDF 2.0 document, including a suggested XMP
 * mapping per the standard's recommended namespaces.
 *
 * @module pdf/extra/info-dict-deprecated
 */

import { pdfErrors } from '../errors.js';

export const pdfInfoDictDeprecated = {
    name: 'pdfInfoDictDeprecated',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const INFO_TO_XMP = {
            Title:        { ns: 'dc',  field: 'title'       },
            Author:       { ns: 'dc',  field: 'creator'     },
            Subject:      { ns: 'dc',  field: 'description' },
            Keywords:     { ns: 'pdf', field: 'Keywords'    },
            Creator:      { ns: 'xmp', field: 'CreatorTool' },
            Producer:     { ns: 'pdf', field: 'Producer'    },
            CreationDate: { ns: 'xmp', field: 'CreateDate'  },
            ModDate:      { ns: 'xmp', field: 'ModifyDate'  },
            Trapped:      { ns: 'pdf', field: 'Trapped'     }
        };

        function isDict(v) { return v && v.type === 'dict'; }

        function parsePdfVersion(v) {
            if (typeof v === 'string') return v;
            if (v && v.type === 'name') return v.value;
            if (v && v.type === 'string') {
                const b = v.value;
                if (b instanceof Uint8Array) return new TextDecoder('latin1').decode(b);
                return String(b);
            }
            if (typeof v === 'number') return String(v);
            throw new ParseError('pdf/info-deprecated/bad-version',
                'PDF version must be string or PDF name',
                { context: { type: v && v.type } });
        }

        function isVersion2OrHigher(versionStr) {
            const m = /^(\d+)\.(\d+)/.exec(versionStr || '');
            if (!m) return false;
            const major = parseInt(m[1], 10);
            return major >= 2;
        }

        function suggestionsFor(infoDict) {
            if (!isDict(infoDict)) return [];
            const out = [];
            for (const k of Object.keys(infoDict.entries)) {
                const map = INFO_TO_XMP[k];
                if (map) {
                    out.push({
                        infoKey: k,
                        xmpNamespace: map.ns,
                        xmpField: map.field
                    });
                } else {
                    out.push({
                        infoKey: k,
                        xmpNamespace: null,
                        xmpField: null,
                        note: 'no standard XMP equivalent'
                    });
                }
            }
            return out;
        }

        function lint(opts) {
            opts = opts || {};
            const version = parsePdfVersion(opts.version);
            const info = opts.info;
            const xmpPresent = !!opts.xmpPresent;
            const warnings = [];

            if (info != null) {
                if (!isDict(info)) {
                    throw new ParseError('pdf/info-deprecated/bad-info',
                        '/Info must be a dict',
                        { context: { type: info && info.type } });
                }
            }

            const v2 = isVersion2OrHigher(version);
            if (v2 && info) {
                warnings.push({
                    code: 'pdf/info-deprecated',
                    severity: 'warn',
                    message: '/Info is deprecated in PDF 2.0 — use the XMP metadata stream instead',
                    suggestions: suggestionsFor(info)
                });
            }
            if (v2 && info && !xmpPresent) {
                warnings.push({
                    code: 'pdf/info-without-xmp',
                    severity: 'warn',
                    message: 'PDF 2.0 document carries /Info but no XMP /Metadata stream'
                });
            }
            return {
                version,
                isPdf2: v2,
                hasInfo: info != null,
                xmpPresent,
                warnings
            };
        }

        function mapInfoKey(name) {
            return INFO_TO_XMP[name] || null;
        }

        return {
            lint,
            mapInfoKey,
            suggestionsFor,
            INFO_TO_XMP,
            isVersion2OrHigher
        };
    }
};
