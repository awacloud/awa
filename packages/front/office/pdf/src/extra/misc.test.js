// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfParserObj } from '../syntax/parser-obj.js';
const { obj } = pdfParserObj.factory();
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfMisc } from './misc.js';

const u8 = (s) => new TextEncoder().encode(s);
const m = pdfMisc.factory(_pdfErrors_TD1);

describe('extra/misc — SpiderInfo', () => {
    test('reads /V and /C', () => {
        const r = m.typeSpiderInfo(obj.dict({
            V: obj.real(1.2),
            C: obj.array([obj.dict({})])
        }));
        expect(r.version).toBe(1.2);
        expect(r.commands.length).toBe(1);
    });
    test('preserves _extras', () => {
        const r = m.typeSpiderInfo(obj.dict({ X: obj.int(1) }));
        expect(r._extras.X.value).toBe(1);
    });
    test('rejects non-dict', () => {
        expect(() => m.typeSpiderInfo(obj.array([]))).toThrow(ParseError);
    });
});

describe('extra/misc — Threads', () => {
    test('accepts refs and dicts', () => {
        const r = m.typeThreads(obj.array([obj.ref(1, 0), obj.dict({})]));
        expect(r.length).toBe(2);
    });
    test('rejects non-array', () => {
        expect(() => m.typeThreads(obj.dict({}))).toThrow(ParseError);
    });
    test('rejects bad entry', () => {
        expect(() => m.typeThreads(obj.array([obj.int(1)]))).toThrow(ParseError);
    });
});

describe('extra/misc — Legal', () => {
    test('reads flags + attestation', () => {
        const r = m.typeLegal(obj.dict({
            JavaScriptActions: obj.int(3),
            Attestation: obj.string(u8('legit'))
        }));
        expect(r.flags.JavaScriptActions).toBe(3);
        expect(r.attestation).toBeInstanceOf(Uint8Array);
    });
    test('rejects bad flag type', () => {
        expect(() => m.typeLegal(obj.dict({ JavaScriptActions: obj.name('x') }))).toThrow(ParseError);
    });
    test('preserves unknown', () => {
        const r = m.typeLegal(obj.dict({ Unknown: obj.int(1) }));
        expect(r._extras.Unknown.value).toBe(1);
    });
});

describe('extra/misc — Requirements', () => {
    test('typed list with standard /S', () => {
        const r = m.typeRequirements(obj.array([
            obj.dict({ S: obj.name('EnableJavaScripts') })
        ]));
        expect(r[0].s).toBe('EnableJavaScripts');
        expect(r[0].standard).toBe(true);
    });
    test('rejects missing /S', () => {
        expect(() => m.typeRequirements(obj.array([obj.dict({})]))).toThrow(ParseError);
    });
    test('rejects non-array', () => {
        expect(() => m.typeRequirements(obj.dict({}))).toThrow(ParseError);
    });
});

describe('extra/misc — DocMDP + Perms', () => {
    test('DocMDP /P range', () => {
        const r = m.typeDocMdpParams(obj.dict({ P: obj.int(2), V: obj.name('1.2') }));
        expect(r.permission).toBe(2);
        expect(r.version).toBe('1.2');
    });
    test('rejects bad /P', () => {
        expect(() => m.typeDocMdpParams(obj.dict({ P: obj.int(9) }))).toThrow(ParseError);
    });
    test('Perms reads DocMDP, UR3, unknown', () => {
        const r = m.typePerms(obj.dict({
            DocMDP: obj.dict({}),
            UR3:    obj.dict({}),
            Foo:    obj.int(1)
        }));
        expect(r.docMDP).toBeDefined();
        expect(r.ur3).toBeDefined();
        expect(r._extras.Foo.value).toBe(1);
    });
});

describe('extra/misc — NeedsRendering', () => {
    test('returns boolean', () => {
        expect(m.typeNeedsRendering(obj.bool(true))).toBe(true);
        expect(m.typeNeedsRendering(obj.bool(false))).toBe(false);
    });
    test('rejects non-bool', () => {
        expect(() => m.typeNeedsRendering(obj.int(1))).toThrow(ParseError);
    });
});

describe('extra/misc — factory', () => {
    test('factory shape', () => {
        expect(pdfMisc.name).toBe('pdfMisc');
        expect(pdfMisc.dependencies).toEqual(['pdfErrors']);
        expect(pdfMisc.factory.toString()).toContain('function');
    });
});

const codeOfMisc = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('extra/misc — malformed input', () => {
    test('/SpiderInfo /V must be numeric and /C an array', () => {
        expect(codeOfMisc(() => m.typeSpiderInfo(obj.dict({ V: obj.name('1.0') }))))
            .toBe('pdf/misc/spider-bad-V');
        // Both int and real are accepted for /V.
        expect(m.typeSpiderInfo(obj.dict({ V: obj.int(1) })).version).toBe(1);
        expect(m.typeSpiderInfo(obj.dict({ V: obj.real(1.5) })).version).toBe(1.5);
        expect(codeOfMisc(() => m.typeSpiderInfo(obj.dict({ C: obj.dict({}) }))))
            .toBe('pdf/misc/spider-bad-C');
        expect(m.typeSpiderInfo(obj.dict({ C: obj.array([obj.int(1)]) })).commands.length)
            .toBe(1);
    });

    test('/Legal must be a dict, and /Attestation a string', () => {
        expect(codeOfMisc(() => m.typeLegal(obj.array([])))).toBe('pdf/misc/legal-not-dict');
        expect(codeOfMisc(() => m.typeLegal(obj.dict({ Attestation: obj.int(1) }))))
            .toBe('pdf/misc/legal-bad-attestation');
        const ok = m.typeLegal(obj.dict({
            Attestation: obj.string(u8('signed')),
            JavaScriptActions: obj.int(2),
            Whatever: obj.int(9)
        }));
        expect(ok.attestation).toBeInstanceOf(Uint8Array);
        expect(ok.flags.JavaScriptActions).toBe(2);
        expect(ok._extras.Whatever.value).toBe(9);
    });

    test('/Requirements entries must be dicts, and the index is reported', () => {
        const e = (() => {
            try {
                m.typeRequirements(obj.array([
                    obj.dict({ S: obj.name('EnableJavaScripts') }), obj.int(2)
                ]));
            } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(ParseError);
        expect(e.code).toBe('pdf/misc/req-bad-entry');
        expect(e.context.index).toBe(1);
    });

    test('/DocMDP transform params must be a dict with a /Name version', () => {
        expect(codeOfMisc(() => m.typeDocMdpParams(obj.array([]))))
            .toBe('pdf/misc/docmdp-not-dict');
        expect(codeOfMisc(() => m.typeDocMdpParams(obj.dict({ V: obj.int(1) }))))
            .toBe('pdf/misc/docmdp-bad-V');
        expect(m.typeDocMdpParams(obj.dict({ V: obj.name('1.2') })).version).toBe('1.2');
    });

    test('/Perms must be a dict', () => {
        expect(codeOfMisc(() => m.typePerms(obj.array([]))))
            .toBe('pdf/misc/perms-not-dict');
    });
});
