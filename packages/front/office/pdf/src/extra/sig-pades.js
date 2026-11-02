// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PAdES (ETSI EN 319 142-1) profile detection
 * for signature dicts, `/Reference` array typing, and DSS (Document
 * Security Store) dict typing per ISO 32000-2:2020 §12.8.4.3, the
 * signature field and certificate seed values (`typeSeedValue`), one VRI
 * entry (`typeVRIEntry`), and the signature build properties and data
 * (`typeBuildProperties`, `typeBuildData`).
 *
 * @module pdf/extra/sig-pades
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfSigPades = {
    name: 'pdfSigPades',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError, ContractError } = errors;
        const { isType } = parser;

        /** Frozen catalog of recognized signature SubFilter names. */
        const SIG_SUBFILTERS = Object.freeze({
            'adbe.x509.rsa_sha1':    { pades: false, kind: 'legacy' },
            'adbe.pkcs7.sha1':       { pades: false, kind: 'legacy' },
            'adbe.pkcs7.detached':   { pades: false, kind: 'pkcs7-detached' },
            'ETSI.CAdES.detached':   { pades: true,  kind: 'pades-cades' },
            'ETSI.RFC3161':          { pades: true,  kind: 'doc-timestamp' }
        });

        function detectPadesProfile(sigDict, ctx) {
            if (!isType(sigDict, 'dict')) {
                throw new ParseError('pdf/extra/pades/not-dict',
                    'signature dict must be a dictionary',
                    { context: { type: sigDict && sigDict.type } });
            }
            const e = sigDict.entries;
            const sf = isType(e.SubFilter, 'name') ? e.SubFilter.value : null;
            const info = sf ? SIG_SUBFILTERS[sf] : null;
            const isPades = !!(info && info.pades);
            const hasTimestamp = !!(
                sf === 'ETSI.RFC3161' ||
                (e.M && isType(e.M, 'string')) ||
                (ctx && ctx.hasSignatureTimestamp)
            );
            let level = null;
            if (isPades) {
                const hasDss = !!(ctx && ctx.dss);
                const ltaTs = !!(ctx && ctx.hasDocTimestampOverDss);
                if (ltaTs)        level = 'B-LTA';
                else if (hasDss)  level = 'B-LT';
                else if (hasTimestamp) level = 'B-T';
                else              level = 'B-B';
            }
            return { subFilter: sf, isPades, level, hasTimestamp };
        }

        function typeReferenceArray(arr) {
            if (!isType(arr, 'array')) {
                throw new ParseError('pdf/extra/pades/bad-reference',
                    '/Reference must be an array',
                    { context: { type: arr && arr.type } });
            }
            const out = [];
            for (const it of arr.items) {
                if (!isType(it, 'dict')) {
                    throw new ParseError('pdf/extra/pades/bad-reference-item',
                        '/Reference items must be dicts');
                }
                const e = it.entries;
                if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'SigRef')) {
                    throw new ParseError('pdf/extra/pades/bad-reference-type',
                        '/Type of /Reference item must be /SigRef',
                        { context: { actual: e.Type.value } });
                }
                out.push({
                    transformMethod: isType(e.TransformMethod, 'name') ? e.TransformMethod.value : null,
                    transformParams: isType(e.TransformParams, 'dict') ? e.TransformParams : null,
                    data:            e.Data || null,
                    digestMethod:    isType(e.DigestMethod, 'name') ? e.DigestMethod.value : null,
                    digestValue:     isType(e.DigestValue, 'string') ? e.DigestValue.value : null,
                    digestLocation:  isType(e.DigestLocation, 'array') ? e.DigestLocation : null,
                    raw:             it
                });
            }
            return out;
        }

        function typeDSS(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pades/dss-not-dict',
                    'DSS must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'DSS')) {
                throw new ParseError('pdf/extra/pades/dss-bad-type',
                    '/Type of DSS dict must be /DSS',
                    { context: { actual: e.Type.value } });
            }
            const out = {
                certs:   refsArray(e.Certs, 'DSS /Certs'),
                crls:    refsArray(e.CRLs,  'DSS /CRLs'),
                ocsps:   refsArray(e.OCSPs, 'DSS /OCSPs'),
                vri:     isType(e.VRI, 'dict') ? typeVRI(e.VRI) : null,
                raw:     dict,
                _extras: {}
            };
            const known = new Set(['Type', 'Certs', 'CRLs', 'OCSPs', 'VRI']);
            for (const k of Object.keys(e)) if (!known.has(k)) out._extras[k] = e[k];
            return out;
        }

        function typeVRI(dict) {
            const out = {};
            for (const k of Object.keys(dict.entries)) {
                const v = dict.entries[k];
                if (!isType(v, 'dict')) continue;
                const ve = v.entries;
                out[k] = {
                    cert:  refsArray(ve.Cert,  'VRI /Cert'),
                    crl:   refsArray(ve.CRL,   'VRI /CRL'),
                    ocsp:  refsArray(ve.OCSP,  'VRI /OCSP'),
                    tu:    isType(ve.TU, 'string') ? ve.TU.value : null,
                    ts:    ve.TS || null
                };
            }
            return out;
        }

        function refsArray(v, ctxLabel) {
            if (!v) return null;
            if (!isType(v, 'array')) {
                throw new ParseError('pdf/extra/pades/dss-bad-array',
                    `${ctxLabel} must be an array`,
                    { context: { type: v.type } });
            }
            return v.items;
        }

        function validateDocMdp(ref) {
            const issues = [];
            if (!ref || ref.transformMethod !== 'DocMDP') {
                issues.push({
                    code: 'pdf/extra/pades/mdp/wrong-transform',
                    message: 'reference is not a DocMDP transform',
                    context: { transformMethod: ref && ref.transformMethod }
                });
                return { valid: false, level: null, issues };
            }
            if (!ref.transformParams || !isType(ref.transformParams, 'dict')) {
                issues.push({
                    code: 'pdf/extra/pades/mdp/missing-params',
                    message: 'DocMDP missing /TransformParams dict'
                });
                return { valid: false, level: null, issues };
            }
            const params = ref.transformParams.entries;
            let level = null;
            if (params.P) {
                if (params.P.type !== 'int') {
                    issues.push({
                        code: 'pdf/extra/pades/mdp/bad-p-type',
                        message: '/P must be an integer',
                        context: { type: params.P.type }
                    });
                } else if (params.P.value < 1 || params.P.value > 3) {
                    issues.push({
                        code: 'pdf/extra/pades/mdp/bad-p-value',
                        message: '/P must be 1, 2 or 3',
                        context: { value: params.P.value }
                    });
                } else {
                    level = params.P.value;
                }
            } else {
                level = 2;
            }
            if (params.V && params.V.type === 'name'
                && params.V.value !== '1.2'
                && params.V.value !== '2.2') {
                issues.push({
                    code: 'pdf/extra/pades/mdp/bad-version',
                    message: 'unknown DocMDP /V',
                    context: { v: params.V.value }
                });
            }
            if (!ref.digestMethod) {
                issues.push({
                    code: 'pdf/extra/pades/mdp/missing-digest',
                    message: 'DocMDP reference missing /DigestMethod'
                });
            }
            return { valid: issues.length === 0, level, issues };
        }

        function validateBLtaChain(steps) {
            if (!Array.isArray(steps)) {
                throw new ParseError('pdf/extra/pades/chain/bad-input',
                    'validateBLtaChain expects an array of steps',
                    { context: { type: typeof steps } });
            }
            const trace = [];
            let sawDss = false;
            let sawDocTsOverDss = false;
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                if (!step || !step.sigDict) {
                    throw new ParseError('pdf/extra/pades/chain/missing-sig',
                        'step missing sigDict',
                        { context: { index: i } });
                }
                if (step.hasDss) sawDss = true;
                if (step.hasDocTimestamp && sawDss) sawDocTsOverDss = true;
                const ctx = {
                    dss: sawDss ? {} : undefined,
                    hasDocTimestampOverDss: sawDocTsOverDss,
                    hasSignatureTimestamp: !!step.hasSignatureTimestamp
                };
                const detected = detectPadesProfile(step.sigDict, ctx);
                trace.push({ index: i, level: detected.level,
                             isPades: detected.isPades });
            }
            const last = trace[trace.length - 1];
            return { chainLevel: last ? last.level : null, trace };
        }

        const isRefV = (v) => isType(v, 'ref');
        const KEY_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (isType(v, 'int') || isType(v, 'real') ? v.value : undefined),
            int: (v) => (isType(v, 'int') ? v.value : undefined),
            bool: (v) => (isType(v, 'bool') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined),
            stream: (v) => (isType(v, 'stream') ? v : undefined)
        });
        // A key's value by the first of its types that fits; a reference
        // as read; null when none fits.
        function keyValue(type, v) {
            if (isRefV(v)) return v;
            for (const t of type.split('|')) {
                const r = KEY_READ[t](v);
                if (r !== undefined) return r;
            }
            return null;
        }
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const keysOf = (table) => Object.freeze(Object.fromEntries(
            Object.entries(table).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        // The seed values: per kind, the keys and their types (the
        // Arlington PDF Model's), as `Key:type` pairs apart by a space.
        const SEED_VALUE_TYPES = Object.freeze({
            field: keyTypes('Type:name Ff:int Filter:name SubFilter:array DigestMethod:array V:int Cert:dict '
                + 'Reasons:array MDP:dict TimeStamp:dict LegalAttestation:array AddRevInfo:bool LockDocument:name '
                + 'AppearanceFilter:string'),
            cert: keyTypes('Type:name Ff:int Subject:array SignaturePolicyOID:string SignaturePolicyHashValue:string '
                + 'SignaturePolicyHashAlgorithm:name SignaturePolicyCommitmentType:array SubjectDN:array KeyUsage:array '
                + 'Issuer:array OID:array URL:string URLType:name'),
            mdp: keyTypes('P:int'),
            timeStamp: keyTypes('URL:string Ff:int')
        });
        const SEED_VALUE_KEYS = keysOf(SEED_VALUE_TYPES);

        /**
         * Type a seed value dictionary, `kind` `field` (a signature
         * field's `/SV`), `cert` (its `/Cert`), `mdp` (its `/MDP`) or
         * `timeStamp` (its `/TimeStamp`): one field per key of its list,
         * named after the key in lower case
         * (`SignaturePolicyOID` → `signaturepolicyoid`), present only when
         * the key is; the other keys in `_extras`.
         */
        function typeSeedValue(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(SEED_VALUE_TYPES, kind)) {
                throw new ContractError('pdf/extra/pades/seed/kind',
                    'kind must be field, cert, mdp or timeStamp',
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pades/seed/not-dict',
                    'a seed value must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = SEED_VALUE_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // One entry of the DSS's VRI dictionary: its keys and their types.
        const VRI_ENTRY_TYPES = keyTypes('Type:name Cert:array CRL:array OCSP:array TU:string TS:stream');

        /**
         * Type one VRI entry (a value of the DSS's `/VRI`): `type`, `cert`,
         * `crl`, `ocsp`, `tu`, `ts`, named after the key in lower case,
         * present only when the key is; the other keys in `_extras`.
         */
        function typeVRIEntry(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/pades/vri/not-dict',
                    'a VRI entry must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(VRI_ENTRY_TYPES, k)) out[k.toLowerCase()] = keyValue(VRI_ENTRY_TYPES[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The signature build data: per kind, the keys and their types.
        const BUILD_COMMON = 'Name:name Date:string R:num PreRelease:bool OS:array NonEFontNoWarn:bool TrustedMode:bool V:num';
        const BUILD_DATA_TYPES = Object.freeze({
            data: keyTypes(BUILD_COMMON),
            app: keyTypes(`${BUILD_COMMON} REx:string`),
            sigQ: keyTypes(`${BUILD_COMMON} Preview:bool`)
        });
        const BUILD_DATA_KEYS = keysOf(BUILD_DATA_TYPES);
        // The build properties: each entry and the kind of its data.
        const BUILD_PROPERTIES = Object.freeze([['Filter', 'filter', 'data'], ['PubSec', 'pubSec', 'data'],
            ['App', 'app', 'app'], ['SigQ', 'sigQ', 'sigQ']]);

        function buildNotDict(value) {
            return new ParseError('pdf/extra/pades/build/not-dict',
                'signature build data must be a dictionary',
                { context: { type: value && value.type } });
        }

        /**
         * Type a signature build data dictionary, `kind` `data` (a `Filter`
         * or `PubSec` entry), `app` or `sigQ`: one field per key of its
         * list, named after the key in lower case (`PreRelease` →
         * `prerelease`), present only when the key is; the other keys in
         * `_extras`.
         */
        function typeBuildData(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(BUILD_DATA_TYPES, kind)) {
                throw new ContractError('pdf/extra/pades/build/kind',
                    'kind must be data, app or sigQ',
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) throw buildNotDict(dict);
            const types = BUILD_DATA_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        /**
         * Type a signature's build properties (`/Prop_Build`): `filter`,
         * `pubSec`, `app`, `sigQ`, each typed by `typeBuildData` (a
         * reference as read, `null` for a non-dictionary), present only
         * when the key is; the other keys in `_extras`.
         */
        function typeBuildProperties(dict) {
            if (!isType(dict, 'dict')) throw buildNotDict(dict);
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            const known = new Set();
            for (const [key, field, kind] of BUILD_PROPERTIES) {
                known.add(key);
                if (e[key] === undefined) continue;
                const v = e[key];
                out[field] = isType(v, 'ref') ? v : (isType(v, 'dict') ? typeBuildData(v, kind) : null);
            }
            for (const k of Object.keys(e)) if (!known.has(k)) out._extras[k] = e[k];
            return out;
        }

        return {
            detectPadesProfile,
            typeReferenceArray,
            typeDSS,
            typeVRIEntry,
            validateDocMdp,
            validateBLtaChain,
            typeSeedValue,
            SEED_VALUE_KEYS,
            typeBuildData,
            typeBuildProperties,
            BUILD_DATA_KEYS,
            SIG_SUBFILTERS
        };
    }
};

