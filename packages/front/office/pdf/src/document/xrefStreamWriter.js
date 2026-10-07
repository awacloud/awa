// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Xref-stream + ObjStm writer.
 *
 * Provides an alternative to `pdfWriter.writeDocument` that emits the
 * cross-reference as a `/Type /XRef` stream object (PDF 1.5+ /
 * ISO 32000-2:2020 §7.5.8), optionally grouping non-stream indirects
 * into `/Type /ObjStm` compressed object streams (§7.5.7).
 *
 * Wire format produced:
 *
 *     %PDF-2.0\n
 *     %binary marker\n
 *     <serialized indirects, including any ObjStm wrappers>
 *     <xref-stream object>
 *     startxref\n<offset>\n
 *     %%EOF\n
 *
 * The xref stream carries fields (type, field2, field3) with widths W
 * chosen to fit the largest values:
 *
 *     type=0  free                  → (0, 0, 0)
 *     type=1  uncompressed indirect → (1, byteOffset, gen)
 *     type=2  compressed in ObjStm  → (2, objStmNum, indexInStm)
 *
 * Options:
 *
 *   writeXrefStreamDocument({
 *       indirects,            // [{ num, gen, value }]
 *       root, info, id,       // same semantics as pdfWriter
 *       version,              // default "2.0"
 *       useObjStm: false,     // when true, group non-stream non-encrypt
 *                             // indirects into ObjStm wrappers.
 *       objStmCapacity: 64    // max objects per ObjStm
 *   })
 *
 * @module pdf/document/xrefStreamWriter
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfFlate } from '../syntax/filters/flate.js';

export const pdfXrefStreamWriter = {
    name: 'pdfXrefStreamWriter',
    dependencies: ['pdfErrors', 'pdfSerializer', 'pdfFlate'],
    deps: [pdfErrors, pdfSerializer, pdfFlate],
    factory(errors, serializerMod, flateMod) {
        const { RenderError } = errors;
        const serializeIndirect = serializerMod.serializeIndirect;
        const serializeObject   = serializerMod.serializeObject;
        const flateEncode = flateMod && flateMod.encode;

        const te = new TextEncoder();

        function concat(arrays) {
            let n = 0;
            for (const a of arrays) n += a.length;
            const out = new Uint8Array(n);
            let o = 0;
            for (const a of arrays) { out.set(a, o); o += a.length; }
            return out;
        }

        function hexLit(bytes) {
            const H = '0123456789ABCDEF';
            let s = '<';
            for (let i = 0; i < bytes.length; i++) {
                s += H[bytes[i] >> 4] + H[bytes[i] & 0xF];
            }
            return s + '>';
        }

        function byteWidth(n) {
            if (n <= 0) return 1;
            let w = 0;
            while (n > 0) { n = n >>> 8; w++; }
            return w;
        }

        function writeBE(buf, off, value, w) {
            for (let i = w - 1; i >= 0; i--) {
                buf[off + i] = value & 0xff;
                value = (value / 256) | 0;
            }
        }

        function validateIndirects(list) {
            const seen = new Set();
            for (const it of list) {
                if (!it || !Number.isFinite(it.num) || it.num < 1) {
                    throw new RenderError('pdf/xrefstm-writer/bad-indirect',
                        'each indirect requires num >= 1');
                }
                if (seen.has(it.num)) {
                    throw new RenderError('pdf/xrefstm-writer/duplicate-num',
                        'duplicate object number',
                        { context: { num: it.num } });
                }
                seen.add(it.num);
            }
        }

        function isCompressible(value) {
            // ObjStm cannot carry stream objects; gen must be 0; and an
            // object cannot be the xref-stream itself (we emit that
            // last so it's not in the indirect list).
            if (!value || typeof value.type !== 'string') return false;
            if (value.type === 'stream') return false;
            return true;
        }

        function buildObjStm(members, objNum) {
            // members: [{ num, gen, value }]
            // Per §7.5.7 the body is the concatenation of object
            // headers (pairs "objNum offset") followed by serialized
            // object values (no "N M obj … endobj" wrapper around each
            // member — just the object value itself).
            const bodyParts = [];
            const offsets = new Array(members.length);

            // First serialize all object values to compute offsets.
            let cursor = 0;
            for (let i = 0; i < members.length; i++) {
                const m = members[i];
                const bytes = serializeObject(m.value);
                offsets[i] = cursor;
                bodyParts.push(bytes);
                bodyParts.push(te.encode('\n'));
                cursor += bytes.length + 1;
            }

            let headerStr = '';
            for (let i = 0; i < members.length; i++) {
                if (i > 0) headerStr += ' ';
                headerStr += `${members[i].num} ${offsets[i]}`;
            }
            headerStr += '\n';
            const headerBytes = te.encode(headerStr);

            const payload = concat([headerBytes, ...bodyParts]);
            // Compress with flate.
            const compressed = flateEncode(payload);
            const dict = {
                type: 'dict',
                entries: {
                    Type:   { type: 'name', value: 'ObjStm' },
                    N:      { type: 'int',  value: members.length },
                    First:  { type: 'int',  value: headerBytes.length },
                    Filter: { type: 'name', value: 'FlateDecode' }
                }
            };
            return {
                num: objNum,
                gen: 0,
                value: { type: 'stream', dict, raw: compressed }
            };
        }

        function buildXrefStreamIndirect(opts) {
            const {
                num, size, root, info, id,
                w, indexPairs, payload
            } = opts;
            const entries = {
                Type:   { type: 'name', value: 'XRef' },
                Size:   { type: 'int',  value: size },
                W:      { type: 'array', items: [
                    { type: 'int', value: w[0] },
                    { type: 'int', value: w[1] },
                    { type: 'int', value: w[2] }
                ] },
                Root:   { type: 'ref', num: root.num, gen: root.gen | 0 },
                Filter: { type: 'name', value: 'FlateDecode' }
            };
            if (info) entries.Info = { type: 'ref', num: info.num, gen: info.gen | 0 };
            if (id) {
                entries.ID = { type: 'array', items: [
                    { type: 'string', value: id[0], syntax: 'hex' },
                    { type: 'string', value: id[1], syntax: 'hex' }
                ] };
            }
            // Always emit /Index — covers the contiguous run.
            entries.Index = { type: 'array', items: [] };
            for (const [first, count] of indexPairs) {
                entries.Index.items.push({ type: 'int', value: first });
                entries.Index.items.push({ type: 'int', value: count });
            }
            return {
                num, gen: 0,
                value: { type: 'stream', dict: { type: 'dict', entries }, raw: payload }
            };
        }

        function writeXrefStreamDocument(opts) {
            if (!opts || !Array.isArray(opts.indirects)) {
                throw new RenderError('pdf/xrefstm-writer/bad-input',
                    'writeXrefStreamDocument expects { indirects: [...] }');
            }
            if (!opts.root || !Number.isFinite(opts.root.num)) {
                throw new RenderError('pdf/xrefstm-writer/no-root',
                    'opts.root required');
            }
            if (typeof flateEncode !== 'function') {
                throw new RenderError('pdf/xrefstm-writer/no-flate',
                    'pdfFlate.encode is required to emit xref-streams');
            }
            const version = opts.version || '2.0';
            if (!/^\d\.\d$/.test(version)) {
                throw new RenderError('pdf/xrefstm-writer/bad-version',
                    'version must look like "x.y"');
            }
            const indirects = opts.indirects.slice().sort((a, b) => a.num - b.num);
            validateIndirects(indirects);

            // Compute fresh object number for the xref-stream itself.
            const maxInputNum = indirects.length
                ? indirects[indirects.length - 1].num : 0;
            let nextNum = maxInputNum + 1;

            // Build ObjStm groupings (optional) and the final indirect
            // list. We track xref entries in a Map<num, {type, f2, f3}>.
            const xrefEntries = new Map();
            // Always include object 0 (free head).
            xrefEntries.set(0, { type: 0, f2: 0, f3: 65535 });

            const emittedIndirects = [];
            const useObjStm = !!opts.useObjStm;
            const cap = (opts.objStmCapacity | 0) || 64;

            if (useObjStm) {
                const compressible = [];
                const passthrough = [];
                for (const it of indirects) {
                    if (isCompressible(it.value) && (it.gen | 0) === 0) {
                        compressible.push(it);
                    } else {
                        passthrough.push(it);
                    }
                }
                // Group compressible into ObjStms.
                for (let i = 0; i < compressible.length; i += cap) {
                    const chunk = compressible.slice(i, i + cap);
                    const objStmNum = nextNum++;
                    const indirect = buildObjStm(chunk, objStmNum);
                    emittedIndirects.push(indirect);
                    for (let k = 0; k < chunk.length; k++) {
                        xrefEntries.set(chunk[k].num, {
                            type: 2, f2: objStmNum, f3: k
                        });
                    }
                }
                for (const it of passthrough) emittedIndirects.push(it);
            } else {
                for (const it of indirects) emittedIndirects.push(it);
            }
            emittedIndirects.sort((a, b) => a.num - b.num);

            // Emit header + binary marker.
            const parts = [];
            let cursor = 0;
            function push(u8) { parts.push(u8); cursor += u8.length; }
            push(te.encode(`%PDF-${version}\n`));
            push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

            for (const it of emittedIndirects) {
                xrefEntries.set(it.num, {
                    type: 1, f2: cursor, f3: it.gen | 0
                });
                push(serializeIndirect(it.num, it.gen | 0, it.value));
            }

            // Append the xref-stream indirect.
            const xrefNum = nextNum;
            // The xref-stream itself MUST appear in its own xref table
            // (per §7.5.8 the xref-stream's xref entry has type=1 with
            // the offset where the xref-stream begins).
            const xrefOffset = cursor;
            xrefEntries.set(xrefNum, { type: 1, f2: xrefOffset, f3: 0 });

            // Build /Index pairs from sorted nums, contiguous runs.
            const allNums = Array.from(xrefEntries.keys()).sort((a, b) => a - b);
            const indexPairs = [];
            let i = 0;
            while (i < allNums.length) {
                let j = i;
                while (j + 1 < allNums.length
                        && allNums[j + 1] === allNums[j] + 1) j++;
                indexPairs.push([allNums[i], j - i + 1]);
                i = j + 1;
            }

            // Pick W widths from observed max values.
            let maxType = 0, maxF2 = 0, maxF3 = 0;
            for (const e of xrefEntries.values()) {
                if (e.type > maxType) maxType = e.type;
                if (e.f2 > maxF2)     maxF2 = e.f2;
                if (e.f3 > maxF3)     maxF3 = e.f3;
            }
            const w = [
                Math.max(1, byteWidth(maxType)),
                Math.max(1, byteWidth(maxF2)),
                Math.max(1, byteWidth(maxF3))
            ];

            // Build the raw payload.
            const recordSize = w[0] + w[1] + w[2];
            const payload = new Uint8Array(allNums.length * recordSize);
            let off = 0;
            for (const n of allNums) {
                const e = xrefEntries.get(n);
                writeBE(payload, off,         e.type, w[0]);
                writeBE(payload, off + w[0],  e.f2,   w[1]);
                writeBE(payload, off + w[0] + w[1], e.f3, w[2]);
                off += recordSize;
            }
            const compressed = flateEncode(payload);

            const size = xrefNum + 1;
            const xrefIndirect = buildXrefStreamIndirect({
                num: xrefNum,
                size,
                root: opts.root,
                info: opts.info,
                id: opts.id,
                w,
                indexPairs,
                payload: compressed
            });
            push(serializeIndirect(xrefIndirect.num, xrefIndirect.gen,
                                   xrefIndirect.value));

            // Trailer is the xref-stream object itself; we just need
            // `startxref` + `%%EOF`.
            push(te.encode(`startxref\n${xrefOffset}\n%%EOF\n`));

            // ID note: when /ID is requested and we have no trailer to
            // host it, /ID has been embedded in the xref-stream dict.
            // (intentional per §7.5.8.)
            void hexLit; // suppress unused; reserved for future trailer paths
            return concat(parts);
        }

        return { writeXrefStreamDocument };
    }
};
