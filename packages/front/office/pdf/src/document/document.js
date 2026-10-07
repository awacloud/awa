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
 * silently handing back a ciphertext model. The full compose-decrypt
 * read path (password API, V4/V5/V6 handler selection, per-object
 * decrypt through `resolveByKey`) is not provided by this module — pass
 * `{ allowEncrypted: true }` to opt into the raw behaviour.
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

export const pdfDocument = {
    name: 'pdfDocument',
    dependencies: [
        'pdfErrors', 'pdfTokenizer', 'pdfParser',
        'pdfXref', 'pdfTrailer',
        'pdfCatalog', 'pdfPage', 'pdfPages',
        'pdfCrossRefStream', 'pdfObjStream', 'pdfFilterDispatch'
    ],
    deps: [pdfErrors, pdfTokenizer, pdfParser, pdfXref, pdfTrailer, pdfCatalog, pdfPage, pdfPages, pdfCrossRefStream, pdfObjStream, pdfFilterDispatch],
    factory(errors, tokenizerMod, parserMod, xrefMod, trailerMod,
            catalogMod, pageMod, pagesMod,
            crossRefStreamMod, objStreamMod, filterDispatchMod) {
        const { ParseError } = errors;
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

        function readDocument(bytes, opts = {}) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/document/bad-input',
                    'readDocument expects a Uint8Array',
                    { context: { 'typeof': typeof bytes } });
            }
            const { version, end: headerEnd } = readHeader(bytes);

            const sxAt = locateStartXref(bytes);
            if (sxAt < 0) {
                throw new ParseError('pdf/document/no-startxref',
                    'startxref keyword not found near EOF');
            }
            const xrefAt = readStartXref(bytes, sxAt);

            const xref = { entries: {}, sections: [] };
            // Read-path loss ledger: degradations the reader
            // tolerated instead of throwing. Live array — later calls to
            // `_raw.resolve` append to it too.
            const losses = [];
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
            const trailerTyped = typeTrailer(mergeTrailerDicts(trailerDicts));

            if (trailerTyped.encrypt && opts.allowEncrypted !== true) {
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
                indirects.set(key, { value: def.value, offset });
                return def.value;
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
             * always carry generation 0.
             */
            function resolveCompressed(num, gen, entry) {
                if (trailerTyped && trailerTyped.encrypt) {
                    throw new ParseError('pdf/document/objstm-encrypted',
                        'object streams of an encrypted document cannot be ' +
                        'read — no decrypt path is composed for readDocument',
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
