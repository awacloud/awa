// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed CIDFont per ISO 32000-2:2020 §9.7.4
 * (CIDFontType0/CIDFontType2), `/CIDSystemInfo` §9.7.3, `/CIDToGIDMap`
 * §9.7.4.3, glyph-metrics arrays `/W /W2 /DW /DW2` §9.7.4.3, and the
 * predefined CMap catalog §9.7.5.2.
 *
 * @module pdf/extra/font-cid-typed
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfFontCidTyped = {
    name: 'pdfFontCidTyped',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        const SUBTYPES = new Set(['CIDFontType0', 'CIDFontType2']);

        const PREDEFINED_CMAPS = Object.freeze({
            'Adobe-GB1': Object.freeze([
                'GB-EUC-H', 'GB-EUC-V', 'GBpc-EUC-H', 'GBpc-EUC-V',
                'GBK-EUC-H', 'GBK-EUC-V', 'GBKp-EUC-H', 'GBKp-EUC-V',
                'GBK2K-H', 'GBK2K-V', 'UniGB-UCS2-H', 'UniGB-UCS2-V',
                'UniGB-UTF16-H', 'UniGB-UTF16-V'
            ]),
            'Adobe-CNS1': Object.freeze([
                'B5pc-H', 'B5pc-V', 'HKscs-B5-H', 'HKscs-B5-V',
                'ETen-B5-H', 'ETen-B5-V', 'ETenms-B5-H', 'ETenms-B5-V',
                'CNS-EUC-H', 'CNS-EUC-V', 'UniCNS-UCS2-H', 'UniCNS-UCS2-V',
                'UniCNS-UTF16-H', 'UniCNS-UTF16-V'
            ]),
            'Adobe-Japan1': Object.freeze([
                '83pv-RKSJ-H', '90ms-RKSJ-H', '90ms-RKSJ-V', '90msp-RKSJ-H',
                '90msp-RKSJ-V', '90pv-RKSJ-H', 'Add-RKSJ-H', 'Add-RKSJ-V',
                'EUC-H', 'EUC-V', 'Ext-RKSJ-H', 'Ext-RKSJ-V', 'H', 'V',
                'UniJIS-UCS2-H', 'UniJIS-UCS2-V', 'UniJIS-UCS2-HW-H',
                'UniJIS-UCS2-HW-V', 'UniJIS-UTF16-H', 'UniJIS-UTF16-V'
            ]),
            'Adobe-Korea1': Object.freeze([
                'KSC-EUC-H', 'KSC-EUC-V', 'KSCms-UHC-H', 'KSCms-UHC-V',
                'KSCms-UHC-HW-H', 'KSCms-UHC-HW-V', 'KSCpc-EUC-H',
                'UniKS-UCS2-H', 'UniKS-UCS2-V', 'UniKS-UTF16-H', 'UniKS-UTF16-V'
            ]),
            'Identity': Object.freeze(['Identity-H', 'Identity-V'])
        });

        const KNOWN = new Set([
            'Type', 'Subtype', 'BaseFont', 'CIDSystemInfo', 'FontDescriptor',
            'DW', 'W', 'DW2', 'W2', 'CIDToGIDMap'
        ]);

        function typeCIDFont(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/cid-font/not-dict',
                    'CIDFont must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Font')) {
                throw new ParseError('pdf/extra/cid-font/bad-type',
                    '/Type entry must be /Font',
                    { context: { actual: e.Type.value } });
            }
            if (!isType(e.Subtype, 'name') || !SUBTYPES.has(e.Subtype.value)) {
                throw new ParseError('pdf/extra/cid-font/bad-subtype',
                    '/Subtype must be CIDFontType0 or CIDFontType2',
                    { context: { actual: e.Subtype && e.Subtype.value } });
            }
            if (!isType(e.CIDSystemInfo, 'dict') && !(e.CIDSystemInfo && e.CIDSystemInfo.type === 'ref')) {
                throw new ParseError('pdf/extra/cid-font/missing-csi',
                    '/CIDSystemInfo is required (dict or ref)',
                    { context: { type: e.CIDSystemInfo && e.CIDSystemInfo.type } });
            }
            const out = {
                subtype:         e.Subtype.value,
                baseFont:        isType(e.BaseFont, 'name') ? e.BaseFont.value : null,
                cidSystemInfo:   isType(e.CIDSystemInfo, 'dict') ? typeCIDSystemInfo(e.CIDSystemInfo) : e.CIDSystemInfo,
                fontDescriptor:  e.FontDescriptor || null,
                dw:              numVal(e.DW, 1000),
                w:               isType(e.W, 'array')  ? decodeWidthsW(e.W)  : null,
                dw2:             isType(e.DW2, 'array') ? toNumArray(e.DW2)  : [880, -1000],
                w2:              isType(e.W2, 'array') ? e.W2.items.map(it => it) : null,
                cidToGIDMap:     e.CIDToGIDMap || null,
                raw:             dict,
                _extras:         {}
            };
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeCIDSystemInfo(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/cid-system-info/not-dict',
                    'CIDSystemInfo must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!isType(e.Registry, 'string') || !isType(e.Ordering, 'string')) {
                throw new ParseError('pdf/extra/cid-system-info/incomplete',
                    '/Registry and /Ordering are required strings');
            }
            return {
                registry:    e.Registry.value,
                ordering:    e.Ordering.value,
                supplement:  numVal(e.Supplement, 0)
            };
        }

        function decodeWidthsW(arr) {
            if (!isType(arr, 'array')) {
                throw new ParseError('pdf/extra/cid-font/bad-w',
                    '/W must be an array',
                    { context: { type: arr && arr.type } });
            }
            const items = arr.items;
            const out = [];
            let i = 0;
            while (i < items.length) {
                const c = items[i];
                if (!c || (c.type !== 'int' && c.type !== 'real')) {
                    throw new ParseError('pdf/extra/cid-font/bad-w-c',
                        '/W expects numeric CID');
                }
                const first = c.value | 0;
                const nxt = items[i + 1];
                if (nxt && nxt.type === 'array') {
                    const widths = [];
                    for (const it of nxt.items) {
                        if (!it || (it.type !== 'int' && it.type !== 'real')) {
                            throw new ParseError('pdf/extra/cid-font/bad-w-item',
                                '/W array sub-items must be numeric');
                        }
                        widths.push(it.value);
                    }
                    out.push({ first, last: first + widths.length - 1, widths });
                    i += 2;
                } else {
                    const last = nxt;
                    const w = items[i + 2];
                    if (!last || (last.type !== 'int' && last.type !== 'real') ||
                        !w    || (w.type !== 'int' && w.type !== 'real')) {
                        throw new ParseError('pdf/extra/cid-font/bad-w-range',
                            '/W range form requires c_first c_last w');
                    }
                    out.push({ first, last: last.value | 0, width: w.value });
                    i += 3;
                }
            }
            return out;
        }

        function numVal(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value;
        }

        function toNumArray(v) {
            if (!isType(v, 'array')) return null;
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                out.push(it.value);
            }
            return out;
        }

        return { typeCIDFont, typeCIDSystemInfo, decodeWidthsW, PREDEFINED_CMAPS };
    }
};

