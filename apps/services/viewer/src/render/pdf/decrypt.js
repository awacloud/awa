// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Open a PDF, encrypted ones included when no password is
 * needed to read them — the common "protected" PDF whose owner password
 * only restricts printing or copying, with an empty user password.
 *
 * `@awacloud/pdf` refuses encrypted files by default and provides every
 * piece of the standard security handler (`pdfSecurity`, `pdfStandardV4/5/6`,
 * the legacy RC4 extra) without composing a decrypting reader. This module
 * composes it: derive the file key from the empty user password, then
 * decrypt each indirect object's strings and stream data as it is resolved.
 *
 * A file that needs a real password is reported as protected
 * (`pdf/password-required`); one whose encrypted objects sit in object
 * streams (`@awacloud/pdf` does not decrypt those) as encrypted in an
 * unsupported way (`pdf/encrypted-unsupported`) — never shown as garbage.
 *
 * @module viewer/render/pdf/decrypt
 */
import { deref, entries, name, num } from './objects.js';

/** @typedef {import('./objects.js').PdfObj} PdfObj */

/** True when the file's trailer area names an `/Encrypt` dictionary. */
function hasEncryptKey(bytes) {
    const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
    return tail.includes('/Encrypt');
}

/** An error the controller classifies as "protected by a password". */
function passwordRequired(detail) {
    return Object.assign(new Error(`pdf: a password is required (${detail})`), { code: 'pdf/password-required' });
}

/**
 * Read a PDF, decrypting it when its user password is empty.
 *
 * @param {Uint8Array} bytes
 * @param {any} eng the pdf engine (`core/runtime.js`)
 * @returns {{doc: any, resolve: import('./objects.js').Resolve, encrypted: boolean}}
 * @throws {Error} `pdf/password-required`, or the reader's own parse errors.
 * @throws {Error} `pdf/encrypted-unsupported` when the page tree sits in encrypted object streams.
 */
export function openPdf(bytes, eng) {
    // `allowEncrypted` changes nothing for a clear file; reading with it
    // first, then looking for `/Encrypt`, lets one path serve both.
    let doc;
    try {
        doc = eng.pdf.read(bytes, { allowEncrypted: true });
    } catch (err) {
        // `@awacloud/pdf` does not decrypt objects stored in object streams:
        // an encrypted file that keeps its page tree there cannot be read.
        // A damaged encrypted file is just damaged. The reader's errors
        // keep their code, fw sanity included; an error without one is not
        // the reader's, and on an encrypted file the `/Encrypt` key is then
        // the only clue left.
        const code = /** @type {{code?: string}} */ (err || {}).code;
        if (code === 'pdf/document/objstm-encrypted' || (!code && hasEncryptKey(bytes))) {
            throw Object.assign(new Error('pdf: encrypted objects in object streams', { cause: err }), { code: 'pdf/encrypted-unsupported' });
        }
        throw err;
    }
    const raw = doc._raw.resolve;
    const trailer = doc.trailer?.raw;
    const encRef = entries(trailer)?.Encrypt;
    if (!encRef) return { doc, resolve: raw, encrypted: false };
    const encDict = deref(encRef, raw);
    if (!encDict) throw passwordRequired('no /Encrypt dictionary');
    const idItems = deref(entries(trailer)?.ID, raw)?.items || [];
    const idFirst = idItems[0]?.value instanceof Uint8Array ? idItems[0].value : new Uint8Array(0);
    const filter = name(deref(entries(encDict)?.Filter, raw));
    if (filter && filter !== 'Standard') throw passwordRequired(`security handler ${filter}`);

    const V = num(deref(entries(encDict)?.V, raw)) || 0;
    /** @type {(n: number, g: number, b: Uint8Array) => Uint8Array} */
    let decryptString;
    /** @type {(s: PdfObj, n: number, g: number) => Uint8Array} */
    let decryptStream;
    let encryptMetadata = true;

    if (V >= 4) {
        // `typeEncryptDict` reads plain values (numbers, byte strings,
        // booleans); names and dictionaries stay typed nodes, which it reads.
        /** @type {Record<string, any>} */
        const plain = {};
        for (const [k, v] of Object.entries(entries(encDict) || {})) {
            const d = deref(v, raw);
            plain[k] = d && (d.type === 'int' || d.type === 'real' || d.type === 'string' || d.type === 'bool') ? d.value : d;
        }
        const typed = eng.security.typeEncryptDict(plain);
        encryptMetadata = typed.EncryptMetadata !== false;
        const selection = eng.security.selectHandler(typed, { v4: eng.securityV4, v5: eng.securityV5, v6: eng.securityV6 });
        const fek = selection.handler.tryPassword({ ...typed, idFirst }, '', false).fileEncryptionKey;
        if (!fek) throw passwordRequired('user password');
        decryptString = (n, g, b) => (selection.strMethod === 'Identity' ? b
            : selection.handler.decryptString({ method: selection.strMethod }, fek, n, g, b));
        decryptStream = (s, n, g) => eng.security.dispatchDecryptStream(selection, s, fek, n, g, /** @type {Uint8Array} */ (s.raw));
    } else if (V === 1 || V === 2) {
        const e = /** @type {Record<string, PdfObj>} */ (entries(encDict));
        const params = {
            O: deref(e.O, raw)?.value, U: deref(e.U, raw)?.value, P: num(deref(e.P, raw)) || 0, idFirst,
            revision: num(deref(e.R, raw)) || 2, keyLength: num(deref(e.Length, raw)) || 40, encryptMetadata: true
        };
        let check;
        try { check = eng.rc4.validateUserPassword('', params); } catch { check = { ok: false }; }
        if (!check.ok) throw passwordRequired('user password');
        decryptString = (n, g, b) => eng.rc4.decryptString(check.fileKey, n, g, b);
        decryptStream = (s, n, g) => eng.rc4.decryptStream(check.fileKey, n, g, /** @type {Uint8Array} */ (s.raw));
    } else {
        throw passwordRequired(`unsupported /V ${V}`);
    }

    /**
     * Decrypt every string of a direct object tree (references stay
     * references: they are decrypted with their own object number).
     * @param {PdfObj} o
     * @param {number} n
     * @param {number} g
     * @returns {PdfObj}
     */
    function clear(o, n, g) {
        if (!o) return o;
        switch (o.type) {
            case 'string': return { ...o, value: decryptString(n, g, /** @type {Uint8Array} */ (o.value)) };
            case 'array': return { ...o, items: (o.items || []).map((x) => clear(x, n, g)) };
            case 'dict': {
                /** @type {Record<string, PdfObj>} */
                const out = {};
                for (const [k, v] of Object.entries(o.entries || {})) out[k] = clear(v, n, g);
                return { ...o, entries: out };
            }
            default: return o;
        }
    }

    const encKey = encRef && encRef.type === 'ref' ? `${encRef.num}:${encRef.gen}` : null;
    /** @type {Map<string, PdfObj>} */
    const cache = new Map();
    /** @type {import('./objects.js').Resolve} */
    const resolve = (ref) => {
        const key = `${ref.num}:${ref.gen}`;
        if (cache.has(key)) return /** @type {PdfObj} */ (cache.get(key));
        const obj = raw(ref);
        let out = obj;
        if (key !== encKey && obj) {
            const n = /** @type {number} */ (ref.num);
            const g = /** @type {number} */ (ref.gen);
            if (obj.type === 'stream') {
                const type = name(obj.dict?.entries?.Type);
                const clearStream = type === 'XRef' || (type === 'Metadata' && !encryptMetadata);
                out = {
                    ...obj,
                    dict: /** @type {any} */ (clear(/** @type {PdfObj} */ (obj.dict), n, g)),
                    raw: clearStream ? obj.raw : decryptStream(obj, n, g)
                };
            } else {
                out = clear(obj, n, g);
            }
        }
        cache.set(key, /** @type {PdfObj} */ (out));
        return /** @type {PdfObj} */ (out);
    };
    return { doc, resolve, encrypted: true };
}
