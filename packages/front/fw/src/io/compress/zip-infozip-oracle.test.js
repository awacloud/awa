// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// fw's zip writer against an external reader: Info-ZIP UnZip, when an
// `unzip` binary is on the PATH (Git for Windows ships 6.00; most Linux and
// macOS hosts have it). Each archive fw writes must test clean (`unzip -t`),
// list the names fw stored (`unzip -Z1`) and extract to the input bytes
// (`unzip -p`, every entry in archive order). The reverse direction —
// archives from foreign writers read by fw — is zip-foreign.test.js.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflate } from './deflate.js';
import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { zip } from './zip.js';
import { crc32 } from '../calc/crc32.js';

const UNZIP = typeof Bun !== 'undefined' ? Bun.which('unzip') : null;
const bs = bitstream.factory();
const P = zip.factory(deflate.factory(bs, huffman.factory(bs), lz77.factory()), crc32.factory());
const enc = (s) => new TextEncoder().encode(s);

const FILES = {
    'hello.txt': enc('Hello, zip!\n'),
    'docs/readme.md': enc('# Read me\n\n' + 'A line that repeats. '.repeat(200) + '\n'),
    'bin/zeros.bin': new Uint8Array(4096),
    'bin/noise.bin': Uint8Array.from({ length: 5000 }, (_, i) => (i * 2654435761) >>> 24),
    'empty.txt': new Uint8Array(0),
    'café/naïve 水.txt': enc('Unicode names: café, naïve, 水.\n'),
};

/** fw's archive, written three ways. */
function archives() {
    const streamed = [];
    const zs = new P.ZipStream({}, (c) => streamed.push(c));
    for (const [name, data] of Object.entries(FILES)) {
        if (name === 'docs/readme.md') {
            const e = zs.openEntry(name, { level: 6 });
            e.push(data.subarray(0, 1000));
            e.push(data.subarray(1000), true);
        } else zs.add(name, data);
    }
    zs.finalize();
    const total = streamed.reduce((n, c) => n + c.length, 0);
    const joined = new Uint8Array(total);
    let o = 0;
    for (const c of streamed) { joined.set(c, o); o += c.length; }
    return {
        'zipSync, default level': P.zipSync(FILES),
        'zipSync, level 0 (stored)': P.zipSync(FILES, { level: 0 }),
        'zipSync, level 9': P.zipSync(FILES, { level: 9 }),
        'ZipStream, one entry streamed in two pushes': joined,
    };
}

function run(args) {
    const r = spawnSync(UNZIP, args, { encoding: 'buffer' });
    return { status: r.status, out: r.stdout, err: r.stderr ? r.stderr.toString('utf8') : '' };
}

describe.skipIf(!UNZIP)('fw zip → Info-ZIP unzip (external reader)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-zip-oracle-'));
    const written = Object.entries(archives()).map(([label, bytes], i) => {
        const file = path.join(dir, `a${i}.zip`);
        fs.writeFileSync(file, bytes);
        return [label, file];
    });

    // The Win32 build of UnZip 6.00 (Git for Windows) ignores the UTF-8 flag
    // (bit 11): it prints and extracts a non-ASCII name through the ANSI →
    // OEM code page conversion, on the console and on disk alike. There the
    // listing is checked for the ASCII names and the entry count; UnZip
    // builds with Unicode support (Linux, macOS) check every name.
    const unicodeNames = process.platform !== 'win32';
    const ascii = (n) => /^[\x20-\x7e]*$/.test(n);

    for (const [label, file] of written) {
        test(`${label}: tests clean, lists fw's names, extracts the input bytes`, () => {
            const t = run(['-tq', file]);
            expect([t.status, t.err]).toEqual([0, '']);
            const listed = run(['-Z1', file]).out.toString('utf8').split(/\r?\n/).filter(Boolean);
            const names = Object.keys(FILES);
            expect(listed.length).toBe(names.length);
            if (unicodeNames) expect(listed.slice().sort()).toEqual(names.slice().sort());
            else expect(listed.filter(ascii).sort()).toEqual(names.filter(ascii).sort());
            // `-p` writes every entry in archive order; the order is fw's
            // insertion order, so the expected bytes follow FILES.
            const p = run(['-p', file]);
            expect(p.status).toBe(0);
            const want = Buffer.concat(names.map((n) => Buffer.from(FILES[n])));
            expect(Buffer.compare(p.out, want)).toBe(0);
        });
    }

    test('fw flags its non-ASCII name as UTF-8 (general purpose bit 11) in the central directory', () => {
        const a = P.zipSync({ 'café/naïve 水.txt': enc('x') });
        let cd = -1;
        for (let i = 0; i + 3 < a.length; i++) if (a[i] === 0x50 && a[i + 1] === 0x4b && a[i + 2] === 1 && a[i + 3] === 2) { cd = i; break; }
        expect(cd).toBeGreaterThan(0);
        expect((a[cd + 8] | (a[cd + 9] << 8)) & 0x800).toBe(0x800);
    });

    test('the temporary archives are removed', () => {
        fs.rmSync(dir, { recursive: true, force: true });
        expect(fs.existsSync(dir)).toBe(false);
    });
});
