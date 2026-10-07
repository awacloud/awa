// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Unit tests for `pdfDssBuilder` — the PAdES-LT Document
 * Security Store object builder (ETSI EN 319 142-1 §5.4, ISO 32000-2
 * §12.8.4.3).
 *
 * The module is pure and deterministic: it turns cert/OCSP/CRL DER
 * blobs into `{ num, gen, value }` updates consumable by
 * `pdfIncrementalWriter.appendIncremental`. Every assertion here is
 * structural (object numbering, dict/stream shape, VRI wiring) or a
 * typed-error contract — no cryptographic byte is invented; the single
 * digest used (`_sha1`) is exercised through a FIPS 180-4 known answer
 * and through the VRI key derivation it feeds.
 *
 * `_pdfDate` / VRI `TU` are pinned via `vriTime` so nothing here depends
 * on the wall clock.
 *
 * @module pdf/sig/dss.test
 */

import { describe, test, expect } from 'bun:test';
import { pdfDssBuilder } from './dss.js';
import { pdfErrors } from '../errors.js';
import { pdfSha1 } from './sha1.js';
import { bitArray as _fwBA } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 as _fwUtf8 } from '@awacloud/fw/io/codec/utf8.js';

const _ba    = _fwBA.factory();
const _utf8m = _fwUtf8.factory();
const _sha1m = pdfSha1.factory(_ba, _utf8m);
const _errors = pdfErrors.factory();
const { ContractError } = _errors;

const _dss = pdfDssBuilder.factory(_errors, _sha1m, _ba);
const {
    buildDss,
    _refObj, _intObj, _nameObj, _strHexObj, _arrayObj, _dictObj,
    _streamObj, _sha1, _toHexUpper, _scanSignatureContentsHex, _pdfDate
} = _dss;

/** DER-ish filler bytes — the builder never parses them. */
function der(fill, len) {
    const out = new Uint8Array(len || 8);
    out.fill(fill);
    return out;
}

/** Find the single update carrying the DSS dict. */
function dssUpdate(built) {
    return built.updates.find((u) => u.num === built.dssNum);
}

describe('buildDss — object allocation', () => {
    test('allocates certs, then ocsps, then crls, then the DSS dict', () => {
        const built = buildDss({
            startNum: 10,
            certs: [der(1), der(2)],
            ocsps: [der(3)],
            crls:  [der(4), der(5), der(6)]
        });
        expect(built.certNums).toEqual([10, 11]);
        expect(built.ocspNums).toEqual([12]);
        expect(built.crlNums).toEqual([13, 14, 15]);
        expect(built.dssNum).toBe(16);
        expect(built.lastNum).toBe(16);
        expect(built.updates.length).toBe(7);
    });

    test('each cert/ocsp/crl becomes a typed stream carrying the raw DER', () => {
        const certDer = der(0xAA, 5);
        const ocspDer = der(0xBB, 6);
        const crlDer  = der(0xCC, 7);
        const built = buildDss({
            startNum: 2, certs: [certDer], ocsps: [ocspDer], crls: [crlDer]
        });
        const byNum = new Map(built.updates.map((u) => [u.num, u.value]));
        expect(byNum.get(2).type).toBe('stream');
        expect(byNum.get(2).dict.entries.Type).toEqual(
            { type: 'name', value: 'CertVal' });
        expect(byNum.get(2).raw).toBe(certDer);
        expect(byNum.get(3).dict.entries.Type.value).toBe('OCSPVal');
        expect(byNum.get(3).raw).toBe(ocspDer);
        expect(byNum.get(4).dict.entries.Type.value).toBe('CRLVal');
        expect(byNum.get(4).raw).toBe(crlDer);
    });

    test('DSS dict lists /Certs, /OCSPs and /CRLs as ref arrays', () => {
        const built = buildDss({
            startNum: 5, certs: [der(1)], ocsps: [der(2)], crls: [der(3)]
        });
        const e = dssUpdate(built).value.entries;
        expect(e.Type).toEqual({ type: 'name', value: 'DSS' });
        expect(e.Certs.items).toEqual([{ type: 'ref', num: 5, gen: 0 }]);
        expect(e.OCSPs.items).toEqual([{ type: 'ref', num: 6, gen: 0 }]);
        expect(e.CRLs.items).toEqual([{ type: 'ref', num: 7, gen: 0 }]);
        expect(e.VRI).toBeUndefined();
    });

    test('omits empty lists entirely (bare /Type /DSS)', () => {
        const built = buildDss({ startNum: 2 });
        const e = dssUpdate(built).value.entries;
        expect(Object.keys(e)).toEqual(['Type']);
        expect(built.updates.length).toBe(1);
        expect(built.dssNum).toBe(2);
    });
});

describe('buildDss — contract errors', () => {
    test('rejects a startNum below 2', () => {
        expect(() => buildDss({ startNum: 1 })).toThrow(ContractError);
        expect(() => buildDss({ startNum: 1 })).toThrow(/startNum/);
        expect(() => buildDss({})).toThrow(ContractError);
    });

    test('rejects a non-Uint8Array cert', () => {
        let caught = null;
        try { buildDss({ startNum: 2, certs: ['nope'] }); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/dss/bad-cert');
    });

    test('rejects a non-Uint8Array ocsp', () => {
        let caught = null;
        try { buildDss({ startNum: 2, ocsps: [{}] }); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/dss/bad-ocsp');
    });

    test('rejects a non-Uint8Array crl', () => {
        let caught = null;
        try { buildDss({ startNum: 2, crls: [42] }); }
        catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/dss/bad-crl');
    });

    test('rejects a VRI index outside the parent list', () => {
        let caught = null;
        try {
            buildDss({ startNum: 2, certs: [der(1)],
                       vri: { ABCD: { certs: [7] } } });
        } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('pdf/dss/vri-bad-index');
        expect(caught.context.index).toBe(7);
    });

    test('rejects a negative VRI index', () => {
        expect(() => buildDss({ startNum: 2, certs: [der(1)],
                                vri: { ABCD: { certs: [-1] } } }))
            .toThrow(ContractError);
    });
});

describe('buildDss — explicit VRI entries', () => {
    test('maps indices onto the allocated cert/ocsp/crl object numbers', () => {
        const built = buildDss({
            startNum: 4,
            certs: [der(1), der(2)], ocsps: [der(3)], crls: [der(4)],
            vri: { DEADBEEF: { certs: [1, 0], ocsps: [0], crls: [0] } }
        });
        const vri = dssUpdate(built).value.entries.VRI.entries.DEADBEEF;
        expect(vri.type).toBe('dict');
        expect(vri.entries.Cert.items).toEqual([
            { type: 'ref', num: 5, gen: 0 },
            { type: 'ref', num: 4, gen: 0 }
        ]);
        expect(vri.entries.OCSP.items).toEqual([{ type: 'ref', num: 6, gen: 0 }]);
        expect(vri.entries.CRL.items).toEqual([{ type: 'ref', num: 7, gen: 0 }]);
    });

    test('promotes raw DER inside a VRI list to a fresh CertVal stream', () => {
        const extra = der(0x77, 4);
        const built = buildDss({
            startNum: 2, certs: [der(1)],
            vri: { AAAA: { certs: [extra] } }
        });
        const vri = dssUpdate(built).value.entries.VRI.entries.AAAA;
        const promotedNum = vri.entries.Cert.items[0].num;
        expect(promotedNum).toBe(3);            // after the parent cert (2)
        const promoted = built.updates.find((u) => u.num === promotedNum);
        expect(promoted.value.type).toBe('stream');
        expect(promoted.value.dict.entries.Type.value).toBe('CertVal');
        expect(promoted.value.raw).toBe(extra);
        expect(built.dssNum).toBe(4);
    });

    test('emits /TU as a PDF string and /TS as its own stream', () => {
        const tst = der(0x5A, 12);
        const built = buildDss({
            startNum: 2,
            vri: { CAFE: { tu: "(D:20240115120000+00'00')", ts: tst } }
        });
        const vri = dssUpdate(built).value.entries.VRI.entries.CAFE;
        expect(vri.entries.TU.type).toBe('string');
        expect(new TextDecoder().decode(vri.entries.TU.value))
            .toBe("(D:20240115120000+00'00')");
        const tsNum = vri.entries.TS.num;
        const tsUpdate = built.updates.find((u) => u.num === tsNum);
        expect(tsUpdate.value.dict.entries.Type.value).toBe('TS');
        expect(tsUpdate.value.raw).toBe(tst);
    });

    test('ignores non-array cert/ocsp/crl specs (no /Cert emitted)', () => {
        const built = buildDss({
            startNum: 2, certs: [der(1)],
            vri: { BEEF: { certs: 'not-an-array' } }
        });
        const vri = dssUpdate(built).value.entries.VRI.entries.BEEF;
        expect(vri.entries.Cert).toBeUndefined();
        expect(Object.keys(vri.entries)).toEqual([]);
    });
});

describe('buildDss — autoVri', () => {
    const parent = new TextEncoder().encode(
        '%PDF-2.0\n'
        + '7 0 obj << /Type /Sig /Filter /Adobe.PPKLite /Contents <ABCD01> '
        + '/ByteRange [0 10 20 10] >> endobj\n'
        + '8 0 obj << /Type /DocTimeStamp /Contents <FFEE> >> endobj\n'
        + '9 0 obj << /Type /Page >> endobj\n');

    test('derives one VRI key per signature, SHA-1 of the /Contents bytes', () => {
        const built = buildDss({
            startNum: 2, certs: [der(1)], ocsps: [der(2)],
            autoVri: true, parentBytes: parent,
            vriTime: new Date(Date.UTC(2024, 0, 15, 12, 0, 0))
        });
        const vriDict = dssUpdate(built).value.entries.VRI.entries;
        const keys = Object.keys(vriDict);
        expect(keys.length).toBe(2);
        // Keys are the uppercase hex SHA-1 of the decoded /Contents bytes.
        const k1 = _toHexUpper(_sha1(new Uint8Array([0xAB, 0xCD, 0x01])));
        const k2 = _toHexUpper(_sha1(new Uint8Array([0xFF, 0xEE])));
        expect(keys.sort()).toEqual([k1, k2].sort());
        expect(k1).toMatch(/^[0-9A-F]{40}$/);
        // Every auto entry references all parent certs/ocsps and pins TU.
        const e = vriDict[k1].entries;
        expect(e.Cert.items).toEqual([{ type: 'ref', num: 2, gen: 0 }]);
        expect(e.OCSP.items).toEqual([{ type: 'ref', num: 3, gen: 0 }]);
        expect(new TextDecoder().decode(e.TU.value))
            .toBe("(D:20240115120000+00'00')");
    });

    test('an explicit VRI entry wins over the auto-derived one', () => {
        const key = _toHexUpper(_sha1(new Uint8Array([0xAB, 0xCD, 0x01])));
        const built = buildDss({
            startNum: 2, certs: [der(1)],
            autoVri: true, parentBytes: parent,
            vriTime: new Date(Date.UTC(2024, 0, 15, 12, 0, 0)),
            vri: { [key]: { tu: '(explicit)' } }
        });
        const e = dssUpdate(built).value.entries.VRI.entries[key].entries;
        expect(new TextDecoder().decode(e.TU.value)).toBe('(explicit)');
        expect(e.Cert).toBeUndefined();
    });

    test('is inert without parentBytes', () => {
        const built = buildDss({ startNum: 2, certs: [der(1)], autoVri: true });
        expect(dssUpdate(built).value.entries.VRI).toBeUndefined();
    });
});

describe('helpers', () => {
    test('_scanSignatureContentsHex returns the raw hex of every sig dict', () => {
        const bytes = new TextEncoder().encode(
            '1 0 obj << /Type /Sig /Contents <00FF> >> endobj\n'
            + '2 0 obj << /Type /Page /Contents <DEAD> >> endobj\n'
            + '3 0 obj << /Type /DocTimeStamp /Contents <BEEF> >> endobj\n'
            + '4 0 obj << /Type /Sig /ByteRange [0 1 2 3] >> endobj\n');
        expect(_scanSignatureContentsHex(bytes)).toEqual(['00FF', 'BEEF']);
    });

    test('_scanSignatureContentsHex handles a multi-chunk buffer', () => {
        const head = new Uint8Array(0x8000 + 16);
        head.fill(0x20);
        const tail = new TextEncoder().encode(
            '5 0 obj << /Type /Sig /Contents <0102> >> endobj\n');
        const all = new Uint8Array(head.length + tail.length);
        all.set(head, 0);
        all.set(tail, head.length);
        expect(_scanSignatureContentsHex(all)).toEqual(['0102']);
    });

    test('_sha1 matches the FIPS 180-4 "abc" known answer', () => {
        const abc = new TextEncoder().encode('abc');
        expect(_toHexUpper(_sha1(abc)))
            .toBe('A9993E364706816ABA3E25717850C26C9CD0D89D');
    });

    test('_pdfDate emits a UTC ISO 32000-2 §7.9.4 date string', () => {
        expect(_pdfDate(new Date(Date.UTC(2024, 8, 5, 4, 3, 2))))
            .toBe("(D:20240905040302+00'00')");
        // A non-Date argument falls back to "now" — assert the SHAPE only
        // (never the value: no wall-clock-sensitive expectation).
        expect(_pdfDate('not-a-date'))
            .toMatch(/^\(D:\d{14}\+00'00'\)$/);
    });

    test('_toHexUpper zero-pads every byte', () => {
        expect(_toHexUpper(new Uint8Array([0x00, 0x0f, 0xff, 0xa5])))
            .toBe('000FFFA5');
    });

    test('object constructors emit the serializer node shapes', () => {
        expect(_refObj(3, 1)).toEqual({ type: 'ref', num: 3, gen: 1 });
        expect(_intObj(7.9)).toEqual({ type: 'int', value: 7 });
        expect(_nameObj('DSS')).toEqual({ type: 'name', value: 'DSS' });
        expect(_strHexObj('A9B8')).toEqual({ type: 'name', value: 'A9B8' });
        expect(_arrayObj([])).toEqual({ type: 'array', items: [] });
        expect(_dictObj({}).type).toBe('dict');
        const st = _streamObj(der(9, 3), 'CRLVal');
        expect(st.type).toBe('stream');
        expect(st.dict.entries.Type.value).toBe('CRLVal');
        expect(st.raw.length).toBe(3);
    });
});

describe('pdfDssBuilder descriptor', () => {
    test('declares its fw + package deps', () => {
        expect(pdfDssBuilder.name).toBe('pdfDssBuilder');
        expect(pdfDssBuilder.dependencies)
            .toEqual(['pdfErrors', 'pdfSha1', 'bitArray']);
    });

    test('factory returns the documented API', () => {
        expect(typeof buildDss).toBe('function');
        expect(typeof _scanSignatureContentsHex).toBe('function');
    });
});
