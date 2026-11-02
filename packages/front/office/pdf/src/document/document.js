// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Top-level document reader.
 *
 * Orchestrates the syntax layer (`pdfTokenizer`, `pdfParser`, `pdfXref`,
 * `pdfTrailer`) and the document layer (`pdfCatalog`, `pdfPages`,
 * `pdfPage`) to turn a `Uint8Array` of PDF bytes into a navigable
 * typed model.
 *
 * Cross-reference streams (`/Type /XRef`, §7.5.8), object streams
 * (`/Type /ObjStm`, §7.5.7) and hybrid-reference files (a classical
 * table whose trailer carries `/XRefStm`) are read automatically: the
 * section walk inspects the bytes at each `startxref`/`/Prev` offset
 * and takes the table path or the stream path accordingly, so mixed
 * update chains (table → stream, stream → table) resolve too. Objects
 * stored inside an object stream are materialised on demand through
 * `pdfObjStream`, with the container decoded once per document.
 *
 * Encrypted documents (trailer `/Encrypt` present) fail loud by
 * default: `readDocument` throws `pdf/document/encrypted` instead of
 * silently handing back a ciphertext model. `{ password }` opens one
 * (ISO 32000-2 § 7.6): the Standard handler V4, V5 or V6 chosen by
 * `pdfSecurity.selectHandler`, the password tried as the user, then as the
 * owner password, and every indirect object decrypted as `resolveByKey`
 * reads it — strings by `/StrF`, the stream payload by `/StmF` (`/EFF`
 * for an embedded file); a cross-reference stream, the metadata stream
 * under `EncryptMetadata false` and a signature's `/Contents` stay as
 * stored; an object stream is decrypted as a stream, its members read as
 * stored. RC4 V1 / V2 is decrypted through `{ legacyRc4 }`, the opt-in
 * `pdfLegacyRc4Read` instance (the `pdf-legacy` bundle passes its own).
 * `{ allowEncrypted: true }` returns the raw ciphertext model
 * instead (an object stream's members cannot be read there:
 * `pdf/document/objstm-encrypted`).
 *
 * @module pdf/document/document
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';
import { pdfCatalog } from './catalog.js';
import { pdfPage } from './page.js';
import { pdfPages } from './pages.js';
import { pdfCrossRefStream } from '../syntax/crossRefStream.js';
import { pdfObjStream } from '../syntax/objStream.js';
import { pdfFilterDispatch } from '../syntax/filters/dispatch.js';
import { pdfSecurity } from '../crypto/security.js';
import { pdfStandardV4 } from '../crypto/standardV4.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfStandardV6 } from '../crypto/standardV6.js';

export const pdfDocument = {
    name: 'pdfDocument',
    dependencies: [
        'pdfErrors', 'pdfTokenizer', 'pdfParser',
        'pdfXref', 'pdfTrailer',
        'pdfCatalog', 'pdfPage', 'pdfPages',
        'pdfCrossRefStream', 'pdfObjStream', 'pdfFilterDispatch',
        'pdfSecurity', 'pdfStandardV4', 'pdfStandardV5', 'pdfStandardV6'
    ],
    deps: [pdfErrors, pdfTokenizer, pdfParser, pdfXref, pdfTrailer, pdfCatalog, pdfPage, pdfPages, pdfCrossRefStream, pdfObjStream, pdfFilterDispatch,
        pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6],
    factory(errors, tokenizerMod, parserMod, xrefMod, trailerMod,
            catalogMod, pageMod, pagesMod,
            crossRefStreamMod, objStreamMod, filterDispatchMod,
            securityMod, v4Mod, v5Mod, v6Mod) {
        const { ParseError, ContractError, EncryptionError } = errors;
        const tokenize = tokenizerMod && tokenizerMod.tokenize;
        const parseIndirect = parserMod && parserMod.parseIndirect;
        const locateStartXref = xrefMod && xrefMod.locateStartXref;
        const readStartXref   = xrefMod && xrefMod.readStartXref;
        const parseXrefTable  = xrefMod && xrefMod.parseXrefTable;
        const parseTrailerDict = xrefMod && xrefMod.parseTrailerDict;
        const typeTrailer = trailerMod && trailerMod.typeTrailer;
        const typeCatalog = catalogMod && catalogMod.typeCatalog;
        const typePage    = pageMod && pageMod.typePage;
        const walkPageTree = pagesMod && pagesMod.walkPageTree;

        const HEADER_PREFIX = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
        const XREF_KEYWORD  = new Uint8Array([0x78, 0x72, 0x65, 0x66]);       // xref
        const PDF_NULL = Object.freeze({ type: 'null' });
        // Trailer / xref-stream dict keys that describe ONE section only and
        // are never inherited by the merged trailer (§7.5.5, §7.5.8.2).
        const SECTION_LOCAL_KEYS = new Set([
            'Prev', 'XRefStm', 'Type', 'W', 'Index', 'Length',
            'Filter', 'DecodeParms', 'F', 'FFilter', 'FDecodeParms', 'DL'
        ]);
        const EMPTY_PAGES_NODE = Object.freeze({
            type: 'dict',
            entries: Object.freeze({
                Type: Object.freeze({ type: 'name', value: 'Pages' }),
                Kids: Object.freeze({ type: 'array', items: Object.freeze([]) })
            })
        });

        /** Skip the PDF white-space run (§7.2.3) starting at `at`. */
        function skipWhitespace(bytes, at) {
            let p = at < 0 ? 0 : at;
            while (p < bytes.length) {
                const b = bytes[p];
                if (b === 0x00 || b === 0x09 || b === 0x0A
                    || b === 0x0C || b === 0x0D || b === 0x20) { p++; continue; }
                break;
            }
            return p;
        }

        /** True when the four bytes at `at` spell the `xref` keyword. */
        function startsXrefTable(bytes, at) {
            for (let k = 0; k < XREF_KEYWORD.length; k++) {
                if (bytes[at + k] !== XREF_KEYWORD[k]) return false;
            }
            return true;
        }

        /**
         * A cross-reference stream is parsed before any xref exists, so an
         * indirect `/Length` cannot be resolved — fail loud instead of
         * silently falling back to an `endstream` scan.
         */
        function refuseIndirectLength(ref) {
            throw new ParseError('pdf/document/xrefstm-indirect-length',
                'a cross-reference stream may not use an indirect /Length',
                { context: { num: ref && ref.num, gen: ref && ref.gen } });
        }

        function requireStreamWiring(offset) {
            if (!crossRefStreamMod || !objStreamMod || !filterDispatchMod) {
                throw new ParseError('pdf/document/xref-stream-unwired',
                    'this pdfDocument was built without pdfCrossRefStream, ' +
                    'pdfObjStream and pdfFilterDispatch — cross-reference ' +
                    'streams and object streams cannot be read',
                    { context: { offset } });
            }
        }

        /**
         * Read one `/Type /XRef` cross-reference stream section at `at`
         * (§7.5.8) and return its entries plus its dict, which doubles as
         * the section's trailer.
         */
        function readXrefStreamSection(bytes, at) {
            requireStreamWiring(at);
            const tok = tokenize(bytes, { start: at });
            const def = parseIndirect(tok, refuseIndirectLength);
            const streamObj = def.value;
            const typeEntry = streamObj && streamObj.dict
                && streamObj.dict.entries && streamObj.dict.entries.Type;
            if (!streamObj || streamObj.type !== 'stream'
                || !typeEntry || typeEntry.type !== 'name'
                || typeEntry.value !== 'XRef') {
                throw new ParseError('pdf/document/bad-xref-section',
                    'neither an xref table nor a cross-reference stream at startxref',
                    { context: { offset: at } });
            }
            const decoded = filterDispatchMod.decode(streamObj);
            const parsed = crossRefStreamMod.parseCrossRefStream(decoded, streamObj.dict);
            return { entries: parsed.entries, dict: streamObj.dict };
        }

        /**
         * Merge the trailer dicts of every cross-reference section, given
         * newest first: the newest dict is kept whole, and each document
         * trailer key it lacks (`/Root`, `/Info`, `/ID`, `/Encrypt`, `/Size`,
         * …) comes from the first older dict that carries it. Keys that
         * describe one section only (`/Prev`, `/XRefStm` and the
         * cross-reference stream's own `/Type`, `/W`, `/Index`, `/Length`,
         * filter entries) are never inherited. A single dict is returned
         * unchanged, and so is a non-dict, so typeTrailer keeps its
         * pdf/trailer/not-dict refusal.
         */
        function mergeTrailerDicts(dicts) {
            if (dicts.length === 1) return dicts[0];
            for (const d of dicts) {
                if (!d || d.type !== 'dict') return d;
            }
            const entries = { ...dicts[0].entries };
            for (let i = 1; i < dicts.length; i++) {
                for (const k of Object.keys(dicts[i].entries)) {
                    if (SECTION_LOCAL_KEYS.has(k)) continue;
                    if (!(k in entries)) entries[k] = dicts[i].entries[k];
                }
            }
            return { ...dicts[0], entries };
        }

        // An object header `N G obj`, its number not inside a word and `obj`
        // not the start of one (§7.3.10); whitespace per §7.2.3.
        const OBJ_HEADER = /(?<![0-9A-Za-z])(\d{1,10})[\0\t\n\f\r ]+(\d{1,5})[\0\t\n\f\r ]+obj(?![0-9A-Za-z])/g;
        const TRAILER_KEYWORD = /(?<![0-9A-Za-z])trailer(?![0-9A-Za-z])/g;

        /** The name value of `dict.entries[key]`, or null. */
        function nameEntry(dict, key) {
            const v = dict && dict.type === 'dict' && dict.entries[key];
            return v && v.type === 'name' ? v.value : null;
        }

        /**
         * Rebuild the cross-reference table from the bytes (the
         * `recoverXref` read option): every `N G obj` definition in file
         * order, the later one winning; the members of every object stream
         * that decodes, at the container's place in that order; the trailer
         * merged, newest first, from every parsable `trailer` dictionary and
         * every cross-reference stream dictionary, with `/Root` the last
         * catalog found when none names it and `/Size` one past the highest
         * object number when none gives it. An object that does not parse is
         * skipped.
         */
        function rebuildXref(bytes) {
            const text = new TextDecoder('latin1').decode(bytes);
            const entries = {};
            const trailers = [];
            let lastCatalog = null;
            let maxNum = -1;
            OBJ_HEADER.lastIndex = 0;
            for (let m = OBJ_HEADER.exec(text); m !== null; m = OBJ_HEADER.exec(text)) {
                const num = Number(m[1]);
                const gen = Number(m[2]);
                const at = m.index;
                let def;
                try {
                    def = parseIndirect(tokenize(bytes, { start: at }), () => null);
                } catch (_e) {
                    continue;
                }
                entries[num] = { type: 1, offset: at, gen, free: false };
                if (num > maxNum) maxNum = num;
                const value = def.value;
                const dict = value && value.type === 'stream' ? value.dict : value;
                const type = nameEntry(dict, 'Type');
                if (type === 'Catalog') lastCatalog = { num, gen };
                if (type === 'XRef' && value.type === 'stream') {
                    trailers.push({ at, dict: value.dict });
                } else if (type === 'ObjStm' && value.type === 'stream' && objStreamMod && filterDispatchMod) {
                    try {
                        const members = objStreamMod.parseObjectStream(
                            filterDispatchMod.decode(value), value.dict);
                        members.forEach((member, index) => {
                            entries[member.num] = { type: 2, objStm: num, index, free: false, offset: 0, gen: 0 };
                            if (member.num > maxNum) maxNum = member.num;
                        });
                    } catch (_e) {
                        // an object stream that does not decode gives no member
                    }
                }
            }
            TRAILER_KEYWORD.lastIndex = 0;
            for (let m = TRAILER_KEYWORD.exec(text); m !== null; m = TRAILER_KEYWORD.exec(text)) {
                try {
                    trailers.push({ at: m.index, dict: parseTrailerDict(bytes, m.index).dict });
                } catch (_e) {
                    // the word inside a comment or a stream: not a trailer
                }
            }
            trailers.sort((a, b) => b.at - a.at);
            const merged = trailers.length > 0
                ? mergeTrailerDicts(trailers.map((t) => t.dict))
                : { type: 'dict', entries: {} };
            const trailerEntries = { ...merged.entries };
            if (!trailerEntries.Root && lastCatalog) {
                trailerEntries.Root = { type: 'ref', num: lastCatalog.num, gen: lastCatalog.gen };
            }
            if (!trailerEntries.Size) trailerEntries.Size = { type: 'int', value: maxNum + 1 };
            return { entries, trailer: { ...merged, entries: trailerEntries } };
        }

        function readHeader(bytes) {
            if (bytes.length < 8) {
                throw new ParseError('pdf/document/short',
                    'input too short to contain a PDF header',
                    { context: { length: bytes.length } });
            }
            let off = -1;
            const maxScan = Math.min(bytes.length - 5, 1024);
            outer: for (let i = 0; i <= maxScan; i++) {
                for (let k = 0; k < 5; k++) {
                    if (bytes[i + k] !== HEADER_PREFIX[k]) continue outer;
                }
                off = i; break;
            }
            if (off < 0) {
                throw new ParseError('pdf/document/bad-header',
                    'no %PDF- header found in first 1024 bytes');
            }
            let p = off + 5;
            const digits = [];
            while (p < bytes.length) {
                const b = bytes[p];
                if (b === 0x0A || b === 0x0D) break;
                digits.push(b); p++;
            }
            const version = new TextDecoder('latin1').decode(Uint8Array.from(digits));
            if (p < bytes.length && bytes[p] === 0x0D) p++;
            if (p < bytes.length && bytes[p] === 0x0A) p++;
            return { version, end: p };
        }

        /** A dict node with its top-level references (and /CF's) resolved. */
        function resolvedDict(node, resolve) {
            const d = resolve(node);
            if (!d || d.type !== 'dict') return d;
            const entries = {};
            for (const k of Object.keys(d.entries)) entries[k] = resolve(d.entries[k]);
            const cf = entries.CF;
            if (cf && cf.type === 'dict') {
                const cfEntries = {};
                for (const k of Object.keys(cf.entries)) cfEntries[k] = resolve(cf.entries[k]);
                entries.CF = { ...cf, entries: cfEntries };
            }
            return { ...d, entries };
        }

        /** True for a `/Type /<value>` entry of a dict node. */
        function hasType(dict, value) {
            const t = dict && dict.type === 'dict' && dict.entries.Type;
            return !!t && t.type === 'name' && t.value === value;
        }

        /**
         * The decryptor of an encrypted document opened with `password`
         * (ISO 32000-2 § 7.6): the Standard handler V4, V5 or V6, the file
         * key from the password tried as the user, then as the owner
         * password. `decrypt(num, gen, value)` returns the object with its
         * strings and stream payload decrypted; what § 7.6.2 leaves clear
         * (a cross-reference stream, the metadata stream under
         * `EncryptMetadata false`, a signature's `/Contents`) stays as
         * stored. RC4 V1 / V2 (R2, R3) goes through `legacyRc4`, the
         * opt-in `pdfLegacyRc4Read` instance, when it is given.
         */
        function createDecryptor(encryptNode, trailerTyped, password, resolve, legacyRc4, fastCipher) {
            const typed = securityMod.typeEncryptDict(resolvedDict(encryptNode, resolve));
            const filter = typed.Filter && typed.Filter.type === 'name' ? typed.Filter.value : typed.Filter;
            if (filter !== 'Standard') {
                throw new EncryptionError('pdf/crypto/unsupported-filter',
                    'only the Standard security handler is supported',
                    { context: { filter } });
            }
            typed.idFirst = trailerTyped.id ? trailerTyped.id[0] : undefined;
            const badPassword = () => new EncryptionError('pdf/document/bad-password',
                'the password opens the document neither as its user nor as its owner password',
                { context: { V: typed.V, R: typed.R } });
            let strings, streams;
            if (legacyRc4 && (typed.V === 1 || typed.V === 2)) {
                const params = {
                    O: typed.O, U: typed.U, P: typed.P, idFirst: typed.idFirst, revision: typed.R,
                    keyLength: typed.V === 2 && typeof typed.Length === 'number' ? typed.Length : 40,
                    encryptMetadata: typed.EncryptMetadata
                };
                let r = legacyRc4.validateUserPassword(password, params);
                if (!r.ok) r = legacyRc4.validateOwnerPassword(password, params);
                if (!r.ok) throw badPassword();
                const fileKey = r.fileKey;
                strings = (bytes, num, gen) => legacyRc4.decryptString(fileKey, num, gen, bytes);
                streams = (stream, num, gen) => legacyRc4.decryptStream(fileKey, num, gen, stream.raw);
            } else {
                const selection = securityMod.selectHandler(typed, { v4: v4Mod, v5: v5Mod, v6: v6Mod });
                const h = selection.handler;
                // `fastCipher`: the handlers' AES through fw's T-table path.
                const copts = fastCipher ? { fastCipher: true } : undefined;
                let fek = h.tryPassword(typed, password, false, copts).fileEncryptionKey;
                if (!fek) fek = h.tryPassword(typed, password, true, copts).fileEncryptionKey;
                if (!fek) throw badPassword();
                const strView = { method: selection.strMethod };
                strings = (bytes, num, gen) => (selection.strMethod === 'Identity'
                    ? bytes : h.decryptString(strView, fek, num, gen, bytes, copts));
                streams = (stream, num, gen) => securityMod.dispatchDecryptStream(selection, stream, fek, num, gen, stream.raw, copts);
            }
            const encryptNum = encryptNode && encryptNode.type === 'ref' ? encryptNode.num : -1;

            function walk(v, num, gen) {
                if (!v || typeof v !== 'object') return v;
                switch (v.type) {
                    case 'string': return { ...v, value: strings(v.value, num, gen) };
                    case 'array': return { ...v, items: v.items.map((x) => walk(x, num, gen)) };
                    case 'dict': {
                        const sig = hasType(v, 'Sig') || hasType(v, 'DocTimeStamp');
                        const entries = {};
                        for (const k of Object.keys(v.entries)) {
                            entries[k] = sig && k === 'Contents' ? v.entries[k] : walk(v.entries[k], num, gen);
                        }
                        return { ...v, entries };
                    }
                    case 'stream': {
                        if (hasType(v.dict, 'XRef')) return v;
                        const dict = walk(v.dict, num, gen);
                        if (hasType(v.dict, 'Metadata') && !typed.EncryptMetadata) return { ...v, dict };
                        const raw = v.raw instanceof Uint8Array ? streams(v, num, gen) : v.raw;
                        return { ...v, dict, raw };
                    }
                    default: return v;
                }
            }
            return {
                decrypt(num, gen, value) { return num === encryptNum ? value : walk(value, num, gen); }
            };
        }

        function readDocument(bytes, opts = {}) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/document/bad-input',
                    'readDocument expects a Uint8Array',
                    { context: { 'typeof': typeof bytes } });
            }
            const password = opts.password;
            if (password !== undefined && typeof password !== 'string' && !(password instanceof Uint8Array)) {
                throw new ContractError('pdf/document/bad-password-option',
                    'opts.password must be a string or a Uint8Array',
                    { context: { 'typeof': typeof password } });
            }
            const legacyRc4 = opts.legacyRc4;
            if (legacyRc4 !== undefined && !(legacyRc4 && ['validateUserPassword', 'validateOwnerPassword',
                'decryptString', 'decryptStream'].every((f) => typeof legacyRc4[f] === 'function'))) {
                throw new ContractError('pdf/document/bad-legacy-rc4-option',
                    'opts.legacyRc4 must be the pdfLegacyRc4Read instance',
                    { context: { 'typeof': typeof legacyRc4 } });
            }
            const fastCipher = opts.fastCipher;
            if (fastCipher !== undefined && typeof fastCipher !== 'boolean') {
                throw new ContractError('pdf/document/bad-fast-cipher-option',
                    'opts.fastCipher must be a boolean',
                    { context: { 'typeof': fastCipher === null ? 'null' : typeof fastCipher } });
            }
            const { version, end: headerEnd } = readHeader(bytes);

            const xref = { entries: {}, sections: [] };
            // Read-path loss ledger: degradations the reader
            // tolerated instead of throwing. Live array — later calls to
            // `_raw.resolve` append to it too.
            const losses = [];
            // The startxref / /Prev walk (§7.5.5, §7.5.8); fills `xref` and
            // returns the typed, merged trailer.
            function walkChain() {
                const sxAt = locateStartXref(bytes);
                if (sxAt < 0) {
                    throw new ParseError('pdf/document/no-startxref',
                        'startxref keyword not found near EOF');
                }
                const xrefAt = readStartXref(bytes, sxAt);

                // Every section's trailer dict, in visit order (newest first).
                const trailerDicts = [];
                let cursor = xrefAt;
                const seenSections = new Set();
                function mergeSection(at, kind, entries) {
                    xref.sections.push({ at, kind, entries });
                    for (const k of Object.keys(entries)) {
                        if (!(k in xref.entries)) xref.entries[k] = entries[k];
                    }
                }
                for (let safety = 0; safety < 32 && cursor >= 0; safety++) {
                    if (seenSections.has(cursor)) break;
                    seenSections.add(cursor);
                    let dict;
                    if (startsXrefTable(bytes, skipWhitespace(bytes, cursor))) {
                        const section = parseXrefTable(bytes, cursor);
                        for (const shape of section.tolerated || []) {
                            losses.push({
                                code: 'pdf/document/xref-tolerated',
                                message: 'a cross-reference table shape outside the standard was read',
                                context: { shape, at: cursor }
                            });
                        }
                        mergeSection(cursor, 'table', section.entries);
                        dict = parseTrailerDict(bytes, section.end).dict;
                        // Hybrid-reference file (§7.5.8.4): the trailer points at
                        // a companion xref stream holding the entries a 1.4 reader
                        // is not expected to see. Its own /Prev is ignored — the
                        // classical chain drives the walk.
                        const stmAt = dict && dict.entries && dict.entries.XRefStm;
                        if (stmAt && stmAt.type === 'int'
                            && stmAt.value >= 0 && stmAt.value < bytes.length) {
                            const hybrid = readXrefStreamSection(bytes, stmAt.value);
                            mergeSection(stmAt.value, 'stream', hybrid.entries);
                        }
                    } else {
                        const section = readXrefStreamSection(bytes, cursor);
                        mergeSection(cursor, 'stream', section.entries);
                        dict = section.dict;
                    }
                    trailerDicts.push(dict);
                    // A section's own /Prev drives the walk; its other entries
                    // are typed once, on the merged trailer below.
                    const prev = dict && dict.type === 'dict' && dict.entries
                        && dict.entries.Prev;
                    if (prev && prev.type === 'int'
                        && prev.value >= 0 && prev.value !== cursor) {
                        cursor = prev.value;
                    } else break;
                }
                if (trailerDicts.length === 0) {
                    throw new ParseError('pdf/document/no-trailer',
                        'no usable trailer dictionary found');
                }
                // The reader's trailer is the MERGE of every section's
                // dict, newest first — an entry (notably /Root) comes from the
                // newest section that supplies it, not only from the newest
                // section. A linearized file's first-page xref stream carries
                // /Root while the main stream it chains to does not; an
                // incremental update may omit it the other way round.
                // typeTrailer runs once, on the merge, so a chain where NO
                // section supplies /Root still throws pdf/trailer/missing-root.
                return typeTrailer(mergeTrailerDicts(trailerDicts));
            }
            let trailerTyped;
            try {
                trailerTyped = walkChain();
            } catch (err) {
                // `recoverXref`: a chain that cannot be used is rebuilt from the
                // bytes (opt-in; without it the walk's error stands).
                if (opts.recoverXref !== true || !(err instanceof ParseError)) throw err;
                const rebuilt = rebuildXref(bytes);
                xref.entries = rebuilt.entries;
                xref.sections = [{ at: null, kind: 'rebuilt', entries: xref.entries }];
                losses.push({
                    code: 'pdf/document/xref-rebuilt',
                    message: 'the cross-reference chain could not be used; the table was rebuilt from the file',
                    context: { cause: err.code, entries: Object.keys(xref.entries).length }
                });
                trailerTyped = typeTrailer(rebuilt.trailer);
            }

            if (trailerTyped.encrypt && opts.allowEncrypted !== true && password === undefined) {
                // Fail-loud arm — the trailer carries /Encrypt but
                // this package composes no decrypt path (deferred, see
                // pdf/document/document.js @fileoverview). Returning the
                // model here would silently hand back ciphertext for
                // strings/streams. Callers that actually want the raw
                // encrypted container (tests, tooling) opt in explicitly.
                throw new ParseError('pdf/document/encrypted',
                    'document is encrypted (trailer /Encrypt present) — ' +
                    'no decrypt path is composed for readDocument; pass ' +
                    '{ allowEncrypted: true } to read the raw ciphertext container',
                    { context: { encrypt: trailerTyped.encrypt } });
            }

            const indirects = new Map();
            const lossKeys = new Set();
            // Keys of objects every section marks free (read as null).
            const freeKeys = new Set();
            // Decoded members of every /Type /ObjStm container touched by
            // this read — one decode + parse per container, per document.
            const objStmMembers = new Map();

            function resolve(ref) {
                if (!ref || ref.type !== 'ref') return ref;
                return resolveByKey(ref.num, ref.gen);
            }
            function resolveByKey(num, gen) {
                const key = num + ':' + gen;
                if (indirects.has(key)) return indirects.get(key).value;
                let entry = xref.entries[num];
                if (!entry) {
                    throw new ParseError('pdf/document/missing-xref',
                        `object ${num} ${gen} not in xref`,
                        { context: { num, gen } });
                }
                if (entry.free) {
                    entry = resolveFreeEntry(num, gen);
                    if (!entry) return PDF_NULL;
                }
                if (entry.type === 2) {
                    const value = resolveCompressed(num, gen, entry);
                    indirects.set(key, { value, offset: 0, objStm: entry.objStm });
                    return value;
                }
                const offset = entry.offset;
                if (offset <= 0 || offset >= bytes.length) {
                    throw new ParseError('pdf/document/bad-offset',
                        `object ${num} ${gen} xref offset out of range`,
                        { context: { num, gen, offset, total: bytes.length } });
                }
                const tok = tokenize(bytes, { start: offset });
                const def = parseIndirect(tok, resolve);
                if (def.num !== num || def.gen !== gen) {
                    throw new ParseError('pdf/document/xref-mismatch',
                        `xref points to a different object`,
                        { context: { expected: { num, gen }, found: { num: def.num, gen: def.gen } } });
                }
                const value = decryptor ? decryptor.decrypt(num, gen, def.value) : def.value;
                indirects.set(key, { value, offset });
                return value;
            }
            /**
             * The winning (newest) xref entry for `num` is free.
             * Look through the sections newest first for the newest one that
             * still DEFINES the object in use and resolve through it,
             * recording `pdf/document/free-entry-fallback`. When every
             * section agrees the object is free, record
             * `pdf/document/free-object` and return null — ISO 32000-2
             * §7.3.10 reads a reference to a free object as the null
             * object — instead of throwing.
             */
            function resolveFreeEntry(num, gen) {
                const key = num + ':' + gen;
                for (const section of xref.sections) {
                    const e = section.entries[num];
                    if (e && !e.free) {
                        recordLoss('fallback:' + key, {
                            code: 'pdf/document/free-entry-fallback',
                            message: `object ${num} is free in the newest xref section; ` +
                                'resolved through an older section that defines it',
                            context: { num, gen, section: { at: section.at, kind: section.kind } }
                        });
                        return e;
                    }
                }
                freeKeys.add(key);
                recordLoss('free:' + key, {
                    code: 'pdf/document/free-object',
                    message: `object ${num} is free in every xref section; read as null`,
                    context: { num, gen }
                });
                return null;
            }
            /** Append `loss` to the ledger once per `dedupeKey`. */
            function recordLoss(dedupeKey, loss) {
                if (lossKeys.has(dedupeKey)) return;
                lossKeys.add(dedupeKey);
                losses.push(loss);
            }
            /**
             * Materialise object `num` from the `/Type /ObjStm` container
             * its type-2 xref entry names (§7.5.7). Compressed objects
             * always carry generation 0. Under `password` the container is
             * decrypted as it is resolved and its members are returned as
             * stored: they sit inside an encrypted stream (§7.6.2).
             */
            function resolveCompressed(num, gen, entry) {
                if (trailerTyped && trailerTyped.encrypt && !decryptor) {
                    throw new ParseError('pdf/document/objstm-encrypted',
                        'object streams of an encrypted document cannot be ' +
                        'read without its password',
                        { context: { num, gen, objStm: entry.objStm } });
                }
                const containerNum = entry.objStm;
                let members = objStmMembers.get(containerNum);
                if (!members) {
                    requireStreamWiring(0);
                    const containerEntry = xref.entries[containerNum];
                    if (containerEntry && containerEntry.type === 2) {
                        throw new ParseError('pdf/document/objstm-nested',
                            `object stream ${containerNum} is itself stored in an object stream`,
                            { context: { num, objStm: containerNum } });
                    }
                    const container = resolveByKey(containerNum, 0);
                    if (!container || container.type !== 'stream') {
                        throw new ParseError('pdf/document/objstm-not-stream',
                            `object ${containerNum} is not a stream and cannot hold compressed objects`,
                            { context: { num, objStm: containerNum,
                                         type: container && container.type } });
                    }
                    members = objStreamMod.parseObjectStream(
                        filterDispatchMod.decode(container), container.dict);
                    objStmMembers.set(containerNum, members);
                }
                const member = members[entry.index];
                if (!member || member.num !== num) {
                    throw new ParseError('pdf/document/objstm-mismatch',
                        'object stream member does not carry the expected object number',
                        { context: { num, objStm: containerNum, index: entry.index,
                                     found: member ? member.num : null } });
                }
                return member.value;
            }

            // `password`: the decryptor is built once the resolver exists;
            // the objects resolved to build it (the /Encrypt dictionary and
            // its references) are kept as stored.
            let decryptor = null;
            if (trailerTyped.encrypt && password !== undefined) {
                const encryptNode = trailerTyped.encrypt.type === 'dict'
                    ? trailerTyped.encrypt
                    : { type: 'ref', num: trailerTyped.encrypt.num, gen: trailerTyped.encrypt.gen };
                decryptor = createDecryptor(encryptNode, trailerTyped, password, resolve, legacyRc4, fastCipher === true);
            }

            const rootRef = trailerTyped.root;
            const catalogDict = resolve({ type: 'ref', num: rootRef.num, gen: rootRef.gen });
            if (freeKeys.has(rootRef.num + ':' + rootRef.gen)) {
                // No document without a catalog: a /Root free in every
                // section stays a refusal, never a degraded read.
                throw new ParseError('pdf/document/free-object',
                    `object ${rootRef.num} is free`,
                    { context: { num: rootRef.num, gen: rootRef.gen, role: 'catalog' } });
            }
            const catalog     = typeCatalog(catalogDict);

            // A page-tree /Kids reference to an object free in every section
            // resolves to null; hand the walker an empty /Pages node in its
            // place so the dangling kid contributes no page (its loss is
            // already recorded) instead of failing pdf/pages/not-dict.
            function resolvePageTreeNode(ref) {
                const value = resolve(ref);
                if (ref && ref.type === 'ref' && freeKeys.has(ref.num + ':' + ref.gen)) {
                    return EMPTY_PAGES_NODE;
                }
                return value;
            }
            const pageRefs = walkPageTree(catalog.pages, resolvePageTreeNode);
            const pages = pageRefs.map(r => typePage(resolve({ type: 'ref', num: r.num, gen: r.gen })));

            return {
                version,
                catalog,
                pages,
                trailer: trailerTyped,
                xref,
                losses,
                _raw: {
                    resolve,
                    bytes,
                    headerEnd,
                    indirects
                }
            };
        }

        return { readDocument, readHeader };
    }
};
