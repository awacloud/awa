// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// Boundary tests for the opcPackage.read archive limits: maxParts,
// maxUncompressed and maxRatio. Archives are built through opcPackage.write
// (no binary fixture); the boundary values are measured on the built
// archive's central directory through fw zip, so each test sets the cap
// exactly at, then one past, the archive's real figure.

import { describe, test, expect } from 'bun:test';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { opcContentTypes } from './contentTypes.js';
import { opcRelationships } from './relationships.js';
import { opcPackage } from './package.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

function build() {
    const bs = bitstream.factory();
    const hf = huffman.factory(bs);
    const zipInst = zip.factory(deflate.factory(bs, hf, lz77.factory()), crc32.factory());
    const xmlInst = ooxmlXml.factory();
    const opc = opcPackage.factory(_errors, zipInst,
        opcContentTypes.factory(_errors, xmlInst),
        opcRelationships.factory(_errors, xmlInst), _shared);
    return { opc, zip: zipInst };
}

const CT_XML = 'application/xml';

/** Run `fn` and return what it threw (or `null`). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

/** Central-directory figures of an archive: one entry per ZIP member. */
function entriesOf(zipInst, bytes) {
    const out = [];
    zipInst.unzipSync(bytes, {
        filter(e) { out.push(e); return false; }
    });
    return out;
}

function expectZipBomb(err, limit, max) {
    expect(err).not.toBeNull();
    expect(err.code).toBe('opc/zip-bomb');
    expect(err.context.limit).toBe(limit);
    expect(err.context.max).toBe(max);
}

/** A package with `n` small XML parts. */
function smallPackage(opc, n) {
    const pkg = opc.empty();
    for (let i = 0; i < n; i++) {
        opc.setPart(pkg, `/p/part${i}.xml`,
            new TextEncoder().encode(`<p n="${i}"/>`), CT_XML);
    }
    return opc.write(pkg);
}

/** A package holding one highly compressible part: 1 MiB of zeros. */
function zerosPackage(opc) {
    const pkg = opc.empty();
    opc.setPart(pkg, '/bin/zeros.bin', new Uint8Array(1024 * 1024),
        'application/octet-stream');
    return opc.write(pkg);
}

describe('opcPackage.read — maxParts', () => {
    test('N entries: cap N reads, cap N-1 throws, cap 0 reads', () => {
        const { opc, zip: z } = build();
        const bytes = smallPackage(opc, 5);
        const n = entriesOf(z, bytes).length;
        // 5 parts + [Content_Types].xml.
        expect(n).toBe(6);

        expect(Object.keys(opc.read(bytes, { maxParts: n }).parts)).toHaveLength(5);

        const err = thrown(() => opc.read(bytes, { maxParts: n - 1 }));
        expectZipBomb(err, 'maxParts', n - 1);

        expect(Object.keys(opc.read(bytes, { maxParts: 0 }).parts)).toHaveLength(5);
    });
});

describe('opcPackage.read — maxUncompressed', () => {
    test('total uncompressed bytes: cap at total reads, total-1 throws, 0 reads', () => {
        const { opc, zip: z } = build();
        const bytes = zerosPackage(opc);
        const total = entriesOf(z, bytes)
            .reduce((sum, e) => sum + e.originalSize, 0);
        expect(total).toBeGreaterThan(1024 * 1024);
        // The ratio check is disabled so this test isolates the byte total.
        const base = { maxRatio: 0 };

        const atCap = opc.read(bytes, { ...base, maxUncompressed: total });
        expect(atCap.parts['/bin/zeros.bin']).toHaveLength(1024 * 1024);

        const err = thrown(() => opc.read(bytes, { ...base, maxUncompressed: total - 1 }));
        expectZipBomb(err, 'maxUncompressed', total - 1);
        expect(err.context.actual).toBe(total);

        const disabled = opc.read(bytes, { ...base, maxUncompressed: 0 });
        expect(disabled.parts['/bin/zeros.bin']).toHaveLength(1024 * 1024);
    });
});

describe('opcPackage.read — maxRatio', () => {
    test('1 MiB of zeros: cap at its ratio reads, one below throws, 0 reads', () => {
        const { opc, zip: z } = build();
        const bytes = zerosPackage(opc);
        const entries = entriesOf(z, bytes);
        const zeros = entries.find(e => e.name === 'bin/zeros.bin');
        expect(zeros).toBeDefined();
        // The compressible part is the archive's highest ratio, and far
        // above the default cap of 200.
        const ratio = zeros.originalSize / zeros.size;
        for (const e of entries) {
            if (e.size > 0) expect(e.originalSize / e.size).toBeLessThanOrEqual(ratio);
        }
        expect(ratio).toBeGreaterThan(200);
        const cap = Math.ceil(ratio);

        const atCap = opc.read(bytes, { maxRatio: cap });
        expect(atCap.parts['/bin/zeros.bin']).toHaveLength(1024 * 1024);

        const err = thrown(() => opc.read(bytes, { maxRatio: cap - 1 }));
        expectZipBomb(err, 'maxRatio', cap - 1);
        expect(err.context.name).toBe('bin/zeros.bin');

        // The default cap rejects this archive; 0 disables the check.
        expectZipBomb(thrown(() => opc.read(bytes)), 'maxRatio', 200);
        const disabled = opc.read(bytes, { maxRatio: 0 });
        expect(disabled.parts['/bin/zeros.bin']).toHaveLength(1024 * 1024);
    });
});
