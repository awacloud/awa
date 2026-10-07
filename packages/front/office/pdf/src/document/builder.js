// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Constructive document builder — ergonomic DSL on top of
 * `pdfWriter.writeDocument`.
 *
 * Builds a PDF 2.0 document progressively from a chain of high-level
 * calls (addPage, addContent, addFont, addImage, addMetadata, setVersion,
 * setId) and emits `Uint8Array` bytes on `.build()`.
 *
 * The returned builder is closure-based (no `class`, no `this`) so the
 * factory body remains worker-transportable when stringified.
 *
 * Example:
 *
 *     const { builder } = pdfBuilder.factory(errors, parserObj, writer);
 *     const bytes = builder()
 *         .addPage({ mediaBox: [0, 0, 612, 792] })
 *         .addFont({ name: 'F1', baseFont: 'Helvetica', subtype: 'Type1' })
 *         .addContent('BT /F1 12 Tf 100 700 Td (Hello) Tj ET')
 *         .addMetadata({ Title: 'Demo', Author: 'awa' })
 *         .build();
 *
 * `addFont` also accepts an **embedded** font — a `pdfFontEmbed.embedSimple`
 * or `embedCid` result. The builder owns the indirect wiring the embed adapter deliberately leaves undone
 * (font-program stream with `/Length1`, `/FontDescriptor`, `/ToUnicode`, and
 * for the composite route the descendant `CIDFont`), and never mutates the
 * caller's dicts:
 *
 *     const e = pdfFontEmbed.embedCid(font, codePoints);
 *     builder().addPage()
 *         .addFont({ name: 'F1', embedded: e })
 *         .addContent(concat('BT /F1 12 Tf 72 700 Td ', hex(e.encode('Hé')), ' Tj ET'))
 *         .build();
 *
 * `addImage` is the image counterpart of `addFont`'s embedded route: it
 * allocates an image XObject as an indirect stream and registers it in the current page's
 * `/Resources /XObject`. It decodes nothing — the caller supplies already
 * encoded bytes plus their parameters — and it emits no content operator,
 * so the caller places the ink itself:
 *
 *     builder().addPage()
 *         .addImage({ name: 'Im0', width: 2, height: 2,
 *                     colorSpace: 'DeviceRGB', bitsPerComponent: 8,
 *                     data: rgbBytes })
 *         .addContent('q 200 0 0 200 72 500 cm /Im0 Do Q')
 *         .build();
 *
 * @module pdf/document/builder
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfWriter } from './writer.js';

export const pdfBuilder = {
    name: 'pdfBuilder',
    dependencies: ['pdfErrors', 'pdfParserObj', 'pdfWriter'],
    deps: [pdfErrors, pdfParserObj, pdfWriter],
    factory(errors, parserObjMod, writerMod) {
        const { RenderError } = errors;
        const obj = parserObjMod.obj;
        const writeDocument = writerMod.writeDocument;

        const te = new TextEncoder();

        const STRINGY_INFO = new Set([
            'Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'
        ]);
        const DATE_INFO = new Set(['CreationDate', 'ModDate']);

        function toBytes(v) {
            if (v instanceof Uint8Array) return v;
            if (typeof v === 'string') return te.encode(v);
            throw new RenderError('pdf/builder/bad-bytes',
                'expected string or Uint8Array',
                { context: { typeof: typeof v } });
        }

        function strObj(s) {
            return obj.string(te.encode(String(s)), 'lit');
        }

        function numObj(n) {
            return Number.isInteger(n) ? obj.int(n) : obj.real(n);
        }

        function boxArray(box) {
            if (!Array.isArray(box) || box.length !== 4) {
                throw new RenderError('pdf/builder/bad-box',
                    'box must be a 4-element array',
                    { context: { box } });
            }
            return obj.array(box.map(numObj));
        }

        /**
         * Shallow-clone a typed dict, overriding/adding `patch` entries.
         * The input dict is NEVER mutated — an embed result is the caller's
         * object and may be registered on several pages.
         */
        function withEntries(dict, patch) {
            const src = (dict && dict.type === 'dict' && dict.entries) ? dict.entries : {};
            const entries = {};
            for (const k of Object.keys(src)) entries[k] = src[k];
            for (const k of Object.keys(patch)) entries[k] = patch[k];
            return obj.dict(entries);
        }

        function isDict(v) { return !!(v && v.type === 'dict' && v.entries); }

        /**
         * A `pdfFontEmbed` result: `fontFile` + `descriptor` +
         * `toUnicodeStream` and EITHER `fontDict` (simple) OR
         * `type0Dict` + `cidFontDict` (composite) — never both.
         */
        function isEmbedResult(e) {
            if (!e || typeof e !== 'object') return false;
            if (!(e.fontFile instanceof Uint8Array)) return false;
            if (!isDict(e.descriptor)) return false;
            if (!e.toUnicodeStream || e.toUnicodeStream.type !== 'stream') return false;
            const simple    = isDict(e.fontDict);
            const composite = isDict(e.type0Dict) && isDict(e.cidFontDict);
            return simple !== composite;
        }

        function parseHexId(hex) {
            if (hex instanceof Uint8Array) return hex;
            if (typeof hex !== 'string') {
                throw new RenderError('pdf/builder/bad-id',
                    'id parts must be hex string or Uint8Array');
            }
            const clean = hex.replace(/[^0-9a-fA-F]/g, '');
            if (clean.length % 2 !== 0) {
                throw new RenderError('pdf/builder/bad-id-hex',
                    'hex id must have even length');
            }
            const out = new Uint8Array(clean.length / 2);
            for (let i = 0; i < out.length; i++) {
                out[i] = parseInt(clean.substr(i * 2, 2), 16);
            }
            return out;
        }

        function createBuilder() {
            // Local mutable state — held in closure.
            let nextNum = 1;
            const indirects = [];                  // [{ num, gen, value }]
            const pageRecords = [];                // [{ num, page-state }]
            const embedNums = new WeakMap();       // embed result -> { num }
            const stdFontNums = new Map();         // baseFont|subtype|encoding -> num
            let currentPage = null;
            let version = '2.0';
            let docId = null;                      // [Uint8Array, Uint8Array]
            const metadata = {};                   // raw user metadata

            function alloc() { return nextNum++; }

            function pushIndirect(num, value) {
                indirects.push({ num, gen: 0, value });
            }

            // ----------------------------------------------------------
            // Page management
            // ----------------------------------------------------------

            function addPage(opts) {
                const o = opts || {};
                const num = alloc();
                const rec = {
                    num,
                    mediaBox:  o.mediaBox  || [0, 0, 612, 792],
                    cropBox:   o.cropBox   || null,
                    rotate:    Number.isFinite(o.rotate) ? (o.rotate | 0) : null,
                    fonts:     {},               // name -> font ref { num, gen }
                    xobjects:  {},               // name -> xobject ref { num, gen }
                    extraResources: o.resources || null,
                    contents:  []                // [num, ...]
                };
                pageRecords.push(rec);
                currentPage = rec;
                return api;
            }

            // ----------------------------------------------------------
            // Content streams
            // ----------------------------------------------------------

            function addContent(data) {
                if (!currentPage) {
                    throw new RenderError('pdf/builder/no-page',
                        'addContent requires a page (call addPage first)');
                }
                const raw = toBytes(data);
                const num = alloc();
                pushIndirect(num, obj.stream(obj.dict({}), raw));
                currentPage.contents.push(num);
                return api;
            }

            // ----------------------------------------------------------
            // Fonts (simple Type1/TrueType registration in Resources)
            // ----------------------------------------------------------

            /** The three predefined simple-font encodings (ISO 32000-1 9.6.6). */
            const STANDARD14_ENCODINGS = Object.freeze(
                ['WinAnsiEncoding', 'MacRomanEncoding', 'StandardEncoding']);

            function badFont(context) {
                return new RenderError('pdf/builder/bad-font',
                    'addFont requires { name, baseFont, subtype? } or { name, embedded }',
                    { context });
            }

            /**
             * Allocate every indirect an embed result needs, ONCE per result
             * object (identity cache) — the same `embedded` registered on
             * several pages resolves to the same font object number.
             *
             * Simple route → 4 indirects (font program, descriptor,
             * `/ToUnicode`, font dict); composite → 5 (the descendant
             * `CIDFont` in between). Legacy `addFont` allocates 1, so the
             * deltas over a legacy registration are +3 and +4.
             *
             * @returns {number} the font object number to put in Resources.
             */
            function allocEmbedded(embedded) {
                const cached = embedNums.get(embedded);
                if (cached) return cached.num;

                // (1) font-program stream — /Length1 is the UNCOMPRESSED length
                //     (nothing is filtered here, so it equals the byte length).
                const fileKey = typeof embedded.fontFileKey === 'string'
                    ? embedded.fontFileKey : 'FontFile2';
                const fileDict = { Length1: obj.int(embedded.fontFile.length) };
                if (fileKey === 'FontFile3') fileDict.Subtype = obj.name('OpenType');
                const fileNum = alloc();
                pushIndirect(fileNum, obj.stream(obj.dict(fileDict), embedded.fontFile));

                // (2) descriptor — the adapter lifted the program out of it.
                const descNum = alloc();
                pushIndirect(descNum, withEntries(embedded.descriptor,
                    { [fileKey]: obj.ref(fileNum, 0) }));

                // (3) /ToUnicode — the serializer refuses an inline stream.
                const touNum = alloc();
                pushIndirect(touNum, embedded.toUnicodeStream);

                // (4) the font object itself.
                let fontNum;
                if (isDict(embedded.fontDict)) {
                    fontNum = alloc();
                    pushIndirect(fontNum, withEntries(embedded.fontDict, {
                        FontDescriptor: obj.ref(descNum, 0),
                        ToUnicode:      obj.ref(touNum, 0)
                    }));
                } else {
                    const cidNum = alloc();
                    pushIndirect(cidNum, withEntries(embedded.cidFontDict, {
                        FontDescriptor: obj.ref(descNum, 0)
                    }));
                    fontNum = alloc();
                    pushIndirect(fontNum, withEntries(embedded.type0Dict, {
                        DescendantFonts: obj.array([obj.ref(cidNum, 0)]),
                        ToUnicode:       obj.ref(touNum, 0)
                    }));
                }
                embedNums.set(embedded, { num: fontNum });
                return fontNum;
            }

            /**
             * Register a font in the current page's `/Resources /Font`.
             *
             * A non-embedded font dictionary is allocated once per distinct
             * `(baseFont, subtype, encoding)` and shared by every page that
             * registers it; each page still holds its own resource name.
             * An embedded font is allocated once per embed result object.
             *
             * @param {{ name: string, baseFont?: string, subtype?: string,
             *           encoding?: string, embedded?: object }} spec
             * @returns {object} the builder api (chainable)
             */
            function addFont(spec) {
                if (!currentPage) {
                    throw new RenderError('pdf/builder/no-page',
                        'addFont requires a page (call addPage first)');
                }
                if (!spec || typeof spec !== 'object' || !spec.name) {
                    throw badFont({ spec });
                }
                // Truthiness, exactly as the legacy guard read `spec.baseFont`.
                const hasEmbedded = !!spec.embedded;
                const hasBaseFont = !!spec.baseFont;
                if (hasEmbedded === hasBaseFont) {
                    throw badFont({ name: spec.name, hasBaseFont, hasEmbedded });
                }

                // Optional predefined simple-font encoding (ISO 32000-1
                // 9.6.6 / Annex D), non-embedded route only. `undefined` =
                // absent: no `/Encoding` key, bytes identical to before.
                if (spec.encoding !== undefined
                        && (hasEmbedded
                            || !STANDARD14_ENCODINGS.includes(spec.encoding))) {
                    throw badFont({ name: spec.name, encoding: spec.encoding });
                }

                let num;
                if (hasEmbedded) {
                    if (!isEmbedResult(spec.embedded)) {
                        throw badFont({
                            name: spec.name,
                            embeddedKeys: (spec.embedded && typeof spec.embedded === 'object')
                                ? Object.keys(spec.embedded) : typeof spec.embedded
                        });
                    }
                    num = allocEmbedded(spec.embedded);
                } else {
                    const subtype = spec.subtype || 'Type1';
                    const fontEntries = {
                        Type:     obj.name('Font'),
                        Subtype:  obj.name(subtype),
                        BaseFont: obj.name(String(spec.baseFont))
                    };
                    if (spec.encoding !== undefined) {
                        fontEntries.Encoding = obj.name(spec.encoding);
                    }
                    const key = String(spec.baseFont) + '\0' + subtype
                        + '\0' + (spec.encoding ?? '');
                    num = stdFontNums.get(key);
                    if (num === undefined) {
                        num = alloc();
                        pushIndirect(num, obj.dict(fontEntries));
                        stdFontNums.set(key, num);
                    }
                }
                currentPage.fonts[String(spec.name)] = { num, gen: 0 };
                return api;
            }

            // ----------------------------------------------------------
            // Images (XObject registration in Resources)
            // ----------------------------------------------------------

            function badImage(context) {
                return new RenderError('pdf/builder/bad-image',
                    'addImage requires { name, width, height, colorSpace, '
                    + 'bitsPerComponent, data, filter?, decodeParms?, sMask? }',
                    { context });
            }

            function isPosInt(v) { return Number.isSafeInteger(v) && v > 0; }
            function isText(v) { return typeof v === 'string' && v.length > 0; }

            /**
             * Validate an image spec and allocate its XObject stream.
             *
             * Nothing here decodes, transcodes or inspects `data`: the bytes
             * go into the stream verbatim and every dict entry comes from the
             * caller's parameters.
             *
             * @param {object} spec the `addImage` spec (or an `sMask` spec).
             * @param {boolean} isMask true on the recursive `/SMask` leg — no
             *   `name` is required there, and a nested `sMask` is rejected.
             * @returns {number} the allocated indirect object number.
             */
            function allocImage(spec, isMask) {
                if (!spec || typeof spec !== 'object') {
                    throw badImage({ spec: spec === null ? 'null' : typeof spec,
                                     sMask: isMask });
                }
                const keys = [];
                if (!isMask && !isText(spec.name))       keys.push('name');
                if (!isPosInt(spec.width))               keys.push('width');
                if (!isPosInt(spec.height))              keys.push('height');
                if (!isText(spec.colorSpace))            keys.push('colorSpace');
                if (!isPosInt(spec.bitsPerComponent))    keys.push('bitsPerComponent');
                if (!(spec.data instanceof Uint8Array))  keys.push('data');
                if (spec.filter !== undefined && !isText(spec.filter)) {
                    keys.push('filter');
                }
                if (spec.decodeParms !== undefined && !isDict(spec.decodeParms)) {
                    keys.push('decodeParms');
                }
                // A soft mask has no soft mask of its own.
                if (isMask && spec.sMask !== undefined) keys.push('sMask');
                if (keys.length > 0) {
                    const context = { keys, sMask: isMask };
                    if (typeof spec.name === 'string') context.name = spec.name;
                    throw badImage(context);
                }

                // The mask is allocated FIRST so its number can be referenced.
                let maskNum = null;
                if (spec.sMask !== undefined) maskNum = allocImage(spec.sMask, true);

                const dict = {
                    Type:             obj.name('XObject'),
                    Subtype:          obj.name('Image'),
                    Width:            obj.int(spec.width),
                    Height:           obj.int(spec.height),
                    ColorSpace:       obj.name(String(spec.colorSpace)),
                    BitsPerComponent: obj.int(spec.bitsPerComponent)
                };
                if (spec.filter !== undefined) {
                    dict.Filter = obj.name(String(spec.filter));
                }
                if (spec.decodeParms !== undefined) {
                    dict.DecodeParms = spec.decodeParms;   // passthrough, typed
                }
                if (maskNum !== null) dict.SMask = obj.ref(maskNum, 0);

                const num = alloc();
                pushIndirect(num, obj.stream(obj.dict(dict), spec.data));
                return num;
            }

            /**
             * Register an image XObject on the current page.
             *
             * Mirrors `addFont`'s embedded route: the data becomes an indirect
             * stream object, and the page's `/Resources /XObject` dict maps
             * `name` to it. The caller emits the content operators
             * (`q … cm /name Do Q`) itself.
             *
             * @param {object} spec
             * @param {string} spec.name             Resource name, without the leading slash (e.g. 'Im0').
             * @param {number} spec.width            /Width  — positive integer.
             * @param {number} spec.height           /Height — positive integer.
             * @param {string} spec.colorSpace       /ColorSpace name (e.g. 'DeviceRGB', 'DeviceGray').
             * @param {number} spec.bitsPerComponent /BitsPerComponent.
             * @param {string} [spec.filter]         /Filter name (e.g. 'DCTDecode', 'FlateDecode'). Omit for unfiltered data.
             * @param {object} [spec.decodeParms]    /DecodeParms — a TYPED obj dict, passthrough.
             * @param {Uint8Array} spec.data         The encoded image bytes, verbatim.
             * @param {object} [spec.sMask]          Optional soft mask: the same spec shape minus `name`;
             *   emitted as its own XObject and referenced by `/SMask`.
             * @returns {object} the builder api (chainable, exactly like addFont)
             */
            function addImage(spec) {
                if (!currentPage) {
                    throw new RenderError('pdf/builder/no-page',
                        'addImage requires a page (call addPage first)');
                }
                const num = allocImage(spec, false);
                currentPage.xobjects[String(spec.name)] = { num, gen: 0 };
                return api;
            }

            // ----------------------------------------------------------
            // Metadata / Info dict
            // ----------------------------------------------------------

            function addMetadata(meta) {
                if (!meta || typeof meta !== 'object') {
                    throw new RenderError('pdf/builder/bad-metadata',
                        'addMetadata requires an object');
                }
                for (const k of Object.keys(meta)) {
                    metadata[k] = meta[k];
                }
                return api;
            }

            function setVersion(v) {
                if (typeof v !== 'string' || !/^\d\.\d$/.test(v)) {
                    throw new RenderError('pdf/builder/bad-version',
                        'version must look like "x.y"',
                        { context: { version: v } });
                }
                version = v;
                return api;
            }

            function setId(a, b) {
                const p1 = parseHexId(a);
                const p2 = b !== undefined ? parseHexId(b) : p1;
                docId = [p1, p2];
                return api;
            }

            // ----------------------------------------------------------
            // Build — assemble graph and call writeDocument
            // ----------------------------------------------------------

            function buildPageObject(rec, pagesNum) {
                const entries = {
                    Type:     obj.name('Page'),
                    Parent:   obj.ref(pagesNum, 0),
                    MediaBox: boxArray(rec.mediaBox)
                };
                if (rec.cropBox) entries.CropBox = boxArray(rec.cropBox);
                if (rec.rotate !== null) entries.Rotate = obj.int(rec.rotate);

                // Resources
                const resEntries = {};
                const fontNames = Object.keys(rec.fonts);
                if (fontNames.length > 0) {
                    const fontDict = {};
                    for (const fn of fontNames) {
                        const r = rec.fonts[fn];
                        fontDict[fn] = obj.ref(r.num, r.gen);
                    }
                    resEntries.Font = obj.dict(fontDict);
                }
                const xobjNames = Object.keys(rec.xobjects);
                if (xobjNames.length > 0) {
                    const xobjDict = {};
                    for (const xn of xobjNames) {
                        const r = rec.xobjects[xn];
                        xobjDict[xn] = obj.ref(r.num, r.gen);
                    }
                    resEntries.XObject = obj.dict(xobjDict);
                }
                // Merge user-provided extra resources (passthrough — must be typed obj).
                if (rec.extraResources && rec.extraResources.type === 'dict') {
                    for (const k of Object.keys(rec.extraResources.entries)) {
                        if (!resEntries[k]) {
                            resEntries[k] = rec.extraResources.entries[k];
                        }
                    }
                }
                entries.Resources = obj.dict(resEntries);

                // Contents
                if (rec.contents.length === 1) {
                    entries.Contents = obj.ref(rec.contents[0], 0);
                } else if (rec.contents.length > 1) {
                    entries.Contents = obj.array(
                        rec.contents.map((n) => obj.ref(n, 0))
                    );
                }
                return obj.dict(entries);
            }

            function buildInfoDict() {
                const keys = Object.keys(metadata);
                if (keys.length === 0) return null;
                const e = {};
                for (const k of keys) {
                    const v = metadata[k];
                    if (v === null || v === undefined) continue;
                    if (STRINGY_INFO.has(k) || DATE_INFO.has(k)) {
                        e[k] = strObj(v);
                    } else {
                        // Unknown — accept strings as PDF strings.
                        if (typeof v === 'string') e[k] = strObj(v);
                    }
                }
                if (Object.keys(e).length === 0) return null;
                return obj.dict(e);
            }

            function build() {
                if (pageRecords.length === 0) {
                    throw new RenderError('pdf/builder/no-pages',
                        'build requires at least one page');
                }

                // Reserve numbers for Catalog + Pages so refs work.
                const catalogNum = alloc();
                const pagesNum   = alloc();

                // Build page objects (uses reserved pagesNum as Parent).
                const kidsRefs = [];
                for (const rec of pageRecords) {
                    pushIndirect(rec.num, buildPageObject(rec, pagesNum));
                    kidsRefs.push(obj.ref(rec.num, 0));
                }

                // Catalog.
                pushIndirect(catalogNum, obj.dict({
                    Type:  obj.name('Catalog'),
                    Pages: obj.ref(pagesNum, 0)
                }));

                // Pages tree node.
                pushIndirect(pagesNum, obj.dict({
                    Type:  obj.name('Pages'),
                    Kids:  obj.array(kidsRefs),
                    Count: obj.int(pageRecords.length)
                }));

                // Info dict (optional).
                let infoRef = null;
                const infoDict = buildInfoDict();
                if (infoDict) {
                    const infoNum = alloc();
                    pushIndirect(infoNum, infoDict);
                    infoRef = { num: infoNum, gen: 0 };
                }

                const writeOpts = {
                    indirects,
                    root:    { num: catalogNum, gen: 0 },
                    version
                };
                if (infoRef) writeOpts.info = infoRef;
                if (docId)   writeOpts.id = docId;

                return writeDocument(writeOpts);
            }

            const api = {
                addPage, addContent, addFont, addImage, addMetadata,
                setVersion, setId, build
            };
            return api;
        }

        return { builder: createBuilder };
    }
};
