// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfEncryptedWriter` — dependency, argument and
 * trailer-splice failure paths.
 *
 * `encryptedWriter.test.js` owns the V=4/V=5 encrypt→decrypt roundtrips.
 * This file owns the refusals the writer must raise before it produces
 * anything: a factory wired without the base writer or without the
 * handler a requested (version, revision) needs, a caller that omits
 * `opts`/`opts.encrypt`, an AESV4 effMethod with no GCM module — plus
 * the three branches of the trailer splice, exercised by stubbing the
 * base writer's output (the only way to reach output shapes the real
 * `pdfWriter` never produces).
 *
 * @module pdf/document/encryptedWriter.paths.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfEncryptedWriter } from './encryptedWriter.js';
import { pdfWriter } from './writer.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfStandardV4 } from '../crypto/standardV4.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfStandardV6 } from '../crypto/standardV6.js';
import { pdfAesGcm } from '../crypto/aesGcm.js';
import { pdfErrors } from '../errors.js';

import { aes as _fwAes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc as _fwCbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { gcm as _fwGcm } from '@awacloud/fw/crypto/mode/gcm.js';
import { sha256 as _fwSha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 as _fwSha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 as _fwSha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 as _fwUtf8 } from '@awacloud/fw/io/codec/utf8.js';

const _ba = _fwBA.factory();
const _utf8m = _fwUtf8.factory();
const _aes = _fwAes.factory();
const _cbc = _fwCbc.factory(_ba);
const _gcm = _fwGcm.factory(_ba);
const _sha256m = _fwSha256.factory(_ba, _utf8m);
const _sha512m = _fwSha512.factory(_ba, _utf8m);
const _sha384m = _fwSha384.factory(_sha512m);

const _errors = pdfErrors.factory();
const { EncryptionError, RenderError } = _errors;
const _ser = pdfSerializer.factory(_errors);
const _writer = pdfWriter.factory(_errors, _ser);
const _v4 = pdfStandardV4.factory(_errors, _aes, _cbc, _ba);
const _v5 = pdfStandardV5.factory(_errors, _aes, _cbc, _sha256m, _ba);
const _v6 = pdfStandardV6.factory(_errors, _aes, _cbc, _sha256m, _sha384m,
    _sha512m, _ba);
const _gcmMod = pdfAesGcm.factory(_errors, _aes, _gcm, _ba);

function make(o) {
    o = o || {};
    return pdfEncryptedWriter.factory(_errors,
        'writer' in o ? o.writer : _writer,
        'v5' in o ? o.v5 : _v5,
        'v6' in o ? o.v6 : _v6,
        'v4' in o ? o.v4 : _v4,
        'gcm' in o ? o.gcm : _gcmMod);
}
const enc = make();

/** Deterministic counter PRNG — never for production. */
function rand(seed) {
    let n = seed | 0;
    return function (len) {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            n = (n * 1103515245 + 12345) & 0x7fffffff;
            out[i] = n & 0xff;
        }
        return out;
    };
}

const te = new TextEncoder();

function indirects(extra) {
    const list = [
        { num: 1, gen: 0, value: { type: 'dict', entries: {
            Type: { type: 'name', value: 'Catalog' },
            Pages: { type: 'ref', num: 2, gen: 0 } } } },
        { num: 2, gen: 0, value: { type: 'dict', entries: {
            Type: { type: 'name', value: 'Pages' },
            Kids: { type: 'array', items: [] },
            Count: { type: 'int', value: 0 } } } }
    ];
    return extra ? list.concat(extra) : list;
}

/**
 * Default to V=4 R=4 (RC4/MD5 derivation) — orders of magnitude cheaper
 * than the R=6 hash loop, and the paths under test here are
 * handler-independent.
 */
function opts(o) {
    o = o || {};
    return {
        indirects: o.indirects || indirects(),
        root: { num: 1, gen: 0 },
        id: [new Uint8Array(16).fill(0xA1), new Uint8Array(16).fill(0xB2)],
        encrypt: Object.assign({
            version: 4, revision: 4, method: 'AESV2',
            userPassword: 'u', ownerPassword: 'o',
            permissions: -1, randomBytes: rand(0x1234)
        }, o.encrypt || {})
    };
}

function code(fn) {
    try { fn(); } catch (e) { return e.code; }
    return null;
}

describe('factory dependency contract', () => {
    test('refuses to build without pdfWriter.writeDocument', () => {
        let caught = null;
        try { make({ writer: null }); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(EncryptionError);
        expect(caught.code).toBe('pdf/crypto/enc-writer/missing-writer');
        expect(() => make({ writer: {} })).toThrow(EncryptionError);
    });

    test('V=4 R=4 requires the pdfStandardV4 handler', () => {
        const noV4 = make({ v4: null });
        expect(code(() => noV4.writeEncryptedDocument(opts())))
            .toBe('pdf/crypto/enc-writer/missing-v4');
    });

    test('an AESV4 effMethod requires the pdfAesGcm module', () => {
        const noGcm = make({ gcm: null });
        expect(code(() => noGcm.writeEncryptedDocument(opts({
            encrypt: { version: 5, revision: 5, method: 'AESV3',
                       effMethod: 'AESV4' } }))))
            .toBe('pdf/crypto/enc-writer/missing-gcm');
    });
});

describe('writeEncryptedDocument — argument contract', () => {
    test('requires an opts object', () => {
        expect(code(() => enc.writeEncryptedDocument())).toBe(
            'pdf/crypto/enc-writer/bad-input');
        expect(code(() => enc.writeEncryptedDocument('x'))).toBe(
            'pdf/crypto/enc-writer/bad-input');
    });

    test('requires opts.encrypt', () => {
        expect(code(() => enc.writeEncryptedDocument({ indirects: [] })))
            .toBe('pdf/crypto/enc-writer/no-encrypt');
        expect(code(() => enc.writeEncryptedDocument({ encrypt: 'x' })))
            .toBe('pdf/crypto/enc-writer/no-encrypt');
    });

    test('rejects an unsupported (version, revision) pair', () => {
        let caught = null;
        try {
            enc.writeEncryptedDocument(opts({
                encrypt: { version: 3, revision: 3 } }));
        } catch (e) { caught = e; }
        expect(caught.code).toBe('pdf/crypto/enc-writer/unsupported-version');
        expect(caught.context).toEqual({ version: 3, revision: 3 });
    });
});

describe('default randomBytes sentinel', () => {
    test('supplies the /ID and file key when no PRNG is injected', () => {
        // No `randomBytes` in opts.encrypt → the module's own sentinel
        // runs (it prefers WebCrypto's getRandomValues).
        function run() {
            return enc.writeEncryptedDocument({
                indirects: indirects(),
                root: { num: 1, gen: 0 },
                encrypt: { version: 4, revision: 4, method: 'AESV2',
                           userPassword: 'u', ownerPassword: 'o',
                           permissions: -1 }
            });
        }
        const out = run();
        expect(out.bytes).toBeInstanceOf(Uint8Array);
        expect(out.fek.length).toBe(16);
        expect(out.id[0].length).toBe(16);
        // A second run must differ — the sentinel is a real entropy source.
        expect(Array.from(run().id[0])).not.toEqual(Array.from(out.id[0]));
    });
});

describe('trailer splice — base-writer output shapes', () => {
    /** Wire the module with a stub base writer emitting `text`. */
    function withOutput(text) {
        return make({ writer: { writeDocument: () => te.encode(text) } });
    }

    test('falls back to a whole-file scan when the trailer is far from the end',
        () => {
            const far = withOutput('trailer\n<< /Size 3 >>\n'
                + 'startxref\n9\n%%EOF\n' + 'x'.repeat(600));
            const out = far.writeEncryptedDocument(opts());
            const s = new TextDecoder('latin1').decode(out.bytes);
            expect(s).toContain('/Encrypt ');
            expect(s.indexOf('/Encrypt ')).toBeLessThan(s.indexOf('>>'));
        });

    test('rejects base output with no trailer', () => {
        const none = withOutput('%PDF-2.0\nno trailer at all\n');
        expect(code(() => none.writeEncryptedDocument(opts())))
            .toBe('pdf/crypto/enc-writer/no-trailer');
    });

    test('rejects base output whose trailer dict never closes', () => {
        const open = withOutput('trailer\n<< /Size 3 ' + 'y'.repeat(400));
        let caught = null;
        try { open.writeEncryptedDocument(opts()); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(RenderError);
        expect(caught.code).toBe('pdf/crypto/enc-writer/no-trailer-close');
    });
});
