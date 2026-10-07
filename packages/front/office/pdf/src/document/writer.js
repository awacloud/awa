// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Document writer — turn a model into PDF bytes (`%PDF-2.0` unless `opts.version` says otherwise).
 *
 * Strategy:
 *
 * 1. Emit the header (`%PDF-<version>\n`) and the binary comment line (bytes `0x25 0xE2 0xE3 0xCF 0xD3 0x0A`).
 * 2. For each indirect object, serialize via `serializeIndirect` and
 *    record its byte offset.
 * 3. Emit a classical xref table (`xref` keyword + subsection
 *    `0 N` + 20-byte entries — object 0 is the head of the free list
 *    with `0000000000 65535 f `).
 * 4. Emit the trailer dict + `startxref` pointer + `%%EOF`.
 *
 * @module pdf/document/writer
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfSerializer } from '../syntax/serializer.js';

export const pdfWriter = {
    name: 'pdfWriter',
    dependencies: ['pdfErrors', 'pdfSerializer'],
    deps: [pdfErrors, pdfSerializer],
    factory(errors, serializerMod) {
        const { RenderError } = errors;
        const serializeIndirect = serializerMod.serializeIndirect;

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

        function validateIndirects(list) {
            let prev = -1;
            for (const it of list) {
                if (!it || !Number.isFinite(it.num) || it.num < 1) {
                    throw new RenderError('pdf/writer/bad-indirect',
                        'each indirect requires num >= 1',
                        { context: { item: it } });
                }
                if (it.num === prev) {
                    throw new RenderError('pdf/writer/duplicate-num',
                        'duplicate object number',
                        { context: { num: it.num } });
                }
                prev = it.num;
            }
        }

        function buildXref(maxNum, offsets) {
            let s = `xref\n0 ${maxNum + 1}\n`;
            s += '0000000000 65535 f \n';
            for (let n = 1; n <= maxNum; n++) {
                if (offsets.has(n)) {
                    s += pad10(offsets.get(n)) + ' 00000 n \n';
                } else {
                    s += '0000000000 00000 f \n';
                }
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
            parts.push(' >>\n');
            parts.push(`startxref\n${opts.xrefOffset}\n%%EOF\n`);
            return te.encode(parts.join(''));
        }

        function writeDocument(opts) {
            if (!opts || !Array.isArray(opts.indirects)) {
                throw new RenderError('pdf/writer/bad-input',
                    'writeDocument expects { indirects: [...] }');
            }
            if (!opts.root || !Number.isFinite(opts.root.num)) {
                throw new RenderError('pdf/writer/no-root',
                    'writeDocument requires opts.root');
            }
            const version = opts.version || '2.0';
            if (!/^\d\.\d$/.test(version)) {
                throw new RenderError('pdf/writer/bad-version',
                    'version must look like "x.y"',
                    { context: { version } });
            }
            const indirects = opts.indirects.slice().sort((a, b) => a.num - b.num);
            validateIndirects(indirects);

            const parts = [];
            let cursor  = 0;
            const offsets = new Map();

            function push(u8) {
                parts.push(u8);
                cursor += u8.length;
            }

            push(te.encode(`%PDF-${version}\n`));
            push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

            const maxNum = indirects.length > 0 ? indirects[indirects.length - 1].num : 0;
            for (const { num, gen, value } of indirects) {
                offsets.set(num, cursor);
                push(serializeIndirect(num, gen, value));
            }

            const xrefOffset = cursor;
            push(buildXref(maxNum, offsets));

            const size = maxNum + 1;
            push(buildTrailer({
                size,
                root: opts.root,
                info: opts.info,
                id:   opts.id,
                xrefOffset
            }));

            return concat(parts);
        }

        /**
         * Snapshot a `pdf.read()` model into an ordered `{ num, gen, value }`
         * list ready for `writeDocument`. Forces full resolution first; an
         * in-use xref entry that cannot be resolved is NOT written (its
         * indirect never reaches the cache), and the loss is reported rather
         * than silent.
         *
         * Lenient by default: the list is still returned, with the skipped
         * entries on its non-enumerable `skippedObjects` property
         * (`Array<{ num, gen, code }>`, empty when nothing was skipped;
         * `code` is the caught error's code when it is a typed pdf error,
         * else `'unknown'`). With `opts.strict === true` the call throws a
         * `RenderError` coded `pdf/writer/unresolvable-objects` instead,
         * carrying the same list in `context.objects`.
         *
         * @param {object} model A model produced by `pdf.read()`.
         * @param {{ strict?: boolean }} [opts]
         * @returns {Array<{num:number, gen:number, value:object}>}
         */
        function assembleIndirects(model, opts) {
            if (!model || !model._raw || typeof model._raw.resolve !== 'function') {
                throw new RenderError('pdf/writer/bad-model',
                    'assembleIndirects requires a model produced by pdf.read()');
            }
            const skipped = [];
            for (const k of Object.keys(model.xref.entries)) {
                const e = model.xref.entries[k];
                if (e.free) continue;
                try {
                    model._raw.resolve({ type: 'ref', num: Number(k), gen: e.gen });
                } catch (err) {
                    skipped.push({
                        num: Number(k),
                        gen: e.gen,
                        code: errors.isPdfError(err) ? err.code : 'unknown'
                    });
                }
            }
            if (skipped.length > 0 && opts && opts.strict === true) {
                throw new RenderError('pdf/writer/unresolvable-objects',
                    `${skipped.length} object${skipped.length === 1 ? '' : 's'} could not be resolved and would be dropped`,
                    { context: { objects: skipped } });
            }
            const out = [];
            for (const [key, rec] of model._raw.indirects.entries()) {
                const [n, g] = key.split(':').map(Number);
                out.push({ num: n, gen: g, value: rec.value });
            }
            out.sort((a, b) => a.num - b.num);
            Object.defineProperty(out, 'skippedObjects', {
                value: skipped, enumerable: false, writable: true, configurable: true
            });
            return out;
        }

        return { writeDocument, assembleIndirects };
    }
};
