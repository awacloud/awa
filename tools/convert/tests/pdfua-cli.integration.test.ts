// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The CLI's `--pdf-ua` and `--pdf-lang` on `from-md` and `convert`: a tagged
 * document claiming PDF/UA written with the caller's faces; `--pdf-ua`
 * without `--pdf-lang`, `--pdf-lang` without `--pdf-ua`,
 * another part, or either flag on another verb, a usage error.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const CLI_ENTRY = join(ROOT, 'tools', 'convert', 'src', 'index.ts');
const SAMPLE_DOCX = join(import.meta.dir, 'fixtures', 'sample.docx');
const LIBERATION = join(ROOT, 'packages', 'front', 'office', 'oconv-fonts', 'vendor', 'liberation');
const latin1 = new TextDecoder('latin1');

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'convert-pdfua-cli-'));
    dirs.push(dir);
    return dir;
}

function facesDir(): string {
    const dir = scratch();
    for (const [cls, file] of [['regular', 'LiberationSans-Regular'], ['bold', 'LiberationSans-Bold'], ['italic', 'LiberationSans-Italic'],
        ['boldItalic', 'LiberationSans-BoldItalic'], ['mono', 'LiberationMono-Regular']]) {
        copyFileSync(join(LIBERATION, `${file}.ttf`), join(dir, `${cls}.ttf`));
    }
    return dir;
}

function cli(args: string[]) {
    const r = spawnSync('bun', [CLI_ENTRY, ...args]);
    return { code: r.status ?? -1, stderr: (r.stderr ?? Buffer.alloc(0)).toString('utf8') };
}

describe('convert CLI --pdf-ua', () => {
    test('from-md and convert write a tagged PDF/UA claim with the faces of --pdf-fonts', () => {
        const dir = scratch();
        const md = join(dir, 'in.md');
        writeFileSync(md, '# PDF/UA\n\nSome *emphasis* and `code`.\n');
        const faces = facesDir();
        const ua2 = join(dir, 'ua2.pdf');
        expect(cli(['from-md', md, '--target', 'pdf', '--pdf-ua', '2', '--pdf-lang', 'en-GB', '--pdf-fonts', faces, '--out', ua2]).code).toBe(0);
        const text = latin1.decode(readFileSync(ua2));
        expect(text.startsWith('%PDF-2.0')).toBe(true);
        expect(text).toContain('<pdfuaid:part>2</pdfuaid:part>');
        expect(text).toContain('/StructTreeRoot');
        const ua1 = join(dir, 'ua1.pdf');
        expect(cli(['convert', SAMPLE_DOCX, '--target', 'pdf', '--pdf-ua', '1', '--pdf-lang', 'en', '--pdf-fonts', faces, '--out', ua1]).code).toBe(0);
        expect(latin1.decode(readFileSync(ua1)).startsWith('%PDF-1.7')).toBe(true);
    });

    test('--pdf-ua without --pdf-fonts embeds the packaged faces', () => {
        const dir = scratch();
        const md = join(dir, 'in.md');
        writeFileSync(md, '# T\n');
        const out = join(dir, 'ua.pdf');
        expect(cli(['from-md', md, '--target', 'pdf', '--pdf-ua', '1', '--pdf-lang', 'en', '--out', out]).code).toBe(0);
        const text = latin1.decode(readFileSync(out));
        expect(text).toContain('<pdfuaid:part>1</pdfuaid:part>');
        expect(text).toContain('/FontFile2');
    });

    test('a missing --pdf-lang, --pdf-lang alone, another part, or another verb is a usage error', () => {
        const dir = scratch();
        const md = join(dir, 'in.md');
        writeFileSync(md, '# T\n');
        const faces = facesDir();
        const cases: [string[], string][] = [
            [['--pdf-ua', '1', '--pdf-fonts', faces], '--pdf-lang'],
            [['--pdf-lang', 'en', '--pdf-fonts', faces], '--pdf-ua'],
            [['--pdf-ua', '3', '--pdf-lang', 'en', '--pdf-fonts', faces], '--pdf-ua'],
        ];
        for (const [flags, named] of cases) {
            const r = cli(['from-md', md, '--target', 'pdf', ...flags]);
            expect(r.code).toBe(2);
            expect(r.stderr).toContain(named);
        }
        for (const flag of ['--pdf-ua', '--pdf-lang']) {
            const r = cli(['to-md', SAMPLE_DOCX, flag, '1']);
            expect(r.code).toBe(2);
            expect(r.stderr).toContain(flag);
        }
    });
});
