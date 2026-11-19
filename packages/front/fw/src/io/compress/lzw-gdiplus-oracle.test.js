// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// fw's lzw encoder against an external decoder: on Windows, GDI+
// (System.Drawing, through Windows PowerShell) reads a GIF whose image data
// fw encoded, and must see the indices fw was given. The other direction —
// GDI+'s streams decoded by fw — is lzw-foreign.test.js.

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lzw } from './lzw.js';

const L = lzw.factory();
const PS = process.platform === 'win32' && typeof Bun !== 'undefined' ? Bun.which('powershell') : null;

/** A single-image GIF89a around fw's LZW stream (a grey global palette). */
function gif(w, h, indices, minCodeBits) {
    const colours = 1 << minCodeBits;
    const head = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0x80 | (minCodeBits - 1), 0, 0];
    const pal = [];
    for (let i = 0; i < colours; i++) { const g = Math.round((i * 255) / (colours - 1)); pal.push(g, g, g); }
    const desc = [0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0];
    const data = L.encode(indices, { minCodeBits });
    const blocks = [];
    for (let i = 0; i < data.length; i += 255) { const part = data.subarray(i, i + 255); blocks.push(part.length, ...part); }
    return new Uint8Array([...head, ...pal, ...desc, minCodeBits, ...blocks, 0, 0x3b]);
}

const READ = String.raw`
param([string]$File)
Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap $File
$r = New-Object System.Drawing.Rectangle 0, 0, $b.Width, $b.Height
$d = $b.LockBits($r, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format8bppIndexed)
$buf = New-Object byte[] ($b.Width * $b.Height)
for ($y = 0; $y -lt $b.Height; $y++) { [System.Runtime.InteropServices.Marshal]::Copy([IntPtr]($d.Scan0.ToInt64() + $y * $d.Stride), $buf, $y * $b.Width, $b.Width) }
$b.UnlockBits($d); $b.Dispose()
[Convert]::ToBase64String($buf)
`;

describe.skipIf(!PS)('fw lzw → GDI+ (external GIF decoder, Windows)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-lzw-oracle-'));
    const script = path.join(dir, 'read.ps1');
    fs.writeFileSync(script, '﻿' + READ);

    for (const [w, h, bits] of [[61, 37, 8], [97, 53, 8], [40, 30, 4]]) {
        test(`${w}x${h}, ${1 << bits} colours: GDI+ reads back the indices fw encoded`, () => {
            const levels = 1 << bits;
            const idx = Uint8Array.from({ length: w * h }, (_, i) => {
                const x = i % w, y = (i / w) | 0;
                return (x === y ? levels - 1 : ((x * levels) / w + ((x * y) >> 4)) | 0) % levels;
            });
            const file = path.join(dir, `${w}x${h}.gif`);
            fs.writeFileSync(file, gif(w, h, idx, bits));
            const r = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-File', file], { encoding: 'utf8' });
            expect(r.stderr.trim()).toBe('');
            const back = Buffer.from(r.stdout.trim(), 'base64');
            expect(back.length).toBe(w * h);
            expect(Buffer.compare(back, Buffer.from(idx))).toBe(0);
        }, 30_000);
    }

    test('the temporary files are removed', () => {
        fs.rmSync(dir, { recursive: true, force: true });
        expect(fs.existsSync(dir)).toBe(false);
    });
});
