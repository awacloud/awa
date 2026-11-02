// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PDF/X conformance helpers.
 *
 * PDF/X (ISO 15930) defines a family of prepress-targeted profiles
 * (PDF/X-1a, X-3, X-4, X-4p, X-5g, X-5n, X-5pg, X-6) with an
 * `/OutputIntent` whose `/S` is `GTS_PDFX`. Required structural checks:
 *
 *   - `/TrimBox` (and optionally `/BleedBox`, `/ArtBox`) on every page.
 *   - Output intent profile (Dest profile or registry identifier).
 *   - Separation info dict (per page or document level) for X-4+.
 *
 * It also types the OPI dictionaries (Open Prepress Interface) an image or
 * form XObject's `/OPI` holds (`typeOpi`, `typeOpiDict`).
 *
 * @module pdf/extra/pdf-x-prepress
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfXPrepress = {
    name: 'pdfXPrepress',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError, ContractError } = errors;
        const { isType } = parser;

        const PDFX_PROFILES = Object.freeze({
            'X-1a:2001': { iso: 'ISO 15930-1:2001', color: 'cmyk+spot', flavor: 'closed' },
            'X-1a:2003': { iso: 'ISO 15930-4:2003', color: 'cmyk+spot', flavor: 'closed' },
            'X-3:2002':  { iso: 'ISO 15930-3:2002', color: 'any',       flavor: 'closed' },
            'X-3:2003':  { iso: 'ISO 15930-6:2003', color: 'any',       flavor: 'closed' },
            'X-4':       { iso: 'ISO 15930-7:2010', color: 'any',       flavor: 'transparency' },
            'X-4p':      { iso: 'ISO 15930-7:2010', color: 'any',       flavor: 'external-profile' },
            'X-5g':      { iso: 'ISO 15930-8:2010', color: 'any',       flavor: 'external-graphics' },
            'X-5n':      { iso: 'ISO 15930-8:2010', color: 'n-channel', flavor: 'external-profile' },
            'X-5pg':     { iso: 'ISO 15930-8:2010', color: 'any',       flavor: 'external-both' },
            'X-6':       { iso: 'ISO 15930-9:2020', color: 'any',       flavor: 'pdf-2.0' }
        });

        const COLOR_POLICY = Object.freeze({
            None:     'no transformation',
            Convert:  'convert to OutputIntent profile',
            Tag:      'tag with profile only',
            Embed:    'embed source profile'
        });

        function typePdfXOutputIntent(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pdfx/not-dict',
                    'OutputIntent must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const s = isType(e.S, 'name') ? e.S.value : null;
            const ident = isType(e.OutputConditionIdentifier, 'string')
                ? new TextDecoder('latin1').decode(e.OutputConditionIdentifier.value)
                : null;
            const profile = profileFromIdentifier(ident);
            return {
                isPdfX: s === 'GTS_PDFX',
                subtype: s,
                identifier: ident,
                profile,
                catalog: profile ? PDFX_PROFILES[profile] : null,
                raw: dict
            };
        }

        function profileFromIdentifier(s) {
            if (!s) return null;
            const m = s.match(/PDF\/(X-(?:1a:200[13]|3:200[23]|4p?|5(?:g|n|pg)|6))/i);
            if (!m) return null;
            const key = m[1].toUpperCase().replace('X-', 'X-');
            for (const k of Object.keys(PDFX_PROFILES)) {
                if (k.toLowerCase() === key.toLowerCase()) return k;
            }
            return null;
        }

        function lintPdfXPage(page) {
            if (!page || !page.entries) {
                throw new ParseError('pdf/extra/pdfx/lint/bad-page',
                    'lintPdfXPage requires a typed page dict',
                    { context: { type: typeof page } });
            }
            const errors = [];
            const warnings = [];
            const e = page.entries;
            if (!e.TrimBox && !e.ArtBox) {
                errors.push('page requires /TrimBox or /ArtBox');
            }
            if (e.TrimBox && e.ArtBox) {
                errors.push('page must not have both /TrimBox and /ArtBox');
            }
            if (!e.BleedBox) warnings.push('page has no /BleedBox');
            return { pass: errors.length === 0, errors, warnings };
        }

        // The OPI version dictionaries: per version, the keys and their
        // types (the Arlington PDF Model's), as `Key:type` pairs apart by a
        // space; a type of two, `a|b`, takes either.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const OPI_TYPES = Object.freeze({
            '1.3': keyTypes('Type:name Version:num F:dict|string ID:string Comments:string Size:array CropRect:array '
                + 'CropFixed:array Position:array Resolution:array ColorType:name Color:array Tint:num Overprint:bool '
                + 'ImageType:array GrayMap:array Transparency:bool Tags:array'),
            '2.0': keyTypes('Type:name Version:num F:dict|string MainImage:string Tags:array Size:array CropRect:array '
                + 'Overprint:bool Inks:array|name IncludedImageDimensions:array IncludedImageQuality:num')
        });
        const OPI_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(OPI_TYPES).map(([version, types]) => [version, Object.freeze(Object.keys(types))])));
        const OPI_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (isType(v, 'int') || isType(v, 'real') ? v.value : undefined),
            bool: (v) => (isType(v, 'bool') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined)
        });

        function opiValue(type, v) {
            if (isType(v, 'ref')) return v;
            const alts = type.split('|');
            if (alts.length > 1) {
                // A key of two types: the value as read, a name by its value.
                if (!alts.some((t) => OPI_READ[t](v) !== undefined)) return null;
                return isType(v, 'name') ? v.value : v;
            }
            const r = OPI_READ[type](v);
            return r === undefined ? null : r;
        }

        function opiNotDict(value) {
            return new ParseError('pdf/extra/pdfx/opi/not-dict',
                'an OPI dictionary must be a dictionary',
                { context: { type: value && value.type } });
        }

        /**
         * Type an OPI version dictionary (`version` `'1.3'` or `'2.0'`, a
         * key of `OPI_KEYS`): one field per key of its list, named after
         * the key in lower case (`CropRect` → `croprect`), present only
         * when the key is; the other keys in `_extras`.
         */
        function typeOpiDict(dict, version) {
            if (typeof version !== 'string' || !Object.prototype.hasOwnProperty.call(OPI_TYPES, version)) {
                throw new ContractError('pdf/extra/pdfx/opi/version',
                    "version must be '1.3' or '2.0'",
                    { context: { version } });
            }
            if (!isType(dict, 'dict')) throw opiNotDict(dict);
            const types = OPI_TYPES[version];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = opiValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        /**
         * Type an `/OPI` dictionary: `version13` and `version20`, its
         * version dictionaries typed (`typeOpiDict`), present only when the
         * key `1.3` / `2.0` is; the other keys in `_extras`.
         */
        function typeOpi(dict) {
            if (!isType(dict, 'dict')) throw opiNotDict(dict);
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (k !== '1.3' && k !== '2.0') { out._extras[k] = v; continue; }
                const field = k === '1.3' ? 'version13' : 'version20';
                if (isType(v, 'ref')) out[field] = v;
                else out[field] = isType(v, 'dict') ? typeOpiDict(v, k) : null;
            }
            return out;
        }

        const PREPRESS_PART_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (isType(v, 'int') || isType(v, 'real') ? v.value : undefined),
            int: (v) => (isType(v, 'int') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined),
            stream: (v) => (isType(v, 'stream') ? v : undefined)
        });
        // A key's value by the first of its types that fits; a reference
        // as read; null when none fits.
        function prepressPartValue(type, v) {
            if (isType(v, 'ref')) return v;
            for (const t of type.split('|')) {
                const r = PREPRESS_PART_READ[t](v);
                if (r !== undefined) return r;
            }
            return null;
        }
        // The prepress dictionaries: per kind, the keys and their types (the
        // Arlington PDF Model's).
        const PREPRESS_PART_TYPES = Object.freeze({
            separation: keyTypes('Pages:array DeviceColorant:name|string ColorSpace:array'),
            boxColorInfo: keyTypes('CropBox:dict BleedBox:dict TrimBox:dict ArtBox:dict'),
            boxStyle: keyTypes('C:array W:num S:name D:array'),
            trapRegion: keyTypes('TP:name TZ:array'),
            outputProfileRef: keyTypes('CheckSum:string ColorantTable:array ICCVersion:string ProfileCS:string ProfileName:string URLs:array')
        });
        const PREPRESS_PART_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(PREPRESS_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type a separation dictionary (`kind` `separation`), a page's box
         * colour information (`boxColorInfo`) or box style (`boxStyle`), a
         * trap network region (`trapRegion`) or an output intent's
         * destination profile reference (`outputProfileRef`): one field per
         * key of its list, named after the key in lower case, present only
         * when the key is; the other keys in `_extras`.
         */
        function typePrepressPart(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(PREPRESS_PART_TYPES, kind)) {
                throw new ContractError('pdf/extra/pdfx/part/kind',
                    `kind must be one of ${Object.keys(PREPRESS_PART_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pdfx/part/not-dict',
                    'a prepress dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = PREPRESS_PART_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = prepressPartValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        return {
            typePdfXOutputIntent,
            lintPdfXPage,
            typeOpi,
            typeOpiDict,
            OPI_KEYS,
            typePrepressPart,
            PREPRESS_PART_KEYS,
            PDFX_PROFILES,
            COLOR_POLICY
        };
    }
};

