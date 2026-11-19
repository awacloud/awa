// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Archives from writers that are not fw — CPython's zipfile, .NET's
// System.IO.Compression, 7-Zip and libarchive (Windows' tar.exe) — committed
// base64-encoded in
// tests/_vectors/zip-foreign/archives.json with their generator (generate.py.txt)
// and manifest. Each must extract, with verify on, to exactly the manifest's
// contents.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { zip } from './zip.js';
import { crc32 } from '../calc/crc32.js';

const DIR = join(import.meta.dir, '..', '..', '..', 'tests', '_vectors', 'zip-foreign');
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
const archives = JSON.parse(readFileSync(join(DIR, 'archives.json'), 'utf8'));
const expected = Object.fromEntries(Object.entries(manifest.contents).map(([k, v]) => [
    k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v.bytes).fill(v.fill),
]));

const bs = bitstream.factory();
const P = zip.factory(deflate.factory(bs, huffman.factory(bs), lz77.factory()), crc32.factory());

const ARCHIVES = {
    'cpython-stored.zip': 'stored entries, an archive comment, a directory entry',
    'cpython-deflated.zip': 'deflated entries, a UTF-8 name (flag bit 11)',
    'cpython-zip64.zip': 'ZIP64 extra fields on every entry',
    'cpython-descriptor.zip': 'data descriptors (flag bit 3), written to an unseekable stream',
    'dotnet-optimal.zip': '.NET ZipArchive, CompressionLevel.Optimal',
    'dotnet-nocompression.zip': '.NET ZipArchive, CompressionLevel.NoCompression (deflate stored blocks)',
    '7zip-deflate-ultra.zip': '7-Zip -mx=9 deflate, NTFS time extras, directory entries, small files stored',
    '7zip-stored.zip': '7-Zip -mm=Copy, UTF-8 names (-mcu=on)',
    'libarchive-deflate.zip': 'libarchive (bsdtar), data descriptors, the Info-ZIP "ux" extra',
    'libarchive-stored.zip': 'libarchive, stored entries with data descriptors (no size in the local header)',
};

// .NET Framework's ZipFile.CreateFromDirectory writes `\` as the path
// separator, against APPNOTE 4.4.17 (forward slashes only). fw normalises it
// to `/` (D25), as Info-ZIP, 7-Zip and CPython present such names, so the
// .NET archives name their files as every other one.
const storedName = (file, name) => name;

describe('zip archives from foreign writers', () => {
    for (const [file, what] of Object.entries(ARCHIVES)) {
        test(`${file}: ${what}`, () => {
            const out = P.unzipSync(new Uint8Array(Buffer.from(archives[file], 'base64')), { verify: true });
            for (const [name, bytes] of Object.entries(expected)) {
                expect(out[storedName(file, name)], name).toEqual(bytes);
            }
            const files = Object.keys(out).filter((k) => !k.endsWith('/'));
            expect(files.sort()).toEqual(Object.keys(expected).map((n) => storedName(file, n)).sort());
        });
    }

    test('7zip-deflate64.zip: Deflate64 (method 9) is refused with EBADMETHOD, not misread', () => {
        let e = null;
        try { P.unzipSync(new Uint8Array(Buffer.from(archives['7zip-deflate64.zip'], 'base64')), { verify: true }); } catch (x) { e = x; }
        expect(e && e.code).toBe('EBADMETHOD');
    });

    test('the same contents round-trip through fw itself', () => {
        const back = P.unzipSync(P.zipSync(expected), { verify: true });
        for (const [name, bytes] of Object.entries(expected)) expect(back[name]).toEqual(bytes);
    });
});

describe('entry names with "\\" (D25)', () => {
    test('a stored "\\" separator comes out as "/"; a "..\\" path is still refused as unsafe', () => {
        const out = P.unzipSync(P.zipSync({ 'docs\\readme.md': new Uint8Array([1]), 'a\\b\\c.txt': new Uint8Array([2]) }));
        expect(Object.keys(out).sort()).toEqual(['a/b/c.txt', 'docs/readme.md']);
        let e = null;
        try { P.unzipSync(P.zipSync({ '..\\evil.txt': new Uint8Array([3]) })); } catch (x) { e = x; }
        expect(e && e.code).toBe('EUNSAFEPATH');
    });
});
