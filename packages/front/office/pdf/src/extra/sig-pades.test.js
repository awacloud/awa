// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSigPades } from './sig-pades.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const {
    detectPadesProfile, typeReferenceArray, typeDSS, SIG_SUBFILTERS,
    validateDocMdp, validateBLtaChain
} = pdfSigPades.factory(_errors, _parserObj);
function bytes(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }

describe('detectPadesProfile', () => {
    test('B-B baseline', () => {
        const r = detectPadesProfile(obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') }));
        expect(r.isPades).toBe(true);
        expect(r.level).toBe('B-B');
    });
    test('B-T via doc timestamp', () => {
        const r = detectPadesProfile(
            obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') }),
            { hasSignatureTimestamp: true }
        );
        expect(r.level).toBe('B-T');
    });
    test('B-LT via dss', () => {
        const r = detectPadesProfile(
            obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') }),
            { dss: {} }
        );
        expect(r.level).toBe('B-LT');
    });
    test('B-LTA', () => {
        const r = detectPadesProfile(
            obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') }),
            { dss: {}, hasDocTimestampOverDss: true }
        );
        expect(r.level).toBe('B-LTA');
    });
    test('RFC3161 doc-timestamp', () => {
        const r = detectPadesProfile(obj.dict({ SubFilter: obj.name('ETSI.RFC3161') }));
        expect(r.isPades).toBe(true);
        expect(r.hasTimestamp).toBe(true);
    });
    test('non-PAdES adbe.pkcs7.detached', () => {
        const r = detectPadesProfile(obj.dict({ SubFilter: obj.name('adbe.pkcs7.detached') }));
        expect(r.isPades).toBe(false);
        expect(r.level).toBe(null);
    });
    test('rejects non-dict', () => {
        expect(() => detectPadesProfile(obj.array([]))).toThrow(ParseError);
    });
});

describe('typeReferenceArray', () => {
    test('minimal', () => {
        const a = obj.array([
            obj.dict({
                Type: obj.name('SigRef'),
                TransformMethod: obj.name('DocMDP'),
                TransformParams: obj.dict({ P: obj.int(1) }),
                DigestMethod: obj.name('SHA256')
            })
        ]);
        const r = typeReferenceArray(a);
        expect(r.length).toBe(1);
        expect(r[0].transformMethod).toBe('DocMDP');
        expect(r[0].digestMethod).toBe('SHA256');
    });
    test('malformed throws', () => {
        expect(() => typeReferenceArray(obj.int(1))).toThrow(ParseError);
        expect(() => typeReferenceArray(obj.array([obj.int(1)]))).toThrow(ParseError);
        expect(() => typeReferenceArray(obj.array([
            obj.dict({ Type: obj.name('BadType') })
        ]))).toThrow(ParseError);
    });
});

describe('typeDSS', () => {
    test('minimal', () => {
        const d = obj.dict({ Type: obj.name('DSS') });
        const r = typeDSS(d);
        expect(r.certs).toBe(null);
        expect(r._extras).toEqual({});
    });
    test('with Certs/CRLs/OCSPs/VRI + extras', () => {
        const vri = obj.dict({
            ABC1234: obj.dict({
                Cert: obj.array([obj.ref(1, 0)]),
                CRL:  obj.array([obj.ref(2, 0)]),
                OCSP: obj.array([obj.ref(3, 0)]),
                TU:   obj.string(bytes('D:20240101'))
            })
        });
        const d = obj.dict({
            Type: obj.name('DSS'),
            Certs: obj.array([obj.ref(10, 0)]),
            CRLs:  obj.array([obj.ref(11, 0)]),
            OCSPs: obj.array([obj.ref(12, 0)]),
            VRI:   vri,
            Vendor: obj.int(7)
        });
        const r = typeDSS(d);
        expect(r.certs.length).toBe(1);
        expect(r.vri.ABC1234.cert.length).toBe(1);
        expect(r._extras.Vendor.value).toBe(7);
    });
    test('malformed throws', () => {
        expect(() => typeDSS(obj.int(1))).toThrow(ParseError);
        expect(() => typeDSS(obj.dict({ Type: obj.name('Other') }))).toThrow(ParseError);
        expect(() => typeDSS(obj.dict({ Certs: obj.int(1) }))).toThrow(ParseError);
    });
});

describe('SIG_SUBFILTERS', () => {
    test('catalog', () => {
        expect(Object.isFrozen(SIG_SUBFILTERS)).toBe(true);
        expect(SIG_SUBFILTERS['ETSI.CAdES.detached'].pades).toBe(true);
    });
});

describe('validateDocMdp', () => {
    test('accepts a P=2 reference and defaults level when /P omitted',
        () => {
            const ref = typeReferenceArray(obj.array([
                obj.dict({
                    Type: obj.name('SigRef'),
                    TransformMethod: obj.name('DocMDP'),
                    TransformParams: obj.dict({ V: obj.name('1.2') }),
                    DigestMethod: obj.name('SHA256')
                })
            ]))[0];
            const r = validateDocMdp(ref);
            expect(r.valid).toBe(true);
            expect(r.level).toBe(2);
        });

    test('rejects /P outside 1..3', () => {
        const ref = typeReferenceArray(obj.array([
            obj.dict({
                Type: obj.name('SigRef'),
                TransformMethod: obj.name('DocMDP'),
                TransformParams: obj.dict({ P: obj.int(7) }),
                DigestMethod: obj.name('SHA256')
            })
        ]))[0];
        const r = validateDocMdp(ref);
        expect(r.valid).toBe(false);
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/extra/pades/mdp/bad-p-value');
    });

    test('rejects wrong transformMethod', () => {
        const r = validateDocMdp({ transformMethod: 'UR3',
                                   transformParams: null });
        expect(r.valid).toBe(false);
    });

    test('flags missing /DigestMethod', () => {
        const ref = typeReferenceArray(obj.array([
            obj.dict({
                Type: obj.name('SigRef'),
                TransformMethod: obj.name('DocMDP'),
                TransformParams: obj.dict({ P: obj.int(1) })
            })
        ]))[0];
        const r = validateDocMdp(ref);
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/extra/pades/mdp/missing-digest');
    });

    test('flags missing /TransformParams', () => {
        const r = validateDocMdp({ transformMethod: 'DocMDP',
                                   transformParams: null });
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain('pdf/extra/pades/mdp/missing-params');
    });
});

describe('validateBLtaChain', () => {
    test('reconstructs DSS → DocTimeStamp → DSS progression', () => {
        // Step 0 : initial CAdES signature → B-B.
        // Step 1 : same signature seen after DSS attached → B-LT.
        // Step 2 : doc-timestamp over DSS → B-LTA.
        const cades = obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') });
        const dts   = obj.dict({ SubFilter: obj.name('ETSI.RFC3161') });
        const r = validateBLtaChain([
            { sigDict: cades },
            { sigDict: cades, hasDss: true },
            { sigDict: dts,   hasDss: true, hasDocTimestamp: true }
        ]);
        expect(r.trace[0].level).toBe('B-B');
        expect(r.trace[1].level).toBe('B-LT');
        expect(r.trace[2].level).toBe('B-LTA');
        expect(r.chainLevel).toBe('B-LTA');
    });

    test('reconstructs DSS chain across two LTA refreshes (Item #2)', () => {
        // E2E DSS reconstruction over a 5-step revision history:
        //   step 0 : initial CAdES   → B-B
        //   step 1 : DSS attached    → B-LT
        //   step 2 : DocTimeStamp #1 → B-LTA   (first LTA archival timestamp)
        //   step 3 : DSS refreshed   → still B-LTA (DSS carries forward)
        //   step 4 : DocTimeStamp #2 → B-LTA   (second LTA archival)
        //
        // Asserts that the per-step level dispatch + chainLevel terminal
        // bubble-up both behave as expected across the full sequence.
        const cades = obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') });
        const dts   = obj.dict({ SubFilter: obj.name('ETSI.RFC3161') });
        const r = validateBLtaChain([
            { sigDict: cades },                                       // B-B
            { sigDict: cades, hasDss: true },                         // B-LT
            { sigDict: dts,   hasDss: true, hasDocTimestamp: true },  // B-LTA #1
            { sigDict: dts,   hasDss: true, hasDocTimestamp: true },  // DSS refresh
            { sigDict: dts,   hasDss: true, hasDocTimestamp: true }   // B-LTA #2
        ]);
        expect(r.trace.length).toBe(5);
        expect(r.trace[0].level).toBe('B-B');
        expect(r.trace[1].level).toBe('B-LT');
        expect(r.trace[2].level).toBe('B-LTA');
        expect(r.trace[3].level).toBe('B-LTA');
        expect(r.trace[4].level).toBe('B-LTA');
        expect(r.chainLevel).toBe('B-LTA');
        // Each LTA step must carry both DSS and DocTimestamp markers.
        for (let i = 2; i < r.trace.length; i++) {
            expect(r.trace[i].level).toBe('B-LTA');
        }
    });

    test('returns chainLevel from last step', () => {
        const cades = obj.dict({ SubFilter: obj.name('ETSI.CAdES.detached') });
        const r = validateBLtaChain([
            { sigDict: cades, hasSignatureTimestamp: true }
        ]);
        expect(r.chainLevel).toBe('B-T');
    });

    test('rejects bad input', () => {
        expect(() => validateBLtaChain(null)).toThrow(ParseError);
        expect(() => validateBLtaChain([{}])).toThrow(ParseError);
    });
});

describe('factory', () => {
    test('shape', () => {
        expect(pdfSigPades.name).toBe('pdfSigPades');
        expect(pdfSigPades.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfSigPades.factory.toString()).toContain('function');
        const api = pdfSigPades.factory(_pdfErrors_TD1, {});
        expect(typeof api.detectPadesProfile).toBe('function');
    });
});
