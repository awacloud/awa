// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: miscellaneous tail typing.
 *
 * Covers the long tail of Catalog-level entries that don't warrant
 * their own L1 module:
 *
 *   - /SpiderInfo      — Web-Capture provenance (ISO 32000-2 §14.10.2).
 *   - /Threads         — array of article-thread dicts (§12.4.3).
 *   - /Legal           — legal-attestation dict (§12.8.5).
 *   - /Requirements    — array of requirement dicts (§12.10).
 *   - /Perms           — extra permission flavours beyond /UR3, notably
 *                        /DocMDP transformation parameters (§12.8.2.2).
 *   - /NeedsRendering  — boolean indicator for XFA-bearing forms.
 *
 * @module pdf/extra/misc
 */

import { pdfErrors } from '../errors.js';

export const pdfMisc = {
    name: 'pdfMisc',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const REQUIREMENT_S_VALUES = new Set([
            'EnableJavaScripts'
        ]);

        function isDict(v) { return v && v.type === 'dict'; }
        function isName(v) { return v && v.type === 'name'; }
        function isArr(v) { return v && v.type === 'array'; }
        function isBool(v) { return v && v.type === 'bool'; }
        function isInt(v) { return v && v.type === 'int'; }

        function typeSpiderInfo(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/spider-not-dict',
                    '/SpiderInfo must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.V) {
                if (!isInt(e.V) && !(e.V && e.V.type === 'real')) {
                    throw new ParseError('pdf/misc/spider-bad-V',
                        '/SpiderInfo /V must be numeric');
                }
                out.version = e.V.value;
            }
            if (e.C) {
                if (!isArr(e.C)) {
                    throw new ParseError('pdf/misc/spider-bad-C',
                        '/SpiderInfo /C must be an array');
                }
                out.commands = e.C.items;
            }
            const KNOWN = new Set(['V', 'C']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeThreads(arr) {
            if (!isArr(arr)) {
                throw new ParseError('pdf/misc/threads-not-array',
                    '/Threads must be an array');
            }
            const out = [];
            for (let i = 0; i < arr.items.length; i++) {
                const it = arr.items[i];
                if (it.type !== 'ref' && !isDict(it)) {
                    throw new ParseError('pdf/misc/thread-bad-entry',
                        '/Threads entry must be a dict or ref',
                        { context: { index: i } });
                }
                out.push(it);
            }
            return out;
        }

        function typeLegal(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/legal-not-dict',
                    '/Legal must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, flags: {}, _extras: {} };
            const KNOWN_FLAGS = new Set([
                'JavaScriptActions', 'LaunchActions', 'URIActions',
                'MovieActions', 'SoundActions', 'HiddenAnnotations',
                'NonEmbeddedFonts', 'DevDepGS_OP', 'DevDepGS_HT',
                'DevDepGS_TR', 'DevDepGS_UCR', 'DevDepGS_FL', 'DevDepGS_BG',
                'Annotations', 'ExternalRefXobjects', 'ExternalOPIdicts',
                'ExternalStreams', 'TrueTypeFonts', 'AlternateImages'
            ]);
            for (const [k, v] of Object.entries(e)) {
                if (KNOWN_FLAGS.has(k)) {
                    if (!isInt(v)) {
                        throw new ParseError('pdf/misc/legal-bad-flag',
                            `/Legal /${k} must be an integer count`,
                            { context: { key: k } });
                    }
                    out.flags[k] = v.value;
                } else if (k === 'Attestation') {
                    if (v.type !== 'string') {
                        throw new ParseError('pdf/misc/legal-bad-attestation',
                            '/Attestation must be a string');
                    }
                    out.attestation = v.value;
                } else {
                    out._extras[k] = v;
                }
            }
            return out;
        }

        function typeRequirements(arr) {
            if (!isArr(arr)) {
                throw new ParseError('pdf/misc/req-not-array',
                    '/Requirements must be an array');
            }
            const out = [];
            for (let i = 0; i < arr.items.length; i++) {
                const it = arr.items[i];
                if (!isDict(it)) {
                    throw new ParseError('pdf/misc/req-bad-entry',
                        '/Requirements entry must be a dict',
                        { context: { index: i } });
                }
                const e = it.entries;
                if (!e.S || !isName(e.S)) {
                    throw new ParseError('pdf/misc/req-missing-S',
                        '/Requirements entry needs /S name',
                        { context: { index: i } });
                }
                out.push({
                    raw: it,
                    s: e.S.value,
                    standard: REQUIREMENT_S_VALUES.has(e.S.value),
                    rh: e.RH
                });
            }
            return out;
        }

        function typeDocMdpParams(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/docmdp-not-dict',
                    '/DocMDP transform params must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.P) {
                if (!isInt(e.P) || e.P.value < 1 || e.P.value > 3) {
                    throw new ParseError('pdf/misc/docmdp-bad-P',
                        '/DocMDP /P must be 1, 2, or 3');
                }
                out.permission = e.P.value;
            }
            if (e.V) {
                if (!isName(e.V)) {
                    throw new ParseError('pdf/misc/docmdp-bad-V',
                        '/DocMDP /V must be a name');
                }
                out.version = e.V.value;
            }
            const KNOWN = new Set(['Type', 'P', 'V']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typePerms(dict) {
            if (!isDict(dict)) {
                throw new ParseError('pdf/misc/perms-not-dict',
                    '/Perms must be a dict');
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.DocMDP) out.docMDP = e.DocMDP;
            if (e.UR3)    out.ur3    = e.UR3;
            if (e.UR)     out.ur     = e.UR;
            const KNOWN = new Set(['DocMDP', 'UR3', 'UR']);
            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeNeedsRendering(v) {
            if (!isBool(v)) {
                throw new ParseError('pdf/misc/needsrendering-bad',
                    '/NeedsRendering must be boolean');
            }
            return v.value;
        }

        return {
            typeSpiderInfo,
            typeThreads,
            typeLegal,
            typeRequirements,
            typeDocMdpParams,
            typePerms,
            typeNeedsRendering,
            REQUIREMENT_S_VALUES
        };
    }
};
