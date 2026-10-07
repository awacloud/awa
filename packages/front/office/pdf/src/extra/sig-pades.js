// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: PAdES (ETSI EN 319 142-1) profile detection
 * for signature dicts, `/Reference` array typing, and DSS (Document
 * Security Store) dict typing per ISO 32000-2:2020 §12.8.4.3.
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
        const { ParseError } = errors;
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

        return {
            detectPadesProfile,
            typeReferenceArray,
            typeDSS,
            validateDocMdp,
            validateBLtaChain,
            SIG_SUBFILTERS
        };
    }
};

