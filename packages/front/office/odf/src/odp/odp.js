// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview OpenDocument Presentation (.odp) reader/writer — orchestrator.
 *
 * Builds a minimal valid `.odp` from a typed presentation tree:
 *
 * - `mimetype` (STORED) — `application/vnd.oasis.opendocument.presentation`
 * - `META-INF/manifest.xml`
 * - `content.xml` — `<office:document-content>` →
 *   `<office:body>` → `<office:presentation>` → typed slides.
 * - `styles.xml`, `meta.xml`, `settings.xml` — minimal
 *
 * Result of `read()` :
 *
 * ```js
 * {
 *   mimetype,
 *   slides: [ ...slideModel ],
 *   automaticStyles?, meta?, settings?, styles?, package
 * }
 * ```
 *
 * **Round-trip.** `write(read(x))` carries what the model does not
 * regenerate: every part of `doc.package` other than `content.xml` and the
 * three sidecars is re-emitted byte-for-byte with the media type the source
 * manifest declared (`application/octet-stream` when it declared none),
 * and the source manifest's directory entries are re-declared. The
 * sidecars come from `opts.*`, else `doc.meta` / `doc.settings` /
 * `doc.styles`, else an empty model; `meta:generator` is rewritten to this
 * library unless `opts.meta.generator` is given. Precedence: a regenerated
 * part always wins, then a part the writer supplied, then the carried
 * copy. Delete from `doc.package.parts` (or delete `doc.package`) to drop
 * carried material.
 *
 * @module odf/odp/odp
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
import { slide } from './slide.js';
import { presentationStyle } from './presentationStyle.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { styleMasterPage } from '../style/masterPage.js';
import { drawFrame } from '../draw/frame.js';
import { textParagraph } from '../text/paragraph.js';
import { odpWalker } from './odp-walker.js';

export const odp = {
    name: 'odp',
    dependencies: [
        'odfErrors', 'odfShared',
        'pkgPackage', 'xml', 'pkgMimetype', 'pkgManifest',
        'odfMeta', 'odfSettings', 'odfStyles',
        'slide', 'presentationStyle',
        'styleAutomatic', 'styleMasterPage',
        'drawFrame', 'textParagraph', 'odpWalker'
    ],
    deps: [odfErrors, odfShared, pkgPackage, xml, pkgMimetype, pkgManifest, odfMeta, odfSettings, odfStyles, slide, presentationStyle, styleAutomatic, styleMasterPage, drawFrame, textParagraph, odpWalker],

    factory(errors, shared, pkg, xml, mimetypeMod, manifestMod, metaMod, settingsMod, stylesMod,
            slideMod, presentationMod, automaticMod, masterPageMod, frameMod, paraMod, walkerMod) {
        const { ParseError, ContractError } = errors;
        const { ODF_NS, ODF_VERSION, CT, encodeText,
                parseXmlOrThrow, readSidecars, writeSidecars, carryParts,
                sourceNamespaces, declareNamespaces } = shared;
        // unused-dep guards
        void mimetypeMod;

        const CT_ODP = CT.ODP;
        const CT_XML = CT.XML;

        const walker = walkerMod.createWalker();

        // unused-dep guards (referenced for runtime registration only)
        void presentationMod; void masterPageMod; void frameMod; void paraMod;

        /**
         * Read a `.odp` byte stream into a typed document model.
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts] forwarded to pkgPackage.read — { maxParts?, maxUncompressed?, maxRatio? }
         * @returns {object}
         */
        function read(bytes, opts) {
            const p = pkg.read(bytes, opts);
            if (p.mimetype !== CT_ODP) {
                throw new ParseError('odf/parse-error/odp',
                    `odp: unexpected mimetype "${p.mimetype}"`,
                    { context: { expected: CT_ODP, module: 'odp' } });
            }
            const contentBytes = p.parts['content.xml'];
            if (!contentBytes) {
                throw new ParseError('odf/parse-error/odp',
                    'odp: missing content.xml',
                    { context: { part: 'content.xml', module: 'odp' } });
            }
            const parsed = parseContent(shared.decodeText(contentBytes));

            const result = {
                mimetype: p.mimetype,
                slides: parsed.slides,
                package: p
            };
            if (parsed.automaticStyles) result.automaticStyles = parsed.automaticStyles;

            readSidecars(result, p, { metaMod, settingsMod, stylesMod });
            walker.applyHydrate(result);
            return result;
        }

        function parseContent(xmlString) {
            const root = parseXmlOrThrow(xmlString, 'odp',
                { part: 'content.xml', module: 'odp' });
            if (root.name !== 'office:document-content') {
                throw new ParseError('odf/parse-error/odp',
                    `odp: unexpected content root <${root.name}>`,
                    { context: { part: 'content.xml', module: 'odp' } });
            }
            const autoEl = xml.findChild(root, 'office:automatic-styles');
            const bodyEl = xml.findChild(root, 'office:body');
            if (!bodyEl) throw new ParseError('odf/parse-error/odp',
                'odp: missing <office:body> in content.xml',
                { context: { part: 'content.xml', module: 'odp' } });
            const presEl = xml.findChild(bodyEl, 'office:presentation');
            const slides = [];
            if (presEl) {
                for (const c of presEl.children || []) {
                    if (c.type === 'element' && c.name === 'draw:page') {
                        slides.push(slideMod.parseSlide(c));
                    }
                }
            }
            const out = { slides };
            if (autoEl) out.automaticStyles = automaticMod.parse(autoEl);
            return out;
        }

        /**
         * Write a typed presentation tree to `.odp` bytes.
         *
         * @param {object} doc
         * @param {object} [opts]
         * @returns {Uint8Array}
         */
        function write(doc, opts) {
            if (!doc) {
                throw new ContractError('odf/contract-error/odp',
                    'odp: write needs a document',
                    { context: { module: 'odp', argument: 'doc' } });
            }
            opts = opts || {};
            if (walker.hasExtensions) {
                const dehydrated = {
                    slides: doc.slides,
                    meta: opts.meta || doc.meta,
                    settings: opts.settings || doc.settings,
                    styles: opts.styles || doc.styles
                };
                walker.applyDehydrate(dehydrated);
                if (dehydrated.slides !== undefined) doc = { ...doc, slides: dehydrated.slides };
                if (dehydrated.meta !== undefined) opts = { ...opts, meta: dehydrated.meta };
                if (dehydrated.settings !== undefined) opts = { ...opts, settings: dehydrated.settings };
                if (dehydrated.styles !== undefined) opts = { ...opts, styles: dehydrated.styles };
            }
            const p = pkg.empty(CT_ODP);

            const contentXml = renderContent(doc);
            pkg.setPart(p, 'content.xml', encodeText(contentXml), CT_XML);

            writeSidecars(p, doc, opts,
                { pkg, metaMod, settingsMod, stylesMod }, CT_XML);

            carryParts(p, doc.package, { pkg, manifestMod });

            return pkg.write(p);
        }

        function renderContent(doc) {
            const slideEls = (doc.slides || []).map(s => slideMod.renderSlide(s));
            const presEl = xml.el('office:presentation', {}, slideEls);
            const bodyEl = xml.el('office:body', {}, [presEl]);
            const children = [];
            if (doc.automaticStyles) {
                children.push(automaticMod.render(doc.automaticStyles));
            }
            children.push(bodyEl);
            const root = xml.el('office:document-content', {
                'xmlns:office':       ODF_NS.OFFICE,
                'xmlns:text':         ODF_NS.TEXT,
                'xmlns:style':        ODF_NS.STYLE,
                'xmlns:table':        ODF_NS.TABLE,
                'xmlns:draw':         ODF_NS.DRAW,
                'xmlns:presentation': ODF_NS.PRESENTATION,
                'xmlns:fo':           ODF_NS.FO,
                'xmlns:svg':          ODF_NS.SVG,
                'xmlns:xlink':        ODF_NS.XLINK,
                'office:version': ODF_VERSION
            }, children);
            declareNamespaces(root, { carried: sourceNamespaces(doc.package, 'content.xml'),
                part: 'content.xml', module: 'odp' });
            return xml.serialize(root);
        }

        // --- Convenience helpers ---

        function empty() {
            return { slides: [slideBuilder('Slide1')] };
        }

        /**
         * Build a `{ type: 'slide', name, frames }` from options.
         *
         * @param {string} name
         * @param {object} [opts] — `{ masterPageName, layoutName, frames, notes }`
         * @returns {object}
         */
        function slideBuilder(name, opts) {
            opts = opts || {};
            const s = { type: 'slide', name, frames: opts.frames || [] };
            if (opts.masterPageName) s.masterPageName = opts.masterPageName;
            if (opts.layoutName)     s.layoutName     = opts.layoutName;
            if (opts.styleName)      s.styleName      = opts.styleName;
            if (opts.notes)          s.notes          = opts.notes;
            return s;
        }

        function fromSlides(slides) {
            return { slides: (slides || []).slice() };
        }

        /**
         * Visible text of the deck: `slideMod.slideText` per slide, empty slides
         * skipped, slides separated by one blank line. `opts.notes === true`
         * appends each slide's speaker notes after its frames. Slide names are
         * identifiers, not text.
         * @param {object} doc
         * @param {{notes?: boolean}} [opts]
         * @returns {string}
         */
        function toText(doc, opts) {
            const out = [];
            for (const s of (doc && doc.slides) || []) {
                const t = slideMod.slideText(s, opts);
                if (t !== '') out.push(t);
            }
            return out.join('\n\n');
        }

        const api = {
            read, write, empty,
            slide: slideBuilder, fromSlides, toText,
            CT_ODP,
            use(...extensions) { walker.use(...extensions); return api; },
            get hasExtensions() { return walker.hasExtensions; }
        };
        return api;
    }
};
