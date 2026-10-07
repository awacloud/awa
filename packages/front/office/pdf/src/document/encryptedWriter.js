// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Encrypted Document writer (V=4/5/6 handlers, AES-GCM).
 *
 * Wraps `pdfWriter.writeDocument` with an `encrypt` path:
 *
 *   - V=4, R=4 — PDF 1.6 Standard Security Handler. method:
 *     'AESV2' (AES-128 CBC) or 'V2' (RC4-128). Per-object key
 *     derivation (MD5 of FEK || objId || gen [+ 'sAlT' for AESV2]).
 *   - V=5, R=5 — Adobe Extension Level 3 (AES-256-CBC, SHA-256, no
 *     hardening loop).
 *   - V=5, R=6 — ISO 32000-2:2020 (AES-256-CBC, Algorithm 2.B
 *     hardening, SHA-256/384/512). With method 'AESV4' an ISO/TS
 *     32003 AES-256-GCM crypt filter is emitted (IV || ct || tag).
 *
 * Strategy:
 *
 * 1. Derive a 32-byte file encryption key (FEK) from `randomBytes`
 *    (caller-supplied for determinism in tests).
 * 2. Build `/O`, `/U`, `/OE`, `/UE` via the per-revision helpers
 *    exposed by `pdfStandardV5` / `pdfStandardV6` (`buildUUE`,
 *    `buildOOE`).
 * 3. Build `/Perms` (Algorithm 10) carrying `P` + `EncryptMetadata`.
 * 4. Walk the indirect graph, encrypt every `string` (literal or
 *    hex) and every `stream` `.raw` payload in place — each with a
 *    fresh 16-byte IV — producing a new graph.
 * 5. Append an `/Encrypt` indirect (last object number) to the graph.
 * 6. Call `pdfWriter.writeDocument({ indirects, root, info, id })`
 *    with `id` matching the one baked into the FEK derivation when
 *    relevant (V=5 ignores /ID in key derivation per the spec).
 *
 * @module pdf/document/encryptedWriter
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfWriter } from './writer.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfStandardV6 } from '../crypto/standardV6.js';
import { pdfStandardV4 } from '../crypto/standardV4.js';
import { pdfAesGcm } from '../crypto/aesGcm.js';

export const pdfEncryptedWriter = {
    name: 'pdfEncryptedWriter',
    dependencies: [
        'pdfErrors',
        'pdfWriter',
        'pdfStandardV5',
        'pdfStandardV6',
        'pdfStandardV4',
        'pdfAesGcm'
    ],
    deps: [pdfErrors, pdfWriter, pdfStandardV5, pdfStandardV6, pdfStandardV4, pdfAesGcm],
    factory(errors, writerMod, v5Mod, v6Mod, v4Mod, gcmMod) {
        const { EncryptionError, RenderError } = errors;
        const writeDocument = writerMod && writerMod.writeDocument;

        if (typeof writeDocument !== 'function') {
            throw new EncryptionError('pdf/crypto/enc-writer/missing-writer',
                'pdfEncryptedWriter requires pdfWriter.writeDocument');
        }

        // Cryptographic randomness only: `enc.randomBytes`, else
        // `globalThis.crypto.getRandomValues` (read per call), else a typed refusal.
        function resolveRandomBytes(enc) {
            if (enc.randomBytes) return enc.randomBytes;
            if (globalThis.crypto
                    && typeof globalThis.crypto.getRandomValues === 'function') {
                return (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
            }
            throw new EncryptionError('pdf/crypto/enc-writer/no-random',
                'no cryptographic random source: pass opts.encrypt.randomBytes '
                + '(crypto.getRandomValues is unavailable)');
        }

        function selectHandler(version, revision) {
            if (version === 5 && revision === 5) return v5Mod;
            if (version === 5 && revision === 6) return v6Mod;
            if (version === 4 && revision === 4) {
                if (!v4Mod) {
                    throw new EncryptionError('pdf/crypto/enc-writer/missing-v4',
                        'V=4 requires pdfStandardV4');
                }
                return v4Mod;
            }
            throw new EncryptionError('pdf/crypto/enc-writer/unsupported-version',
                'encrypted write supports V=4 R=4, V=5 R=5, or V=5 R=6',
                { context: { version, revision } });
        }

        function bytesToObj(bytes) {
            // Produce a typed PDF string carrying raw bytes; the
            // serializer will pick a representation (hex preferred
            // when bytes are non-printable, which is the case for
            // AES-256 ciphertext).
            return { type: 'string', value: bytes, syntax: 'hex' };
        }

        function intObj(n)   { return { type: 'int',  value: n | 0 }; }
        function nameObj(s)  { return { type: 'name', value: s }; }
        function boolObj(b)  { return { type: 'bool', value: !!b }; }

        // Detect /Type /EmbeddedFile streams — used by the EFF dispatch
        // path so we can route through `encryptEmbeddedFile` with the
        // /EFF-resolved method instead of `encryptStream` with /StmF.
        // Mirrors `pdfSecurity.isEmbeddedFileStream` (read side,
        // Follow-up J).
        function isEmbeddedFileStream(value) {
            if (!value || value.type !== 'stream') return false;
            const d = value.dict;
            if (!d || d.type !== 'dict' || !d.entries) return false;
            const t = d.entries.Type;
            if (!t) return false;
            if (t.type === 'name') return t.value === 'EmbeddedFile';
            if (typeof t === 'string') return t === 'EmbeddedFile';
            return false;
        }

        function encryptObjectInPlace(value, encryptOne, encryptEmbedded) {
            // Recursively walk a typed object graph, encrypting
            // strings and stream payloads with `encryptOne(bytes)`.
            // When `encryptEmbedded` is provided AND a stream is
            // detected as /Type /EmbeddedFile, the stream payload is
            // routed via `encryptEmbedded(bytes)` instead — used by
            // the EFF write dispatch (Follow-up O, ISO 32000-1 §7.6.5).
            if (!value || typeof value !== 'object') return value;
            switch (value.type) {
                case 'string': {
                    const ct = encryptOne(value.value);
                    return { type: 'string', value: ct, syntax: 'hex' };
                }
                case 'array': {
                    const items = new Array(value.items.length);
                    for (let i = 0; i < value.items.length; i++) {
                        items[i] = encryptObjectInPlace(
                            value.items[i], encryptOne, encryptEmbedded);
                    }
                    return { type: 'array', items };
                }
                case 'dict': {
                    const entries = {};
                    for (const k of Object.keys(value.entries)) {
                        entries[k] = encryptObjectInPlace(
                            value.entries[k], encryptOne, encryptEmbedded);
                    }
                    return { type: 'dict', entries };
                }
                case 'stream': {
                    const dict = encryptObjectInPlace(
                        value.dict, encryptOne, encryptEmbedded);
                    const useEff = encryptEmbedded
                        && isEmbeddedFileStream(value);
                    const enc = useEff ? encryptEmbedded : encryptOne;
                    const raw  = value.raw instanceof Uint8Array
                        ? enc(value.raw)
                        : value.raw;
                    return { type: 'stream', dict, raw };
                }
                default:
                    return value;
            }
        }

        function buildEncryptDict(meta) {
            const e = {
                Filter: nameObj('Standard'),
                V: intObj(meta.V),
                R: intObj(meta.R),
                Length: intObj(meta.keyBits),
                P: intObj(meta.P),
                O: bytesToObj(meta.O),
                U: bytesToObj(meta.U),
                EncryptMetadata: boolObj(meta.encryptMetadata !== false)
            };
            if (meta.OE)    e.OE    = bytesToObj(meta.OE);
            if (meta.UE)    e.UE    = bytesToObj(meta.UE);
            if (meta.Perms) e.Perms = bytesToObj(meta.Perms);

            // /CF — crypt filters. /StdCF is the default for /StmF and
            // /StrF. When `effCfm` is distinct from `cfm`, an
            // additional `/StdEFF` crypt filter is emitted and /EFF
            // names it; otherwise /EFF falls back to /StdCF.
            //
            // CFM values:
            //   - V=4 + 'AESV2' → CFM=AESV2 (AES-128 CBC), Length=16
            //   - V=4 + 'V2'    → CFM=V2    (RC4-128),     Length=16
            //   - V=5 + 'AESV3' → CFM=AESV3 (AES-256 CBC), Length=32
            //   - V=5 + 'AESV4' → CFM=AESV4 (AES-256 GCM), Length=32
            const cfm = meta.cfm;
            const cfLength = meta.cfLength;
            const cfEntries = {
                StdCF: {
                    type: 'dict',
                    entries: {
                        CFM: nameObj(cfm),
                        AuthEvent: nameObj('DocOpen'),
                        Length: intObj(cfLength)
                    }
                }
            };
            const effCfm = meta.effCfm;
            const useDistinctEff = effCfm && effCfm !== cfm;
            if (useDistinctEff) {
                cfEntries.StdEFF = {
                    type: 'dict',
                    entries: {
                        CFM: nameObj(effCfm),
                        AuthEvent: nameObj('DocOpen'),
                        Length: intObj(meta.effCfLength | 0 || cfLength)
                    }
                };
            }
            e.CF = { type: 'dict', entries: cfEntries };
            e.StmF = nameObj('StdCF');
            e.StrF = nameObj('StdCF');
            // /EFF (ISO 32000-1 §7.6.5) names the crypt filter used for
            // /Type /EmbeddedFile streams. When unspecified, readers
            // fall back to /StmF — we keep the field omitted in that
            // case to match the prior behaviour.
            if (useDistinctEff) {
                e.EFF = nameObj('StdEFF');
            }
            return { type: 'dict', entries: e };
        }

        function nextObjNum(indirects) {
            let max = 0;
            for (const it of indirects) {
                if (it && Number.isFinite(it.num) && it.num > max) max = it.num;
            }
            return max + 1;
        }

        /**
         * writeEncryptedDocument(opts) — produce a /Encrypt-protected
         * PDF.
         *
         * opts mirrors `writeDocument` plus:
         *
         *   encrypt: {
         *       version: 5,
         *       revision: 5 | 6,
         *       keyBits: 256,
         *       ownerPassword: string | Uint8Array,
         *       userPassword:  string | Uint8Array,
         *       permissions:   number,    // /P bitmask (Table 24)
         *       encryptMetadata?: boolean,
         *       randomBytes?: (n) => Uint8Array
         *           // default `globalThis.crypto.getRandomValues`; when
         *           // neither exists the call throws
         *           // `pdf/crypto/enc-writer/no-random`
         *   }
         *
         * Returns { bytes, encryptObjNum, fek, id }.
         */
        function writeEncryptedDocument(opts) {
            if (!opts || typeof opts !== 'object') {
                throw new RenderError('pdf/crypto/enc-writer/bad-input',
                    'writeEncryptedDocument requires opts');
            }
            const enc = opts.encrypt;
            if (!enc || typeof enc !== 'object') {
                throw new RenderError('pdf/crypto/enc-writer/no-encrypt',
                    'opts.encrypt is required');
            }
            const version  = enc.version  | 0;
            const revision = enc.revision | 0;
            const handler  = selectHandler(version, revision);
            const rand     = resolveRandomBytes(enc);
            const encryptMetadata = enc.encryptMetadata !== false;
            const P = enc.permissions | 0;

            // Resolve method + key size per (version, revision).
            // Default method:
            //   - V=4 R=4 → 'AESV2' (modern V=4 default)
            //   - V=5 R=5/6 → 'AESV3' (CBC) ; opt-in 'AESV4' (GCM)
            let method = enc.method;
            if (!method) method = (version === 4) ? 'AESV2' : 'AESV3';

            // Validate method against (version, revision).
            if (version === 4 && method !== 'AESV2' && method !== 'V2') {
                throw new RenderError('pdf/crypto/enc-writer/bad-method',
                    'V=4 method must be AESV2 or V2',
                    { context: { method } });
            }
            if (version === 5 && method !== 'AESV3' && method !== 'AESV4') {
                throw new RenderError('pdf/crypto/enc-writer/bad-method',
                    'V=5 method must be AESV3 or AESV4',
                    { context: { method } });
            }
            if (method === 'AESV4' && !gcmMod) {
                throw new EncryptionError('pdf/crypto/enc-writer/missing-gcm',
                    'AESV4 (GCM) requires pdfAesGcm');
            }

            // Optional /EFF method — distinct cipher for /Type
            // /EmbeddedFile streams (ISO 32000-1 §7.6.5, Follow-up O).
            // When set, the writer dispatches embedded-file streams
            // through `handler.encryptEmbeddedFile` (V=4) or the GCM
            // wrapper (V=5/AESV4) with the EFF method, while regular
            // streams stay on /StmF. Validated against (V, R) using the
            // same rules as `method`.
            const effMethod = enc.effMethod || null;
            if (effMethod) {
                if (version === 4
                        && effMethod !== 'AESV2' && effMethod !== 'V2') {
                    throw new RenderError('pdf/crypto/enc-writer/bad-eff-method',
                        'V=4 effMethod must be AESV2 or V2',
                        { context: { effMethod } });
                }
                if (version === 5
                        && effMethod !== 'AESV3' && effMethod !== 'AESV4') {
                    throw new RenderError('pdf/crypto/enc-writer/bad-eff-method',
                        'V=5 effMethod must be AESV3 or AESV4',
                        { context: { effMethod } });
                }
                if (effMethod === 'AESV4' && !gcmMod) {
                    throw new EncryptionError('pdf/crypto/enc-writer/missing-gcm',
                        'AESV4 (GCM) effMethod requires pdfAesGcm');
                }
            }

            const fekBytes = (version === 4) ? 16 : 32;
            const keyBits  = enc.keyBits | 0 || (fekBytes * 8);

            // id is required for V=4 key derivation (and PDF mandates
            // /ID when /Encrypt is present). Produce it now.
            let id = opts.id;
            if (!id) {
                const a = rand(16);
                const b = rand(16);
                id = [a, b];
            }
            const idFirst = id[0] instanceof Uint8Array ? id[0] : new Uint8Array(id[0]);

            // Step 1 — fresh FEK + build /O, /U (+ /OE, /UE, /Perms for V=5).
            let fek, O, U, OE, UE, Perms;
            if (version === 4) {
                const ou = handler.buildOU(
                    enc.ownerPassword, enc.userPassword, P, idFirst, encryptMetadata);
                O = ou.O;
                U = ou.U;
                fek = ou.fek;
                OE = null; UE = null; Perms = null;
            } else {
                fek = rand(32);
                const uValSalt = rand(8);
                const uKeySalt = rand(8);
                const oValSalt = rand(8);
                const oKeySalt = rand(8);
                const u = handler.buildUUE(enc.userPassword, fek, uValSalt, uKeySalt);
                U = u.U; UE = u.UE;
                const o = handler.buildOOE(enc.ownerPassword, fek, U, oValSalt, oKeySalt);
                O = o.O; OE = o.OE;
                Perms = handler.buildPerms(P, fek, encryptMetadata, rand);
            }

            // Step 2 — encrypt strings/streams in the graph.
            // Per-object encryption requires (objNum, gen) for V=4.
            // Two factories produced per object — one for /StmF (regular
            // streams + strings), one for /EFF (embedded files) when a
            // distinct effMethod is configured.
            function makeEncryptForMethod(activeMethod) {
                const typedEncrypt = {
                    V: version, R: revision, method: activeMethod
                };
                return function makeEnc(objNum, gen) {
                    if (activeMethod === 'AESV4') {
                        return function encryptOneGcm(plain) {
                            const ivProvider = () => rand(12);
                            return gcmMod.encryptObjectGcm(
                                fek, plain, ivProvider);
                        };
                    }
                    if (version === 4) {
                        const isEmbedded = activeMethod === effMethod
                            && effMethod !== null
                            && typeof handler.encryptEmbeddedFile === 'function';
                        return function encryptOneV4(plain) {
                            const iv = (activeMethod === 'AESV2')
                                ? rand(16) : null;
                            return isEmbedded
                                ? handler.encryptEmbeddedFile(
                                    typedEncrypt, fek, objNum, gen, plain, iv)
                                : handler.encryptStream(
                                    typedEncrypt, fek, objNum, gen, plain, iv);
                        };
                    }
                    return function encryptOneV5(plain) {
                        const iv = rand(16);
                        return handler.encryptStream(
                            typedEncrypt, fek, objNum, gen, plain, iv);
                    };
                };
            }
            const makeStmEnc = makeEncryptForMethod(method);
            const makeEffEnc = effMethod
                ? makeEncryptForMethod(effMethod)
                : null;

            const inIndirects = opts.indirects || [];
            const outIndirects = new Array(inIndirects.length);
            for (let i = 0; i < inIndirects.length; i++) {
                const it = inIndirects[i];
                const encStm = makeStmEnc(it.num | 0, it.gen | 0);
                const encEff = makeEffEnc
                    ? makeEffEnc(it.num | 0, it.gen | 0)
                    : null;
                outIndirects[i] = {
                    num: it.num,
                    gen: it.gen,
                    value: encryptObjectInPlace(it.value, encStm, encEff)
                };
            }

            // Step 3 — append /Encrypt indirect.
            const encNum = nextObjNum(outIndirects);
            const cfLength = (version === 4) ? 16 : 32;
            outIndirects.push({
                num: encNum,
                gen: 0,
                value: buildEncryptDict({
                    V: version, R: revision, keyBits, P,
                    O, U, OE, UE, Perms, encryptMetadata,
                    cfm: method, cfLength,
                    effCfm: effMethod || null,
                    effCfLength: effMethod ? cfLength : 0
                })
            });

            // Step 4 — emit.
            const bytes = writeEncryptedTrailer({
                indirects: outIndirects,
                root: opts.root,
                info: opts.info,
                id,
                version: opts.version,
                encryptRef: { num: encNum, gen: 0 }
            });

            return {
                bytes, encryptObjNum: encNum, fek, id,
                O, U, OE, UE, Perms,
                version, revision, method, effMethod
            };
        }

        // The base writeDocument does not know about /Encrypt in the
        // trailer. We inline the same logic but inject the /Encrypt
        // reference into the trailer dict. Implementation mirrors
        // `pdfWriter.writeDocument` and is kept minimal — when the
        // base writer learns /Encrypt natively this can be removed.
        const te = new TextEncoder();
        function concat(arrays) {
            let n = 0;
            for (const a of arrays) n += a.length;
            const out = new Uint8Array(n);
            let o = 0;
            for (const a of arrays) { out.set(a, o); o += a.length; }
            return out;
        }
        function writeEncryptedTrailer(opts) {
            // Trick: emit the body via the base writer (header + objects +
            // xref + trailer), then re-emit only the trailer to include
            // /Encrypt. The base writer is stable and well-tested, so we
            // instead rebuild a parallel path here. Keep it tight.
            //
            // Per the base writer we need: header → objects → xref →
            // trailer (with /Encrypt added) → startxref → %%EOF.
            // The writer module doesn't export its serializer. We must
            // re-route through writeDocument with a placeholder, then
            // patch the trailer.
            //
            // Simpler: re-implement here using the serializer we get
            // from writerMod — but writerMod only exposes writeDocument
            // / assembleIndirects. Strategy: call writeDocument, then
            // patch the trailer dict to insert /Encrypt N 0 R.

            const baseBytes = writeDocument({
                indirects: opts.indirects,
                root: opts.root,
                info: opts.info,
                id: opts.id,
                version: opts.version
            });

            // Locate "trailer\n<< /Size ..." and inject " /Encrypt N 0 R"
            // just before the closing " >>". Operates on bytes — the
            // base writer guarantees ASCII for the trailer dict.
            const trailerKey = te.encode('trailer\n<<');
            let pos = -1;
            for (let i = baseBytes.length - 256; i < baseBytes.length - trailerKey.length; i++) {
                if (i < 0) continue;
                let match = true;
                for (let k = 0; k < trailerKey.length; k++) {
                    if (baseBytes[i + k] !== trailerKey[k]) { match = false; break; }
                }
                if (match) { pos = i; break;}
            }
            // Fallback — scan whole file (small enough).
            if (pos < 0) {
                outer: for (let i = 0; i < baseBytes.length - trailerKey.length; i++) {
                    for (let k = 0; k < trailerKey.length; k++) {
                        if (baseBytes[i + k] !== trailerKey[k]) continue outer;
                    }
                    pos = i; break;
                }
            }
            if (pos < 0) {
                throw new RenderError('pdf/crypto/enc-writer/no-trailer',
                    'base writer output did not contain a trailer');
            }
            // Find ' >>\n' after pos.
            const close = te.encode(' >>\n');
            let cposEnd = -1;
            for (let i = pos; i < baseBytes.length - close.length; i++) {
                let match = true;
                for (let k = 0; k < close.length; k++) {
                    if (baseBytes[i + k] !== close[k]) { match = false; break; }
                }
                if (match) { cposEnd = i; break; }
            }
            if (cposEnd < 0) {
                throw new RenderError('pdf/crypto/enc-writer/no-trailer-close',
                    'base writer output did not contain a closing trailer dict');
            }
            const inject = te.encode(
                ` /Encrypt ${opts.encryptRef.num} ${opts.encryptRef.gen | 0} R`);

            // The trailer offset hasn't changed (objects + xref happen
            // before trailer), but the startxref pointer encoded
            // inside the trailer block also hasn't moved. We must,
            // however, ensure that startxref still points to the same
            // xref offset — which is true because we only inject
            // bytes *after* the trailer offset in the file (within
            // the trailer dict itself, which lives at the end).
            //
            // But xref offsets inside the table are NOT affected
            // (they refer to object positions, all before the
            // trailer). So we can splice safely.
            const head = baseBytes.subarray(0, cposEnd);
            const tail = baseBytes.subarray(cposEnd);
            return concat([head, inject, tail]);
        }

        return { writeEncryptedDocument };
    }
};
