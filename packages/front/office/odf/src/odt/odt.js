// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview OpenDocument Text (.odt) reader/writer — orchestrator.
 *
 * Builds a minimal valid `.odt` from a typed document tree:
 *
 * - `mimetype` (STORED) — `application/vnd.oasis.opendocument.text`
 * - `META-INF/manifest.xml` — file-entries for all parts
 * - `content.xml` — `<office:document-content>` → `<office:body>` →
 *   `<office:text>` → mixed paragraphs / headings / lists / sections /
 *   soft-page-breaks (via `textContent`).
 * - `styles.xml`, `meta.xml`, `settings.xml` — minimal
 * - `Pictures/*` — the optional `doc.pictures` byte map (see `write`)
 *
 * **Images (typed write).** A paragraph `image` run is rendered as
 * `<draw:frame><draw:image/></draw:frame>` through the write ctx's
 * `renderImage` sink, composed here from `drawFrame` + `drawImage`. On read
 * the frame stays untyped in the paragraph's `_extras.children` — unless
 * `read(bytes, { framesInRuns: true })`: every paragraph-level frame is then
 * a `{ type: 'frame', ...drawFrame model }` run at its place in the text,
 * and `write` renders a frame run in place (`renderFrame` sink). A typed
 * note run (`{ type: 'note', … }`) is written as `text:note` through the
 * `renderNote` sink, its body rendered with the write's style registry.
 *
 * **Other inline elements.** A paragraph, heading or link child no run
 * kind covers (a comment and its end, a bookmark, a field, a change mark,
 * a soft page break …) stays in `_extras.children`, written back after the
 * runs — unless `read(bytes, { elementsInRuns: true })`: each is then a raw
 * `{ type: 'element', … }` run at its place, as a span body keeps it, and
 * `write` writes it there.
 *
 * Result of `read()` :
 *
 * ```js
 * {
 *   mimetype,
 *   body: [ <node>, ... ],   // typed nodes from `textContent.parseBody`
 *   meta, settings, styles, package,
 *   autoStyles?,             // leftover content.xml <office:automatic-styles>
 *   fontFaces?               // leftover content.xml <style:font-face> elements
 * }
 * ```
 *
 * **Style seam.** `content.xml`'s `<office:automatic-styles>` and
 * `<office:font-face-decls>` are no longer discarded. On read they feed a
 * `textStyleRegistry` resolver (together with `styles.xml`'s
 * `<office:styles>` bucket and its font faces); whatever the resolver
 * proved and consumed is dropped, the rest is surfaced verbatim as
 * `autoStyles` / `fontFaces` and written back untouched. `styles.xml`
 * material is NEVER consumed or stripped.
 *
 * **Read order.** Sidecars (`meta`/`settings`/`styles`) are parsed BEFORE
 * `content.xml`, because the content-side resolver needs the styles
 * sidecar. Sidecar parsing has no dependency on the body, so the model
 * they produce is unchanged by the reorder.
 *
 * **Round-trip.** `write(read(x))` carries what the model does not
 * regenerate: every part of `doc.package` other than `content.xml` and the
 * three sidecars is re-emitted byte-for-byte with the media type the source
 * manifest declared (`application/octet-stream` when it declared none),
 * and the source manifest's directory entries are re-declared. The
 * sidecars come from `opts.*`, else `doc.meta` / `doc.settings` /
 * `doc.styles`, else an empty model; `meta:generator` is rewritten to this
 * library unless `opts.meta.generator` is given. Precedence: a regenerated
 * part always wins, then a part the writer supplied (`doc.pictures`), then the carried
 * copy. Delete from `doc.package.parts` (or delete `doc.package`) to drop
 * carried material.
 *
 * @module odf/odt/odt
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { pkgPackage } from '../pkg/package.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { pkgMimetype } from '../pkg/mimetype.js';
import { pkgManifest } from '../pkg/manifest.js';
import { odfMeta } from '../meta/meta.js';
import { odfSettings } from '../settings/settings.js';
import { odfStyles } from '../style/styles.js';
import { textParagraph } from '../text/paragraph.js';
import { textContent } from '../text/content.js';
import { odtWalker } from './odt-walker.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { textStyleRegistry } from '../text/style-registry.js';
import { drawFrame } from '../draw/frame.js';
import { drawImage } from '../draw/image.js';

export const odt = {
    name: 'odt',
    dependencies: [
        'odfErrors', 'odfShared',
        'pkgPackage', 'xml', 'pkgMimetype', 'pkgManifest',
        'odfMeta', 'odfSettings', 'odfStyles',
        'textParagraph', 'textContent', 'odtWalker',
        'styleAutomatic', 'textStyleRegistry',
        'drawFrame', 'drawImage'
    ],
    deps: [odfErrors, odfShared, pkgPackage, xml, pkgMimetype, pkgManifest, odfMeta, odfSettings, odfStyles, textParagraph, textContent, odtWalker, styleAutomatic, textStyleRegistry, drawFrame, drawImage],

    factory(errors, shared, pkg, xml, mimetypeMod, manifestMod, metaMod, settingsMod, stylesMod, paraMod, contentMod, walkerMod, styleAutoMod, styleRegMod, frameMod, imageMod) {
        const { ParseError, ContractError } = errors;
        const { ODF_NS, ODF_VERSION, CT, encodeText,
                parseXmlOrThrow, readSidecars, writeSidecars, carryParts,
                sourceNamespaces, declareNamespaces, keptVersion, applyManifestVersion } = shared;
        // unused-dep guard (referenced for runtime registration only)
        void mimetypeMod;

        const CT_ODT = CT.ODT;
        const CT_XML = CT.XML;

        /** Part paths `doc.pictures` may never claim. */
        const RESERVED_PARTS = new Set(['content.xml', 'styles.xml', 'meta.xml', 'settings.xml']);

        const walker = walkerMod.createWalker();

        /**
         * Read a `.odt` byte stream into a typed document model.
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts] forwarded to pkgPackage.read — { maxParts?, maxUncompressed?, maxRatio? } —
         *   plus `framesInRuns` (default `false`, the 1.0.0 model): `true`
         *   types every `draw:frame` of a paragraph, heading, span or link
         *   body as a `{ type: 'frame', ...drawFrame model }` run at its place
         *   instead of leaving it in `_extras.children` (or, in a span, as a
         *   raw element entry); `elementsInRuns` (default `false`, the 1.1.0
         *   model): `true` keeps every other untyped element of a paragraph,
         *   heading or link body as a raw `{ type: 'element', … }` run at its
         *   place instead of an `_extras.children` entry (a frame too, when
         *   `framesInRuns` does not type it). Derived views (`toText`) are
         *   the same either way. `notes` (default `false`): `true` types
         *   every `text:note` of a paragraph, heading, span or link body as
         *   the note run `{ type: 'note', id?, noteClass, citation, label?,
         *   body }` at its place, `body` its `text:note-body` parsed as a
         *   body under the read's ctx; written back, it is the same note.
         * @returns {object}
         */
        function read(bytes, opts) {
            if (opts && opts.semanticStyles !== undefined && typeof opts.semanticStyles !== 'boolean') {
                throw new ContractError('odf/contract-error/odt',
                    'odt: read opts.semanticStyles must be true or false',
                    { context: { module: 'odt', argument: 'opts.semanticStyles' } });
            }
            const semanticStyles = !!(opts && opts.semanticStyles);
            if (opts && opts.headerFooterContent !== undefined && typeof opts.headerFooterContent !== 'boolean') {
                throw new ContractError('odf/contract-error/odt',
                    'odt: read opts.headerFooterContent must be true or false',
                    { context: { module: 'odt', argument: 'opts.headerFooterContent' } });
            }
            if (opts && opts.textBoxes !== undefined && typeof opts.textBoxes !== 'boolean') {
                throw new ContractError('odf/contract-error/odt',
                    'odt: read opts.textBoxes must be true or false',
                    { context: { module: 'odt', argument: 'opts.textBoxes' } });
            }
            for (const key of ['listStyles', 'sectionStyles']) {
                if (opts && opts[key] !== undefined && typeof opts[key] !== 'boolean') {
                    throw new ContractError('odf/contract-error/odt',
                        `odt: read opts.${key} must be true or false`,
                        { context: { module: 'odt', argument: `opts.${key}` } });
                }
            }
            if (opts && opts.notes !== undefined && typeof opts.notes !== 'boolean') {
                throw new ContractError('odf/contract-error/odt',
                    'odt: read opts.notes must be true or false',
                    { context: { module: 'odt', argument: 'opts.notes' } });
            }
            const textBoxes = !!(opts && opts.textBoxes);
            if (textBoxes && !(opts && opts.framesInRuns)) {
                throw new ContractError('odf/contract-error/odt',
                    'odt: read opts.textBoxes needs opts.framesInRuns',
                    { context: { module: 'odt', argument: 'opts.textBoxes' } });
            }
            const p = pkg.read(bytes, opts);
            if (p.mimetype !== CT_ODT) {
                throw new ParseError('odf/parse-error/odt',
                    `odt: unexpected mimetype "${p.mimetype}"`,
                    { context: { expected: CT_ODT, module: 'odt' } });
            }

            const contentBytes = p.parts['content.xml'];
            if (!contentBytes) {
                throw new ParseError('odf/parse-error/odt',
                    'odt: missing content.xml',
                    { context: { part: 'content.xml', module: 'odt' } });
            }
            // Sidecars FIRST — the content-side style resolver needs
            // `styles.xml` (named styles + font faces). Sidecar parsing has
            // no dependency on the body, so their models are unaffected.
            const result = { mimetype: p.mimetype, body: [], package: p };
            readSidecars(result, p, { metaMod, settingsMod, stylesMod });

            const parsed = parseContent(shared.decodeText(contentBytes), result.styles,
                !!(opts && opts.framesInRuns), !!(opts && opts.elementsInRuns), semanticStyles, textBoxes, !!(opts && opts.notes));
            result.body = parsed.body;
            if (parsed.autoStyles) result.autoStyles = parsed.autoStyles;
            if (parsed.fontFaces) result.fontFaces = parsed.fontFaces;
            if (opts && (opts.listStyles || opts.sectionStyles) && styleRegMod) {
                const st = result.styles || {};
                const raw = (content) => ({
                    content,
                    styles: (st.styles || []).map(asElement),
                    stylesAuto: (st.automaticStyles || []).map(asElement)
                });
                if (opts.listStyles) result.listStyles = styleRegMod.listStylesOf(raw(parsed.listStyleEls));
                if (opts.sectionStyles) result.sectionStyles = styleRegMod.sectionStylesOf(raw(parsed.sectionStyleEls));
            }

            walker.applyHydrate(result);
            if (opts && opts.headerFooterContent) {
                typeHeaderFooters(result.styles, !!opts.framesInRuns, !!opts.elementsInRuns, semanticStyles, textBoxes);
            }
            return result;
        }

        // The header and footer elements of a master page.
        const HEADER_FOOTER = new Set([
            'style:header', 'style:header-left', 'style:header-first',
            'style:footer', 'style:footer-left', 'style:footer-first'
        ]);

        // A raw element as read, or a large bundle's `{ kind, attrs,
        // children }` bag (`stylePage`), as a raw element (a copy).
        function asElement(n) {
            if (!n || typeof n !== 'object') return n;
            if (n.type === 'element') return structuredClone(n);
            if (typeof n.kind === 'string') {
                return { type: 'element', name: n.kind, attrs: { ...(n.attrs || {}) },
                    children: (n.children || []).map(asElement) };
            }
            return structuredClone(n);
        }

        // The `styles.xml` model as written: with extensions, their
        // dehydrate hooks applied to a copy (a bundle types parts of it out
        // of the containers, e.g. its list styles into `listStyles`). The
        // given model is not changed.
        function writtenStyles(styles) {
            if (!styles || !walker.hasExtensions) return styles;
            const env = { styles: structuredClone(styles) };
            walker.applyDehydrate(env);
            return env.styles || styles;
        }

        // The read context of header and footer content: a resolver over the
        // `styles.xml` automatic styles, named styles and font faces (it
        // consumes nothing), and the read's frame and inline-element flags.
        // `styles` is the model as written (`writtenStyles`).
        function headerReadCtx(styles, framesInRuns, elementsInRuns, semanticStyles, textBoxes) {
            const autoEls = (styles.automaticStyles || []).filter(c => c && c.type === 'element');
            const autoModel = styleAutoMod ? styleAutoMod.parse(xml.el('office:automatic-styles', {}, autoEls)) : null;
            const resolver = styleRegMod
                ? styleRegMod.createResolver(autoModel, stylesSidecarFaces(styles), styles.styles || null,
                    semanticStyles ? { semantic: true } : undefined)
                : undefined;
            const ctx = framesInRuns || elementsInRuns || semanticStyles
                ? { ...(resolver || {}),
                    ...(framesInRuns ? { parseFrame: frameMod.parseFrame } : {}),
                    ...(elementsInRuns ? { elementsInRuns: true } : {}),
                    ...(semanticStyles ? { listStack: [] } : {}) }
                : resolver;
            // This resolver consumes nothing: its boxes are typed with it.
            if (textBoxes) ctx.parseFrame = (el) => typeBox(frameMod.parseFrame(el), ctx);
            return ctx;
        }

        /**
         * The read option `textBoxes`: a text-box frame gains
         * `child.content`, its children typed as the body is under `ctx`
         * (a read context whose resolver consumes no style, so the box's
         * raw children, kept, still find their styles when written as
         * read), and `child._contentRead`, that content as read (the write
         * renders the box from `content` only when the two differ).
         */
        function typeBox(frame, ctx) {
            const c = frame && frame.child;
            if (c && c.kind === 'text-box') {
                c.content = contentMod.parseBody(xml.el('draw:text-box', {}, c.children || []), ctx);
                c._contentRead = structuredClone(c.content);
            }
            return frame;
        }

        /**
         * The write side of `textBoxes`: a text box whose `content` differs
         * from the content as read is written from it, through the write's
         * style registry; any other frame as it is.
         */
        function boxAsWritten(frame, ctx) {
            const c = frame && frame.child;
            if (!c || c.kind !== 'text-box' || !Array.isArray(c.content) || sameModel(c.content, c._contentRead)) return frame;
            return { ...frame, child: { ...c, children: contentMod.renderBody(c.content, ctx) } };
        }

        // Structural equality of two model values, `Object.is` on the leaves.
        function sameModel(a, b) {
            if (Object.is(a, b)) return true;
            if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            const ka = Object.keys(a), kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (const k of ka) {
                if (!Object.prototype.hasOwnProperty.call(b, k) || !sameModel(a[k], b[k])) return false;
            }
            return true;
        }

        // A raw element as a large bundle's `{ kind, attrs, children }` bag
        // (any other node as it is).
        function asBag(n) {
            if (!n || n.type !== 'element') return n;
            return { kind: n.name, attrs: { ...(n.attrs || {}) }, children: (n.children || []).map(asBag) };
        }

        /**
         * The write side of `headerFooterContent`: a header or footer whose
         * `content` equals what its children parse to (under the flags read)
         * keeps its children; an edited one gets them from its `content`,
         * rendered through a style registry of its own, whose automatic
         * styles and font faces go into `styles.xml`. Returns the style
         * names that registry handed out (the `content.xml` registry avoids
         * them), or null.
         */
        function writeHeaderFooters(styles, doc) {
            if (!styles) return null;
            let flat = null;
            const edited = [];
            for (const mp of [...(styles.masterStyles || []), ...(styles.masterPages || [])]) {
                if (!mp || (mp.name || mp.kind) !== 'style:master-page') continue;
                for (const c of mp.children || []) {
                    if (!c || !HEADER_FOOTER.has(c.name || c.kind) || !Array.isArray(c.content)) continue;
                    const f = c._contentFlags || {};
                    flat = flat || writtenStyles(styles);
                    const read = contentMod.parseBody(asElement(c), headerReadCtx(flat, !!f.framesInRuns, !!f.elementsInRuns, !!f.semanticStyles, !!f.textBoxes));
                    if (!sameModel(read, c.content)) edited.push(c);
                }
            }
            if (!edited.length || !styleRegMod) return null;
            const taken = reservedStyleNamesOf(doc.autoStyles);
            const nameOf = (n) => n && n.attrs && n.attrs['style:name'];
            for (const n of [...(flat.styles || []), ...(flat.automaticStyles || []),
                ...(flat.pageLayouts || []), ...(flat.masterPages || [])]) {
                if (nameOf(n)) taken.add(nameOf(n));
            }
            const faces = stylesSidecarFaces(flat);
            const registry = styleRegMod.createRegistry({ styles: taken, fontFaces: faces.map(nameOf).filter(Boolean) });
            const ctx = writeCtx(registry);
            for (const c of edited) {
                const els = contentMod.renderBody(c.content, ctx);
                c.children = c.type === 'element' ? els : els.map(asBag);
            }
            const out = new Set();
            const gen = registry.toAutomaticStyles();
            if (gen && styleAutoMod) {
                const rendered = (styleAutoMod.render(gen).children || []).filter(n => n && n.type === 'element');
                styles.automaticStyles = [...(styles.automaticStyles || []), ...rendered];
                for (const n of rendered) if (nameOf(n)) out.add(nameOf(n));
            }
            const genFaces = registry.toFontFaceDecls();
            if (genFaces) {
                const kids = (styles._extras && styles._extras.children) || [];
                const decls = kids.find(n => n && n.type === 'element' && n.name === 'office:font-face-decls');
                if (decls) decls.children = [...(decls.children || []), ...genFaces.children];
                else styles._extras = { ...(styles._extras || {}), children: [genFaces, ...kids] };
            }
            return out;
        }

        /**
         * The read option `headerFooterContent`: every header and footer of
         * the `styles.xml` master pages (raw elements, or the large
         * bundle's bags) gains `content`, its children typed with the
         * body's model — a read context over the `styles.xml` automatic
         * styles, named styles and font faces, which consumes nothing, and
         * the read's frame and inline-element flags. The children stay as
         * read.
         */
        function typeHeaderFooters(styles, framesInRuns, elementsInRuns, semanticStyles, textBoxes) {
            if (!styles) return;
            const ctx = headerReadCtx(writtenStyles(styles), framesInRuns, elementsInRuns, semanticStyles, textBoxes);
            for (const mp of [...(styles.masterStyles || []), ...(styles.masterPages || [])]) {
                if (!mp || (mp.name || mp.kind) !== 'style:master-page') continue;
                for (const c of mp.children || []) {
                    if (!c || !HEADER_FOOTER.has(c.name || c.kind)) continue;
                    c.content = contentMod.parseBody(asElement(c), ctx);
                    c._contentFlags = semanticStyles ? { framesInRuns, elementsInRuns, semanticStyles } : { framesInRuns, elementsInRuns };
                    if (textBoxes) c._contentFlags.textBoxes = true;
                }
            }
        }

        /**
         * Collect the `style:font-face` elements declared inside any
         * `<office:font-face-decls>` bucketed in the `styles.xml` model's
         * `_extras.children` (`styles.js` parks unknown root children there).
         *
         * @param {object} [stylesModel]
         * @returns {Array<object>}
         */
        function stylesSidecarFaces(stylesModel) {
            const out = [];
            const extras = stylesModel && stylesModel._extras
                && stylesModel._extras.children;
            for (const c of extras || []) {
                if (c.type !== 'element' || c.name !== 'office:font-face-decls') continue;
                for (const f of xml.findAll(c, 'style:font-face')) out.push(f);
            }
            return out;
        }

        function textFontName(style) {
            return style && style.properties && style.properties.text
                && style.properties.text['style:font-name'];
        }

        /**
         * Parse `content.xml` — body plus the leftover style material.
         *
         * @param {string} xmlString
         * @param {object} [stylesModel] — parsed `styles.xml` model, used
         *   read-only for named-style / font-face resolution.
         * @param {boolean} [framesInRuns] — type frames as runs in place.
         * @param {boolean} [elementsInRuns] — keep untyped inline elements as
         *   raw runs in place.
         * @param {boolean} [semanticStyles] — read the emphasis and the
         *   nested-list numbering styles state (the read's opt-in).
         * @returns {{body: Array<object>, autoStyles?: object, fontFaces?: Array<object>}}
         */
        function parseContent(xmlString, stylesModel, framesInRuns, elementsInRuns, semanticStyles, textBoxes, notes) {
            const root = parseXmlOrThrow(xmlString, 'odt',
                { part: 'content.xml', module: 'odt' });
            if (root.name !== 'office:document-content') {
                throw new ParseError('odf/parse-error/odt',
                    `odt: unexpected content root <${root.name}>`,
                    { context: { part: 'content.xml', module: 'odt' } });
            }
            const bodyEl = xml.findChild(root, 'office:body');
            if (!bodyEl) throw new ParseError('odf/parse-error/odt',
                'odt: missing <office:body> in content.xml',
                { context: { part: 'content.xml', module: 'odt' } });

            const declsEl = xml.findChild(root, 'office:font-face-decls');
            const autoEl = xml.findChild(root, 'office:automatic-styles');
            const contentFaces = declsEl ? xml.findAll(declsEl, 'style:font-face') : [];
            const autoModel = (autoEl && styleAutoMod) ? styleAutoMod.parse(autoEl) : null;

            const resolver = styleRegMod
                ? styleRegMod.createResolver(
                    autoModel,
                    contentFaces.concat(stylesSidecarFaces(stylesModel)),
                    (stylesModel && stylesModel.styles) || null,
                    semanticStyles ? { semantic: true } : undefined)
                : undefined;

            const textEl = xml.findChild(bodyEl, 'office:text');
            // The read ctx: the resolver, plus the frame parser when frames
            // are typed in place and the `elementsInRuns` flag when untyped
            // inline elements stay in place (`consumed` is the same Set
            // either way).
            const readCtx = framesInRuns || elementsInRuns || semanticStyles || notes
                ? { ...(resolver || {}),
                    ...(framesInRuns ? { parseFrame: frameMod.parseFrame } : {}),
                    ...(elementsInRuns ? { elementsInRuns: true } : {}),
                    ...(semanticStyles ? { listStack: [] } : {}) }
                : resolver;
            if (textBoxes) {
                // The boxes are typed under a resolver of their own over the
                // same styles, whose consumption is not counted: a box
                // written as read keeps the styles its raw children name.
                const boxResolver = styleRegMod
                    ? styleRegMod.createResolver(autoModel, contentFaces.concat(stylesSidecarFaces(stylesModel)),
                        (stylesModel && stylesModel.styles) || null, semanticStyles ? { semantic: true } : undefined)
                    : undefined;
                const boxCtx = { ...(boxResolver || {}),
                    ...(elementsInRuns ? { elementsInRuns: true } : {}),
                    ...(semanticStyles ? { listStack: [] } : {}) };
                boxCtx.parseFrame = (el) => typeBox(frameMod.parseFrame(el), boxCtx);
                readCtx.parseFrame = boxCtx.parseFrame;
            }
            // The read option `notes`: a `text:note` is a typed note run.
            if (notes) readCtx.parseNote = (el) => parseNote(el, readCtx);
            const out = { body: textEl ? contentMod.parseBody(textEl, readCtx) : [] };
            // Every automatic list style as written, consumed or not (the
            // read's opt-in `listStyles`).
            out.listStyleEls = autoEl ? xml.findAll(autoEl, 'text:list-style') : [];
            // And every automatic style as written (`sectionStyles`).
            out.sectionStyleEls = autoEl ? xml.findAll(autoEl, 'style:style') : [];

            const consumed = resolver ? resolver.consumed : new Set();

            // Surface the automatic styles the resolver could NOT prove.
            let surfaced = null;
            if (autoModel) {
                const styles = (autoModel.styles || []).filter(s => !consumed.has(s.name));
                const extras = ((autoModel._extras && autoModel._extras.children) || [])
                    .filter(c => !(c.type === 'element' && c.name === 'text:list-style'
                        && consumed.has(c.attrs && c.attrs['style:name'])));
                if (styles.length || extras.length) {
                    surfaced = { styles };
                    if (extras.length) surfaced._extras = { children: extras };
                }
            }
            if (surfaced) out.autoStyles = surfaced;

            // A content-declared face is dropped only when it was resolved to
            // monospace at least once AND no surviving auto style still names
            // it. `styles.xml` faces are never touched.
            const resolvedMono = new Set();
            for (const s of (autoModel && autoModel.styles) || []) {
                if (!consumed.has(s.name)) continue;
                const fn = textFontName(s);
                if (fn) resolvedMono.add(fn);
            }
            const stillReferenced = new Set();
            for (const s of (surfaced && surfaced.styles) || []) {
                const fn = textFontName(s);
                if (fn) stillReferenced.add(fn);
            }
            const remainingFaces = contentFaces.filter(f => {
                const n = f.attrs && f.attrs['style:name'];
                return !(resolvedMono.has(n) && !stillReferenced.has(n));
            });
            if (remainingFaces.length) out.fontFaces = remainingFaces;

            return out;
        }

        /**
         * Write a typed document tree to `.odt` bytes.
         *
         * `doc.pictures` (`{ [path]: Uint8Array }`, optional) is emitted as
         * package parts — conventionally `Pictures/<name>` — each with the
         * manifest media type sniffed from its bytes
         * (`drawImage.sniffImageType`, `application/octet-stream` when
         * unknown). A path naming a reserved part (`content.xml`,
         * `styles.xml`, `meta.xml`, `settings.xml`, `mimetype`,
         * `META-INF/manifest.xml`), an empty, absolute, directory or `..`
         * path, or a non-`Uint8Array` value throws
         * `ContractError('odf/contract-error/odt')`. An `image` run's `href`
         * is NOT validated against `pictures`: an external `xlink:href` is
         * legal ODF. Zip order: `content.xml`, the meta/settings/styles
         * sidecars, then the pictures in `Object.keys` order (deterministic),
         * then the parts carried from `doc.package` (`odfShared.carryParts`):
         * a carried part never overrides a picture of the same path.
         *
         * @param {object} doc — `{ body, autoStyles?, fontFaces?, pictures?, meta?, settings?, styles?, package? }`
         * @param {object} [opts] — `{ meta, settings, styles }`, each overriding the `doc.*` sidecar,
         *        and `mtime` (`number|Date`), the ZIP entry date passed to `pkgPackage.write`
         *        (default 1980-01-01 00:00:00: the output is byte-reproducible), and
         *        `preserveInput` (default `false`): `true` writes from a structured clone of
         *        `doc` (its `package` excepted, only read) and of `opts`, so the extensions'
         *        dehydrate hooks leave the given model as it was; the bytes are the same;
         *        `keepVersion` (default `false`): `true` writes each part with its source
         *        part's `office:version` (none when it has none) and the manifest with the
         *        source's version (from ODF 1.2 on) instead of `1.4`;
         *        `cleanup` (default none): an array of named cleanups, applied to a
         *        structured clone (the given model is left as it was), as `docx.write`'s:
         *        `'emptyProperties'` drops every `style:*-properties` element with no
         *        attribute and no child from the automatic styles of `content.xml` and
         *        from the styles of `styles.xml`; another value throws
         *        `ContractError('odf/contract-error/odt')` (`context.argument: 'opts.cleanup'`)
         * @returns {Uint8Array}
         */
        function write(doc, opts) {
            if (!doc) {
                throw new ContractError('odf/contract-error/odt',
                    'odt: write needs a document',
                    { context: { module: 'odt', argument: 'doc' } });
            }
            opts = opts || {};
            if (opts.preserveInput !== undefined && typeof opts.preserveInput !== 'boolean') {
                throw new ContractError('odf/contract-error/odt',
                    'odt: write opts.preserveInput must be true or false',
                    { context: { module: 'odt', argument: 'opts.preserveInput' } });
            }
            const cleanup = cleanupSpec(opts.cleanup);
            if (opts.preserveInput || cleanup.size) {
                // One clone of the model and of the options, so values they
                // share stay shared; the read envelope `package`, only read,
                // is not copied.
                const { package: envelope, ...rest } = doc;
                const copy = structuredClone({ doc: rest, opts });
                doc = envelope === undefined ? copy.doc : { ...copy.doc, package: envelope };
                opts = copy.opts;
            }
            if (cleanup.has('emptyProperties')) {
                dropEmptyAutoProperties(doc.autoStyles);
                dropEmptyPropertyNodes(opts.styles || doc.styles);
            }
            const headerNames = writeHeaderFooters(opts.styles || doc.styles, doc);
            if (walker.hasExtensions) {
                const dehydrated = {
                    body: doc.body,
                    meta: opts.meta || doc.meta,
                    settings: opts.settings || doc.settings,
                    styles: opts.styles || doc.styles
                };
                walker.applyDehydrate(dehydrated);
                if (dehydrated.body !== undefined) doc = { ...doc, body: dehydrated.body };
                if (dehydrated.meta !== undefined) opts = { ...opts, meta: dehydrated.meta };
                if (dehydrated.settings !== undefined) opts = { ...opts, settings: dehydrated.settings };
                if (dehydrated.styles !== undefined) opts = { ...opts, styles: dehydrated.styles };
            }
            const kept = keptVersion(doc, opts, 'odt');
            const p = pkg.empty(CT_ODT);

            const contentXml = renderContent(doc, headerNames, kept ? kept.of('content.xml') : undefined);
            pkg.setPart(p, 'content.xml', encodeText(contentXml), CT_XML);

            writeSidecars(p, doc, opts,
                { pkg, metaMod, settingsMod, stylesMod }, CT_XML);

            writePictures(p, doc.pictures);

            carryParts(p, doc.package, { pkg, manifestMod });
            applyManifestVersion(p, kept);

            return pkg.write(p, { mtime: opts.mtime });
        }

        /** Emit `doc.pictures` as parts; media type sniffed from the bytes. */
        // `write`'s named cleanups (the names `docx.write` uses).
        const CLEANUPS = new Set(['emptyProperties']);
        const PROPERTY_ELEMENT = /^style:[a-z-]+-properties$/;

        /** The validated `opts.cleanup` names (empty when absent). */
        function cleanupSpec(value) {
            if (value === undefined) return new Set();
            const ok = Array.isArray(value)
                && value.every(n => CLEANUPS.has(n))
                && new Set(value).size === value.length;
            if (!ok) {
                throw new ContractError('odf/contract-error/odt',
                    'odt: write opts.cleanup must be an array of distinct names among: ' + [...CLEANUPS].join(', '),
                    { context: { module: 'odt', argument: 'opts.cleanup' } });
            }
            return new Set(value);
        }

        /** Delete, in place, every typed automatic-style properties bag with no attribute and no kept child. */
        function dropEmptyAutoProperties(autoStyles) {
            for (const st of (autoStyles && autoStyles.styles) || []) {
                const kept = (st._extras && st._extras.propertyChildren) || {};
                for (const key of Object.keys(st.properties || {})) {
                    const bag = st.properties[key] || {};
                    if (!Object.keys(bag).length && !(kept[key] && kept[key].length)) delete st.properties[key];
                }
            }
        }

        /** Remove, in place, every raw property element with no attribute (declarations aside) and no child. */
        function dropEmptyPropertyNodes(node) {
            if (!node || typeof node !== 'object' || ArrayBuffer.isView(node)) return;
            if (Array.isArray(node)) { for (const n of node) dropEmptyPropertyNodes(n); return; }
            if (Array.isArray(node.children)) {
                node.children = node.children.filter(c => !(c && c.type === 'element'
                    && PROPERTY_ELEMENT.test(c.name)
                    && !Object.keys(c.attrs || {}).some(k => k !== 'xmlns' && !k.startsWith('xmlns:'))
                    && !(c.children || []).some(k => k.type === 'element' || (k.type === 'text' && k.value.trim()))));
            }
            for (const key of Object.keys(node)) dropEmptyPropertyNodes(node[key]);
        }

        function writePictures(p, pictures) {
            for (const path of Object.keys(pictures || {})) {
                const bytes = pictures[path];
                const bad = RESERVED_PARTS.has(path) || path === pkg.MIMETYPE_PATH || path === pkg.MANIFEST_PATH
                    || path === '' || path.startsWith('/') || path.endsWith('/') || path.split('/').includes('..');
                if (bad) {
                    throw new ContractError('odf/contract-error/odt', `odt: pictures path "${path}" is reserved or invalid`,
                        { context: { module: 'odt', argument: 'doc.pictures', path } });
                }
                if (!(bytes instanceof Uint8Array)) {
                    throw new ContractError('odf/contract-error/odt', `odt: pictures["${path}"] must be a Uint8Array`,
                        { context: { module: 'odt', argument: 'doc.pictures', path } });
                }
                pkg.setPart(p, path, bytes, imageMod.sniffImageType(bytes));
            }
        }

        /** Render one `image` run as `<draw:frame><draw:image/></draw:frame>` through drawFrame. */
        function renderImageRun(r) {
            const frame = { type: 'frame', anchorType: r.anchorType || 'as-char', child: { kind: 'image', href: r.href || '' } };
            if (r.name)      frame.name = r.name;
            if (r.styleName) frame.styleName = r.styleName;
            if (r.width)     frame.width = r.width;
            if (r.height)    frame.height = r.height;
            if (r.mimeType)  frame.child.mimeType = r.mimeType;
            return frameMod.renderFrame(frame);
        }

        /** The write ctx: the style registry's members plus the image and frame sinks. */
        // The write context; `version` (a `keepVersion` write) before ODF
        // 1.3 writes an image's mime type under the attribute it was read
        // from (1.2 has no `draw:mime-type` on images).
        function writeCtx(registry, version) {
            const asRead = typeof version === 'string' && parseFloat(version) < 1.3;
            const ctx = { ...(registry || {}), renderImage: renderImageRun };
            ctx.renderFrame = asRead
                ? (f) => frameMod.renderFrame(boxAsWritten(f, ctx), { mimeTypeAsRead: true })
                : (f) => frameMod.renderFrame(boxAsWritten(f, ctx));
            ctx.renderNote = (n) => renderNote(n, ctx);
            return ctx;
        }

        /**
         * The read option `notes`: a `text:note` as the typed note run, its
         * body parsed as a body under the read's `ctx`.
         */
        function parseNote(el, ctx) {
            const kids = (el.children || []).filter((c) => c && c.type === 'element');
            const cite = kids.find((c) => c.name === 'text:note-citation');
            const body = kids.find((c) => c.name === 'text:note-body');
            const a = el.attrs || {};
            const note = { type: 'note' };
            if (a['text:id']) note.id = a['text:id'];
            note.noteClass = a['text:note-class'] === 'endnote' ? 'endnote' : 'footnote';
            note.citation = cite ? xml.textContent(cite) : '';
            if (cite && cite.attrs && cite.attrs['text:label']) note.label = cite.attrs['text:label'];
            note.body = body ? contentMod.parseBody(body, ctx) : [];
            return note;
        }

        /**
         * A typed note run as `text:note`: its `id` (when given), its class
         * (`footnote` by default), its citation (`text:label` when a
         * `label` is given) and its body, typed blocks rendered under the
         * write's `ctx` (its style registry and sinks).
         */
        function renderNote(n, ctx) {
            const attrs = {};
            if (typeof n.id === 'string' && n.id) attrs['text:id'] = n.id;
            attrs['text:note-class'] = n.noteClass === 'endnote' ? 'endnote' : 'footnote';
            const citeAttrs = typeof n.label === 'string' && n.label ? { 'text:label': n.label } : {};
            return xml.el('text:note', attrs, [
                xml.el('text:note-citation', citeAttrs, [xml.text(String(n.citation == null ? '' : n.citation))]),
                xml.el('text:note-body', {}, contentMod.renderBody(Array.isArray(n.body) ? n.body : [], ctx))
            ]);
        }

        /** Names already taken by the passthrough automatic-styles model. */
        function reservedStyleNamesOf(autoStyles) {
            const out = new Set();
            for (const s of (autoStyles && autoStyles.styles) || []) {
                if (s && s.name) out.add(s.name);
            }
            for (const c of (autoStyles && autoStyles._extras
                             && autoStyles._extras.children) || []) {
                const n = c && c.attrs && c.attrs['style:name'];
                if (n) out.add(n);
            }
            return out;
        }

        /** Names already taken by the passthrough font-face declarations. */
        function reservedFaceNamesOf(fontFaces) {
            const out = new Set();
            for (const f of fontFaces || []) {
                const n = f && f.attrs && f.attrs['style:name'];
                if (n) out.add(n);
            }
            return out;
        }

        /**
         * Merge the passthrough automatic-styles model with the one the
         * registry generated. Returns `null` when both are empty, so an
         * unstyled document emits no `<office:automatic-styles>` at all.
         */
        function mergeAutoStyles(docAuto, genAuto) {
            const styles = [];
            const extras = [];
            for (const s of (docAuto && docAuto.styles) || []) styles.push(s);
            for (const c of (docAuto && docAuto._extras && docAuto._extras.children) || []) {
                extras.push(c);
            }
            for (const s of (genAuto && genAuto.styles) || []) styles.push(s);
            for (const c of (genAuto && genAuto._extras && genAuto._extras.children) || []) {
                extras.push(c);
            }
            if (!styles.length && !extras.length) return null;
            const model = { styles };
            if (extras.length) model._extras = { children: extras };
            return model;
        }

        function renderContent(doc, headerNames, version) {
            const reserved = reservedStyleNamesOf(doc.autoStyles);
            for (const n of headerNames || []) reserved.add(n);
            const registry = styleRegMod
                ? styleRegMod.createRegistry({
                    styles: reserved,
                    fontFaces: reservedFaceNamesOf(doc.fontFaces)
                })
                : undefined;
            const ctx = writeCtx(registry, version);
            const body = contentMod.renderBody(doc.body || [], ctx);
            const textEl = xml.el('office:text', {}, body);
            const bodyEl = xml.el('office:body', {}, [textEl]);

            // Schema order: font-face-decls?, automatic-styles?, body.
            const rootChildren = [];

            const faces = [];
            for (const f of doc.fontFaces || []) faces.push(f);
            const genFaces = registry ? registry.toFontFaceDecls() : null;
            for (const c of (genFaces && genFaces.children) || []) faces.push(c);
            if (faces.length) rootChildren.push(xml.el('office:font-face-decls', {}, faces));

            const merged = mergeAutoStyles(doc.autoStyles,
                registry ? registry.toAutomaticStyles() : null);
            if (merged && styleAutoMod) rootChildren.push(styleAutoMod.render(merged));

            rootChildren.push(bodyEl);

            const root = xml.el('office:document-content', {
                'xmlns:office': ODF_NS.OFFICE,
                'xmlns:text':   ODF_NS.TEXT,
                'xmlns:style':  ODF_NS.STYLE,
                'xmlns:table':  ODF_NS.TABLE,
                'xmlns:draw':   ODF_NS.DRAW,
                'xmlns:fo':     ODF_NS.FO,
                'xmlns:svg':    ODF_NS.SVG,
                'xmlns:xlink':  ODF_NS.XLINK,
                'office:version': version !== undefined ? version : ODF_VERSION
            }, rootChildren);
            // keepVersion: a source part without a version is written without one.
            if (root.attrs['office:version'] === null) delete root.attrs['office:version'];
            declareNamespaces(root, { carried: sourceNamespaces(doc.package, 'content.xml'),
                part: 'content.xml', module: 'odt' });
            return xml.serialize(root);
        }

        // --- Convenience helpers ---

        function empty() {
            return { body: [paraMod.paragraph('')] };
        }

        function paragraph(text, opts) {
            return paraMod.paragraph(text, opts);
        }

        function fromText(strings) {
            return {
                body: (strings || []).map(s => paraMod.paragraph(String(s)))
            };
        }

        function toText(doc) {
            return contentMod.bodyText(doc.body || []);
        }

        const api = {
            read, write, empty, paragraph, fromText, toText,
            CT_ODT,
            use(...extensions) { walker.use(...extensions); return api; },
            get hasExtensions() { return walker.hasExtensions; }
        };
        return api;
    }
};
