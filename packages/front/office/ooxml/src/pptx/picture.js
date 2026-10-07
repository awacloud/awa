// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PresentationML pictures — `<p:pic>` element
 * (ECMA-376 part 1 §19.3.1.37).
 *
 * Slide-level pictures sit in a `<p:spTree>` alongside `<p:sp>` shapes.
 * The structure :
 *
 * ```xml
 * <p:pic>
 *   <p:nvPicPr>
 *     <p:cNvPr id="…" name="…" descr="…"/>
 *     <p:cNvPicPr/>
 *     <p:nvPr/>
 *   </p:nvPicPr>
 *   <p:blipFill>
 *     <a:blip r:embed="rIdN"/>
 *     <a:stretch><a:fillRect/></a:stretch>
 *   </p:blipFill>
 *   <p:spPr>
 *     <a:xfrm><a:off x="…" y="…"/><a:ext cx="…" cy="…"/></a:xfrm>
 *     <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
 *   </p:spPr>
 * </p:pic>
 * ```
 *
 * Document model :
 *
 * ```js
 * {
 *   type: 'picture',
 *   id?, name?, description?,
 *   cx, cy, offsetX?, offsetY?,
 *   prstGeom?: 'rect' (default),
 *   embedRef?: string,
 *   linkRef?: string,
 *   image?: { data?: Uint8Array, contentType?: string, rId?: string },
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/pptx/picture
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const pptxPicture = {
    name: 'pptxPicture',
    dependencies: ['xml', 'ooxmlShared'],
    deps: [xml, ooxmlShared],

    factory(xml, shared) {
        const { NS, REL_TYPE } = shared;
        const A_NS = NS.A;
        const REL_TYPE_IMAGE = REL_TYPE.IMAGE;

        // --- Image content-type sniffing (mirror of docxDrawing) ---

        function sniffImageType(bytes) {
            if (!bytes || bytes.length < 4) return 'application/octet-stream';
            const b = bytes;
            if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
            if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
            if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
            if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
            if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
                && b.length >= 12
                && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
                return 'image/webp';
            }
            if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00)
             || (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)) {
                return 'image/tiff';
            }
            return 'application/octet-stream';
        }

        function extensionFor(contentType) {
            switch (contentType) {
                case 'image/png':  return 'png';
                case 'image/jpeg': return 'jpg';
                case 'image/gif':  return 'gif';
                case 'image/bmp':  return 'bmp';
                case 'image/webp': return 'webp';
                case 'image/tiff': return 'tiff';
                case 'image/svg+xml': return 'svg';
                case 'image/x-emf': return 'emf';
                case 'image/x-wmf': return 'wmf';
                default: return 'bin';
            }
        }

        function extToContentType(ext) {
            switch (ext) {
                case 'png':  return 'image/png';
                case 'jpg':
                case 'jpeg': return 'image/jpeg';
                case 'gif':  return 'image/gif';
                case 'bmp':  return 'image/bmp';
                case 'webp': return 'image/webp';
                case 'tiff': return 'image/tiff';
                case 'svg':  return 'image/svg+xml';
                case 'emf':  return 'image/x-emf';
                case 'wmf':  return 'image/x-wmf';
                default:     return 'application/octet-stream';
            }
        }

        // --- EMU helpers (shared) ---

        const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;

        // --- Parse <p:pic> ---

        function parsePicture(picEl) {
            const out = { type: 'picture' };
            const nvPicPr = xml.findChild(picEl, 'p:nvPicPr');
            if (nvPicPr) {
                const cNvPr = xml.findChild(nvPicPr, 'p:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.id = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.name = cNvPr.attrs.name;
                    if (cNvPr.attrs.descr)      out.description = cNvPr.attrs.descr;
                    if (cNvPr.attrs.title)      out.title = cNvPr.attrs.title;
                }
            }
            const blipFill = xml.findChild(picEl, 'p:blipFill');
            if (blipFill) {
                const blip = xml.findChild(blipFill, 'a:blip');
                if (blip) {
                    if (blip.attrs['r:embed']) out.embedRef = blip.attrs['r:embed'];
                    if (blip.attrs['r:link'])  out.linkRef = blip.attrs['r:link'];
                }
            }
            const spPr = xml.findChild(picEl, 'p:spPr');
            if (spPr) {
                const xfrm = xml.findChild(spPr, 'a:xfrm');
                if (xfrm) {
                    const off = xml.findChild(xfrm, 'a:off');
                    const ext = xml.findChild(xfrm, 'a:ext');
                    if (off) {
                        if (off.attrs.x != null) out.offsetX = Number(off.attrs.x);
                        if (off.attrs.y != null) out.offsetY = Number(off.attrs.y);
                    }
                    if (ext) {
                        if (ext.attrs.cx != null) out.cx = Number(ext.attrs.cx);
                        if (ext.attrs.cy != null) out.cy = Number(ext.attrs.cy);
                    }
                }
                const prst = xml.findChild(spPr, 'a:prstGeom');
                if (prst && prst.attrs.prst) out.prstGeom = prst.attrs.prst;
            }
            return out;
        }

        // --- Render <p:pic> ---

        function renderPicture(p) {
            const cNvPrAttrs = {
                id: String(p.id != null ? p.id : 2),
                name: p.name || 'Picture'
            };
            if (p.description) cNvPrAttrs.descr = p.description;
            if (p.title)       cNvPrAttrs.title = p.title;

            const blipAttrs = {};
            if (p.embedRef)    blipAttrs['r:embed'] = p.embedRef;
            else if (p.linkRef) blipAttrs['r:link'] = p.linkRef;

            return xml.el('p:pic', {}, [
                xml.el('p:nvPicPr', {}, [
                    xml.el('p:cNvPr', cNvPrAttrs),
                    xml.el('p:cNvPicPr', {}, [
                        xml.el('a:picLocks', { noChangeAspect: '1' })
                    ]),
                    xml.el('p:nvPr', {})
                ]),
                xml.el('p:blipFill', {}, [
                    xml.el('a:blip', blipAttrs),
                    xml.el('a:stretch', {}, [xml.el('a:fillRect', {})])
                ]),
                xml.el('p:spPr', {}, [
                    xml.el('a:xfrm', {}, [
                        xml.el('a:off', {
                            x: String(p.offsetX || 0),
                            y: String(p.offsetY || 0)
                        }),
                        xml.el('a:ext', {
                            cx: String(p.cx ?? 1828800),
                            cy: String(p.cy ?? 1371600)
                        })
                    ]),
                    xml.el('a:prstGeom', { prst: p.prstGeom || 'rect' }, [
                        xml.el('a:avLst', {})
                    ])
                ])
            ]);
        }

        // --- Convenience builder ---

        /**
         * Build a typed `{ type: 'picture' }` slide shape from raw image
         * bytes. Sizes accept numbers (EMU) or strings with units
         * (`'2in'`, `'5cm'`, `'200px'`).
         */
        function image(data, opts = {}) {
            const contentType = opts.contentType || sniffImageType(data);
            const cx = toEmu(opts.cx || '4in');
            const cy = toEmu(opts.cy || (cx * 0.75));
            const out = {
                type: 'picture',
                cx, cy,
                name: opts.name || 'Picture',
                prstGeom: opts.prstGeom || 'rect',
                image: { data, contentType }
            };
            if (opts.description) out.description = opts.description;
            if (opts.title)       out.title = opts.title;
            if (opts.offsetX != null) out.offsetX = toEmu(opts.offsetX);
            if (opts.offsetY != null) out.offsetY = toEmu(opts.offsetY);
            if (opts.id != null)  out.id = opts.id;
            if (opts.rId)         out.embedRef = opts.rId;
            return out;
        }

        return {
            parsePicture, renderPicture, image,
            sniffImageType, extensionFor, extToContentType, toEmu,
            EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
            REL_TYPE_IMAGE,
            A_NS
        };
    }
};
