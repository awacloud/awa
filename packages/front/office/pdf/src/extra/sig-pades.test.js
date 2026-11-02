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

describe('typeSeedValue (signature field and certificate seed values)', () => {
    const { typeSeedValue, SEED_VALUE_KEYS } = pdfSigPades.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const u8 = (s) => new TextEncoder().encode(s);

    test('a field seed value: each key by its value or as read, the rest in _extras', () => {
        const d = obj.dict({
            Type: obj.name('SV'), Ff: obj.int(7), Filter: obj.name('Adobe.PPKLite'), SubFilter: obj.array([]),
            V: obj.int(2), Cert: obj.dict({}), MDP: obj.ref(4, 0), AddRevInfo: obj.bool(true),
            LockDocument: obj.name('auto'), AppearanceFilter: obj.string(u8('a1')), Foo: obj.int(1)
        });
        const r = typeSeedValue(d, 'field');
        expect([r.type, r.ff, r.filter, r.v, r.addrevinfo, r.lockdocument]).toEqual(['SV', 7, 'Adobe.PPKLite', 2, true, 'auto']);
        expect([r.subfilter.type, r.cert.type, r.mdp.type]).toEqual(['array', 'dict', 'ref']);
        expect(r.appearancefilter).toEqual(u8('a1'));
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
    });

    test('a certificate seed value: the signature-policy keys, a wrong type null', () => {
        const r = typeSeedValue(obj.dict({
            Type: obj.name('SVCert'), Ff: obj.int(1), SignaturePolicyOID: obj.string(u8('1.2.3')),
            SignaturePolicyHashAlgorithm: obj.name('SHA256'), KeyUsage: obj.array([]), URL: obj.string(u8('https://ca')),
            URLType: obj.name('Browser'), V: obj.int(1)
        }), 'cert');
        expect([r.type, r.ff, r.signaturepolicyhashalgorithm, r.urltype]).toEqual(['SVCert', 1, 'SHA256', 'Browser']);
        expect([r.signaturepolicyoid, r.url]).toEqual([u8('1.2.3'), u8('https://ca')]);
        expect(r._extras).toEqual({ V: obj.int(1) });
        expect(typeSeedValue(obj.dict({ Ff: obj.real(1.5) }), 'cert').ff).toBe(null);
    });

    test('every kind of SEED_VALUE_KEYS types every key of its list', () => {
        expect(Object.isFrozen(SEED_VALUE_KEYS)).toBe(true);
        expect(Object.keys(SEED_VALUE_KEYS).sort()).toEqual(['cert', 'field', 'mdp', 'timeStamp']);
        for (const [kind, keys] of Object.entries(SEED_VALUE_KEYS)) {
            expect(keys.length).toBe({ field: 14, cert: 13, mdp: 1, timeStamp: 2 }[kind]);
            const entries = {};
            for (const k of keys) entries[k] = obj.ref(1, 0);
            expect(typeSeedValue(obj.dict(entries), kind)._extras).toEqual({});
        }
    });

    test('a non-dictionary throws ParseError, an unknown kind ContractError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeSeedValue(obj.array([]), 'field'))).toEqual([ParseError.name, 'pdf/extra/pades/seed/not-dict']);
        expect(code(() => typeSeedValue(obj.dict({}), 'timestamp'))).toEqual([ContractError.name, 'pdf/extra/pades/seed/kind']);
    });

    test('the seed value MDP and time stamp dictionaries (A40a)', () => {
        const mdp = typeSeedValue(obj.dict({ P: obj.int(2), Foo: obj.int(1) }), 'mdp');
        expect([mdp.p, mdp._extras]).toEqual([2, { Foo: obj.int(1) }]);
        const ts = typeSeedValue(obj.dict({ URL: obj.string(u8('https://tsa')), Ff: obj.int(1) }), 'timeStamp');
        expect([ts.url, ts.ff, ts._extras]).toEqual([u8('https://tsa'), 1, {}]);
        expect(typeSeedValue(obj.dict({ P: obj.name('x') }), 'mdp').p).toBe(null);
    });
});

describe('typeVRIEntry (A40a)', () => {
    const { typeVRIEntry } = pdfSigPades.factory(_errors, _parserObj);
    const u8 = (s) => new TextEncoder().encode(s);

    test('one VRI entry: each key by its value or as read, the rest in _extras', () => {
        const ts = obj.ref(9, 0);
        const d = obj.dict({ Type: obj.name('VRI'), Cert: obj.array([]), CRL: obj.ref(3, 0), OCSP: obj.array([]),
            TU: obj.string(u8('D:20261025')), TS: ts, Foo: obj.int(1) });
        const r = typeVRIEntry(d);
        expect([r.type, r.cert.type, r.crl.type, r.ocsp.type, r.ts]).toEqual(['VRI', 'array', 'ref', 'array', ts]);
        expect(r.tu).toEqual(u8('D:20261025'));
        expect(r._extras).toEqual({ Foo: obj.int(1) });
        expect(r.raw).toBe(d);
        const bare = typeVRIEntry(obj.dict({ Cert: obj.int(1) }));
        expect([bare.cert, 'type' in bare, 'tu' in bare]).toEqual([null, false, false]);
    });

    test('a non-dictionary throws ParseError', () => {
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeVRIEntry(obj.array([])))).toEqual([ParseError.name, 'pdf/extra/pades/vri/not-dict']);
    });
});

describe('the signature build data, the reference digests (A38e)', () => {
    const { typeBuildData, typeBuildProperties, BUILD_DATA_KEYS, typeReferenceArray: refs } = pdfSigPades.factory(_errors, _parserObj);
    const { ContractError } = _errors;
    const u8 = (s) => new TextEncoder().encode(s);

    test('build data: each key by its value or as read', () => {
        const d = typeBuildData(obj.dict({ Name: obj.name('Adobe.PPKLite'), Date: obj.string(u8('Oct 25 2026')), R: obj.int(131104),
            PreRelease: obj.bool(false), OS: obj.array([]), NonEFontNoWarn: obj.bool(true), TrustedMode: obj.bool(true), V: obj.real(2),
            REx: obj.string(u8('11.0')), Foo: obj.int(1) }), 'app');
        expect([d.name, d.r, d.prerelease, d.nonefontnowarn, d.trustedmode, d.v]).toEqual(['Adobe.PPKLite', 131104, false, true, true, 2]);
        expect([d.date, d.rex, d.os.type]).toEqual([u8('Oct 25 2026'), u8('11.0'), 'array']);
        expect(d._extras).toEqual({ Foo: obj.int(1) });
        expect(typeBuildData(obj.dict({ Preview: obj.bool(true), REx: obj.string(u8('x')) }), 'sigQ')).toMatchObject({ preview: true, _extras: { REx: obj.string(u8('x')) } });
        expect(Object.keys(BUILD_DATA_KEYS).sort()).toEqual(['app', 'data', 'sigQ']);
    });

    test('build properties: each entry typed by typeBuildData', () => {
        const p = typeBuildProperties(obj.dict({ Filter: obj.dict({ Name: obj.name('Adobe.PPKLite') }), PubSec: obj.ref(4, 0),
            App: obj.dict({ REx: obj.string(u8('9')) }), SigQ: obj.name('x') }));
        expect([p.filter.name, p.pubSec.type, p.app.rex, p.sigQ]).toEqual(['Adobe.PPKLite', 'ref', u8('9'), null]);
        const code = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };
        expect(code(() => typeBuildProperties(obj.array([])))).toEqual([ParseError.name, 'pdf/extra/pades/build/not-dict']);
        expect(code(() => typeBuildData(obj.dict({}), 'pubSec'))).toEqual([ContractError.name, 'pdf/extra/pades/build/kind']);
    });

    test('a signature reference: DigestValue, DigestLocation', () => {
        const [r] = refs(obj.array([obj.dict({ TransformMethod: obj.name('DocMDP'), DigestValue: obj.string(u8('h')), DigestLocation: obj.array([]) })]));
        expect([r.digestValue, r.digestLocation.type]).toEqual([u8('h'), 'array']);
        const [bare] = refs(obj.array([obj.dict({ TransformMethod: obj.name('DocMDP') })]));
        expect([bare.digestValue, bare.digestLocation]).toEqual([null, null]);
    });
});
