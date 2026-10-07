// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Security Handler dispatcher.
 *
 * The /Encrypt dictionary (ISO 32000-2:2020 §7.6.2) is parsed into a typed
 * view via `typeEncryptDict`, then `selectHandler` dispatches to the
 * v5/v6 Standard handler instance.
 *
 * @module pdf/crypto/security
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';

export const pdfSecurity = {
    name: 'pdfSecurity',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { EncryptionError } = errors;

        function asUint8(v) {
            if (v == null) return undefined;
            if (v instanceof Uint8Array) return v;
            if (typeof v === 'string') {
                const out = new Uint8Array(v.length);
                for (let i = 0; i < v.length; i++) out[i] = v.charCodeAt(i) & 0xff;
                return out;
            }
            if (Array.isArray(v)) return new Uint8Array(v);
            return undefined;
        }

        function typeEncryptDict(dict) {
            if (dict == null || typeof dict !== 'object') {
                throw new EncryptionError('pdf/crypto/encrypt-dict/bad-input',
                    '/Encrypt must be a dictionary');
            }
            const get = (k) => (dict instanceof Map ? dict.get(k) : dict[k]);

            const V = get('V');
            const R = get('R');
            const Filter = get('Filter');
            if (V === undefined || R === undefined) {
                throw new EncryptionError('pdf/crypto/encrypt-dict/missing-V-R',
                    '/Encrypt requires both /V and /R',
                    { context: { V, R } });
            }
            if (typeof V !== 'number' || typeof R !== 'number') {
                throw new EncryptionError('pdf/crypto/encrypt-dict/bad-V-R-type',
                    '/V and /R must be integers',
                    { context: { V, R } });
            }
            return {
                V, R,
                Filter,
                SubFilter: get('SubFilter'),
                Length: get('Length'),
                CF: get('CF'),
                StmF: get('StmF'),
                StrF: get('StrF'),
                EFF: get('EFF'),
                O:    asUint8(get('O')),
                U:    asUint8(get('U')),
                OE:   asUint8(get('OE')),
                UE:   asUint8(get('UE')),
                Perms: asUint8(get('Perms')),
                EncryptMetadata: get('EncryptMetadata') !== false,
                P:    get('P'),
                raw:  dict
            };
        }

        function nameValue(v) {
            if (v == null) return null;
            if (typeof v === 'string') return v;
            if (typeof v === 'object' && v.type === 'name') return v.value;
            return null;
        }
        function dictGet(d, key) {
            if (d == null) return undefined;
            if (d instanceof Map) return d.get(key);
            if (typeof d === 'object' && d.type === 'dict' && d.entries) {
                return d.entries[key];
            }
            if (typeof d === 'object') return d[key];
            return undefined;
        }

        // Inspect `/CF /<StmF> /CFM` (StmF default name) to pick the
        // V=4 method — either 'AESV2' or 'V2'. Also resolves /StrF and
        // /EFF (embedded file filter, ISO 32000-1 §7.6.5).
        function resolveV4Method(typedEncrypt) {
            const stmFName = nameValue(typedEncrypt.StmF) || 'Identity';
            const strFName = nameValue(typedEncrypt.StrF) || 'Identity';
            const effName  = nameValue(typedEncrypt.EFF)  || stmFName;
            let streamMethod;
            if (stmFName === 'Identity') {
                if (strFName === 'Identity') streamMethod = 'Identity';
                else streamMethod = resolveCfmFor(typedEncrypt, strFName);
            } else {
                streamMethod = resolveCfmFor(typedEncrypt, stmFName);
            }
            const stringMethod = strFName === 'Identity'
                ? 'Identity'
                : resolveCfmFor(typedEncrypt, strFName);
            const embeddedFileMethod = effName === 'Identity'
                ? 'Identity'
                : resolveCfmFor(typedEncrypt, effName);
            return {
                method: streamMethod,
                strMethod: stringMethod,
                effMethod: embeddedFileMethod
            };
        }
        function resolveCfmFor(typedEncrypt, filterName) {
            const cf = typedEncrypt.CF;
            const entry = dictGet(cf, filterName);
            if (!entry) {
                throw new EncryptionError('pdf/crypto/v4/missing-cf-entry',
                    'V=4 requires /CF /' + filterName + ' entry',
                    { context: { filterName } });
            }
            const cfm = nameValue(dictGet(entry, 'CFM'));
            if (cfm !== 'AESV2' && cfm !== 'V2') {
                throw new EncryptionError('pdf/crypto/v4/bad-cfm',
                    'V=4 CFM must be AESV2 or V2',
                    { context: { cfm } });
            }
            return cfm;
        }

        // For V=5 R=5/R=6: inspect /CF /<name> /CFM to detect AESV3
        // (AES-256-CBC standard) vs AESV4 (AES-GCM, ISO/TS 32003).
        //
        // Identity rule (ISO 32000-2 §7.6.6, Table 20 defaults): a crypt
        // filter named `Identity` leaves its class unencrypted, and an
        // ABSENT /StmF or /StrF defaults to `Identity`. Each class resolves
        // independently: streams (/StmF), strings (/StrF) and embedded
        // files (/EFF, which defaults to /StmF when absent). An `Identity`
        // class resolves to the method `'Identity'`, never to AESV3.
        function resolveV5Method(typedEncrypt) {
            const stmFName = nameValue(typedEncrypt.StmF) || 'Identity';
            const strFName = nameValue(typedEncrypt.StrF) || 'Identity';
            const effName  = nameValue(typedEncrypt.EFF)  || stmFName;
            const streamMethod = stmFName === 'Identity'
                ? 'Identity'
                : resolveCfmForV5(typedEncrypt, stmFName);
            const stringMethod = strFName === 'Identity'
                ? 'Identity'
                : resolveCfmForV5(typedEncrypt, strFName);
            const embeddedFileMethod = effName === 'Identity'
                ? 'Identity'
                : resolveCfmForV5(typedEncrypt, effName);
            return {
                method: streamMethod,
                strMethod: stringMethod,
                effMethod: embeddedFileMethod
            };
        }
        function resolveCfmForV5(typedEncrypt, filterName) {
            const cf = typedEncrypt.CF;
            const entry = dictGet(cf, filterName);
            if (!entry) {
                // Default V=5 CFM = AESV3 when /CF is absent.
                return 'AESV3';
            }
            const cfm = nameValue(dictGet(entry, 'CFM'));
            if (cfm == null) return 'AESV3';
            if (cfm !== 'AESV3' && cfm !== 'AESV4') {
                throw new EncryptionError('pdf/crypto/v5/bad-cfm',
                    'V=5 CFM must be AESV3 or AESV4',
                    { context: { cfm } });
            }
            return cfm;
        }

        function selectHandler(typedEncrypt, handlers) {
            if (!typedEncrypt || typeof typedEncrypt !== 'object') {
                throw new EncryptionError('pdf/crypto/security/bad-typed',
                    'selectHandler requires a typed /Encrypt');
            }
            const { V, R } = typedEncrypt;
            if (V < 4) {
                throw new EncryptionError('pdf/crypto/unsupported-version',
                    'Security Handler V=' + V + ' is not supported at this level',
                    { context: { V, R } });
            }
            if (V === 4) {
                if (R !== 4) {
                    throw new EncryptionError('pdf/crypto/unsupported-version',
                        'Standard handler V=4 requires R=4',
                        { context: { V, R } });
                }
                if (!handlers || !handlers.v4) {
                    throw new EncryptionError('pdf/crypto/missing-handler',
                        'no v4 handler provided');
                }
                const m = resolveV4Method(typedEncrypt);
                return {
                    handler: handlers.v4, revision: 4,
                    method: m.method,
                    strMethod: m.strMethod,
                    effMethod: m.effMethod
                };
            }
            if (V !== 5) {
                throw new EncryptionError('pdf/crypto/unsupported-version',
                    'Security Handler V=' + V + ' is unknown',
                    { context: { V, R } });
            }
            if (R === 5) {
                if (!handlers || !handlers.v5) {
                    throw new EncryptionError('pdf/crypto/missing-handler',
                        'no v5 handler provided');
                }
                const m5 = resolveV5Method(typedEncrypt);
                return {
                    handler: handlers.v5, revision: 5,
                    method: m5.method,
                    strMethod: m5.strMethod,
                    effMethod: m5.effMethod
                };
            }
            if (R === 6) {
                if (!handlers || !handlers.v6) {
                    throw new EncryptionError('pdf/crypto/missing-handler',
                        'no v6 handler provided');
                }
                const m6 = resolveV5Method(typedEncrypt);
                return {
                    handler: handlers.v6, revision: 6,
                    method: m6.method,
                    strMethod: m6.strMethod,
                    effMethod: m6.effMethod
                };
            }
            throw new EncryptionError('pdf/crypto/unsupported-version',
                'Standard handler revision R=' + R + ' is not supported',
                { context: { V, R } });
        }

        // Read-side pipeline wire-up for /EFF (ISO 32000-1 §7.6.5).
        //
        // The standard handler exposes two stream wrappers:
        //   - decryptStream         (uses selection.method   = /StmF resolved CFM)
        //   - decryptEmbeddedFile   (uses selection.effMethod = /EFF  resolved CFM)
        //
        // `isEmbeddedFileStream(stream)` inspects the stream dict for
        // `/Type /EmbeddedFile`. When true, the consumer MUST route via
        // `decryptEmbeddedFile` with a typedEncrypt view whose `.method`
        // is the resolved `effMethod`. Otherwise it routes via
        // `decryptStream` with `.method = streamMethod`.
        function isEmbeddedFileStream(stream) {
            if (!stream || stream.type !== 'stream') return false;
            const d = stream.dict;
            if (!d || d.type !== 'dict' || !d.entries) return false;
            const t = d.entries.Type;
            if (!t) return false;
            if (t.type === 'name') return t.value === 'EmbeddedFile';
            if (typeof t === 'string') return t === 'EmbeddedFile';
            return false;
        }

        // dispatchDecryptStream(selection, stream, fek, objNum, gen, ciphertext)
        //   selection : output of selectHandler({...}) — must carry
        //               { handler, method, effMethod }.
        //   stream    : the typed PDF stream object (with .dict.entries),
        //               used to detect /Type /EmbeddedFile.
        //   fek, objNum, gen, ciphertext : per-object decryption inputs.
        //
        // Routes to handler.decryptEmbeddedFile (with method=effMethod)
        // when the stream is an embedded file, otherwise to
        // handler.decryptStream (with method=streamMethod).
        //
        // When the method about to be dispatched is `'Identity'` (the
        // class is not encrypted, ISO 32000-2 §7.6.6), `ciphertext` is
        // returned unchanged and no handler is called — on every revision
        // (V=4, V=5 R=5, V=5 R=6). The standard handlers never see
        // `'Identity'`.
        function dispatchDecryptStream(selection, stream, fek, objNum, gen, ciphertext) {
            if (!selection || typeof selection !== 'object'
                    || !selection.handler) {
                throw new EncryptionError('pdf/crypto/security/bad-selection',
                    'dispatchDecryptStream requires a selection from selectHandler');
            }
            const h = selection.handler;
            const embedded = isEmbeddedFileStream(stream);
            const active = embedded ? selection.effMethod : selection.method;
            if (active === 'Identity') return ciphertext;
            if (embedded) {
                const typedView = { method: selection.effMethod };
                // V=4 exposes a dedicated `decryptEmbeddedFile`; V=5/V=6
                // do not — for those handlers `decryptStream` already
                // dispatches purely on `typedView.method`, so routing
                // through it with `method = effMethod` is equivalent.
                if (typeof h.decryptEmbeddedFile === 'function') {
                    return h.decryptEmbeddedFile(
                        typedView, fek, objNum, gen, ciphertext);
                }
                if (typeof h.decryptStream === 'function') {
                    return h.decryptStream(
                        typedView, fek, objNum, gen, ciphertext);
                }
                throw new EncryptionError('pdf/crypto/security/no-eff',
                    'selected handler lacks decryptEmbeddedFile and decryptStream');
            }
            if (typeof h.decryptStream !== 'function') {
                throw new EncryptionError('pdf/crypto/security/no-stream',
                    'selected handler lacks decryptStream');
            }
            const typedView = { method: selection.method };
            return h.decryptStream(typedView, fek, objNum, gen, ciphertext);
        }

        return {
            typeEncryptDict, selectHandler,
            isEmbeddedFileStream, dispatchDecryptStream
        };
    }
};
