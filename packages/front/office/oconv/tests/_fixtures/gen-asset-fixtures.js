// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/tests/_fixtures/gen-asset-fixtures.js
//
// ONE-SHOT generator for the two committed image assets under
// `tests/_fixtures/corpus/assets/`. Run once, by hand, from the repo root:
//
//   bun packages/front/office/oconv/tests/_fixtures/gen-asset-fixtures.js
//
// Kept in the repo for PROVENANCE ONLY (same discipline as the sibling
// `gen-odt-fixtures.js` / `gen-ods-fixtures.js` / `gen-odp-fixtures.js`
// scripts): the suites read the COMMITTED bytes and never re-run this
// script. Do not wire it into `bun test`.
//
// Both files are FIRST-PARTY: every byte below is assembled here from the
// format specifications, nothing is copied from a third-party corpus and
// nothing is downloaded. That is what lets them be committed with no
// licence question at all (office memory 2026-07-21, corpus licensing).
//
//  - `px.png` — 1x1 greyscale, 8-bit, PNG colour type 0. Chosen over the
//    usual "1x1 transparent" PNG (colour type 6) on purpose: colour type 0
//    is one of the TWO types `src/write/image-header.js` can name, so this
//    fixture exercises the documented md->pdf boundary "geometry read,
//    placement REFUSED because a PNG zlib stream is not a PDF image
//    stream" (`reason: 'unsupported-encoding'`, `format: 'png'`) rather
//    than the weaker "the helper could not name the format at all" branch.
//    The IDAT payload is a STORED (uncompressed) deflate block, so the
//    whole file is derivable by hand and the CRC-32 / Adler-32 values below
//    are computed here, never transcribed.
//
//  - `px.jpg` — 1x1 greyscale baseline JPEG (ITU-T T.81), hand-authored
//    segment by segment: SOI, DQT, SOF0, two DHT tables, SOS, one byte of
//    entropy-coded scan data, EOI. This is the format that ACTUALLY places
//    in `md -> pdf`: JPEG bytes are directly embeddable behind
//    `/Filter /DCTDecode`, so `pdfBuilder.addImage` takes them verbatim.
//
// After writing, the script prints each file's size and SHA-256 — the
// numbers `corpus/assets/PROVENANCE.md` records.

/* global Bun */

import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT_DIR = 'packages/front/office/oconv/tests/_fixtures/corpus/assets';

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

/** The PNG CRC-32 table, built once (PNG spec, Annex D). */
function crcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
}

const CRC = crcTable();

/**
 * PNG CRC-32 over a byte sequence.
 *
 * @param {number[]} bytes
 * @returns {number}
 */
function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Big-endian 32-bit split.
 *
 * @param {number} n
 * @returns {number[]}
 */
function be32(n) {
    return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
}

/**
 * One PNG chunk: length, type, data, CRC-32 over type+data.
 *
 * @param {string} type Four ASCII characters.
 * @param {number[]} data
 * @returns {number[]}
 */
function chunk(type, data) {
    const typeBytes = [...type].map((ch) => ch.charCodeAt(0));
    const body = typeBytes.concat(data);
    return be32(data.length).concat(body, be32(crc32(body)));
}

/**
 * Adler-32 (zlib) over a byte sequence.
 *
 * @param {number[]} bytes
 * @returns {number}
 */
function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

/**
 * A zlib stream wrapping ONE stored (BTYPE=00, uncompressed) deflate block.
 * `0x78 0x01` is the "no compression" CMF/FLG pair: (0x78 * 256 + 0x01) is
 * 30721, an exact multiple of 31, so the FCHECK bits are valid.
 *
 * @param {number[]} raw
 * @returns {number[]}
 */
function zlibStored(raw) {
    const len = raw.length;
    return [0x78, 0x01, 0x01, len & 0xFF, (len >>> 8) & 0xFF,
        (~len) & 0xFF, ((~len) >>> 8) & 0xFF]
        .concat(raw, be32(adler32(raw)));
}

/** The 1x1 greyscale PNG, assembled from the spec. */
function buildPng() {
    const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const ihdr = chunk('IHDR', be32(1).concat(be32(1), [
        8,   // bit depth
        0,   // colour type 0 — greyscale (readable by image-header.js)
        0,   // compression method: deflate
        0,   // filter method: adaptive
        0    // interlace method: none
    ]));
    // One scanline: the per-line filter byte (0 = None) then one sample.
    const idat = chunk('IDAT', zlibStored([0x00, 0x00]));
    const iend = chunk('IEND', []);
    return Uint8Array.from(signature.concat(ihdr, idat, iend));
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/**
 * A JPEG marker segment: `FF <marker>`, a 2-byte length covering itself,
 * then the payload.
 *
 * @param {number} marker
 * @param {number[]} payload
 * @returns {number[]}
 */
function segment(marker, payload) {
    const len = payload.length + 2;
    return [0xFF, marker, (len >>> 8) & 0xFF, len & 0xFF].concat(payload);
}

/** The 1x1 greyscale baseline JPEG, assembled from ITU-T T.81. */
function buildJpeg() {
    // DQT — one 8-bit luminance table, every coefficient 16.
    const dqt = segment(0xDB, [0x00].concat(new Array(64).fill(0x10)));

    // SOF0 — baseline DCT, 8-bit precision, 1x1, ONE component (greyscale)
    // with 1x1 sampling and quantisation table 0.
    const sof0 = segment(0xC0, [0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]);

    // DHT — the two smallest legal Huffman tables: exactly one code, of
    // length 1 (bit `0`), for symbol 0x00. For the DC table symbol 0 means
    // "difference category 0" (no additional bits); for the AC table it is
    // the End-Of-Block symbol.
    const counts = [1].concat(new Array(15).fill(0));
    const dhtDc = segment(0xC4, [0x00].concat(counts, [0x00]));
    const dhtAc = segment(0xC4, [0x10].concat(counts, [0x00]));

    // SOS — one component, DC table 0 / AC table 0, spectral selection
    // 0..63, no successive approximation.
    const sos = segment(0xDA, [0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]);

    // The single MCU: DC code `0` (category 0 -> difference 0) then the AC
    // End-Of-Block code `0`, padded to a byte boundary with 1 bits, as the
    // standard requires: 0b00111111.
    const scan = [0x3F];

    return Uint8Array.from([0xFF, 0xD8]
        .concat(dqt, sof0, dhtDc, dhtAc, sos, scan, [0xFF, 0xD9]));
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, bytes] of [['px.png', buildPng()], ['px.jpg', buildJpeg()]]) {
    await Bun.write(`${OUT_DIR}/${name}`, bytes);
    const sha = createHash('sha256').update(bytes).digest('hex');
    console.log(`${name}: ${bytes.length} bytes, sha256 ${sha}`);
}
