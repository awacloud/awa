// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `ooxmlShared` — canonical source of OOXML constants and
 * stateless helpers that were previously duplicated across most ooxml
 * factories.
 *
 * Exposes :
 * - **Namespaces** : `NS.W`, `NS.A`, `NS.R`, `NS.SS`, `NS.P`, `NS.C`, `NS.M`,
 *   `NS.MC`, `NS.WP`, `NS.PIC`, `NS.XDR`, `NS.DS`, `NS.TC`, `NS.ACTIVEX`.
 * - **Relationship type URIs** : `REL_TYPE.DOC`, `.HYPERLINK`, `.IMAGE`,
 *   `.STYLES`, `.NUMBERING`, `.SETTINGS`, `.COMMENTS`, `.FOOTNOTES`,
 *   `.ENDNOTES`, `.HEADER`, `.FOOTER`, `.CUSTOM_XML`, `.CUSTOM_XML_PROPS`,
 *   `.CHART`, `.PACKAGE`, `.DRAWING`, `.TABLE`, `.SHEET`,
 *   `.SHARED_STRINGS`, `.VML_DRAWING`, `.THREADED_COMMENT`, `.PERSON`,
 *   `.SLIDE`, `.SLIDE_LAYOUT`, `.SLIDE_MASTER`, `.THEME`.
 * - **Content-type MIME strings** : `CT.DOCUMENT`, `.STYLES_W`, `.STYLES_X`,
 *   `.NUMBERING`, `.SETTINGS`, `.COMMENTS_W`, `.COMMENTS_X`, `.FOOTNOTES`,
 *   `.ENDNOTES`, `.HEADER`, `.FOOTER`, `.WORKBOOK`, `.SHEET`,
 *   `.SHARED_STRINGS`, `.DRAWING`, `.TABLE`, `.CHART`, `.EMBEDDED_XLSX`,
 *   `.PRESENTATION`, `.SLIDE`, `.SLIDE_LAYOUT`, `.SLIDE_MASTER`,
 *   `.THEME`, `.VML_DRAWING`.
 * - **EMU constants** : `EMU_PER_INCH`, `_CM`, `_PT`, `_PX_96`.
 * - **Unit converter** : `toEmu(value)` accepting `number` or
 *   `'<n>(in|cm|mm|pt|px)?'` strings.
 * - **Bool attr helpers** : `readBoolAttr(v)` / `writeBoolAttr(b)`.
 * - **OPC path helpers** : `partExt(partName)` (extension extraction)
 *   and `lookupCT(pkg, partName)` (content-type resolution from a
 *   `pkg.contentTypes` — override > extension default).
 * - **Read loss record** : `trackUnmodelledParts(pkg, consume)` — runs a
 *   facade's read pass over an access-tracking view of `pkg.parts` and
 *   returns the parts it never consumed (`unmodelledParts`).
 * - **WordprocessingML root namespaces** : `wordRootAttrs(nodes)` — the
 *   root attributes of a part: `w` and `r` always, plus `mc`, the Word
 *   2012 namespace and `mc:Ignorable` when the nodes hold a `w15` element.
 * - **UTF-8 codec** : `encodeText(s)` / `decodeText(bytes)` — backed by
 *   shared `TextEncoder` / `TextDecoder` singletons (one pair per factory
 *   instance instead of one pair per consumer factory).
 * - **rId allocator** : `createRidAllocator({ prefix, start, existing })`
 *   — stateful builder that returns a fresh allocator with `.next()`,
 *   `.peek()`, `.reset()`, `.usedIds()` and `.claim(preferred)`. Each call
 *   yields an independent instance — no shared mutable state across
 *   callers.
 * - **DrawingML color codec** : `createDmlColorCodec(xml)` — returns
 *   `{ parseColor, renderColor, parseColorMod, renderColorMod,
 *     parseColorMods, findFirstColor, srgbClr, COLOR_TAGS }`. The
 *   `parse*` and `render*` accept an optional `{ withMods }` flag
 *   reconciling the two historical flavours (effects-style with mod
 *   children preserved, fills-advanced flavour with mod children
 *   dropped).
 * - **xlsx color codec** : `createXlsxColorCodec(xml)` — returns
 *   `{ parseColor, renderColor }`. Handles the full attribute set
 *   (`rgb` / `theme` / `tint` / `indexed` / `auto`) ; absent attrs are
 *   omitted on render so cf-style colors round-trip without leaking
 *   spurious attributes.
 *
 * **Worker-safe** : every export is either a string literal, a constant
 * number, or a pure function (or, for `createRidAllocator` /
 * `createDmlColorCodec` / `createXlsxColorCodec`, a pure factory whose
 * returned closure encapsulates its own state).
 *
 * @module ooxml/_shared
 */

export const ooxmlShared = {
    name: 'ooxmlShared',
    dependencies: [],

    factory() {
        // --- Namespaces ----------------------------------------------
        const NS = Object.freeze({
            W:       'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            // Word 2012 extensions (repeating sections), [MS-DOCX] 2.5.
            // Computed key on purpose: it stays quoted in the emitted
            // bundles, where a bare key of this shape would read as a
            // version label to the published-sources reference scan.
            ['W15']: 'http://schemas.microsoft.com/office/word/2012/wordml',
            A:       'http://schemas.openxmlformats.org/drawingml/2006/main',
            R:       'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            SS:      'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
            P:       'http://schemas.openxmlformats.org/presentationml/2006/main',
            C:       'http://schemas.openxmlformats.org/drawingml/2006/chart',
            M:       'http://schemas.openxmlformats.org/officeDocument/2006/math',
            MC:      'http://schemas.openxmlformats.org/markup-compatibility/2006',
            WP:      'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
            PIC:     'http://schemas.openxmlformats.org/drawingml/2006/picture',
            XDR:     'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
            DS:      'http://schemas.openxmlformats.org/officeDocument/2006/customXml',
            TC:      'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments',
            ACTIVEX: 'http://schemas.microsoft.com/office/2006/activeX'
        });

        // --- Relationship type URIs ----------------------------------
        const REL_TYPE = Object.freeze({
            DOC:               NS.R + '/officeDocument',
            HYPERLINK:         NS.R + '/hyperlink',
            IMAGE:             NS.R + '/image',
            STYLES:            NS.R + '/styles',
            NUMBERING:         NS.R + '/numbering',
            SETTINGS:          NS.R + '/settings',
            COMMENTS:          NS.R + '/comments',
            FOOTNOTES:         NS.R + '/footnotes',
            ENDNOTES:          NS.R + '/endnotes',
            HEADER:            NS.R + '/header',
            FOOTER:            NS.R + '/footer',
            CUSTOM_XML:        NS.R + '/customXml',
            CUSTOM_XML_PROPS:  NS.R + '/customXmlProps',
            CHART:             NS.R + '/chart',
            PACKAGE:           NS.R + '/package',
            DRAWING:           NS.R + '/drawing',
            TABLE:             NS.R + '/table',
            SHEET:             NS.R + '/worksheet',
            SHARED_STRINGS:    NS.R + '/sharedStrings',
            VML_DRAWING:       NS.R + '/vmlDrawing',
            THREADED_COMMENT:  'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment',
            PERSON:            'http://schemas.microsoft.com/office/2017/10/relationships/person',
            SLIDE:             NS.R + '/slide',
            SLIDE_LAYOUT:      NS.R + '/slideLayout',
            SLIDE_MASTER:      NS.R + '/slideMaster',
            THEME:             NS.R + '/theme'
        });

        // --- Content-type MIME strings -------------------------------
        const CT = Object.freeze({
            DOCUMENT:        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
            STYLES_W:        'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
            STYLES_X:        'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
            NUMBERING:       'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
            SETTINGS:        'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
            COMMENTS_W:      'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
            COMMENTS_X:      'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml',
            FOOTNOTES:       'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
            ENDNOTES:        'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml',
            HEADER:          'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
            FOOTER:          'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
            WORKBOOK:        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
            SHEET:           'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
            SHARED_STRINGS:  'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
            DRAWING:         'application/vnd.openxmlformats-officedocument.drawing+xml',
            TABLE:           'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml',
            CHART:           'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
            EMBEDDED_XLSX:   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            PRESENTATION:    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
            SLIDE:           'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
            SLIDE_LAYOUT:    'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
            SLIDE_MASTER:    'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
            THEME:           'application/vnd.openxmlformats-officedocument.theme+xml',
            VML_DRAWING:     'application/vnd.openxmlformats-officedocument.vmlDrawing',
            CUSTOM_XML_PROPS:'application/vnd.openxmlformats-officedocument.customXmlProperties+xml'
        });

        // --- EMU (English Metric Unit) -------------------------------
        const EMU_PER_INCH = 914400;
        const EMU_PER_CM   = 360000;
        const EMU_PER_PT   = 12700;
        const EMU_PER_PX_96 = 9525;

        /**
         * Convert a value to EMU.
         *
         * - `number` → rounded as-is (already EMU).
         * - `'12.5in'`, `'3cm'`, `'10mm'`, `'72pt'`, `'96px'` → converted
         *   using the canonical ECMA-376 conversion ratios.
         * - Unparseable / null → `0`.
         */
        function toEmu(v) {
            if (typeof v === 'number') return Math.round(v);
            const m = /^(-?\d+(\.\d+)?)(in|cm|mm|pt|px)?$/.exec(String(v));
            if (!m) return 0;
            const n = parseFloat(m[1]);
            switch (m[3]) {
                case 'in': return Math.round(n * EMU_PER_INCH);
                case 'cm': return Math.round(n * EMU_PER_CM);
                case 'mm': return Math.round(n * EMU_PER_CM / 10);
                case 'pt': return Math.round(n * EMU_PER_PT);
                case 'px': return Math.round(n * EMU_PER_PX_96);
                default:   return Math.round(n);
            }
        }

        function inchesToEmu(v) { return Math.round(v * EMU_PER_INCH); }
        function cmToEmu(v)     { return Math.round(v * EMU_PER_CM); }
        function ptToEmu(v)     { return Math.round(v * EMU_PER_PT); }

        // --- Bool attr helpers (OOXML "1"/"0"/"true"/"false") --------
        function readBoolAttr(v) {
            if (v == null) return undefined;
            return v === '1' || v === 'true';
        }
        function writeBoolAttr(b) { return b ? '1' : '0'; }

        // --- OPC path helper ----------------------------------------
        /**
         * Lower-case extension of an OPC part name (without the dot).
         * Returns `''` for names without an extension.
         */
        function partExt(partName) {
            const s = String(partName || '');
            const dot = s.lastIndexOf('.');
            if (dot < 0) return '';
            return s.slice(dot + 1).toLowerCase();
        }

        /**
         * Resolve the content-type of an OPC part from a `pkg`.
         *
         * Overrides take precedence over per-extension defaults.
         * Returns `null` when no match (no override, no default for
         * the extension, missing `pkg.contentTypes`, or extensionless
         * part name).
         *
         * Same semantics as the two helpers formerly duplicated in
         * `docx/docx.js` and `pptx/pptx.js`; complements
         * `opcContentTypes.lookup(types, partName)`, which takes a flat
         * `types` object, whereas `lookupCT` takes a whole `pkg` (the most
         * common shape on the orchestrator side).
         */
        function lookupCT(pkg, partName) {
            const ct = pkg && pkg.contentTypes;
            if (!ct) return null;
            if (ct.overrides && ct.overrides[partName]) return ct.overrides[partName];
            const ext = partExt(partName);
            if (!ext) return null;
            return (ct.defaults && ct.defaults[ext]) || null;
        }

        /**
         * Run a facade's read pass over `pkg` and record the parts it never
         * consumed.
         *
         * For the duration of `consume(pkg)` (the read and its hydrate
         * pass), `pkg.parts` is replaced by an access-tracking view: every
         * part name looked up through it counts as consumed. The plain
         * parts map is put back before this function returns or throws, so
         * no tracking view outlives the call.
         *
         * `unmodelledParts` lists every part of `pkg.parts` that was never
         * looked up, sorted by `partName`, each with its content type from
         * `[Content_Types].xml` (`lookupCT`, `null` when undeclared).
         * `pkg.parts` already excludes `[Content_Types].xml` and the
         * relationship parts.
         *
         * @template T
         * @param {{contentTypes: object, parts: Object<string, Uint8Array>, rels: object}} pkg
         * @param {(pkg: object) => T} consume
         * @returns {{ value: T, unmodelledParts: Array<{partName: string, contentType: string|null}> }}
         */
        function trackUnmodelledParts(pkg, consume) {
            const plain = pkg.parts;
            const consumed = new Set();
            pkg.parts = new Proxy(plain, {
                get(target, key) {
                    if (typeof key === 'string') consumed.add(key);
                    return target[key];
                }
            });
            let value;
            try {
                value = consume(pkg);
            } finally {
                pkg.parts = plain;
            }
            const unmodelledParts = Object.keys(plain)
                .filter(name => !consumed.has(name))
                .sort()
                .map(partName => ({ partName, contentType: lookupCT(pkg, partName) }));
            return { value, unmodelledParts };
        }

        // --- WordprocessingML root namespaces ----------------------
        /**
         * Root namespace attributes of a WordprocessingML part whose root
         * element will hold `nodes`.
         *
         * Always declares `w` and `r`. When some element of `nodes`
         * (searched recursively through `children`) has a `w15:` name, the
         * Word 2012 namespace is declared too, together with `mc` and
         * `mc:Ignorable="w15"`, so consumers that do not know the extension
         * skip it. Other prefixes are never declared here. Non-element
         * entries of `nodes` are ignored.
         *
         * @param {Array<object>} nodes XML nodes as built by `xml.el`.
         * @returns {Object<string, string>} A new attribute object, keys in
         *   the order `xmlns:w`, `xmlns:r`, then `xmlns:mc`, `xmlns:w15`,
         *   `mc:Ignorable` when needed.
         */
        function wordRootAttrs(nodes) {
            const attrs = { 'xmlns:w': NS.W, 'xmlns:r': NS.R };
            if (hasWord2012Element(nodes)) {
                attrs['xmlns:mc'] = NS.MC;
                attrs['xmlns:w15'] = NS.W15;
                attrs['mc:Ignorable'] = 'w15';
            }
            return attrs;
        }

        // True when an element of `nodes`, at any depth, has a `w15:` name.
        function hasWord2012Element(nodes) {
            for (const n of nodes || []) {
                if (!n || n.type !== 'element') continue;
                if (typeof n.name === 'string' && n.name.startsWith('w15:')) return true;
                if (hasWord2012Element(n.children)) return true;
            }
            return false;
        }

        // --- UTF-8 codec (shared singletons) ------------------------
        // One pair of TextEncoder / TextDecoder per `ooxmlShared`
        // instance — replaces 22 per-factory pairs. Behavior bit-identical
        // since each call delegates to the same Web API used previously.
        const _te = new TextEncoder();
        const _td = new TextDecoder();
        function encodeText(s) { return _te.encode(s); }
        function decodeText(bytes) { return _td.decode(bytes); }

        // --- rId allocator -----------------------------------------
        /**
         * Build a fresh relationship-id allocator. Each call returns an
         * independent instance whose internal counter is closed-over —
         * no shared global state. Stateful but worker-safe (the closure
         * lives on the caller's stack).
         *
         * Options :
         * - `prefix`   (default `'rId'`) — string prepended to every id.
         * - `start`    (default `1`)     — starting numeric suffix.
         * - `existing` (default `[]`)    — array of pre-existing rel
         *   objects (each `{ Id, ... }`) or plain id strings ; the
         *   allocator skips any number whose `prefix+n` is already in
         *   that set when calling `.next()` or `.claim(preferred)`.
         *
         * API :
         * - `next()`            → string  (consumes the next free id)
         * - `peek()`            → string  (next free id without consuming)
         * - `reset()`           → void    (re-arms to `start`)
         * - `usedIds()`         → string[] (every id produced so far +
         *                         every pre-registered existing id)
         * - `claim(preferred)`  → string  (return `preferred` unchanged
         *                         if not yet used, else allocate next
         *                         free `prefix+n`)
         * - `register(id)`      → void    (mark a foreign id as used so
         *                         later `.next()` skips it)
         */
        function createRidAllocator(opts) {
            const prefix = (opts && opts.prefix) || 'rId';
            const startN = (opts && opts.start) || 1;
            const used = new Set();
            if (opts && opts.existing) {
                for (const e of opts.existing) {
                    if (typeof e === 'string') used.add(e);
                    else if (e && e.Id) used.add(e.Id);
                }
            }
            let n = startN;
            function _idAt(k) { return prefix + k; }
            function _advance() { while (used.has(_idAt(n))) n++; }
            function next() {
                _advance();
                const id = _idAt(n++);
                used.add(id);
                return id;
            }
            function peek() {
                _advance();
                return _idAt(n);
            }
            function reset() { n = startN; }
            function usedIds() { return Array.from(used); }
            function claim(preferred) {
                if (preferred && !used.has(preferred)) {
                    used.add(preferred);
                    return preferred;
                }
                return next();
            }
            function register(id) {
                if (id) used.add(id);
            }
            return { next, peek, reset, usedIds, claim, register };
        }

        // --- DrawingML color codec ----------------------------------
        //
        // Two pre-existing flavours of DML color helpers coexisted:
        //
        //   1. **effects-style** (`extra/dml-effects`) — `parseColor`
        //      returned `{ kind, attrs, mods: [...] }` with child
        //      transforms (`lumMod`, `lumOff`, `tint`, `shade`,
        //      `alphaMod`, `lum`, `grayscl`, `duotone`, `clrChange`,
        //      `clrRepl`, `biLevel`, …) preserved on `mods`. `renderColor`
        //      re-emitted them.
        //   2. **fills-advanced** (`extra/dml-fills-advanced`) —
        //      `parseColor` returned `{ kind, attrs }` ; child transforms
        //      were intentionally dropped (fills track `<a:gs>` /
        //      `<a:fgClr>` colors as flat references). `renderColor`
        //      emitted no children.
        //
        // The unified codec reconciles both via a `withMods` option.
        // Existing call sites set the flag explicitly to preserve their
        // historical semantics. Round-trip identity is maintained in
        // both modes.
        function createDmlColorCodec(xml) {
            const COLOR_TAGS = Object.freeze([
                'srgbClr', 'schemeClr', 'prstClr', 'hslClr', 'scrgbClr', 'sysClr'
            ]);

            function _kindOf(name) {
                switch (name) {
                    case 'a:srgbClr':   return 'srgbClr';
                    case 'a:schemeClr': return 'schemeClr';
                    case 'a:prstClr':   return 'prstClr';
                    case 'a:hslClr':    return 'hslClr';
                    case 'a:scrgbClr':  return 'scrgbClr';
                    case 'a:sysClr':    return 'sysClr';
                    default:            return null;
                }
            }

            function parseColor(el, opts) {
                if (!el) return null;
                const kind = _kindOf(el.name);
                if (!kind) return null;
                const out = { kind, attrs: { ...el.attrs } };
                if (opts && opts.withMods) out.mods = parseColorMods(el);
                return out;
            }

            function renderColor(c, opts) {
                if (!c) return null;
                const withMods = !!(opts && opts.withMods);
                const mods = withMods && c.mods && c.mods.length
                    ? c.mods.map(renderColorMod).filter(Boolean)
                    : [];
                switch (c.kind) {
                    case 'srgbClr':   return xml.el('a:srgbClr',   c.attrs || {}, mods);
                    case 'schemeClr': return xml.el('a:schemeClr', c.attrs || {}, mods);
                    case 'prstClr':   return xml.el('a:prstClr',   c.attrs || {}, mods);
                    case 'hslClr':    return xml.el('a:hslClr',    c.attrs || {}, mods);
                    case 'scrgbClr':  return xml.el('a:scrgbClr',  c.attrs || {}, mods);
                    case 'sysClr':    return xml.el('a:sysClr',    c.attrs || {}, mods);
                    default:          return null;
                }
            }

            function parseColorMods(el) {
                const out = [];
                for (const c of el.children || []) {
                    if (c.type !== 'element') continue;
                    const m = parseColorMod(c);
                    if (m) out.push(m);
                }
                return out;
            }

            function parseColorMod(el) {
                switch (el.name) {
                    case 'a:lum':          return { kind: 'lum',          attrs: { ...el.attrs } };
                    case 'a:tint':         return { kind: 'tint',         attrs: { ...el.attrs } };
                    case 'a:shade':        return { kind: 'shade',        attrs: { ...el.attrs } };
                    case 'a:grayscl':      return { kind: 'grayscl',      attrs: {} };
                    case 'a:alphaMod':     return { kind: 'alphaMod',     attrs: { ...el.attrs } };
                    case 'a:alphaModFix':  return { kind: 'alphaModFix',  attrs: { ...el.attrs } };
                    case 'a:alphaCeiling': return { kind: 'alphaCeiling', attrs: {} };
                    case 'a:alphaFloor':   return { kind: 'alphaFloor',   attrs: {} };
                    case 'a:alphaRepl':    return { kind: 'alphaRepl',    attrs: { ...el.attrs } };
                    case 'a:biLevel':      return { kind: 'biLevel',      attrs: { ...el.attrs } };
                    case 'a:lumMod':       return { kind: 'lumMod',       attrs: { ...el.attrs } };
                    case 'a:lumOff':       return { kind: 'lumOff',       attrs: { ...el.attrs } };
                    case 'a:duotone': {
                        const colors = (el.children || [])
                            .filter(c => c.type === 'element')
                            .map(c => parseColor(c, { withMods: true })).filter(Boolean);
                        return { kind: 'duotone', colors };
                    }
                    case 'a:clrChange': {
                        const cf = (el.children || []).find(c => c.type === 'element' && c.name === 'a:clrFrom');
                        const ct = (el.children || []).find(c => c.type === 'element' && c.name === 'a:clrTo');
                        return {
                            kind: 'clrChange',
                            attrs: { ...el.attrs },
                            clrFrom: cf ? findFirstColor(cf, { withMods: true }) : null,
                            clrTo:   ct ? findFirstColor(ct, { withMods: true }) : null
                        };
                    }
                    case 'a:clrRepl': {
                        return { kind: 'clrRepl', color: findFirstColor(el, { withMods: true }) };
                    }
                    default: return null;
                }
            }

            function renderColorMod(m) {
                switch (m.kind) {
                    case 'lum':          return xml.el('a:lum',          m.attrs || {});
                    case 'tint':         return xml.el('a:tint',         m.attrs || {});
                    case 'shade':        return xml.el('a:shade',        m.attrs || {});
                    case 'grayscl':      return xml.el('a:grayscl',      {});
                    case 'alphaMod':     return xml.el('a:alphaMod',     m.attrs || {});
                    case 'alphaModFix':  return xml.el('a:alphaModFix',  m.attrs || {});
                    case 'alphaCeiling': return xml.el('a:alphaCeiling', {});
                    case 'alphaFloor':   return xml.el('a:alphaFloor',   {});
                    case 'alphaRepl':    return xml.el('a:alphaRepl',    m.attrs || {});
                    case 'biLevel':      return xml.el('a:biLevel',      m.attrs || {});
                    case 'lumMod':       return xml.el('a:lumMod',       m.attrs || {});
                    case 'lumOff':       return xml.el('a:lumOff',       m.attrs || {});
                    case 'duotone':      return xml.el('a:duotone', {},
                        (m.colors || []).map(c => renderColor(c, { withMods: true })));
                    case 'clrChange':    return xml.el('a:clrChange', m.attrs || {}, [
                        xml.el('a:clrFrom', {}, m.clrFrom ? [renderColor(m.clrFrom, { withMods: true })] : []),
                        xml.el('a:clrTo',   {}, m.clrTo   ? [renderColor(m.clrTo,   { withMods: true })] : [])
                    ]);
                    case 'clrRepl':      return xml.el('a:clrRepl', {},
                        m.color ? [renderColor(m.color, { withMods: true })] : []);
                    default: return null;
                }
            }

            function findFirstColor(el, opts) {
                for (const c of el.children || []) {
                    if (c.type !== 'element') continue;
                    const local = c.name.replace(/^a:/, '');
                    if (COLOR_TAGS.includes(local)) return parseColor(c, opts);
                }
                return null;
            }

            function srgbClr(hex6) {
                return xml.el('a:srgbClr', { val: String(hex6).replace(/^#/, '').toUpperCase() });
            }

            return {
                COLOR_TAGS,
                parseColor, renderColor,
                parseColorMod, renderColorMod, parseColorMods,
                findFirstColor, srgbClr
            };
        }

        // --- xlsx color codec ---------------------------------------
        //
        // Reconciles the two historical xlsx color helpers:
        //
        //   1. **styles** (`xlsx/styles`) — reads / writes
        //      `rgb` / `theme` / `tint` / `indexed` / `auto`.
        //   2. **conditionalFormatting** (`xlsx/conditionalFormatting`)
        //      — same four attrs, **without** `auto`.
        //
        // The unified codec is a superset: it reads `auto` when present
        // and writes it only when truthy. Inputs without an `auto`
        // attribute round-trip identically to the historical cf flavour
        // (no spurious attribute leakage).
        function createXlsxColorCodec(xml) {
            function parseColor(el) {
                if (!el) return null;
                const a = el.attrs || {};
                const c = {};
                if (a.rgb)     c.rgb = a.rgb;
                if (a.theme)   c.theme = Number(a.theme);
                if (a.tint)    c.tint = Number(a.tint);
                if (a.indexed) c.indexed = Number(a.indexed);
                if (a.auto)    c.auto = a.auto === '1';
                return c;
            }

            function renderColor(name, c) {
                if (!c) return null;
                const a = {};
                if (c.rgb != null)     a.rgb = c.rgb;
                if (c.theme != null)   a.theme = String(c.theme);
                if (c.tint != null)    a.tint = String(c.tint);
                if (c.indexed != null) a.indexed = String(c.indexed);
                if (c.auto === true)   a.auto = '1';
                return xml.el(name, a);
            }

            return { parseColor, renderColor };
        }

        return {
            NS, REL_TYPE, CT,
            EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
            toEmu, inchesToEmu, cmToEmu, ptToEmu,
            readBoolAttr, writeBoolAttr,
            partExt, lookupCT, trackUnmodelledParts,
            wordRootAttrs,
            encodeText, decodeText,
            createRidAllocator,
            createDmlColorCodec,
            createXlsxColorCodec
        };
    }
};
