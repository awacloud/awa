// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<draw:image>` and image-byte sniffing.
 *
 * Model:
 *
 * ```js
 * { type: 'image', href, mimeType?, _extras? }
 * ```
 *
 * `href` is the conventional `Pictures/foo.png` package-relative path.
 *
 * @module odf/draw/image
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const drawImage = {
    name: 'drawImage',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const XLINK_DEFAULTS = {
            'xlink:type':    'simple',
            'xlink:show':    'embed',
            'xlink:actuate': 'onLoad'
        };

        const CT_BY_MAGIC = [
            { ct: 'image/png',     test: b => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
            { ct: 'image/jpeg',    test: b => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
            { ct: 'image/gif',     test: b => b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
            { ct: 'image/bmp',     test: b => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4D },
            { ct: 'image/webp',    test: b => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
                                               && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
            { ct: 'image/tiff',    test: b => b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00)
                                               || (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)) },
            { ct: 'image/svg+xml', test: b => looksLikeSvg(b) }
        ];

        function looksLikeSvg(bytes) {
            // SVG is XML — look for "<svg" or "<?xml" then "<svg" within first KB.
            const probe = Math.min(bytes.length, 1024);
            let s = '';
            for (let i = 0; i < probe; i++) s += String.fromCharCode(bytes[i]);
            return s.indexOf('<svg') >= 0;
        }

        const EXT_BY_CT = {
            'image/png':     'png',
            'image/jpeg':    'jpg',
            'image/gif':     'gif',
            'image/bmp':     'bmp',
            'image/webp':    'webp',
            'image/tiff':    'tif',
            'image/svg+xml': 'svg'
        };


        /**
         * Parse a `<draw:image>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseImage(el) {
            const attrs = el.attrs || {};
            const href = attrs['xlink:href'] || '';
            const out = { type: 'image', href };
            // The mime type: draw:mime-type, else LibreOffice's
            // loext:mime-type, whose name is kept (`_mimeTypeAttr`) so it
            // is written back as read; with both, the loext one stays an
            // extra attribute.
            const draw = attrs['draw:mime-type'];
            const lo = attrs['loext:mime-type'];
            if (draw) out.mimeType = draw;
            else if (lo) { out.mimeType = lo; out._mimeTypeAttr = 'loext:mime-type'; }
            // Preserve unknown attrs / children
            const known = new Set([
                'xlink:href', 'xlink:type', 'xlink:show', 'xlink:actuate',
                'draw:mime-type', ...(draw ? [] : ['loext:mime-type'])
            ]);
            const xa = {};
            let any = false;
            for (const k of Object.keys(attrs)) {
                if (!known.has(k)) { xa[k] = attrs[k]; any = true; }
            }
            if (any) out._extras = { attrs: xa };
            return out;
        }

        /**
         * Render an image model.
         *
         * @param {object} img — `{ href, mimeType?, _mimeTypeAttr? }`.
         * @param {object} [opts] — `{ mimeTypeAsRead? }`: `true` writes the
         *   mime type under the attribute it was read from
         *   (`_mimeTypeAttr`, e.g. LibreOffice's `loext:mime-type`, for a
         *   version before ODF 1.3, which has no `draw:mime-type` on
         *   images); by default it is written as `draw:mime-type`.
         * @returns {object}
         */
        function renderImage(img, opts) {
            const attrs = { 'xlink:href': img.href || '' };
            attrs['xlink:type']    = XLINK_DEFAULTS['xlink:type'];
            attrs['xlink:show']    = XLINK_DEFAULTS['xlink:show'];
            attrs['xlink:actuate'] = XLINK_DEFAULTS['xlink:actuate'];
            const name = (opts && opts.mimeTypeAsRead && img._mimeTypeAttr) || 'draw:mime-type';
            if (img.mimeType) attrs[name] = img.mimeType;
            if (img._extras && img._extras.attrs) {
                for (const k of Object.keys(img._extras.attrs)) attrs[k] = img._extras.attrs[k];
            }
            return xml.el('draw:image', attrs, []);
        }

        /**
         * Sniff the content-type of an image byte stream by magic.
         * Returns `'application/octet-stream'` if unknown.
         *
         * @param {Uint8Array} bytes
         * @returns {string}
         */
        function sniffImageType(bytes) {
            const b = bytes || new Uint8Array(0);
            for (const entry of CT_BY_MAGIC) {
                if (entry.test(b)) return entry.ct;
            }
            return 'application/octet-stream';
        }

        /** Map content-type → file extension (no leading dot). */
        function extensionFor(ct) {
            return EXT_BY_CT[ct] || 'bin';
        }

        return { parseImage, renderImage, sniffImageType, extensionFor };
    }
};
