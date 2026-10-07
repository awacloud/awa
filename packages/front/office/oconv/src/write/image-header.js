// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The MINIMUM an image XObject needs, read out of encoded
 * image bytes — nothing more.
 *
 * `@awacloud/pdf`'s `pdfBuilder.addImage` decodes nothing: it wants
 * `{width, height, colorSpace, bitsPerComponent, filter?}` from the caller
 * and copies `data` into the stream verbatim. Those parameters have to come
 * from somewhere, so this module reads them — and ONLY them — out of the
 * image's own header. It is not an image library and must never become one:
 * **no decoding, no transcoding, no resampling, no colour management**, and
 * exactly two container formats.
 *
 * ## What it recognises, and the two very different answers
 *
 * | Input | Result |
 * |---|---|
 * | PNG, colour type 0 (grey) or 2 (truecolour) | geometry + `filter: null` |
 * | PNG, colour type 3 / 4 / 6 (palette, alpha) | `null` |
 * | JPEG with an `SOF0`/`SOF1`/`SOF2`, 1 or 3 components | geometry + `filter: 'DCTDecode'` |
 * | JPEG with 4 components (CMYK / YCCK) | `null` |
 * | anything else, truncated, malformed, empty | `null` |
 *
 * `filter: null` is **not** a placeholder for "figure it out later": a PNG's
 * `IDAT` zlib stream is a *sequence of filtered scanlines*, not a PDF image
 * stream, so `/FlateDecode` over the raw file bytes would render garbage.
 * A caller must therefore treat `filter === null` as "geometry known,
 * placement REFUSED" and record an honest loss. `filter: 'DCTDecode'` is the
 * opposite: JPEG entropy-coded data IS directly embeddable, so those bytes
 * go into the PDF verbatim.
 *
 * Colour types 3/4/6 return `null` rather than a guess because each needs
 * something this module does not build — a `/Indexed` palette, or an `/SMask`
 * alpha channel. Guessing would put a *wrong* image on the page, which is
 * worse than an honest refusal.
 *
 * ## Never throws
 *
 * Every malformed input returns `null`. Callers are renderers in the middle
 * of a document write; a header parse must degrade to a recorded loss, never
 * abort the document.
 *
 * ## Duplication note (deliberate)
 *
 * `oconvPdfRenderImage` carries its own inline copy of {@link readImageHeader}
 * because an fw factory may not capture a module-scope binding
 * (`fw/no-factory-capture` — the factory source is serialised into Workers
 * and inlined by the standalone builder). The two copies are pinned together
 * by a drift test in `./pdf/render/image.test.js`, the same discipline as
 * `../read/pdf/paragraph-group.js`.
 * This module is therefore NOT an fw module descriptor and is registered
 * nowhere: it is a pure ESM helper, imported only by tests.
 *
 * Pure module: no imports, no I/O, no `@awacloud/*` coupling. Worker-safe by
 * construction.
 *
 * @module oconv/write/image-header
 */

/**
 * The parameters `pdfBuilder.addImage` needs, read from an image header.
 *
 * @typedef {object} ImageHeader
 * @property {'png'|'jpeg'} format Container recognised.
 * @property {number} width Intrinsic width, in pixels.
 * @property {number} height Intrinsic height, in pixels.
 * @property {string} colorSpace PDF colour-space name — `'DeviceGray'` or
 *   `'DeviceRGB'`.
 * @property {number} bitsPerComponent PNG bit depth, or JPEG sample
 *   precision.
 * @property {string|null} filter PDF `/Filter` name for the RAW file bytes:
 *   `'DCTDecode'` for JPEG, `null` for PNG — whose bytes are NOT directly
 *   embeddable (see the module header).
 */

/**
 * Read the minimum an image XObject needs from encoded bytes.
 *
 * Recognises PNG (IHDR) and JPEG (SOF0/SOF1/SOF2) ONLY. Anything else
 * returns `null` — the caller records a loss rather than guessing.
 *
 * @param {Uint8Array} bytes Encoded image bytes.
 * @returns {ImageHeader|null} `null` when the format is unrecognised,
 *   unsupported or malformed. Never throws.
 */
export function readImageHeader(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;

    const u16 = (at) => ((bytes[at] << 8) | bytes[at + 1]) >>> 0;
    const u32 = (at) => (
        (bytes[at] * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]
    );

    // ---- PNG: an 8-byte signature, then IHDR as the FIRST chunk. --------
    const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let isPng = true;
    for (let i = 0; i < 8; i += 1) if (bytes[i] !== PNG_SIG[i]) { isPng = false; break; }
    if (isPng) {
        // 8 signature + 4 length + 4 type + 13 IHDR data + 4 CRC.
        if (bytes.length < 33) return null;
        if (u32(8) !== 13) return null;
        if (bytes[12] !== 0x49 || bytes[13] !== 0x48
            || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
        const width = u32(16);
        const height = u32(20);
        const bitDepth = bytes[24];
        const colorType = bytes[25];
        if (width < 1 || height < 1) return null;
        if (bitDepth !== 1 && bitDepth !== 2 && bitDepth !== 4
            && bitDepth !== 8 && bitDepth !== 16) return null;
        // 0 = greyscale, 2 = truecolour. 3 needs a palette, 4 and 6 need an
        // alpha channel: refused rather than guessed (see the module header).
        let colorSpace = null;
        if (colorType === 0) colorSpace = 'DeviceGray';
        else if (colorType === 2) colorSpace = 'DeviceRGB';
        if (colorSpace === null) return null;
        return {
            format: 'png',
            width, height, colorSpace,
            bitsPerComponent: bitDepth,
            filter: null
        };
    }

    // ---- JPEG: SOI, then walk marker segments to the frame header. -----
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    let at = 2;
    while (at + 1 < bytes.length) {
        if (bytes[at] !== 0xFF) return null;
        let marker = bytes[at + 1];
        // Fill bytes: any number of 0xFF may precede a marker code.
        while (marker === 0xFF) {
            at += 1;
            if (at + 1 >= bytes.length) return null;
            marker = bytes[at + 1];
        }
        // Standalone markers carry no length field.
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { at += 2; continue; }
        // The scan or the end of the image: no frame header was found.
        if (marker === 0xD9 || marker === 0xDA) return null;
        if (at + 3 >= bytes.length) return null;
        const len = u16(at + 2);
        if (len < 2 || at + 2 + len > bytes.length) return null;
        // SOF0 baseline, SOF1 extended sequential, SOF2 progressive — the
        // three /DCTDecode-compatible frame headers. Every other SOF
        // (arithmetic, lossless, hierarchical) falls through and ends at
        // the SOS refusal above.
        if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
            if (len < 8) return null;
            const precision = bytes[at + 4];
            const height = u16(at + 5);
            const width = u16(at + 7);
            const components = bytes[at + 9];
            if (width < 1 || height < 1 || precision < 1) return null;
            // 4 components is CMYK / YCCK: it needs a /Decode array and an
            // Adobe APP14 transform this module does not model.
            let colorSpace = null;
            if (components === 1) colorSpace = 'DeviceGray';
            else if (components === 3) colorSpace = 'DeviceRGB';
            if (colorSpace === null) return null;
            return {
                format: 'jpeg',
                width, height, colorSpace,
                bitsPerComponent: precision,
                filter: 'DCTDecode'
            };
        }
        at += 2 + len;
    }
    return null;
}
