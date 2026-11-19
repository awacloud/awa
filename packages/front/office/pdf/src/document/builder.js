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
 *     const { builder } = pdfBuilder.factory(errors, parserObj, writer, xmp, icc);
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
import { pdfXmp } from '../metadata/xmp.js';
import { pdfSrgbIcc } from '../prepress/srgb-icc.js';
import { standard14Lookup, encodingLookup } from '@awacloud/fonts';

export const pdfBuilder = {
    name: 'pdfBuilder',
    dependencies: ['pdfErrors', 'pdfParserObj', 'pdfWriter', 'pdfXmp', 'pdfSrgbIcc', 'standard14Lookup', 'encodingLookup'],
    deps: [pdfErrors, pdfParserObj, pdfWriter, pdfXmp, pdfSrgbIcc, standard14Lookup, encodingLookup],
    factory(errors, parserObjMod, writerMod, xmpMod, iccMod, s14Mod, encMod) {
        const { RenderError, ContractError } = errors;
        const obj = parserObjMod.obj;
        const writeDocument = writerMod.writeDocument;

        // The PDF/A profiles `builder({ pdfA })` writes: the version each
        // asks and its XMP identification (ISO 19005-4 § 6.7.3, ISO 19005-2
        // § 6.6.4).
        const PDFA_PROFILES = Object.freeze({
            '4': Object.freeze({ version: '2.0', pdfaid: Object.freeze({ part: 4, rev: 2020 }), info: false }),
            '2b': Object.freeze({ version: '1.7', pdfaid: Object.freeze({ part: 2, conformance: 'B' }), info: true })
        });

        // The PDF/UA parts `builder({ pdfUA })` writes: the version each asks
        // and its XMP identification (ISO 14289-1 § 5, ISO 14289-2 § 5).
        const PDFUA_PARTS = Object.freeze({
            1: Object.freeze({ version: '1.7', pdfuaid: Object.freeze({ part: 1 }) }),
            2: Object.freeze({ version: '2.0', pdfuaid: Object.freeze({ part: 2, rev: 2024 }) })
        });

        /**
         * The PDF/UA claim of `opts` (`{ part, lang, version, pdfuaid }`), or
         * null without `pdfUA`. Throws `pdf/builder/bad-pdfua`,
         * `pdf/builder/pdfua-lang` and `pdf/builder/pdfua-with-pdfa`.
         */
        function uaClaimOf(opts) {
            const part = opts && opts.pdfUA !== undefined ? opts.pdfUA : null;
            if (part === null) return null;
            if (part !== 1 && part !== 2) {
                throw new ContractError('pdf/builder/bad-pdfua',
                    'builder: opts.pdfUA must be 1 or 2',
                    { context: { received: typeof part === 'number' ? String(part) : typeof part } });
            }
            const lang = opts.lang;
            if (typeof lang !== 'string' || lang === '') {
                throw new ContractError('pdf/builder/pdfua-lang',
                    'builder: opts.lang (the document language, a BCP 47 tag) is required with opts.pdfUA',
                    { context: { received: typeof lang } });
            }
            if (opts.pdfA !== undefined) {
                throw new ContractError('pdf/builder/pdfua-with-pdfa',
                    'builder: opts.pdfUA and opts.pdfA are not written together',
                    { context: { pdfUA: part, pdfA: String(opts.pdfA) } });
            }
            return { part, lang, version: PDFUA_PARTS[part].version, pdfuaid: PDFUA_PARTS[part].pdfuaid };
        }

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

        /**
         * A text string (ISO 32000-2 § 7.9.2.2): the bytes of an ASCII
         * string, else UTF-16BE behind its byte order mark.
         */
        function textObj(s) {
            if (/^[\x00-\x7f]*$/.test(s)) return obj.string(te.encode(s), 'lit');
            const out = new Uint8Array(2 + s.length * 2);
            out[0] = 0xfe; out[1] = 0xff;
            for (let i = 0; i < s.length; i++) {
                out[2 + i * 2] = s.charCodeAt(i) >> 8;
                out[3 + i * 2] = s.charCodeAt(i) & 0xff;
            }
            return obj.string(out, 'lit');
        }

        // A structure type the builder writes: a PDF name of letters and
        // digits (the standard types and the usual role-mapped ones).
        const STRUCT_TYPE = /^[A-Za-z][A-Za-z0-9]*$/;
        // The PDF 2.0 standard structure namespace (ISO 32000-2 § 14.7.4.2).
        const PDF2_NS = 'http://iso.org/pdf2/ssn';

        /**
         * The checked properties of `openElement(type, props)`: `alt` and
         * `lang` strings, `attributes` an array of `{ O, … }` objects whose
         * values are strings (names), finite numbers or booleans. Throws
         * `pdf/builder/bad-struct-props`.
         */
        function structPropsOf(props) {
            const bad = (why) => new ContractError('pdf/builder/bad-struct-props',
                `builder: openElement props: ${why}`, { context: { why } });
            if (props === undefined) return { alt: null, lang: null, attributes: [] };
            if (!props || typeof props !== 'object' || Array.isArray(props)) throw bad('not an object');
            for (const k of ['alt', 'lang']) {
                if (props[k] !== undefined && typeof props[k] !== 'string') throw bad(`${k} is not a string`);
            }
            const attributes = props.attributes === undefined ? [] : props.attributes;
            if (!Array.isArray(attributes)) throw bad('attributes is not an array');
            for (const a of attributes) {
                if (!a || typeof a !== 'object' || typeof a.O !== 'string' || a.O === '') throw bad('an attribute object has no string O');
                for (const k of Object.keys(a)) {
                    const v = a[k];
                    if (typeof v !== 'string' && typeof v !== 'boolean' && !(typeof v === 'number' && Number.isFinite(v))) {
                        throw bad(`attribute ${k} is not a string, a finite number or a boolean`);
                    }
                }
            }
            return { alt: props.alt ?? null, lang: props.lang ?? null, attributes };
        }

        /** An attribute object as a dictionary: strings as names. */
        function attributeDict(a) {
            const entries = {};
            for (const k of Object.keys(a)) {
                const v = a[k];
                entries[k] = typeof v === 'string' ? obj.name(v) : typeof v === 'boolean' ? obj.bool(v) : numObj(v);
            }
            return obj.dict(entries);
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

        /**
         * A new builder. `opts.pdfA` (`'4'` or `'2b'`) makes the document
         * claim that PDF/A profile: `build()` adds the XMP packet
         * (`pdfaid` and the `addMetadata` fields) as the catalog's
         * unfiltered `/Metadata`; under `'4'` no trailer Info is written and
         * the version is 2.0; under `'2b'` the Info is kept, the version is
         * 1.7 and a trailer `/ID` is written (`setId`'s, else derived). The
         * catalog gets a GTS_PDFA1 output intent: the first-party sRGB
         * profile, or `opts.outputIntent` (`{ profile, components,
         * identifier, info? }`).
         */
        /**
         * The output intent of a PDF/A builder: `opts.outputIntent`
         * checked, else the first-party sRGB profile; null without a PDF/A
         * profile. Throws `pdf/builder/bad-output-intent`.
         */
        function outputIntentOf(opts, profile) {
            const given = opts && Object.prototype.hasOwnProperty.call(opts, 'outputIntent') ? opts.outputIntent : undefined;
            if (given === undefined) {
                if (!profile) return null;
                return { profile: iccMod.buildSrgbIcc(), components: iccMod.SRGB_ICC_N, identifier: iccMod.SRGB_CONDITION,
                    info: iccMod.SRGB_CONDITION, registry: 'http://www.color.org' };
            }
            const ok = profile && given && typeof given === 'object'
                && given.profile instanceof Uint8Array && given.profile.length > 0
                && [1, 3, 4].includes(given.components)
                && typeof given.identifier === 'string' && given.identifier !== ''
                && (given.info === undefined || typeof given.info === 'string');
            if (!ok) {
                throw new ContractError('pdf/builder/bad-output-intent',
                    'builder: opts.outputIntent must be { profile: Uint8Array, components: 1 | 3 | 4, identifier: string, info?: string }, with opts.pdfA',
                    { context: { pdfA: profile ? 'set' : 'absent' } });
            }
            return { profile: given.profile, components: given.components, identifier: given.identifier, info: given.info };
        }

        function createBuilder(opts) {
            const pdfA = opts && opts.pdfA !== undefined ? opts.pdfA : null;
            if (pdfA !== null && (typeof pdfA !== 'string' || !Object.prototype.hasOwnProperty.call(PDFA_PROFILES, pdfA))) {
                throw new ContractError('pdf/builder/bad-pdfa',
                    "builder: opts.pdfA must be '4' or '2b'",
                    { context: { received: typeof pdfA === 'string' ? pdfA : typeof pdfA } });
            }
            const profile = pdfA !== null ? PDFA_PROFILES[pdfA] : null;
            const outputIntent = outputIntentOf(opts, profile);
            const ua = uaClaimOf(opts);
            // The standard the document claims, for the version, the fonts
            // and the trailer /ID.
            const claim = profile ? { name: `PDF/A-${pdfA}`, version: profile.version, versionCode: 'pdf/builder/pdfa-version' }
                : ua ? { name: `PDF/UA-${ua.part}`, version: ua.version, versionCode: 'pdf/builder/pdfua-version' } : null;
            // Local mutable state — held in closure.
            let nextNum = 1;
            const indirects = [];                  // [{ num, gen, value }]
            const pageRecords = [];                // [{ num, page-state }]
            const embedNums = new WeakMap();       // embed result -> { num }
            const stdFontNums = new Map();         // baseFont|subtype|encoding -> num
            const unembedded = new Set();          // baseFont of every font with no program
            let currentPage = null;
            let version = claim ? claim.version : '2.0';
            let docId = null;                      // [Uint8Array, Uint8Array]
            const metadata = {};                   // raw user metadata
            // The logical structure: the top elements and the open ones.
            // An element is { type, alt, lang, attributes, kids, num }, a
            // kid an element or { mcid, page }.
            const structTop = [];
            const structOpen = [];

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
                    contents:  [],               // [num, ...]
                    marked:    []                // the element of each MCID
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
            // Logical structure (tagged content)
            // ----------------------------------------------------------

            function noOpenElement(what) {
                return new ContractError('pdf/builder/no-open-element',
                    `builder: ${what} needs an open structure element (openElement)`);
            }

            /**
             * Open a structure element of `type` under the open one (at the
             * top when none is open). `props`: `alt`, `lang`, `attributes`.
             */
            function openElement(type, props) {
                if (typeof type !== 'string' || !STRUCT_TYPE.test(type)) {
                    throw new ContractError('pdf/builder/bad-struct-type',
                        'builder: openElement type must be a name of letters and digits',
                        { context: { received: typeof type === 'string' ? type : typeof type } });
                }
                const el = { type, ...structPropsOf(props), kids: [], num: 0 };
                if (structOpen.length > 0) structOpen[structOpen.length - 1].kids.push(el);
                else structTop.push(el);
                structOpen.push(el);
                return api;
            }

            /**
             * The current page's next MCID, made the open element's next
             * kid. The caller writes the marked-content sequence.
             */
            function markContent() {
                if (!currentPage) {
                    throw new RenderError('pdf/builder/no-page',
                        'markContent requires a page (call addPage first)');
                }
                if (structOpen.length === 0) throw noOpenElement('markContent');
                const el = structOpen[structOpen.length - 1];
                const mcid = currentPage.marked.length;
                currentPage.marked.push(el);
                el.kids.push({ mcid, page: currentPage });
                return mcid;
            }

            /** Close the open structure element. */
            function closeElement() {
                if (structOpen.length === 0) throw noOpenElement('closeElement');
                structOpen.pop();
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

            /** Built-in encoding of the two symbolic Standard 14 faces. */
            const SYMBOLIC14 = Object.freeze(['Symbol', 'ZapfDingbats']);
            const stdDescNums = new Map();         // baseFont -> descriptor num

            /**
             * The `standard14` metrics of a legacy registration (by default
             * since 2.0.0, the factory's own lookups; `addFont` below): the
             * `@awacloud/fonts` `standard14Lookup` API (as `pdfFont.typeFont`
             * takes it). PDF 2.0 requires `FirstChar`, `LastChar`, `Widths`
             * and `FontDescriptor` for every simple font, the Standard 14
             * included (ISO 32000-2 Table 109). The record's width table is
             * per WinAnsi code for the 12 Latin faces and per built-in code
             * for Symbol and ZapfDingbats. A Latin face in
             * `MacRomanEncoding`, `StandardEncoding` or with no encoding (its
             * built-in StandardEncoding) also needs `spec.encodings`, the
             * `@awacloud/fonts` `encodingLookup` API: each code takes the
             * width of its glyph — the WinAnsi table's (through WinAnsi's
             * own glyph names), else the record's `extraWidths`, else 0.
             * @returns {object} the entries to add to the font dictionary
             */
            function standard14Entries(spec, subtype) {
                const lookup = spec.standard14;
                const baseFont = String(spec.baseFont);
                const isApi = !!(lookup && typeof lookup.isStandard14 === 'function'
                    && typeof lookup.lookupStandard14 === 'function');
                if (!isApi || subtype !== 'Type1' || !lookup.isStandard14(baseFont)) {
                    throw badFont({ name: spec.name, baseFont, subtype, standard14: isApi ? 'not a Standard 14 Type1 face' : 'not a standard14Lookup API' });
                }
                const encodings = spec.encodings;
                const hasEncodings = !!(encodings && typeof encodings.lookupEncoding === 'function');
                if (encodings !== undefined && !hasEncodings) {
                    throw badFont({ name: spec.name, baseFont, standard14: 'encodings is not an encodingLookup API' });
                }
                const symbolic = SYMBOLIC14.includes(baseFont);
                const byGlyph = !symbolic && spec.encoding !== 'WinAnsiEncoding';
                if (symbolic ? spec.encoding !== undefined : (byGlyph && !hasEncodings)) {
                    throw badFont({ name: spec.name, baseFont, encoding: spec.encoding,
                        standard14: symbolic ? 'no /Encoding (built-in)' : 'WinAnsiEncoding, or an encodingLookup API in encodings' });
                }
                const rec = lookup.lookupStandard14(baseFont);
                let descNum = stdDescNums.get(baseFont);
                if (descNum === undefined) {
                    const d = {
                        Type:        obj.name('FontDescriptor'),
                        FontName:    obj.name(baseFont),
                        Flags:       obj.int(rec.flags),
                        FontBBox:    obj.array(rec.fontBBox.map(numObj)),
                        ItalicAngle: numObj(rec.italicAngle),
                        Ascent:      numObj(rec.ascent),
                        Descent:     numObj(rec.descent)
                    };
                    for (const [key, field] of [['CapHeight', 'capHeight'], ['XHeight', 'xHeight'],
                        ['StemV', 'stemV'], ['StemH', 'stemH']]) {
                        if (Number.isFinite(rec[field])) d[key] = numObj(rec[field]);
                    }
                    descNum = alloc();
                    pushIndirect(descNum, obj.dict(d));
                    stdDescNums.set(baseFont, descNum);
                }
                const widths = [];
                if (byGlyph) {
                    const glyphs = encodings.lookupEncoding(spec.encoding ?? 'StandardEncoding');
                    const winCode = new Map();
                    encodings.lookupEncoding('WinAnsiEncoding').forEach((n, c) => {
                        if (n && n !== '.notdef' && !winCode.has(n)) winCode.set(n, c);
                    });
                    const extra = rec.extraWidths || {};
                    for (let code = 32; code <= 255; code++) {
                        const n = glyphs[code];
                        const w = !n || n === '.notdef' ? 0
                            : winCode.has(n) ? rec.widths[winCode.get(n)]
                                : Object.prototype.hasOwnProperty.call(extra, n) ? extra[n] : 0;
                        widths.push(numObj(w || 0));
                    }
                } else {
                    for (let code = 32; code <= 255; code++) widths.push(numObj(rec.widths[code] || 0));
                }
                return {
                    FirstChar:      obj.int(32),
                    LastChar:       obj.int(255),
                    Widths:         obj.array(widths),
                    FontDescriptor: obj.ref(descNum, 0)
                };
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
                //     (nothing is filtered here, so it equals the byte length),
                //     a key of FontFile and FontFile2 only (ISO 32000-2
                //     Table 125); a FontFile3 stream names its /Subtype.
                const fileKey = typeof embedded.fontFileKey === 'string'
                    ? embedded.fontFileKey : 'FontFile2';
                const fileDict = fileKey === 'FontFile3'
                    ? { Subtype: obj.name('OpenType') }
                    : { Length1: obj.int(embedded.fontFile.length) };
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
             *           encoding?: string, embedded?: object, standard14?: object,
             *           encodings?: object }} spec `standard14` / `encodings`:
             *   the Standard 14 metrics (`standard14Entries`). Absent, a
             *   Standard 14 Type1 face takes the factory's own lookups
             *   (fonts' `standard14Lookup` and `encodingLookup`, since
             *   2.0.0) — Symbol and ZapfDingbats only without an
             *   `encoding`; `standard14: false`, or a factory composed
             *   without the lookups, writes the legacy dictionary.
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
                    // The metrics: the caller's lookup, else the factory's
                    // for a Standard 14 face (since 2.0.0); `false` the
                    // legacy bytes.
                    let lookup = spec.standard14;
                    let encodings = spec.encodings;
                    const base = String(spec.baseFont);
                    if (lookup === undefined && s14Mod && subtype === 'Type1' && s14Mod.isStandard14(base)
                            && !(SYMBOLIC14.includes(base) && spec.encoding !== undefined)) {
                        lookup = s14Mod;
                        if (encodings === undefined && spec.encoding !== 'WinAnsiEncoding') encodings = encMod;
                    }
                    const metrics = lookup !== undefined && lookup !== false
                        ? standard14Entries({ ...spec, standard14: lookup, encodings }, subtype) : null;
                    const key = String(spec.baseFont) + '\0' + subtype
                        + '\0' + (spec.encoding ?? '') + (metrics ? '\0standard14' : '');
                    unembedded.add(String(spec.baseFont));
                    num = stdFontNums.get(key);
                    if (num === undefined) {
                        if (metrics) Object.assign(fontEntries, metrics);
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
                if (claim && v !== claim.version) {
                    throw new ContractError(claim.versionCode,
                        `builder: ${claim.name} is written as version ${claim.version}`,
                        { context: { version: v, claim: claim.name } });
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
                if (rec.structParents !== undefined) entries.StructParents = obj.int(rec.structParents);

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

            /** The page of an element's first marked content, its own or a descendant's. */
            function firstPageOf(el) {
                for (const kid of el.kids) {
                    if (kid.page) return kid.page;
                    const page = firstPageOf(kid);
                    if (page) return page;
                }
                return null;
            }

            /**
             * Write the structure tree (ISO 32000-2 § 14.7): the elements,
             * the ParentTree, the root, the pages' StructParents. Returns
             * the root's object number; call before the pages are written.
             */
            function writeStructure() {
                let key = 0;
                for (const rec of pageRecords) {
                    if (rec.marked.length > 0) rec.structParents = key++;
                }
                const rootNum = alloc();
                let nsRef = null;
                if (ua && ua.part === 2) {
                    const nsNum = alloc();
                    pushIndirect(nsNum, obj.dict({ Type: obj.name('Namespace'), NS: strObj(PDF2_NS) }));
                    nsRef = obj.ref(nsNum, 0);
                }
                const number = (el) => {
                    el.num = alloc();
                    for (const kid of el.kids) if (!kid.page) number(kid);
                };
                structTop.forEach(number);
                const one = (items) => (items.length === 1 ? items[0] : obj.array(items));
                const write = (el, parentNum) => {
                    const page = firstPageOf(el);
                    const entries = { Type: obj.name('StructElem'), S: obj.name(el.type), P: obj.ref(parentNum, 0) };
                    if (page) entries.Pg = obj.ref(page.num, 0);
                    const kids = el.kids.map((kid) => {
                        if (!kid.page) return obj.ref(kid.num, 0);
                        if (kid.page === page) return obj.int(kid.mcid);
                        return obj.dict({ Type: obj.name('MCR'), Pg: obj.ref(kid.page.num, 0), MCID: obj.int(kid.mcid) });
                    });
                    if (kids.length > 0) entries.K = one(kids);
                    if (el.alt !== null) entries.Alt = textObj(el.alt);
                    if (el.lang !== null) entries.Lang = textObj(el.lang);
                    if (el.attributes.length > 0) entries.A = one(el.attributes.map(attributeDict));
                    if (nsRef) entries.NS = nsRef;
                    pushIndirect(el.num, obj.dict(entries));
                    for (const kid of el.kids) if (!kid.page) write(kid, el.num);
                };
                for (const el of structTop) write(el, rootNum);
                const nums = [];
                for (const rec of pageRecords) {
                    if (rec.structParents === undefined) continue;
                    nums.push(obj.int(rec.structParents), obj.array(rec.marked.map((el) => obj.ref(el.num, 0))));
                }
                const parentTreeNum = alloc();
                pushIndirect(parentTreeNum, obj.dict({ Nums: obj.array(nums) }));
                const root = {
                    Type: obj.name('StructTreeRoot'),
                    K: one(structTop.map((el) => obj.ref(el.num, 0))),
                    ParentTree: obj.ref(parentTreeNum, 0),
                    ParentTreeNextKey: obj.int(key)
                };
                if (nsRef) root.Namespaces = obj.array([nsRef]);
                pushIndirect(rootNum, obj.dict(root));
                return rootNum;
            }

            function build() {
                if (pageRecords.length === 0) {
                    throw new RenderError('pdf/builder/no-pages',
                        'build requires at least one page');
                }
                if (structOpen.length > 0) {
                    throw new ContractError('pdf/builder/open-element',
                        `builder: build() with the structure element ${structOpen[structOpen.length - 1].type} still open`,
                        { context: { open: structOpen.map((el) => el.type) } });
                }
                // PDF/A and PDF/UA embed every font program (ISO 19005-2
                // § 6.2.11.4.1, ISO 19005-4 § 6.2.10.4.1, ISO 14289-1 § 7.21.4.1).
                if (claim && unembedded.size > 0) {
                    throw new ContractError('pdf/builder/pdfa-font-not-embedded',
                        `builder: ${claim.name} embeds every font; ${[...unembedded].join(', ')} has no program`,
                        { context: { claim: claim.name, fonts: [...unembedded] } });
                }
                // PDF/UA displays the document title (ISO 14289-1 § 7.1).
                if (ua && (typeof metadata.Title !== 'string' || metadata.Title === '')) {
                    throw new ContractError('pdf/builder/pdfua-title',
                        `builder: ${claim.name} needs a Title (addMetadata)`,
                        { context: { claim: claim.name } });
                }

                // Reserve numbers for Catalog + Pages so refs work.
                const catalogNum = alloc();
                const pagesNum   = alloc();
                // The structure tree first: it numbers the pages' StructParents.
                const structRootNum = structTop.length > 0 ? writeStructure() : 0;

                // Build page objects (uses reserved pagesNum as Parent).
                const kidsRefs = [];
                for (const rec of pageRecords) {
                    pushIndirect(rec.num, buildPageObject(rec, pagesNum));
                    kidsRefs.push(obj.ref(rec.num, 0));
                }

                // Catalog, with the XMP packet of a PDF/A profile.
                const catalog = {
                    Type:  obj.name('Catalog'),
                    Pages: obj.ref(pagesNum, 0)
                };
                if (profile) {
                    const xmp = xmpMod.packet({ pdfaid: profile.pdfaid, info: metadata });
                    const metadataNum = alloc();
                    pushIndirect(metadataNum, obj.stream(obj.dict({
                        Type:    obj.name('Metadata'),
                        Subtype: obj.name('XML'),
                        Length:  obj.int(xmp.length)
                    }), xmp));
                    catalog.Metadata = obj.ref(metadataNum, 0);
                    const iccNum = alloc();
                    pushIndirect(iccNum, obj.stream(obj.dict({
                        N:      obj.int(outputIntent.components),
                        Length: obj.int(outputIntent.profile.length)
                    }), outputIntent.profile));
                    const intent = {
                        Type: obj.name('OutputIntent'),
                        S:    obj.name('GTS_PDFA1'),
                        OutputConditionIdentifier: strObj(outputIntent.identifier)
                    };
                    if (outputIntent.info) intent.Info = strObj(outputIntent.info);
                    if (outputIntent.registry) intent.RegistryName = strObj(outputIntent.registry);
                    intent.DestOutputProfile = obj.ref(iccNum, 0);
                    const intentNum = alloc();
                    pushIndirect(intentNum, obj.dict(intent));
                    catalog.OutputIntents = obj.array([obj.ref(intentNum, 0)]);
                }
                if (ua) {
                    const xmp = xmpMod.packet({ pdfuaid: ua.pdfuaid, info: metadata });
                    const metadataNum = alloc();
                    pushIndirect(metadataNum, obj.stream(obj.dict({
                        Type:    obj.name('Metadata'),
                        Subtype: obj.name('XML'),
                        Length:  obj.int(xmp.length)
                    }), xmp));
                    catalog.Metadata = obj.ref(metadataNum, 0);
                    catalog.MarkInfo = obj.dict({ Marked: obj.bool(true) });
                    catalog.Lang = strObj(ua.lang);
                    catalog.ViewerPreferences = obj.dict({ DisplayDocTitle: obj.bool(true) });
                }
                if (structRootNum) {
                    catalog.MarkInfo = obj.dict({ Marked: obj.bool(true) });
                    catalog.StructTreeRoot = obj.ref(structRootNum, 0);
                }
                pushIndirect(catalogNum, obj.dict(catalog));

                // Pages tree node.
                pushIndirect(pagesNum, obj.dict({
                    Type:  obj.name('Pages'),
                    Kids:  obj.array(kidsRefs),
                    Count: obj.int(pageRecords.length)
                }));

                // Info dict (optional; none under PDF/A-4, whose XMP holds it).
                let infoRef = null;
                const infoDict = profile && !profile.info ? null : buildInfoDict();
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
                else if (claim) writeOpts.deriveId = true;

                return writeDocument(writeOpts);
            }

            const api = {
                addPage, addContent, addFont, addImage, addMetadata,
                openElement, markContent, closeElement,
                setVersion, setId, build
            };
            return api;
        }

        return { builder: createBuilder };
    }
};
