// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Incremental update writer.
 *
 * `appendIncremental(pdfBytes, updates)` produces a new PDF that
 * carries the original bytes verbatim followed by an "incremental
 * update" section per ISO 32000-2:2020 §7.5.6:
 *
 *     originalBytes ‖ newObjects ‖ xref ‖ trailer (with /Prev) ‖ %%EOF
 *
 * Strategy:
 *
 * 1. Locate the previous `startxref` offset in `pdfBytes` so the new
 *    trailer can carry `/Prev N`.
 * 2. Locate the previous trailer dict (via `parseTrailerDict`) to
 *    carry forward `/Root`, `/Info`, `/Size`, `/ID` unless overridden.
 * 3. Emit each `update` indirect (same shape as `pdfWriter.writeDocument`
 *    items: `{ num, gen, value }`) starting at the end of the original
 *    bytes; record byte offsets.
 * 4. Emit a fresh classical xref table covering only the updated
 *    object numbers (one subsection per contiguous run). Object 0 is
 *    only emitted in the section starting at 0; otherwise we emit only
 *    the modified runs (per §7.5.6 — incremental xref sections do not
 *    need to cover object 0).
 * 5. Emit a trailer with `/Prev = previousXrefOffset`, updated
 *    `/Size = max(prev.Size, newMaxNum + 1)`, and carry-over
 *    `/Root` / `/Info` / `/ID` if any.
 *
 * The PDF reader (`pdfDocument.readDocument`) already follows the
 * `/Prev` chain — the new entries win over older ones automatically.
 *
 * Section form: the form of the update follows the form of the
 * base's NEWEST section — the one `startxref` designates.
 *
 *   - Classical table there → steps 4-5 above, byte-identical to the
 *     writer's original, table-only output (only the newest trailer is typed).
 *   - `/Type /XRef` stream there → the update ends with an uncompressed
 *     cross-reference stream (`pdfXref.buildXrefStream`) carrying `/W`,
 *     `/Index`, `/Size`, `/Prev`, `/Root` (+ `/Info`, `/ID`). `/Root`,
 *     `/Info`, `/ID`, `/Size` default to the newest-first merge of every
 *     section's dict, as `readDocument` types it (a linearized file's
 *     main stream lacks `/Root`; the first-page one carries it).
 *   - Hybrid-reference base (a classical trailer with `/XRefStm`, anywhere
 *     in the chain) → refused, `pdf/incremental/hybrid-base` (two
 *     conforming readers may resolve different objects in such a file).
 *   - Neither form at `startxref` → refused,
 *     `pdf/incremental/unsupported-base`.
 *
 * Constraints / scope:
 *
 *   - No ObjStm grouping (see Item #7b).
 *   - Does not patch existing objects in-place — only appends.
 *
 * @module pdf/document/incrementalWriter
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';

export const pdfIncrementalWriter = {
    name: 'pdfIncrementalWriter',
    dependencies: [
        'pdfErrors',
        'pdfSerializer',
        'pdfTokenizer',
        'pdfParser',
        'pdfXref',
        'pdfTrailer'
    ],
    deps: [pdfErrors, pdfSerializer, pdfTokenizer, pdfParser, pdfXref, pdfTrailer],
    factory(errors, serializerMod, tokenizerMod, parserMod, xrefMod, trailerMod) {
        const { RenderError, ParseError } = errors;
        const serializeIndirect = serializerMod.serializeIndirect;
        const serializeObject = serializerMod.serializeObject;
        const locateStartXref = xrefMod.locateStartXref;
        const readStartXref   = xrefMod.readStartXref;
        const parseXrefTable  = xrefMod.parseXrefTable;
        const parseTrailerDict = xrefMod.parseTrailerDict;
        const readXrefStreamDict = xrefMod.readXrefStreamDict;
        const buildXrefStream  = xrefMod.buildXrefStream;
        const typeTrailer = trailerMod.typeTrailer;

        // Trailer / xref-stream dict keys that describe ONE section only
        // (§7.5.5, §7.5.8.2) — same set as pdfDocument's trailer merge.
        const SECTION_LOCAL_KEYS = new Set([
            'Prev', 'XRefStm', 'Type', 'W', 'Index', 'Length',
            'Filter', 'DecodeParms', 'F', 'FFilter', 'FDecodeParms', 'DL'
        ]);

        const te = new TextEncoder();

        function pad10(n) { return String(n).padStart(10, '0'); }

        function hexLit(bytes) {
            const H = '0123456789ABCDEF';
            let s = '<';
            for (let i = 0; i < bytes.length; i++) {
                s += H[bytes[i] >> 4] + H[bytes[i] & 0xF];
            }
            return s + '>';
        }

        function concat(arrays) {
            let n = 0;
            for (const a of arrays) n += a.length;
            const out = new Uint8Array(n);
            let o = 0;
            for (const a of arrays) { out.set(a, o); o += a.length; }
            return out;
        }

        function buildXrefSections(offsets, gens) {
            // offsets : Map<num, byteOffset>
            // gens    : Map<num, gen>
            // Always start with the free-list head (object 0).
            const nums = Array.from(offsets.keys()).sort((a, b) => a - b);
            const sections = [];

            // Object 0 subsection: emit just the head (1 entry).
            sections.push({ first: 0, count: 1, entries: ['0000000000 65535 f \n'] });

            // Contiguous runs of updated nums.
            let i = 0;
            while (i < nums.length) {
                let j = i;
                while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
                const entries = [];
                for (let k = i; k <= j; k++) {
                    const n = nums[k];
                    const g = gens.get(n) | 0;
                    entries.push(`${pad10(offsets.get(n))} ${String(g).padStart(5, '0')} n \n`);
                }
                sections.push({ first: nums[i], count: (j - i + 1), entries });
                i = j + 1;
            }
            let s = 'xref\n';
            for (const sec of sections) {
                s += `${sec.first} ${sec.count}\n`;
                for (const e of sec.entries) s += e;
            }
            return te.encode(s);
        }

        function buildTrailer(opts) {
            const parts = [`trailer\n<< /Size ${opts.size}`];
            parts.push(` /Root ${opts.root.num} ${opts.root.gen | 0} R`);
            if (opts.info) parts.push(` /Info ${opts.info.num} ${opts.info.gen | 0} R`);
            if (opts.id) {
                parts.push(' /ID [');
                parts.push(hexLit(opts.id[0]));
                parts.push(hexLit(opts.id[1]));
                parts.push(']');
            }
            // An update over an encrypted document repeats its /Encrypt
            // (ISO 32000-2 §7.5.6). An indirect reference is the usual
            // form; a direct dictionary is serialised like an object body
            // (its strings are binary, so it is spliced in as bytes).
            let directEncrypt = null;
            if (opts.encrypt) {
                if (Number.isInteger(opts.encrypt.num)) {
                    parts.push(` /Encrypt ${opts.encrypt.num} ${opts.encrypt.gen | 0} R`);
                } else {
                    directEncrypt = serializeObject(opts.encrypt);
                }
            }
            const tail = ` /Prev ${opts.prev} >>\n`
                + `startxref\n${opts.xrefOffset}\n%%EOF\n`;
            if (directEncrypt) {
                parts.push(' /Encrypt ');
                return concat([te.encode(parts.join('')), directEncrypt, te.encode(tail)]);
            }
            parts.push(tail);
            return te.encode(parts.join(''));
        }

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

        /** True when the bytes at `at` (after white space) spell `xref`. */
        function startsXrefTable(bytes, at) {
            const p = skipWhitespace(bytes, at);
            return bytes[p] === 0x78 && bytes[p + 1] === 0x72
                && bytes[p + 2] === 0x65 && bytes[p + 3] === 0x66;
        }

        /**
         * Walk the cross-reference chain from `at` (newest first) and
         * return each section's form and trailer dict. Tolerant: the walk
         * stops at the first section that does not parse, so an older
         * damaged section never changes what the newest one yields.
         */
        function walkSections(pdfBytes, at) {
            const out = [];
            const seen = new Set();
            let cursor = at;
            for (let safety = 0; safety < 32 && cursor >= 0; safety++) {
                if (seen.has(cursor)) break;
                seen.add(cursor);
                let kind, dict;
                try {
                    if (startsXrefTable(pdfBytes, cursor)) {
                        const section = parseXrefTable(pdfBytes, cursor);
                        dict = parseTrailerDict(pdfBytes, section.end).dict;
                        kind = 'table';
                    } else {
                        dict = readXrefStreamDict(pdfBytes, cursor).dict;
                        kind = 'stream';
                    }
                } catch (_) {
                    break;
                }
                out.push({ at: cursor, kind, dict });
                const prev = dict && dict.type === 'dict' && dict.entries.Prev;
                if (prev && prev.type === 'int' && prev.value >= 0
                    && prev.value !== cursor) {
                    cursor = prev.value;
                } else break;
            }
            return out;
        }

        /**
         * Newest-first merge of the section dicts (same rule as
         * `pdfDocument.readDocument`): each document key comes
         * from the newest section that carries it; section-local keys are
         * never merged.
         */
        function mergeSectionDicts(sections) {
            const entries = {};
            for (const s of sections) {
                if (!s.dict || s.dict.type !== 'dict') continue;
                for (const k of Object.keys(s.dict.entries)) {
                    if (SECTION_LOCAL_KEYS.has(k)) continue;
                    if (!(k in entries)) entries[k] = s.dict.entries[k];
                }
            }
            return { type: 'dict', entries };
        }

        /**
         * Hybrid-reference file (§7.5.8.4): a classical trailer carrying
         * `/XRefStm`. Refused: two conforming readers may resolve different objects in such a
         * file, so an update over it could read differently per viewer.
         */
        function refuseHybrid(sections) {
            for (const s of sections) {
                const stm = s.kind === 'table' && s.dict && s.dict.type === 'dict'
                    && s.dict.entries.XRefStm;
                if (stm) {
                    throw new RenderError('pdf/incremental/hybrid-base',
                        'appendIncremental refuses a hybrid-reference base: the '
                        + `classical xref section at offset ${s.at} carries /XRefStm `
                        + '(a companion cross-reference stream); updating it could '
                        + 'resolve differently in table-only and stream-aware readers',
                        { context: { offset: s.at, xrefStm: stm.value } });
                }
            }
        }

        function readPrevTrailer(pdfBytes) {
            // Mirror of pdfDocument.readDocument's xref-locating logic.
            const sxAt = locateStartXref(pdfBytes);
            if (sxAt < 0) {
                throw new ParseError('pdf/incremental/no-startxref',
                    'pdfBytes has no startxref — not a valid PDF');
            }
            const prevXrefOffset = readStartXref(pdfBytes, sxAt);
            let prev = { xrefOffset: prevXrefOffset, trailer: null, form: 'table' };
            if (startsXrefTable(pdfBytes, prevXrefOffset)) {
                // Classical base: the newest trailer alone is typed, exactly
                // as the original table-only writer did — this path's output
                // is byte-identical.
                try {
                    const section = parseXrefTable(pdfBytes, prevXrefOffset);
                    const { dict } = parseTrailerDict(pdfBytes, section.end);
                    prev.trailer = typeTrailer(dict);
                } catch (_) {
                    // unreadable — leave trailer null (opts.root required).
                }
                refuseHybrid(walkSections(pdfBytes, prevXrefOffset));
                return prev;
            }
            // Stream base: the newest section must be a
            // /Type /XRef stream; anything else is not a base this writer
            // can extend.
            try {
                readXrefStreamDict(pdfBytes, prevXrefOffset);
            } catch (e) {
                throw new ParseError('pdf/incremental/unsupported-base',
                    'appendIncremental cannot extend this base: startxref '
                    + `designates offset ${prevXrefOffset}, which starts neither a `
                    + 'classical xref table nor a /Type /XRef cross-reference stream',
                    { context: { offset: prevXrefOffset, cause: e && e.code } });
            }
            const sections = walkSections(pdfBytes, prevXrefOffset);
            refuseHybrid(sections);
            prev.form = 'stream';
            try {
                prev.trailer = typeTrailer(mergeSectionDicts(sections));
            } catch (_) {
                // no /Root or /Size anywhere in the chain — opts.root required.
            }
            return prev;
        }

        function maxNumOf(updates) {
            let m = 0;
            for (const it of updates) {
                if (it && Number.isFinite(it.num) && it.num > m) m = it.num;
            }
            return m;
        }

        /**
         * readBaseTrailer(pdfBytes) — the trailer an update over `pdfBytes`
         * starts from, without writing anything.
         *
         * Walks the whole cross-reference chain from `startxref` (newest
         * first) and types the newest-first MERGE of every section's dict
         * (the rule `pdfDocument.readDocument` applies) — for a
         * classical base too, so a caller allocating object numbers sees
         * the same `/Size` a reader sees. The base is vetted exactly as
         * `appendIncremental` vets it: a hybrid-reference base throws
         * `pdf/incremental/hybrid-base`, a `startxref` designating neither
         * form throws `pdf/incremental/unsupported-base`.
         *
         * Returns `{ form: 'table' | 'stream', xrefOffset, trailer }` where
         * `trailer` is the typed merged trailer (`{ size, root, info?, id?,
         * … }`, see `pdfTrailer.typeTrailer`) or `null` when no section
         * supplies a usable `/Size` + `/Root`.
         */
        function readBaseTrailer(pdfBytes) {
            if (!(pdfBytes instanceof Uint8Array)) {
                throw new RenderError('pdf/incremental/bad-input',
                    'readBaseTrailer expects a Uint8Array');
            }
            const prev = readPrevTrailer(pdfBytes);
            let trailer = null;
            try {
                trailer = typeTrailer(mergeSectionDicts(
                    walkSections(pdfBytes, prev.xrefOffset)));
            } catch (_) {
                // no /Root or /Size anywhere in the chain.
            }
            return { form: prev.form, xrefOffset: prev.xrefOffset, trailer };
        }

        /**
         * appendIncremental(pdfBytes, opts) — append an incremental
         * update.
         *
         * opts:
         *   updates : Array<{ num, gen?, value }>   — required
         *   root    : { num, gen } | undefined      — defaults to prev /Root
         *   info    : { num, gen } | undefined      — defaults to prev /Info
         *   id      : [Uint8Array, Uint8Array]      — defaults to prev /ID
         *   size    : number | undefined            — defaults to max(prev.Size, newMax+1)
         *   encrypt : { num, gen } | undefined      — the base's /Encrypt, repeated
         *             in the update's trailer (or cross-reference stream dict)
         *             right after /ID; required for a conforming update over
         *             an encrypted document (ISO 32000-2 §7.5.6). Never
         *             defaulted from the base; absent → output unchanged. A
         *             direct dictionary (typed `{ type: 'dict' }`) is written
         *             verbatim in a classical trailer; a cross-reference
         *             stream update refuses it (`pdf/xref/bad-stream-section`).
         *
         * Over a stream base the cross-reference stream object takes number
         * max(size, prev.Size, newMax+1) and the written /Size is one more.
         *
         * Returns Uint8Array.
         */
        function appendIncremental(pdfBytes, opts) {
            return appendSection(pdfBytes, opts).bytes;
        }

        /**
         * appendIncrementalWithOffsets(pdfBytes, opts) — exactly
         * `appendIncremental` (same options, same validation, byte-identical
         * output), also reporting where each appended object landed.
         *
         * Returns `{ bytes, offsets, xrefOffset }`: `offsets` is a
         * `Map<num, byteOffset>` giving the absolute offset of each update's
         * `num gen obj` header in `bytes`; `xrefOffset` is where the update's
         * cross-reference section (table or stream object) starts — the
         * offset the new `startxref` records.
         */
        function appendIncrementalWithOffsets(pdfBytes, opts) {
            return appendSection(pdfBytes, opts);
        }

        /** Shared body of `appendIncremental` / `appendIncrementalWithOffsets`. */
        function appendSection(pdfBytes, opts) {
            if (!(pdfBytes instanceof Uint8Array)) {
                throw new RenderError('pdf/incremental/bad-input',
                    'appendIncremental expects (Uint8Array, opts)');
            }
            if (!opts || !Array.isArray(opts.updates)) {
                throw new RenderError('pdf/incremental/no-updates',
                    'opts.updates must be an array');
            }
            const updates = opts.updates.slice().sort((a, b) => a.num - b.num);
            for (const it of updates) {
                if (!it || !Number.isFinite(it.num) || it.num < 1) {
                    throw new RenderError('pdf/incremental/bad-update',
                        'each update needs num >= 1',
                        { context: { item: it } });
                }
            }

            const prev = readPrevTrailer(pdfBytes);
            const root = opts.root
                || (prev.trailer && prev.trailer.root)
                || null;
            if (!root || !Number.isFinite(root.num)) {
                throw new RenderError('pdf/incremental/no-root',
                    'opts.root required when previous trailer cannot be read');
            }
            const info = opts.info
                || (prev.trailer && prev.trailer.info)
                || null;
            const id = opts.id
                || (prev.trailer && prev.trailer.id)
                || null;
            const prevSize = (prev.trailer && Number.isFinite(prev.trailer.size))
                ? prev.trailer.size : 0;

            // Emit body: starting cursor = end of original bytes.
            // PDF spec recommends a leading newline before incremental
            // section if the previous file did not end with one. We
            // always insert one to be safe.
            const parts = [pdfBytes];
            let cursor = pdfBytes.length;
            const offsets = new Map();
            const gens = new Map();

            // Ensure separator newline.
            const sep = te.encode('\n');
            parts.push(sep);
            cursor += sep.length;

            for (const { num, gen, value } of updates) {
                offsets.set(num, cursor);
                gens.set(num, gen | 0);
                const bytes = serializeIndirect(num, gen | 0, value);
                parts.push(bytes);
                cursor += bytes.length;
            }

            const xrefOffset = cursor;
            const newMax = maxNumOf(updates);
            const size = (opts.size | 0) || Math.max(prevSize, newMax + 1);

            if (prev.form === 'stream') {
                // The base's newest section is a cross-reference
                // stream, so the update is one too (§7.5.8) — its own
                // object takes the first number past every other one.
                const xrefNum = Math.max(size, prevSize, newMax + 1);
                const entries = [];
                for (const [num, offset] of offsets) {
                    entries.push({ num, offset, gen: gens.get(num) });
                }
                parts.push(buildXrefStream({
                    num: xrefNum,
                    offset: xrefOffset,
                    entries,
                    size: xrefNum + 1,
                    prev: prev.xrefOffset,
                    root,
                    info,
                    id,
                    encrypt: opts.encrypt
                }));
                parts.push(te.encode(`startxref\n${xrefOffset}\n%%EOF\n`));
                return { bytes: concat(parts), offsets, xrefOffset };
            }

            parts.push(buildXrefSections(offsets, gens));

            parts.push(buildTrailer({
                size,
                root,
                info,
                id,
                encrypt: opts.encrypt,
                prev: prev.xrefOffset,
                xrefOffset
            }));

            return { bytes: concat(parts), offsets, xrefOffset };
        }

        return { appendIncremental, appendIncrementalWithOffsets, readBaseTrailer };
    }
};
