// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfSecurity } from './security.js';
import { pdfStandardV4 } from './standardV4.js';
import { pdfErrors } from '../errors.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
const errors = pdfErrors.factory();
const { EncryptionError } = errors;
const {
    typeEncryptDict, selectHandler,
    isEmbeddedFileStream, dispatchDecryptStream
} = pdfSecurity.factory(errors);
const _sec_rt = new ModuleRuntime();
_sec_rt.register(bitArray); _sec_rt.register(utf8);
_sec_rt.register(aes); _sec_rt.register(cbc);
const _v4Handler = pdfStandardV4.factory(
    errors, _sec_rt.resolve('aes'), _sec_rt.resolve('cbc'),
    _sec_rt.resolve('bitArray'));

describe('typeEncryptDict', () => {
    test('parses plain object', () => {
        const t = typeEncryptDict({
            V: 5, R: 6, Filter: 'Standard',
            Length: 256, O: new Uint8Array(48), U: new Uint8Array(48),
            OE: new Uint8Array(32), UE: new Uint8Array(32),
            Perms: new Uint8Array(16), P: -4, EncryptMetadata: true
        });
        expect(t.V).toBe(5);
        expect(t.R).toBe(6);
        expect(t.O).toBeInstanceOf(Uint8Array);
        expect(t.O.length).toBe(48);
        expect(t.EncryptMetadata).toBe(true);
    });
    test('parses Map', () => {
        const m = new Map([
            ['V', 5], ['R', 5], ['O', new Uint8Array(48)], ['U', new Uint8Array(48)]
        ]);
        const t = typeEncryptDict(m);
        expect(t.V).toBe(5);
        expect(t.raw).toBe(m);
    });
    test('coerces latin1 string to Uint8Array for O/U', () => {
        const t = typeEncryptDict({ V: 5, R: 6, O: 'ABC', U: '12' });
        expect(t.O).toBeInstanceOf(Uint8Array);
        expect(Array.from(t.O)).toEqual([65, 66, 67]);
    });
    test('rejects non-dict input', () => {
        expect(() => typeEncryptDict(null)).toThrow(EncryptionError);
        expect(() => typeEncryptDict(42)).toThrow(EncryptionError);
    });
    test('requires V and R', () => {
        expect(() => typeEncryptDict({ V: 5 })).toThrow(EncryptionError);
        expect(() => typeEncryptDict({ R: 5 })).toThrow(EncryptionError);
    });
    test('rejects non-integer V/R', () => {
        expect(() => typeEncryptDict({ V: 'x', R: 6 })).toThrow(EncryptionError);
    });
    test('EncryptMetadata defaults to true', () => {
        const t = typeEncryptDict({ V: 5, R: 6 });
        expect(t.EncryptMetadata).toBe(true);
    });
});

describe('selectHandler', () => {
    const v5 = { tag: 'v5' };
    const v6 = { tag: 'v6' };
    test('dispatches to v5', () => {
        const t = typeEncryptDict({ V: 5, R: 5 });
        const sel = selectHandler(t, { v5, v6 });
        expect(sel.handler).toBe(v5);
        expect(sel.revision).toBe(5);
    });
    test('dispatches to v6', () => {
        const t = typeEncryptDict({ V: 5, R: 6 });
        const sel = selectHandler(t, { v5, v6 });
        expect(sel.handler).toBe(v6);
        expect(sel.revision).toBe(6);
    });
    test('rejects V<4', () => {
        const t = typeEncryptDict({ V: 2, R: 3 });
        try { selectHandler(t, { v5, v6 }); throw new Error('should have thrown'); }
        catch (e) { expect(e).toBeInstanceOf(EncryptionError);
                    expect(e.code).toBe('pdf/crypto/unsupported-version'); }
    });
    test('rejects V=4 with non-R=4', () => {
        const t = typeEncryptDict({ V: 4, R: 5 });
        expect(() => selectHandler(t, { v4: {}, v5, v6 })).toThrow(EncryptionError);
    });
    test('rejects V=4 missing handler', () => {
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: { StdCF: { CFM: 'AESV2' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        expect(() => selectHandler(t, { v5, v6 })).toThrow(EncryptionError);
    });
    test('dispatches V=4 R=4 with AESV2', () => {
        const v4 = { tag: 'v4' };
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: { StdCF: { CFM: 'AESV2' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        const sel = selectHandler(t, { v4, v5, v6 });
        expect(sel.handler).toBe(v4);
        expect(sel.revision).toBe(4);
        expect(sel.method).toBe('AESV2');
    });
    test('dispatches V=4 R=4 with V2 (RC4)', () => {
        const v4 = { tag: 'v4' };
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: { StdCF: { CFM: 'V2' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        const sel = selectHandler(t, { v4, v5, v6 });
        expect(sel.method).toBe('V2');
    });
    test('rejects V=4 with bad CFM', () => {
        const v4 = { tag: 'v4' };
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: { StdCF: { CFM: 'AESV3' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        expect(() => selectHandler(t, { v4, v5, v6 })).toThrow(EncryptionError);
    });
    test('rejects unknown V', () => {
        const t = typeEncryptDict({ V: 9, R: 9 });
        expect(() => selectHandler(t, { v5, v6 })).toThrow(EncryptionError);
    });
    test('rejects unsupported R within V=5', () => {
        const t = typeEncryptDict({ V: 5, R: 7 });
        expect(() => selectHandler(t, { v5, v6 })).toThrow(EncryptionError);
    });
    test('rejects missing handler', () => {
        const t = typeEncryptDict({ V: 5, R: 6 });
        expect(() => selectHandler(t, {})).toThrow(EncryptionError);
    });
    test('rejects bad typed input', () => {
        expect(() => selectHandler(null, { v5, v6 })).toThrow(EncryptionError);
    });
});

describe('selectHandler — V=4 /EFF and V=5 /CFM dispatch', () => {
    const v4 = { tag: 'v4' };
    const v5 = { tag: 'v5' };
    const v6 = { tag: 'v6' };

    test('V=4 exposes strMethod and effMethod (distinct EFF)', () => {
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: {
                StdCF:  { CFM: 'AESV2' },
                MyEFF:  { CFM: 'V2' }
            },
            StmF: 'StdCF', StrF: 'StdCF', EFF: 'MyEFF'
        });
        const sel = selectHandler(t, { v4, v5, v6 });
        expect(sel.method).toBe('AESV2');
        expect(sel.strMethod).toBe('AESV2');
        expect(sel.effMethod).toBe('V2');
    });
    test('V=4 EFF defaults to StmF when absent', () => {
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: { StdCF: { CFM: 'AESV2' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        const sel = selectHandler(t, { v4, v5, v6 });
        expect(sel.effMethod).toBe('AESV2');
    });
    test('V=4 EFF = /Identity', () => {
        const t = typeEncryptDict({
            V: 4, R: 4,
            CF: { StdCF: { CFM: 'AESV2' } },
            StmF: 'StdCF', StrF: 'StdCF', EFF: 'Identity'
        });
        const sel = selectHandler(t, { v4, v5, v6 });
        expect(sel.effMethod).toBe('Identity');
    });
    test('V=5 R=5 absent /StmF, /StrF and /EFF take the Table 20 default Identity', () => {
        const t = typeEncryptDict({ V: 5, R: 5 });
        const sel = selectHandler(t, { v5, v6 });
        expect(sel.method).toBe('Identity');
        expect(sel.strMethod).toBe('Identity');
        expect(sel.effMethod).toBe('Identity');
    });
    test('V=5 R=5 AESV4 via /CFM', () => {
        const t = typeEncryptDict({
            V: 5, R: 5,
            CF: { StdCF: { CFM: 'AESV4' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        const sel = selectHandler(t, { v5, v6 });
        expect(sel.method).toBe('AESV4');
        expect(sel.strMethod).toBe('AESV4');
        expect(sel.effMethod).toBe('AESV4');
    });
    test('V=5 R=6 AESV4 with distinct /EFF', () => {
        const t = typeEncryptDict({
            V: 5, R: 6,
            CF: {
                StdCF: { CFM: 'AESV3' },
                GcmCF: { CFM: 'AESV4' }
            },
            StmF: 'StdCF', StrF: 'StdCF', EFF: 'GcmCF'
        });
        const sel = selectHandler(t, { v5, v6 });
        expect(sel.method).toBe('AESV3');
        expect(sel.effMethod).toBe('AESV4');
    });
    test('V=5 rejects bad /CFM', () => {
        const t = typeEncryptDict({
            V: 5, R: 5,
            CF: { StdCF: { CFM: 'V2' } },
            StmF: 'StdCF', StrF: 'StdCF'
        });
        expect(() => selectHandler(t, { v5, v6 })).toThrow(EncryptionError);
    });
});

describe('pdfSecurity module', () => {
    test('module shape', () => {
        expect(pdfSecurity.name).toBe('pdfSecurity');
        expect(pdfSecurity.dependencies).toEqual(['pdfErrors']);
        expect(pdfSecurity.factory.toString()).toContain('function');
        const m = pdfSecurity.factory(errors);
        expect(typeof m.typeEncryptDict).toBe('function');
        expect(typeof m.selectHandler).toBe('function');
        expect(typeof m.isEmbeddedFileStream).toBe('function');
        expect(typeof m.dispatchDecryptStream).toBe('function');
    });
});

describe('isEmbeddedFileStream', () => {
    test('detects /Type /EmbeddedFile via typed name entry', () => {
        const stream = {
            type: 'stream',
            dict: { type: 'dict', entries: {
                Type: { type: 'name', value: 'EmbeddedFile' }
            }},
            raw: new Uint8Array(0)
        };
        expect(isEmbeddedFileStream(stream)).toBe(true);
    });
    test('returns false for regular content stream', () => {
        const stream = {
            type: 'stream',
            dict: { type: 'dict', entries: {} },
            raw: new Uint8Array(0)
        };
        expect(isEmbeddedFileStream(stream)).toBe(false);
    });
    test('returns false for stream missing /Type', () => {
        const stream = {
            type: 'stream',
            dict: { type: 'dict', entries: {
                Subtype: { type: 'name', value: 'EmbeddedFile' }
            }},
            raw: new Uint8Array(0)
        };
        expect(isEmbeddedFileStream(stream)).toBe(false);
    });
    test('returns false for non-stream input', () => {
        expect(isEmbeddedFileStream(null)).toBe(false);
        expect(isEmbeddedFileStream({ type: 'dict' })).toBe(false);
        expect(isEmbeddedFileStream({})).toBe(false);
    });
});

describe('dispatchDecryptStream — EFF pipeline wire-up (V=4)', () => {
    // Encrypt: /EFF=AESV2 (embedded file), /StmF=V2 (regular streams = RC4).
    // Dispatch MUST route the EmbeddedFile stream through AESV2 and the
    // content stream through V2 — methods are DIFFERENT, so a wrong route
    // would produce garbage on decrypt.
    const dictEnc = {
        V: 4, R: 4,
        CF: {
            AesCF: { CFM: 'AESV2' },
            RcCF:  { CFM: 'V2' }
        },
        StmF: 'RcCF', StrF: 'RcCF', EFF: 'AesCF'
    };
    const typed = typeEncryptDict(dictEnc);
    const sel = selectHandler(typed, { v4: _v4Handler });

    test('selection exposes distinct stream vs eff methods', () => {
        expect(sel.method).toBe('V2');
        expect(sel.effMethod).toBe('AESV2');
    });

    test('routes /Type /EmbeddedFile through effMethod (AESV2)', () => {
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 13 + 11) & 0xff;
        const iv = new Uint8Array(16);
        for (let i = 0; i < 16; i++) iv[i] = 0x40 + i;
        const plain = new TextEncoder().encode('embedded payload via EFF');
        // Encrypt as embedded file (AESV2).
        const ct = _v4Handler.encryptEmbeddedFile(
            { method: sel.effMethod }, fek, 21, 0, plain, iv);
        const stream = {
            type: 'stream',
            dict: { type: 'dict', entries: {
                Type: { type: 'name', value: 'EmbeddedFile' }
            }},
            raw: ct
        };
        const pt = dispatchDecryptStream(sel, stream, fek, 21, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });

    test('routes regular stream through streamMethod (V2 RC4)', () => {
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 7 + 19) & 0xff;
        const plain = new TextEncoder().encode('regular content stream');
        const ct = _v4Handler.encryptStream(
            { method: sel.method }, fek, 33, 0, plain, null);
        const stream = {
            type: 'stream',
            dict: { type: 'dict', entries: {} },
            raw: ct
        };
        const pt = dispatchDecryptStream(sel, stream, fek, 33, 0, ct);
        expect(Array.from(pt)).toEqual(Array.from(plain));
    });

    test('routing EFF stream through streamMethod yields wrong output', () => {
        // Sanity check: the two methods are genuinely different. If we
        // mis-routed AESV2 ciphertext to V2 (RC4), the result is garbage.
        const fek = new Uint8Array(16);
        for (let i = 0; i < 16; i++) fek[i] = (i * 5 + 1) & 0xff;
        const iv = new Uint8Array(16);
        const plain = new TextEncoder().encode('xxxxxxxxxxxxxxxx');
        const ct = _v4Handler.encryptEmbeddedFile(
            { method: 'AESV2' }, fek, 5, 0, plain, iv);
        const ptWrong = _v4Handler.decryptStream(
            { method: 'V2' }, fek, 5, 0, ct);
        // Almost surely not equal to plain.
        let same = ptWrong.length === plain.length;
        if (same) {
            for (let i = 0; i < plain.length; i++) {
                if (ptWrong[i] !== plain[i]) { same = false; break; }
            }
        }
        expect(same).toBe(false);
    });

    test('rejects missing selection', () => {
        expect(() => dispatchDecryptStream(
            null, { type: 'stream', dict: { type: 'dict', entries: {} } },
            new Uint8Array(16), 1, 0, new Uint8Array(0)))
            .toThrow(EncryptionError);
    });
});

const codeOfSec = (fn) => {
    try { fn(); } catch (e) { return e.code; }
    throw new Error('expected a throw, got none');
};

describe('typeEncryptDict — byte-string coercion', () => {
    test('/O, /U and friends accept latin-1 strings and plain arrays', () => {
        const t = typeEncryptDict({
            V: 5, R: 6,
            O: 'ABÿ', U: [1, 2, 255], OE: new Uint8Array([9]), UE: null
        });
        expect(Array.from(t.O)).toEqual([0x41, 0x42, 0xff]);
        expect(Array.from(t.U)).toEqual([1, 2, 255]);
        expect(Array.from(t.OE)).toEqual([9]);
        expect(t.UE).toBeUndefined();
    });
});

describe('selectHandler — V=4 crypt filter resolution', () => {
    const v4 = (over) => typeEncryptDict({ V: 4, R: 4, ...over });
    const CF = { StdCF: { type: 'dict', entries: { CFM: { type: 'name', value: 'AESV2' } } } };

    test('/StmF=Identity falls back to the /StrF filter for streams', () => {
        const sel = selectHandler(
            v4({ CF, StmF: { type: 'name', value: 'Identity' },
                 StrF: { type: 'name', value: 'StdCF' } }),
            { v4: _v4Handler });
        expect(sel.method).toBe('AESV2');
        expect(sel.strMethod).toBe('AESV2');
    });

    test('both filters Identity leaves streams unencrypted', () => {
        const sel = selectHandler(v4({ CF }), { v4: _v4Handler });
        expect(sel.method).toBe('Identity');
        expect(sel.strMethod).toBe('Identity');
    });

    test('a named filter with no /CF entry is rejected, naming the filter', () => {
        const e = (() => {
            try {
                selectHandler(v4({ StmF: { type: 'name', value: 'StdCF' } }),
                    { v4: _v4Handler });
            } catch (x) { return x; }
        })();
        expect(e).toBeInstanceOf(EncryptionError);
        expect(e.code).toBe('pdf/crypto/v4/missing-cf-entry');
        expect(e.context.filterName).toBe('StdCF');
    });
});

describe('selectHandler — V=5 defaults and handler presence', () => {
    const stubV5 = { decryptStream: () => new Uint8Array(0) };

    test('a named filter with no /CF at all defaults to AESV3', () => {
        const sel = selectHandler(
            typeEncryptDict({ V: 5, R: 5, StmF: { type: 'name', value: 'StdCF' } }),
            { v5: stubV5 });
        expect(sel.method).toBe('AESV3');
        expect(sel.revision).toBe(5);
    });

    test('R=5 without a v5 handler is reported as missing-handler', () => {
        expect(codeOfSec(() => selectHandler(typeEncryptDict({ V: 5, R: 5 }), {})))
            .toBe('pdf/crypto/missing-handler');
        expect(codeOfSec(() => selectHandler(typeEncryptDict({ V: 5, R: 5 }), null)))
            .toBe('pdf/crypto/missing-handler');
    });
});

describe('isEmbeddedFileStream / dispatchDecryptStream routing', () => {
    const efStream = (typeNode) => ({
        type: 'stream', dict: { type: 'dict', entries: { Type: typeNode } }
    });

    test('a raw string /Type is recognised alongside a typed /Name', () => {
        expect(isEmbeddedFileStream(efStream({ type: 'name', value: 'EmbeddedFile' })))
            .toBe(true);
        expect(isEmbeddedFileStream(efStream('EmbeddedFile'))).toBe(true);
        expect(isEmbeddedFileStream(efStream('Page'))).toBe(false);
        expect(isEmbeddedFileStream(efStream({ type: 'int', value: 1 }))).toBe(false);
    });

    test('an embedded-file stream falls back to decryptStream with effMethod', () => {
        const seen = [];
        const handler = {
            decryptStream(typedView) { seen.push(typedView.method); return new Uint8Array(1); }
        };
        dispatchDecryptStream(
            { handler, method: 'AESV3', effMethod: 'AESV4' },
            efStream({ type: 'name', value: 'EmbeddedFile' }),
            new Uint8Array(32), 1, 0, new Uint8Array(0));
        expect(seen).toEqual(['AESV4']);
    });

    test('a handler with neither entry point is rejected per stream kind', () => {
        const bare = { handler: {}, method: 'AESV3', effMethod: 'AESV3' };
        expect(codeOfSec(() => dispatchDecryptStream(
            bare, efStream({ type: 'name', value: 'EmbeddedFile' }),
            new Uint8Array(32), 1, 0, new Uint8Array(0))))
            .toBe('pdf/crypto/security/no-eff');
        expect(codeOfSec(() => dispatchDecryptStream(
            bare, efStream({ type: 'name', value: 'Page' }),
            new Uint8Array(32), 1, 0, new Uint8Array(0))))
            .toBe('pdf/crypto/security/no-stream');
    });
});

// ── Identity crypt filter (ISO 32000-2 §7.6.6, Table 20 defaults) ────
//
// A class whose crypt filter is `Identity` — named, or absent (the Table 20
// default) — is not encrypted. The resolution is per class (streams,
// strings, embedded files), on V=5 R=5 and R=6 alike; an absent /EFF
// follows /StmF.
describe('selectHandler — V=5 Identity crypt filter per class', () => {
    const N = (value) => ({ type: 'name', value });
    const CF = { type: 'dict', entries: {
        StdCF: { type: 'dict', entries: { CFM: N('AESV3') } },
        GcmCF: { type: 'dict', entries: { CFM: N('AESV4') } }
    } };
    const handlers = { v5: { tag: 'v5' }, v6: { tag: 'v6' } };
    const pick = (R, over) => selectHandler(
        typeEncryptDict({ V: 5, R, CF, ...over }), handlers);

    for (const R of [5, 6]) {
        test(`R=${R}: /StmF /Identity /StrF /StdCF — streams Identity, strings AESV3`, () => {
            const sel = pick(R, { StmF: N('Identity'), StrF: N('StdCF') });
            expect(sel.revision).toBe(R);
            expect(sel.method).toBe('Identity');
            expect(sel.strMethod).toBe('AESV3');
            expect(sel.effMethod).toBe('Identity');
        });

        test(`R=${R}: /StmF /StdCF /StrF /Identity — streams AESV3, strings Identity`, () => {
            const sel = pick(R, { StmF: N('StdCF'), StrF: N('Identity') });
            expect(sel.method).toBe('AESV3');
            expect(sel.strMethod).toBe('Identity');
            expect(sel.effMethod).toBe('AESV3');
        });

        test(`R=${R}: /StmF and /StrF absent — both Identity (Table 20 default)`, () => {
            const sel = pick(R, {});
            expect(sel.method).toBe('Identity');
            expect(sel.strMethod).toBe('Identity');
            expect(sel.effMethod).toBe('Identity');
        });

        test(`R=${R}: /EFF absent follows /StmF (the StdCF method)`, () => {
            expect(pick(R, { StmF: N('StdCF'), StrF: N('StdCF') }).effMethod)
                .toBe('AESV3');
            expect(pick(R, { StmF: N('GcmCF'), StrF: N('StdCF') }).effMethod)
                .toBe('AESV4');
        });

        test(`R=${R}: an explicit /EFF /Identity is Identity, never the stream method`, () => {
            const sel = pick(R, { StmF: N('StdCF'), StrF: N('StdCF'), EFF: N('Identity') });
            expect(sel.method).toBe('AESV3');
            expect(sel.strMethod).toBe('AESV3');
            expect(sel.effMethod).toBe('Identity');
        });
    }

    test('plain-string names resolve like typed names', () => {
        const sel = selectHandler(typeEncryptDict({
            V: 5, R: 6, CF: { StdCF: { CFM: 'AESV3' } },
            StmF: 'StdCF', StrF: 'Identity', EFF: 'Identity'
        }), handlers);
        expect(sel.method).toBe('AESV3');
        expect(sel.strMethod).toBe('Identity');
        expect(sel.effMethod).toBe('Identity');
    });
});

describe('dispatchDecryptStream — Identity passthrough', () => {
    const N = (value) => ({ type: 'name', value });
    const regular = { type: 'stream', dict: { type: 'dict', entries: {} } };
    const embedded = { type: 'stream', dict: { type: 'dict', entries: {
        Type: N('EmbeddedFile') } } };
    /** A handler whose every entry point throws: the passthrough calls none. */
    const throwing = (tag) => ({
        tag,
        decryptStream() { throw new Error(tag + '.decryptStream called'); },
        decryptEmbeddedFile() { throw new Error(tag + '.decryptEmbeddedFile called'); }
    });
    const bytes = () => Uint8Array.from([0x42, 0x54, 0x20, 0x45, 0x54, 0x0a]);

    const cases = [
        ['V=4 R=4, both filters Identity', () => selectHandler(
            typeEncryptDict({ V: 4, R: 4,
                CF: { StdCF: { CFM: 'AESV2' } } }),
            { v4: throwing('v4') })],
        ['V=5 R=5, filters absent', () => selectHandler(
            typeEncryptDict({ V: 5, R: 5 }), { v5: throwing('v5') })],
        ['V=5 R=6, filters absent', () => selectHandler(
            typeEncryptDict({ V: 5, R: 6 }), { v6: throwing('v6') })],
        ['V=5 R=6, /StmF /Identity named', () => selectHandler(
            typeEncryptDict({ V: 5, R: 6,
                CF: { StdCF: { CFM: 'AESV3' } },
                StmF: N('Identity'), StrF: N('StdCF') }),
            { v6: throwing('v6') })]
    ];

    for (const [label, sel] of cases) {
        test(`${label}: a regular stream comes back unchanged, no handler call`, () => {
            const s = sel();
            expect(s.method).toBe('Identity');
            const ct = bytes();
            const out = dispatchDecryptStream(s, regular, new Uint8Array(32), 7, 0, ct);
            expect(out).toBe(ct);
            expect(Array.from(out)).toEqual(Array.from(bytes()));
        });

        test(`${label}: an /EmbeddedFile stream comes back unchanged, no handler call`, () => {
            const s = sel();
            expect(s.effMethod).toBe('Identity');
            const ct = bytes();
            const out = dispatchDecryptStream(s, embedded, new Uint8Array(32), 8, 0, ct);
            expect(out).toBe(ct);
            expect(Array.from(out)).toEqual(Array.from(bytes()));
        });
    }

    test('per class: /EFF /Identity passes through while /StmF still reaches the handler', () => {
        const seen = [];
        const handler = {
            decryptStream(typedView, fek, objNum, gen, ct) {
                seen.push(typedView.method);
                return ct.subarray(1);
            }
        };
        const sel = selectHandler(typeEncryptDict({
            V: 5, R: 6, CF: { StdCF: { CFM: 'AESV3' } },
            StmF: N('StdCF'), StrF: N('StdCF'), EFF: N('Identity')
        }), { v6: handler });
        const efCt = bytes();
        expect(dispatchDecryptStream(sel, embedded, new Uint8Array(32), 9, 0, efCt))
            .toBe(efCt);
        expect(seen).toEqual([]);
        const regCt = bytes();
        expect(Array.from(dispatchDecryptStream(sel, regular, new Uint8Array(32), 10, 0, regCt)))
            .toEqual(Array.from(regCt.subarray(1)));
        expect(seen).toEqual(['AESV3']);
    });
});
