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
 * the frame stays untyped in the paragraph's `_extras.children`.
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
                sourceNamespaces, declareNamespaces } = shared;
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
         * @param {object} [opts] forwarded to pkgPackage.read — { maxParts?, maxUncompressed?, maxRatio? }
         * @returns {object}
         */
        function read(bytes, opts) {
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

            const parsed = parseContent(shared.decodeText(contentBytes), result.styles);
            result.body = parsed.body;
            if (parsed.autoStyles) result.autoStyles = parsed.autoStyles;
            if (parsed.fontFaces) result.fontFaces = parsed.fontFaces;

            walker.applyHydrate(result);
            return result;
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
         * @returns {{body: Array<object>, autoStyles?: object, fontFaces?: Array<object>}}
         */
        function parseContent(xmlString, stylesModel) {
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
                    (stylesModel && stylesModel.styles) || null)
                : undefined;

            const textEl = xml.findChild(bodyEl, 'office:text');
            const out = { body: textEl ? contentMod.parseBody(textEl, resolver) : [] };

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
         * @param {object} [opts] — `{ meta, settings, styles }`, each overriding the `doc.*` sidecar
         * @returns {Uint8Array}
         */
        function write(doc, opts) {
            if (!doc) {
                throw new ContractError('odf/contract-error/odt',
                    'odt: write needs a document',
                    { context: { module: 'odt', argument: 'doc' } });
            }
            opts = opts || {};
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
            const p = pkg.empty(CT_ODT);

            const contentXml = renderContent(doc);
            pkg.setPart(p, 'content.xml', encodeText(contentXml), CT_XML);

            writeSidecars(p, doc, opts,
                { pkg, metaMod, settingsMod, stylesMod }, CT_XML);

            writePictures(p, doc.pictures);

            carryParts(p, doc.package, { pkg, manifestMod });

            return pkg.write(p);
        }

        /** Emit `doc.pictures` as parts; media type sniffed from the bytes. */
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

        /** The write ctx: the style registry's members plus the image sink. */
        function writeCtx(registry) {
            return { ...(registry || {}), renderImage: renderImageRun };
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

        function renderContent(doc) {
            const registry = styleRegMod
                ? styleRegMod.createRegistry({
                    styles: reservedStyleNamesOf(doc.autoStyles),
                    fontFaces: reservedFaceNamesOf(doc.fontFaces)
                })
                : undefined;
            const ctx = writeCtx(registry);
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
                'office:version': ODF_VERSION
            }, rootChildren);
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
