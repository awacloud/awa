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
 * Encrypted documents (trailer `/Encrypt` present): read with no
 * password, the empty one is tried (as the user, then as the owner); a
 * file it opens reads, one `pdf/document/opened-with-empty-password` loss
 * recording it with the permission bits, and one it does not open throws
 * `pdf/document/encrypted` rather than hand back a ciphertext model
 * (`emptyPassword: false`: every encrypted read with no password throws
 * it). `{ password }` opens one
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
 * ## A byte source
 *
 * The input may also be a byte source `{ byteLength, read(offset,
 * length) }`: `read` is synchronous and returns a `Uint8Array` of up to
 * `length` bytes from `offset` (Bun / Node's `readSync`, a worker's
 * `FileReaderSync` over a `Blob`), so a file need not be held to be read.
 * The reader then reads windows:
 *
 * - the header from the file's start;
 * - `startxref` from its last 8,192 bytes;
 * - each xref section with its trailer, and each object as it is
 *   resolved, from a window at its offset.
 *
 * A window starts at 64 KiB (`opts.sourceWindow`, an integer of at least
 * 16) and doubles while a parse runs out of it, a stream whose `/Length`
 * passes the window's end included. Past the parser's `maxStreamBytes`
 * plus 64 KiB it is refused: `pdf/document/source-window`. A resolved
 * stream keeps a copy of its bytes, not its window. A `Uint8Array` input
 * is one window over the whole file: the same code path, unchanged. The
 * result's `_raw` carries `source` in place of `bytes`. The rebuild of a
 * broken cross-reference chain scans the whole file, so a source whose
 * chain fails is read whole once for it: a source and its bytes give one
 * outcome. A read that returns no `Uint8Array` throws
 * `pdf/document/bad-source-read`.
 *
 * The result also carries, public (office-coverage-3 T64):
 *
 * - `resolve(node)`: a reference to its object (decrypted as every read
 *   object), any other value itself (the resolver `_raw.resolve` is);
 * - `info()`: the Info dictionary as text, `{ title, author, subject,
 *   keywords, creator, producer, creationDate, modDate, trapped }` (each
 *   string a decoded PDF text string; a missing or non-string entry left
 *   out; `trapped` a name's value, or `'True'` / `'False'` for a
 *   boolean), or `null` when the trailer has no Info dictionary; it never
 *   throws on a malformed entry;
 * - `pageContents(i)`: page `i`'s content, its streams resolved, decoded
 *   through their filters and joined with a newline between two (ISO
 *   32000 §7.8.2); empty bytes for a page without `/Contents`. A stream
 *   that does not resolve or decode throws its error; an index that is no
 *   page's throws `pdf/document/bad-page-index`.
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
import { pdfInfo } from '../metadata/info.js';

export const pdfDocument = {
    name: 'pdfDocument',
    dependencies: [
        'pdfErrors', 'pdfTokenizer', 'pdfParser',
        'pdfXref', 'pdfTrailer',
        'pdfCatalog', 'pdfPage', 'pdfPages',
        'pdfCrossRefStream', 'pdfObjStream', 'pdfFilterDispatch',
        'pdfSecurity', 'pdfStandardV4', 'pdfStandardV5', 'pdfStandardV6', 'pdfInfo'
    ],
    deps: [pdfErrors, pdfTokenizer, pdfParser, pdfXref, pdfTrailer, pdfCatalog, pdfPage, pdfPages, pdfCrossRefStream, pdfObjStream, pdfFilterDispatch,
        pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6, pdfInfo],
    factory(errors, tokenizerMod, parserMod, xrefMod, trailerMod,
            catalogMod, pageMod, pagesMod,
            crossRefStreamMod, objStreamMod, filterDispatchMod,
            securityMod, v4Mod, v5Mod, v6Mod, infoMod) {
        const { ParseError, ContractError, EncryptionError } = errors;
        // The deepest nesting of objects being resolved at once: a sound
        // file needs a few (an object stream, its /Length).
        const MAX_RESOLVE_DEPTH = 32;
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
        function readXrefStreamSection(bytes, at, end = true) {
            requireStreamWiring(at);
            const tok = tokenize(bytes, { start: at });
            const def = parseIndirect(tok, refuseIndirectLength);
            const streamObj = def.value;
            checkStreamWindow(streamObj, bytes, end, null);
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

        // A byte source is read by windows: the first SOURCE_WINDOW bytes
        // (or `opts.sourceWindow`), doubled while a parse runs out of them,
        // up to the parser's `maxStreamBytes` plus SOURCE_WINDOW_SLACK.
        const SOURCE_WINDOW = 64 * 1024;
        const SOURCE_WINDOW_MIN = 16;
        const SOURCE_WINDOW_SLACK = 64 * 1024;
        // `startxref` is looked for in the file's last STARTXREF_TAIL bytes
        // (`pdfXref.locateStartXref`'s own window).
        const STARTXREF_TAIL = 8192;

        /** True for a byte source: `{ byteLength, read(offset, length) }`. */
        function isSource(v) {
            return !!v && typeof v === 'object' && !(v instanceof Uint8Array)
                && Number.isSafeInteger(v.byteLength) && v.byteLength >= 0 && typeof v.read === 'function';
        }

        /** A window grew short of the parse: read a larger one. */
        class WindowShort extends Error {}

        /**
         * The input as windows. `window(offset, length)` returns `{ bytes,
         * base, end }`: bytes from `base` covering `offset` onward (a
         * `Uint8Array` input is one window over the whole file), `end`
         * true when they reach the file's end. `run(offset, parse)` hands
         * `parse(bytes, at, end)` the window holding `offset` (`at` its
         * place in the window), again with a doubled window while the parse
         * throws a `ParseError` or `WindowShort` and the window does not
         * reach the file's end; past the cap, `pdf/document/source-window`.
         */
        function inputOf(input, first) {
            if (!isSource(input)) {
                const whole = { bytes: input, base: 0, end: true };
                return { size: input.length, window: () => whole, run: (offset, parse) => parse(input, offset, true) };
            }
            const size = input.byteLength;
            function window(offset, length) {
                const n = Math.max(0, Math.min(length, size - offset));
                const got = input.read(offset, n);
                if (!(got instanceof Uint8Array)) {
                    throw new ContractError('pdf/document/bad-source-read',
                        'a byte source read must return a Uint8Array',
                        { context: { offset, length: n, 'typeof': typeof got } });
                }
                return { bytes: got, base: offset, end: offset + got.length >= size };
            }
            function run(offset, parse) {
                const cap = parserMod.parserLimits.maxStreamBytes + SOURCE_WINDOW_SLACK;
                let length = Math.min(first, cap);
                for (;;) {
                    const w = window(offset, length);
                    try {
                        return parse(w.bytes, 0, w.end);
                    } catch (err) {
                        // At the file's end the parse saw what a whole-file
                        // read sees: its error stands (a WindowShort is
                        // never thrown there).
                        if (w.end || !(err instanceof ParseError || err instanceof WindowShort)) throw err;
                    }
                    if (length >= cap) {
                        throw new ParseError('pdf/document/source-window',
                            'the object does not fit the largest window a byte source is read by',
                            { context: { offset, window: length } });
                    }
                    length = Math.min(length * 2, cap);
                }
            }
            return { size, window, run };
        }

        /**
         * A stream parsed in a window that does not reach the file's end,
         * whose declared `/Length` (direct, or resolved by `resolveRef`)
         * runs past the window: the parse took the `endstream` scan, so
         * the window was too short.
         */
        function checkStreamWindow(value, bytes, end, resolveRef) {
            if (end || !value || value.type !== 'stream') return;
            let len = value.dict && value.dict.entries && value.dict.entries.Length;
            if (len && len.type === 'ref' && resolveRef) len = resolveRef(len);
            if (len && len.type === 'int' && len.value > value.raw.length) {
                throw new WindowShort('stream longer than its window');
            }
        }

        const INFO_TEXT = [['Title', 'title'], ['Author', 'author'], ['Subject', 'subject'], ['Keywords', 'keywords'],
            ['Creator', 'creator'], ['Producer', 'producer'], ['CreationDate', 'creationDate'], ['ModDate', 'modDate']];

        /** The Info dictionary `node` (resolved) as text, or null (module header). */
        function infoText(node, resolve) {
            let dict;
            try { dict = resolve(node); } catch { return null; }
            if (!dict || dict.type !== 'dict') return null;
            const out = {};
            for (const [key, name] of INFO_TEXT) {
                let v;
                try { v = resolve(dict.entries[key]); } catch { continue; }
                if (v && v.type === 'string' && v.value instanceof Uint8Array) out[name] = infoMod.decodeTextString(v.value);
            }
            let t;
            try { t = resolve(dict.entries.Trapped); } catch { t = undefined; }
            if (t && t.type === 'name') out.trapped = t.value;
            else if (t && t.type === 'bool') out.trapped = t.value ? 'True' : 'False';
            return out;
        }

        /** Page `page`'s content streams, decoded and joined with a newline (module header). */
        function contentsOf(page, resolve) {
            const parts = [];
            for (const ref of page.contents || []) {
                const s = resolve({ type: 'ref', num: ref.num, gen: ref.gen });
                if (!s || s.type !== 'stream')
                    throw new ParseError('pdf/document/bad-contents', `content ${ref.num} ${ref.gen} R is not a stream`, { context: { num: ref.num, gen: ref.gen } });
                parts.push(filterDispatchMod.decode(s));
            }
            const size = parts.reduce((n, x) => n + x.length, 0) + Math.max(0, parts.length - 1);
            const out = new Uint8Array(size);
            let at = 0;
            parts.forEach((x, k) => {
                if (k) out[at++] = 0x0A;
                out.set(x, at);
                at += x.length;
            });
            return out;
        }

        function readDocument(input, opts = {}) {
            if (!(input instanceof Uint8Array) && !isSource(input)) {
                throw new ParseError('pdf/document/bad-input',
                    'readDocument expects a Uint8Array or a byte source { byteLength, read(offset, length) }',
                    { context: { 'typeof': input === null ? 'null' : typeof input } });
            }
            const sourceWindow = opts.sourceWindow;
            if (sourceWindow !== undefined && !(Number.isSafeInteger(sourceWindow) && sourceWindow >= SOURCE_WINDOW_MIN)) {
                throw new ContractError('pdf/document/bad-source-window-option',
                    `opts.sourceWindow must be an integer of at least ${SOURCE_WINDOW_MIN}`,
                    { context: { 'typeof': typeof sourceWindow } });
            }
            const fromSource = isSource(input);
            const src = inputOf(input, sourceWindow === undefined ? SOURCE_WINDOW : sourceWindow);
            const bytes = fromSource ? null : input;
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
            const { version, end: headerEnd } = readHeader(fromSource ? src.window(0, SOURCE_WINDOW).bytes : bytes);

            const xref = { entries: {}, sections: [] };
            // Read-path loss ledger: degradations the reader
            // tolerated instead of throwing. Live array — later calls to
            // `_raw.resolve` append to it too.
            const losses = [];
            // The startxref / /Prev walk (§7.5.5, §7.5.8); fills `xref` and
            // returns the typed, merged trailer.
            function walkChain() {
                // Through a source, the file's last STARTXREF_TAIL bytes.
                const tail = fromSource
                    ? src.window(Math.max(0, src.size - STARTXREF_TAIL), STARTXREF_TAIL).bytes
                    : bytes;
                const sxAt = locateStartXref(tail);
                if (sxAt < 0) {
                    throw new ParseError('pdf/document/no-startxref',
                        'startxref keyword not found near EOF');
                }
                const xrefAt = readStartXref(tail, sxAt);

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
                    // The section at `cursor`, a table with its trailer or a
                    // stream, read in one window.
                    const read = src.run(cursor, (b, at, end) => {
                        if (startsXrefTable(b, skipWhitespace(b, at))) {
                            const section = parseXrefTable(b, at);
                            // A trailer that does not parse at the file's
                            // end is thrown after the table is merged, as
                            // a whole-file read does.
                            let trailerError = null;
                            let trailerDict;
                            try {
                                trailerDict = parseTrailerDict(b, section.end).dict;
                            } catch (err) {
                                if (!end) throw err;
                                trailerError = err;
                            }
                            return { table: section, dict: trailerDict, trailerError };
                        }
                        return { stream: readXrefStreamSection(b, at, end) };
                    });
                    if (read.table) {
                        const section = read.table;
                        for (const shape of section.tolerated || []) {
                            losses.push({
                                code: 'pdf/document/xref-tolerated',
                                message: 'a cross-reference table shape outside the standard was read',
                                context: { shape, at: cursor }
                            });
                        }
                        mergeSection(cursor, 'table', section.entries);
                        if (read.trailerError) throw read.trailerError;
                        dict = read.dict;
                        // Hybrid-reference file (§7.5.8.4): the trailer points at
                        // a companion xref stream holding the entries a 1.4 reader
                        // is not expected to see. Its own /Prev is ignored — the
                        // classical chain drives the walk.
                        const stmAt = dict && dict.entries && dict.entries.XRefStm;
                        if (stmAt && stmAt.type === 'int'
                            && stmAt.value >= 0 && stmAt.value < src.size) {
                            const hybrid = src.run(stmAt.value, (b, at, end) => readXrefStreamSection(b, at, end));
                            mergeSection(stmAt.value, 'stream', hybrid.entries);
                        }
                    } else {
                        const section = read.stream;
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
                // bytes, unless the caller says `false` (then the walk's error
                // stands). A source is read whole once for it.
                if (opts.recoverXref === false || !(err instanceof ParseError)) throw err;
                const rebuilt = rebuildXref(bytes || src.window(0, src.size).bytes);
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
                // No password given: the empty one is tried, as the user then
                // as the owner (the common file whose owner password only
                // restricts printing or copying), unless `emptyPassword:
                // false`. A file it does not open is refused: returning the
                // model would hand back ciphertext for strings and streams.
                const refused = new ParseError('pdf/document/encrypted',
                    'document is encrypted (trailer /Encrypt present) and the empty password does not open it — ' +
                    'pass { password } to decrypt it, or { allowEncrypted: true } to read the raw ciphertext container',
                    { context: { encrypt: trailerTyped.encrypt } });
                if (opts.emptyPassword === false) throw refused;
                let opened;
                try {
                    opened = readDocument(input, { ...opts, password: '' });
                } catch {
                    throw refused;
                }
                // The typed trailer's `encrypt` is `{ num, gen }`, or the
                // dictionary itself when it is direct.
                const er = opened.trailer.encrypt;
                const encNode = er && er.type === 'dict' ? er
                    : opened._raw.resolve({ type: 'ref', num: er.num, gen: er.gen });
                const p = encNode && encNode.type === 'dict' && encNode.entries.P ? encNode.entries.P.value : null;
                opened.losses.push({
                    code: 'pdf/document/opened-with-empty-password',
                    message: 'the document is encrypted; it was opened with the empty password',
                    context: { permissions: p }
                });
                return opened;
            }

            const indirects = new Map();
            const lossKeys = new Set();
            // Keys of objects every section marks free (read as null).
            const freeKeys = new Set();
            // Decoded members of every /Type /ObjStm container touched by
            // this read — one decode + parse per container, per document.
            const objStmMembers = new Map();
            // Keys of the objects being resolved now, innermost last. A
            // stream's indirect /Length is resolved while the stream is
            // parsed, so a /Length that names the stream itself (qpdf's
            // issue-117.pdf), or a container that names one of its own
            // members, would re-enter without end.
            const resolving = new Set();

            function resolve(ref) {
                if (!ref || ref.type !== 'ref') return ref;
                return resolveByKey(ref.num, ref.gen);
            }
            /**
             * Object `num gen`, through the re-entry guard: a reference to
             * an object being resolved reads as null, recorded as
             * `pdf/document/reference-cycle` (a null /Length falls to the
             * `endstream` scan); a nesting deeper than
             * `MAX_RESOLVE_DEPTH` throws `pdf/document/resolve-too-deep`.
             */
            function resolveByKey(num, gen) {
                const key = num + ':' + gen;
                if (indirects.has(key)) return indirects.get(key).value;
                if (resolving.has(key)) {
                    recordLoss('cycle:' + key, {
                        code: 'pdf/document/reference-cycle',
                        message: `object ${num} ${gen} is referenced while it is being read; ` +
                            'the reference reads as null',
                        context: { num, gen }
                    });
                    return PDF_NULL;
                }
                if (resolving.size >= MAX_RESOLVE_DEPTH) {
                    throw new ParseError('pdf/document/resolve-too-deep',
                        `object ${num} ${gen} nests more than ${MAX_RESOLVE_DEPTH} objects being read`,
                        { context: { num, gen, depth: resolving.size } });
                }
                resolving.add(key);
                try {
                    return resolveUnguarded(num, gen, key);
                } finally {
                    resolving.delete(key);
                }
            }
            function resolveUnguarded(num, gen, key) {
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
                if (offset <= 0 || offset >= src.size) {
                    throw new ParseError('pdf/document/bad-offset',
                        `object ${num} ${gen} xref offset out of range`,
                        { context: { num, gen, offset, total: src.size } });
                }
                const def = src.run(offset, (b, at, end) => {
                    const d = parseIndirect(tokenize(b, { start: at }), resolve);
                    checkStreamWindow(d.value, b, end, resolve);
                    // Through a source, a stream keeps its own bytes, not
                    // its window's.
                    if (fromSource && d.value && d.value.type === 'stream') d.value = { ...d.value, raw: d.value.raw.slice() };
                    return d;
                });
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
                resolve,
                info: () => (trailerTyped && trailerTyped.info ? infoText({ type: 'ref', num: trailerTyped.info.num, gen: trailerTyped.info.gen }, resolve) : null),
                pageContents(i) {
                    if (!Number.isInteger(i) || i < 0 || i >= pages.length)
                        throw new ContractError('pdf/document/bad-page-index', `no page ${i} (the document has ${pages.length})`, { context: { index: i, pages: pages.length } });
                    return contentsOf(pages[i], resolve);
                },
                // A byte-source read carries `source`, never `bytes`.
                _raw: fromSource
                    ? { resolve, source: input, headerEnd, indirects }
                    : { resolve, bytes, headerEnd, indirects }
            };
        }

        return { readDocument, readHeader };
    }
};
