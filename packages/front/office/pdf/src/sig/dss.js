// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PAdES-LT Document Security Store builder — produces
 * the indirect objects (certs / OCSPs / CRLs / DSS dict / VRI dict)
 * that a level-LT signer appends via the incremental writer to the
 * already-signed (level B/T) PDF bytes.
 *
 * Spec : ETSI EN 319 142-1 V1.1.1 §5.4, ISO 32000-2:2020 §12.8.4.3.
 *
 *   DSS ::= <<
 *     /Type /DSS
 *     /Certs [N₁ 0 R N₂ 0 R …]    -- optional
 *     /OCSPs [Nk 0 R …]           -- optional
 *     /CRLs  [Nj 0 R …]           -- optional
 *     /VRI   << /<sigHashHex> << /Cert [...] /OCSP [...] /CRL [...]
 *                                 /TU? (M:...) /TS? Nₜ 0 R >> … >>
 *   >>
 *
 * Each referenced cert/OCSP/CRL is an indirect *stream* whose body is
 * the raw DER bytes and whose dict carries the `/Type /CertVal`,
 * `/OCSPVal` or `/CRLVal` marker (Adobe extension, widely deployed).
 *
 * The factory does NOT touch the byte buffer. It produces a list of
 * `{ num, gen, value }` updates compatible with
 * `pdfIncrementalWriter.appendIncremental`, plus the DSS object number
 * so the caller can also append an updated Catalog carrying
 * `/DSS dssNum 0 R`.
 *
 * @module pdf/sig/dss
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfSha1 } from './sha1.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

export const pdfDssBuilder = {
    name: 'pdfDssBuilder',
    dependencies: ['pdfErrors', 'pdfSha1', 'bitArray'],
    deps: [pdfErrors, pdfSha1, bitArray],
    factory(errors, sha1Mod, bitArray) {
        const { ContractError } = errors;

        // ── SHA-1 hoisted to fw (FIPS 180-4 §6.1) ────────────────────
        // Used solely for VRI key derivation per ISO 32000-2 §12.8.4.3
        // (the VRI dict keys are the uppercase hex SHA-1 of each
        // signature value bytes). SHA-1 is deprecated for general
        // cryptographic use but PDF VRI keys still mandate it.
        function _sha1(bytes) {
            const digestBa = sha1Mod.hash(bitArray.ui8_to_ba(bytes));
            return bitArray.ba_to_ui8(digestBa);
        }
        // PDF date string per ISO 32000-2:2020 §7.9.4 :
        //   (D:YYYYMMDDHHmmSS+HH'mm') — used here for VRI `TU` entries
        //   (ISO 32000-2 §12.8.4.3 : the time at which validation data
        //   was obtained). Always emitted in UTC (`+00'00'`) so the
        //   value is stable across runs and machine timezones.
        function _pdfDate(date) {
            const d = date instanceof Date ? date : new Date();
            function p2(n) { return (n < 10 ? '0' : '') + n; }
            return '(D:'
                + d.getUTCFullYear()
                + p2(d.getUTCMonth() + 1)
                + p2(d.getUTCDate())
                + p2(d.getUTCHours())
                + p2(d.getUTCMinutes())
                + p2(d.getUTCSeconds())
                + "+00'00')";
        }
        function _toHexUpper(bytes) {
            let s = '';
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                s += (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
            }
            return s;
        }
        function _scanSignatureContentsHex(bytes) {
            // Find every `/Type /Sig` (incl. /DocTimeStamp) and extract
            // the `/Contents <…hex…>` literal. Returns an array of
            // uppercase hex strings (the raw hex from /Contents).
            let s = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                s += String.fromCharCode.apply(null,
                    bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
            }
            const out = [];
            const re = /(\d+)\s+(\d+)\s+obj\s*<<([\s\S]*?)>>\s*endobj/g;
            let m;
            while ((m = re.exec(s)) !== null) {
                const body = m[3];
                if (!/\/Type\s*\/(?:Sig|DocTimeStamp)\b/.test(body)) continue;
                const cm = body.match(/\/Contents\s*<([0-9A-Fa-f]*)>/);
                if (!cm) continue;
                out.push(cm[1]);
            }
            return out;
        }


        function _refObj(num, gen) {
            return { type: 'ref', num: num | 0, gen: gen | 0 };
        }
        function _intObj(v) { return { type: 'int', value: v | 0 }; }
        function _nameObj(v) { return { type: 'name', value: String(v) }; }
        function _strHexObj(s) {
            // s is an ASCII hex string (e.g. SHA-1 of signature value).
            // Emit it as a regular PDF string ; PDF VRI keys are NAMES
            // composed of the hex characters per ISO 32000-2 §12.8.4.3.
            return { type: 'name', value: String(s) };
        }
        function _arrayObj(items) { return { type: 'array', items }; }
        function _dictObj(entries) { return { type: 'dict', entries }; }
        function _streamObj(rawBytes, typeName) {
            // Stream dict carries /Type — the writer auto-adds /Length.
            return {
                type: 'stream',
                dict: _dictObj({
                    Type: _nameObj(typeName)
                }),
                raw: rawBytes
            };
        }

        /**
         * Build DSS + supporting streams for an incremental append.
         *
         * @param {Object} args
         * @param {Uint8Array[]} [args.certs] Cert DER bytes — required for
         *   a useful DSS (at least one signer cert + chain).
         * @param {Uint8Array[]} [args.ocsps] OCSP response DER bytes.
         * @param {Uint8Array[]} [args.crls]  CRL DER bytes.
         * @param {Object<string, Object>} [args.vri] Map of signature-hash
         *   hex → { certs?, ocsps?, crls?, tu?, ts? } (each list is an
         *   array of *indices* into the parent certs/ocsps/crls lists, or
         *   raw DER bytes; ts? is a TimeStampToken DER as a stream).
         * @param {number} args.startNum First free object number to
         *   allocate (subsequent objects are sequential).
         * @returns {{ updates: Array, dssNum: number, lastNum: number,
         *             certNums: number[], ocspNums: number[],
         *             crlNums: number[] }}
         */
        function buildDss(args) {
            args = args || {};
            const startNum = args.startNum | 0;
            if (!Number.isFinite(startNum) || startNum < 2) {
                throw new ContractError('pdf/dss/bad-startNum',
                    'buildDss requires opts.startNum >= 2',
                    { context: { startNum } });
            }
            const certs = Array.isArray(args.certs) ? args.certs : [];
            const ocsps = Array.isArray(args.ocsps) ? args.ocsps : [];
            const crls  = Array.isArray(args.crls)  ? args.crls  : [];

            for (const c of certs) {
                if (!(c instanceof Uint8Array)) {
                    throw new ContractError('pdf/dss/bad-cert',
                        'each cert must be a Uint8Array (DER)');
                }
            }
            for (const o of ocsps) {
                if (!(o instanceof Uint8Array)) {
                    throw new ContractError('pdf/dss/bad-ocsp',
                        'each ocsp must be a Uint8Array (DER)');
                }
            }
            for (const c of crls) {
                if (!(c instanceof Uint8Array)) {
                    throw new ContractError('pdf/dss/bad-crl',
                        'each crl must be a Uint8Array (DER)');
                }
            }

            const updates = [];
            let n = startNum;

            const certNums = [];
            for (const der of certs) {
                certNums.push(n);
                updates.push({ num: n, gen: 0, value: _streamObj(der, 'CertVal') });
                n++;
            }
            const ocspNums = [];
            for (const der of ocsps) {
                ocspNums.push(n);
                updates.push({ num: n, gen: 0, value: _streamObj(der, 'OCSPVal') });
                n++;
            }
            const crlNums = [];
            for (const der of crls) {
                crlNums.push(n);
                updates.push({ num: n, gen: 0, value: _streamObj(der, 'CRLVal') });
                n++;
            }

            // Optional VRI auto-population : scan parent PDF bytes for
            // every signature, derive the SHA-1(/Contents hex) key, and
            // synthesise a VRI entry referencing all certs/ocsps/crls.
            let vriArg = args.vri;
            if (args.autoVri && args.parentBytes instanceof Uint8Array) {
                const sigContents = _scanSignatureContentsHex(args.parentBytes);
                const auto = vriArg && typeof vriArg === 'object'
                    ? Object.assign({}, vriArg) : {};
                const allCertIdx = certs.map((_, i) => i);
                const allOcspIdx = ocsps.map((_, i) => i);
                const allCrlIdx  = crls.map((_, i) => i);
                // VRI `TU` = time at which validation data was obtained
                // (ISO 32000-2 §12.8.4.3). PDF date string per §7.9.4.
                // `args.vriTime` overrides the default of `new Date()` so
                // tests can pin a deterministic value.
                const tuDate = args.vriTime instanceof Date
                    ? args.vriTime : new Date();
                const tuPdfStr = _pdfDate(tuDate);
                for (const hex of sigContents) {
                    // SHA-1 of the *raw signature value bytes* (the binary
                    // decoded from the /Contents hex literal), uppercase hex.
                    const sigBytes = new Uint8Array(hex.length >>> 1);
                    for (let i = 0; i < sigBytes.length; i++) {
                        sigBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
                    }
                    const key = _toHexUpper(_sha1(sigBytes));
                    if (auto[key]) continue;
                    const entry = { tu: tuPdfStr };
                    if (allCertIdx.length) entry.certs = allCertIdx;
                    if (allOcspIdx.length) entry.ocsps = allOcspIdx;
                    if (allCrlIdx.length)  entry.crls  = allCrlIdx;
                    auto[key] = entry;
                }
                vriArg = auto;
            }
            let vriEntries = null;
            if (vriArg && typeof vriArg === 'object') {
                vriEntries = {};
                for (const k of Object.keys(vriArg)) {
                    const v = vriArg[k] || {};
                    const e = {};
                    function _refsFrom(spec, parentNums) {
                        if (!Array.isArray(spec)) return null;
                        const refs = [];
                        for (const it of spec) {
                            if (typeof it === 'number') {
                                if (it < 0 || it >= parentNums.length) {
                                    throw new ContractError('pdf/dss/vri-bad-index',
                                        'VRI index out of bounds',
                                        { context: { index: it } });
                                }
                                refs.push(_refObj(parentNums[it], 0));
                            } else if (it instanceof Uint8Array) {
                                // Promote raw DER to a new stream.
                                const newNum = n++;
                                updates.push({ num: newNum, gen: 0,
                                    value: _streamObj(it, 'CertVal') });
                                refs.push(_refObj(newNum, 0));
                            }
                        }
                        return _arrayObj(refs);
                    }
                    const c = _refsFrom(v.certs, certNums);
                    const o = _refsFrom(v.ocsps, ocspNums);
                    const r = _refsFrom(v.crls, crlNums);
                    if (c) e.Cert = c;
                    if (o) e.OCSP = o;
                    if (r) e.CRL  = r;
                    if (typeof v.tu === 'string') {
                        e.TU = { type: 'string',
                                 value: new TextEncoder().encode(v.tu) };
                    }
                    if (v.ts instanceof Uint8Array) {
                        const newNum = n++;
                        updates.push({ num: newNum, gen: 0,
                            value: _streamObj(v.ts, 'TS') });
                        e.TS = _refObj(newNum, 0);
                    }
                    vriEntries[k] = _dictObj(e);
                }
            }

            const dssEntries = { Type: _nameObj('DSS') };
            if (certNums.length) {
                dssEntries.Certs = _arrayObj(certNums.map(num => _refObj(num, 0)));
            }
            if (ocspNums.length) {
                dssEntries.OCSPs = _arrayObj(ocspNums.map(num => _refObj(num, 0)));
            }
            if (crlNums.length) {
                dssEntries.CRLs = _arrayObj(crlNums.map(num => _refObj(num, 0)));
            }
            if (vriEntries) {
                dssEntries.VRI = _dictObj(vriEntries);
            }
            const dssNum = n++;
            updates.push({ num: dssNum, gen: 0, value: _dictObj(dssEntries) });

            return {
                updates,
                dssNum,
                lastNum: n - 1,
                certNums, ocspNums, crlNums
            };
        }

        return {
            buildDss,
            // Exposed for test wiring + helpers.
            _refObj, _intObj, _nameObj, _strHexObj,
            _arrayObj, _dictObj, _streamObj,
            _sha1, _toHexUpper, _scanSignatureContentsHex, _pdfDate
        };
    }
};
