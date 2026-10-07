// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview End-to-end read-side dispatch integration tests for
 * pdfEncryptedWriter (Follow-up P, Item P1).
 *
 * Goal: validate the full write-then-read pipeline with EFF dispatch.
 *
 *   1. Build a graph with one regular content stream + one /Type
 *      /EmbeddedFile stream.
 *   2. Emit a PDF with `pdfEncryptedWriter.writeEncryptedDocument` using
 *      a distinct `effMethod` from `method`.
 *   3. Re-parse the emitted PDF: locate startxref → xref → trailer →
 *      /Encrypt indirect → typeEncryptDict.
 *   4. selectHandler picks the right standard handler + resolves method
 *      / effMethod from /CF + /StmF + /EFF.
 *   5. For each encrypted stream, route through
 *      `pdfSecurity.dispatchDecryptStream(selection, stream, fek, num,
 *      gen, ct)` — embedded files MUST go to AESV4/AESV2, regular
 *      streams MUST go to AESV3/V2/AESV4 per the /StmF resolution.
 *   6. Recovered plaintext is byte-identical to the original payload.
 *
 * Coverage: V=4 (V2 / AESV2 EFF), V=5 R=5 (AESV3 / AESV4 EFF), V=5 R=6
 * (AESV4 / AESV3 EFF).
 */
import { describe, test, expect } from 'bun:test';
import { pdfEncryptedWriter } from './encryptedWriter.js';
import { pdfWriter } from './writer.js';
import { pdfStandardV4 } from '../crypto/standardV4.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfStandardV6 } from '../crypto/standardV6.js';
import { pdfAesGcm } from '../crypto/aesGcm.js';
import { pdfSecurity } from '../crypto/security.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfShared } from '../_shared/index.js';
import { pdfErrors } from '../errors.js';

import { aes }      from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc }      from '@awacloud/fw/crypto/mode/cbc.js';
import { gcm }      from '@awacloud/fw/crypto/mode/gcm.js';
import { sha256 }   from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 }   from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 }   from '@awacloud/fw/crypto/hash/sha512.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 }     from '@awacloud/fw/io/codec/utf8.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

const rt = new ModuleRuntime();
rt.register(bitArray); rt.register(utf8);
rt.register(aes); rt.register(cbc); rt.register(gcm);
rt.register(sha256); rt.register(sha384); rt.register(sha512);
const aesFw = rt.resolve('aes');
const cbcFw = rt.resolve('cbc');
const gcmFw = rt.resolve('gcm');
const sha256Fw = rt.resolve('sha256');
const sha384Fw = rt.resolve('sha384');
const sha512Fw = rt.resolve('sha512');
const baFw  = rt.resolve('bitArray');

const errors = pdfErrors.factory();
const serializerMod = pdfSerializer.factory(errors);
const writerMod = pdfWriter.factory(errors, serializerMod);
const v4Mod = pdfStandardV4.factory(errors, aesFw, cbcFw, baFw);
const gcmMod = pdfAesGcm.factory(errors, aesFw, gcmFw, baFw);
const v5Mod = pdfStandardV5.factory(
    errors, aesFw, cbcFw, sha256Fw, baFw, gcmMod);
const v6Mod = pdfStandardV6.factory(
    errors, aesFw, cbcFw, sha256Fw, sha384Fw, sha512Fw, baFw, gcmMod);
const encMod = pdfEncryptedWriter.factory(
    errors, writerMod, v5Mod, v6Mod, v4Mod, gcmMod);
const security = pdfSecurity.factory(errors);
const sharedMod = pdfShared.factory();
const parserObj = pdfParserObj.factory(errors);
const tokenizer = pdfTokenizer.factory(errors, sharedMod);
const parser = pdfParser.factory(errors, parserObj, tokenizer);
const xref = pdfXref.factory(errors, tokenizer, parser);

// Deterministic PRNG — counter expansion (parity with sibling tests).
function makeDeterministicRand(seed) {
    let n = seed | 0;
    return function(len) {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            n = (n * 1103515245 + 12345) & 0x7fffffff;
            out[i] = n & 0xff;
        }
        return out;
    };
}

// Build a minimal graph: Catalog → Pages → Page (with Contents),
// regular content stream (obj 4), and EmbeddedFile stream (obj 5).
function buildGraph(regularPayload, effPayload, extraEmbeddedEntries) {
    const embeddedEntries = {
        Type: { type: 'name', value: 'EmbeddedFile' }
    };
    if (extraEmbeddedEntries) {
        for (const k of Object.keys(extraEmbeddedEntries)) {
            embeddedEntries[k] = extraEmbeddedEntries[k];
        }
    }
    return [
        { num: 1, gen: 0, value: { type: 'dict', entries: {
            Type:  { type: 'name', value: 'Catalog' },
            Pages: { type: 'ref',  num: 2, gen: 0 }
        } } },
        { num: 2, gen: 0, value: { type: 'dict', entries: {
            Type:  { type: 'name', value: 'Pages' },
            Kids:  { type: 'array', items: [{ type: 'ref', num: 3, gen: 0 }] },
            Count: { type: 'int', value: 1 }
        } } },
        { num: 3, gen: 0, value: { type: 'dict', entries: {
            Type:     { type: 'name', value: 'Page' },
            Parent:   { type: 'ref',  num: 2, gen: 0 },
            MediaBox: { type: 'array', items: [
                { type: 'int', value: 0 }, { type: 'int', value: 0 },
                { type: 'int', value: 612 }, { type: 'int', value: 792 }
            ] },
            Contents: { type: 'ref',  num: 4, gen: 0 }
        } } },
        { num: 4, gen: 0, value: {
            type: 'stream',
            dict: { type: 'dict', entries: {} },
            raw:  regularPayload
        } },
        { num: 5, gen: 0, value: {
            type: 'stream',
            dict: { type: 'dict', entries: embeddedEntries },
            raw:  effPayload
        } }
    ];
}

// Re-parse a PDF emitted by writeEncryptedDocument. Returns:
//   { trailerDict, xrefEntries, indirects: Map<num, { num, gen, value }> }
function reparsePdf(bytes) {
    const sx = xref.locateStartXref(bytes);
    expect(sx).toBeGreaterThan(0);
    const xrefOff = xref.readStartXref(bytes, sx);
    const tab = xref.parseXrefTable(bytes, xrefOff);
    const trailerInfo = xref.parseTrailerDict(bytes, tab.end);
    const indirects = new Map();
    for (const k of Object.keys(tab.entries)) {
        const e = tab.entries[k];
        if (e.free) continue;
        const ind = parser.parseIndirectFromBytes(bytes, e.offset, null);
        indirects.set(ind.num, ind);
    }
    return { trailerDict: trailerInfo.dict, xrefEntries: tab.entries, indirects };
}

// Convert a parsed dict (entries are typed PDF objects) into the
// loose JS shape `typeEncryptDict` expects (raw scalars for V/R/P/EM,
// Uint8Array for O/U/OE/UE/Perms strings, name objects passed through
// for /Filter, /StmF, /StrF, /EFF, dict for /CF).
function encryptDictToLoose(dict) {
    const e = dict.entries;
    function ival(n) { return n && n.type === 'int' ? n.value : undefined; }
    function bval(n) { return n && n.type === 'bool' ? n.value : undefined; }
    function strBytes(n) {
        return n && n.type === 'string' ? n.value : undefined;
    }
    return {
        V: ival(e.V),
        R: ival(e.R),
        Filter: e.Filter,
        Length: ival(e.Length),
        CF: e.CF,
        StmF: e.StmF,
        StrF: e.StrF,
        EFF: e.EFF,
        O:  strBytes(e.O),
        U:  strBytes(e.U),
        OE: strBytes(e.OE),
        UE: strBytes(e.UE),
        Perms: strBytes(e.Perms),
        P:  ival(e.P),
        EncryptMetadata: bval(e.EncryptMetadata) !== false
    };
}

// Find the /Encrypt indirect reference from the parsed trailer dict.
function encryptRefFromTrailer(trailerDict) {
    const r = trailerDict.entries.Encrypt;
    expect(r).toBeDefined();
    expect(r.type).toBe('ref');
    return r;
}

// Find the /ID array first element (Uint8Array) from the trailer.
function idFirstFromTrailer(trailerDict) {
    const idArr = trailerDict.entries.ID;
    expect(idArr).toBeDefined();
    expect(idArr.type).toBe('array');
    const first = idArr.items[0];
    expect(first.type).toBe('string');
    return first.value;
}

// ── V=4 EFF: method=V2, effMethod=AESV2 ─────────────────────────────────
describe('E2E read-side dispatch — V=4 (V2 / AESV2 EFF)', () => {
    test('write → parse → dispatch decrypts both streams correctly', () => {
        const rand = makeDeterministicRand(0xE2E_0_004);
        const regularPayload = new TextEncoder().encode(
            'E2E V=4 regular content — RC4-128 via /StmF (V2)');
        const effPayload = new TextEncoder().encode(
            'E2E V=4 embedded file — AES-128 CBC via /EFF (AESV2)');
        const userPw = 'eu4'; const ownerPw = 'eo4';

        const indirects = buildGraph(regularPayload, effPayload);
        const out = encMod.writeEncryptedDocument({
            indirects, root: { num: 1, gen: 0 },
            encrypt: {
                version: 4, revision: 4,
                method: 'V2', effMethod: 'AESV2',
                ownerPassword: ownerPw, userPassword: userPw,
                permissions: -4 | 0, randomBytes: rand
            }
        });

        const parsed = reparsePdf(out.bytes);
        const encRef = encryptRefFromTrailer(parsed.trailerDict);
        const encInd = parsed.indirects.get(encRef.num);
        expect(encInd).toBeDefined();
        expect(encInd.value.type).toBe('dict');

        const loose = encryptDictToLoose(encInd.value);
        const typed = security.typeEncryptDict(loose);
        // Inject idFirst + recovered FEK for tryPassword (V=4 needs idFirst).
        typed.idFirst = idFirstFromTrailer(parsed.trailerDict);
        expect(Array.from(typed.idFirst)).toEqual(Array.from(out.id[0]));

        const selection = security.selectHandler(typed,
            { v4: v4Mod, v5: v5Mod, v6: v6Mod });
        expect(selection.revision).toBe(4);
        expect(selection.method).toBe('V2');
        expect(selection.effMethod).toBe('AESV2');

        // Recover FEK via password — round-trip check.
        const typedForPw = {
            V: 4, R: 4, method: 'V2',
            O: typed.O, U: typed.U, P: typed.P,
            idFirst: typed.idFirst, EncryptMetadata: true
        };
        const u = v4Mod.tryPassword(typedForPw, userPw, false);
        expect(Array.from(u.fileEncryptionKey)).toEqual(Array.from(out.fek));
        const fek = u.fileEncryptionKey;

        // Regular stream (obj 4) — must dispatch to V2 (RC4).
        const regInd = parsed.indirects.get(4);
        expect(regInd.value.type).toBe('stream');
        const regPlain = security.dispatchDecryptStream(
            selection, regInd.value, fek, 4, 0, regInd.value.raw);
        expect(Array.from(regPlain)).toEqual(Array.from(regularPayload));

        // Embedded file (obj 5) — must dispatch to AESV2 (AES-128 CBC).
        const effInd = parsed.indirects.get(5);
        expect(effInd.value.type).toBe('stream');
        expect(effInd.value.dict.entries.Type.value).toBe('EmbeddedFile');
        const effPlain = security.dispatchDecryptStream(
            selection, effInd.value, fek, 5, 0, effInd.value.raw);
        expect(Array.from(effPlain)).toEqual(Array.from(effPayload));
    });
});

// ── V=5 R=5: method=AESV3, effMethod=AESV4 ──────────────────────────────
describe('E2E read-side dispatch — V=5 R=5 (AESV3 / AESV4 EFF)', () => {
    test('write → parse → dispatch decrypts both streams correctly', () => {
        const rand = makeDeterministicRand(0xE2E_0_055);
        const regularPayload = new TextEncoder().encode(
            'E2E V=5 R=5 regular — AES-256 CBC via /StmF (AESV3)');
        const effPayload = new TextEncoder().encode(
            'E2E V=5 R=5 embedded — AES-256 GCM via /EFF (AESV4)');
        const userPw = 'eu5'; const ownerPw = 'eo5';

        const indirects = buildGraph(regularPayload, effPayload);
        const out = encMod.writeEncryptedDocument({
            indirects, root: { num: 1, gen: 0 },
            encrypt: {
                version: 5, revision: 5,
                method: 'AESV3', effMethod: 'AESV4',
                ownerPassword: ownerPw, userPassword: userPw,
                permissions: -4 | 0, randomBytes: rand
            }
        });

        const parsed = reparsePdf(out.bytes);
        const encRef = encryptRefFromTrailer(parsed.trailerDict);
        const encInd = parsed.indirects.get(encRef.num);
        const loose = encryptDictToLoose(encInd.value);
        const typed = security.typeEncryptDict(loose);

        const selection = security.selectHandler(typed,
            { v4: v4Mod, v5: v5Mod, v6: v6Mod });
        expect(selection.revision).toBe(5);
        expect(selection.method).toBe('AESV3');
        expect(selection.effMethod).toBe('AESV4');
        expect(selection.handler).toBe(v5Mod);

        // FEK from password (V=5 does not need idFirst).
        const typedForPw = {
            V: 5, R: 5,
            O: typed.O, U: typed.U, OE: typed.OE, UE: typed.UE,
            Perms: typed.Perms, P: typed.P
        };
        const u = v5Mod.tryPassword(typedForPw, userPw, false);
        expect(Array.from(u.fileEncryptionKey)).toEqual(Array.from(out.fek));
        const fek = u.fileEncryptionKey;

        // Regular stream — AESV3 (CBC).
        const regInd = parsed.indirects.get(4);
        const regPlain = security.dispatchDecryptStream(
            selection, regInd.value, fek, 4, 0, regInd.value.raw);
        expect(Array.from(regPlain)).toEqual(Array.from(regularPayload));

        // Embedded file — AESV4 (GCM).
        const effInd = parsed.indirects.get(5);
        const effPlain = security.dispatchDecryptStream(
            selection, effInd.value, fek, 5, 0, effInd.value.raw);
        expect(Array.from(effPlain)).toEqual(Array.from(effPayload));
    });
});

// ── V=5 R=6: method=AESV4, effMethod=AESV3 ──────────────────────────────
describe('E2E read-side dispatch — V=5 R=6 (AESV4 / AESV3 EFF)', () => {
    test('write → parse → dispatch decrypts both streams correctly', () => {
        const rand = makeDeterministicRand(0xE2E_0_066);
        const regularPayload = new TextEncoder().encode(
            'E2E V=5 R=6 regular — AES-256 GCM via /StmF (AESV4)');
        const effPayload = new TextEncoder().encode(
            'E2E V=5 R=6 embedded — AES-256 CBC via /EFF (AESV3)');
        const userPw = 'eu6'; const ownerPw = 'eo6';

        const indirects = buildGraph(regularPayload, effPayload);
        const out = encMod.writeEncryptedDocument({
            indirects, root: { num: 1, gen: 0 },
            encrypt: {
                version: 5, revision: 6,
                method: 'AESV4', effMethod: 'AESV3',
                ownerPassword: ownerPw, userPassword: userPw,
                permissions: -4 | 0, randomBytes: rand
            }
        });

        const parsed = reparsePdf(out.bytes);
        const encRef = encryptRefFromTrailer(parsed.trailerDict);
        const encInd = parsed.indirects.get(encRef.num);
        const loose = encryptDictToLoose(encInd.value);
        const typed = security.typeEncryptDict(loose);

        const selection = security.selectHandler(typed,
            { v4: v4Mod, v5: v5Mod, v6: v6Mod });
        expect(selection.revision).toBe(6);
        expect(selection.method).toBe('AESV4');
        expect(selection.effMethod).toBe('AESV3');
        expect(selection.handler).toBe(v6Mod);

        const typedForPw = {
            V: 5, R: 6,
            O: typed.O, U: typed.U, OE: typed.OE, UE: typed.UE,
            Perms: typed.Perms, P: typed.P
        };
        const u = v6Mod.tryPassword(typedForPw, userPw, false);
        expect(Array.from(u.fileEncryptionKey)).toEqual(Array.from(out.fek));
        const fek = u.fileEncryptionKey;

        const regInd = parsed.indirects.get(4);
        const regPlain = security.dispatchDecryptStream(
            selection, regInd.value, fek, 4, 0, regInd.value.raw);
        expect(Array.from(regPlain)).toEqual(Array.from(regularPayload));

        const effInd = parsed.indirects.get(5);
        const effPlain = security.dispatchDecryptStream(
            selection, effInd.value, fek, 5, 0, effInd.value.raw);
        expect(Array.from(effPlain)).toEqual(Array.from(effPayload));
    }, 60000);
});

// ── Item P2: encryptString stays on /StrF for EmbeddedFile dicts ────────
//
// ISO 32000-1 §7.6.5 — /EFF applies strictly to /Type /EmbeddedFile
// STREAMS. Strings inside an EmbeddedFile dict (e.g. /Desc, /UF) are
// governed by /StrF, NOT /EFF.
//
// We configure method=AESV3 (StmF + StrF) + effMethod=AESV4 (EFF), then
// emit an EmbeddedFile dict carrying a string entry /Desc. The string
// must be encrypted with AESV3 (StrF), while the stream payload is
// encrypted with AESV4 (EFF). On read-side, the /Desc string is
// decrypted via handler.decryptString (which uses method=AESV3), while
// the stream goes via dispatchDecryptStream → decryptEmbeddedFile
// (AESV4).
describe('E2E — encryptString on EmbeddedFile dict uses /StrF, not /EFF', () => {
    test('V=5 R=5: /Desc string is AESV3 (StrF), stream is AESV4 (EFF)', () => {
        const rand = makeDeterministicRand(0xE7_5_0FF);
        const regularPayload = new TextEncoder().encode('regular content');
        const effStreamPayload = new TextEncoder().encode(
            'embedded file binary stream payload');
        const descPlain = new TextEncoder().encode('My File Description');
        const userPw = 'usp'; const ownerPw = 'osp';

        const indirects = buildGraph(regularPayload, effStreamPayload, {
            // /Desc — a string inside the EmbeddedFile stream dict.
            Desc: { type: 'string', value: descPlain, syntax: 'lit' }
        });
        const out = encMod.writeEncryptedDocument({
            indirects, root: { num: 1, gen: 0 },
            encrypt: {
                version: 5, revision: 5,
                method: 'AESV3',          // /StmF = /StrF = AESV3 CBC
                effMethod: 'AESV4',       // /EFF        = AESV4 GCM
                ownerPassword: ownerPw, userPassword: userPw,
                permissions: -4 | 0, randomBytes: rand
            }
        });

        const parsed = reparsePdf(out.bytes);
        const encInd = parsed.indirects.get(
            encryptRefFromTrailer(parsed.trailerDict).num);
        const typed = security.typeEncryptDict(encryptDictToLoose(encInd.value));
        const selection = security.selectHandler(typed,
            { v4: v4Mod, v5: v5Mod, v6: v6Mod });
        expect(selection.method).toBe('AESV3');
        expect(selection.strMethod).toBe('AESV3');
        expect(selection.effMethod).toBe('AESV4');

        const typedForPw = {
            V: 5, R: 5,
            O: typed.O, U: typed.U, OE: typed.OE, UE: typed.UE,
            Perms: typed.Perms, P: typed.P
        };
        const fek = v5Mod.tryPassword(typedForPw, userPw, false)
            .fileEncryptionKey;

        // EmbeddedFile stream payload — decrypts with AESV4 via EFF.
        const effInd = parsed.indirects.get(5);
        const streamPlain = security.dispatchDecryptStream(
            selection, effInd.value, fek, 5, 0, effInd.value.raw);
        expect(Array.from(streamPlain)).toEqual(Array.from(effStreamPayload));

        // /Desc string — encrypted as a string with /StrF (AESV3 CBC),
        // NOT /EFF. We decrypt via v5Mod.decryptString using method
        // AESV3, applied to the parsed string bytes.
        const descEnc = effInd.value.dict.entries.Desc;
        expect(descEnc).toBeDefined();
        expect(descEnc.type).toBe('string');
        // The serializer chose hex syntax (non-printable AES ciphertext).
        expect(descEnc.syntax).toBe('hex');
        const ctDesc = descEnc.value;
        const descRecovered = v5Mod.decryptString(
            { method: selection.strMethod }, fek, 5, 0, ctDesc);
        expect(Array.from(descRecovered)).toEqual(Array.from(descPlain));

        // Negative check: decrypting the /Desc string with /EFF
        // (AESV4 GCM) MUST fail (auth-tag mismatch or layout error).
        // Demonstrates strings are NOT routed through effMethod.
        let gcmDecryptFailed = false;
        try {
            gcmMod.decryptObjectGcm(fek, ctDesc);
        } catch (_e) {
            gcmDecryptFailed = true;
        }
        expect(gcmDecryptFailed).toBe(true);
    });
});
