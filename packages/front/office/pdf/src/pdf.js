// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Top-level `@awacloud/pdf` orchestrator — public entry-point
 * factory that binds the syntax + document layer modules into an
 * ergonomic read/write API exposing `.use(...)` extensions.
 *
 * Strict factory-only descriptor — same pattern as
 * `@awacloud/ooxml/src/docx/docx.js`. All dependencies are declared in
 * `dependencies[]` and received as parameters ; no top-level `import`,
 * no internal bootstrap.
 *
 * Resolution path : register the four arrays of `src/main.js` into a
 * `@awacloud/fw` `ModuleRuntime` and call `runtime.resolve('pdf')`. Tests
 * materialise via the helper `tests/_helpers/build.js` `bootstrapPdf()`.
 *
 * Extension hook — `.use(extension)` is idempotent on `extension.name`.
 *
 * @module pdf/pdf
 */

import { pdfErrors } from './errors.js';
import { pdfShared } from './_shared/index.js';
import { pdfTokenizer } from './syntax/tokenizer.js';
import { pdfParserObj } from './syntax/parser-obj.js';
import { pdfParser } from './syntax/parser.js';
import { pdfXref } from './syntax/xref.js';
import { pdfTrailer } from './syntax/trailer.js';
import { pdfSerializer } from './syntax/serializer.js';
import { pdfCatalog } from './document/catalog.js';
import { pdfPages } from './document/pages.js';
import { pdfPage } from './document/page.js';
import { pdfDocument } from './document/document.js';
import { pdfWriter } from './document/writer.js';

export const pdf = {
    name: 'pdf',
    dependencies: [
        'pdfErrors', 'pdfShared',
        'pdfTokenizer', 'pdfParserObj', 'pdfParser',
        'pdfXref', 'pdfTrailer', 'pdfSerializer',
        'pdfCatalog', 'pdfPages', 'pdfPage',
        'pdfDocument', 'pdfWriter'
    ],
    deps: [pdfErrors, pdfShared, pdfTokenizer, pdfParserObj, pdfParser, pdfXref, pdfTrailer, pdfSerializer, pdfCatalog, pdfPages, pdfPage, pdfDocument, pdfWriter],

    factory(errors, shared, tokenizer, parserObj, parser,
            xref, trailer, serializer,
            catalog, pages, page,
            docMod, writerMod) {
        const { ContractError } = errors;

        const readDocument      = docMod.readDocument;
        const readHeader        = docMod.readHeader;
        const writeDocument     = writerMod.writeDocument;
        const assembleIndirects = writerMod.assembleIndirects;

        const usedExtensions = new Set();
        const api = {
            read(bytes, opts) { return readDocument(bytes, opts); },
            header(bytes) { return readHeader(bytes); },
            /**
             * Serialize a document model back to bytes.
             *
             * For a `read()` Document, `opts.strict === true` (strictly `true`,
             * a truthy non-boolean is NOT strict) throws
             * `pdf/writer/unresolvable-objects` instead of silently dropping
             * an in-use xref entry that cannot be resolved. In lenient mode
             * the dropped entries are listed on the result's non-enumerable
             * `skippedObjects` property and handed once to `opts.onSkipped`
             * (a copy of the list) when it is non-empty. A WriteModel carries
             * no resolvable xref, so `opts` is ignored for it.
             *
             * @param {object} model  A `read()` Document or a raw WriteModel.
             * @param {{ strict?: boolean, onSkipped?: (skipped: Array<{num:number, gen:number, code:string}>) => void }} [opts]
             * @returns {Uint8Array} bytes; non-enumerable `skippedObjects` (always an
             *   array, `[]` for a WriteModel or a clean Document).
             */
            write(model, opts) {
                const o = opts && typeof opts === 'object' ? opts : {};
                let skipped = [];
                let bytes;
                if (model && model._raw && typeof model._raw.resolve === 'function') {
                    const indirects = assembleIndirects(model, o.strict === true ? { strict: true } : undefined);
                    skipped = indirects.skippedObjects || [];
                    bytes = writeDocument({
                        indirects,
                        root: model.catalog.pages
                            ? { num: model.trailer.root.num, gen: model.trailer.root.gen }
                            : model.trailer.root,
                        info: model.trailer.info,
                        id:   model.trailer.id,
                        version: '2.0'
                    });
                } else {
                    bytes = writeDocument(model);
                }
                if (skipped.length > 0 && typeof o.onSkipped === 'function') o.onSkipped(skipped.slice());
                Object.defineProperty(bytes, 'skippedObjects', {
                    value: skipped, enumerable: false, writable: true, configurable: true
                });
                return bytes;
            },
            use(ext) {
                if (!ext || typeof ext.name !== 'string' || typeof ext.register !== 'function') {
                    throw new ContractError('pdf/use/bad-extension',
                        '.use() requires { name: string, register: function }',
                        { context: { keys: ext && Object.keys(ext) } });
                }
                if (usedExtensions.has(ext.name)) return api;
                usedExtensions.add(ext.name);
                const next = ext.register(api, { usedExtensions });
                if (next && typeof next === 'object') {
                    for (const k of Object.keys(next)) {
                        if (k !== 'use') api[k] = next[k];
                    }
                }
                return api;
            },
            usedExtension(name) { return usedExtensions.has(name); }
        };

        // Touch unused but declared deps so the runtime warns on mis-wiring.
        void shared; void tokenizer; void parserObj; void parser;
        void xref; void trailer; void serializer;
        void catalog; void pages; void page;

        return api;
    }
};
