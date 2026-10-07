// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `odfShared` — canonical source of ODF constants and
 * stateless helpers that were previously duplicated across most odf
 * factories.
 *
 * Exposes :
 * - **Namespaces** : `ODF_NS.OFFICE`, `.TEXT`, `.STYLE`, `.TABLE`, `.DRAW`,
 *   `.FO`, `.SVG`, `.NUMBER`, `.OF`, `.PRESENTATION`, `.META`, `.CONFIG`,
 *   `.MANIFEST`, `.DC`, `.XLINK`, `.CHART`, `.MATH`, `.FORM`, `.SCRIPT`,
 *   `.DR3D`, `.ANIM`, `.SMIL`, `.DB`, `.XHTML`.
 * - **Namespace declarations** : `ODF_PREFIXES` (frozen prefix → URI: every
 *   `ODF_NS` entry under its lower-case prefix plus the LibreOffice
 *   extension prefixes), `sourceNamespaces(sourcePkg, partPath)` (the
 *   `xmlns:*` declarations on a source part's root) and
 *   `declareNamespaces(rootEl, opts?)` (declares on a written root every
 *   prefix its subtree uses — root, then carried, then known; a prefix
 *   nobody declares throws `RenderError('odf/render-error/namespace')`).
 * - **Version** : `ODF_VERSION = '1.4'`.
 * - **XML declaration** : `XML_DECL`, `XML_DECL_STANDALONE`.
 * - **Content types** : `CT.ODT`, `.ODS`, `.ODP`, `.XML`, `.FORMULA`.
 * - **Text codec** : `encodeText`, `decodeText` (singletons backed by
 *   the platform `TextEncoder`/`TextDecoder`).
 * - **Parse helper** : `parseXmlOrThrow(src, part, context?)` — wraps
 *   `xml.parse` with a `ParseError('odf/parse-error/<part>', …)` mapping.
 * - **Sidecar helpers** : `readSidecars(target, pkgModel, sideMods)` and
 *   `writeSidecars(p, doc, opts, sideMods, ctXml)` — meta/settings/styles
 *   read/write loop shared by the three orchestrators. Each sidecar falls
 *   back `opts.* → doc.* → empty()`; `meta:generator` is set to
 *   `metaMod.empty().generator` on every write (a read model's generator
 *   names the previous application and is replaced) unless the caller's
 *   explicit `opts.meta.generator` is given. Each sidecar receives the
 *   source part's namespace declarations (`{ namespaces }`).
 * - **Carry helper** : `carryParts(p, source, mods)` + `REGENERATED_PARTS` —
 *   re-emits the parts of a read package model (`doc.package`) the writer
 *   did not regenerate, byte-for-byte with their source media type, plus
 *   the source manifest's directory entries. A regenerated part wins, then
 *   a part already on `p` (writer-supplied), then the carried copy. To drop
 *   carried material, delete it from `doc.package.parts` or delete
 *   `doc.package`.
 * - **XML helpers** : `findDeep(node, name)` — DFS for a typed element
 *   node by qualified name.
 * - **Attr helpers** : `intAttr(el, name)`, `boundedIntAttr(el, name,
 *   opts, errorMod)`.
 *
 * **Worker-safe** : every export is either a string literal, a constant
 * number, a frozen object or a pure function ; no mutable state beyond
 * the two singletons `_te` / `_td`.
 *
 * @module odf/_shared
 */

import { odfErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfShared = {
    name: 'odfShared',
    dependencies: ['odfErrors', 'xml'],
    deps: [odfErrors, xml],

    factory(errors, xml) {
        const { ParseError, RenderError } = errors;

        // --- Namespaces ----------------------------------------------
        const ODF_NS = Object.freeze({
            OFFICE:       'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
            TEXT:         'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
            STYLE:        'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
            TABLE:        'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
            DRAW:         'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
            FO:           'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
            SVG:          'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
            NUMBER:       'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
            OF:           'urn:oasis:names:tc:opendocument:xmlns:of:1.2',
            PRESENTATION: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
            META:         'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
            CONFIG:       'urn:oasis:names:tc:opendocument:xmlns:config:1.0',
            MANIFEST:     'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
            DC:           'http://purl.org/dc/elements/1.1/',
            XLINK:        'http://www.w3.org/1999/xlink',
            CHART:        'urn:oasis:names:tc:opendocument:xmlns:chart:1.0',
            MATH:         'http://www.w3.org/1998/Math/MathML',
            FORM:         'urn:oasis:names:tc:opendocument:xmlns:form:1.0',
            SCRIPT:       'urn:oasis:names:tc:opendocument:xmlns:script:1.0',
            DR3D:         'urn:oasis:names:tc:opendocument:xmlns:dr3d:1.0',
            ANIM:         'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
            SMIL:         'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0',
            DB:           'urn:oasis:names:tc:opendocument:xmlns:database:1.0',
            XHTML:        'http://www.w3.org/1999/xhtml'
        });

        /**
         * Prefix → namespace URI for every prefix a writer may resolve on
         * its own: each `ODF_NS` entry under its lower-case prefix, plus
         * the extension prefixes LibreOffice declares on its roots.
         */
        const ODF_PREFIXES = (() => {
            const t = {};
            for (const k of Object.keys(ODF_NS)) t[k.toLowerCase()] = ODF_NS[k];
            t.ooo = 'http://openoffice.org/2004/office';
            t.ooow = 'http://openoffice.org/2004/writer';
            t.oooc = 'http://openoffice.org/2004/calc';
            t.rpt = 'http://openoffice.org/2005/report';
            t.dom = 'http://www.w3.org/2001/xml-events';
            t.xforms = 'http://www.w3.org/2002/xforms';
            t.xsd = 'http://www.w3.org/2001/XMLSchema';
            t.xsi = 'http://www.w3.org/2001/XMLSchema-instance';
            t.formx = 'urn:openoffice:names:experimental:ooxml-odf-interop:xmlns:form:1.0';
            t.grddl = 'http://www.w3.org/2003/g/data-view#';
            t.css3t = 'http://www.w3.org/TR/css3-text/';
            t.loext = 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0';
            return Object.freeze(t);
        })();

        const ODF_VERSION = '1.4';

        const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
        const XML_DECL_STANDALONE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

        const CT = Object.freeze({
            ODT:     'application/vnd.oasis.opendocument.text',
            ODS:     'application/vnd.oasis.opendocument.spreadsheet',
            ODP:     'application/vnd.oasis.opendocument.presentation',
            XML:     'text/xml',
            FORMULA: 'application/vnd.oasis.opendocument.formula'
        });

        // --- Text codec singletons -----------------------------------
        const _te = new TextEncoder();
        const _td = new TextDecoder();
        function encodeText(s) { return _te.encode(s); }
        function decodeText(b) { return _td.decode(b); }

        // --- XML parse helper ----------------------------------------
        function parseXmlOrThrow(src, part, context) {
            try { return xml.parse(src); }
            catch (e) {
                const opts = { cause: e };
                if (context) opts.context = context;
                throw new ParseError(`odf/parse-error/${part}`, `${part}: ${e.message}`, opts);
            }
        }

        // --- Namespace declarations ----------------------------------
        const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

        /**
         * Inner text of the first element start tag of `s` (between `<` and
         * `>`, without a trailing `/`), skipping the prolog, comments and
         * declarations. `null` when `s` holds no complete start tag.
         */
        function firstStartTag(s) {
            let i = s.charCodeAt(0) === 0xFEFF ? 1 : 0;
            for (;;) {
                i = s.indexOf('<', i);
                if (i < 0) return null;
                let close = null;
                if (s.startsWith('<?', i)) close = '?>';
                else if (s.startsWith('<!--', i)) close = '-->';
                else if (s.startsWith('<!', i)) close = '>';
                if (close) {
                    const e = s.indexOf(close, i + 2);
                    if (e < 0) return null;
                    i = e + close.length;
                    continue;
                }
                let q = '';
                for (let j = i + 1; j < s.length; j++) {
                    const c = s[j];
                    if (q) { if (c === q) q = ''; }
                    else if (c === '"' || c === "'") q = c;
                    else if (c === '>') return s.slice(i + 1, s[j - 1] === '/' ? j - 1 : j);
                }
                return null;
            }
        }

        /**
         * The `xmlns:<prefix>` declarations on the ROOT element of
         * `sourcePkg.parts[partPath]`, as a frozen `{ prefix: uri }`. Only
         * the root start tag is decoded and parsed (the bytes are decoded in
         * growing slices until the tag is complete). The default namespace
         * is ignored. A missing package, part or tag, or an unparsable tag,
         * yields `{}`; never throws.
         *
         * @param {object} [sourcePkg] — a read package model `{ parts }`
         * @param {string} partPath
         * @returns {Readonly<Object<string, string>>}
         */
        function sourceNamespaces(sourcePkg, partPath) {
            try {
                const out = {};
                const src = sourcePkg && sourcePkg.parts && sourcePkg.parts[partPath];
                let tag = null;
                if (typeof src === 'string') tag = firstStartTag(src);
                else if (src instanceof Uint8Array) {
                    for (let len = 4096; ; len *= 2) {
                        const whole = len >= src.length;
                        tag = firstStartTag(_td.decode(whole ? src : src.subarray(0, len)));
                        if (tag !== null || whole) break;
                    }
                }
                if (tag) {
                    const el = xml.parse('<' + tag + '/>');
                    for (const k of Object.keys(el.attrs)) {
                        if (k.startsWith('xmlns:') && k.length > 6) out[k.slice(6)] = el.attrs[k];
                    }
                }
                return Object.freeze(out);
            } catch {
                return Object.freeze({});
            }
        }

        /** Attributes whose VALUE may start with a namespace prefix. */
        const FORMULA_ATTRS = new Set(['table:formula', 'text:formula', 'text:condition']);

        /**
         * Declare on `rootEl` every namespace prefix used by an element or
         * attribute name in its subtree and not yet in scope. `xml` is
         * implicit; `xmlns` attributes are declarations, not uses; a
         * declaration on a descendant covers that descendant's subtree only.
         * A formula attribute (`table:formula`, `text:formula`,
         * `text:condition`) whose value starts with a resolvable prefix
         * declares that prefix too; an unresolvable value prefix is left
         * alone.
         *
         * Resolution order: the root's own declarations, then
         * `opts.carried`, then `ODF_PREFIXES`. The missing declarations are
         * inserted, sorted by prefix, right after the root's last `xmlns:*`
         * attribute (first when it has none); every existing attribute keeps
         * its order, so a root with nothing missing serializes unchanged.
         * `rootEl.attrs` is replaced by a new object and `rootEl` returned.
         *
         * @param {object} rootEl — element node
         * @param {object} [opts] — `{ carried?, part?, module? }`
         * @returns {object} `rootEl`
         * @throws {RenderError} `odf/render-error/namespace` when a used
         *   prefix resolves nowhere
         */
        function declareNamespaces(rootEl, opts) {
            const o = opts || {};
            const carried = o.carried || {};
            const resolvable = p => hasOwn(carried, p) || hasOwn(ODF_PREFIXES, p);
            const missing = new Set();
            const scope = [];
            const inScope = (p) => {
                if (p === 'xml') return true;
                for (let i = scope.length - 1; i >= 0; i--) if (scope[i].has(p)) return true;
                return false;
            };
            const use = (name) => {
                const i = typeof name === 'string' ? name.indexOf(':') : -1;
                if (i > 0 && !inScope(name.slice(0, i))) missing.add(name.slice(0, i));
            };
            const walk = (node) => {
                if (!node || node.type !== 'element') return;
                const attrs = node.attrs || {};
                const local = new Set();
                for (const k of Object.keys(attrs)) if (k.startsWith('xmlns:')) local.add(k.slice(6));
                scope.push(local);
                use(node.name);
                for (const k of Object.keys(attrs)) {
                    if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
                    use(k);
                    if (FORMULA_ATTRS.has(k) && typeof attrs[k] === 'string') {
                        const m = /^([A-Za-z_][\w.-]*):/.exec(attrs[k]);
                        if (m && !inScope(m[1]) && resolvable(m[1])) missing.add(m[1]);
                    }
                }
                for (const c of node.children || []) walk(c);
                scope.pop();
            };
            walk(rootEl);

            const names = [...missing].sort();
            const uris = {};
            for (const p of names) {
                if (hasOwn(carried, p)) uris[p] = carried[p];
                else if (hasOwn(ODF_PREFIXES, p)) uris[p] = ODF_PREFIXES[p];
                else {
                    throw new RenderError('odf/render-error/namespace',
                        `odf: namespace prefix "${p}" is used but not declared`,
                        { context: { module: o.module, part: o.part, prefix: p } });
                }
            }
            const attrs = rootEl.attrs || {};
            const keys = Object.keys(attrs);
            let at = -1;
            keys.forEach((k, i) => { if (k.startsWith('xmlns:')) at = i; });
            const out = {};
            const insert = () => { for (const p of names) out['xmlns:' + p] = uris[p]; };
            if (at < 0) insert();
            keys.forEach((k, i) => {
                out[k] = attrs[k];
                if (i === at) insert();
            });
            rootEl.attrs = out;
            return rootEl;
        }

        // --- Sidecar helpers -----------------------------------------
        /**
         * Read `meta.xml` / `settings.xml` / `styles.xml` from a package
         * model into `target`. `sideMods = { metaMod, settingsMod,
         * stylesMod }`. Bytes are decoded with the shared `_td`.
         */
        function readSidecars(target, pkgModel, sideMods) {
            const parts = pkgModel.parts || {};
            const m = parts['meta.xml'];
            if (m) target.meta = sideMods.metaMod.parse(_td.decode(m));
            const s = parts['settings.xml'];
            if (s) target.settings = sideMods.settingsMod.parse(_td.decode(s));
            const st = parts['styles.xml'];
            if (st) target.styles = sideMods.stylesMod.parse(_td.decode(st));
            return target;
        }

        /**
         * Write `meta.xml` / `settings.xml` / `styles.xml` into the
         * package `p`. `sideMods = { pkg, metaMod, settingsMod,
         * stylesMod }`. Bytes are encoded with the shared `_te`.
         *
         * Each sidecar falls back `opts.* → doc.* → empty()`. The
         * `meta:generator` is set to `metaMod.empty().generator`: a
         * `doc.meta` (the READ model) has its generator replaced, an
         * `opts.meta` without one gets it filled, and only an explicit
         * `opts.meta.generator` is kept. The caller's meta object is never
         * mutated.
         */
        function writeSidecars(p, doc, opts, sideMods, ctXml) {
            const { pkg: pkgM, metaMod, settingsMod, stylesMod } = sideMods;
            const ct = ctXml || CT.XML;
            const ours = metaMod.empty().generator;
            // The source part's own declarations travel with its markup.
            const ns = part => ({ namespaces: sourceNamespaces(doc.package, part) });
            // opts.meta is the caller's explicit choice; doc.meta is the READ model,
            // whose generator names the previous application — this write replaces it.
            let meta = opts.meta
                ? (opts.meta.generator == null ? { ...opts.meta, generator: ours } : opts.meta)
                : { ...(doc.meta || metaMod.empty()), generator: ours };
            pkgM.setPart(p, 'meta.xml', _te.encode(metaMod.serialize(meta, ns('meta.xml'))), ct);
            const settings = opts.settings || doc.settings || settingsMod.empty();
            pkgM.setPart(p, 'settings.xml', _te.encode(settingsMod.serialize(settings, ns('settings.xml'))), ct);
            const styles = opts.styles || doc.styles || stylesMod.empty();
            pkgM.setPart(p, 'styles.xml', _te.encode(stylesMod.serialize(styles, ns('styles.xml'))), ct);
        }

        // --- Carry helper --------------------------------------------
        /** Parts every orchestrator regenerates — never carried. */
        const REGENERATED_PARTS = Object.freeze(['content.xml', 'meta.xml', 'settings.xml', 'styles.xml']);

        /**
         * Re-emit into `p` the parts of a READ package model (`source =
         * doc.package`) that the writer did not regenerate, byte-for-byte, with the
         * media type the source manifest declared (fallback
         * `application/octet-stream`), then re-declare the source manifest's
         * directory entries (`fullPath` ending in `/`, e.g. an embedded object's
         * sub-package). Precedence: a regenerated part always wins; a part already
         * present on `p` (writer-supplied, e.g. `doc.pictures`) wins over the carried
         * copy; everything else is carried. `source` missing or without `parts` →
         * no-op. `mods = { pkg, manifestMod }`.
         *
         * @param {object} p — the package being written
         * @param {object} [source] — a read package model `{ manifest, parts }`
         * @param {object} mods — `{ pkg, manifestMod }`
         * @returns {object} `p`
         */
        function carryParts(p, source, mods) {
            if (!source || !source.parts || typeof source.parts !== 'object') return p;
            const { pkg: pkgM, manifestMod } = mods;
            const entries = (source.manifest && source.manifest.entries) || [];
            const mediaTypes = {};
            for (const e of entries) if (e && e.fullPath) mediaTypes[e.fullPath] = e.mediaType;
            const skip = new Set([...REGENERATED_PARTS, pkgM.MIMETYPE_PATH, pkgM.MANIFEST_PATH]);
            for (const path of Object.keys(source.parts)) {
                if (skip.has(path)) continue;
                if (Object.prototype.hasOwnProperty.call(p.parts, path)) continue;
                pkgM.setPart(p, path, source.parts[path], mediaTypes[path] || 'application/octet-stream');
            }
            for (const e of entries) {
                if (!e || !e.fullPath || e.fullPath === '/' || !e.fullPath.endsWith('/')) continue;
                manifestMod.setEntry(p.manifest, e.fullPath, e.mediaType || '');
            }
            return p;
        }

        // --- XML DFS helper ------------------------------------------
        /**
         * Depth-first search for a typed element node by qualified
         * name. Returns `null` if not found.
         */
        function findDeep(node, name) {
            if (!node || node.type !== 'element') return null;
            if (node.name === name) return node;
            for (const c of node.children || []) {
                const f = findDeep(c, name);
                if (f) return f;
            }
            return null;
        }

        // --- Attribute helpers ---------------------------------------
        /**
         * Read an attribute as an integer. Returns `undefined` if the
         * attribute is missing or non-numeric.
         */
        function intAttr(el, name) {
            const v = el && el.attrs && el.attrs[name];
            if (v == null) return undefined;
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : undefined;
        }

        /**
         * Read an attribute as an integer with optional bounds check.
         *
         * Options :
         * - `max` — if set and the parsed value exceeds it, throws
         *   `ParseError('odf/parse-error/limit', …)`.
         * - `minStrict` — only return values strictly greater than
         *   this (default `1`, so values `<= 1` return `undefined`).
         * - `module` — included in the thrown error context.
         * - `label` — included in the error message (e.g.
         *   `'number-columns-repeated'`).
         */
        function boundedIntAttr(el, name, opts) {
            const v = intAttr(el, name);
            const min = opts && Number.isFinite(opts.minStrict) ? opts.minStrict : 1;
            if (!Number.isFinite(v) || v <= min) return undefined;
            const max = opts && Number.isFinite(opts.max) ? opts.max : null;
            if (max != null && v > max) {
                const label = (opts && opts.label) || name;
                throw new ParseError('odf/parse-error/limit',
                    `${(opts && opts.module) || 'odf'}: ${label} ${v} exceeds max ${max}`,
                    { context: { module: (opts && opts.module) || 'odf', value: v, max } });
            }
            return v;
        }

        return {
            ODF_NS, ODF_PREFIXES, ODF_VERSION, XML_DECL, XML_DECL_STANDALONE, CT,
            encodeText, decodeText,
            parseXmlOrThrow,
            sourceNamespaces, declareNamespaces,
            readSidecars, writeSidecars,
            carryParts, REGENERATED_PARTS,
            findDeep,
            intAttr, boundedIntAttr
        };
    }
};
